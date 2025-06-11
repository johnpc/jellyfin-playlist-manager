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
        console.log("🔑 Found auth token, attempting library scan...");
        console.log(`🔑 Auth token length: ${authToken.value.length}`);

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

        console.log(`🌐 Using server URL: ${serverUrl}`);

        // Initialize Jellyfin client with stored auth
        const config = {
          serverUrl,
          username: process.env.JELLYFIN_ADMIN_USER ?? "",
          password: process.env.JELLYFIN_ADMIN_PASSWORD ?? "",
        }; // Username/password not needed for API calls
        jellyfinClient.initializeFromStorage(config, authToken.value, ""); // userId not critical for library scan
        console.log("🔧 Initialized Jellyfin client...");
        
        const isAuthenticated = await jellyfinClient.isAuthenticated();
        console.log(`🔐 Authentication status: ${isAuthenticated}`);

        const musicLibraryId = await jellyfinClient.triggerMusicLibraryScan();
        scanTriggered = musicLibraryId !== null;

        if (scanTriggered) {
          console.log("🎵 Music library scan triggered successfully");
        } else {
          console.log("❌ Failed to trigger music library scan");
        }

        // If we have a playlist ID, wait for the scan to complete and add the song
        if (playlistId && scanTriggered) {
          console.log("⏳ Waiting for music library scan to complete...");
          const scanCompleted =
            await jellyfinClient.waitForLibraryScanCompletion(
              120000, // 2 minutes max
              3000, // Check every 3 seconds
            );

          if (!scanCompleted) {
            console.log(
              "⚠️  Library scan did not complete within timeout, proceeding anyway...",
            );
          } else {
            console.log("✅ Library scan completed successfully");
          }

          console.log(`Waiting 30 seconds for things to settle...`)
          const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
          await sleep(30000);

          try {
            console.log(
              `🔍 Searching for "${title}" by "${artist}" in library...`,
            );

            // Search for the song in the library using the new method
            const songToAdd = await jellyfinClient.findSongInLibrary(
              title,
              artist,
            );

            if (songToAdd) {
              console.log(
                `✅ Found song in library: ${songToAdd.name} by ${songToAdd.albumArtist || 'Unknown Artist'}`,
              );

              try {
                // Add the song to the playlist
                await jellyfinClient.addItemsToPlaylist(playlistId, [
                  songToAdd.id,
                ]);
                addedToPlaylist = true;
                console.log(
                  `🎵 Successfully added song to playlist ${playlistId}`,
                );
              } catch (playlistAddError) {
                if (playlistAddError instanceof Error && playlistAddError.message.includes("Permission denied")) {
                  // Handle authentication error
                  playlistError = "Authentication error: Please try logging in again";
                  console.log("🔒 Authentication error when adding to playlist");
                } else {
                  playlistError = playlistAddError instanceof Error ? playlistAddError.message : "Unknown error adding to playlist";
                  console.error("Error adding song to playlist:", playlistAddError);
                }
              }
            } else {
              playlistError = "Song not found in library after scan";
              console.log(
                "❌ Song not found in library after waiting for scan",
              );
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
      details: {
        downloadSuccess: true,
        scanTriggered,
        scanCompleted: scanTriggered && !scanError,
        playlistAddition: addedToPlaylist
          ? "success"
          : playlistError || "not attempted",
      },
    });
  } catch (error) {
    console.error("Error in download API:", error);
    return NextResponse.json(
      { error: "Failed to download song" },
      { status: 500 },
    );
  }
}
