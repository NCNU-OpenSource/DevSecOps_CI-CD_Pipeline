import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Track } from "../types/index.ts";
import {
  __resetMusicServiceForTests,
  getMusicService,
} from "../services/music.service.ts";
import {
  __resetPlayerServiceForTests,
  getPlayerService,
} from "../services/player.service.ts";
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

const baseTrack: Track = {
  videoId: "base-track",
  title: "Base Song",
  artist: "Base Artist",
  duration: 180,
};

const radioTracks: Track[] = [
  {
    videoId: "radio-1",
    title: "Radio One",
    artist: "Artist One",
    duration: 190,
  },
  {
    videoId: "radio-2",
    title: "Radio Two",
    artist: "Artist Two",
    duration: 210,
  },
];

describe("QueueService radio mode", () => {
  beforeEach(() => {
    restoreMethods();
    __resetMusicServiceForTests();
    __resetPlayerServiceForTests();
    __resetQueueServiceForTests();
  });

  afterEach(() => {
    restoreMethods();
    __resetMusicServiceForTests();
    __resetPlayerServiceForTests();
    __resetQueueServiceForTests();
  });

  test("should auto-fill and continue playback when radio is enabled and queue reaches the end", async () => {
    const queueService = getQueueService();
    const playerService = getPlayerService();
    const musicService = getMusicService();
    const playUrlCalls: string[] = [];
    const mixSeeds: string[] = [];

    stubMethod(playerService, "isCurrentlyPlaying", () => false);
    stubMethod(playerService, "play", async () => {
      throw new Error("play() should not be used when playUrl() succeeds");
    });
    stubMethod(playerService, "playUrl", async (url: string) => {
      playUrlCalls.push(url);
    });
    stubMethod(musicService, "getMixTracks", async (videoId: string) => {
      mixSeeds.push(videoId);
      return radioTracks;
    });
    stubMethod(musicService, "getStreamUrl", async (videoId: string) => {
      return {
        url: `https://stream/${videoId}`,
        source: "youtube-ext" as const,
      };
    });
    stubMethod(musicService, "getLyrics", async () => []);

    await queueService.addToQueue(baseTrack);
    queueService.enableRadio();

    await queueService.playNext();

    const state = queueService.getState();

    expect(playUrlCalls).toEqual([
      "https://stream/base-track",
      "https://stream/radio-1",
    ]);
    expect(mixSeeds[0]).toBe(baseTrack.videoId);
    expect(state.radioEnabled).toBe(true);
    expect(state.lastPlayedTrack?.videoId).toBe("base-track");
    expect(state.currentTrack?.videoId).toBe("radio-1");
    expect(state.queue[0]?.videoId).toBe("radio-2");
    expect(state.queue[0]?.queueOrigin).toBe("radio");
    expect(state.queue[0]?.radioGenerated).toBe(true);
  });

  test("should keep manually added tracks ahead of radio-generated tracks", async () => {
    const queueService = getQueueService();
    const playerService = getPlayerService();
    const musicService = getMusicService();

    stubMethod(playerService, "isCurrentlyPlaying", () => false);
    stubMethod(playerService, "play", async () => {
      throw new Error("play() should not be used when playUrl() succeeds");
    });
    stubMethod(playerService, "playUrl", async () => {});
    stubMethod(musicService, "getMixTracks", async () => radioTracks);
    stubMethod(musicService, "getStreamUrl", async (videoId: string) => {
      return {
        url: `https://stream/${videoId}`,
        source: "youtube-ext" as const,
      };
    });
    stubMethod(musicService, "getLyrics", async () => []);

    await queueService.addToQueue(baseTrack);
    queueService.enableRadio();
    await queueService.playNext();

    await queueService.addToQueue({
      videoId: "manual-1",
      title: "Manual Song",
      artist: "Manual Artist",
      duration: 205,
    });

    expect(queueService.getState().currentTrack?.videoId).toBe("radio-1");
    expect(queueService.getState().currentTrack?.queueOrigin).toBe("radio");
    expect(queueService.getQueue().map((track) => track.videoId)).toEqual([
      "manual-1",
      "radio-2",
    ]);
    expect(queueService.getQueue()[0]?.queueOrigin).toBe("manual");
  });

  test("should keep radio-generated tracks anonymous", async () => {
    const queueService = getQueueService();
    const playerService = getPlayerService();
    const musicService = getMusicService();

    stubMethod(playerService, "isCurrentlyPlaying", () => false);
    stubMethod(playerService, "play", async () => {
      throw new Error("play() should not be used when playUrl() succeeds");
    });
    stubMethod(playerService, "playUrl", async () => {});
    stubMethod(musicService, "getMixTracks", async () => radioTracks);
    stubMethod(musicService, "getStreamUrl", async (videoId: string) => {
      return {
        url: `https://stream/${videoId}`,
        source: "youtube-ext" as const,
      };
    });
    stubMethod(musicService, "getLyrics", async () => []);

    await queueService.addToQueue({
      ...baseTrack,
      requestedBy: {
        profileId: "profile-radio",
        profileName: "Radio Starter",
      },
    });
    queueService.enableRadio();
    await queueService.playNext();

    const state = queueService.getState();
    expect(state.lastPlayedTrack?.requestedBy).toEqual({
      profileId: "profile-radio",
      profileName: "Radio Starter",
    });
    expect(state.currentTrack?.requestedBy).toBeUndefined();
    expect(queueService.getQueue()[0]?.requestedBy).toBeUndefined();
  });
});
