import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import {
  __resetSyncServiceForTests,
  getSyncService,
  SyncServiceError,
} from "../services/sync.service.ts";

describe("SyncService", () => {
  let tempDir = "";
  let dbPath = "";

  beforeEach(() => {
    __resetSyncServiceForTests();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDir = mkdtempSync(join(tmpdir(), "youtube-music-bot-sync-"));
    dbPath = join(tempDir, "sync-state.sqlite");
    process.env.SYNC_STATE_DB_PATH = dbPath;
  });

  afterEach(() => {
    __resetSyncServiceForTests();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
    delete process.env.SYNC_STATE_DB_PATH;
  });

  const desktopDevice = {
    id: "device-a",
    name: "Desktop A",
    kind: "desktop" as const,
  };

  const phoneDevice = {
    id: "device-b",
    name: "Phone B",
    kind: "mobile" as const,
  };

  test("should create a session and reuse it on resume after service restart", () => {
    const syncService = getSyncService();

    const firstSession = syncService.createOrResumeSession({
      profileId: "profile-a",
      profileName: "Alice",
      device: desktopDevice,
    });

    __resetSyncServiceForTests();

    const resumedService = getSyncService();
    const resumedSession = resumedService.createOrResumeSession({
      sessionId: firstSession.sessionId,
      deviceToken: firstSession.deviceToken,
      profileId: "profile-a",
      device: desktopDevice,
    });

    expect(resumedSession.sessionId).toBe(firstSession.sessionId);
    expect(resumedSession.pairCode).toBe(firstSession.pairCode);
    expect(resumedSession.deviceToken).toBe(firstSession.deviceToken);
    expect(resumedSession.profileName).toBe("Alice");
    expect(resumedSession.devices).toHaveLength(1);
  });

  test("should pair a second device via pair code", () => {
    const syncService = getSyncService();
    const session = syncService.createOrResumeSession({
      profileId: "profile-a",
      profileName: "Alice",
      device: desktopDevice,
    });

    const pairedSession = syncService.pairToSession({
      pairCode: session.pairCode,
      profileId: "profile-b",
      device: phoneDevice,
    });

    expect(pairedSession.profileId).toBe("profile-a");
    expect(pairedSession.profileName).toBe("Alice");
    expect(pairedSession.deviceToken).toBeTruthy();
    expect(pairedSession.devices.map((device) => device.id)).toEqual([
      "device-a",
      "device-b",
    ]);
  });

  test("should revoke removed devices so they cannot resume", () => {
    const syncService = getSyncService();
    const session = syncService.createOrResumeSession({
      profileId: "profile-a",
      device: desktopDevice,
    });

    const pairedSession = syncService.pairToSession({
      pairCode: session.pairCode,
      profileId: "profile-a",
      device: phoneDevice,
    });

    syncService.removeDevice(session.sessionId, "device-b");

    expect(syncService.getDevices(session.sessionId).map((device) => device.id)).toEqual([
      "device-a",
    ]);

    try {
      syncService.createOrResumeSession({
        sessionId: session.sessionId,
        deviceToken: pairedSession.deviceToken,
        profileId: "profile-a",
        device: phoneDevice,
      });
      throw new Error("Expected createOrResumeSession to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(SyncServiceError);
      expect((error as SyncServiceError).code).toBe("SYNC_REPAIR_REQUIRED");
    }
  });

  test("should delete the session when the last device is revoked", () => {
    const syncService = getSyncService();
    const session = syncService.createOrResumeSession({
      profileId: "profile-a",
      device: desktopDevice,
    });

    syncService.removeDevice(session.sessionId, "device-a");

    try {
      syncService.getDevices(session.sessionId);
      throw new Error("Expected getDevices to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(SyncServiceError);
      expect((error as SyncServiceError).code).toBe("SYNC_SESSION_NOT_FOUND");
    }
  });

  test("should report devices as disconnected after restart", () => {
    const syncService = getSyncService();
    const session = syncService.createOrResumeSession({
      profileId: "profile-a",
      device: desktopDevice,
    });

    __resetSyncServiceForTests();

    const restartedService = getSyncService();
    const resumedSession = restartedService.createOrResumeSession({
      sessionId: session.sessionId,
      deviceToken: session.deviceToken,
      profileId: "profile-a",
      device: desktopDevice,
    });

    expect(resumedSession.devices[0]?.connected).toBe(false);
  });

  test("should update session profile name", () => {
    const syncService = getSyncService();
    const session = syncService.createOrResumeSession({
      profileId: "profile-a",
      profileName: "Alice",
      device: desktopDevice,
    });

    const updated = syncService.updateProfileName(session.sessionId, "Bob");
    expect(updated.profileName).toBe("Bob");

    const resumed = syncService.createOrResumeSession({
      sessionId: session.sessionId,
      deviceToken: session.deviceToken,
      profileId: "profile-a",
      device: desktopDevice,
    });
    expect(resumed.profileName).toBe("Bob");
  });

  test("should preserve custom device name after reconnect metadata refresh", () => {
    const syncService = getSyncService();
    const session = syncService.createOrResumeSession({
      profileId: "profile-a",
      profileName: "Alice",
      device: {
        ...desktopDevice,
        reportedName: "Desktop A",
        metadata: {
          architecture: "x86",
          browserName: "Chrome",
        },
      },
    });

    const renamedDevices = syncService.renameDevice(
      session.sessionId,
      "device-a",
      "Living Room Mac",
    );
    expect(renamedDevices[0]?.displayName).toBe("Living Room Mac");
    expect(renamedDevices[0]?.name).toBe("Living Room Mac");

    const resumed = syncService.createOrResumeSession({
      sessionId: session.sessionId,
      deviceToken: session.deviceToken,
      profileId: "profile-a",
      device: {
        ...desktopDevice,
        reportedName: "Desktop A Updated",
        metadata: {
          architecture: "arm64",
          browserName: "Chrome",
          browserVersion: "123",
        },
      },
    });

    const currentDevice = resumed.devices.find((device) => device.id === "device-a");
    expect(currentDevice?.customName).toBe("Living Room Mac");
    expect(currentDevice?.displayName).toBe("Living Room Mac");
    expect(currentDevice?.reportedName).toBe("Desktop A Updated");
    expect(currentDevice?.metadata.architecture).toBe("arm64");
  });

  test("should backfill profile_name and reported_name from legacy schema", () => {
    const db = new Database(dbPath, { create: true });
    db.exec(`
      CREATE TABLE sync_sessions (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        pair_code TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    db.exec(`
      CREATE TABLE sync_devices (
        session_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        paired_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        revoked_at TEXT,
        device_token_hash TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (session_id, device_id)
      );
    `);
    db.exec(`
      INSERT INTO sync_sessions (id, profile_id, pair_code, created_at, updated_at)
      VALUES ('session-legacy', 'profile-legacy', 'ABC123', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    `);
    db.exec(`
      INSERT INTO sync_devices (
        session_id,
        device_id,
        name,
        kind,
        paired_at,
        last_seen_at,
        revoked_at,
        device_token_hash,
        updated_at
      ) VALUES (
        'session-legacy',
        'device-legacy',
        'Legacy Desktop',
        'desktop',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        NULL,
        NULL,
        '2026-01-01T00:00:00.000Z'
      );
    `);
    db.close();

    const syncService = getSyncService();
    const devices = syncService.getDevices("session-legacy");
    expect(devices[0]?.reportedName).toBe("Legacy Desktop");
    expect(devices[0]?.displayName).toBe("Legacy Desktop");

    const paired = syncService.pairToSession({
      pairCode: "ABC123",
      profileId: "profile-new",
      device: {
        id: "device-new",
        name: "Phone New",
        kind: "mobile",
      },
    });
    expect(paired.profileName).toBe("Legacy Desktop");
  });
});
