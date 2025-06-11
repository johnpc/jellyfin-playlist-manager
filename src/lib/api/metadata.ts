import NodeID3 from "node-id3";
import { MusicBrainzApi } from "musicbrainz-api";
import { promises as fs } from "fs";

// Initialize MusicBrainz API client
const mbApi = new MusicBrainzApi({
  appName: "jellyfin-playlist-manager",
  appVersion: "1.0.0",
  appContactInfo: "https://github.com/user/jellyfin-playlist-manager",
});

export interface SongMetadata {
  title: string;
  artist: string;
  album?: string;
  albumArtist?: string;
  year?: number;
  genre?: string;
  trackNumber?: number;
  totalTracks?: number;
  discNumber?: number;
  duration?: number;
  musicBrainzTrackId?: string;
  musicBrainzArtistId?: string;
  musicBrainzAlbumId?: string;
}

// Fetch metadata from MusicBrainz
export async function fetchMetadataFromMusicBrainz(
  title: string,
  artist: string,
  album?: string,
): Promise<SongMetadata | null> {
  try {
    console.log(`Fetching metadata for: "${title}" by "${artist}"`);

    // Search for recordings (tracks) matching our criteria
    const searchQuery = `recording:"${title}" AND artist:"${artist}"${album ? ` AND release:"${album}"` : ""}`;

    const searchResults = await mbApi.search("recording", {
      query: searchQuery,
      limit: 5,
    });

    if (!searchResults.recordings || searchResults.recordings.length === 0) {
      console.log("No MusicBrainz results found, trying broader search...");

      // Try a broader search without quotes
      const broadSearchQuery = `${title} ${artist}${album ? ` ${album}` : ""}`;
      const broadResults = await mbApi.search("recording", {
        query: broadSearchQuery,
        limit: 5,
      });

      if (!broadResults.recordings || broadResults.recordings.length === 0) {
        return null;
      }

      searchResults.recordings = broadResults.recordings;
    }

    // Find the best match
    const bestMatch = searchResults.recordings[0];

    if (!bestMatch) {
      return null;
    }

    // Extract metadata from the best match
    const metadata: SongMetadata = {
      title: bestMatch.title || title,
      artist: bestMatch["artist-credit"]?.[0]?.name || artist,
      musicBrainzTrackId: bestMatch.id,
    };

    // Get additional info from releases if available
    if (bestMatch.releases && bestMatch.releases.length > 0) {
      const release = bestMatch.releases[0];
      metadata.album = release.title;
      metadata.year = release.date
        ? parseInt(release.date.split("-")[0])
        : undefined;
      metadata.albumArtist = release["artist-credit"]?.[0]?.name;
      metadata.musicBrainzAlbumId = release.id;

      // Get track number if available
      if (
        bestMatch.releases[0].media &&
        bestMatch.releases[0].media[0].tracks
      ) {
        const trackIndex = bestMatch.releases[0].media[0].tracks.findIndex(
          (track: { id: string }) => track.id === bestMatch.id,
        );
        if (trackIndex >= 0) {
          metadata.trackNumber = trackIndex + 1;
          metadata.totalTracks = bestMatch.releases[0].media[0]["track-count"];
        }
      }
    }

    // Get artist MusicBrainz ID
    if (bestMatch["artist-credit"]?.[0]?.artist?.id) {
      metadata.musicBrainzArtistId = bestMatch["artist-credit"][0].artist.id;
    }

    console.log("Found metadata:", metadata);
    return metadata;
  } catch (error) {
    console.error("Error fetching metadata from MusicBrainz:", error);
    return null;
  }
}

// Inject metadata into MP3 file
export async function injectMetadataIntoMp3(
  filePath: string,
  metadata: SongMetadata,
): Promise<boolean> {
  try {
    console.log(`Injecting metadata into: ${filePath}`);

    // Verify file exists
    await fs.access(filePath);

    // Prepare ID3 tags
    const tags: Record<string, string | undefined> = {
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      albumartist: metadata.albumArtist || metadata.artist,
      year: metadata.year?.toString(),
      genre: metadata.genre,
      trackNumber: metadata.trackNumber?.toString(),
      partOfSet: metadata.discNumber?.toString(),
    };

    // Add MusicBrainz IDs as custom tags
    if (metadata.musicBrainzTrackId) {
      tags.MUSICBRAINZ_TRACKID = metadata.musicBrainzTrackId;
    }
    if (metadata.musicBrainzArtistId) {
      tags.MUSICBRAINZ_ARTISTID = metadata.musicBrainzArtistId;
    }
    if (metadata.musicBrainzAlbumId) {
      tags.MUSICBRAINZ_ALBUMID = metadata.musicBrainzAlbumId;
    }

    // Remove undefined values
    Object.keys(tags).forEach((key) => {
      if (tags[key] === undefined || tags[key] === "undefined") {
        delete tags[key];
      }
    });

    console.log("Writing tags:", tags);

    // Write tags to file
    const success = NodeID3.write(tags, filePath);

    if (success) {
      console.log("Successfully wrote metadata to file");
      return true;
    } else {
      console.error("Failed to write metadata to file");
      return false;
    }
  } catch (error) {
    console.error("Error injecting metadata:", error);
    return false;
  }
}

// Main function to fetch and inject metadata
export async function enhanceAudioFileWithMetadata(
  filePath: string,
  title: string,
  artist: string,
  album?: string,
): Promise<boolean> {
  try {
    // First, try to fetch metadata from MusicBrainz
    const metadata = await fetchMetadataFromMusicBrainz(title, artist, album);

    if (!metadata) {
      console.log("No metadata found from MusicBrainz, using basic info");
      // Use basic metadata if MusicBrainz doesn't have info
      const basicMetadata: SongMetadata = {
        title,
        artist,
        album,
        albumArtist: artist,
      };
      return await injectMetadataIntoMp3(filePath, basicMetadata);
    }

    // Inject the fetched metadata
    return await injectMetadataIntoMp3(filePath, metadata);
  } catch (error) {
    console.error("Error enhancing audio file with metadata:", error);
    return false;
  }
}
