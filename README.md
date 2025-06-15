This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Features

- **Jellyfin Integration**: Connect to your Jellyfin server to manage music playlists
- **Automatic Token Refresh**: Seamlessly handles expired authentication tokens without user intervention
- **AI-Powered Suggestions**: Get intelligent song recommendations using AWS Bedrock
- **Auto-Download**: Download suggested songs from YouTube when they're not in your library
- **Progressive Web App**: Install on your device for a native app experience
- **Drag & Drop**: Reorder playlist items with intuitive drag-and-drop
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Getting Started

### Option 1: Docker (Recommended)

The easiest way to run the Jellyfin Playlist Manager is using Docker:

```bash
# Using Docker Compose
git clone <your-repo>
cd jellyfin-playlist-manager
cp .env.example .env
# Edit .env with your configuration
docker-compose up -d
```

See [DOCKER.md](DOCKER.md) for complete Docker deployment instructions.

### Option 2: Local Development

#### Prerequisites

1. A running Jellyfin server with music library
2. AWS account with Bedrock access (for AI suggestions)
3. yt-dlp installed on your system (for downloading music from YouTube)

#### Installation

1. Clone the repository and install dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
```

2. Set up environment variables:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here

# Download Configuration
MUSIC_DOWNLOAD_DIR=/path/to/your/jellyfin/music/directory

# Jellyfin Configuration (for automatic library scanning)
JELLYFIN_SERVER_URL=http://localhost:8096
```

### AWS Bedrock Setup

To enable AI-powered playlist suggestions and metadata parsing, you need to:

1. **Enable Bedrock Models**: Go to the AWS Bedrock console and request access to the Claude 3 Haiku model in your region
2. **Create IAM User**: Create an IAM user with the following permissions:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["bedrock:InvokeModel"],
         "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-haiku-20240307-v1:0"
       }
     ]
   }
   ```
3. **Get Credentials**: Generate access keys for the IAM user and add them to your `.env.local` file

**AI Features Enabled:**
- **Playlist Suggestions**: Analyzes your current playlist and suggests similar songs
- **Metadata Parsing**: When MusicBrainz doesn't have song data, AI cleans up and parses song titles, artist names, and can infer album/genre information

### Development

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## How AI Suggestions Work

The AI suggestions feature:

1. **Analyzes Your Playlist**: Takes the songs currently in your playlist and analyzes their style, genre, and mood
2. **Generates Recommendations**: Uses AWS Bedrock (Claude 3 Haiku) to suggest similar songs that would fit well
3. **Checks Availability**: Searches your Jellyfin library to see if suggested songs are available
4. **Smart Display**: Shows available songs with an "add" button, and unavailable songs with a "download" button

## Auto-Download Feature

For songs that aren't in your library, the app can automatically download them:

1. **YouTube Search**: Searches YouTube for the suggested song
2. **Audio Download**: Uses yt-dlp to download high-quality audio (192kbps MP3)
3. **Metadata Enhancement**: Fetches proper metadata from MusicBrainz and injects ID3 tags
4. **Library Organization**: Creates artist directories and uses proper naming conventions
5. **Library Integration**: Saves the file to your configured music directory
6. **Smart Library Scanning**: Triggers targeted music library scans and monitors progress in real-time
7. **Auto-Playlist Addition**: Automatically adds the downloaded song to your playlist once scanning completes

### Metadata Enhancement

The app goes beyond simple downloading by properly tagging your music files:

- **MusicBrainz Integration**: Fetches accurate metadata from the MusicBrainz database
- **AI-Powered Fallback**: When MusicBrainz doesn't have data, uses AWS Bedrock (Claude 3 Haiku) to intelligently parse and clean up song titles and artist names
- **Smart Metadata Parsing**: AI removes video-specific text like "(Official Video)", cleans up artist names, fixes capitalization, and can infer album names and genres
- **ID3 Tag Injection**: Adds proper title, artist, album, year, and track information
- **MusicBrainz IDs**: Includes MusicBrainz identifiers for better music library management when available
- **Comprehensive Fallback**: Uses basic metadata if both MusicBrainz and AI parsing fail
- **Jellyfin Compatibility**: Ensures tags are compatible with Jellyfin's metadata system

### Setup for Downloads

1. **Install yt-dlp**: Make sure yt-dlp is installed and available in your system PATH

   ```bash
   # On macOS with Homebrew (recommended)
   brew install yt-dlp

   # On other systems, see: https://github.com/yt-dlp/yt-dlp#installation
   ```

2. **Verify Installation**: Check that yt-dlp is working

   ```bash
   which yt-dlp
   yt-dlp --version
   ```

3. **Path Configuration**: The app is configured to use yt-dlp at `/opt/homebrew/bin/yt-dlp` (standard Homebrew location). If your yt-dlp is installed elsewhere, you can set the `YT_DLP_PATH` environment variable:

   ```env
   YT_DLP_PATH=/usr/local/bin/yt-dlp
   ```

   The app now directly executes yt-dlp using Node.js child processes for better reliability.

4. **YouTube Cookies (Recommended)**: To avoid YouTube's bot detection, export your browser cookies:

   **Option A: Browser Extension (Easiest)**

   - Install a cookie export extension like "Get cookies.txt LOCALLY" for Chrome/Firefox
   - Visit YouTube while logged in
   - Export cookies to `cookies.txt` in your project root

   **Option B: Manual Export**

   - Use yt-dlp's built-in cookie extraction:

   ```bash
   yt-dlp --cookies-from-browser chrome --cookies cookies.txt --no-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
   ```

   **Option C: Custom Path**

   - Place your cookies file anywhere and set the path:

   ```env
   COOKIES_PATH=/path/to/your/cookies.txt
   ```

5. **Configure Directory**: Set `MUSIC_DOWNLOAD_DIR` to a directory that Jellyfin monitors
6. **Permissions**: Ensure the app has write permissions to the download directory
7. **Internet Access**: Required for MusicBrainz metadata lookup and YouTube downloads

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

**Note**: When deploying, make sure to add your AWS environment variables to your deployment platform's environment configuration.

## Authentication & Token Management

The app includes robust authentication handling with automatic token refresh:

- **Seamless Experience**: Expired tokens are automatically refreshed in the background
- **No Interruptions**: Users stay logged in even when tokens expire
- **Secure Storage**: Credentials stored locally for automatic refresh
- **Fallback Handling**: Graceful logout and redirect if refresh fails

For detailed information about authentication and testing token refresh, see [AUTHENTICATION.md](AUTHENTICATION.md).
