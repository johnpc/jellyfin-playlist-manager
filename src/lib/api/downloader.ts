import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { jellyfinClient } from './jellyfin';
import { enhanceAudioFileWithMetadata } from './metadata';

// Configure yt-dlp binary path - use environment variable or fallback to Homebrew path
const YT_DLP_PATH = process.env.YT_DLP_PATH || '/opt/homebrew/bin/yt-dlp';
const COOKIES_PATH = process.env.COOKIES_PATH || path.join(process.cwd(), 'cookies.txt');

export interface DownloadOptions {
  title: string;
  artist: string;
  album?: string;
  downloadDir: string;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

// Helper function to execute yt-dlp commands
async function executeYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(YT_DLP_PATH, args);
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
      }
    });

    process.on('error', (error) => {
      reject(error);
    });
  });
}

// Verify yt-dlp is available and working
export async function verifyYtDlp(): Promise<boolean> {
  try {
    console.log(`Verifying yt-dlp at path: ${YT_DLP_PATH}`);
    const version = await executeYtDlp(['--version']);
    console.log(`yt-dlp version: ${version}`);
    return true;
  } catch (error) {
    console.error('yt-dlp verification failed:', error);
    console.error(`Attempted to use yt-dlp at: ${YT_DLP_PATH}`);
    return false;
  }
}

// Search for a song on YouTube and return the best match URL
async function searchYouTube(query: string): Promise<string | null> {
  try {
    console.log(`Searching YouTube for: ${query}`);

    const args = [
      'ytsearch5:' + query,
      '--dump-single-json',
      '--no-warnings',
      '--flat-playlist'
    ];

    // Add cookies if the file exists
    try {
      await fs.access(COOKIES_PATH);
      const cookieStats = await fs.stat(COOKIES_PATH);
      console.log(`Found cookies file: ${COOKIES_PATH} (${cookieStats.size} bytes, modified: ${cookieStats.mtime})`);

      // Read first few lines to check format
      const cookieContent = await fs.readFile(COOKIES_PATH, 'utf-8');
      const lines = cookieContent.split('\n').slice(0, 5);
      console.log('Cookie file preview (first 5 lines):');
      lines.forEach((line, i) => {
        if (line.trim()) {
          console.log(`  ${i + 1}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
        }
      });

      args.push('--cookies', COOKIES_PATH);
      console.log(`Using cookies from: ${COOKIES_PATH}`);
    } catch {
      console.log('No cookies file found, proceeding without cookies');
    }

    const searchResults = await executeYtDlp(args);

    const data = JSON.parse(searchResults) as { entries?: Array<{ id: string }> };

    if (!data || !data.entries || data.entries.length === 0) {
      return null;
    }

    // Return the first result's URL
    const firstResult = data.entries[0];
    return `https://www.youtube.com/watch?v=${firstResult.id}`;
  } catch (error) {
    console.error('YouTube search failed:', error);
    return null;
  }
}

// Download audio from YouTube
export async function downloadSong(options: DownloadOptions): Promise<DownloadResult> {
  const { title, artist, album, downloadDir } = options;

  try {
    // Validate download directory exists
    try {
      await fs.access(downloadDir);
    } catch {
      return {
        success: false,
        error: `Download directory does not exist: ${downloadDir}`
      };
    }

    // Create search query
    const searchQuery = `${title} ${artist}${album ? ` ${album}` : ''} audio`;
    console.log(`Searching for: ${searchQuery}`);

    // Search for the song on YouTube
    const videoUrl = await searchYouTube(searchQuery);
    if (!videoUrl) {
      return {
        success: false,
        error: 'No matching videos found on YouTube'
      };
    }

    console.log(`Found video: ${videoUrl}`);

    // Create safe filename that's Jellyfin-friendly
    const safeTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();
    const safeArtist = artist.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();

    // Use format: Artist - Title (more standard for music libraries)
    const filename = `${safeArtist} - ${safeTitle}`;

    // Create artist directory if it doesn't exist (better organization)
    const artistDir = path.join(downloadDir, safeArtist);
    try {
      await fs.mkdir(artistDir, { recursive: true });
    } catch {
      console.warn('Could not create artist directory, using root download dir');
    }

    const finalDownloadDir = await fs.access(artistDir).then(() => artistDir).catch(() => downloadDir);
    const outputPath = path.join(finalDownloadDir, `${filename}.%(ext)s`);

    // Download the audio
    console.log(`Downloading to: ${finalDownloadDir}`);

    const downloadArgs = [
      videoUrl,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '192',
      '--output', outputPath,
      '--add-metadata',
      '--no-warnings',
      '--user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--sleep-interval', '1',
      '--max-sleep-interval', '5',
      '--extractor-retries', '3',
      '--fragment-retries', '3',
      '--retry-sleep', 'linear=1::2',
      '--no-check-certificate'
    ];

    // Add cookies if the file exists
    try {
      await fs.access(COOKIES_PATH);
      const cookieStats = await fs.stat(COOKIES_PATH);
      console.log(`Found cookies file for download: ${COOKIES_PATH} (${cookieStats.size} bytes)`);
      downloadArgs.push('--cookies', COOKIES_PATH);

      // Add additional headers to mimic browser behavior
      downloadArgs.push('--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
      downloadArgs.push('--add-header', 'Accept-Language:en-US,en;q=0.5');
      downloadArgs.push('--add-header', 'Accept-Encoding:gzip, deflate');
      downloadArgs.push('--add-header', 'DNT:1');
      downloadArgs.push('--add-header', 'Connection:keep-alive');
      downloadArgs.push('--add-header', 'Upgrade-Insecure-Requests:1');

      console.log(`Using cookies for download: ${COOKIES_PATH}`);
    } catch {
      console.log('No cookies file found for download, proceeding without cookies');
    }

    await executeYtDlp(downloadArgs);

    const expectedFilePath = path.join(finalDownloadDir, `${filename}.mp3`);

    // Verify the file was created
    try {
      await fs.access(expectedFilePath);
      console.log(`Download completed: ${expectedFilePath}`);

      // Enhance the file with proper metadata
      console.log('Enhancing file with metadata...');
      const metadataSuccess = await enhanceAudioFileWithMetadata(
        expectedFilePath,
        title,
        artist,
        album
      );

      if (metadataSuccess) {
        console.log('Successfully enhanced file with metadata');
      } else {
        console.warn('Failed to enhance file with metadata, but file was downloaded');
      }

      return {
        success: true,
        filePath: expectedFilePath
      };
    } catch {
      return {
        success: false,
        error: 'Download completed but file not found at expected location'
      };
    }

  } catch (error) {
    console.error('Download failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown download error'
    };
  }
}

// Trigger Jellyfin library scan
export async function triggerLibraryScan(): Promise<boolean> {
  try {
    return await jellyfinClient.triggerLibraryScan();
  } catch (error) {
    console.error('Failed to trigger library scan:', error);
    return false;
  }
}
