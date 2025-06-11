import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

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

export async function generatePlaylistSuggestions(
  playlistItems: Array<{ name: string; albumArtist?: string; album?: string }>
): Promise<AISuggestion[]> {
  // Validate environment variables
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error("AWS credentials not configured");
    return [];
  }

  // Create a prompt based on the playlist items
  const playlistDescription = playlistItems
    .slice(0, 10) // Limit to first 10 items to avoid token limits
    .map(item => `"${item.name}" by ${item.albumArtist || 'Unknown Artist'}${item.album ? ` (${item.album})` : ''}`)
    .join(', ');

  const prompt = `Based on this music playlist: ${playlistDescription}

Please suggest 5 similar songs that would fit well with this playlist. Consider the musical style, genre, mood, and era of the existing songs.

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
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Parse the AI response
    const aiResponse = responseBody.content[0].text;
    
    // Try to parse the JSON response
    try {
      const suggestions = JSON.parse(aiResponse);
      return Array.isArray(suggestions) ? suggestions.slice(0, 5) : [];
    } catch {
      console.error("Failed to parse AI response as JSON:", aiResponse);
      // Try to extract JSON from the response if it's wrapped in other text
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const suggestions = JSON.parse(jsonMatch[0]);
          return Array.isArray(suggestions) ? suggestions.slice(0, 5) : [];
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
