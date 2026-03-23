import { spawn, execSync, type ChildProcess } from "node:child_process";
import { connect, type Socket } from "node:net";
import { log } from "../utils/logger.ts";
import { getMpvYtdlRawOptions } from "../utils/ytdlp.ts";
import { getMpvExecutable } from "../utils/runtime-dependencies.ts";

export type PlayerEventCallback = (event: {
  timePos?: number;
  duration?: number;
  paused?: boolean;
  eof?: boolean; // end of file (播放結束)
}) => void;

class PlayerService {
  private static instance: PlayerService;
  private readonly playbackConfirmationTimeoutMs = 2500;
  private mpvProcess: ChildProcess | null = null;
  private intentionallyStoppedProcesses = new WeakSet<ChildProcess>();
  private ipcSocket: Socket | null = null;
  private ipcPath: string | null = null;
  private currentVolume = 70;
  private isPlaying = false;
  private eventCallback: PlayerEventCallback | null = null;
  private ipcConnectRetries = 0;
  // 增加重試次數以支援慢速系統（如樹莓派的 yt-dlp 解析需要 10+ 秒）
  private readonly maxIpcRetries = 60;
  private playSessionId = 0;
  private eofHandled = false;
  private pendingPlaybackConfirmation:
    | {
        process: ChildProcess;
        timer: ReturnType<typeof setTimeout>;
        confirm: () => void;
        reject: (error: Error) => void;
      }
    | null = null;

  private constructor() {
    // 在啟動時清理可能殘留的舊 mpv 進程
    this.cleanupOrphanedMpvProcesses();

    // 監聽進程退出信號，確保清理 mpv 進程
    this.setupExitHandlers();
  }

  /**
   * 清理可能殘留的舊 mpv 進程（從之前的伺服器實例）
   */
  private cleanupOrphanedMpvProcesses(): void {
    try {
      if (process.platform === "win32") {
        // Windows: 使用 taskkill（但要小心不要殺死其他 mpv 實例）
        // 這裡我們選擇不自動清理 Windows 上的進程
        log.debug("Skipping orphaned mpv cleanup on Windows");
      } else {
        // macOS/Linux: 查找並終止使用我們 IPC socket 模式的 mpv 進程
        const result = execSync(
          `pgrep -f "input-ipc-server=/tmp/mpvsocket-" 2>/dev/null || true`,
          { encoding: "utf-8" },
        );
        const pids = result.trim().split("\n").filter(Boolean);

        if (pids.length > 0) {
          log.info("Found orphaned mpv processes, cleaning up", { pids });
          for (const pid of pids) {
            try {
              process.kill(parseInt(pid, 10), "SIGTERM");
            } catch (e) {
              // 進程可能已經結束
            }
          }
        }
      }
    } catch (error) {
      // 忽略錯誤，這只是清理嘗試
      log.debug("Orphaned mpv cleanup skipped", { error });
    }
  }

  /**
   * 設置進程退出處理器
   */
  private setupExitHandlers(): void {
    const cleanup = () => {
      log.info("Server shutting down, cleaning up mpv process");
      this.stop();
    };

    // 只設置一次
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("exit", cleanup);
  }

  static getInstance(): PlayerService {
    if (!PlayerService.instance) {
      PlayerService.instance = new PlayerService();
    }
    return PlayerService.instance;
  }

  /**
   * 註冊事件回調（時間位置、時長、暫停狀態、播放結束等）
   */
  onEvent(callback: PlayerEventCallback): void {
    this.eventCallback = callback;
  }

  /**
   * 生成 IPC socket 路徑（每次播放都不同）
   */
  private getIpcPath(): string {
    if (process.platform === "win32") {
      return `\\\\.\\pipe\\mpvsocket-${process.pid}-${this.playSessionId}`;
    } else {
      return `/tmp/mpvsocket-${process.pid}-${this.playSessionId}`;
    }
  }

