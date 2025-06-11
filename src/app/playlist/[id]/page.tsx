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
  const { isAuthenticated } = useAuthStore();
  const playlistId = params.id as string;
  const queryClient = useQueryClient();
  const [isReordering, setIsReordering] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);

  // Configure DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth");
    }
  }, [isAuthenticated, router]);

  // Fetch playlist details
  const {
    data: playlistDetails,
    isLoading: isLoadingDetails,
    error: detailsError,
  } = useQuery<Playlist>({
    queryKey: ["playlist-details", playlistId],
    queryFn: () => jellyfinClient.getPlaylistDetails(playlistId),
  });

  // Fetch playlist items
  const {
    data: playlistItems,
    isLoading: isLoadingItems,
    error: itemsError,
  } = useQuery<PlaylistItemType[]>({
    queryKey: ["playlist", playlistId],
    queryFn: () => jellyfinClient.getPlaylistItems(playlistId),
  });

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

  if (!isAuthenticated) {
    return null;
  }

  const isLoading = isLoadingDetails || isLoadingItems;
  const error = detailsError || itemsError;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading playlist...</div>
      </div>
    );
  }

  if (error || !playlistDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Error loading playlist</div>
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
              {playlistDetails.itemCount}{" "}
              {playlistDetails.itemCount === 1 ? "track" : "tracks"}
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
