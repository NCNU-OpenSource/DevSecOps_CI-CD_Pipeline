import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import api from "../routes/api.ts";
import type { QueueOrigin, Track } from "../types/index.ts";
import {
  __resetQueueServiceForTests,
  getQueueService,
} from "../services/queue.service.ts";

type RestorableMethod = {
  target: Record<string, unknown>;
  key: string;
  original: unknown;
};

const restores: RestorableMethod[] = [];

function stubMethod<T extends object, K extends keyof T>(
  target: T,
  key: K,
  replacement: T[K],
): void {
  restores.push({
    target: target as Record<string, unknown>,
    key: key as string,
    original: target[key],
  });
  target[key] = replacement;
}

function restoreMethods(): void {
  while (restores.length > 0) {
    const restore = restores.pop()!;
    restore.target[restore.key] = restore.original;
  }
}

const playlistTracks: Track[] = [
  {
    videoId: "playlist-1",
    title: "Playlist Song 1",
    artist: "Artist 1",
    duration: 201,
  },
  {
    videoId: "playlist-2",
    title: "Playlist Song 2",
    artist: "Artist 2",
    duration: 189,
  },
];

describe("/api/library/playlists", () => {
  beforeEach(() => {
    restoreMethods();
    __resetQueueServiceForTests();
  });

  afterEach(() => {
    restoreMethods();
    __resetQueueServiceForTests();
  });

  test("should reject playlist playback without tracks", async () => {
    const response = await api.request("/library/playlists/test-playlist/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracks: [] }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "tracks is required",
    });
  });

  test("should replace the queue when playing a playlist", async () => {
    const queueService = getQueueService();
    const received: {
      tracks: Track[];
      origin?: QueueOrigin;
      requestedBy?: Track["requestedBy"];
    } = {
      tracks: [],
    };

    stubMethod(
      queueService,
      "replaceQueueWithTracks",
      (async (tracks: Track[], origin, options = {}) => {
        received.tracks = tracks;
        received.origin = origin;
        received.requestedBy = options.requestedBy;
      }) as typeof queueService.replaceQueueWithTracks,
    );

    const response = await api.request("/library/playlists/test-playlist/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tracks: playlistTracks,
        requestedBy: {
          profileId: "profile-a",
          profileName: "Alice",
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(received.tracks).toEqual(playlistTracks);
    expect(received.origin).toBe("playlist");
    expect(received.requestedBy).toEqual({
      profileId: "profile-a",
      profileName: "Alice",
    });
  });

  test("should append tracks when queueing a playlist", async () => {
    const queueService = getQueueService();
    const received: {
      tracks: Track[];
      origin?: QueueOrigin;
      requestedBy?: Track["requestedBy"];
    } = {
      tracks: [],
    };

    stubMethod(
      queueService,
      "appendTracksToQueue",
      (async (tracks: Track[], origin, options = {}) => {
        received.tracks = tracks;
        received.origin = origin;
        received.requestedBy = options.requestedBy;
      }) as typeof queueService.appendTracksToQueue,
    );

    const response = await api.request("/library/playlists/test-playlist/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tracks: playlistTracks,
        requestedBy: {
          profileId: "profile-b",
          profileName: "Bob",
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(received.tracks).toEqual(playlistTracks);
    expect(received.origin).toBe("playlist");
    expect(received.requestedBy).toEqual({
      profileId: "profile-b",
      profileName: "Bob",
    });
  });

  test("should surface playlist queue failures as 500 responses", async () => {
    const queueService = getQueueService();

    stubMethod(queueService, "appendTracksToQueue", async () => {
      throw new Error("queue failed");
    });

    const response = await api.request("/library/playlists/test-playlist/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracks: playlistTracks }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Failed to queue playlist",
    });
  });
});
