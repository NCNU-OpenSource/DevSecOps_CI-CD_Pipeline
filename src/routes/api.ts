import { Hono } from 'hono';
import type { ApiResponse } from '../types/index.ts';
import { getMusicService } from '../services/music.service.ts';
import { getQueueService } from '../services/queue.service.ts';

const api = new Hono();

/**
 * GET /api/search?q={query}
 * 搜尋歌曲
 */
api.get('/search', async (c) => {
  const query = c.req.query('q');

  if (!query) {
    return c.json<ApiResponse>({
      success: false,
      error: 'Query parameter "q" is required',
    }, 400);
  }

  try {
    const musicService = getMusicService();
    const tracks = await musicService.search(query, 20);

    return c.json<ApiResponse>({
      success: true,
      data: tracks,
    });
  } catch (error) {
    console.error('Search failed:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to search',
    }, 500);
  }
});

/**
 * POST /api/queue
 * 點歌（加入播放清單）
 */
api.post('/queue', async (c) => {
  try {
    const body = await c.req.json<{ videoId: string }>();

    if (!body.videoId) {
      return c.json<ApiResponse>({
        success: false,
        error: 'videoId is required',
      }, 400);
    }

    const queueService = getQueueService();
    await queueService.addToQueue(body.videoId);

    return c.json<ApiResponse>({
      success: true,
      data: { message: 'Added to queue' },
    });
  } catch (error) {
    console.error('Failed to add to queue:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to add to queue',
    }, 500);
  }
});

/**
 * GET /api/queue
 * 取得播放清單
 */
api.get('/queue', (c) => {
  const queueService = getQueueService();
  const queue = queueService.getQueue();

  return c.json<ApiResponse>({
    success: true,
    data: queue,
  });
});

/**
 * DELETE /api/queue/:index
 * 從播放清單移除歌曲
 */
api.delete('/queue/:index', (c) => {
  const index = parseInt(c.req.param('index'), 10);

  if (isNaN(index) || index < 0) {
    return c.json<ApiResponse>({
      success: false,
      error: 'Invalid index',
    }, 400);
  }

  try {
    const queueService = getQueueService();
    queueService.removeFromQueue(index);

    return c.json<ApiResponse>({
      success: true,
      data: { message: 'Removed from queue' },
    });
  } catch (error) {
    console.error('Failed to remove from queue:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to remove from queue',
    }, 500);
  }
});

/**
 * GET /api/state
 * 取得目前播放狀態
 */
api.get('/state', (c) => {
  const queueService = getQueueService();
  const state = queueService.getState();

  return c.json<ApiResponse>({
    success: true,
    data: state,
  });
});

/**
 * GET /api/lyrics
 * 取得目前播放歌曲的歌詞
 */
api.get('/lyrics', async (c) => {
  try {
    const queueService = getQueueService();
    const lyrics = await queueService.getLyrics();

    return c.json<ApiResponse>({
      success: true,
      data: lyrics,
    });
  } catch (error) {
    console.error('Failed to get lyrics:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to get lyrics',
    }, 500);
  }
});

export default api;
