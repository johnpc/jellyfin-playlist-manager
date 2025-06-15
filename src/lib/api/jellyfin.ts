import { Jellyfin, Api } from "@jellyfin/sdk";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";
import { getPlaylistsApi } from "@jellyfin/sdk/lib/utils/api/playlists-api";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api/items-api";
import { getSearchApi } from "@jellyfin/sdk/lib/utils/api/search-api";
import {
  findBestMatch,
  generateSearchQueries,
} from "@/lib/utils/search-matching";
import type {
  JellyfinConfig,
  JellyfinUser,
  Playlist,
  PlaylistItem,
  SearchResult,
  JellyfinTask,
  AISuggestion,
} from "@/types/jellyfin";

class JellyfinClient {
  private jellyfin: Jellyfin;
  private api: Api | undefined;
  private accessToken: string | null = null;
  private userId: string | null = null;

  constructor() {
    this.jellyfin = new Jellyfin({
      clientInfo: {
        name: "Jellyfin Playlist Manager",
        version: "1.0.0",
      },
      deviceInfo: {
        name: "Web Browser",
        id: "jellyfin-playlist-manager",
      },
    });
  }

  async authenticate(
    config: JellyfinConfig,
  ): Promise<{ user: JellyfinUser; accessToken: string }> {
    try {
      this.api = this.jellyfin.createApi(config.serverUrl);
      await this.api.authenticateUserByName(config.username, config.password);

      const userApi = getUserApi(this.api);
      const response = await userApi.getCurrentUser();

      const user: JellyfinUser = {
        id: response.data.Id!,
        name: response.data.Name!,
        serverId: response.data.ServerId!,
      };

      // Store the access token for future use
      this.accessToken = this.api.accessToken;

      return { user, accessToken: this.api.accessToken };
    } catch (error) {
      console.error("Authentication error:", error);
      throw new Error("Failed to authenticate with Jellyfin server");
    }
  }

  initializeFromStorage(
    config: JellyfinConfig,
    accessToken: string,
    userId: string,
  ) {
    this.api = this.jellyfin.createApi(config.serverUrl);
    this.api.accessToken = accessToken;
    this.accessToken = accessToken;
    this.userId = userId;
  }

