import type { Track, PlaybackState } from '../types/index.ts';
import { getPlayerService } from './player.service.ts';
import { getMusicService } from './music.service.ts';

type QueueChangeCallback = (queue: Track[]) => void;
type PlaybackStateCallback = (state: PlaybackState) => void;

class QueueService {
  private static instance: QueueService;
  private queue: Track[] = [];
  private currentTrack: Track | null = null;
  private currentPosition = 0;
  private currentDuration = 0;
  private isPaused = false;
  private queueChangeCallbacks: QueueChangeCallback[] = [];
  private stateChangeCallbacks: PlaybackStateCallback[] = [];

  private constructor() {
    // 監聽播放器事件
    const player = getPlayerService();
    player.onEvent((event) => {
      if (event.timePos !== undefined) {
        this.currentPosition = event.timePos;
      }
      if (event.duration !== undefined) {
        this.currentDuration = event.duration;
      }
      if (event.paused !== undefined) {
        this.isPaused = event.paused;
      }
      if (event.eof === true) {
        // 播放結束，自動播放下一首
        console.log('Track ended, playing next...');
        this.playNext();
      }

      // 廣播狀態變更
      this.broadcastState();
    });
  }

  static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  /**
   * 註冊佇列變更回調
   */
  onQueueChange(callback: QueueChangeCallback): void {
    this.queueChangeCallbacks.push(callback);
  }

  /**
   * 註冊播放狀態變更回調
   */
  onStateChange(callback: PlaybackStateCallback): void {
    this.stateChangeCallbacks.push(callback);
  }

  /**
   * 廣播佇列變更
   */
  private broadcastQueueChange(): void {
    for (const callback of this.queueChangeCallbacks) {
      callback([...this.queue]);
    }
  }

  /**
   * 廣播狀態變更
   */
  private broadcastState(): void {
    const state: PlaybackState = {
      isPlaying: !this.isPaused && this.currentTrack !== null,
      currentTrack: this.currentTrack,
      position: this.currentPosition,
      duration: this.currentDuration,
      volume: getPlayerService().getVolume(),
      queue: [...this.queue],
    };

    for (const callback of this.stateChangeCallbacks) {
      callback(state);
    }
  }

  /**
   * 加入歌曲到播放清單
   */
  async addToQueue(videoId: string): Promise<void> {
    const musicService = getMusicService();

    // 透過搜尋獲取歌曲資訊（使用 videoId 作為搜尋關鍵字）
    const tracks = await musicService.search(videoId, 1);

    if (tracks.length === 0) {
      // 如果搜尋不到，建立基本的 Track 物件
      const track: Track = {
        videoId,
        title: 'Unknown',
        artist: 'Unknown',
        duration: 0,
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      };
      this.queue.push(track);
    } else {
      this.queue.push(tracks[0]);
    }

    console.log('Added to queue:', videoId);
    this.broadcastQueueChange();

    // 如果目前沒有播放，自動開始播放
    if (!this.currentTrack) {
      this.playNext();
    }
  }

  /**
   * 從播放清單移除歌曲
   */
  removeFromQueue(index: number): void {
    if (index >= 0 && index < this.queue.length) {
      const removed = this.queue.splice(index, 1);
      console.log('Removed from queue:', removed[0]?.videoId);
      this.broadcastQueueChange();
    }
  }

  /**
   * 播放下一首
   */
  async playNext(): Promise<void> {
    if (this.queue.length === 0) {
      console.log('Queue is empty, stopping playback');
      this.currentTrack = null;
      getPlayerService().stop();
      this.broadcastState();
      return;
    }

    // 從佇列取出下一首
    const nextTrack = this.queue.shift()!;
    this.currentTrack = nextTrack;
    this.currentPosition = 0;
    this.currentDuration = nextTrack.duration;
    this.isPaused = false;

    console.log('Playing next track:', nextTrack.title);

    // 廣播變更
    this.broadcastQueueChange();
    this.broadcastState();

    try {
      // 播放
      await getPlayerService().play(nextTrack.videoId);
    } catch (error) {
      console.error('Failed to play track:', error);
      // 播放失敗，嘗試下一首
      this.playNext();
    }
  }

  /**
   * 暫停/繼續播放
   */
  togglePlayPause(): void {
    if (this.isPaused) {
      getPlayerService().resume();
    } else {
      getPlayerService().pause();
    }
  }

  /**
   * 跳過當前歌曲
   */
  skip(): void {
    console.log('Skipping current track');
    this.playNext();
  }

  /**
   * 設定音量
   */
  setVolume(volume: number): void {
    getPlayerService().setVolume(volume);
    this.broadcastState();
  }

  /**
   * 取得播放清單
   */
  getQueue(): Track[] {
    return [...this.queue];
  }

  /**
   * 取得目前播放狀態
   */
  getState(): PlaybackState {
    return {
      isPlaying: !this.isPaused && this.currentTrack !== null,
      currentTrack: this.currentTrack,
      position: this.currentPosition,
      duration: this.currentDuration,
      volume: getPlayerService().getVolume(),
      queue: [...this.queue],
    };
  }

  /**
   * 取得歌詞
   */
  async getLyrics() {
    if (!this.currentTrack) {
      return [];
    }

    const musicService = getMusicService();
    return await musicService.getLyrics(
      this.currentTrack.title,
      this.currentTrack.artist,
      this.currentTrack.duration
    );
  }
}

export function getQueueService(): QueueService {
  return QueueService.getInstance();
}
