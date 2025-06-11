import { useState } from "react";
import { useRouter } from "next/navigation";
import { jellyfinClient } from "@/lib/api/jellyfin";
import type { Playlist } from "@/types/jellyfin";

interface PlaylistTitleProps {
  playlist: Playlist;
  playlistId: string;
}

export default function PlaylistTitle({ playlist, playlistId }: PlaylistTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(playlist.name);
  const [isUpdating, setIsUpdating] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newName === playlist.name) {
      setIsEditing(false);
      setNewName(playlist.name);
      return;
    }

    setIsUpdating(true);
    try {
      // Update the playlist name - this will create a new playlist and return its ID
      const newPlaylistId = await jellyfinClient.updatePlaylistName(playlistId, newName);
      
      // Navigate to the new playlist URL
      router.replace(`/playlist/${newPlaylistId}`);
    } catch (error) {
      console.error("Failed to update playlist name:", error);
      // Reset the name on error
      setNewName(playlist.name);
    } finally {
      setIsUpdating(false);
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsEditing(false);
      setNewName(playlist.name);
    }
  };

  if (isEditing) {
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          disabled={isUpdating}
          className="text-3xl font-bold text-gray-900 bg-white border-b-2 border-indigo-500 focus:outline-none focus:border-indigo-700 px-1 py-0.5 disabled:opacity-50"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isUpdating}
            className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded-md disabled:opacity-50"
          >
            {isUpdating ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              setNewName(playlist.name);
            }}
            disabled={isUpdating}
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1 rounded-md disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <h1 className="text-3xl font-bold text-gray-900">{playlist.name}</h1>
      <button
        onClick={() => setIsEditing(true)}
        className="text-gray-400 hover:text-gray-600"
        title="Edit playlist name"
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
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      </button>
    </div>
  );
}