  updateAccessToken(accessToken: string) {
    this.accessToken = accessToken;
    if (this.api) {
      this.api.accessToken = accessToken;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      if (!this.api) {
        return false;
      }

      const userApi = getUserApi(this.api);
      const response = await userApi.getCurrentUser();
      this.userId = response.data.Id ?? "";

      const user: JellyfinUser = {
        id: response.data.Id!,
        name: response.data.Name!,
        serverId: response.data.ServerId!,
      };

      console.log({ loggedIn: true, user });
      return true;
    });
  }

  async getPlaylists(): Promise<Playlist[]> {
    if (!this.api || !this.userId) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      const itemsApi = getItemsApi(this.api!);
      const response = await itemsApi.getItems({
        userId: this.userId!,
        includeItemTypes: ["Playlist"],
        recursive: true,
        fields: ["ItemCounts", "PrimaryImageAspectRatio"],
      });

      return (
        response.data.Items?.map((item) => ({
          id: item.Id!,
          name: item.Name!,
          itemCount: item.ChildCount || 0,
          duration: item.RunTimeTicks
            ? Math.floor(item.RunTimeTicks / 10000000)
            : undefined,
          imageTags: item.ImageTags || undefined,
        })) || []
      );
    });
  }

  async getPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
    if (!this.api || !this.userId) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      const itemsApi = getItemsApi(this.api!);
      const response = await itemsApi.getItems({
        userId: this.userId!,
        parentId: playlistId,
        fields: ["ParentId"],
      });

      return (
        response.data.Items?.map(
          (item) =>
            ({
              id: item.Id!,
              name: item.Name!,
              type: "Audio" as const,
              albumArtist: item.AlbumArtist,
              album: item.Album,
              duration: item.RunTimeTicks
                ? Math.floor(item.RunTimeTicks / 10000000)
                : undefined,
              indexNumber: item.IndexNumber,
              parentIndexNumber: item.ParentIndexNumber,
              imageTags: item.ImageTags,
            }) as PlaylistItem,
        ) || []
      );
    });
  }

  async createPlaylist(name: string): Promise<string> {
    if (!this.api || !this.userId) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      const playlistsApi = getPlaylistsApi(this.api!);
      const response = await playlistsApi.createPlaylist({
        createPlaylistDto: {
          Name: name,
          UserId: this.userId!,
        },
      });

      return response.data.Id!;
    });
  }

  async addItemsToPlaylist(
    playlistId: string,
    itemIds: string[],
  ): Promise<void> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      console.log(
        `🎵 Adding ${itemIds.length} items to playlist ${playlistId}`,
      );
      console.log(`📝 Items to add:`, itemIds);

      // Try the SDK method first (which was working in the UI)
      try {
        const playlistsApi = getPlaylistsApi(this.api!);

        // Add items one by one since the SDK method might expect single items
        for (const itemId of itemIds) {
          await playlistsApi.addItemToPlaylist({
            playlistId,
            ids: [itemId],
          });
        }
        console.log(`✅ Successfully added items to playlist using SDK method`);
        return;
      } catch (sdkError) {
        console.log(`⚠️  SDK method failed, trying direct API call...`);
        console.error("SDK error:", sdkError);
      }

      // Fallback to direct API call with different parameter formats
      const apiCallAttempts = [
        // Try with 'ids' parameter
        {
          params: { ids: itemIds.join(",") },
          description: "ids parameter",
        },
        // Try with 'entryIds' parameter (like removeItemFromPlaylist)
        {
          params: { entryIds: itemIds.join(",") },
          description: "entryIds parameter",
        },
        // Try with individual 'id' parameters
        {
          params: Object.fromEntries(
            itemIds.map((id, index) => [`id${index}`, id]),
          ),
          description: "individual id parameters",
        },
      ];

      for (const attempt of apiCallAttempts) {
        try {
          console.log(
            `🔄 Trying direct API call with ${attempt.description}...`,
          );

          const response = await this.api!.axiosInstance.post(
            `/Playlists/${playlistId}/Items`,
            {},
            {
              baseURL: this.api!.basePath,
              headers: {
                Authorization: `MediaBrowser Token="${this.accessToken}"`,
                "X-Emby-Token": this.accessToken,
              },
              params: attempt.params,
            },
          );

          console.log(
            `✅ Successfully added items to playlist using ${attempt.description}. Status: ${response.status}`,
          );
          return;
        } catch (apiError) {
          console.log(`❌ Failed with ${attempt.description}`);
          if (
            apiError &&
            typeof apiError === "object" &&
            "response" in apiError
          ) {
            const axiosError = apiError as {
              response?: { status?: number; data?: unknown };
            };
            console.log(
              `   Status: ${axiosError.response?.status}, Data:`,
              axiosError.response?.data,
            );
          }
        }
      }

      // If all attempts failed, throw the original error
      throw new Error("All API call attempts failed");
    });
  }

  async removeItemFromPlaylist(
    playlistId: string,
    itemId: string,
  ): Promise<void> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      // Use direct API call with explicit authentication headers
      await this.api!.axiosInstance.delete(`/Playlists/${playlistId}/Items`, {
        baseURL: this.api!.basePath,
        headers: {
          Authorization: `MediaBrowser Token="${this.accessToken}"`,
          "X-Emby-Token": this.accessToken,
        },
        params: {
          entryIds: itemId,
        },
      });
    });
  }

  async getPlaylistDetails(playlistId: string): Promise<Playlist> {
    if (!this.api || !this.userId) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      const itemsApi = getItemsApi(this.api!);
      const response = await itemsApi.getItems({
        userId: this.userId!,
        ids: [playlistId],
        fields: ["ItemCounts", "PrimaryImageAspectRatio"],
      });

      const item = response.data.Items?.[0];
      if (!item) {
        throw new Error("Playlist not found");
      }

      return {
        id: item.Id!,
        name: item.Name!,
        itemCount: item.ChildCount || 0,
        duration: item.RunTimeTicks
          ? Math.floor(item.RunTimeTicks / 10000000)
          : undefined,
        imageTags: item.ImageTags || undefined,
      };
    });
  }

  async updatePlaylistName(
    playlistId: string,
    newName: string,
  ): Promise<string> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      // Delete the old playlist and create a new one with the same items
      // This is a workaround since Jellyfin doesn't have a direct rename API

      // First, get all items in the current playlist
      const items = await this.getPlaylistItems(playlistId);
      const itemIds = items.map((item) => item.id);

      // Create a new playlist with the new name
      const newPlaylistId = await this.createPlaylist(newName);

      // Add all items to the new playlist
      if (itemIds.length > 0) {
        await this.addItemsToPlaylist(newPlaylistId, itemIds);
      }

      // Delete the old playlist
      await this.deletePlaylist(playlistId);

      // Return the new playlist ID
      return newPlaylistId;
    });
  }

  async movePlaylistItem(
    playlistId: string,
    itemId: string,
    newIndex: number,
  ): Promise<void> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      // Use direct API call since moveItem might not be available in the SDK
      await this.api!.axiosInstance.post(
        `/Playlists/${playlistId}/Items/${itemId}/Move/${newIndex}`,
        {},
        {
          baseURL: this.api!.basePath,
          headers: {
            Authorization: `MediaBrowser Token="${this.accessToken}"`,
            "X-Emby-Token": this.accessToken,
          },
        },
      );
    });
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      // Use the axios instance with proper authentication headers
      await this.api!.axiosInstance.delete(`/Items/${playlistId}`, {
        baseURL: this.api!.basePath,
        headers: {
          Authorization: `MediaBrowser Token="${this.accessToken}"`,
          "X-Emby-Token": this.accessToken,
        },
      });
    });
  }

  async searchItems(
    query: string,
    limit: number = 50,
  ): Promise<SearchResult[]> {
    if (!this.api || !this.userId) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      const searchApi = getSearchApi(this.api!);

      // Use SearchHints API which is designed for this purpose
      const response = await searchApi.getSearchHints({
        userId: this.userId!,
        searchTerm: query,
        includeItemTypes: ["Audio", "MusicAlbum", "MusicArtist"],
        includeArtists: true,
        includeMedia: true,
        limit,
      });

      const allResults: SearchResult[] = [];
      const seenIds = new Set<string>();

      // Process search hints and only return Audio items
      response.data.SearchHints?.forEach((hint) => {
        if (hint.Type === "Audio" && !seenIds.has(hint.Id!)) {
          seenIds.add(hint.Id!);
          allResults.push({
            id: hint.Id!,
            name: hint.Name!,
            type: "Audio",
            albumArtist: hint.AlbumArtist || undefined,
            album: hint.Album || undefined,
            duration: hint.RunTimeTicks
              ? Math.floor(hint.RunTimeTicks / 10000000)
              : undefined,
            imageTags: hint.PrimaryImageTag
              ? { Primary: hint.PrimaryImageTag }
              : undefined,
          });
        }
      });

      // Sort results by relevance
      const queryLower = query.toLowerCase();
      return allResults.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aArtist = (a.albumArtist || "").toLowerCase();
        const bArtist = (b.albumArtist || "").toLowerCase();

        // Artist exact matches first
        if (aArtist === queryLower && bArtist !== queryLower) return -1;
        if (bArtist === queryLower && aArtist !== queryLower) return 1;

        // Artist starts with query
        if (aArtist.startsWith(queryLower) && !bArtist.startsWith(queryLower))
          return -1;
        if (bArtist.startsWith(queryLower) && !aArtist.startsWith(queryLower))
          return 1;

        // Artist contains query
        if (aArtist.includes(queryLower) && !bArtist.includes(queryLower))
          return -1;
        if (bArtist.includes(queryLower) && !aArtist.includes(queryLower))
          return 1;

        // Song name matches
        if (aName.includes(queryLower) && !bName.includes(queryLower))
          return -1;
        if (bName.includes(queryLower) && !aName.includes(queryLower)) return 1;

        // Sort by artist, then album, then song
        if (aArtist !== bArtist) return aArtist.localeCompare(bArtist);
        if (a.album !== b.album)
          return (a.album || "").localeCompare(b.album || "");
        return aName.localeCompare(bName);
      });
    });
  }

  getImageUrl(
    itemId: string,
    imageTag: string,
    type: string = "Primary",
  ): string {
    if (!this.api) {
      return "";
    }

    return `${this.api.basePath}/Items/${itemId}/Images/${type}?tag=${imageTag}&quality=90&maxWidth=300&maxHeight=300`;
  }

  async getMusicLibraryId(): Promise<string | null> {
    if (!this.api || !this.userId) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      const itemsApi = getItemsApi(this.api!);
      const response = await itemsApi.getItems({
        userId: this.userId!,
        includeItemTypes: ["CollectionFolder"],
      });

      console.log(
        `🔍 Found ${response.data.Items?.length || 0} collection folders:`,
      );
      response.data.Items?.forEach((item) => {
        console.log(
          `  • ${item.Name} (Type: ${item.CollectionType || "unknown"}, ID: ${item.Id})`,
        );
      });

      // Find the music library
      const musicLibrary = response.data.Items?.find(
        (item) => item.CollectionType === "music",
      );

      if (musicLibrary) {
        console.log(
          `🎵 Found music library: ${musicLibrary.Name} (ID: ${musicLibrary.Id})`,
        );
        return musicLibrary.Id || null;
      } else {
        console.log("❌ No music library found in collection folders");
        return null;
      }
    });
  }

  async triggerMusicLibraryScan(): Promise<string | null> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      const musicLibraryId = await this.getMusicLibraryId();
      if (!musicLibraryId) {
        console.error("❌ Music library not found");
        return null;
      }

      console.log(`🎵 Triggering scan for music library: ${musicLibraryId}`);

      // First, let's check what tasks are running before we trigger the scan
      const tasksBefore = await this.getActiveTasks();
      console.log(`📋 Active tasks before scan: ${tasksBefore.length}`);
      tasksBefore.forEach((task) => {
        console.log(`  • ${task.Name} (${task.State})`);
      });

      // Trigger a scan of just the music library
      const response = await this.api!.axiosInstance.post(
        `/Items/${musicLibraryId}/Refresh`,
        {
          Recursive: true,
          ImageRefreshMode: "Default",
          MetadataRefreshMode: "Default",
          ReplaceAllImages: false,
          ReplaceAllMetadata: false,
        },
        {
          baseURL: this.api!.basePath,
          headers: {
            Authorization: `MediaBrowser Token="${this.accessToken}"`,
            "X-Emby-Token": this.accessToken,
          },
        },
      );

      console.log("✅ Music library scan API call completed");
      console.log(`📊 Response status: ${response.status}`);
      console.log(`📊 Response data:`, response.data);

      // Wait a moment and check if any new tasks appeared
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const tasksAfter = await this.getActiveTasks();
      console.log(`📋 Active tasks after scan: ${tasksAfter.length}`);
      tasksAfter.forEach((task) => {
        console.log(
          `  • ${task.Name} (${task.State}) - ${task.CurrentProgressPercentage || 0}%`,
        );
      });

      // Check if we have any new scan tasks
      const newScanTasks = tasksAfter.filter((task) => {
        const name = task.Name?.toLowerCase() || "";
        const key = task.Key?.toLowerCase() || "";
        return (
          name.includes("scan") ||
          name.includes("library") ||
          name.includes("refresh") ||
          key.includes("refresh") ||
          key.includes("scan")
        );
      });

      if (newScanTasks.length === 0) {
        console.log(
          "⚠️  No scan tasks found after triggering scan - this might indicate the scan request didn't work",
        );
      } else {
        console.log(
          `✅ Found ${newScanTasks.length} scan task(s) after triggering scan`,
        );
      }

      return musicLibraryId;
    });
  }

  async getActiveTasks(): Promise<JellyfinTask[]> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      const response = await this.api!.axiosInstance.get("/ScheduledTasks", {
        baseURL: this.api!.basePath,
        headers: {
          Authorization: `MediaBrowser Token="${this.accessToken}"`,
          "X-Emby-Token": this.accessToken,
        },
      });

      return response.data || [];
    });
  }

  async getTaskInfo(taskId?: string): Promise<JellyfinTask | null> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      const endpoint = taskId
        ? `/ScheduledTasks/${taskId}`
        : "/ScheduledTasks/Running";
      const response = await this.api!.axiosInstance.get(endpoint, {
        baseURL: this.api!.basePath,
        headers: {
          Authorization: `MediaBrowser Token="${this.accessToken}"`,
          "X-Emby-Token": this.accessToken,
        },
      });

      return response.data;
    });
  }

  async waitForLibraryScanCompletion(
    maxWaitTimeMs: number = 120000, // 2 minutes max
    pollIntervalMs: number = 2000, // Check every 2 seconds
  ): Promise<boolean> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    const startTime = Date.now();
    let lastProgressLog = 0;

    console.log("Starting to monitor library scan progress...");

    while (Date.now() - startTime < maxWaitTimeMs) {
      try {
        const tasks = await this.getActiveTasks();

        // Look for library scan tasks - be more specific about music library scans
        const scanTasks = tasks.filter((task) => {
          const name = task.Name?.toLowerCase() || "";
          const key = task.Key?.toLowerCase() || "";
          return (
            name.includes("scan") ||
            name.includes("library") ||
            name.includes("refresh") ||
            key.includes("refresh") ||
            key.includes("scan")
          );
        });

        // Check if any scan tasks are currently running
        const runningScanTasks = scanTasks.filter(
          (task) => task.State === "Running" || task.State === "Cancelling",
        );

        if (runningScanTasks.length === 0) {
          console.log("✅ No active library scan tasks found - scan completed");
          return true;
        }

        // Log progress periodically (every 10 seconds) to avoid spam
        const now = Date.now();
        if (now - lastProgressLog > 10000) {
          console.log(
            `📊 Found ${runningScanTasks.length} active scan task(s):`,
          );

          runningScanTasks.forEach((task) => {
            const progress = task.CurrentProgressPercentage;
            const status = task.StatusMessage || "Processing...";

            if (progress !== undefined && progress !== null) {
              console.log(`  • "${task.Name}": ${progress}% - ${status}`);
            } else {
              console.log(`  • "${task.Name}": ${status}`);
            }
          });

          lastProgressLog = now;
        }

        // Wait before checking again
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      } catch (error) {
        console.error("Error checking task status:", error);
        // Continue trying in case it's a temporary error
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    console.log("⏰ Timeout waiting for library scan to complete");
    return false;
  }

  async findSongInLibrary(
    title: string,
    artist: string,
  ): Promise<SearchResult | null> {
    if (!this.api || !this.userId) {
      throw new Error("Not authenticated");
    }

    try {
      // Create an AISuggestion object to use with the existing matching logic
      const suggestion: AISuggestion = {
        title,
        artist,
        // album is optional, so we don't include it here
      };

      console.log(`🔍 Searching for: "${title}" by "${artist}"`);

      // Generate multiple search queries for better coverage (same as PlaylistSuggestions)
      const searchQueries = generateSearchQueries(suggestion);
      console.log(`📝 Generated search queries:`, searchQueries);

      let bestMatch: SearchResult | null = null;

      // Try each search query until we find a good match (same logic as PlaylistSuggestions)
      for (const query of searchQueries) {
        console.log(`🔎 Trying query: "${query}"`);
        const searchResults = await this.searchItems(query, 20); // Increased limit for better matching
        console.log(
          `📊 Query "${query}" returned ${searchResults.length} results`,
        );

        // Use the same findBestMatch logic from PlaylistSuggestions
        const match = findBestMatch(suggestion, searchResults);

        if (match) {
          console.log(
            `✅ Found match with query "${query}": "${match.name}" by "${match.albumArtist}"`,
          );
          bestMatch = match;
          break; // Found a good match, no need to try other queries
        } else {
          console.log(`❌ No good match found with query "${query}"`);
        }
      }

      if (bestMatch) {
        console.log(
          `🎵 Best match found: "${bestMatch.name}" by "${bestMatch.albumArtist}"`,
        );
        return bestMatch;
      } else {
        console.log(
          `❌ No match found for "${title}" by "${artist}" after trying all search queries`,
        );
        return null;
      }
    } catch (error) {
      console.error("Error searching for song in library:", error);
      return null;
    }
  }

  async triggerLibraryScan(): Promise<boolean> {
    // Keep the old method for backward compatibility, but also as a fallback
    const musicLibraryResult = await this.triggerMusicLibraryScan();

    if (musicLibraryResult) {
      return true;
    }

    // Fallback to full library refresh if targeted scan failed
    console.log("🔄 Falling back to full library refresh...");

    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    // Import authClient here to avoid circular dependency
    const { authClient } = await import("./auth-client");

    return authClient.withTokenRefresh(async () => {
      await this.api!.axiosInstance.post(
        "/Library/Refresh",
        {},
        {
          baseURL: this.api!.basePath,
          headers: {
            Authorization: `MediaBrowser Token="${this.accessToken}"`,
            "X-Emby-Token": this.accessToken,
          },
        },
      );

      console.log("✅ Full library refresh triggered successfully");
      return true;
    });
  }
}

export const jellyfinClient = new JellyfinClient();
