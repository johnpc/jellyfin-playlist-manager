import type { SearchResult, AISuggestion } from "@/types/jellyfin";

// Normalize text for comparison
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Remove common words that might interfere with matching
function removeCommonWords(text: string): string {
  const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'feat', 'featuring', 'ft', 'vs', 'versus'];
  const words = text.split(' ');
  return words.filter(word => !commonWords.includes(word.toLowerCase())).join(' ');
}

// Calculate similarity between two strings using Levenshtein distance
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;
  
  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
  
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  const maxLen = Math.max(len1, len2);
  return (maxLen - matrix[len2][len1]) / maxLen;
}

// Check if two strings are similar enough
function isSimilar(str1: string, str2: string, threshold: number = 0.7): boolean {
  const normalized1 = normalizeText(str1);
  const normalized2 = normalizeText(str2);
  
  // Exact match after normalization
  if (normalized1 === normalized2) return true;
  
  // One contains the other
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return true;
  
  // Remove common words and try again
  const cleaned1 = removeCommonWords(normalized1);
  const cleaned2 = removeCommonWords(normalized2);
  
  if (cleaned1 === cleaned2) return true;
  if (cleaned1.includes(cleaned2) || cleaned2.includes(cleaned1)) return true;
  
  // Use similarity calculation
  return calculateSimilarity(cleaned1, cleaned2) >= threshold;
}

// Find the best match for an AI suggestion in search results
export function findBestMatch(
  suggestion: AISuggestion, 
  searchResults: SearchResult[]
): SearchResult | null {
  const audioResults = searchResults.filter(result => result.type === "Audio");
  
  if (audioResults.length === 0) return null;
  
  let bestMatch: SearchResult | null = null;
  let bestScore = 0;
  
  for (const result of audioResults) {
    let score = 0;
    
    // Title matching (most important)
    if (isSimilar(suggestion.title, result.name, 0.8)) {
      score += 10;
    } else if (isSimilar(suggestion.title, result.name, 0.6)) {
      score += 5;
    }
    
    // Artist matching
    if (result.albumArtist) {
      if (isSimilar(suggestion.artist, result.albumArtist, 0.8)) {
        score += 8;
      } else if (isSimilar(suggestion.artist, result.albumArtist, 0.6)) {
        score += 4;
      }
    }
    
    // Album matching (bonus if available)
    if (suggestion.album && result.album) {
      if (isSimilar(suggestion.album, result.album, 0.8)) {
        score += 3;
      }
    }
    
    // Prefer results where both title and artist have some similarity
    const titleSimilarity = calculateSimilarity(normalizeText(suggestion.title), normalizeText(result.name));
    const artistSimilarity = result.albumArtist ? 
      calculateSimilarity(normalizeText(suggestion.artist), normalizeText(result.albumArtist)) : 0;
    
    if (titleSimilarity > 0.5 && artistSimilarity > 0.5) {
      score += 5;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = result;
    }
  }
  
  // Only return a match if the score is high enough (lowered threshold for better matching)
  return bestScore >= 5 ? bestMatch : null;
}

// Generate multiple search queries for better coverage
export function generateSearchQueries(suggestion: AISuggestion): string[] {
  const queries: string[] = [];
  
  // Primary query: title + artist
  queries.push(`${suggestion.title} ${suggestion.artist}`);
  
  // Just the title
  queries.push(suggestion.title);
  
  // Just the artist
  queries.push(suggestion.artist);
  
  // Title with album if available
  if (suggestion.album) {
    queries.push(`${suggestion.title} ${suggestion.album}`);
  }
  
  // Clean versions without common words
  const cleanTitle = removeCommonWords(suggestion.title);
  const cleanArtist = removeCommonWords(suggestion.artist);
  
  if (cleanTitle !== suggestion.title || cleanArtist !== suggestion.artist) {
    queries.push(`${cleanTitle} ${cleanArtist}`);
  }
  
  return queries.filter((query, index, self) => self.indexOf(query) === index); // Remove duplicates
}
