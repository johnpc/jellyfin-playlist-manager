import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthState, JellyfinConfig, JellyfinUser } from "@/types/jellyfin";
import { jellyfinClient } from "@/lib/api/jellyfin";
import { setCookie, deleteCookie } from "@/lib/utils/cookies";

interface AuthStore extends AuthState {
  login: (config: JellyfinConfig) => Promise<void>;
  logout: () => void;
  setAuth: (
    user: JellyfinUser,
    accessToken: string,
    config: JellyfinConfig,
  ) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      config: null,
      user: null,
      accessToken: null,

      login: async (config: JellyfinConfig) => {
        try {
          const { user, accessToken } =
            await jellyfinClient.authenticate(config);

          // Set HTTP-only cookie for middleware
          setCookie("jellyfin-auth-token", accessToken, 7);

          set({
            isAuthenticated: true,
            config,
            user,
            accessToken,
          });
        } catch (error) {
          console.error("Login failed:", error);
          throw error;
        }
      },

      logout: () => {
        // Clear the auth cookie
        deleteCookie("jellyfin-auth-token");

        set({
          isAuthenticated: false,
          config: null,
          user: null,
          accessToken: null,
        });
      },

      setAuth: (
        user: JellyfinUser,
        accessToken: string,
        config: JellyfinConfig,
      ) => {
        set({
          isAuthenticated: true,
          config,
          user,
          accessToken,
        });
      },
    }),
    {
      name: "jellyfin-auth",
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        config: state.config,
        user: state.user,
        accessToken: state.accessToken,
      }),
    },
  ),
);
