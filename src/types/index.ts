// 歌曲資訊
export interface Track {
  videoId: string;
  title: string;
  artist: string;
  duration: number; // 秒
  thumbnail?: string;
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
}

// WebSocket 訊息類型
export type WSMessage =
  | { type: 'now_playing'; track: Track; position: number; duration: number }
  | { type: 'queue_updated'; queue: Track[] }
  | { type: 'lyrics'; lyrics: LyricLine[] }
  | { type: 'track_ended' }
  | { type: 'playback_state'; state: PlaybackState }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'skip' }
  | { type: 'volume'; value: number };

// API 回應格式
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
