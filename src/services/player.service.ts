import { spawn, type ChildProcess } from 'node:child_process';
import { connect, type Socket } from 'node:net';

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
    if (process.platform === 'win32') {
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
      throw new Error('IPC path not set');
    }

    return new Promise<void>((resolve, reject) => {
      const attemptConnect = () => {
        console.log('Attempting IPC connection:', this.ipcPath);

        this.ipcSocket = connect(this.ipcPath!);

        this.ipcSocket.on('connect', () => {
          console.log('IPC socket connected');
          this.ipcConnectRetries = 0;

          // 監聽屬性變化
          this.sendIpcCommand(['observe_property', 1, 'time-pos']);
          this.sendIpcCommand(['observe_property', 2, 'duration']);
          this.sendIpcCommand(['observe_property', 3, 'pause']);
          this.sendIpcCommand(['observe_property', 4, 'eof-reached']);

          resolve();
        });

        this.ipcSocket.on('data', (data: Buffer) => {
          this.handleIpcMessage(data.toString());
        });

        this.ipcSocket.on('error', (err: Error) => {
          console.log('IPC socket error:', err.message);

          const maxRetries = process.platform === 'win32'
            ? this.maxIpcRetries * 2
            : this.maxIpcRetries;

          if (this.ipcConnectRetries < maxRetries) {
            this.ipcConnectRetries++;
            setTimeout(attemptConnect, process.platform === 'win32' ? 250 : 100);
          } else {
            reject(new Error(`Failed to connect to IPC socket after ${maxRetries} attempts`));
          }
        });

        this.ipcSocket.on('close', () => {
          console.log('IPC socket closed');
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
      console.warn('Cannot send IPC command: socket not connected');
      return;
    }

    const message = JSON.stringify({ command }) + '\n';
    this.ipcSocket.write(message);
  }

  /**
   * 處理來自 mpv 的 IPC 訊息
   */
  private handleIpcMessage(data: string): void {
    const lines = data.trim().split('\n');

    for (const line of lines) {
      try {
        const message = JSON.parse(line);

        if (message.event === 'property-change') {
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
  private handlePropertyChange(message: { name: string; data: number | boolean }): void {
    if (!this.eventCallback) return;

    const event: {
      timePos?: number;
      duration?: number;
      paused?: boolean;
      eof?: boolean;
    } = {};

    switch (message.name) {
      case 'time-pos':
        event.timePos = message.data as number;
        break;

      case 'duration':
        event.duration = message.data as number;
        break;

      case 'pause':
        event.paused = message.data as boolean;
        break;

      case 'eof-reached':
        event.eof = message.data as boolean;
        if (event.eof) {
          this.isPlaying = false;
          console.log('End of file reached');
        }
        break;
    }

    this.eventCallback(event);
  }

  /**
   * 播放 YouTube 影片（只播放音訊）
   */
  async play(videoId: string, volume?: number): Promise<void> {
    console.log('Playing:', videoId, 'volume:', volume ?? this.currentVolume);

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

    return new Promise<void>((resolve, reject) => {
      try {
        const mpvArgs = [
          '--no-video',
          '--no-terminal',
          `--volume=${this.currentVolume}`,
          '--no-audio-display',
          '--really-quiet',
          '--msg-level=all=error',
          `--input-ipc-server=${this.ipcPath}`,
          '--idle=yes',
          '--cache=yes',
          '--cache-secs=30',
          '--network-timeout=10',
          '--gapless-audio=yes',
          url,
        ];

        const mpvCommand = process.platform === 'win32' ? 'mpv.exe' : 'mpv';

        const spawnedProcess = spawn(mpvCommand, mpvArgs, {
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
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
        const ipcDelay = process.platform === 'win32' ? 500 : 200;
        setTimeout(() => {
          this.connectIpc()
            .then(() => {
              console.log('IPC connected successfully');
              handleSuccess();
            })
            .catch(error => {
              console.warn('Failed to connect IPC:', error.message);
              // 即使 IPC 連接失敗，基本播放仍會繼續
              handleSuccess();
            });
        }, ipcDelay);

        // 處理 stderr
        spawnedProcess.stderr?.on('data', (data: Buffer) => {
          const error = data.toString().trim();
          if (error) {
            console.error('mpv error:', error);
          }
        });

        // 處理進程退出
        spawnedProcess.on('exit', (code, signal) => {
          console.log('mpv process exited:', code, signal);

          if (this.mpvProcess === spawnedProcess) {
            this.isPlaying = false;
            this.mpvProcess = null;
          }

          if (code === 0) {
            handleSuccess();
          } else if (code !== null && code > 0) {
            handleError(new Error(`mpv exited with code ${code}`));
          }
        });

        // 處理錯誤
        spawnedProcess.on('error', (error: Error) => {
          console.error('mpv process error:', error.message);

          if (this.mpvProcess === spawnedProcess) {
            this.isPlaying = false;
            this.mpvProcess = null;
          }

          if ('code' in error && error.code === 'ENOENT') {
            handleError(
              new Error(
                "mpv executable not found. Install mpv and ensure it's in PATH.",
              ),
            );
            return;
          }

          handleError(error);
        });

        console.log('mpv process started');
      } catch (error) {
        console.error('Exception in play():', error);
        this.isPlaying = false;
        reject(error);
      }
    });
  }

  pause(): void {
    console.log('Pausing playback');
    this.isPlaying = false;
    if (this.ipcSocket && !this.ipcSocket.destroyed) {
      this.sendIpcCommand(['set_property', 'pause', true]);
    }
  }

  resume(): void {
    console.log('Resuming playback');
    this.isPlaying = true;
    if (this.ipcSocket && !this.ipcSocket.destroyed) {
      this.sendIpcCommand(['set_property', 'pause', false]);
    }
  }

  stop(): void {
    console.log('Stopping playback');

    // 關閉 IPC socket
    if (this.ipcSocket && !this.ipcSocket.destroyed) {
      this.ipcSocket.destroy();
      this.ipcSocket = null;
    }

    // 終止 mpv 進程
    if (this.mpvProcess) {
      try {
        this.mpvProcess.kill('SIGTERM');
        this.mpvProcess = null;
        this.isPlaying = false;
        console.log('mpv process killed');
      } catch (error) {
        console.error('Error killing mpv process:', error);
      }
    }

    this.ipcPath = null;
    this.ipcConnectRetries = 0;
  }

  setVolume(volume: number): void {
    this.currentVolume = Math.max(0, Math.min(100, volume));
    console.log('Setting volume to:', this.currentVolume);

    if (this.ipcSocket && !this.ipcSocket.destroyed) {
      this.sendIpcCommand(['set_property', 'volume', this.currentVolume]);
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
