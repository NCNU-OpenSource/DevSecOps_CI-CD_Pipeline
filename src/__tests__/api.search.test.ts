import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import api from "../routes/api.ts";
import type { SearchResult } from "../types/index.ts";
import {
  __resetMusicServiceForTests,
  getMusicService,
} from "../services/music.service.ts";

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

const searchResults: SearchResult[] = [
  {
    kind: "track",
    id: "track-1",
    title: "Direct Track",
    artist: "Artist A",
    thumbnail: "https://img.youtube.com/vi/track-1/mqdefault.jpg",
    duration: 180,
    track: {
      videoId: "track-1",
      title: "Direct Track",
      artist: "Artist A",
      duration: 180,
      thumbnail: "https://img.youtube.com/vi/track-1/mqdefault.jpg",
    },
  },
  {
    kind: "playlist",
    id: "PL123",
    title: "Shared Playlist",
    artist: "Curator",
    thumbnail: "https://img.youtube.com/vi/track-2/mqdefault.jpg",
    trackCount: 2,
    truncated: false,
    tracks: [
      {
        videoId: "track-2",
        title: "Track Two",
        artist: "Artist B",
        duration: 200,
      },
      {
        videoId: "track-3",
        title: "Track Three",
        artist: "Artist C",
        duration: 220,
      },
    ],
  },
];

describe("/api/search", () => {
  beforeEach(() => {
    restoreMethods();
    __resetMusicServiceForTests();
  });

  afterEach(() => {
    restoreMethods();
    __resetMusicServiceForTests();
  });

  test("should reject missing query params", async () => {
    const response = await api.request("/search");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Query parameter "q" is required',
    });
  });

  test("should return mixed search results for youtube links and keywords", async () => {
    const musicService = getMusicService();

    stubMethod(
      musicService,
      "search",
      (async (query: string, limit: number) => {
        expect(query).toBe("https://music.youtube.com/playlist?list=PL123");
        expect(limit).toBe(20);
        return searchResults;
      }) as typeof musicService.search,
    );

    const response = await api.request(
      "/search?q=https%3A%2F%2Fmusic.youtube.com%2Fplaylist%3Flist%3DPL123",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: searchResults,
    });
  });

  test("should surface service failures as 500 responses", async () => {
    const musicService = getMusicService();

    stubMethod(musicService, "search", async () => {
      throw new Error("search failed");
    });

    const response = await api.request("/search?q=test");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Failed to search",
    });
  });
});
