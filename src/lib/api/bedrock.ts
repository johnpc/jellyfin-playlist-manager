import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

// Initialize Bedrock client
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export interface AISuggestion {
  title: string;
  artist: string;
  album?: string;
  reason?: string;
}

export interface ParsedMetadata {
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genre?: string;
}

export async function parseMetadataWithAI(
  rawTitle: string,
  rawArtist: string,
  rawAlbum?: string,
): Promise<ParsedMetadata | null> {
  // Validate environment variables
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error("AWS credentials not configured");
    return null;
  }

  const prompt = `Please parse and clean up this music metadata. The data may contain extra information, formatting issues, or inconsistencies that need to be cleaned up.

Raw metadata:
- Title: "${rawTitle}"
- Artist: "${rawArtist}"
${rawAlbum ? `- Album: "${rawAlbum}"` : ""}

Please analyze this information and return clean, properly formatted metadata. Consider:

1. **Title Cleaning:**
   - Remove video-specific text: "(Official Video)", "(Official Music Video)", "(Lyric Video)", "(Audio)", "[Official Video]", etc.
   - Remove quality indicators: "[HD]", "[4K]", "(HQ)", etc.
   - Remove platform indicators: "(YouTube)", "(Spotify)", etc.
   - Remove extra descriptors: "(Explicit)", "(Clean)", "(Radio Edit)", etc.
   - Keep important musical descriptors: "(Acoustic)", "(Live)", "(Remix)", "(Extended Mix)", etc.

2. **Artist Cleaning:**
   - Remove channel suffixes: "VEVO", "Official", "Music", etc.
   - Handle collaborations properly: "Artist feat. Other" → main artist is "Artist"
   - Clean up formatting and capitalization
   - Remove record label names if they appear

3. **Smart Inference:**
   - If you recognize the artist/song combination, provide the correct album name
   - Infer release year if you know the song (be conservative, only if confident)
   - Suggest genre based on the artist's typical style (be general, not too specific)

4. **Formatting:**
   - Use proper title case for titles and albums
   - Use proper capitalization for artist names
   - Be consistent with punctuation

Respond with a JSON object containing:
- title: Clean song title
- artist: Main artist name (clean)
- album: Album name (only if known or can be confidently inferred)
- year: Release year (only if can be confidently inferred)
- genre: Music genre (only if can be reasonably inferred, use broad categories like "Rock", "Pop", "Hip Hop", "Electronic", etc.)

Example format:
{
  "title": "Song Name",
  "artist": "Artist Name",
  "album": "Album Name",
  "year": 2020,
  "genre": "Pop"
}

Important: Only include album, year, and genre if you're reasonably confident. It's better to omit them than to guess incorrectly.

Only return the JSON object, no other text.`;

  try {
    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-haiku-20240307-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Parse the AI response
    const aiResponse = responseBody.content[0].text;

    // Try to parse the JSON response
    try {
      const parsedMetadata = JSON.parse(aiResponse);
      
      // Validate the response has required fields
      if (parsedMetadata.title && parsedMetadata.artist) {
        console.log("AI parsed metadata:", parsedMetadata);
        return parsedMetadata;
      } else {
        console.error("AI response missing required fields:", parsedMetadata);
        return null;
      }
    } catch {
      console.error("Failed to parse AI metadata response as JSON:", aiResponse);
      // Try to extract JSON from the response if it's wrapped in other text
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsedMetadata = JSON.parse(jsonMatch[0]);
          if (parsedMetadata.title && parsedMetadata.artist) {
            console.log("AI parsed metadata (extracted):", parsedMetadata);
            return parsedMetadata;
          }
        } catch {
          console.error("Failed to parse extracted JSON:", jsonMatch[0]);
        }
      }
      return null;
    }
  } catch (error) {
    console.error("Error parsing metadata with AI:", error);
    return null;
  }
}

export async function generatePlaylistSuggestions(
  playlistItems: Array<{ name: string; albumArtist?: string; album?: string }>,
  radioMode: boolean = false,
  count?: number,
): Promise<AISuggestion[]> {
  // Validate environment variables
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error("AWS credentials not configured");
    return [];
  }

  // Determine how many suggestions to generate
  const suggestionCount = count || (radioMode ? 25 : 5);
  
  // Create a prompt based on the playlist items
  const playlistDescription = playlistItems
    .slice(0, 10) // Limit to first 10 items to avoid token limits
    .map(
      (item) =>
        `"${item.name}" by ${item.albumArtist || "Unknown Artist"}${item.album ? ` (${item.album})` : ""}`,
    )
    .join(", ");

  const prompt = radioMode 
    ? `I want to create a radio station based on this song/artist: ${playlistDescription}

Please suggest ${suggestionCount} songs that would create a great radio playlist in this style. Think like a radio DJ curating a cohesive listening experience. Include:
- Songs by the same artist
- Songs by similar artists in the same genre
- Songs from the same era or movement
- Songs with similar energy, mood, and musical characteristics
- Both popular hits and deeper cuts that fit the vibe

Respond with a JSON array of objects, each containing:
- title: The song title
- artist: The artist name
- album: The album name (if known)
- reason: A brief explanation of why this song fits the radio station

Example format:
[
  {
    "title": "Song Name",
    "artist": "Artist Name", 
    "album": "Album Name",
    "reason": "Same artist, similar energy and style"
  }
]

Only return the JSON array, no other text.`
    : `Based on this music playlist: ${playlistDescription}

Please suggest ${suggestionCount} similar songs that would fit well with this playlist. Consider the musical style, genre, mood, and era of the existing songs.

Respond with a JSON array of objects, each containing:
- title: The song title
- artist: The artist name
- album: The album name (if known)
- reason: A brief explanation of why this song fits the playlist

Example format:
[
  {
    "title": "Song Name",
    "artist": "Artist Name", 
    "album": "Album Name",
    "reason": "Similar indie rock style with melodic vocals"
  }
]

Only return the JSON array, no other text.`;

  try {
    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-haiku-20240307-v1:0", // Using Claude 3 Haiku for cost efficiency
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: radioMode ? 3000 : 1000, // More tokens for radio mode
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Parse the AI response
    const aiResponse = responseBody.content[0].text;

    // Try to parse the JSON response
    try {
      const suggestions = JSON.parse(aiResponse);
      return Array.isArray(suggestions) ? suggestions.slice(0, suggestionCount) : [];
    } catch {
      console.error("Failed to parse AI response as JSON:", aiResponse);
      // Try to extract JSON from the response if it's wrapped in other text
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const suggestions = JSON.parse(jsonMatch[0]);
          return Array.isArray(suggestions) ? suggestions.slice(0, suggestionCount) : [];
        } catch {
          console.error("Failed to parse extracted JSON:", jsonMatch[0]);
        }
      }
      return [];
    }
  } catch (error) {
    console.error("Error generating AI suggestions:", error);
    return [];
  }
}
