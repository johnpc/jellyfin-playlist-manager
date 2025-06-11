export interface JellyfinConfig {
  serverUrl: string;
  username: string;
  password: string;
}

export interface JellyfinUser {
  id: string;
  name: string;
  serverId: string;
}

export interface PlaylistItem {
  id: string;
  name: string;
  type: "Audio";
  albumArtist?: string;
  album?: string;
  duration?: number;
  indexNumber?: number;
  parentIndexNumber?: number;
  imageTags?: Record<string, string>;
}

export interface Playlist {
  id: string;
  name: string;
  itemCount: number;
  duration?: number;
  imageTags?: Record<string, string>;
  items?: PlaylistItem[];
}

export interface SearchResult {
  id: string;
  name: string;
  type: "Audio" | "MusicAlbum" | "MusicArtist";
  albumArtist?: string;
  album?: string;
  duration?: number;
  imageTags?: Record<string, string>;
}

export interface JellyfinTask {
  Id?: string;
  Name?: string;
  State?: "Idle" | "Running" | "Cancelling" | "Cancelled";
  CurrentProgressPercentage?: number;
  StatusMessage?: string;
  Key?: string;
  Category?: string;
  Description?: string;
  IsHidden?: boolean;
  LastExecutionResult?: {
    StartTimeUtc?: string;
    EndTimeUtc?: string;
    Status?: "Completed" | "Failed" | "Cancelled" | "Aborted";
    Name?: string;
    Key?: string;
    Id?: string;
    ErrorMessage?: string;
    LongErrorMessage?: string;
  };
}

export interface AuthState {
  isAuthenticated: boolean;
  config: JellyfinConfig | null;
  user: JellyfinUser | null;
  accessToken: string | null;
}

export interface AISuggestion {
  title: string;
  artist: string;
  album?: string;
  reason?: string;
}

export interface SuggestionWithAvailability extends AISuggestion {
  isAvailable: boolean;
  jellyfinItem?: SearchResult;
}
