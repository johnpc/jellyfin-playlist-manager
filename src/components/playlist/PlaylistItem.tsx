import Image from "next/image";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PlaylistItem as PlaylistItemType } from "@/types/jellyfin";
import { jellyfinClient } from "@/lib/api/jellyfin";

interface PlaylistItemProps {
  item: PlaylistItemType;
  onRemove?: (itemId: string) => Promise<void>;
}

export default function PlaylistItem({ item, onRemove }: PlaylistItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRemove = async () => {
    if (onRemove) {
      await onRemove(item.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`px-4 py-4 sm:px-6 ${isDragging ? "bg-gray-50" : ""}`}
      {...attributes}
    >
      <div className="flex items-center justify-between group">
        <div className="flex items-center flex-1">
          <button
            {...listeners}
            className="mr-3 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
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
                d="M4 8h16M4 16h16"
              />
            </svg>
          </button>
          <div className="flex items-center flex-1 min-w-0">
            {item.imageTags?.Primary && (
              <div className="relative h-12 w-12 flex-shrink-0">
                <Image
                  src={jellyfinClient.getImageUrl(
                    item.id,
                    item.imageTags.Primary,
                  )}
                  alt={item.name}
                  fill
                  className="object-cover rounded"
                />
              </div>
            )}
            <div className="ml-4 flex-1 min-w-0">
              <p className="text-sm font-medium text-indigo-600 truncate">
                {item.name}
              </p>
              <p className="text-sm text-gray-500 truncate">
                {item.albumArtist && (
                  <span className="mr-2">{item.albumArtist}</span>
                )}
                {item.album && <span>• {item.album}</span>}
              </p>
            </div>
          </div>
        </div>
        <div className="ml-2 flex-shrink-0 flex items-center gap-2">
          {item.duration && (
            <p className="text-sm text-gray-500">
              {Math.floor(item.duration / 60)}:
              {(item.duration % 60).toString().padStart(2, "0")}
            </p>
          )}
          {onRemove && (
            <button
              onClick={handleRemove}
              className="text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600 p-1 rounded-full"
              title="Remove from playlist"
            >
              <svg
                className="w-4 h-4"
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
          )}
        </div>
      </div>
    </div>
  );
}
