import { jellyfinClient } from "./jellyfin";
import { setCookie } from "@/lib/utils/cookies";
import type { JellyfinConfig } from "@/types/jellyfin";

const STORAGE_KEYS = {
  SERVER_URL: "jellyfin-server-url",
  USERNAME: "jellyfin-username",
  PASSWORD: "jellyfin-password",
} as const;

class AuthClient {
  private isRefreshing = false;
  private refreshPromise: Promise<string> | null = null;

  /**
   * Get stored credentials from localStorage
   */
  private getStoredCredentials(): JellyfinConfig | null {
    if (typeof window === "undefined") return null;

    const serverUrl = localStorage.getItem(STORAGE_KEYS.SERVER_URL);
    const username = localStorage.getItem(STORAGE_KEYS.USERNAME);
    const password = localStorage.getItem(STORAGE_KEYS.PASSWORD);

    if (!serverUrl || !username || !password) {
      return null;
    }

    return { serverUrl, username, password };
  }

  /**
   * Refresh the authentication token
   */
  private async refreshToken(): Promise<string> {
    if (this.isRefreshing && this.refreshPromise) {
      // If already refreshing, wait for the existing refresh to complete
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.performTokenRefresh();

    try {
      const newToken = await this.refreshPromise;
      return newToken;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  /**
   * Perform the actual token refresh
   */
  private async performTokenRefresh(): Promise<string> {
    console.log("🔄 Attempting to refresh authentication token...");

    const credentials = this.getStoredCredentials();
    if (!credentials) {
      console.error("❌ No stored credentials found for token refresh");
      throw new Error("No stored credentials available for token refresh");
    }

    try {
      // Re-authenticate with stored credentials
      const { user, accessToken } =
        await jellyfinClient.authenticate(credentials);

      console.log("✅ Token refresh successful");

      // Update the cookie with the new token
      setCookie("jellyfin-auth-token", accessToken, 7);

      // Update the jellyfin client with the new token
      jellyfinClient.updateAccessToken(accessToken);

      // Update the auth store if it exists
      if (typeof window !== "undefined") {
        // Get the auth store and update it
        const { useAuthStore } = await import("@/lib/store/auth");
        const setAuth = useAuthStore.getState().setAuth;
        setAuth(user, accessToken, credentials);
      }

      return accessToken;
    } catch (error) {
      console.error("❌ Token refresh failed:", error);

      // If refresh fails, redirect to login
      if (typeof window !== "undefined") {
        const { useAuthStore } = await import("@/lib/store/auth");
        const logout = useAuthStore.getState().logout;
        logout();

        // Redirect to auth page
        window.location.href = "/auth";
      }

      throw new Error("Token refresh failed");
    }
  }

  /**
   * Check if an error is an authentication error that should trigger a token refresh
   */
  private isAuthError(error: unknown): boolean {
    if (!error) return false;

    // Check for axios error with 401 or 403 status
    if (error && typeof error === "object" && "response" in error) {
      const axiosError = error as { response?: { status?: number } };
      if (
        axiosError.response?.status === 401 ||
        axiosError.response?.status === 403
      ) {
        return true;
      }
    }

    // Check for fetch error with 401 or 403 status
    if (error && typeof error === "object" && "status" in error) {
      const fetchError = error as { status?: number };
      if (fetchError.status === 401 || fetchError.status === 403) {
        return true;
      }
    }

    // Check for error messages that indicate authentication issues
    if (error && typeof error === "object" && "message" in error) {
      const errorWithMessage = error as { message?: string };
      const errorMessage = errorWithMessage.message?.toLowerCase() || "";
      if (
        errorMessage.includes("unauthorized") ||
        errorMessage.includes("forbidden") ||
        errorMessage.includes("authentication") ||
        errorMessage.includes("token")
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Execute a function with automatic token refresh on auth errors
   */
  async withTokenRefresh<T>(operation: () => Promise<T>): Promise<T> {
    try {
      // Try the operation first
      return await operation();
    } catch (error) {
      console.log(
        "🔍 Operation failed, checking if it's an auth error...",
        error,
      );

      // Check if this is an authentication error
      if (!this.isAuthError(error)) {
        console.log("❌ Not an auth error, rethrowing original error");
        throw error;
      }

      console.log("🔑 Auth error detected, attempting token refresh...");

      try {
        // Refresh the token
        await this.refreshToken();

        console.log("🔄 Token refreshed, retrying operation...");

        // Retry the operation with the new token
        return await operation();
      } catch (refreshError) {
        console.error("❌ Token refresh or retry failed:", refreshError);

        // If refresh fails, throw the refresh error instead of the original
        throw refreshError;
      }
    }
  }

  /**
   * Check if stored credentials are available
   */
  hasStoredCredentials(): boolean {
    return this.getStoredCredentials() !== null;
  }
}

export const authClient = new AuthClient();
