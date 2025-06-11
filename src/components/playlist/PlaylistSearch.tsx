"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { jellyfinClient } from "@/lib/api/jellyfin";
import type { SearchResult } from "@/types/jellyfin";

interface PlaylistSearchProps {
  onAddItem: (itemId: string) => Promise<void>;
}

export default function PlaylistSearch({ onAddItem }: PlaylistSearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    data: searchResults,
    isLoading,
    error,
  } = useQuery<SearchResult[]>({
    queryKey: ["search", query],
    queryFn: () => jellyfinClient.searchItems(query),
    enabled: query.length >= 2, // Only search when query is at least 2 characters
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    setIsOpen(value.length >= 2);
  };

  const handleAddItem = async (itemId: string) => {
    setIsAdding(itemId);
    try {
      await onAddItem(itemId);
      // Keep the dropdown open but show success state
      setTimeout(() => setIsAdding(null), 1000);
    } catch (error) {
      console.error("Failed to add item:", error);
      setIsAdding(null);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => query.length >= 2 && setIsOpen(true)}
            placeholder="Search for songs, albums, or artists..."
            className="w-full px-4 py-2 text-gray-900 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          {isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg
                className="animate-spin h-5 w-5 text-gray-400"
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
            </div>
          )}
        </div>
      </div>

      {isOpen && (query.length >= 2 || isLoading) && (
        <div
          ref={dropdownRef}
          className="absolute z-10 w-full mt-1 bg-white rounded-md shadow-lg max-h-96 overflow-y-auto border border-gray-200"
        >
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-gray-500">Searching...</div>
          ) : error ? (
            <div className="px-4 py-3 text-sm text-red-500">
              Error loading results
            </div>
          ) : searchResults?.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">
              No results found
            </div>
          ) : (
            <ul className="py-2">
              {searchResults?.map((result) => (
                <li
                  key={result.id}
                  className="px-4 py-2 hover:bg-gray-50 cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {result.name}
                      </div>
                      {(result.albumArtist || result.album) && (
                        <div className="text-sm text-gray-500">
                          {result.albumArtist && (
                            <span className="mr-2">{result.albumArtist}</span>
                          )}
                          {result.album && <span>• {result.album}</span>}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleAddItem(result.id)}
                      disabled={isAdding === result.id}
                      className={`ml-2 p-1 rounded-full ${
                        isAdding === result.id
                          ? "text-green-500"
                          : "text-gray-400 opacity-0 group-hover:opacity-100 hover:text-indigo-600"
                      }`}
                    >
                      {isAdding === result.id ? (
                        <svg
                          className="w-6 h-6"
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
                          className="w-6 h-6"
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
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
