"use client";

import { useEffect } from "react";

export default function DevAuthTestUtils() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      // Dynamically import the auth test utils
      import("@/lib/utils/auth-test").then(({ AuthTestUtils }) => {
        // Make it available globally for testing
        (window as unknown as Record<string, unknown>).AuthTestUtils = AuthTestUtils;
        console.log("🧪 Auth test utils loaded. Use AuthTestUtils in console for testing token refresh.");
        console.log("Available methods:");
        console.log("- AuthTestUtils.simulateTokenExpiration()");
        console.log("- AuthTestUtils.clearToken()");
        console.log("- AuthTestUtils.hasStoredCredentials()");
        console.log("- AuthTestUtils.corruptStoredCredentials()");
        console.log("- AuthTestUtils.logAuthState()");
      }).catch(() => {
        // Ignore errors in production or if utils don't exist
      });
    }
  }, []);

  return null; // This component doesn't render anything
}
