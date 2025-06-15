import { NextRequest, NextResponse } from "next/server";
import { jellyfinClient } from "@/lib/api/jellyfin";
import { downloadSong, verifyYtDlp } from "@/lib/api/downloader";
import { generatePlaylistSuggestions } from "@/lib/api/bedrock";

export async function POST(request: NextRequest) {
  try {
    const { songPrompt } = await request.json();

    if (!songPrompt?.trim()) {
      return NextResponse.json(
        { error: "Song prompt is required" },
        { status: 400 },
      );
    }

    console.log(`🎵 Creating radio playlist for: "${songPrompt}"`);

    // Get auth details from request headers
    const authHeader = request.headers.get("x-jellyfin-auth");
    const serverUrlHeader = request.headers.get("x-jellyfin-server");
    const authToken = authHeader || request.cookies.get("jellyfin-auth-token")?.value;
    
    if (!authToken) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // Initialize Jellyfin client
    let serverUrl = serverUrlHeader || 
      process.env.JELLYFIN_SERVER_URL || 
      "http://localhost:8096";

    if (!serverUrlHeader && !process.env.JELLYFIN_SERVER_URL) {
      const referer = request.headers.get("referer");
      if (referer) {
        const url = new URL(referer);
        serverUrl = `${url.protocol}//${url.hostname}:8096`;
      }
    }

    const config = {
      serverUrl,
      username: process.env.JELLYFIN_ADMIN_USER ?? "",
      password: process.env.JELLYFIN_ADMIN_PASSWORD ?? "",
    };
    jellyfinClient.initializeFromStorage(config, authToken, "");

    const isAuthenticated = await jellyfinClient.isAuthenticated();
    if (!isAuthenticated) {
      return NextResponse.json(
        { error: "Invalid authentication" },
        { status: 401 },
      );
    }

    // Generate AI suggestions for radio playlist
    console.log("🤖 Generating AI suggestions for radio playlist...");
    
    // Call the function directly instead of making HTTP request to avoid SSL issues
    const aiSuggestions = await generatePlaylistSuggestions(
      [{ name: songPrompt, albumArtist: "", album: "" }],
      true, // radioMode
      25   // count
    );

    console.log(`🎵 Generated ${aiSuggestions.length} AI suggestions`);

    // Create the radio playlist
    const playlistName = `${songPrompt} Radio [jpc]`;
    console.log(`📝 Creating playlist: "${playlistName}"`);
    const playlistId = await jellyfinClient.createPlaylist(playlistName);

    const results = {
      playlistId,
      playlistName,
      totalSuggestions: aiSuggestions.length,
      songsFound: 0,
      songsDownloaded: 0,
      songsAdded: 0,
      errors: [] as string[],
    };

    // Process each suggestion
    for (let i = 0; i < aiSuggestions.length; i++) {
      const suggestion = aiSuggestions[i];
      console.log(`\n🔍 Processing ${i + 1}/${aiSuggestions.length}: "${suggestion.title}" by "${suggestion.artist}"`);

      try {
        // Check if song exists in library
        const existingSong = await jellyfinClient.findSongInLibrary(suggestion.title, suggestion.artist);
        
        if (existingSong) {
          // Song exists, add it to playlist
          console.log(`✅ Found in library: "${existingSong.name}"`);
          await jellyfinClient.addItemsToPlaylist(playlistId, [existingSong.id]);
          results.songsFound++;
          results.songsAdded++;
        } else {
          // Song doesn't exist, try to download it
          console.log(`⬇️  Downloading: "${suggestion.title}" by "${suggestion.artist}"`);
          
          const downloadDir = process.env.MUSIC_DOWNLOAD_DIR;
          if (!downloadDir) {
            console.log("❌ MUSIC_DOWNLOAD_DIR not configured, skipping download");
            results.errors.push(`Cannot download "${suggestion.title}" - download directory not configured`);
            continue;
          }

          // Verify yt-dlp is available
          const ytDlpAvailable = await verifyYtDlp();
          if (!ytDlpAvailable) {
            console.log("❌ yt-dlp not available, skipping download");
            results.errors.push(`Cannot download "${suggestion.title}" - yt-dlp not available`);
            continue;
          }

          // Download the song
          const downloadResult = await downloadSong({
            title: suggestion.title,
            artist: suggestion.artist,
            album: suggestion.album,
            downloadDir,
          });

          if (downloadResult.success) {
            console.log(`✅ Downloaded: "${suggestion.title}"`);
            results.songsDownloaded++;

            // Trigger library scan and wait for completion
            console.log("🔄 Triggering library scan...");
            const musicLibraryId = await jellyfinClient.triggerMusicLibraryScan();
            if (musicLibraryId) {
              const scanCompleted = await jellyfinClient.waitForLibraryScanCompletion(60000, 2000);
              if (scanCompleted) {
                console.log("✅ Library scan completed");
                
                // Try to find the downloaded song
                const downloadedSong = await jellyfinClient.findSongInLibrary(suggestion.title, suggestion.artist);
                if (downloadedSong) {
                  await jellyfinClient.addItemsToPlaylist(playlistId, [downloadedSong.id]);
                  results.songsAdded++;
                  console.log(`✅ Added downloaded song to playlist`);
                } else {
                  console.log("⚠️  Downloaded song not found in library after scan");
                  results.errors.push(`Downloaded "${suggestion.title}" but couldn't find it in library`);
                }
              } else {
                console.log("⚠️  Library scan timeout");
                results.errors.push(`Downloaded "${suggestion.title}" but library scan timed out`);
              }
            }
          } else {
            console.log(`❌ Download failed: ${downloadResult.error}`);
            results.errors.push(`Failed to download "${suggestion.title}": ${downloadResult.error}`);
          }
        }
      } catch (error) {
        console.error(`Error processing "${suggestion.title}":`, error);
        results.errors.push(`Error processing "${suggestion.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`\n🎉 Radio playlist creation completed!`);
    console.log(`📊 Results: ${results.songsAdded}/${results.totalSuggestions} songs added`);
    console.log(`📊 Found: ${results.songsFound}, Downloaded: ${results.songsDownloaded}`);

    return NextResponse.json({
      success: true,
      message: `Radio playlist "${playlistName}" created successfully`,
      ...results,
    });

  } catch (error) {
    console.error("Error creating radio playlist:", error);
    return NextResponse.json(
      { error: "Failed to create radio playlist" },
      { status: 500 },
    );
  }
}
