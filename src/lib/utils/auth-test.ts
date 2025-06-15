/**
 * Utility functions for testing authentication and token refresh
 * These functions are only intended for development/testing purposes
 */

import { deleteCookie, setCookie, getCookie } from "./cookies";

export class AuthTestUtils {
  /**
   * Simulate token expiration by corrupting the current token
   */
  static simulateTokenExpiration(): void {
    if (typeof window === "undefined") return;

    const currentToken = getCookie("jellyfin-auth-token");
    if (currentToken) {
      // Corrupt the token to simulate expiration
      setCookie("jellyfin-auth-token", currentToken + "_EXPIRED", 7);
      console.log("🧪 Token corrupted to simulate expiration");
    } else {
      console.log("🧪 No token found to corrupt");
    }
  }

  /**
   * Clear the authentication token to simulate complete token loss
   */
  static clearToken(): void {
    if (typeof window === "undefined") return;

    deleteCookie("jellyfin-auth-token");
    console.log("🧪 Token cleared to simulate complete token loss");
  }

  /**
   * Check if stored credentials are available for token refresh
   */
  static hasStoredCredentials(): boolean {
    if (typeof window === "undefined") return false;

    const serverUrl = localStorage.getItem("jellyfin-server-url");
    const username = localStorage.getItem("jellyfin-username");
    const password = localStorage.getItem("jellyfin-password");

    const hasCredentials = !!(serverUrl && username && password);
    console.log("🧪 Stored credentials available:", hasCredentials);

    return hasCredentials;
  }

  /**
   * Temporarily corrupt stored credentials to test refresh failure
   */
  static corruptStoredCredentials(): { restore: () => void } {
    if (typeof window === "undefined") {
      return { restore: () => {} };
    }

    const originalPassword = localStorage.getItem("jellyfin-password");

    if (originalPassword) {
      localStorage.setItem("jellyfin-password", originalPassword + "_INVALID");
      console.log("🧪 Stored credentials corrupted");
    }

    return {
      restore: () => {
        if (originalPassword) {
          localStorage.setItem("jellyfin-password", originalPassword);
          console.log("🧪 Stored credentials restored");
        }
      },
    };
  }

  /**
   * Log current authentication state
   */
  static logAuthState(): void {
    if (typeof window === "undefined") return;

    const token = getCookie("jellyfin-auth-token");
    const serverUrl = localStorage.getItem("jellyfin-server-url");
    const username = localStorage.getItem("jellyfin-username");
    const hasPassword = !!localStorage.getItem("jellyfin-password");

    console.log("🧪 Current Auth State:", {
      hasToken: !!token,
      tokenLength: token?.length || 0,
      serverUrl,
      username,
      hasPassword,
    });
  }
}

// Make it available globally for testing in browser console
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).AuthTestUtils = AuthTestUtils;
}
