"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { jellyfinClient } from "@/lib/api/jellyfin";
import { useAuthStore } from "@/lib/store/auth";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import RadioPlaylistCreator from "@/components/playlists/RadioPlaylistCreator";
import type { Playlist } from "@/types/jellyfin";

export default function PlaylistsView() {
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [isCreatingRadio, setIsCreatingRadio] = useState(false);
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();

  const {
    data: playlists,
    isLoading,
    error,
    refetch,
  } = useQuery<Playlist[]>({
    queryKey: ["playlists"],
    queryFn: () => jellyfinClient.getPlaylists(),
  });

  // Sort playlists alphabetically by name
  const sortedPlaylists = useMemo(() => {
    if (!playlists) return [];
    return [...playlists].sort((a, b) => a.name.localeCompare(b.name));
  }, [playlists]);

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim() || isSubmittingCreate) return;

    setIsSubmittingCreate(true);
    try {
      console.log(`Creating playlist: "${newPlaylistName}"`);
      await jellyfinClient.createPlaylist(newPlaylistName);
      console.log(`✅ Playlist "${newPlaylistName}" created successfully`);
      
      setNewPlaylistName("");
      setIsCreating(false);
      refetch();
    } catch (error) {
      console.error("Failed to create playlist:", error);
      // Don't close the dialog on error so user can retry
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleDeletePlaylist = async () => {
    if (!playlistToDelete) return;

    setIsDeleting(true);
    try {
      await jellyfinClient.deletePlaylist(playlistToDelete.id);
      setPlaylistToDelete(null);
      refetch();
    } catch (error) {
      console.error("Failed to delete playlist:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading playlists...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Error loading playlists</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Your Playlists</h1>
          <div className="flex gap-4">
            <button
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Create Playlist
            </button>
            <button
              onClick={() => setIsCreatingRadio(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              🎵 Create Radio Playlist
            </button>
            <button
              onClick={() => logout()}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Logout
            </button>
          </div>
        </div>

        {isCreating && (
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Create New Playlist
              </h3>
              <form onSubmit={handleCreatePlaylist}>
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="Playlist name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setNewPlaylistName("");
                      setIsSubmittingCreate(false);
                    }}
                    disabled={isSubmittingCreate}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingCreate || !newPlaylistName.trim()}
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {isSubmittingCreate ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Creating...
                      </>
                    ) : (
                      "Create"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sortedPlaylists.map((playlist) => (
            <div
              key={playlist.id}
              className="bg-white overflow-hidden shadow rounded-lg divide-y divide-gray-200"
            >
              <div className="px-4 py-5 sm:p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900">
                      {playlist.name}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {playlist.itemCount}{" "}
                      {playlist.itemCount === 1 ? "track" : "tracks"}
                    </p>
                  </div>
                  <button
                    onClick={() => setPlaylistToDelete(playlist)}
                    className="ml-2 p-1 text-gray-400 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 rounded"
                    title="Delete playlist"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="px-4 py-4 sm:px-6">
                <button
                  onClick={() => router.push(`/playlist/${playlist.id}`)}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  View Details →
                </button>
              </div>
            </div>
          ))}
        </div>

        <ConfirmDialog
          isOpen={!!playlistToDelete}
          title="Delete Playlist"
          message={`Are you sure you want to delete "${playlistToDelete?.name}"? This action cannot be undone.`}
          onConfirm={handleDeletePlaylist}
          onCancel={() => setPlaylistToDelete(null)}
          isLoading={isDeleting}
        />

        <RadioPlaylistCreator
          isOpen={isCreatingRadio}
          onClose={() => setIsCreatingRadio(false)}
          onSuccess={() => refetch()}
        />
      </div>
    </div>
  );
}
