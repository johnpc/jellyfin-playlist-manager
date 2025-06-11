"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/store/auth";
import { jellyfinClient } from "@/lib/api/jellyfin";

export default function AuthInitializer() {
  const { config, user, accessToken } = useAuthStore();

  useEffect(() => {
    // If we have stored auth data, initialize the client
    if (config && user && accessToken) {
      jellyfinClient.initializeFromStorage(config, accessToken, user.id);
    }
  }, [config, user, accessToken]);

  return null; // This is a utility component that doesn't render anything
}
