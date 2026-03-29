import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import api from "../routes/api.ts";
import {
  __resetDiscoverServiceForTests,
  getDiscoverService,
} from "../services/discover.service.ts";
import {
  __resetMusicServiceForTests,
  getMusicService,
} from "../services/music.service.ts";
import {
  __resetQueueServiceForTests,
  getQueueService,
} from "../services/queue.service.ts";
import type {
  AlbumDetails,
  DiscoverFeedResponse,
  DiscoverMarketsResponse,
  Track,
} from "../types/index.ts";

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

const baseTrack: Track = {
  videoId: "discover-track",
  title: "Discover Song",
  artist: "Discover Artist",
  duration: 204,
  thumbnail: "https://img.youtube.com/vi/discover-track/mqdefault.jpg",
};

describe("/api/discover", () => {
  let tempDir: string;

  beforeEach(() => {
    restoreMethods();
    __resetDiscoverServiceForTests();
    __resetMusicServiceForTests();
    __resetQueueServiceForTests();
    tempDir = mkdtempSync(join(tmpdir(), "discover-api-"));
    process.env.DISCOVER_STATS_DB_PATH = join(tempDir, "discover.sqlite");
  });

  afterEach(() => {
    restoreMethods();
    __resetDiscoverServiceForTests();
    __resetMusicServiceForTests();
    __resetQueueServiceForTests();
    delete process.env.DISCOVER_STATS_DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("returns the configured discover markets response", async () => {
    const discoverService = getDiscoverService();
    const payload: DiscoverMarketsResponse = {
      markets: [
        { code: "TW", label: "台灣", lang: "zh-TW" },
        { code: "US", label: "美國", lang: "en-US" },
      ],
      defaultMarket: "TW",
      topRequested: [
        {
          rank: 1,
          requestCount: 3,
          lastRequestedAt: "2026-03-27T00:00:00.000Z",
          track: baseTrack,
        },
      ],
    };

    stubMethod(
      discoverService,
      "getMarketsResponse",
      (async () => payload) as typeof discoverService.getMarketsResponse,
    );

    const response = await api.request("/discover/markets");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: payload,
    });
  });

  test("forwards market and mood params to the discover feed service", async () => {
    const discoverService = getDiscoverService();
    const payload: DiscoverFeedResponse = {
      market: "JP",
      moods: [{ key: "mood-jp", label: "City Pop" }],
      selectedMood: { key: "mood-jp", label: "City Pop" },
      sections: [
        {
          id: "section-jp",
          title: "日本精選",
          items: [
            {
              kind: "track",
              id: baseTrack.videoId,
              title: baseTrack.title,
              artist: baseTrack.artist,
              thumbnail: baseTrack.thumbnail,
              duration: baseTrack.duration,
              presentation: "song",
              track: baseTrack,
            },
          ],
        },
      ],
      warnings: [],
      fetchedAt: "2026-03-27T00:10:00.000Z",
    };

    stubMethod(
      discoverService,
      "getFeed",
      (async (market: string | null | undefined, mood: string | null | undefined) => {
        expect(market).toBe("JP");
        expect(mood).toBe("mood-jp");
        return payload;
      }) as typeof discoverService.getFeed,
    );

    const response = await api.request("/discover/feed?market=JP&mood=mood-jp");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: payload,
    });
  });

  test("queues a discover track and records it as a top-request candidate", async () => {
    const discoverService = getDiscoverService();
    const queueService = getQueueService();
    let recordedTracks: Track[] = [];
    const received: {
      track: Track | null;
      requestedBy?: Track["requestedBy"];
    } = {
      track: null,
    };

    stubMethod(
      queueService,
      "addToQueue",
      (async (track: Track, options = {}) => {
        received.track = track;
        received.requestedBy = options.requestedBy;
      }) as typeof queueService.addToQueue,
    );
    stubMethod(
      discoverService,
      "recordTrackRequests",
      ((tracks: Track[]) => {
        recordedTracks = tracks;
      }) as typeof discoverService.recordTrackRequests,
    );

    const response = await api.request("/discover/track/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        track: baseTrack,
        requestedBy: {
          profileId: "profile-discover",
          profileName: "Discover User",
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(received.track).toEqual(baseTrack);
    expect(received.requestedBy).toEqual({
      profileId: "profile-discover",
      profileName: "Discover User",
    });
    expect(recordedTracks).toEqual([baseTrack]);
    expect(await response.json()).toEqual({
      success: true,
      data: { message: "Discover track added to queue" },
    });
  });

  test("resolves albums from discover before queueing the full collection", async () => {
    const discoverService = getDiscoverService();
    const musicService = getMusicService();
    const queueService = getQueueService();
    const albumTracks: Track[] = [
      baseTrack,
      {
        videoId: "discover-track-2",
        title: "Discover Song Two",
        artist: "Discover Artist",
        duration: 190,
      },
    ];
    const albumDetails: AlbumDetails = {
      id: "MPRalbum123",
      title: "Discover Album",
      artist: "Album Artist",
      thumbnail: "https://example.com/album.jpg",
      tracks: albumTracks,
    };
    let recordedTracks: Track[] = [];
    const received: {
      tracks: Track[];
      requestedBy?: Track["requestedBy"];
      origin?: string;
    } = {
      tracks: [],
    };

    stubMethod(
      musicService,
      "getAlbum",
      (async () => albumDetails) as typeof musicService.getAlbum,
    );
    stubMethod(
      queueService,
      "appendTracksToQueue",
      (async (tracks: Track[], origin, options = {}) => {
        received.tracks = tracks;
        received.origin = origin;
        received.requestedBy = options.requestedBy;
      }) as typeof queueService.appendTracksToQueue,
    );
    stubMethod(
      discoverService,
      "recordTrackRequests",
      ((tracks: Track[]) => {
        recordedTracks = tracks;
      }) as typeof discoverService.recordTrackRequests,
    );

    const response = await api.request("/discover/collection/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "album",
        id: "MPRalbum123",
        requestedBy: {
          profileId: "profile-album",
          profileName: "Album Fan",
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(received.tracks).toEqual(albumTracks);
    expect(received.origin).toBe("manual");
    expect(received.requestedBy).toEqual({
      profileId: "profile-album",
      profileName: "Album Fan",
    });
    expect(recordedTracks).toEqual(albumTracks);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        message: "Added 2 tracks to queue",
        count: 2,
      },
    });
  });

  test("resolves playlists from discover before queueing the full collection", async () => {
    const discoverService = getDiscoverService();
    const musicService = getMusicService();
    const queueService = getQueueService();
    const playlistTracks: Track[] = [
      baseTrack,
      {
        videoId: "discover-track-3",
        title: "Discover Song Three",
        artist: "Playlist Artist",
        duration: 212,
      },
    ];
    let recordedTracks: Track[] = [];
    const received: {
      tracks: Track[];
      origin?: string;
    } = {
      tracks: [],
    };

    stubMethod(
      musicService,
      "getPlaylistTracks",
      (async (playlistId: string) => {
        expect(playlistId).toBe("VLdiscover123");
        return playlistTracks;
      }) as typeof musicService.getPlaylistTracks,
    );
    stubMethod(
      queueService,
      "appendTracksToQueue",
      (async (tracks: Track[], origin) => {
        received.tracks = tracks;
        received.origin = origin;
      }) as typeof queueService.appendTracksToQueue,
    );
    stubMethod(
      discoverService,
      "recordTrackRequests",
      ((tracks: Track[]) => {
        recordedTracks = tracks;
      }) as typeof discoverService.recordTrackRequests,
    );

    const response = await api.request("/discover/collection/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "playlist",
        id: "VLdiscover123",
      }),
    });

    expect(response.status).toBe(200);
    expect(received.tracks).toEqual(playlistTracks);
    expect(received.origin).toBe("manual");
    expect(recordedTracks).toEqual(playlistTracks);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        message: "Added 2 tracks to queue",
        count: 2,
      },
    });
  });
});
