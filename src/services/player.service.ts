import { spawn, type ChildProcess } from "node:child_process";
import { connect, type Socket } from "node:net";
import { log } from "../utils/logger.ts";

export type PlayerEventCallback = (event: {
  timePos?: number;
  duration?: number;
  paused?: boolean;
  eof?: boolean; // end of file (播放結束)
}) => void;

class PlayerService {
  private static instance: PlayerService;
  private mpvProcess: ChildProcess | null = null;
  private ipcSocket: Socket | null = null;
  private ipcPath: string | null = null;
  private currentVolume = 70;
  private isPlaying = false;
  private eventCallback: PlayerEventCallback | null = null;
  private ipcConnectRetries = 0;
  private readonly maxIpcRetries = 10;
  private playSessionId = 0;
  private eofHandled = false;

  private constructor() {}

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

        this.ipcSocket = connect(this.ipcPath!);

        this.ipcSocket.on("connect", () => {
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

        this.ipcSocket.on("data", (data: Buffer) => {
          this.handleIpcMessage(data.toString());
        });

        this.ipcSocket.on("error", (err: Error) => {
          log.debug("IPC socket error", { error: err.message });

          const maxRetries =
            process.platform === "win32"
              ? this.maxIpcRetries * 2
              : this.maxIpcRetries;

          if (this.ipcConnectRetries < maxRetries) {
            this.ipcConnectRetries++;
            setTimeout(
              attemptConnect,
              process.platform === "win32" ? 250 : 100,
            );
          } else {
            reject(
              new Error(
                `Failed to connect to IPC socket after ${maxRetries} attempts`,
              ),
            );
          }
        });

        this.ipcSocket.on("close", () => {
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

    if (!this.eventCallback) return;

    const event: {
      timePos?: number;
      duration?: number;
      paused?: boolean;
      eof?: boolean;
    } = {};

    switch (message.name) {
      case "time-pos":
        event.timePos = message.data as number;
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

    this.eventCallback(event);
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
        const mpvArgs = [
          "--no-video",
          // 移除 "--no-terminal" - 在容器環境中會導致 mpv 立即退出
          `--volume=${this.currentVolume}`,
          "--no-audio-display",
          // 改為更詳細的日誌以便診斷
          "--msg-level=all=info",
          `--input-ipc-server=${this.ipcPath}`,
          // 移除 "--idle=yes" - 與直接播放 URL 衝突，導致 mpv 立即退出
          "--cache=yes",
          "--cache-secs=30",
          "--network-timeout=30", // 增加超時時間
          "--gapless-audio=yes",
          "--ao=alsa", // 強制使用 ALSA 音頻輸出
          "--audio-device=alsa/plughw:CARD=Headphones,DEV=0", // 明確指定音頻設備
          url,
        ];

        const mpvCommand = process.platform === "win32" ? "mpv.exe" : "mpv";

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
              console.log("IPC connected successfully");
              handleSuccess();
            })
            .catch((error) => {
              console.warn("Failed to connect IPC:", error.message);
              // 即使 IPC 連接失敗，基本播放仍會繼續
              handleSuccess();
            });
        }, ipcDelay);

        // 處理 stderr
        spawnedProcess.stderr?.on("data", (data: Buffer) => {
          const error = data.toString().trim();
          if (error) {
            console.error("mpv error:", error);
          }
        });

        // 處理進程退出
        spawnedProcess.on("exit", (code, signal) => {
          log.info("mpv process exited", {
            code,
            signal,
            eofHandled: this.eofHandled,
            isPlaying: this.isPlaying,
          });

          if (this.mpvProcess === spawnedProcess) {
            this.isPlaying = false;
            this.mpvProcess = null;
          }

          if (code === 0) {
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
            handleError(new Error(`mpv exited with code ${code}`));
          }
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
}

export function getPlayerService(): PlayerService {
  return PlayerService.getInstance();
}
