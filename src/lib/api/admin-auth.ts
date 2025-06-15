import { jellyfinClient } from "./jellyfin";
import type { JellyfinConfig } from "@/types/jellyfin";

/**
 * Admin authentication client for server-side operations
 * Uses environment variables instead of localStorage
 */
class AdminAuthClient {
  private adminToken: string | null = null;
  private tokenExpiry: number = 0;
  private isAuthenticating = false;
  private authPromise: Promise<string> | null = null;

  /**
   * Get admin credentials from environment variables
   */
  private getAdminCredentials(): JellyfinConfig | null {
    const serverUrl = process.env.JELLYFIN_SERVER_URL;
    const username = process.env.JELLYFIN_ADMIN_USER;
    const password = process.env.JELLYFIN_ADMIN_PASSWORD;

    if (!serverUrl || !username || !password) {
      console.error("❌ Admin credentials not found in environment variables");
      console.error(
        "Required: JELLYFIN_SERVER_URL, JELLYFIN_ADMIN_USER, JELLYFIN_ADMIN_PASSWORD",
      );
      return null;
    }

    return { serverUrl, username, password };
  }

  /**
   * Check if current admin token is still valid
   */
  private isTokenValid(): boolean {
    return this.adminToken !== null && Date.now() < this.tokenExpiry;
  }

  /**
   * Authenticate as admin and get a fresh token
   */
  private async authenticateAdmin(): Promise<string> {
    if (this.isAuthenticating && this.authPromise) {
      // If already authenticating, wait for the existing auth to complete
      return this.authPromise;
    }

    this.isAuthenticating = true;
    this.authPromise = this.performAdminAuth();

    try {
      const token = await this.authPromise;
      return token;
    } finally {
      this.isAuthenticating = false;
      this.authPromise = null;
    }
  }

  /**
   * Perform the actual admin authentication
   */
  private async performAdminAuth(): Promise<string> {
    console.log("🔑 Authenticating as admin for library operations...");

    const credentials = this.getAdminCredentials();
    if (!credentials) {
      throw new Error(
        "Admin credentials not available in environment variables",
      );
    }

    try {
      // Create a new jellyfin client instance for admin operations
      const { user, accessToken } =
        await jellyfinClient.authenticate(credentials);

      console.log(`✅ Admin authentication successful for user: ${user.name}`);

      // Store the token with expiry (assume 24 hours, but refresh proactively)
      this.adminToken = accessToken;
      this.tokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23 hours

      return accessToken;
    } catch (error) {
      console.error("❌ Admin authentication failed:", error);
      throw new Error(
        `Admin authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Get a valid admin token, refreshing if necessary
   */
  async getAdminToken(): Promise<string> {
    if (this.isTokenValid()) {
      return this.adminToken!;
    }

    return await this.authenticateAdmin();
  }

  /**
   * Execute an operation with admin authentication
   * Automatically handles token refresh if needed
   */
  async withAdminAuth<T>(operation: () => Promise<T>): Promise<T> {
    try {
      // Ensure we have a valid admin token
      const token = await this.getAdminToken();

      // Initialize jellyfin client with admin credentials and token
      const credentials = this.getAdminCredentials();
      if (!credentials) {
        throw new Error("Admin credentials not available");
      }

      jellyfinClient.initializeFromStorage(credentials, token, "");

      // Execute the operation
      return await operation();
    } catch (error) {
      // Check if it's an auth error
      if (this.isAuthError(error)) {
        console.log("🔑 Admin auth error detected, refreshing token...");

        // Clear the current token and retry once
        this.adminToken = null;
        this.tokenExpiry = 0;

        const newToken = await this.getAdminToken();
        const credentials = this.getAdminCredentials();
        if (!credentials) {
          throw new Error("Admin credentials not available");
        }

        jellyfinClient.initializeFromStorage(credentials, newToken, "");

        // Retry the operation once
        return await operation();
      }

      throw error;
    }
  }

  /**
   * Check if an error is an authentication error
   */
  private isAuthError(error: unknown): boolean {
    if (!error) return false;

    // Check for HTTP status codes
    if (typeof error === "object" && error !== null) {
      const err = error as Record<string, unknown>;
      if (err.status === 401 || err.status === 403) {
        return true;
      }

      // Check for axios errors
      const response = err.response as Record<string, unknown> | undefined;
      if (response?.status === 401 || response?.status === 403) {
        return true;
      }

      // Check error messages
      const message =
        typeof err.message === "string" ? err.message.toLowerCase() : "";
      return (
        message.includes("unauthorized") ||
        message.includes("forbidden") ||
        message.includes("authentication") ||
        message.includes("token")
      );
    }

    return false;
  }

  /**
   * Clear admin token (for testing or logout)
   */
  clearToken(): void {
    this.adminToken = null;
    this.tokenExpiry = 0;
  }
}

// Export a singleton instance
export const adminAuthClient = new AdminAuthClient();
