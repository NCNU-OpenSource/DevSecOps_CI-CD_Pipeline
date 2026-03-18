import type {
  QueueOrigin,
  Track,
  PlaybackState,
  PlaybackProgress,
} from "../types/index.ts";
import { getPlayerService } from "./player.service.ts";
import { getMusicService } from "./music.service.ts";
import { pushRecentTrackId, selectRadioCandidates } from "./radio.helpers.ts";
import { log } from "../utils/logger.ts";

type QueueChangeCallback = (queue: Track[]) => void;
type PlaybackStateCallback = (state: PlaybackState) => void;
type PlaybackProgressCallback = (progress: PlaybackProgress) => void;
type LyricsChangeCallback = (lyrics: any[]) => void;

const PROGRESS_BROADCAST_INTERVAL_MS = 250;

class QueueService {
  private static instance: QueueService | undefined;
  private mixRequestId = 0;
  private radioRequestId = 0;
  private queue: Track[] = [];
  private currentTrack: Track | null = null;
  private lastPlayedTrack: Track | null = null;
  private currentPosition = 0;
  private currentDuration = 0;
  private isPaused = false;
  private radioEnabled = false;
  private recentRadioTrackIds: string[] = [];
  private radioFillPromise: Promise<void> | null = null;
  private lastEofTimestamp = 0; // 記錄 EOF 時間，用於抑制假 pause 事件
  private queueChangeCallbacks: QueueChangeCallback[] = [];
  private stateChangeCallbacks: PlaybackStateCallback[] = [];
  private progressChangeCallbacks: PlaybackProgressCallback[] = [];
  private lyricsChangeCallbacks: LyricsChangeCallback[] = [];
  private pendingProgressTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastProgressBroadcastAt = 0;
  private lastProgressPayload: PlaybackProgress | null = null;

  private constructor() {
    // 監聽播放器事件
    const player = getPlayerService();
    player.onEvent((event) => {
      let shouldBroadcastProgress = false;
      let shouldBroadcastState = false;

      if (event.timePos !== undefined) {
        this.currentPosition = event.timePos;
        shouldBroadcastProgress = true;
      }
      if (event.duration !== undefined) {
        this.currentDuration = event.duration;
        shouldBroadcastProgress = true;
      }

      // EOF 處理
      if (event.eof === true) {
        this.lastEofTimestamp = Date.now(); // 記錄 EOF 時間
        log.info("Track ended, playing next...");
        void this.playNext();
        return;
      }

      // Pause 處理 - 抑制 EOF 後 2 秒內的假暫停
      if (event.paused !== undefined) {
        // mpv 進入 idle 模式時會發送 pause: true
        // 抑制 EOF 後 2 秒內的 pause 事件，防止覆蓋 isPlaying 狀態
        const timeSinceEof = Date.now() - this.lastEofTimestamp;
        if (event.paused && timeSinceEof < 2000) {
          log.debug("Ignoring pause event after EOF", {
            timeSinceEof,
            threshold: 2000,
          });
          return; // 直接返回，不處理也不廣播
        }
        this.isPaused = event.paused;
        shouldBroadcastState = true;
        shouldBroadcastProgress = true;
      }

      if (shouldBroadcastState) {
        this.broadcastState();
      }

      if (shouldBroadcastProgress) {
        this.broadcastProgress({ force: shouldBroadcastState });
      }
    });
  }

