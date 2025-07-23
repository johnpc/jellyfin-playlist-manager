"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { jellyfinClient } from "@/lib/api/jellyfin";
import { useAuthStore } from "@/lib/store/auth";
import { usePlaylistProgress } from "@/hooks/usePlaylistProgress";
import PlaylistItem from "@/components/playlist/PlaylistItem";
import PlaylistTitle from "@/components/playlist/PlaylistTitle";
import PlaylistSearch from "@/components/playlist/PlaylistSearch";
import PlaylistSuggestions from "@/components/playlist/PlaylistSuggestions";
import type {
  PlaylistItem as PlaylistItemType,
  Playlist,
} from "@/types/jellyfin";

export default function PlaylistDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, isHydrated } = useAuthStore();
  const playlistId = params.id as string;
  const queryClient = useQueryClient();
  const [isReordering, setIsReordering] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const progress = usePlaylistProgress();

  // Configure DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Redirect to login if not authenticated (but wait for hydration first)
  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      console.log("User not authenticated after hydration, redirecting to auth page");
      router.push("/auth");
    }
  }, [isAuthenticated, isHydrated, router]);

  // Fetch playlist details
  const {
    data: playlistDetails,
    isLoading: isLoadingDetails,
    error: detailsError,
  } = useQuery<Playlist>({
    queryKey: ["playlist-details", playlistId],
    queryFn: () => jellyfinClient.getPlaylistDetails(playlistId),
    enabled: isAuthenticated && isHydrated,
    staleTime: 30000, // Consider data fresh for 30 seconds
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
  });

  // Fetch playlist items
  const {
    data: playlistItems,
    isLoading: isLoadingItems,
    error: itemsError,
  } = useQuery<PlaylistItemType[]>({
    queryKey: ["playlist", playlistId],
    queryFn: () => jellyfinClient.getPlaylistItems(playlistId),
    enabled: isAuthenticated && isHydrated,
    staleTime: 30000, // Consider data fresh for 30 seconds
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
    retry: 3, // Retry 3 times for large playlists
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff up to 10s
    // Longer timeout for large playlists
    meta: {
      timeout: 120000, // 2 minutes timeout for very large playlists
    },
  });

  // Track loading time for debugging
  useEffect(() => {
    if (isLoadingItems && !loadingStartTime) {
      setLoadingStartTime(Date.now());
      console.log(`🕐 Started loading playlist items for ${playlistId}`);
    } else if (!isLoadingItems && loadingStartTime) {
      const loadTime = Date.now() - loadingStartTime;
      console.log(`✅ Finished loading playlist items in ${loadTime}ms`);
      setLoadingStartTime(null);
    }
  }, [isLoadingItems, loadingStartTime, playlistId]);

  // Log playlist size for debugging
  useEffect(() => {
    if (playlistItems) {
      console.log(`📊 Playlist loaded with ${playlistItems.length} items`);
    }
  }, [playlistItems]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && playlistItems) {
      const oldIndex = playlistItems.findIndex((item) => item.id === active.id);
      const newIndex = playlistItems.findIndex((item) => item.id === over.id);

      setIsReordering(true);
      try {
        // Optimistically update the UI
        const newItems = arrayMove(playlistItems, oldIndex, newIndex);
        queryClient.setQueryData(["playlist", playlistId], newItems);

        // Update the server
        await jellyfinClient.movePlaylistItem(
          playlistId,
          active.id as string,
          newIndex,
        );
      } catch (error) {
        console.error("Failed to reorder playlist:", error);
        // Revert the optimistic update on error
        queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
      } finally {
        setIsReordering(false);
      }
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    setIsRemoving(itemId);
    try {
      await jellyfinClient.removeItemFromPlaylist(playlistId, itemId);
      // Refresh the playlist items
      queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
      queryClient.invalidateQueries({
        queryKey: ["playlist-details", playlistId],
      });
    } catch (error) {
      console.error("Failed to remove item from playlist:", error);
    } finally {
      setIsRemoving(null);
    }
  };

  if (!isHydrated) {
    // Show loading while waiting for auth store to hydrate
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Don't render anything while redirecting
    return null;
  }

  const isLoading = isLoadingDetails || isLoadingItems;
  const error = detailsError || itemsError;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-lg mb-2">Loading playlist...</div>
          <div className="text-sm text-gray-500 mb-4">
            {isLoadingItems && !isLoadingDetails && "Loading playlist items..."}
            {isLoadingDetails && !isLoadingItems && "Loading playlist details..."}
            {isLoadingItems && isLoadingDetails && "Loading playlist data..."}
          </div>
          
          {/* Progress bar for large playlists */}
          {progress.isLoading && progress.total > 0 && (
            <div className="mb-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percentage}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {progress.loaded} / {progress.total} items ({progress.percentage}%)
              </div>
            </div>
          )}
          
          <div className="mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          </div>
          
          <div className="text-xs text-gray-400">
            {progress.total > 100 ? 
              "Large playlist detected - this may take a moment" :
              "Large playlists may take a moment to load"
            }
          </div>
          
          {loadingStartTime && (
            <div className="text-xs text-gray-400 mt-1">
              Loading for {Math.round((Date.now() - loadingStartTime) / 1000)}s
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error || !playlistDetails) {
    console.error("Playlist loading error:", { 
      detailsError, 
      itemsError, 
      playlistId,
      isLoadingDetails,
      isLoadingItems 
    });
    
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-lg mb-2">Error loading playlist</div>
          <div className="text-sm text-gray-600 mb-4">
            {detailsError && <div>Details error: {String(detailsError)}</div>}
            {itemsError && <div>Items error: {String(itemsError)}</div>}
          </div>
          <button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["playlist-details", playlistId] });
              queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Retry Loading
          </button>
          <div className="mt-4">
            <button
              onClick={() => router.back()}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ← Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="mb-4 text-sm text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg
              className="w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back
          </button>

          <PlaylistTitle playlist={playlistDetails} playlistId={playlistId} />

          <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
            <span>
              {playlistItems?.length || 0}{" "}
              {(playlistItems?.length || 0) === 1 ? "track" : "tracks"}
            </span>
            {playlistDetails.duration && (
              <span>{Math.floor(playlistDetails.duration / 60)} minutes</span>
            )}
            {(isReordering || isRemoving) && (
              <span className="text-indigo-600">
                {isReordering ? "Saving changes..." : "Removing item..."}
              </span>
            )}
          </div>
        </div>

        <div className="mb-6">
          <PlaylistSearch
            onAddItem={async (itemId) => {
              try {
                await jellyfinClient.addItemsToPlaylist(playlistId, [itemId]);
                // Refresh the playlist items
                queryClient.invalidateQueries({
                  queryKey: ["playlist", playlistId],
                });
              } catch (error) {
                console.error("Failed to add item to playlist:", error);
                throw error;
              }
            }}
          />
        </div>

        <PlaylistSuggestions
          playlistItems={playlistItems || []}
          playlistId={playlistId}
          onAddItem={async (itemId) => {
            try {
              await jellyfinClient.addItemsToPlaylist(playlistId, [itemId]);
              // Refresh the playlist items
              queryClient.invalidateQueries({
                queryKey: ["playlist", playlistId],
              });
            } catch (error) {
              console.error("Failed to add suggestion to playlist:", error);
              throw error;
            }
          }}
        />

        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={playlistItems?.map((item) => item.id) || []}
              strategy={verticalListSortingStrategy}
            >
              <div className="divide-y divide-gray-200">
                {playlistItems?.map((item) => (
                  <PlaylistItem
                    key={item.id}
                    item={item}
                    onRemove={handleRemoveItem}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
