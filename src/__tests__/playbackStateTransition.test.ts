import { describe, expect, test } from "bun:test";
import {
  mergePlaybackStateDuringTrackTransition,
} from "../../frontend/src/utils/playbackStateTransition.ts";
import type { PlaybackState, Track } from "../../frontend/src/types/index.ts";

function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    videoId: "track-1",
    title: "Track 1",
    artist: "Artist 1",
    duration: 180,
    thumbnail: "https://img.youtube.com/vi/track-1/mqdefault.jpg",
    ...overrides,
  };
}

function createPlaybackState(
  overrides: Partial<PlaybackState> = {},
): PlaybackState {
  return {
    isPlaying: false,
    currentTrack: null,
    position: 0,
    duration: 0,
    volume: 50,
    queue: [],
    radioEnabled: false,
    lastPlayedTrack: null,
    ...overrides,
  };
}

describe("mergePlaybackStateDuringTrackTransition", () => {
  test("should clear stale requester metadata when queue head is anonymous", () => {
    const previousState = createPlaybackState({
      currentTrack: createTrack({
        requestedBy: {
          profileId: "profile-a",
          profileName: "Alice",
        },
        queueOrigin: "manual",
        radioGenerated: false,
      }),
      position: 42,
      duration: 180,
    });
    const incomingState = createPlaybackState({
      currentTrack: null,
      queue: [
        createTrack({
          queueOrigin: "radio",
          radioGenerated: true,
        }),
      ],
    });

    const mergedState = mergePlaybackStateDuringTrackTransition(
      incomingState,
      previousState,
    );

    expect(mergedState.currentTrack?.videoId).toBe("track-1");
    expect(mergedState.currentTrack?.requestedBy).toBeUndefined();
    expect(mergedState.currentTrack?.queueOrigin).toBe("radio");
    expect(mergedState.currentTrack?.radioGenerated).toBe(true);
    expect(mergedState.position).toBe(42);
    expect(mergedState.duration).toBe(180);
  });

  test("should keep the latest requester metadata when queue head includes it", () => {
    const previousState = createPlaybackState({
      currentTrack: createTrack({
        requestedBy: {
          profileId: "profile-a",
          profileName: "Alice",
        },
      }),
      position: 8,
      duration: 180,
    });
    const incomingState = createPlaybackState({
      currentTrack: null,
      queue: [
        createTrack({
          requestedBy: {
            profileId: "profile-b",
            profileName: "Bob",
          },
          queueOrigin: "manual",
        }),
      ],
    });

    const mergedState = mergePlaybackStateDuringTrackTransition(
      incomingState,
      previousState,
    );

    expect(mergedState.currentTrack?.requestedBy).toEqual({
      profileId: "profile-b",
      profileName: "Bob",
    });
    expect(mergedState.currentTrack?.queueOrigin).toBe("manual");
    expect(mergedState.position).toBe(8);
    expect(mergedState.duration).toBe(180);
  });

  test("should return the incoming state when no preservation is needed", () => {
    const previousState = createPlaybackState({
      currentTrack: createTrack({
        requestedBy: {
          profileId: "profile-a",
          profileName: "Alice",
        },
      }),
    });
    const incomingState = createPlaybackState({
      currentTrack: createTrack({
        videoId: "track-2",
        title: "Track 2",
        requestedBy: {
          profileId: "profile-c",
          profileName: "Carol",
        },
      }),
    });

    expect(
      mergePlaybackStateDuringTrackTransition(incomingState, previousState),
    ).toBe(incomingState);
  });

  test("should promote the next queue head instead of preserving stale progress", () => {
    const previousState = createPlaybackState({
      currentTrack: createTrack({
        videoId: "track-previous",
        title: "Previous Track",
        duration: 240,
      }),
      position: 123,
      duration: 240,
    });
    const queueHead = createTrack({
      videoId: "track-next",
      title: "Next Track",
      artist: "Next Artist",
      duration: 201,
    });
    const incomingState = createPlaybackState({
      currentTrack: null,
      queue: [queueHead],
    });

    const mergedState = mergePlaybackStateDuringTrackTransition(
      incomingState,
      previousState,
    );

    expect(mergedState.currentTrack).toEqual(queueHead);
    expect(mergedState.position).toBe(0);
    expect(mergedState.duration).toBe(queueHead.duration);
  });
});