  static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  static resetInstanceForTests(): void {
    if (QueueService.instance) {
      QueueService.instance.resetForTests();
    }
    QueueService.instance = undefined;
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
   * 註冊播放進度變更回調
   */
  onProgressChange(callback: PlaybackProgressCallback): void {
    this.progressChangeCallbacks.push(callback);
  }

  /**
   * 註冊歌詞變更回調
   */
  onLyricsChange(callback: LyricsChangeCallback): void {
    this.lyricsChangeCallbacks.push(callback);
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
    const state = this.getState();

    for (const callback of this.stateChangeCallbacks) {
      callback(state);
    }
  }

  private broadcastProgress(options: { force?: boolean } = {}): void {
    const progress = this.getProgress();
    const hasMeaningfulChange = !isSameProgress(
      this.lastProgressPayload,
      progress,
    );

    if (!hasMeaningfulChange) {
      if (this.pendingProgressTimeout) {
        clearTimeout(this.pendingProgressTimeout);
        this.pendingProgressTimeout = null;
      }
      return;
    }

    const emit = () => {
      this.pendingProgressTimeout = null;
      const latestProgress = this.getProgress();

      if (isSameProgress(this.lastProgressPayload, latestProgress)) {
        return;
      }

      this.lastProgressPayload = latestProgress;
      this.lastProgressBroadcastAt = Date.now();

      for (const callback of this.progressChangeCallbacks) {
        callback(latestProgress);
      }
    };

    if (options.force) {
      if (this.pendingProgressTimeout) {
        clearTimeout(this.pendingProgressTimeout);
        this.pendingProgressTimeout = null;
      }
      emit();
      return;
    }

    const elapsed = Date.now() - this.lastProgressBroadcastAt;
    if (elapsed >= PROGRESS_BROADCAST_INTERVAL_MS) {
      emit();
      return;
    }

    if (this.pendingProgressTimeout) {
      return;
    }

    this.pendingProgressTimeout = setTimeout(
      emit,
      PROGRESS_BROADCAST_INTERVAL_MS - elapsed,
    );
  }

  /**
   * 加入歌曲到播放清單
   */
  async addToQueue(
    track: Track,
    options: { requestedBy?: Track["requestedBy"] } = {},
  ): Promise<void> {
    const requester = this.resolveRequester(options.requestedBy, track);
    const normalizedTrack = this.withRequester(track, requester);
    this.insertManualTracks([normalizedTrack]);

    log.info("Added to queue", {
      videoId: normalizedTrack.videoId,
      title: normalizedTrack.title,
      artist: normalizedTrack.artist,
      requestedBy: normalizedTrack.requestedBy?.profileId ?? null,
    });
    this.broadcastQueueChange();

    // 如果目前沒有播放，自動開始播放
    // 使用雙重檢查：currentTrack 為 null 且播放器未在播放
    const playerIsPlaying = getPlayerService().isCurrentlyPlaying();
    const shouldAutoPlay = this.currentTrack === null && !playerIsPlaying;

    log.info("Auto-play check", {
      currentTrack: this.currentTrack?.title ?? "null",
      playerIsPlaying,
      shouldAutoPlay,
      queueLength: this.queue.length,
    });

    if (shouldAutoPlay) {
      log.info("Auto-starting playback for newly added track");
      this.playNext();
      return;
    }

    this.maybeHydrateRadioQueue();
  }

  /**
   * 創建混合播放清單
   * 清空佇列，立即開始播放 Mix
   */
  async createMixFromTrack(
    baseTrack: Track,
    options: { requestedBy?: Track["requestedBy"] } = {},
  ): Promise<Track[]> {
    const requester = this.resolveRequester(options.requestedBy, baseTrack);
    const normalizedBaseTrack = this.withRequester(baseTrack, requester);

    log.info("Creating mix", {
      baseTrack: normalizedBaseTrack.title,
      requestedBy: normalizedBaseTrack.requestedBy?.profileId ?? null,
    });
    const mixRequestId = ++this.mixRequestId;

    // 停止當前播放
    await getPlayerService().stop();

    // 清空佇列
    this.queue = [];
    this.currentTrack = null;
    this.currentPosition = 0;
    this.currentDuration = 0;
    this.isPaused = false;
    this.broadcastQueueChange();
    this.broadcastState();

    // 先加入基礎歌曲
    this.queue.push(this.withOrigin(normalizedBaseTrack, "mix"));

    log.info("Mix created, starting playback", {
      addedTracks: this.queue.length,
    });
    this.broadcastQueueChange();

    // 先開始播放 base song，不等待推薦歌曲回來。
    await this.playNext();

    // 再背景補上推薦歌曲。
    let mixTracks: Track[] = [];
    try {
      mixTracks = await getMusicService().getMixTracks(
        normalizedBaseTrack.videoId,
        10,
      );

      // 如果期間又建立了新的 mix，就丟棄舊結果避免污染 queue。
      if (mixRequestId !== this.mixRequestId) {
        log.info("Discarding stale mix tracks", {
          baseTrack: normalizedBaseTrack.title,
          mixRequestId,
          currentMixRequestId: this.mixRequestId,
        });
        return [normalizedBaseTrack];
      }

      if (mixTracks.length > 0) {
        const normalizedMixTracks = mixTracks.map((track) =>
          this.withOrigin(this.withRequester(track, requester), "mix"),
        );
        this.queue.push(...normalizedMixTracks);
        this.broadcastQueueChange();

        // 若 base song 已結束且播放器空閒，補上的 mix 要能自動接續播放。
        if (this.currentTrack === null && !getPlayerService().isCurrentlyPlaying()) {
          await this.playNext();
        }
      }
    } catch (error) {
      log.warn("Failed to get mix tracks, playing base track only", { error });
    }

    return [
      normalizedBaseTrack,
      ...mixTracks.map((track) => this.withRequester(track, requester)),
    ];
  }

  /**
   * 從播放清單移除歌曲
   */
  removeFromQueue(index: number): void {
    if (index >= 0 && index < this.queue.length) {
      const removed = this.queue.splice(index, 1);
      log.info("Removed from queue", { videoId: removed[0]?.videoId });
      this.broadcastQueueChange();
      this.broadcastState();
      this.maybeHydrateRadioQueue();
    }
  }

  /**
   * 重新排序播放清單
   */
  reorderQueue(fromIndex: number, toIndex: number): void {
    const isValidIndex = (index: number) =>
      Number.isInteger(index) && index >= 0 && index < this.queue.length;

    if (!isValidIndex(fromIndex) || !isValidIndex(toIndex)) {
      throw new RangeError("Invalid queue index");
    }

    if (fromIndex === toIndex) {
      return;
    }

    const [movedTrack] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, movedTrack);

    log.info("Reordered queue", {
      videoId: movedTrack?.videoId,
      fromIndex,
      toIndex,
    });

    this.broadcastQueueChange();
    this.broadcastState();
    this.maybeHydrateRadioQueue();
  }

