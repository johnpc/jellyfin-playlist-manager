"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { jellyfinClient } from "@/lib/api/jellyfin";
import {
  findBestMatch,
  generateSearchQueries,
} from "@/lib/utils/search-matching";
import type {
  PlaylistItem,
  AISuggestion,
  SuggestionWithAvailability,
} from "@/types/jellyfin";

interface PlaylistSuggestionsProps {
  playlistItems: PlaylistItem[];
  playlistId: string;
  onAddItem: (itemId: string) => Promise<void>;
}

export default function PlaylistSuggestions({
  playlistItems,
  playlistId,
  onAddItem,
}: PlaylistSuggestionsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // Generate AI-powered suggestions based on playlist content
  const {
    data: suggestions,
    isLoading,
    error,
  } = useQuery<SuggestionWithAvailability[]>({
    queryKey: [
      "ai-suggestions",
      playlistItems.map((item) => item.id).join(","),
    ],
    queryFn: async () => {
      if (playlistItems.length === 0) return [];

      // Get AI suggestions
      const response = await fetch("/api/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playlistItems: playlistItems.map((item) => ({
            name: item.name,
            albumArtist: item.albumArtist,
            album: item.album,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch AI suggestions");
      }

      const { suggestions: aiSuggestions }: { suggestions: AISuggestion[] } =
        await response.json();

      // Check availability of each suggestion in Jellyfin library
      const suggestionsWithAvailability: SuggestionWithAvailability[] = [];

      for (const suggestion of aiSuggestions) {
        try {
          // Generate multiple search queries for better coverage
          const searchQueries = generateSearchQueries(suggestion);
          let bestMatch = null;

          console.log(
            `Searching for: "${suggestion.title}" by "${suggestion.artist}"`,
          );
          console.log(`Search queries:`, searchQueries);

          // Try each search query until we find a good match
          for (const query of searchQueries) {
            const searchResults = await jellyfinClient.searchItems(query, 10);
            console.log(
              `Query "${query}" returned ${searchResults.length} results`,
            );

            const match = findBestMatch(suggestion, searchResults);

            if (match) {
              console.log(
                `Found match: "${match.name}" by "${match.albumArtist}"`,
              );
              bestMatch = match;
              break; // Found a good match, no need to try other queries
            }
          }

          if (!bestMatch) {
            console.log(
              `No match found for "${suggestion.title}" by "${suggestion.artist}"`,
            );
          }

          suggestionsWithAvailability.push({
            ...suggestion,
            isAvailable: !!bestMatch,
            jellyfinItem: bestMatch || undefined,
          });
        } catch (error) {
          console.error(`Error searching for ${suggestion.title}:`, error);
          suggestionsWithAvailability.push({
            ...suggestion,
            isAvailable: false,
          });
        }
      }

      return suggestionsWithAvailability;
    },
    enabled: playlistItems.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const handleAddSuggestion = async (
    suggestion: SuggestionWithAvailability,
  ) => {
    if (!suggestion.isAvailable || !suggestion.jellyfinItem) {
      return; // Can't add unavailable items
    }

    setIsAdding(suggestion.jellyfinItem.id);
    try {
      await onAddItem(suggestion.jellyfinItem.id);
      setTimeout(() => setIsAdding(null), 1000);
    } catch (error) {
      console.error("Failed to add suggestion:", error);
      setIsAdding(null);
    }
  };

  const handleDownloadSong = async (suggestion: SuggestionWithAvailability) => {
    const downloadKey = `${suggestion.title}-${suggestion.artist}`;
    setIsDownloading(downloadKey);

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: suggestion.title,
          artist: suggestion.artist,
          album: suggestion.album,
          playlistId: playlistId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Download failed");
      }

      console.log("Download successful:", result.message);

      if (result.addedToPlaylist) {
        console.log("Song automatically added to playlist!");
        alert(
          `✅ Success! "${suggestion.title}" was downloaded and added to your playlist automatically!`,
        );
        // Refresh the playlist to show the new song
        // You might want to trigger a playlist refresh here
      } else if (result.playlistError) {
        console.log(
          "Download succeeded but failed to add to playlist:",
          result.playlistError,
        );
        alert(
          `⚠️ Download succeeded, but couldn't add to playlist automatically: ${result.playlistError}`,
        );
      } else {
        alert(`✅ "${suggestion.title}" downloaded successfully!`);
      }

      // Show success state briefly
      setTimeout(() => {
        setIsDownloading(null);
        // Optionally refresh suggestions to check if the song is now available
        // You might want to invalidate the query here
      }, 2000);
    } catch (error) {
      console.error("Download failed:", error);
      alert(
        `Download failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      setIsDownloading(null);
    }
  };

  if (playlistItems.length === 0) {
    return null; // Don't show suggestions for empty playlists
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset"
      >
        <div className="flex items-center">
          <svg
            className="w-5 h-5 text-purple-500 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <span className="text-sm font-medium text-gray-900">
            AI Suggestions
          </span>
          <span className="ml-2 px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full">
            Powered by AI
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transform transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          {isLoading ? (
            <div className="text-sm text-gray-500 py-4 flex items-center">
              <svg
                className="animate-spin -ml-1 mr-3 h-4 w-4 text-purple-500"
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
              AI is analyzing your playlist...
            </div>
          ) : error ? (
            <div className="text-sm text-red-500 py-4">
              Error generating AI suggestions. Please try again.
            </div>
          ) : suggestions?.length === 0 ? (
            <div className="text-sm text-gray-500 py-4">
              No AI suggestions available for this playlist
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions?.map((suggestion, index) => (
                <div
                  key={`${suggestion.title}-${suggestion.artist}-${index}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 group"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    {suggestion.isAvailable &&
                    suggestion.jellyfinItem?.imageTags?.Primary ? (
                      <div className="relative h-10 w-10 flex-shrink-0">
                        <Image
                          src={jellyfinClient.getImageUrl(
                            suggestion.jellyfinItem.id,
                            suggestion.jellyfinItem.imageTags.Primary,
                          )}
                          alt={suggestion.title}
                          fill
                          className="object-cover rounded"
                        />
                      </div>
                    ) : (
                      <div className="h-10 w-10 flex-shrink-0 bg-gray-200 rounded flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="ml-3 flex-1 min-w-0">
                      <div className="flex items-center">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {suggestion.title}
                        </p>
                        {!suggestion.isAvailable && (
                          <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">
                            Can download
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        <span className="mr-2">{suggestion.artist}</span>
                        {suggestion.album && <span>• {suggestion.album}</span>}
                      </p>
                      {suggestion.reason && (
                        <p className="text-xs text-gray-400 truncate mt-1">
                          {suggestion.reason}
                        </p>
                      )}
                    </div>
                  </div>

                  {suggestion.isAvailable ? (
                    <button
                      onClick={() => handleAddSuggestion(suggestion)}
                      disabled={isAdding === suggestion.jellyfinItem?.id}
                      className={`ml-2 p-1 rounded-full ${
                        isAdding === suggestion.jellyfinItem?.id
                          ? "text-green-500"
                          : "text-gray-400 opacity-0 group-hover:opacity-100 hover:text-indigo-600"
                      }`}
                      title="Add to playlist"
                    >
                      {isAdding === suggestion.jellyfinItem?.id ? (
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
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
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
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDownloadSong(suggestion)}
                      disabled={
                        isDownloading ===
                        `${suggestion.title}-${suggestion.artist}`
                      }
                      className={`ml-2 p-1 rounded-full ${
                        isDownloading ===
                        `${suggestion.title}-${suggestion.artist}`
                          ? "text-green-500"
                          : "text-gray-400 opacity-0 group-hover:opacity-100 hover:text-blue-600"
                      }`}
                      title="Download from YouTube and add to playlist"
                    >
                      {isDownloading ===
                      `${suggestion.title}-${suggestion.artist}` ? (
                        <svg
                          className="w-5 h-5 animate-spin"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      ) : (
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
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
