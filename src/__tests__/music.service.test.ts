import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  __resetMusicServiceForTests,
  getMusicService,
  normalizeMixTracks,
  normalizeMusicSearchItem,
  resolveCollectionArtist,
} from "../services/music.service.ts";
import type { SearchResult } from "../types/index.ts";

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

describe("MusicService mix normalization", () => {
  beforeEach(() => {
    restoreMethods();
    __resetMusicServiceForTests();
  });

  afterEach(() => {
    restoreMethods();
    __resetMusicServiceForTests();
  });

  test("should normalize valid mix items and apply field fallbacks", () => {
    const tracks = normalizeMixTracks(
      [
        {
          video_id: "seed-video",
          title: "Seed track",
          artists: [{ name: "Seed Artist" }],
          duration: { seconds: 180 },
        },
        {
          id: "track-1",
          title: { text: "Object title" },
          artists: [{ name: "Artist A" }, { name: "Artist B" }],
          duration: { seconds: 200 },
        },
        {
          video_id: "track-2",
          title: "Author fallback",
          author: "Solo Artist",
          duration: 210,
        },
        {
          video_id: "track-3",
          title: "Author object fallback",
          author: { name: "Object Artist" },
        },
      ],
      "seed-video",
      10,
    );

    expect(tracks).toEqual([
      {
        videoId: "track-1",
        title: "Object title",
        artist: "Artist A, Artist B",
        duration: 200,
        thumbnail: "https://img.youtube.com/vi/track-1/mqdefault.jpg",
      },
      {
        videoId: "track-2",
        title: "Author fallback",
        artist: "Solo Artist",
        duration: 210,
        thumbnail: "https://img.youtube.com/vi/track-2/mqdefault.jpg",
      },
      {
        videoId: "track-3",
        title: "Author object fallback",
        artist: "Object Artist",
        duration: 0,
        thumbnail: "https://img.youtube.com/vi/track-3/mqdefault.jpg",
      },
    ]);
  });

  test("should skip invalid items and respect the limit", () => {
    const tracks = normalizeMixTracks(
      [
        {
          video_id: "missing-title",
          artists: [{ name: "No Title" }],
        },
        {
          title: "missing-video-id",
          artists: [{ name: "No Video ID" }],
        },
        {
          video_id: "track-1",
          title: "First valid",
          artists: [],
        },
        {
          video_id: "track-2",
          title: { text: "Second valid" },
          author: { name: "Fallback Artist" },
        },
        {
          video_id: "track-3",
          title: "Third valid",
          author: "Ignored because of limit",
        },
      ],
      "seed-video",
      2,
    );

    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      videoId: "track-1",
      title: "First valid",
      artist: "Unknown",
    });
    expect(tracks[1]).toMatchObject({
      videoId: "track-2",
      title: "Second valid",
      artist: "Fallback Artist",
    });
  });

  test("should normalize album metadata from music search items", () => {
    const track = normalizeMusicSearchItem({
      id: "album-track-1",
      title: "Album Track",
      artists: [{ name: "Album Artist" }],
      album: {
        id: "album-123",
        name: "Album Name",
      },
      duration: { seconds: 242 },
      thumbnail: {
        contents: [{ url: "https://example.com/album-track.jpg" }],
      },
    });

    expect(track).toEqual({
      videoId: "album-track-1",
      title: "Album Track",
      artist: "Album Artist",
      duration: 242,
      thumbnail: "https://example.com/album-track.jpg",
      album: {
        id: "album-123",
        name: "Album Name",
      },
    });
  });

  test("should skip music search items without a video id", () => {
    expect(
      normalizeMusicSearchItem({
        title: "Missing Video Id",
        artists: [{ name: "Unknown Artist" }],
      }),
    ).toBeNull();
  });

  test("should fall back to subtitle and first track artist for mix collection authors", () => {
    expect(
      resolveCollectionArtist({
        kind: "mix",
        subtitle: "Ru's Piano Ru味春捲 • 200 首歌曲",
      }),
    ).toBe("Ru's Piano Ru味春捲");

    expect(
      resolveCollectionArtist({
        kind: "mix",
        fallbackTrackArtist: "Ru's Piano Ru味春捲",
      }),
    ).toBe("Ru's Piano Ru味春捲");
  });

  test("should return URL search results without falling back to keyword search", async () => {
    const musicService = getMusicService() as unknown as {
      search: (query: string, limit?: number) => Promise<SearchResult[]>;
      resolveUrlSearch: (query: unknown, limit: number) => Promise<SearchResult[]>;
      searchByKeyword: (query: string, limit: number) => Promise<SearchResult[]>;
    };
    let keywordSearchCalled = false;

    stubMethod(musicService, "resolveUrlSearch", async () => [
      {
        kind: "track",
        id: "track-1",
        title: "URL Track",
        artist: "Artist A",
        duration: 180,
        track: {
          videoId: "track-1",
          title: "URL Track",
          artist: "Artist A",
          duration: 180,
        },
      },
    ]);
    stubMethod(musicService, "searchByKeyword", async () => {
      keywordSearchCalled = true;
      return [];
    });

    const results = await musicService.search("https://youtu.be/track-1");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kind: "track",
      id: "track-1",
      title: "URL Track",
    });
    expect(keywordSearchCalled).toBe(false);
  });

  test("should fall back to keyword search when URL resolution returns no results", async () => {
    const musicService = getMusicService() as unknown as {
      search: (query: string, limit?: number) => Promise<SearchResult[]>;
      resolveUrlSearch: (query: unknown, limit: number) => Promise<SearchResult[]>;
      searchByKeyword: (query: string, limit: number) => Promise<SearchResult[]>;
    };

    stubMethod(musicService, "resolveUrlSearch", async () => []);
    stubMethod(musicService, "searchByKeyword", async () => [
      {
        kind: "track",
        id: "keyword-track",
        title: "Keyword Track",
        artist: "Artist B",
        duration: 200,
        track: {
          videoId: "keyword-track",
          title: "Keyword Track",
          artist: "Artist B",
          duration: 200,
        },
      },
    ]);

    const results = await musicService.search("https://www.youtube.com/watch?v=keyword-track");

    expect(results).toEqual([
      {
        kind: "track",
        id: "keyword-track",
        title: "Keyword Track",
        artist: "Artist B",
        duration: 200,
        track: {
          videoId: "keyword-track",
          title: "Keyword Track",
          artist: "Artist B",
          duration: 200,
        },
      },
    ]);
  });
});
