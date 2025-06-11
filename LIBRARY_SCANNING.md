# Library Scanning Implementation

This document describes how the Jellyfin Playlist Manager handles library scanning after downloading new music files.

## Overview

When a song is downloaded and needs to be added to a playlist, the application:

1. **Downloads the song** using yt-dlp with proper metadata
2. **Triggers a targeted music library scan** (not a full library refresh)
3. **Monitors the scan progress** in real-time using Jellyfin's task API
4. **Waits for completion** before attempting to add the song to the playlist
5. **Adds the song to the playlist** once it's available in the library

## Key Improvements

### Targeted Scanning
- **Before**: Used `/Library/Refresh` which scans ALL libraries (music, movies, TV shows, etc.)
- **After**: Uses `/Items/{musicLibraryId}/Refresh` which only scans the music library

### Real-time Progress Tracking
- **Before**: Fixed 30-second wait regardless of actual scan progress
- **After**: Monitors actual task progress and completes as soon as the scan finishes

### Better Logging
- **Before**: Minimal logging with basic messages
- **After**: Detailed progress logging with emojis and status updates

## API Methods

### `getMusicLibraryId()`
Finds the ID of the music library collection folder.

### `triggerMusicLibraryScan()`
Triggers a scan of only the music library, returning the library ID if successful.

### `waitForLibraryScanCompletion(maxWaitTimeMs, pollIntervalMs)`
Monitors active tasks and waits for library scan tasks to complete:
- Polls every `pollIntervalMs` (default: 2 seconds)
- Times out after `maxWaitTimeMs` (default: 2 minutes)
- Logs progress updates every 10 seconds to avoid spam
- Returns `true` when scan completes, `false` on timeout

### `getActiveTasks()`
Retrieves all currently active scheduled tasks from Jellyfin.

### `findSongInLibrary(title, artist)`
Efficiently searches for a specific song in the library after scanning.

## Configuration

The scan monitoring can be configured in the download API:

```javascript
const scanCompleted = await jellyfinClient.waitForLibraryScanCompletion(
  120000, // 2 minutes max wait time
  3000    // Check every 3 seconds
);
```

## Error Handling

- If the music library cannot be found, falls back to full library scan
- If task monitoring fails, continues with timeout-based approach
- If scan doesn't complete within timeout, proceeds anyway to avoid blocking
- All errors are logged but don't prevent the download from succeeding

## Testing

Use the included test script to verify the implementation:

```bash
# Set environment variables
export JELLYFIN_SERVER_URL="http://localhost:8096"
export JELLYFIN_ADMIN_USER="your_username"
export JELLYFIN_ADMIN_PASSWORD="your_password"

# Run the test
node test-scan.js
```

## Benefits

1. **Faster**: Only scans music library instead of all libraries
2. **More reliable**: Waits for actual completion instead of guessing
3. **Better UX**: Provides real-time progress feedback
4. **More efficient**: Doesn't waste time waiting when scan completes early
5. **Robust**: Handles timeouts and errors gracefully

## Backward Compatibility

The original `triggerLibraryScan()` method is maintained for backward compatibility and now uses the new targeted scanning internally.
