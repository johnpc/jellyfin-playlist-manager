"use client";

import { useAuthStore } from "@/lib/store/auth";
import LoginForm from "@/components/auth/LoginForm";
import PlaylistsView from "@/components/playlists/PlaylistsView";

export default function Home() {
  const { isAuthenticated, isHydrated } = useAuthStore();

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return <PlaylistsView />;
}
