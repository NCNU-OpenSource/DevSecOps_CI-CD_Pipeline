import { describe, expect, test } from "bun:test";
import { getCurrentRequester } from "../../frontend/src/utils/requester.ts";
import type { LibrarySnapshot } from "../../frontend/src/types/library.ts";

function createSnapshot(overrides: Partial<LibrarySnapshot> = {}): LibrarySnapshot {
  return {
    profileId: "profile-a",
    profileName: "Alice",
    deviceId: "device-a",
    updatedAt: "2026-03-18T00:00:00.000Z",
    syncSessionId: null,
    syncDeviceToken: null,
    favorites: [],
    history: [],
    savedMixes: [],
    playlists: [],
    pairedDevices: [],
    ...overrides,
  };
}

describe("getCurrentRequester", () => {
  test("should return a stable requester reference for the same snapshot", () => {
    const snapshot = createSnapshot();

    const first = getCurrentRequester(snapshot);
    const second = getCurrentRequester(snapshot);

    expect(first).toBe(second);
    expect(first).toEqual({
      profileId: "profile-a",
      profileName: "Alice",
    });
  });

  test("should return undefined when profile identity is incomplete", () => {
    expect(
      getCurrentRequester(createSnapshot({ profileId: "", profileName: "Alice" })),
    ).toBeUndefined();
    expect(
      getCurrentRequester(createSnapshot({ profileId: "profile-a", profileName: "" })),
    ).toBeUndefined();
  });
});
