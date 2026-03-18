import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import api from "../routes/api.ts";
import type { Track } from "../types/index.ts";
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

const queuedTrack: Track = {
  videoId: "queue-track",
  title: "Queue Song",
  artist: "Queue Artist",
  duration: 188,
};

describe("/api/queue", () => {
  beforeEach(() => {
    restoreMethods();
    __resetQueueServiceForTests();
  });

  afterEach(() => {
    restoreMethods();
    __resetQueueServiceForTests();
  });

  test("should reject requests without a track", async () => {
    const response = await api.request("/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "track is required",
    });
  });

  test("should forward requester metadata to the queue service", async () => {
    const queueService = getQueueService();
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

    const response = await api.request("/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        track: queuedTrack,
        requestedBy: {
          profileId: "profile-a",
          profileName: "Alice",
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(received.track).toEqual(queuedTrack);
    expect(received.requestedBy).toEqual({
      profileId: "profile-a",
      profileName: "Alice",
    });
    expect(await response.json()).toEqual({
      success: true,
      data: { message: "Added to queue" },
    });
  });
});