  /**
   * 連接 mpv IPC socket
   */
  private async connectIpc(): Promise<void> {
    if (!this.ipcPath) {
      throw new Error("IPC path not set");
    }

    return new Promise<void>((resolve, reject) => {
      const attemptConnect = () => {
        log.debug("Attempting IPC connection", { path: this.ipcPath });

        const socket = connect(this.ipcPath!);
        this.ipcSocket = socket;

        socket.on("connect", () => {
          if (this.ipcSocket !== socket) {
            log.debug("Ignoring stale IPC socket connection");
            socket.destroy();
            return;
          }

          log.info("IPC socket connected");
          this.ipcConnectRetries = 0;

          // 監聽屬性變化
          this.sendIpcCommand(["observe_property", 1, "time-pos"]);
          this.sendIpcCommand(["observe_property", 2, "duration"]);
          this.sendIpcCommand(["observe_property", 3, "pause"]);
          this.sendIpcCommand(["observe_property", 4, "eof-reached"]);
          this.sendIpcCommand(["observe_property", 5, "idle-active"]); // 新增：監聽 idle 狀態

          resolve();
        });

        socket.on("data", (data: Buffer) => {
          if (this.ipcSocket !== socket) {
            log.debug("Ignoring stale IPC socket payload");
            return;
          }

          this.handleIpcMessage(data.toString());
        });

        socket.on("error", (err: Error) => {
          if (this.ipcSocket !== socket) {
            log.debug("Ignoring stale IPC socket error", { error: err.message });
            return;
          }

          log.debug("IPC socket error", { error: err.message });

          const maxRetries =
            process.platform === "win32"
              ? this.maxIpcRetries * 2
              : this.maxIpcRetries;

          if (this.ipcConnectRetries < maxRetries) {
            this.ipcConnectRetries++;
            // 增加重試間隔以支援慢速系統（樹莓派 yt-dlp 需要 10+ 秒）
            setTimeout(
              attemptConnect,
              process.platform === "win32" ? 500 : 500,
            );
          } else {
            reject(
              new Error(
                `Failed to connect to IPC socket after ${maxRetries} attempts`,
              ),
            );
          }
        });

        socket.on("close", () => {
          if (this.ipcSocket !== socket) {
            return;
          }

          log.debug("IPC socket closed");
          this.ipcSocket = null;
        });
      };

      attemptConnect();
    });
  }

  /**
   * 發送 IPC 命令給 mpv
   */
  private sendIpcCommand(command: unknown[]): void {
    if (!this.ipcSocket || this.ipcSocket.destroyed) {
      log.warn("Cannot send IPC command: socket not connected");
      return;
    }

    const message = JSON.stringify({ command }) + "\n";
    this.ipcSocket.write(message);
  }

