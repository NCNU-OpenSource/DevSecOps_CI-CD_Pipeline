import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  __resetQueueServiceForTests,
  getQueueService,
} from "../services/queue.service.ts";
import {
  __resetPlayerServiceForTests,
  getPlayerService,
} from "../services/player.service.ts";
import { getMusicService } from "../services/music.service.ts";
import type { Track } from "../types/index.ts";

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

const track = (videoId: string, title: string): Track => ({
  videoId,
  title,
  artist: "Test Artist",
  duration: 180,
});

describe("QueueService - seekTo functionality", () => {
  let queueService: ReturnType<typeof getQueueService>;

  beforeEach(() => {
    restoreMethods();
    __resetQueueServiceForTests();
    __resetPlayerServiceForTests();
    queueService = getQueueService();
  });

  afterEach(() => {
    restoreMethods();
  });

  describe("seekTo() method - input validation", () => {
    test("should reject negative position", () => {
      const initialState = queueService.getState();

      queueService.seekTo(-5);

      const newState = queueService.getState();
      // Position should not change
      expect(newState.position).toBe(initialState.position);
    });

    test("should reject NaN position", () => {
      const initialState = queueService.getState();

      queueService.seekTo(NaN);

      const newState = queueService.getState();
      expect(newState.position).toBe(initialState.position);
    });

    test("should reject Infinity position", () => {
      const initialState = queueService.getState();

      queueService.seekTo(Infinity);

      const newState = queueService.getState();
      expect(newState.position).toBe(initialState.position);
    });

    test("should accept zero position", () => {
      queueService.seekTo(0);

      const state = queueService.getState();
      expect(state.position).toBe(0);
    });

    test("should accept valid positive position", () => {
      const initialState = queueService.getState();

      queueService.seekTo(30);

      const state = queueService.getState();
      expect(state.position).toBe(initialState.position);
    });
  });

  describe("seekTo() method - boundary clamping", () => {
    test("should clamp position to duration when exceeding", () => {
      // Note: In a real scenario, you would need to set up a track first
      // This test demonstrates the clamping behavior
      const position = 9999;
      queueService.seekTo(position);

      const state = queueService.getState();
      // Position should be clamped to duration (which is 0 by default)
      expect(state.position).toBeLessThanOrEqual(state.duration);
    });
  });

  describe("volume control", () => {
    test("should update volume", () => {
      queueService.setVolume(80);

      const state = queueService.getState();
      expect(state.volume).toBe(80);
    });

    test("should expose default playback settings", () => {
      expect(queueService.getState().playbackSettings).toEqual({
        crossfadeEnabled: true,
        crossfadeDurationSeconds: 4,
        volumeNormalizationEnabled: true,
      });
    });

    test("should normalize playback settings updates", () => {
      const nextSettings = queueService.setPlaybackSettings({
        crossfadeEnabled: false,
        crossfadeDurationSeconds: 99,
      });

      expect(nextSettings).toEqual({
        crossfadeEnabled: false,
        crossfadeDurationSeconds: 8,
        volumeNormalizationEnabled: true,
      });
      expect(queueService.getState().playbackSettings).toEqual(nextSettings);
    });

    test("should resync the current and next track when volume normalization changes", () => {
      const currentTrack = track("current-track", "Current Track");
      const nextTrack = track("next-track", "Next Track");
      const syncTrackSpy = mock(async (_track: Track | null) => {});
      const syncPreloadSpy = mock(async (_options?: { force?: boolean }) => false);
      const internalQueueService = queueService as unknown as {
        currentTrack: Track | null;
        queue: Track[];
        syncTrackVolumeNormalization: (track: Track | null) => Promise<void>;
        syncNextTrackPreload: (options?: { force?: boolean }) => Promise<boolean>;
      };

      stubMethod(
        internalQueueService,
        "syncTrackVolumeNormalization",
        syncTrackSpy as unknown as typeof internalQueueService.syncTrackVolumeNormalization,
      );
      stubMethod(
        internalQueueService,
        "syncNextTrackPreload",
        syncPreloadSpy as unknown as typeof internalQueueService.syncNextTrackPreload,
      );

      internalQueueService.currentTrack = currentTrack;
      internalQueueService.queue = [nextTrack];

      queueService.setPlaybackSettings({
        volumeNormalizationEnabled: false,
      });

      expect(syncTrackSpy).toHaveBeenCalledTimes(2);
      expect(syncTrackSpy.mock.calls[0]?.[0]).toBe(currentTrack);
      expect(syncTrackSpy.mock.calls[1]?.[0]).toBe(nextTrack);
      expect(syncPreloadSpy).toHaveBeenCalledWith({ force: true });
    });

    test("should prefer perceptual loudness metadata when resolving volume normalization", async () => {
      const musicService = getMusicService() as unknown as {
        getTrackLoudness: (videoId: string) => Promise<{
          loudnessDb?: number;
          perceptualLoudnessDb?: number;
        } | null>;
      };
      const internalQueueService = queueService as unknown as {
        resolveTrackVolumeMultiplier: (track: Track | null) => Promise<number>;
      };

      stubMethod(
        musicService,
        "getTrackLoudness",
        (async () => ({
          loudnessDb: -3,
          perceptualLoudnessDb: -18,
        })) as typeof musicService.getTrackLoudness,
      );

      const volumeMultiplier =
        await internalQueueService.resolveTrackVolumeMultiplier(
          track("track-perceptual", "Perceptual Track"),
        );

      expect(volumeMultiplier).toBeCloseTo(Math.pow(10, 4 / 20), 5);
    });

    test("should use a conservative loudnessDb fallback without boosting", async () => {
      const musicService = getMusicService() as unknown as {
        getTrackLoudness: (videoId: string) => Promise<{
          loudnessDb?: number;
          perceptualLoudnessDb?: number;
        } | null>;
      };
      const internalQueueService = queueService as unknown as {
        resolveTrackVolumeMultiplier: (track: Track | null) => Promise<number>;
      };

      stubMethod(
        musicService,
        "getTrackLoudness",
        (async () => ({
          loudnessDb: -8,
        })) as typeof musicService.getTrackLoudness,
      );

      const volumeMultiplier =
        await internalQueueService.resolveTrackVolumeMultiplier(
          track("track-fallback", "Fallback Track"),
        );

      expect(volumeMultiplier).toBeCloseTo(Math.pow(10, -8 / 20), 5);
      expect(volumeMultiplier).toBeLessThan(1);
    });

    test("should clamp normalization boost and attenuation boundaries", async () => {
      const loudnessSamples = [
        { perceptualLoudnessDb: -30 },
        { perceptualLoudnessDb: 10 },
      ];
      const musicService = getMusicService() as unknown as {
        getTrackLoudness: (videoId: string) => Promise<{
          loudnessDb?: number;
          perceptualLoudnessDb?: number;
        } | null>;
      };
      const internalQueueService = queueService as unknown as {
        resolveTrackVolumeMultiplier: (track: Track | null) => Promise<number>;
      };
      let callIndex = 0;

      stubMethod(
        musicService,
        "getTrackLoudness",
        (async () => loudnessSamples[callIndex++] ?? null) as typeof musicService.getTrackLoudness,
      );

      const boostedMultiplier =
        await internalQueueService.resolveTrackVolumeMultiplier(
          track("track-boost", "Boosted Track"),
        );
      const attenuatedMultiplier =
        await internalQueueService.resolveTrackVolumeMultiplier(
          track("track-attenuate", "Attenuated Track"),
        );

      expect(boostedMultiplier).toBeCloseTo(Math.pow(10, 6 / 20), 5);
      expect(attenuatedMultiplier).toBeCloseTo(Math.pow(10, -12 / 20), 5);
    });
  });

  describe("playback controls", () => {
    test("should pause the current track", () => {
      const internalQueueService = queueService as unknown as {
        currentTrack: Track | null;
        isPaused: boolean;
      };

      internalQueueService.currentTrack = track("track-1", "Track 1");
      internalQueueService.isPaused = false;

      queueService.pause();

      expect(queueService.getState().isPlaying).toBe(false);
    });

    test("should resume a paused track", () => {
      const internalQueueService = queueService as unknown as {
        currentTrack: Track | null;
        isPaused: boolean;
      };

      internalQueueService.currentTrack = track("track-1", "Track 1");
      internalQueueService.isPaused = true;

      queueService.play();

      expect(queueService.getState().isPlaying).toBe(true);
    });

    test("should ignore play requests without a current track", () => {
      queueService.play();

      expect(queueService.getState().currentTrack).toBeNull();
      expect(queueService.getState().isPlaying).toBe(false);
    });

    test("should keep play and pause idempotent", () => {
      const internalQueueService = queueService as unknown as {
        currentTrack: Track | null;
        isPaused: boolean;
      };

      internalQueueService.currentTrack = track("track-1", "Track 1");
      internalQueueService.isPaused = false;

      queueService.play();
      expect(queueService.getState().isPlaying).toBe(true);

      queueService.pause();
      queueService.pause();
      expect(queueService.getState().isPlaying).toBe(false);
    });
  });

  describe("queue management", () => {
    test("should return empty queue initially", () => {
      const queue = queueService.getQueue();
      expect(Array.isArray(queue)).toBe(true);
    });

    test("should return playback state", () => {
      const state = queueService.getState();

      expect(state).toHaveProperty("isPlaying");
      expect(state).toHaveProperty("currentTrack");
      expect(state).toHaveProperty("position");
      expect(state).toHaveProperty("duration");
      expect(state).toHaveProperty("volume");
      expect(state).toHaveProperty("queue");
    });

    test("should reorder queue items", () => {
      const internalQueueService = queueService as unknown as {
        queue: Track[];
      };

      internalQueueService.queue = [
        track("track-1", "Track 1"),
        track("track-2", "Track 2"),
        track("track-3", "Track 3"),
      ];

      queueService.reorderQueue(2, 0);

      expect(queueService.getQueue().map((item) => item.videoId)).toEqual([
        "track-3",
        "track-1",
        "track-2",
      ]);
    });

    test("should reject invalid reorder indexes", () => {
      const internalQueueService = queueService as unknown as {
        queue: Track[];
      };

      internalQueueService.queue = [track("track-1", "Track 1")];

      expect(() => queueService.reorderQueue(0, 3)).toThrow(
        "Invalid queue index",
      );
    });

    test("should clear queued tracks without affecting the current track", () => {
      const internalQueueService = queueService as unknown as {
        queue: Track[];
        currentTrack: Track | null;
        preloadTrackId: string | null;
      };

      internalQueueService.queue = [
        track("track-1", "Track 1"),
        track("track-2", "Track 2"),
      ];
      internalQueueService.currentTrack = track("current-track", "Current Track");
      internalQueueService.preloadTrackId = "track-1";

      const clearedCount = queueService.clearQueue();

      expect(clearedCount).toBe(2);
      expect(queueService.getQueue()).toEqual([]);
      expect(queueService.getState().currentTrack?.videoId).toBe("current-track");
      expect(internalQueueService.preloadTrackId).toBeNull();
    });

    test("should preserve requestedBy on addToQueue", async () => {
      const internalQueueService = queueService as unknown as {
        currentTrack: Track | null;
      };

      internalQueueService.currentTrack = track("playing", "Playing");

      await queueService.addToQueue({
        ...track("track-1", "Track 1"),
        requestedBy: {
          profileId: "profile-a",
          profileName: "Alice",
        },
      });

      expect(queueService.getQueue()[0]?.requestedBy).toEqual({
        profileId: "profile-a",
        profileName: "Alice",
      });
    });

    test("should stamp requestedBy via addToQueue options when track has none", async () => {
      const internalQueueService = queueService as unknown as {
        currentTrack: Track | null;
      };

      internalQueueService.currentTrack = track("playing", "Playing");

      await queueService.addToQueue(track("track-2", "Track 2"), {
        requestedBy: {
          profileId: "profile-b",
          profileName: "Bob",
        },
      });

      expect(queueService.getQueue()[0]?.requestedBy).toEqual({
        profileId: "profile-b",
        profileName: "Bob",
      });
    });

    test("should stamp requestedBy on appended tracks when fallback is provided", async () => {
      const internalQueueService = queueService as unknown as {
        currentTrack: Track | null;
      };

      internalQueueService.currentTrack = track("playing", "Playing");

      await queueService.appendTracksToQueue(
        [track("track-3", "Track 3"), track("track-4", "Track 4")],
        "playlist",
        {
          requestedBy: {
            profileId: "profile-c",
            profileName: "Carol",
          },
        },
      );

      expect(queueService.getQueue().map((item) => item.requestedBy)).toEqual([
        { profileId: "profile-c", profileName: "Carol" },
        { profileId: "profile-c", profileName: "Carol" },
      ]);
    });

    test("should rename requester profile across queue and playback state", () => {
      const internalQueueService = queueService as unknown as {
        queue: Track[];
        currentTrack: Track | null;
        lastPlayedTrack: Track | null;
      };

      internalQueueService.queue = [
        {
          ...track("track-5", "Track 5"),
          requestedBy: {
            profileId: "profile-d",
            profileName: "Dana",
          },
        },
      ];
      internalQueueService.currentTrack = {
        ...track("current", "Current"),
        requestedBy: {
          profileId: "profile-d",
          profileName: "Dana",
        },
      };
      internalQueueService.lastPlayedTrack = {
        ...track("last", "Last"),
        requestedBy: {
          profileId: "profile-d",
          profileName: "Dana",
        },
      };

      queueService.renameRequesterProfile("profile-d", "Daphne");

      const state = queueService.getState();
      expect(state.currentTrack?.requestedBy).toEqual({
        profileId: "profile-d",
        profileName: "Daphne",
      });
      expect(state.lastPlayedTrack?.requestedBy).toEqual({
        profileId: "profile-d",
        profileName: "Daphne",
      });
      expect(queueService.getQueue()[0]?.requestedBy).toEqual({
        profileId: "profile-d",
        profileName: "Daphne",
      });
    });

    test("should prefer the last queued track as the auto mix seed", () => {
      const internalQueueService = queueService as unknown as {
        queue: Track[];
        currentTrack: Track | null;
        lastPlayedTrack: Track | null;
        resolveAutoMixSeedTrack: () => Track | null;
      };

      internalQueueService.currentTrack = track("current", "Current");
      internalQueueService.lastPlayedTrack = track("last", "Last");
      internalQueueService.queue = [
        track("queued-1", "Queued 1"),
        track("queued-2", "Queued 2"),
      ];

      expect(internalQueueService.resolveAutoMixSeedTrack()?.videoId).toBe(
        "queued-2",
      );
    });

    test("should fall back to currentTrack then lastPlayedTrack for auto mix seed", () => {
      const internalQueueService = queueService as unknown as {
        queue: Track[];
        currentTrack: Track | null;
        lastPlayedTrack: Track | null;
        resolveAutoMixSeedTrack: () => Track | null;
      };

      internalQueueService.queue = [];
      internalQueueService.currentTrack = track("current", "Current");
      internalQueueService.lastPlayedTrack = track("last", "Last");

      expect(internalQueueService.resolveAutoMixSeedTrack()?.videoId).toBe(
        "current",
      );

      internalQueueService.currentTrack = null;

      expect(internalQueueService.resolveAutoMixSeedTrack()?.videoId).toBe(
        "last",
      );
    });

    test("should update the auto mix seed after queue reorder and removal", () => {
      const internalQueueService = queueService as unknown as {
        queue: Track[];
        resolveAutoMixSeedTrack: () => Track | null;
      };

      internalQueueService.queue = [
        track("track-1", "Track 1"),
        track("track-2", "Track 2"),
        track("track-3", "Track 3"),
      ];

      queueService.reorderQueue(0, 2);

      expect(queueService.getQueue().map((item) => item.videoId)).toEqual([
        "track-2",
        "track-3",
        "track-1",
      ]);
      expect(internalQueueService.resolveAutoMixSeedTrack()?.videoId).toBe(
        "track-1",
      );

      queueService.removeFromQueue(2);

      expect(queueService.getQueue().map((item) => item.videoId)).toEqual([
        "track-2",
        "track-3",
      ]);
      expect(internalQueueService.resolveAutoMixSeedTrack()?.videoId).toBe(
        "track-3",
      );
    });
  });
});
