"use client";

import { useState } from "react";
import { useAuthStore } from "@/lib/store/auth";

interface RadioPlaylistCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RadioPlaylistCreator({
  isOpen,
  onClose,
  onSuccess,
}: RadioPlaylistCreatorProps) {
  const [songPrompt, setSongPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState("");
  const { accessToken, config } = useAuthStore();

  const handleCreateRadioPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!songPrompt.trim() || isCreating) return;

    setIsCreating(true);
    setProgress("Starting radio playlist creation...");

    try {
      const response = await fetch("/api/radio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken && { "x-jellyfin-auth": accessToken }),
          ...(config?.serverUrl && { "x-jellyfin-server": config.serverUrl }),
        },
        body: JSON.stringify({
          songPrompt: songPrompt.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create radio playlist");
      }

      console.log("Radio playlist creation successful:", result);
      
      // Show success message
      const successMessage = `🎉 Radio playlist "${result.playlistName}" created successfully!\n\n` +
        `📊 Results:\n` +
        `• ${result.songsAdded}/${result.totalSuggestions} songs added\n` +
        `• ${result.songsFound} found in library\n` +
        `• ${result.songsDownloaded} downloaded\n` +
        (result.errors.length > 0 ? `\n⚠️ ${result.errors.length} errors occurred` : "");
      
      alert(successMessage);
      
      setSongPrompt("");
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Radio playlist creation failed:", error);
      alert(
        `Failed to create radio playlist: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsCreating(false);
      setProgress("");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          🎵 Create Radio Playlist
        </h3>
        
        <div className="mb-4 text-sm text-gray-600">
          <p>Enter a song or artist to create a 25-song radio playlist. AI will suggest similar songs, and any missing tracks will be automatically downloaded.</p>
        </div>

        <form onSubmit={handleCreateRadioPlaylist}>
          <div className="mb-4">
            <label htmlFor="songPrompt" className="block text-sm font-medium text-gray-700 mb-2">
              Song or Artist Prompt
            </label>
            <input
              id="songPrompt"
              type="text"
              value={songPrompt}
              onChange={(e) => setSongPrompt(e.target.value)}
              placeholder="e.g., 'Bohemian Rhapsody by Queen' or 'Taylor Swift'"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isCreating}
            />
          </div>

          {isCreating && progress && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-4 w-4 text-blue-500"
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
                <span className="text-sm text-blue-700">{progress}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                setSongPrompt("");
                setProgress("");
              }}
              disabled={isCreating}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !songPrompt.trim()}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isCreating ? (
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
                  Creating Radio...
                </>
              ) : (
                <>
                  🎵 Create Radio Playlist
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-4 text-xs text-gray-500">
          <p><strong>Note:</strong> This process may take several minutes as it generates AI suggestions, checks your library, and downloads missing songs.</p>
        </div>
      </div>
    </div>
  );
}
