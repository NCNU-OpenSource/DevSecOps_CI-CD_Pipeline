import type { ServerWebSocket } from 'bun';
import type { WSMessage } from '../types/index.ts';
import { getQueueService } from '../services/queue.service.ts';

// 所有連接的客戶端
const clients = new Set<ServerWebSocket<unknown>>();

/**
 * 廣播訊息給所有客戶端
 */
export function broadcast(message: WSMessage): void {
  const data = JSON.stringify(message);
  for (const client of clients) {
    client.send(data);
  }
}

/**
 * WebSocket 訊息處理
 */
export function handleWebSocketMessage(ws: ServerWebSocket<unknown>, message: string): void {
  try {
    const data = JSON.parse(message) as WSMessage;
    const queueService = getQueueService();

    switch (data.type) {
      case 'play':
        queueService.togglePlayPause();
        break;

      case 'pause':
        queueService.togglePlayPause();
        break;

      case 'skip':
        queueService.skip();
        break;

      case 'volume':
        if ('value' in data && typeof data.value === 'number') {
          queueService.setVolume(data.value);
        }
        break;

      default:
        console.log('Unknown message type:', data.type);
    }
  } catch (error) {
    console.error('Failed to handle WebSocket message:', error);
  }
}

/**
 * WebSocket 連接開啟
 */
export function handleWebSocketOpen(ws: ServerWebSocket<unknown>): void {
  clients.add(ws);
  console.log('WebSocket client connected. Total clients:', clients.size);

  // 發送目前播放狀態給新連接的客戶端
  const queueService = getQueueService();
  const state = queueService.getState();

  ws.send(JSON.stringify({
    type: 'playback_state',
    state,
  } as WSMessage));
}

/**
 * WebSocket 連接關閉
 */
export function handleWebSocketClose(ws: ServerWebSocket<unknown>): void {
  clients.delete(ws);
  console.log('WebSocket client disconnected. Total clients:', clients.size);
}

/**
 * 初始化 WebSocket 廣播
 */
export function initializeWebSocket(): void {
  const queueService = getQueueService();

  // 監聽佇列變更
  queueService.onQueueChange((queue) => {
    broadcast({
      type: 'queue_updated',
      queue,
    });
  });

  // 監聽播放狀態變更
  queueService.onStateChange((state) => {
    broadcast({
      type: 'playback_state',
      state,
    });

    // 如果有當前播放的歌曲，發送歌詞
    if (state.currentTrack) {
      queueService.getLyrics().then((lyrics) => {
        if (lyrics.length > 0) {
          broadcast({
            type: 'lyrics',
            lyrics,
          });
        }
      });
    }
  });

  console.log('WebSocket broadcasting initialized');
}
