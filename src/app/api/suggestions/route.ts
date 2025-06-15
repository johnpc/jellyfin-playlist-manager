import { NextRequest, NextResponse } from "next/server";
import { generatePlaylistSuggestions } from "@/lib/api/bedrock";

export async function POST(request: NextRequest) {
  try {
    const { playlistItems, radioMode = false, count } = await request.json();

    if (!playlistItems || !Array.isArray(playlistItems)) {
      return NextResponse.json(
        { error: "Invalid playlist items provided" },
        { status: 400 },
      );
    }

    if (playlistItems.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Generate AI suggestions
    const suggestions = await generatePlaylistSuggestions(
      playlistItems,
      radioMode,
      count,
    );

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Error in suggestions API:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 },
    );
  }
}
