import { NextRequest, NextResponse } from "next/server";
import { jellyfinClient } from "@/lib/api/jellyfin";
import { adminAuthClient } from "@/lib/api/admin-auth";
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

    // Pre-check configuration and yt-dlp availability
    const downloadDir = process.env.MUSIC_DOWNLOAD_DIR;
    const ytDlpAvailable = downloadDir ? await verifyYtDlp() : false;

    if (!downloadDir) {
      console.log("⚠️  MUSIC_DOWNLOAD_DIR not configured - downloads will be skipped");
    }
    if (downloadDir && !ytDlpAvailable) {
      console.log("⚠️  yt-dlp not available - downloads will be skipped");
    }

    // Phase 1: Parallel library search for all suggestions using admin auth
    console.log("\n🔍 Phase 1: Searching library for existing songs...");
    const searchPromises = aiSuggestions.map(async (suggestion, index) => {
      try {
        const existingSong = await jellyfinClient.findSongInLibrary(suggestion.title, suggestion.artist);
        return {
          index,
          suggestion,
          existingSong,
          error: null,
        };
      } catch (error) {
        console.log({error});
        return {
          index,
          suggestion,
          existingSong: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    const searchResults = await Promise.all(searchPromises);

    // Separate found songs from songs that need downloading
    const foundSongs = searchResults.filter(result => result.existingSong && !result.error);
    const songsToDownload = searchResults.filter(result => !result.existingSong && !result.error);
    const searchErrors = searchResults.filter(result => result.error);

    console.log(`✅ Found ${foundSongs.length} songs in library`);
    console.log(`⬇️  Need to download ${songsToDownload.length} songs`);
    if (searchErrors.length > 0) {
      console.log(`❌ ${searchErrors.length} search errors`);
      searchErrors.forEach(result => {
        results.errors.push(`Search error for "${result.suggestion.title}": ${result.error}`);
      });
    }

    // Phase 2: Add found songs to playlist in parallel
    if (foundSongs.length > 0) {
      console.log("\n➕ Phase 2: Adding found songs to playlist...");
      const addPromises = foundSongs.map(async (result) => {
        try {
          await jellyfinClient.addItemsToPlaylist(playlistId, [result.existingSong!.id]);
          console.log(`✅ Added to playlist: "${result.existingSong!.name}"`);
          return { success: true, song: result.suggestion };
        } catch (error) {
          const errorMsg = `Failed to add "${result.suggestion.title}" to playlist: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          return { success: false, error: errorMsg };
        }
      });

      const addResults = await Promise.all(addPromises);
      results.songsFound = addResults.filter(r => r.success).length;
      results.songsAdded += results.songsFound;

      addResults.filter(r => !r.success).forEach(r => {
        results.errors.push(r.error!);
      });
    }

    // Phase 3: Download missing songs in parallel (with concurrency limit)
    if (songsToDownload.length > 0 && downloadDir && ytDlpAvailable) {
      console.log(`\n⬇️  Phase 3: Downloading ${songsToDownload.length} missing songs...`);

      // Limit concurrent downloads to avoid overwhelming the system
      const DOWNLOAD_CONCURRENCY = parseInt(process.env.DOWNLOAD_CONCURRENCY || '3', 10);
      const downloadBatches: Array<typeof songsToDownload> = [];

      for (let i = 0; i < songsToDownload.length; i += DOWNLOAD_CONCURRENCY) {
        downloadBatches.push(songsToDownload.slice(i, i + DOWNLOAD_CONCURRENCY));
      }

      const downloadedSongs: Array<{
        suggestion: typeof aiSuggestions[0];
        success: boolean;
        error?: string;
      }> = [];

      // Process downloads in batches
      for (let batchIndex = 0; batchIndex < downloadBatches.length; batchIndex++) {
        const batch = downloadBatches[batchIndex];
        console.log(`📦 Processing download batch ${batchIndex + 1}/${downloadBatches.length} (${batch.length} songs)`);

        const batchPromises = batch.map(async (result) => {
          try {
            console.log(`⬇️  Downloading: "${result.suggestion.title}" by "${result.suggestion.artist}"`);

            const downloadResult = await downloadSong({
              title: result.suggestion.title,
              artist: result.suggestion.artist,
              album: result.suggestion.album,
              downloadDir,
            });

            if (downloadResult.success) {
              console.log(`✅ Downloaded: "${result.suggestion.title}"`);
              return {
                suggestion: result.suggestion,
                success: true,
              };
            } else {
              const error = `Download failed: ${downloadResult.error}`;
              console.log(`❌ ${error}`);
              return {
                suggestion: result.suggestion,
                success: false,
                error,
              };
            }
          } catch (error) {
            const errorMsg = `Download error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(`❌ Error downloading "${result.suggestion.title}": ${errorMsg}`);
            return {
              suggestion: result.suggestion,
              success: false,
              error: errorMsg,
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        downloadedSongs.push(...batchResults);
      }

      const successfulDownloads = downloadedSongs.filter(d => d.success);
      const failedDownloads = downloadedSongs.filter(d => !d.success);

      results.songsDownloaded = successfulDownloads.length;
      console.log(`✅ Successfully downloaded ${successfulDownloads.length} songs`);

      if (failedDownloads.length > 0) {
        console.log(`❌ Failed to download ${failedDownloads.length} songs`);
        failedDownloads.forEach(d => {
          results.errors.push(`Failed to download "${d.suggestion.title}": ${d.error}`);
        });
      }

      // Phase 4: Library scan and add downloaded songs using admin auth
      if (successfulDownloads.length > 0) {
        console.log("\n🔄 Phase 4: Scanning library for downloaded songs...");

        // Trigger library scan once for all downloads using admin auth
        const musicLibraryId = await adminAuthClient.withAdminAuth(async () => {
          return await jellyfinClient.triggerMusicLibraryScan();
        });

        if (musicLibraryId) {
          const scanCompleted = await adminAuthClient.withAdminAuth(async () => {
            return await jellyfinClient.waitForLibraryScanCompletion(120000, 3000); // Longer timeout for multiple files
          });

          if (scanCompleted) {
            console.log("✅ Library scan completed, searching for downloaded songs...");

            // Search for all downloaded songs in parallel using admin auth
            const findPromises = successfulDownloads.map(async (download) => {
              try {
                const foundSong = await adminAuthClient.withAdminAuth(async () => {
                  return await jellyfinClient.findSongInLibrary(
                    download.suggestion.title,
                    download.suggestion.artist
                  );
                });
                return {
                  suggestion: download.suggestion,
                  foundSong,
                  error: null,
                };
              } catch (error) {
                return {
                  suggestion: download.suggestion,
                  foundSong: null,
                  error: error instanceof Error ? error.message : 'Unknown error',
                };
              }
            });

            const findResults = await Promise.all(findPromises);
            const foundDownloads = findResults.filter(r => r.foundSong && !r.error);
            const notFoundDownloads = findResults.filter(r => !r.foundSong);

            // Add found downloaded songs to playlist in parallel
            if (foundDownloads.length > 0) {
              const addDownloadedPromises = foundDownloads.map(async (result) => {
                try {
                  await jellyfinClient.addItemsToPlaylist(playlistId, [result.foundSong!.id]);
                  console.log(`✅ Added downloaded song to playlist: "${result.foundSong!.name}"`);
                  return { success: true };
                } catch (error) {
                  const errorMsg = `Failed to add downloaded "${result.suggestion.title}" to playlist: ${error instanceof Error ? error.message : 'Unknown error'}`;
                  console.error(`❌ ${errorMsg}`);
                  return { success: false, error: errorMsg };
                }
              });

              const addDownloadedResults = await Promise.all(addDownloadedPromises);
              const successfulAdds = addDownloadedResults.filter(r => r.success).length;
              results.songsAdded += successfulAdds;

              addDownloadedResults.filter(r => !r.success).forEach(r => {
                results.errors.push(r.error!);
              });
            }

            // Report songs that couldn't be found after download
            notFoundDownloads.forEach(result => {
              const errorMsg = `Downloaded "${result.suggestion.title}" but couldn't find it in library after scan`;
              console.log(`⚠️  ${errorMsg}`);
              results.errors.push(errorMsg);
            });

          } else {
            console.log("⚠️  Library scan timeout");
            results.errors.push("Library scan timed out - downloaded songs may not be available immediately");
          }
        } else {
          console.log("❌ Failed to trigger library scan");
          results.errors.push("Failed to trigger library scan for downloaded songs");
        }
      }
    } else if (songsToDownload.length > 0) {
      // Can't download - add errors for each song
      songsToDownload.forEach(result => {
        const reason = !downloadDir ? "download directory not configured" : "yt-dlp not available";
        results.errors.push(`Cannot download "${result.suggestion.title}" - ${reason}`);
      });
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