  /**
   * 播放下一首
   */
  async playNext(): Promise<void> {
    log.info("playNext called", {
      queueLength: this.queue.length,
      currentTrack: this.currentTrack?.title ?? "null",
      isPaused: this.isPaused,
    });

    if (this.queue.length === 0) {
      const filled = await this.ensureRadioTracks({
        immediatePlayback: true,
        seedTrack: this.currentTrack ?? this.lastPlayedTrack,
      });

      if (filled && this.queue.length > 0) {
        return this.playNext();
      }

      log.info("Queue is empty, stopping playback");
      if (this.currentTrack) {
        this.lastPlayedTrack = this.currentTrack;
        this.rememberRecentlyPlayed(this.currentTrack.videoId);
      }
      this.currentTrack = null;
      this.currentPosition = 0;
      this.currentDuration = 0;
      this.isPaused = false;
      getPlayerService().stop();
      this.broadcastState();
      return;
    }

    // 從佇列取出下一首
    if (this.currentTrack) {
      this.lastPlayedTrack = this.currentTrack;
      this.rememberRecentlyPlayed(this.currentTrack.videoId);
    }
    const nextTrack = this.queue.shift()!;
    this.currentTrack = nextTrack;
    this.currentPosition = 0;
    this.currentDuration = nextTrack.duration;
    this.isPaused = false;

    log.info("Playing next track", { title: nextTrack.title });

    // 廣播變更
    this.broadcastQueueChange();
    this.broadcastState();
    this.maybeHydrateRadioQueue();

    // 獲取並廣播歌詞
    this.fetchAndBroadcastLyrics();

    try {
      log.info("Fetching direct stream URL for playback", {
        videoId: nextTrack.videoId,
      });
      const streamResult = await getMusicService().getStreamUrl(nextTrack.videoId);
      log.info("Direct stream URL obtained", {
        source: streamResult.source,
        bitrate: streamResult.bitrate,
        urlLength: streamResult.url.length,
      });
      await getPlayerService().playUrl(streamResult.url);
      log.info("Playback started successfully via direct stream URL", {
        source: streamResult.source,
      });
    } catch (playError) {
      // Fallback：若直連串流失敗，再退回 mpv 直接處理 YouTube URL。
      log.warn("Direct stream playback failed, falling back to YouTube URL", {
        error:
          playError instanceof Error ? playError.message : String(playError),
        stack: playError instanceof Error ? playError.stack : undefined,
        videoId: nextTrack.videoId,
      });

      try {
        await getPlayerService().play(nextTrack.videoId);
        log.info("Fallback playback started successfully via YouTube URL");
      } catch (fallbackError) {
        log.error("Both direct stream playback and YouTube URL fallback failed", {
          playError:
            playError instanceof Error ? playError.message : String(playError),
          fallbackError:
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError),
          videoId: nextTrack.videoId,
          trackTitle: nextTrack.title,
        });

        // 重置狀態，通知前端
        this.currentTrack = null;
        this.isPaused = false;
        this.broadcastState();

        // 拋出錯誤，讓調用者知道播放失敗
        throw new Error(
          `Failed to play track: ${nextTrack.title}. Error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        );
      }
    }
  }

  /**
   * 開始/恢復播放
   */
  play(): void {
    if (!this.currentTrack) {
      log.debug("Ignoring play request without an active track");
      return;
    }

    if (!this.isPaused && getPlayerService().isCurrentlyPlaying()) {
      return;
    }

    this.isPaused = false;
    getPlayerService().resume();
    this.broadcastState();
    this.broadcastProgress({ force: true });
  }

  /**
   * 暫停播放
   */
  pause(): void {
    if (!this.currentTrack) {
      log.debug("Ignoring pause request without an active track");
      return;
    }

    if (this.isPaused) {
      return;
    }

    this.isPaused = true;
    getPlayerService().pause();
    this.broadcastState();
    this.broadcastProgress({ force: true });
  }

  /**
   * 暫停/繼續播放
   */
  togglePlayPause(): void {
    if (this.isPaused) {
      this.play();
    } else {
      this.pause();
    }
  }

  /**
   * 跳過當前歌曲
   */
  skip(): void {
    log.info("Skipping current track");
    this.playNext();
  }

  enableRadio(): void {
    if (this.radioEnabled) {
      return;
    }

    this.radioEnabled = true;
    this.broadcastState();
    this.broadcastProgress({ force: true });
    this.maybeHydrateRadioQueue({ force: true });
  }

  disableRadio(): void {
    if (!this.radioEnabled) {
      return;
    }

    this.radioEnabled = false;
    this.broadcastState();
    this.broadcastProgress({ force: true });
  }

  toggleRadio(): void {
    if (this.radioEnabled) {
      this.disableRadio();
      return;
    }

    this.enableRadio();
  }

  /**
   * 設定音量
   */
  setVolume(volume: number): void {
    getPlayerService().setVolume(volume);
    this.broadcastState();
  }

  /**
   * 跳轉到指定位置
   */
  seekTo(position: number): void {
    // 驗證輸入和邊界
    if (!Number.isFinite(position) || position < 0) {
      log.warn("Invalid seek position", { position });
      return;
    }

    if (!this.currentTrack) {
      log.warn("Cannot seek: no current track");
      return;
    }

    // 限制在當前歌曲的 duration 範圍內
    const clampedPosition = Math.min(position, this.currentDuration);

    log.debug("Seeking to position", { position: clampedPosition });
    this.currentPosition = clampedPosition;
    getPlayerService().seek(clampedPosition);
    this.broadcastProgress({ force: true });
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
      isPlaying: this.getIsPlaying(),
      currentTrack: this.currentTrack,
      position: this.currentPosition,
      duration: this.currentDuration,
      volume: getPlayerService().getVolume(),
      queue: [...this.queue],
      radioEnabled: this.radioEnabled,
      lastPlayedTrack: this.lastPlayedTrack,
    };
  }

  getProgress(): PlaybackProgress {
    return {
      trackId: this.currentTrack?.videoId ?? null,
      position: this.currentPosition,
      duration: this.currentDuration,
      isPlaying: this.getIsPlaying(),
    };
  }

  async replaceQueueWithTracks(
    tracks: Track[],
    origin: QueueOrigin = "playlist",
    options: { requestedBy?: Track["requestedBy"] } = {},
  ): Promise<void> {
    await getPlayerService().stop();
    const requester = this.resolveRequester(options.requestedBy, null, tracks);

    this.queue = tracks.map((track) =>
      this.withOrigin(this.withRequester(track, requester), origin),
    );
    this.currentTrack = null;
    this.currentPosition = 0;
    this.currentDuration = 0;
    this.isPaused = false;

    this.broadcastQueueChange();
    this.broadcastState();

    if (this.queue.length > 0) {
      await this.playNext();
    }
  }

  async appendTracksToQueue(
    tracks: Track[],
    origin: QueueOrigin = "playlist",
    options: { requestedBy?: Track["requestedBy"] } = {},
  ): Promise<void> {
    if (tracks.length === 0) {
      return;
    }
    const requester = this.resolveRequester(options.requestedBy, null, tracks);

    this.insertManualTracks(
      tracks.map((track) =>
        this.withOrigin(this.withRequester(track, requester), origin),
      ),
      origin === "manual" || origin === "playlist",
    );
    this.broadcastQueueChange();
    this.broadcastState();

    const playerIsPlaying = getPlayerService().isCurrentlyPlaying();
    const shouldAutoPlay = this.currentTrack === null && !playerIsPlaying;

    if (shouldAutoPlay) {
      await this.playNext();
      return;
    }

    this.maybeHydrateRadioQueue();
  }

  renameRequesterProfile(profileId: string, profileName: string): void {
    const normalizedProfileId = profileId.trim();
    const normalizedProfileName = profileName.trim();

    if (!normalizedProfileId || !normalizedProfileName) {
      return;
    }

    let didChange = false;

    const renamedQueue = this.queue.map((track) => {
      const nextTrack =
        this.withRenamedRequester(
        track,
        normalizedProfileId,
        normalizedProfileName,
        ) ?? track;

      if (nextTrack !== track) {
        didChange = true;
      }

      return nextTrack;
    });
    const renamedCurrentTrack = this.withRenamedRequester(
      this.currentTrack,
      normalizedProfileId,
      normalizedProfileName,
    );
    const renamedLastPlayedTrack = this.withRenamedRequester(
      this.lastPlayedTrack,
      normalizedProfileId,
      normalizedProfileName,
    );

    if (renamedCurrentTrack !== this.currentTrack) {
      didChange = true;
    }

    if (renamedLastPlayedTrack !== this.lastPlayedTrack) {
      didChange = true;
    }

    if (!didChange) {
      return;
    }

    this.queue = renamedQueue;
    this.currentTrack = renamedCurrentTrack;
    this.lastPlayedTrack = renamedLastPlayedTrack;
    this.broadcastQueueChange();
    this.broadcastState();
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
      this.currentTrack.duration,
    );
  }

  /**
   * 獲取並廣播歌詞（異步）
   */
  private fetchAndBroadcastLyrics(): void {
    // 使用異步方式獲取歌詞，避免阻塞播放
    this.getLyrics()
      .then((lyrics) => {
        // 透過回調通知歌詞變更
        for (const callback of this.lyricsChangeCallbacks) {
          callback(lyrics);
        }
        log.debug("Lyrics broadcasted", { lyricsCount: lyrics.length });
      })
      .catch((error) => {
        log.error("Failed to fetch lyrics", { error });
      });
  }

  resetForTests(): void {
    this.mixRequestId = 0;
    this.radioRequestId = 0;
    this.queue = [];
    this.currentTrack = null;
    this.lastPlayedTrack = null;
    this.currentPosition = 0;
    this.currentDuration = 0;
    this.isPaused = false;
    this.radioEnabled = false;
    this.recentRadioTrackIds = [];
    this.radioFillPromise = null;
    this.lastEofTimestamp = 0;
    this.queueChangeCallbacks = [];
    this.stateChangeCallbacks = [];
    this.progressChangeCallbacks = [];
    this.lyricsChangeCallbacks = [];
    this.lastProgressBroadcastAt = 0;
    this.lastProgressPayload = null;

    if (this.pendingProgressTimeout) {
      clearTimeout(this.pendingProgressTimeout);
      this.pendingProgressTimeout = null;
    }
  }

  private getIsPlaying(): boolean {
    return !this.isPaused && this.currentTrack !== null;
  }

  private withOrigin(track: Track, origin: QueueOrigin): Track {
    return {
      ...track,
      queueOrigin: origin,
      radioGenerated: origin === "radio",
    };
  }

  private withRequester(
    track: Track,
    requestedBy?: Track["requestedBy"],
  ): Track {
    if (!isValidRequester(requestedBy)) {
      return track;
    }

    if (
      track.requestedBy?.profileId === requestedBy.profileId &&
      track.requestedBy.profileName === requestedBy.profileName
    ) {
      return track;
    }

    return {
      ...track,
      requestedBy,
    };
  }

  private withRenamedRequester(
    track: Track | null,
    profileId: string,
    profileName: string,
  ): Track | null {
    if (
      !track?.requestedBy ||
      track.requestedBy.profileId !== profileId ||
      track.requestedBy.profileName === profileName
    ) {
      return track;
    }

    return {
      ...track,
      requestedBy: {
        ...track.requestedBy,
        profileName,
      },
    };
  }

  private resolveRequester(
    requestedBy?: Track["requestedBy"],
    sourceTrack: Track | null = null,
    sourceTracks: Track[] = [],
  ): Track["requestedBy"] | undefined {
    if (isValidRequester(requestedBy)) {
      return requestedBy;
    }

    const sourceRequester = sourceTrack?.requestedBy;
    if (isValidRequester(sourceRequester)) {
      return sourceRequester;
    }

    for (const track of sourceTracks) {
      if (isValidRequester(track.requestedBy)) {
        return track.requestedBy;
      }
    }

    return undefined;
  }

  private insertManualTracks(
    tracks: Track[],
    prioritizeAheadOfRadio: boolean = true,
  ): void {
    const normalizedTracks = tracks.map((track) =>
      this.withOrigin(track, track.queueOrigin ?? "manual"),
    );

    if (!prioritizeAheadOfRadio) {
      this.queue.push(...normalizedTracks);
      return;
    }

    const firstRadioIndex = this.queue.findIndex((track) => track.radioGenerated);

    if (firstRadioIndex === -1) {
      this.queue.push(...normalizedTracks);
      return;
    }

    this.queue.splice(firstRadioIndex, 0, ...normalizedTracks);
  }

  private maybeHydrateRadioQueue(options: { force?: boolean } = {}): void {
    if (!this.radioEnabled) {
      return;
    }

    const lowWatermark = 3;
    if (!options.force && this.queue.length > lowWatermark) {
      return;
    }

    void this.ensureRadioTracks({
      immediatePlayback: false,
      seedTrack: this.currentTrack ?? this.lastPlayedTrack,
    });
  }

  private async ensureRadioTracks(options: {
    immediatePlayback: boolean;
    seedTrack: Track | null;
  }): Promise<boolean> {
    if (!this.radioEnabled) {
      return false;
    }

    if (this.radioFillPromise) {
      await this.radioFillPromise;
      return this.queue.length > 0;
    }

    const seedTrack = options.seedTrack;
    if (!seedTrack?.videoId) {
      return false;
    }

    const existingTrackIds = new Set(
      [this.currentTrack, this.lastPlayedTrack, ...this.queue]
        .filter((track): track is Track => Boolean(track))
        .map((track) => track.videoId),
    );

    const requestId = ++this.radioRequestId;
    this.radioFillPromise = (async () => {
      try {
        const mixTracks = await getMusicService().getMixTracks(seedTrack.videoId, 8);

        if (requestId !== this.radioRequestId || !this.radioEnabled) {
          return;
        }

        const nextTracks = selectRadioCandidates(
          mixTracks,
          existingTrackIds,
          this.recentRadioTrackIds,
          5,
        ).map((track) => this.withOrigin(track, "radio"));

        if (nextTracks.length === 0) {
          return;
        }

        this.queue.push(...nextTracks);
        this.broadcastQueueChange();
        this.broadcastState();

        if (
          options.immediatePlayback &&
          this.currentTrack === null &&
          !getPlayerService().isCurrentlyPlaying() &&
          this.queue.length > 0
        ) {
          await this.playNext();
        }
      } catch (error) {
        log.warn("Failed to hydrate radio queue", {
          error: error instanceof Error ? error.message : String(error),
          seedTrack: seedTrack.title,
        });
      } finally {
        this.radioFillPromise = null;
      }
    })();

    await this.radioFillPromise;
    return this.queue.length > 0;
  }

  private rememberRecentlyPlayed(videoId: string): void {
    this.recentRadioTrackIds = pushRecentTrackId(
      this.recentRadioTrackIds,
      videoId,
      20,
    );
  }
}

function isSameProgress(
  left: PlaybackProgress | null,
  right: PlaybackProgress,
): boolean {
  if (!left) {
    return false;
  }

  return (
    left.trackId === right.trackId &&
    left.position === right.position &&
    left.duration === right.duration &&
    left.isPlaying === right.isPlaying
  );
}

function isValidRequester(
  requestedBy: Track["requestedBy"] | undefined,
): requestedBy is NonNullable<Track["requestedBy"]> {
  return Boolean(
    requestedBy?.profileId?.trim() && requestedBy.profileName?.trim(),
  );
}

export function getQueueService(): QueueService {
  return QueueService.getInstance();
}

export function __resetQueueServiceForTests(): void {
  QueueService.resetInstanceForTests();
}
