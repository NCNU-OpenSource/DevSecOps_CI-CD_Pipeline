export type QueueOrigin = "manual" | "mix" | "radio" | "playlist";

export interface TrackRequester {
  profileId: string;
  profileName: string;
}

// 歌曲資訊
export interface Track {
  videoId: string;
  title: string;
  artist: string;
  duration: number; // 秒
  thumbnail?: string;
  requestedBy?: TrackRequester;
  queueOrigin?: QueueOrigin;
  radioGenerated?: boolean;
}

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
  source: "youtube-ext" | "invidious" | "yt-dlp";
  bitrate?: number;
}
