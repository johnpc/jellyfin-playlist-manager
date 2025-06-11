import { NextRequest, NextResponse } from "next/server";
import { downloadSong, verifyYtDlp } from "@/lib/api/downloader";
import { jellyfinClient } from "@/lib/api/jellyfin";

export async function POST(request: NextRequest) {
  try {
    const { title, artist, album, playlistId } = await request.json();

    if (!title || !artist) {
      return NextResponse.json(
        { error: "Title and artist are required" },
        { status: 400 },
      );
    }

    // Get download directory from environment variable
    const downloadDir = process.env.MUSIC_DOWNLOAD_DIR;
    if (!downloadDir) {
      return NextResponse.json(
        { error: "MUSIC_DOWNLOAD_DIR environment variable not configured" },
        { status: 500 },
      );
    }

    // Verify yt-dlp is available
    const ytDlpAvailable = await verifyYtDlp();
    if (!ytDlpAvailable) {
      return NextResponse.json(
        { error: "yt-dlp is not available or not working properly" },
        { status: 500 },
      );
    }

    console.log(`Starting download for: "${title}" by "${artist}"`);

    // Download the song
    const result = await downloadSong({
      title,
      artist,
      album,
      downloadDir,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Try to trigger library scan with authentication from cookies
    let scanTriggered = false;
    let scanError = null;
    let addedToPlaylist = false;
    let playlistError = null;

    try {
      // Get auth token from cookie (set by middleware)
      const authToken = request.cookies.get("jellyfin-auth-token");

      if (authToken?.value) {
        console.log("Found auth token, attempting library scan...");

        // Try to extract server URL from environment or referer
        let serverUrl =
          process.env.JELLYFIN_SERVER_URL || "http://localhost:8096";

        if (!process.env.JELLYFIN_SERVER_URL) {
          // Fallback: try to extract from referer
          const referer = request.headers.get("referer");
          if (referer) {
            const url = new URL(referer);
            // Assume Jellyfin is on the same host but port 8096
            serverUrl = `${url.protocol}//${url.hostname}:8096`;
          }
        }

        // Initialize Jellyfin client with stored auth
        const config = {
          serverUrl,
          username: process.env.JELLYFIN_ADMIN_USER ?? "",
          password: process.env.JELLYFIN_ADMIN_PASSWORD ?? "",
        }; // Username/password not needed for API calls
        jellyfinClient.initializeFromStorage(config, authToken.value, ""); // userId not critical for library scan
        console.log("Initialized Client...", { jellyfinClient });
        const isAuthenticated = await jellyfinClient.isAuthenticated();
        console.log({ isAuthenticated });

        scanTriggered = await jellyfinClient.triggerLibraryScan();
        console.log("Library scan triggered successfully");

        // If we have a playlist ID, wait for the scan to complete and add the song
        if (playlistId && scanTriggered) {
          console.log(`Waiting 30 seconds for library scan to complete...`);
          await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds

          try {
            console.log(
              `Searching for "${title}" by "${artist}" in library...`,
            );

            // Search for the song in the library
            const searchResults = await jellyfinClient.searchItems(
              `${title} ${artist}`,
            );

            if (searchResults && searchResults.length > 0) {
              // Find the best match (exact title and artist match preferred)
              const exactMatch = searchResults.find(
                (item) =>
                  item.name?.toLowerCase().includes(title.toLowerCase()) &&
                  item.albumArtist
                    ?.toLowerCase()
                    .includes(artist.toLowerCase()),
              );

              const songToAdd = exactMatch || searchResults[0];

              console.log(
                `Found song in library: ${songToAdd.name} by ${songToAdd.albumArtist}`,
              );

              // Add the song to the playlist
              await jellyfinClient.addItemsToPlaylist(playlistId, [
                songToAdd.id,
              ]);
              addedToPlaylist = true;
              console.log(`Successfully added song to playlist ${playlistId}`);
            } else {
              playlistError = "Song not found in library after scan";
              console.log("Song not found in library after waiting for scan");
            }
          } catch (error) {
            playlistError =
              error instanceof Error
                ? error.message
                : "Unknown error adding to playlist";
            console.error("Error adding song to playlist:", error);
          }
        }
      } else {
        console.log(
          "No authentication token found - user will need to manually refresh library",
        );
      }
    } catch (error) {
      scanError = error instanceof Error ? error.message : "Unknown error";
      console.log("Library scan failed:", scanError);
      // Don't fail the download because of this
    }

    return NextResponse.json({
      success: true,
      message: `Successfully downloaded "${title}" by "${artist}"`,
      filePath: result.filePath,
      libraryScanTriggered: scanTriggered,
      libraryScanError: scanError,
      addedToPlaylist,
      playlistError,
    });
  } catch (error) {
    console.error("Error in download API:", error);
    return NextResponse.json(
      { error: "Failed to download song" },
      { status: 500 },
    );
  }
}
