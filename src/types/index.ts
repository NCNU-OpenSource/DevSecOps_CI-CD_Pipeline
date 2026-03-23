export type QueueOrigin = "manual" | "mix" | "radio" | "playlist";

export interface TrackRequester {
  profileId: string;
  profileName: string;
}

export interface TrackAlbum {
  id: string;
  name: string;
}

export type SearchCollectionKind = "album" | "playlist" | "mix";

// 歌曲資訊
export interface Track {
  videoId: string;
  title: string;
  artist: string;
  duration: number; // 秒
  thumbnail?: string;
  album?: TrackAlbum;
  requestedBy?: TrackRequester;
  queueOrigin?: QueueOrigin;
  radioGenerated?: boolean;
}

export interface AlbumDetails {
  id: string;
  title: string;
  artist: string;
  subtitle?: string;
  trackSummary?: string;
  thumbnail?: string;
  tracks: Track[];
}

export interface TrackSearchResult {
  kind: "track";
  id: string;
  title: string;
  artist: string;
  thumbnail?: string;
  duration: number;
  track: Track;
}

export interface CollectionSearchResult {
  kind: SearchCollectionKind;
  id: string;
  title: string;
  artist: string;
  thumbnail?: string;
  trackCount: number;
  tracks: Track[];
  truncated: boolean;
  subtitle?: string;
}

export type SearchResult = TrackSearchResult | CollectionSearchResult;

// 歌詞行
export interface LyricLine {
  text: string;
  time: number; // 秒
}

// 播放狀態
export interface PlaybackState {
  isPlaying: boolean;
  currentTrack: Track | null;
  position: number; // 當前播放位置（秒）
  duration: number; // 總時長（秒）
  volume: number; // 0-100
  queue: Track[];
  radioEnabled: boolean;
  lastPlayedTrack: Track | null;
}

export interface PlaybackProgress {
  trackId: string | null;
  position: number; // 當前播放位置（秒）
  duration: number; // 總時長（秒）
  isPlaying: boolean;
}

// WebSocket 訊息類型
export type WSMessage =
  | { type: "track_loading"; track: Track | null; message?: string }
  | { type: "track_ready"; track: Track }
  | { type: "now_playing"; track: Track; position: number; duration: number }
  | { type: "queue_updated"; queue: Track[] }
  | { type: "lyrics"; lyrics: LyricLine[] }
  | { type: "track_ended" }
  | { type: "playback_state"; state: PlaybackState }
  | { type: "playback_progress"; progress: PlaybackProgress }
  | { type: "play_error"; error: string; track: Track | null }
  | { type: "play" }
  | { type: "pause" }
  | { type: "skip" }
  | { type: "volume"; value: number }
  | { type: "seek"; value: number };

// API 回應格式
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// 串流 URL 結果
export interface StreamUrlResult {
  url: string;
  source: "youtubei" | "invidious" | "yt-dlp";
  bitrate?: number;
}
