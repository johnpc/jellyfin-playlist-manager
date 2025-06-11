import { Jellyfin, Api } from "@jellyfin/sdk";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";
import { getPlaylistsApi } from "@jellyfin/sdk/lib/utils/api/playlists-api";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api/items-api";
import { getSearchApi } from "@jellyfin/sdk/lib/utils/api/search-api";
import type {
  JellyfinConfig,
  JellyfinUser,
  Playlist,
  PlaylistItem,
  SearchResult,
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

      return { user, accessToken: this.api.accessToken };
    } catch (error) {
      console.error("Authentication error:", error);
      throw new Error("Failed to authenticate with Jellyfin server");
    }
  }

  initializeFromStorage(config: JellyfinConfig, accessToken: string, userId: string) {
    this.api = this.jellyfin.createApi(config.serverUrl);
    this.api.accessToken = accessToken;
    this.accessToken = accessToken;
    this.userId = userId;
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      if (!this.api) {
        return false;
      }

      const userApi = getUserApi(this.api);
      const response = await userApi.getCurrentUser();

      const user: JellyfinUser = {
        id: response.data.Id!,
        name: response.data.Name!,
        serverId: response.data.ServerId!,
      };

      console.log({loggedIn: true, user});
      return true;
    } catch (error) {
      console.error("Authentication error:", error);
      return false;
    }
  }

  async getPlaylists(): Promise<Playlist[]> {
    if (!this.api || !this.userId) {
      throw new Error("Not authenticated");
    }

    try {
      const itemsApi = getItemsApi(this.api);
      const response = await itemsApi.getItems({
        userId: this.userId,
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
    } catch (error) {
      console.error("Error fetching playlists:", error);
      throw new Error("Failed to fetch playlists");
    }
  }

  async getPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
    if (!this.api || !this.userId) {
      throw new Error("Not authenticated");
    }

    try {
      const itemsApi = getItemsApi(this.api);
      const response = await itemsApi.getItems({
        userId: this.userId,
        parentId: playlistId,
        fields: ["ParentId"],
      });

      return (
        response.data.Items?.map((item) => ({
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
        } as PlaylistItem)) || []
      );
    } catch (error) {
      console.error("Error fetching playlist items:", error);
      throw new Error("Failed to fetch playlist items");
    }
  }

  async createPlaylist(name: string): Promise<string> {
    if (!this.api || !this.userId) {
      throw new Error("Not authenticated");
    }

    try {
      const playlistsApi = getPlaylistsApi(this.api);
      const response = await playlistsApi.createPlaylist({
        createPlaylistDto: {
          Name: name,
          UserId: this.userId,
        },
      });

      return response.data.Id!;
    } catch (error) {
      console.error("Error creating playlist:", error);
      throw new Error("Failed to create playlist");
    }
  }

  async addItemsToPlaylist(
    playlistId: string,
    itemIds: string[],
  ): Promise<void> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    try {
      const playlistsApi = getPlaylistsApi(this.api);

      // Add items one by one since the SDK method might expect single items
      for (const itemId of itemIds) {
        await playlistsApi.addItemToPlaylist({
          playlistId,
          ids: [itemId],
        });
      }
    } catch (error) {
      console.error("Error adding items to playlist:", error);
      throw new Error("Failed to add items to playlist");
    }
  }

  async removeItemFromPlaylist(
    playlistId: string,
    itemId: string,
  ): Promise<void> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    try {
      // Use direct API call with explicit authentication headers
      await this.api.axiosInstance.delete(
        `/Playlists/${playlistId}/Items`,
        {
          baseURL: this.api.basePath,
          headers: {
            'Authorization': `MediaBrowser Token="${this.accessToken}"`,
            'X-Emby-Token': this.accessToken,
          },
          params: {
            entryIds: itemId,
          },
        }
      );
    } catch (error) {
      console.error("Error removing item from playlist:", error);
      throw new Error("Failed to remove item from playlist");
    }
  }

  async getPlaylistDetails(playlistId: string): Promise<Playlist> {
    if (!this.api || !this.userId) {
      throw new Error("Not authenticated");
    }

    try {
      const itemsApi = getItemsApi(this.api);
      const response = await itemsApi.getItems({
        userId: this.userId,
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
    } catch (error) {
      console.error("Error fetching playlist details:", error);
      throw new Error("Failed to fetch playlist details");
    }
  }

  async updatePlaylistName(
    playlistId: string,
    newName: string,
  ): Promise<string> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    try {
      // Delete the old playlist and create a new one with the same items
      // This is a workaround since Jellyfin doesn't have a direct rename API

      // First, get all items in the current playlist
      const items = await this.getPlaylistItems(playlistId);
      const itemIds = items.map(item => item.id);

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
    } catch (error) {
      console.error("Error updating playlist name:", error);
      throw new Error("Failed to update playlist name");
    }
  }

  async movePlaylistItem(
    playlistId: string,
    itemId: string,
    newIndex: number,
  ): Promise<void> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    try {
      // Use direct API call since moveItem might not be available in the SDK
      await this.api.axiosInstance.post(
        `/Playlists/${playlistId}/Items/${itemId}/Move/${newIndex}`,
        {},
        {
          baseURL: this.api.basePath,
          headers: {
            'Authorization': `MediaBrowser Token="${this.accessToken}"`,
            'X-Emby-Token': this.accessToken,
          },
        }
      );
    } catch (error) {
      console.error("Error moving playlist item:", error);
      throw new Error("Failed to move playlist item");
    }
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    try {
      // Use the axios instance with proper authentication headers
      await this.api.axiosInstance.delete(`/Items/${playlistId}`, {
        baseURL: this.api.basePath,
        headers: {
          'Authorization': `MediaBrowser Token="${this.accessToken}"`,
          'X-Emby-Token': this.accessToken,
        },
      });
    } catch (error) {
      console.error("Error deleting playlist:", error);
      throw new Error("Failed to delete playlist");
    }
  }

  async searchItems(
    query: string,
    limit: number = 50,
  ): Promise<SearchResult[]> {
    if (!this.api || !this.userId) {
      throw new Error("Not authenticated");
    }

    try {
      const searchApi = getSearchApi(this.api);

      // Use SearchHints API which is designed for this purpose
      const response = await searchApi.getSearchHints({
        userId: this.userId,
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
        if (aArtist.startsWith(queryLower) && !bArtist.startsWith(queryLower)) return -1;
        if (bArtist.startsWith(queryLower) && !aArtist.startsWith(queryLower)) return 1;

        // Artist contains query
        if (aArtist.includes(queryLower) && !bArtist.includes(queryLower)) return -1;
        if (bArtist.includes(queryLower) && !aArtist.includes(queryLower)) return 1;

        // Song name matches
        if (aName.includes(queryLower) && !bName.includes(queryLower)) return -1;
        if (bName.includes(queryLower) && !aName.includes(queryLower)) return 1;

        // Sort by artist, then album, then song
        if (aArtist !== bArtist) return aArtist.localeCompare(bArtist);
        if (a.album !== b.album) return (a.album || "").localeCompare(b.album || "");
        return aName.localeCompare(bName);
      });
    } catch (error) {
      console.error("Error searching items:", error);
      throw new Error("Failed to search items");
    }
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

  async triggerLibraryScan(): Promise<boolean> {
    if (!this.api || !this.accessToken) {
      throw new Error("Not authenticated");
    }

    try {
      // Trigger a library scan using the Jellyfin API
      await this.api.axiosInstance.post(
        '/Library/Refresh',
        {},
        {
          baseURL: this.api.basePath,
          headers: {
            'Authorization': `MediaBrowser Token="${this.accessToken}"`,
            'X-Emby-Token': this.accessToken,
          },
        }
      );

      console.log('Library scan triggered successfully');
      return true;
    } catch (error) {
      console.error('Failed to trigger library scan:', error);
      return false;
    }
  }
}

export const jellyfinClient = new JellyfinClient();
