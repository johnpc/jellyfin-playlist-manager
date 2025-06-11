"use client";

import { useAuthStore } from "@/lib/store/auth";
import LoginForm from "@/components/auth/LoginForm";
import PlaylistsView from "@/components/playlists/PlaylistsView";

export default function Home() {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return <PlaylistsView />;
}