  /**
   * 處理來自 mpv 的 IPC 訊息
   */
  private handleIpcMessage(data: string): void {
    const lines = data.trim().split("\n");
    log.debug("IPC message received", {
      rawData: data.substring(0, 200),
      lineCount: lines.length,
    });

    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        log.debug("IPC parsed", {
          event: message.event,
          name: message.name,
          data: message.data,
        });

        if (message.event === "property-change") {
          this.handlePropertyChange(message);
        }
      } catch (err) {
        // 忽略無法解析的訊息
      }
    }
  }

  /**
   * 處理屬性變化事件
   */
  private handlePropertyChange(message: {
    name: string;
    data: number | boolean;
  }): void {
    // 記錄所有屬性變化（除了高頻的 time-pos）
    if (message.name !== "time-pos") {
      log.info("Property change", { name: message.name, data: message.data });
    }

    const event: {
      timePos?: number;
      duration?: number;
      paused?: boolean;
      eof?: boolean;
    } = {};

    switch (message.name) {
      case "time-pos":
        event.timePos = message.data as number;
        if (typeof message.data === "number" && message.data > 0) {
          this.confirmPlaybackStarted();
        }
        break;

      case "duration":
        event.duration = message.data as number;
        break;

      case "pause":
        event.paused = message.data as boolean;
        break;

      case "eof-reached":
        event.eof = message.data as boolean;
        if (event.eof) {
          this.isPlaying = false;
          this.eofHandled = true;
          log.info("End of file reached");
        }
        break;

      case "idle-active":
        // mpv 進入 idle 模式時作為備用 EOF 檢測
        if (message.data === true && !this.eofHandled) {
          log.info("mpv entered idle mode, triggering EOF fallback");
          this.isPlaying = false;
          this.eofHandled = true;
          event.eof = true;
        } else if (message.data === true) {
          log.debug("mpv idle mode already handled via eof-reached");
        }
        break;
    }

    if (!this.eventCallback) return;

    this.eventCallback(event);
  }

  private beginPlaybackConfirmation(
    process: ChildProcess,
    handleSuccess: () => void,
    handleError: (err: Error) => void,
  ): void {
    this.clearPlaybackConfirmation();

    const confirm = () => {
      if (this.pendingPlaybackConfirmation?.process !== process) {
        return;
      }

      clearTimeout(this.pendingPlaybackConfirmation.timer);
      this.pendingPlaybackConfirmation = null;
      handleSuccess();
    };

    const reject = (error: Error) => {
      if (this.pendingPlaybackConfirmation?.process !== process) {
        return;
      }

      clearTimeout(this.pendingPlaybackConfirmation.timer);
      this.pendingPlaybackConfirmation = null;
      handleError(error);
    };

    const timer = setTimeout(() => {
      log.info("Playback confirmation timeout elapsed; treating playback as started", {
        timeoutMs: this.playbackConfirmationTimeoutMs,
      });
      confirm();
    }, this.playbackConfirmationTimeoutMs);

    this.pendingPlaybackConfirmation = {
      process,
      timer,
      confirm,
      reject,
    };
  }

  private confirmPlaybackStarted(): void {
    this.pendingPlaybackConfirmation?.confirm();
  }

  private rejectPlaybackConfirmation(
    process: ChildProcess,
    error: Error,
  ): boolean {
    if (this.pendingPlaybackConfirmation?.process !== process) {
      return false;
    }

    this.pendingPlaybackConfirmation.reject(error);
    return true;
  }

  private clearPlaybackConfirmation(process?: ChildProcess): void {
    if (
      !this.pendingPlaybackConfirmation ||
      (process && this.pendingPlaybackConfirmation.process !== process)
    ) {
      return;
    }

    clearTimeout(this.pendingPlaybackConfirmation.timer);
    this.pendingPlaybackConfirmation = null;
  }

  private markProcessAsIntentionallyStopped(
    process: ChildProcess | null,
  ): void {
    if (process) {
      this.intentionallyStoppedProcesses.add(process);
    }
  }

  private consumeIntentionallyStoppedProcess(process: ChildProcess): boolean {
    if (!this.intentionallyStoppedProcesses.has(process)) {
      return false;
    }

    this.intentionallyStoppedProcesses.delete(process);
    return true;
  }

  private handleSpawnedProcessExit(
    spawnedProcess: ChildProcess,
    code: number | null,
    signal: NodeJS.Signals | null,
    handleSuccess: () => void,
    handleError: (err: Error) => void,
  ): void {
    const intentionallyStopped =
      this.consumeIntentionallyStoppedProcess(spawnedProcess);

    log.info("mpv process exited", {
      code,
      signal,
      eofHandled: this.eofHandled,
      isPlaying: this.isPlaying,
      intentionallyStopped,
    });

    if (this.mpvProcess === spawnedProcess) {
      this.isPlaying = false;
      this.mpvProcess = null;
    }

    if (intentionallyStopped) {
      this.clearPlaybackConfirmation(spawnedProcess);
      log.info("Ignoring exit from intentionally stopped mpv process");
      handleSuccess();
      return;
    }

    if (code === 0) {
      this.clearPlaybackConfirmation(spawnedProcess);
      log.info("Checking if need to trigger EOF from exit", {
        eofHandled: this.eofHandled,
      });
      // 只在 IPC 未發送 eof 時才手動觸發
      if (!this.eofHandled && this.eventCallback) {
        log.info("Triggering EOF from process exit (fallback)");
        this.eventCallback({ eof: true });
      }
      handleSuccess();
    } else if (code !== null && code > 0) {
      if (
        this.rejectPlaybackConfirmation(
          spawnedProcess,
          new Error(`mpv exited with code ${code}`),
        )
      ) {
        return;
      }

      handleError(new Error(`mpv exited with code ${code}`));
    }
  }

  /**
   * 播放 YouTube 影片（只播放音訊）
   */
  async play(videoId: string, volume?: number): Promise<void> {
    log.info("Playing video", {
      videoId,
      volume: volume ?? this.currentVolume,
    });

    // 停止當前播放
    this.stop();

    if (volume !== undefined) {
      this.currentVolume = volume;
    }

    // 建立 YouTube URL
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // 遞增 session ID（每次播放都有唯一的 IPC 路徑）
    this.playSessionId++;
    this.ipcPath = this.getIpcPath();
    this.eofHandled = false;

    return new Promise<void>((resolve, reject) => {
      try {
        // 根據平台選擇音頻輸出參數
        const getAudioArgs = (): string[] => {
          if (process.platform === "darwin") {
            log.debug("Using CoreAudio for macOS");
            return ["--ao=coreaudio"]; // macOS 使用 CoreAudio
          } else if (process.platform === "win32") {
            log.debug("Using WASAPI for Windows");
            return ["--ao=wasapi"]; // Windows 使用 WASAPI
          } else {
            // Linux: 嘗試 PulseAudio 優先，ALSA 備選
            log.debug("Using PulseAudio/ALSA for Linux");
            return ["--ao=pulse,alsa"];
          }
        };

        const ytdlRawOptions = getMpvYtdlRawOptions();

        const mpvArgs = [
          "--no-video",
          `--volume=${this.currentVolume}`,
          "--no-audio-display",
          "--msg-level=all=info",
          `--input-ipc-server=${this.ipcPath}`,
          "--cache=yes",
          "--cache-secs=30",
          "--network-timeout=60", // 增加超時時間（樹莓派需要更長）
          "--gapless-audio=yes",
          ...(ytdlRawOptions.length > 0
            ? [`--ytdl-raw-options=${ytdlRawOptions.join(",")}`]
            : []),
          ...getAudioArgs(),
          url,
        ];

        const mpvCommand = getMpvExecutable();

        log.info("Spawning mpv process", {
          command: mpvCommand,
          argsCount: mpvArgs.length,
          ipcPath: this.ipcPath,
          platform: process.platform,
        });

        const spawnedProcess = spawn(mpvCommand, mpvArgs, {
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });

        this.mpvProcess = spawnedProcess;
        this.isPlaying = true;
        let isResolved = false;

        const handleSuccess = () => {
          if (!isResolved) {
            isResolved = true;
            resolve();
          }
        };

        const handleError = (err: Error) => {
          if (!isResolved) {
            isResolved = true;
            reject(err);
          }
        };

        // 延遲連接 IPC（Windows 需要更長時間）
        const ipcDelay = process.platform === "win32" ? 500 : 200;
        setTimeout(() => {
          this.connectIpc()
            .then(() => {
              log.info("IPC connected successfully");
              this.beginPlaybackConfirmation(
                spawnedProcess,
                handleSuccess,
                handleError,
              );
            })
            .catch((error) => {
              log.error(
                "Failed to connect IPC - playback will continue without state sync",
                {
                  error: error.message,
                  ipcPath: this.ipcPath,
                },
              );
              // 仍然返回成功，但記錄這是降級模式
              handleSuccess();
            });
        }, ipcDelay);

        // 處理 stderr
        spawnedProcess.stderr?.on("data", (data: Buffer) => {
          const error = data.toString().trim();
          if (error) {
            log.warn("mpv stderr", { output: error });
          }
        });

        // 處理 stdout（診斷用）
        spawnedProcess.stdout?.on("data", (data: Buffer) => {
          const output = data.toString().trim();
          if (output) {
            log.debug("mpv stdout", { output: output.substring(0, 200) });
          }
        });

        // 處理進程退出
        spawnedProcess.on("exit", (code, signal) => {
          this.handleSpawnedProcessExit(
            spawnedProcess,
            code,
            signal,
            handleSuccess,
            handleError,
          );
        });

        // 處理錯誤
        spawnedProcess.on("error", (error: Error) => {
          log.error("mpv process error", { error: error.message });

          if (this.mpvProcess === spawnedProcess) {
            this.isPlaying = false;
            this.mpvProcess = null;
          }

          if ("code" in error && error.code === "ENOENT") {
            handleError(
              new Error(
                "mpv executable not found. Install mpv and ensure it's in PATH.",
              ),
            );
            return;
          }

          handleError(error);
        });

        log.debug("mpv process started");
      } catch (error) {
        log.error("Exception in play()", { error });
        this.isPlaying = false;
        reject(error);
      }
    });
  }

  /**
   * 直接播放串流 URL（不需要 yt-dlp 解析）
   */
  async playUrl(streamUrl: string, volume?: number): Promise<void> {
    log.info("Playing stream URL", {
      volume: volume ?? this.currentVolume,
    });

    // 停止當前播放
    this.stop();

    if (volume !== undefined) {
      this.currentVolume = volume;
    }

    // 遞增 session ID（每次播放都有唯一的 IPC 路徑）
    this.playSessionId++;
    this.ipcPath = this.getIpcPath();
    this.eofHandled = false;

    return new Promise<void>((resolve, reject) => {
      try {
        // 根據平台選擇音頻輸出參數
        const getAudioArgs = (): string[] => {
          if (process.platform === "darwin") {
            log.debug("Using CoreAudio for macOS");
            return ["--ao=coreaudio"];
          } else if (process.platform === "win32") {
            log.debug("Using WASAPI for Windows");
            return ["--ao=wasapi"];
          } else {
            log.debug("Using PulseAudio/ALSA for Linux");
            return ["--ao=pulse,alsa"];
          }
        };

        const mpvArgs = [
          "--no-video",
          `--volume=${this.currentVolume}`,
          "--no-audio-display",
          "--msg-level=all=info",
          `--input-ipc-server=${this.ipcPath}`,
          "--cache=yes",
          "--cache-secs=30",
          "--network-timeout=30",
          "--gapless-audio=yes",
          ...getAudioArgs(), // 動態音頻參數
          streamUrl, // 直接使用串流 URL
        ];

        const mpvCommand = getMpvExecutable();

        log.info("Spawning mpv process for stream URL", {
          command: mpvCommand,
          argsCount: mpvArgs.length,
          ipcPath: this.ipcPath,
          platform: process.platform,
          urlLength: streamUrl.length,
        });

        const spawnedProcess = spawn(mpvCommand, mpvArgs, {
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });

        this.mpvProcess = spawnedProcess;
        this.isPlaying = true;
        let isResolved = false;

        const handleSuccess = () => {
          if (!isResolved) {
            isResolved = true;
            resolve();
          }
        };

        const handleError = (err: Error) => {
          if (!isResolved) {
            isResolved = true;
            reject(err);
          }
        };

        // 延遲連接 IPC（Windows 需要更長時間）
        const ipcDelay = process.platform === "win32" ? 500 : 200;
        setTimeout(() => {
          this.connectIpc()
            .then(() => {
              log.info("IPC connected successfully");
              this.beginPlaybackConfirmation(
                spawnedProcess,
                handleSuccess,
                handleError,
              );
            })
            .catch((error) => {
              log.error(
                "Failed to connect IPC - playback will continue without state sync",
                {
                  error: error.message,
                  ipcPath: this.ipcPath,
                },
              );
              // 仍然返回成功，但記錄這是降級模式
              handleSuccess();
            });
        }, ipcDelay);

        // 處理 stderr
        spawnedProcess.stderr?.on("data", (data: Buffer) => {
          const error = data.toString().trim();
          if (error) {
            log.warn("mpv stderr", { output: error });
          }
        });

        // 處理 stdout（診斷用）
        spawnedProcess.stdout?.on("data", (data: Buffer) => {
          const output = data.toString().trim();
          if (output) {
            log.debug("mpv stdout", { output: output.substring(0, 200) });
          }
        });

        // 處理進程退出
        spawnedProcess.on("exit", (code, signal) => {
          this.handleSpawnedProcessExit(
            spawnedProcess,
            code,
            signal,
            handleSuccess,
            handleError,
          );
        });

        // 處理錯誤
        spawnedProcess.on("error", (error: Error) => {
          log.error("mpv process error", { error: error.message });

          if (this.mpvProcess === spawnedProcess) {
            this.isPlaying = false;
            this.mpvProcess = null;
          }

          if ("code" in error && error.code === "ENOENT") {
            handleError(
              new Error(
                "mpv executable not found. Install mpv and ensure it's in PATH.",
              ),
            );
            return;
          }

          handleError(error);
        });

        log.debug("mpv process started with stream URL");
      } catch (error) {
        log.error("Exception in playUrl()", { error });
        this.isPlaying = false;
        reject(error);
      }
    });
  }

  pause(): void {
    log.debug("Pausing playback");
    this.isPlaying = false;
    if (this.ipcSocket && !this.ipcSocket.destroyed) {
      this.sendIpcCommand(["set_property", "pause", true]);
    }
  }

  resume(): void {
    log.debug("Resuming playback");
    this.isPlaying = true;
    if (this.ipcSocket && !this.ipcSocket.destroyed) {
      this.sendIpcCommand(["set_property", "pause", false]);
    }
  }

  stop(): void {
    log.debug("Stopping playback");

    // 關閉 IPC socket
    if (this.ipcSocket && !this.ipcSocket.destroyed) {
      this.ipcSocket.destroy();
      this.ipcSocket = null;
    }

    // 終止 mpv 進程
    if (this.mpvProcess) {
      try {
        this.markProcessAsIntentionallyStopped(this.mpvProcess);
        this.mpvProcess.kill("SIGTERM");
        this.mpvProcess = null;
        this.isPlaying = false;
        log.debug("mpv process killed");
      } catch (error) {
        log.error("Error killing mpv process", { error });
      }
    }

    this.ipcPath = null;
    this.ipcConnectRetries = 0;
  }

  setVolume(volume: number): void {
    this.currentVolume = Math.max(0, Math.min(100, volume));
    log.debug("Setting volume", { volume: this.currentVolume });

    if (this.ipcSocket && !this.ipcSocket.destroyed) {
      this.sendIpcCommand(["set_property", "volume", this.currentVolume]);
    }
  }

  seek(position: number): void {
    // 檢查播放狀態
    if (!this.isPlaying || !this.mpvProcess) {
      log.warn("Cannot seek: no active playback");
      return;
    }

    // 驗證輸入
    if (!Number.isFinite(position) || position < 0) {
      log.warn("Invalid seek position", { position });
      return;
    }

    log.debug("Seeking to position", { position });
    if (this.ipcSocket && !this.ipcSocket.destroyed) {
      this.sendIpcCommand(["seek", position, "absolute"]);
    }
  }

  getVolume(): number {
    return this.currentVolume;
  }

  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  resetForTests(): void {
    this.stop();
    this.eventCallback = null;
    this.currentVolume = 70;
    this.isPlaying = false;
    this.intentionallyStoppedProcesses = new WeakSet<ChildProcess>();
    this.ipcConnectRetries = 0;
    this.playSessionId = 0;
    this.eofHandled = false;
    this.clearPlaybackConfirmation();
  }
}

export function getPlayerService(): PlayerService {
  return PlayerService.getInstance();
}

export function __resetPlayerServiceForTests(): void {
  PlayerService.getInstance().resetForTests();
}
