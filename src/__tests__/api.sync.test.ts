import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import api from "../routes/api.ts";
import {
  __resetQueueServiceForTests,
  getQueueService,
} from "../services/queue.service.ts";
import { __resetSyncServiceForTests } from "../services/sync.service.ts";

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

describe("/api/sync", () => {
  let tempDir = "";

  beforeEach(() => {
    restoreMethods();
    __resetQueueServiceForTests();
    __resetSyncServiceForTests();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDir = mkdtempSync(join(tmpdir(), "youtube-music-bot-api-sync-"));
    process.env.SYNC_STATE_DB_PATH = join(tempDir, "sync-state.sqlite");
  });

  afterEach(() => {
    restoreMethods();
    __resetQueueServiceForTests();
    __resetSyncServiceForTests();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
    delete process.env.SYNC_STATE_DB_PATH;
  });

  test("should create a sync session", async () => {
    const response = await api.request("/sync/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "profile-a",
        profileName: "Alice",
        device: {
          id: "device-a",
          reportedName: "Desktop A",
          kind: "desktop",
          metadata: {
            architecture: "arm64",
            browserName: "Chrome",
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      data: {
        profileId: string;
        profileName: string;
        devices: Array<{ id: string }>;
        deviceToken: string;
        pairCode: string;
        sessionId: string;
      };
    };
    expect(payload.success).toBe(true);
    expect(payload.data.profileId).toBe("profile-a");
    expect(payload.data.profileName).toBe("Alice");
    expect(payload.data.devices).toHaveLength(1);
    expect(payload.data.deviceToken).toBeTruthy();
  });

  test("should support legacy device.name payloads", async () => {
    const response = await api.request("/sync/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "profile-a",
        device: {
          id: "device-a",
          name: "Legacy Desktop",
          kind: "desktop",
        },
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        profileName: string;
        devices: Array<{
          id: string;
          reportedName: string;
          displayName: string;
        }>;
      };
    };
    expect(payload.data.profileName).toBe("Legacy Desktop");
    expect(payload.data.devices[0]?.reportedName).toBe("Legacy Desktop");
    expect(payload.data.devices[0]?.displayName).toBe("Legacy Desktop");
  });

  test("should pair into an existing sync session", async () => {
    const createResponse = await api.request("/sync/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "profile-a",
        device: {
          id: "device-a",
          reportedName: "Desktop A",
          kind: "desktop",
        },
      }),
    });
    const created = (await createResponse.json()) as {
      data: { pairCode: string; sessionId: string; deviceToken: string };
    };

    const pairResponse = await api.request("/sync/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairCode: created.data.pairCode,
        profileId: "profile-b",
        device: {
          id: "device-b",
          reportedName: "Phone B",
          kind: "mobile",
        },
      }),
    });

    expect(pairResponse.status).toBe(200);
    const payload = (await pairResponse.json()) as {
      data: { devices: Array<{ id: string }>; deviceToken: string };
    };
    expect(payload.data.devices.map((device: { id: string }) => device.id)).toEqual([
      "device-a",
      "device-b",
    ]);
    expect(payload.data.deviceToken).toBeTruthy();
  });

  test("should reject invalid pair codes", async () => {
    const response = await api.request("/sync/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairCode: "AAAAAA",
        profileId: "profile-a",
        device: {
          id: "device-a",
          reportedName: "Desktop A",
          kind: "desktop",
        },
      }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid pair code",
      code: "INVALID_PAIR_CODE",
    });
  });

  test("should resume an existing session when a valid device token is provided", async () => {
    const createResponse = await api.request("/sync/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "profile-a",
        device: {
          id: "device-a",
          reportedName: "Desktop A",
          kind: "desktop",
        },
      }),
    });
    const created = (await createResponse.json()) as {
      data: { sessionId: string; deviceToken: string };
    };

    __resetSyncServiceForTests();

    const resumeResponse = await api.request("/sync/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: created.data.sessionId,
        deviceToken: created.data.deviceToken,
        profileId: "profile-a",
        device: {
          id: "device-a",
          reportedName: "Desktop A",
          kind: "desktop",
        },
      }),
    });

    expect(resumeResponse.status).toBe(200);
    const payload = (await resumeResponse.json()) as {
      success: boolean;
      data: { sessionId: string; deviceToken: string };
    };
    expect(payload.success).toBe(true);
    expect(payload.data.sessionId).toBe(created.data.sessionId);
    expect(payload.data.deviceToken).toBe(created.data.deviceToken);
  });

  test("should require repair when resuming without a device token", async () => {
    const createResponse = await api.request("/sync/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "profile-a",
        device: {
          id: "device-a",
          reportedName: "Desktop A",
          kind: "desktop",
        },
      }),
    });
    const created = (await createResponse.json()) as {
      data: { sessionId: string; deviceToken: string };
    };

    const resumeResponse = await api.request("/sync/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: created.data.sessionId,
        profileId: "profile-a",
        device: {
          id: "device-a",
          reportedName: "Desktop A",
          kind: "desktop",
        },
      }),
    });

    expect(resumeResponse.status).toBe(409);
    expect(await resumeResponse.json()).toEqual({
      success: false,
      error: "Sync session repair required",
      code: "SYNC_REPAIR_REQUIRED",
    });
  });

  test("should list and remove synced devices", async () => {
    const createResponse = await api.request("/sync/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "profile-a",
        device: {
          id: "device-a",
          reportedName: "Desktop A",
          kind: "desktop",
        },
      }),
    });
    const created = (await createResponse.json()) as {
      data: { pairCode: string; sessionId: string };
    };

    const pairResponse = await api.request("/sync/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairCode: created.data.pairCode,
        profileId: "profile-a",
        device: {
          id: "device-b",
          reportedName: "Phone B",
          kind: "mobile",
        },
      }),
    });
    const paired = (await pairResponse.json()) as {
      data: { deviceToken: string };
    };

    const devicesResponse = await api.request(
      `/sync/devices?sessionId=${created.data.sessionId}`,
    );
    expect(devicesResponse.status).toBe(200);
    const devicesPayload = (await devicesResponse.json()) as {
      data: { devices: Array<{ id: string }> };
    };
    expect(devicesPayload.data.devices).toHaveLength(2);

    const removeResponse = await api.request(
      `/sync/devices/device-b?sessionId=${created.data.sessionId}`,
      {
        method: "DELETE",
      },
    );
    expect(removeResponse.status).toBe(200);

    const updatedDevicesResponse = await api.request(
      `/sync/devices?sessionId=${created.data.sessionId}`,
    );
    const updatedDevicesPayload = (await updatedDevicesResponse.json()) as {
      data: { devices: Array<{ id: string }> };
    };
    expect(updatedDevicesPayload.data.devices.map((device: { id: string }) => device.id)).toEqual([
      "device-a",
    ]);

    const revokedResumeResponse = await api.request("/sync/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: created.data.sessionId,
        deviceToken: paired.data.deviceToken,
        profileId: "profile-a",
        device: {
          id: "device-b",
          reportedName: "Phone B",
          kind: "mobile",
        },
      }),
    });

    expect(revokedResumeResponse.status).toBe(409);
    expect(await revokedResumeResponse.json()).toEqual({
      success: false,
      error: "Sync session repair required",
      code: "SYNC_REPAIR_REQUIRED",
    });
  });

  test("should update session profile name", async () => {
    const queueService = getQueueService();
    let renamedRequester:
      | {
          profileId: string;
          profileName: string;
        }
      | undefined;

    stubMethod(
      queueService,
      "renameRequesterProfile",
      ((profileId: string, profileName: string) => {
        renamedRequester = {
          profileId,
          profileName,
        };
      }) as typeof queueService.renameRequesterProfile,
    );

    const createResponse = await api.request("/sync/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "profile-a",
        profileName: "Alice",
        device: {
          id: "device-a",
          reportedName: "Desktop A",
          kind: "desktop",
        },
      }),
    });
    const created = (await createResponse.json()) as {
      data: { sessionId: string; deviceToken: string };
    };

    const patchResponse = await api.request("/sync/session/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: created.data.sessionId,
        profileName: "Bob",
      }),
    });

    expect(patchResponse.status).toBe(200);
    const patchPayload = (await patchResponse.json()) as {
      success: boolean;
      data: { profileName: string };
    };
    expect(patchPayload.success).toBe(true);
    expect(patchPayload.data.profileName).toBe("Bob");
    expect(renamedRequester).toEqual({
      profileId: "profile-a",
      profileName: "Bob",
    });

    const resumeResponse = await api.request("/sync/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: created.data.sessionId,
        profileId: "profile-a",
        deviceToken: created.data.deviceToken,
        device: {
          id: "device-a",
          reportedName: "Desktop A",
          kind: "desktop",
        },
      }),
    });
    const resumePayload = (await resumeResponse.json()) as {
      data: { profileName: string };
    };
    expect(resumePayload.data.profileName).toBe("Bob");
  });

  test("should rename a synced device via patch endpoint", async () => {
    const createResponse = await api.request("/sync/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "profile-a",
        device: {
          id: "device-a",
          reportedName: "Desktop A",
          kind: "desktop",
        },
      }),
    });
    const created = (await createResponse.json()) as {
      data: { sessionId: string };
    };

    const renameResponse = await api.request("/sync/devices/device-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: created.data.sessionId,
        name: "Living Room Mac",
      }),
    });

    expect(renameResponse.status).toBe(200);
    const renamePayload = (await renameResponse.json()) as {
      success: boolean;
      data: {
        devices: Array<{ id: string; displayName: string; customName: string | null }>;
      };
    };
    expect(renamePayload.success).toBe(true);
    expect(renamePayload.data.devices[0]?.id).toBe("device-a");
    expect(renamePayload.data.devices[0]?.displayName).toBe("Living Room Mac");
    expect(renamePayload.data.devices[0]?.customName).toBe("Living Room Mac");
  });
});
