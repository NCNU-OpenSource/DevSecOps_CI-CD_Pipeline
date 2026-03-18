import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import type { ServerWebSocket } from "bun";
import { Database } from "bun:sqlite";

export interface SyncDeviceMetadata {
  platformFamily: string | null;
  platformVersion: string | null;
  architecture: string | null;
  browserName: string | null;
  browserVersion: string | null;
  model: string | null;
}

export interface SyncDeviceInput {
  id: string;
  name?: string | null;
  reportedName?: string | null;
  kind: "desktop" | "mobile";
  metadata?: Partial<SyncDeviceMetadata> | null;
}

export interface SyncSessionDevice {
  id: string;
  name: string; // legacy: equals displayName
  displayName: string;
  reportedName: string;
  customName: string | null;
  kind: "desktop" | "mobile";
  metadata: SyncDeviceMetadata;
  connected: boolean;
  pairedAt: string;
  lastSeenAt: string;
}

export interface SyncSessionResponse {
  sessionId: string;
  pairCode: string;
  profileId: string;
  profileName: string;
  deviceToken: string;
  devices: SyncSessionDevice[];
}

export interface SyncProfileResponse {
  sessionId: string;
  profileId: string;
  profileName: string;
}

type SyncSocketData = {
  sessionId: string;
  deviceId: string;
};

type SyncSessionRow = {
  id: string;
  profile_id: string;
  profile_name: string;
  pair_code: string;
  created_at: string;
  updated_at: string;
};

type SyncDeviceRow = {
  session_id: string;
  device_id: string;
  name: string;
  reported_name: string | null;
  custom_name: string | null;
  kind: "desktop" | "mobile";
  platform_family: string | null;
  platform_version: string | null;
  architecture: string | null;
  browser_name: string | null;
  browser_version: string | null;
  model: string | null;
  paired_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  device_token_hash: string | null;
  updated_at: string;
};

const PAIR_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_PROFILE_NAME = "未命名使用者";
const DEFAULT_REPORTED_DEVICE_NAME = "Unknown device";

export class SyncServiceError extends Error {
  constructor(
    public readonly code:
      | "SYNC_SESSION_NOT_FOUND"
      | "SYNC_REPAIR_REQUIRED"
      | "INVALID_PAIR_CODE"
      | "SYNC_DEVICE_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "SyncServiceError";
  }
}

function getDefaultDatabasePath(): string {
  if (process.env.SYNC_STATE_DB_PATH?.trim()) {
    return process.env.SYNC_STATE_DB_PATH.trim();
  }

  if (process.env.NODE_ENV === "production") {
    return "/data/sync-state.sqlite";
  }

  return join(process.cwd(), ".data", "sync-state.sqlite");
}

function hashDeviceToken(deviceToken: string): string {
  return createHash("sha256").update(deviceToken).digest("hex");
}

function createDeviceToken(): string {
  return randomBytes(24).toString("base64url");
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeProfileName(value: string | null | undefined): string {
  return normalizeNullableText(value) ?? DEFAULT_PROFILE_NAME;
}

function normalizeDeviceMetadata(
  metadata: Partial<SyncDeviceMetadata> | null | undefined,
): SyncDeviceMetadata {
  return {
    platformFamily: normalizeNullableText(metadata?.platformFamily),
    platformVersion: normalizeNullableText(metadata?.platformVersion),
    architecture: normalizeNullableText(metadata?.architecture),
    browserName: normalizeNullableText(metadata?.browserName),
    browserVersion: normalizeNullableText(metadata?.browserVersion),
    model: normalizeNullableText(metadata?.model),
  };
}

function normalizeReportedName(input: SyncDeviceInput): string {
  return (
    normalizeNullableText(input.reportedName) ??
    normalizeNullableText(input.name) ??
    DEFAULT_REPORTED_DEVICE_NAME
  );
}

function resolveDisplayName(
  customName: string | null | undefined,
  reportedName: string | null | undefined,
): string {
  return (
    normalizeNullableText(customName) ??
    normalizeNullableText(reportedName) ??
    DEFAULT_REPORTED_DEVICE_NAME
  );
}

class SyncService {
  private static instance: SyncService | undefined;

  private readonly db: Database;
  private readonly socketByDeviceKey = new Map<string, ServerWebSocket<any>>();
  private readonly socketByConnection = new Map<ServerWebSocket<any>, SyncSocketData>();

  private constructor() {
    const databasePath = getDefaultDatabasePath();
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath, { create: true });
    this.initializeDatabase();
  }

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }

    return SyncService.instance;
  }

  static resetInstanceForTests(): void {
    SyncService.instance?.close();
    SyncService.instance = undefined;
  }

  createOrResumeSession(input: {
    sessionId?: string | null;
    deviceToken?: string | null;
    profileId: string;
    profileName?: string | null;
    device: SyncDeviceInput;
  }): SyncSessionResponse {
    const requestedSessionId = input.sessionId?.trim() || null;
    const requestedDeviceToken = input.deviceToken?.trim() || null;

    if (requestedSessionId) {
      const session = this.getSessionById(requestedSessionId);
      if (!session) {
        throw new SyncServiceError(
          "SYNC_SESSION_NOT_FOUND",
          "Sync session not found",
        );
      }

      if (!requestedDeviceToken) {
        throw new SyncServiceError(
          "SYNC_REPAIR_REQUIRED",
          "Sync session repair required",
        );
      }

      const device = this.getActiveDevice(session.id, input.device.id);
      if (
        !device ||
        !device.device_token_hash ||
        device.device_token_hash !== hashDeviceToken(requestedDeviceToken)
      ) {
        throw new SyncServiceError(
          "SYNC_REPAIR_REQUIRED",
          "Sync session repair required",
        );
      }

      this.touchDevice(session.id, input.device, requestedDeviceToken);
      return this.serializeSession(session, requestedDeviceToken);
    }

    const session = this.createSession({
      profileId: input.profileId,
      profileName:
        normalizeNullableText(input.profileName) ??
        normalizeNullableText(input.device.reportedName) ??
        normalizeNullableText(input.device.name),
    });
    const deviceToken = createDeviceToken();

    this.upsertDevice(session.id, input.device, deviceToken);
    return this.serializeSession(session, deviceToken);
  }

  pairToSession(input: {
    pairCode: string;
    profileId: string;
    device: SyncDeviceInput;
  }): SyncSessionResponse {
    const normalizedPairCode = input.pairCode.trim().toUpperCase();
    const session = this.getSessionByPairCode(normalizedPairCode);

    if (!session) {
      throw new SyncServiceError("INVALID_PAIR_CODE", "Invalid pair code");
    }

    const deviceToken = createDeviceToken();
    this.upsertDevice(session.id, input.device, deviceToken);

    return this.serializeSession(session, deviceToken);
  }

  getDevices(sessionId: string): SyncSessionDevice[] {
    const session = this.getSessionById(sessionId);

    if (!session) {
      throw new SyncServiceError(
        "SYNC_SESSION_NOT_FOUND",
        "Sync session not found",
      );
    }

    return this.serializeDevices(session.id);
  }

  updateProfileName(sessionId: string, profileName: string): SyncProfileResponse {
    const session = this.getSessionById(sessionId);
    if (!session) {
      throw new SyncServiceError(
        "SYNC_SESSION_NOT_FOUND",
        "Sync session not found",
      );
    }

    const now = new Date().toISOString();
    const normalizedProfileName = normalizeProfileName(profileName);

    this.db
      .query(
        `UPDATE sync_sessions
           SET profile_name = ?1,
               updated_at = ?2
         WHERE id = ?3`,
      )
      .run(normalizedProfileName, now, sessionId);

    this.broadcastToSession(sessionId, {
      type: "sync_profile_updated",
      sessionId,
      profileId: session.profile_id,
      profileName: normalizedProfileName,
    });

    return {
      sessionId,
      profileId: session.profile_id,
      profileName: normalizedProfileName,
    };
  }

  renameDevice(
    sessionId: string,
    deviceId: string,
    name: string,
  ): SyncSessionDevice[] {
    const session = this.getSessionById(sessionId);
    if (!session) {
      throw new SyncServiceError(
        "SYNC_SESSION_NOT_FOUND",
        "Sync session not found",
      );
    }

    const device = this.getActiveDevice(sessionId, deviceId);
    if (!device) {
      throw new SyncServiceError("SYNC_DEVICE_NOT_FOUND", "Sync device not found");
    }

    const now = new Date().toISOString();
    const customName = normalizeNullableText(name);

    this.db.transaction(() => {
      this.db
        .query(
          `UPDATE sync_devices
             SET custom_name = ?1,
                 name = COALESCE(?1, reported_name, name),
                 updated_at = ?2
           WHERE session_id = ?3
             AND device_id = ?4
             AND revoked_at IS NULL`,
        )
        .run(customName, now, sessionId, deviceId);

      this.updateSessionTimestamp(sessionId, now);
    })();

    this.broadcastDevices(sessionId);
    return this.serializeDevices(sessionId);
  }

  removeDevice(sessionId: string, deviceId: string): void {
    const session = this.getSessionById(sessionId);

    if (!session) {
      throw new SyncServiceError(
        "SYNC_SESSION_NOT_FOUND",
        "Sync session not found",
      );
    }

    const device = this.getActiveDevice(sessionId, deviceId);
    if (!device) {
      return;
    }

    const now = new Date().toISOString();

    this.db.transaction(() => {
      this.db
        .query(
          `UPDATE sync_devices
             SET revoked_at = ?1,
                 device_token_hash = NULL,
                 last_seen_at = ?1,
                 updated_at = ?1
           WHERE session_id = ?2 AND device_id = ?3`,
        )
        .run(now, sessionId, deviceId);

      if (this.countActiveDevices(sessionId) === 0) {
        this.db.query("DELETE FROM sync_sessions WHERE id = ?1").run(sessionId);
      } else {
        this.updateSessionTimestamp(sessionId, now);
      }
    })();

    const socket = this.detachSocket(sessionId, deviceId);
    if (socket) {
      this.send(socket, {
        type: "sync_revoked",
        code: "SYNC_REPAIR_REQUIRED",
        error: "This device has been removed from the sync session",
      });
      try {
        socket.close();
      } catch {
        // no-op
      }
    }

    this.broadcastDevices(sessionId);
  }

  registerConnection(
    ws: ServerWebSocket<any>,
    input: {
      sessionId: string;
      device: SyncDeviceInput;
      deviceToken: string;
    },
  ): SyncSessionResponse {
    const session = this.getSessionById(input.sessionId);

    if (!session) {
      throw new SyncServiceError(
        "SYNC_SESSION_NOT_FOUND",
        "Sync session not found",
      );
    }

    const device = this.getActiveDevice(session.id, input.device.id);
    if (
      !device ||
      !input.deviceToken ||
      !device.device_token_hash ||
      device.device_token_hash !== hashDeviceToken(input.deviceToken)
    ) {
      throw new SyncServiceError(
        "SYNC_REPAIR_REQUIRED",
        "Sync session repair required",
      );
    }

    this.touchDevice(session.id, input.device, input.deviceToken);

    const existingSocket = this.socketByDeviceKey.get(
      this.getSocketKey(session.id, input.device.id),
    );
    if (existingSocket && existingSocket !== ws) {
      this.detachConnection(existingSocket);
      try {
        existingSocket.close();
      } catch {
        // no-op
      }
    }

    this.socketByConnection.set(ws, {
      sessionId: session.id,
      deviceId: input.device.id,
    });
    this.socketByDeviceKey.set(this.getSocketKey(session.id, input.device.id), ws);

    const serialized = this.serializeSession(session, input.deviceToken);
    this.send(ws, {
      type: "sync_registered",
      ...serialized,
    });
    this.broadcastDevices(session.id);
    this.broadcastToOthers(session.id, input.device.id, {
      type: "sync_snapshot_request",
      requesterDeviceId: input.device.id,
    });

    return serialized;
  }

  relaySnapshot(
    sessionId: string,
    sourceDeviceId: string,
    payload: unknown,
  ): void {
    this.broadcastToOthers(sessionId, sourceDeviceId, {
      type: "sync_snapshot",
      sourceDeviceId,
      payload,
    });
  }

  disconnectConnection(ws: ServerWebSocket<any>): void {
    const connection = this.detachConnection(ws);
    if (!connection) {
      return;
    }

    const session = this.getSessionById(connection.sessionId);
    if (!session) {
      return;
    }

    const device = this.getActiveDevice(connection.sessionId, connection.deviceId);
    if (device) {
      const now = new Date().toISOString();
      this.db
        .query(
          `UPDATE sync_devices
             SET last_seen_at = ?1,
                 updated_at = ?1
           WHERE session_id = ?2 AND device_id = ?3`,
        )
        .run(now, connection.sessionId, connection.deviceId);
    }

    this.broadcastDevices(connection.sessionId);
  }

  private close(): void {
    this.db.close();
  }

  private initializeDatabase(): void {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_sessions (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        profile_name TEXT,
        pair_code TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_devices (
        session_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        name TEXT NOT NULL,
        reported_name TEXT,
        custom_name TEXT,
        kind TEXT NOT NULL,
        platform_family TEXT,
        platform_version TEXT,
        architecture TEXT,
        browser_name TEXT,
        browser_version TEXT,
        model TEXT,
        paired_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        revoked_at TEXT,
        device_token_hash TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (session_id, device_id),
        FOREIGN KEY (session_id) REFERENCES sync_sessions(id) ON DELETE CASCADE
      );
    `);

    this.ensureColumn("sync_sessions", "profile_name", "TEXT");
    this.ensureColumn("sync_devices", "reported_name", "TEXT");
    this.ensureColumn("sync_devices", "custom_name", "TEXT");
    this.ensureColumn("sync_devices", "platform_family", "TEXT");
    this.ensureColumn("sync_devices", "platform_version", "TEXT");
    this.ensureColumn("sync_devices", "architecture", "TEXT");
    this.ensureColumn("sync_devices", "browser_name", "TEXT");
    this.ensureColumn("sync_devices", "browser_version", "TEXT");
    this.ensureColumn("sync_devices", "model", "TEXT");

    this.backfillLegacyData();
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const columns = this.db
      .query(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>;

    if (columns.some((column) => column.name === columnName)) {
      return;
    }

    this.db.exec(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`,
    );
  }

  private backfillLegacyData(): void {
    this.db.exec(`
      UPDATE sync_devices
         SET reported_name = COALESCE(
               NULLIF(TRIM(reported_name), ''),
               NULLIF(TRIM(name), ''),
               '${DEFAULT_REPORTED_DEVICE_NAME}'
             )
       WHERE reported_name IS NULL OR TRIM(reported_name) = '';
    `);

    this.db.exec(`
      UPDATE sync_devices
         SET name = COALESCE(
               NULLIF(TRIM(custom_name), ''),
               NULLIF(TRIM(reported_name), ''),
               NULLIF(TRIM(name), ''),
               '${DEFAULT_REPORTED_DEVICE_NAME}'
             );
    `);

    this.db.exec(`
      UPDATE sync_sessions
         SET profile_name = COALESCE(
               (
                 SELECT COALESCE(
                   NULLIF(TRIM(d.custom_name), ''),
                   NULLIF(TRIM(d.reported_name), ''),
                   NULLIF(TRIM(d.name), '')
                 )
                   FROM sync_devices d
                  WHERE d.session_id = sync_sessions.id
                    AND d.revoked_at IS NULL
               ORDER BY d.paired_at ASC
                  LIMIT 1
               ),
               '${DEFAULT_PROFILE_NAME}'
             )
       WHERE profile_name IS NULL OR TRIM(profile_name) = '';
    `);
  }

  private createSession(input: {
    profileId: string;
    profileName?: string | null;
  }): SyncSessionRow {
    const now = new Date().toISOString();
    const session: SyncSessionRow = {
      id: crypto.randomUUID(),
      profile_id: input.profileId,
      profile_name: normalizeProfileName(input.profileName),
      pair_code: this.generatePairCode(),
      created_at: now,
      updated_at: now,
    };

    this.db
      .query(
        `INSERT INTO sync_sessions (
           id,
           profile_id,
           profile_name,
           pair_code,
           created_at,
           updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
      .run(
        session.id,
        session.profile_id,
        session.profile_name,
        session.pair_code,
        session.created_at,
        session.updated_at,
      );

    return session;
  }

  private upsertDevice(
    sessionId: string,
    deviceInput: SyncDeviceInput,
    deviceToken: string,
  ): void {
    const now = new Date().toISOString();
    const tokenHash = hashDeviceToken(deviceToken);
    const reportedName = normalizeReportedName(deviceInput);
    const metadata = normalizeDeviceMetadata(deviceInput.metadata);

    this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO sync_devices (
             session_id,
             device_id,
             name,
             reported_name,
             custom_name,
             kind,
             platform_family,
             platform_version,
             architecture,
             browser_name,
             browser_version,
             model,
             paired_at,
             last_seen_at,
             revoked_at,
             device_token_hash,
             updated_at
           )
           VALUES (
             ?1, ?2, ?3, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, NULL, ?12, ?11
           )
           ON CONFLICT(session_id, device_id) DO UPDATE SET
             name = COALESCE(custom_name, excluded.reported_name, excluded.name),
             reported_name = excluded.reported_name,
             kind = excluded.kind,
             platform_family = excluded.platform_family,
             platform_version = excluded.platform_version,
             architecture = excluded.architecture,
             browser_name = excluded.browser_name,
             browser_version = excluded.browser_version,
             model = excluded.model,
             last_seen_at = excluded.last_seen_at,
             revoked_at = NULL,
             device_token_hash = excluded.device_token_hash,
             updated_at = excluded.updated_at`,
        )
        .run(
          sessionId,
          deviceInput.id,
          reportedName,
          deviceInput.kind,
          metadata.platformFamily,
          metadata.platformVersion,
          metadata.architecture,
          metadata.browserName,
          metadata.browserVersion,
          metadata.model,
          now,
          tokenHash,
        );

      this.updateSessionTimestamp(sessionId, now);
    })();
  }

  private touchDevice(
    sessionId: string,
    deviceInput: SyncDeviceInput,
    deviceToken: string,
  ): void {
    const now = new Date().toISOString();
    const reportedName = normalizeReportedName(deviceInput);
    const metadata = normalizeDeviceMetadata(deviceInput.metadata);

    this.db.transaction(() => {
      this.db
        .query(
          `UPDATE sync_devices
             SET name = COALESCE(custom_name, ?1),
                 reported_name = ?1,
                 kind = ?2,
                 platform_family = ?3,
                 platform_version = ?4,
                 architecture = ?5,
                 browser_name = ?6,
                 browser_version = ?7,
                 model = ?8,
                 last_seen_at = ?9,
                 updated_at = ?9,
                 device_token_hash = ?10
           WHERE session_id = ?11
             AND device_id = ?12
             AND revoked_at IS NULL`,
        )
        .run(
          reportedName,
          deviceInput.kind,
          metadata.platformFamily,
          metadata.platformVersion,
          metadata.architecture,
          metadata.browserName,
          metadata.browserVersion,
          metadata.model,
          now,
          hashDeviceToken(deviceToken),
          sessionId,
          deviceInput.id,
        );

      this.updateSessionTimestamp(sessionId, now);
    })();
  }

  private updateSessionTimestamp(sessionId: string, now: string): void {
    this.db
      .query("UPDATE sync_sessions SET updated_at = ?1 WHERE id = ?2")
      .run(now, sessionId);
  }

  private getSessionById(sessionId: string): SyncSessionRow | null {
    return (
      (this.db
        .query("SELECT * FROM sync_sessions WHERE id = ?1")
        .get(sessionId) as SyncSessionRow | null) ?? null
    );
  }

  private getSessionByPairCode(pairCode: string): SyncSessionRow | null {
    return (
      (this.db
        .query("SELECT * FROM sync_sessions WHERE pair_code = ?1")
        .get(pairCode) as SyncSessionRow | null) ?? null
    );
  }

  private getActiveDevice(
    sessionId: string,
    deviceId: string,
  ): SyncDeviceRow | null {
    return (
      (this.db
        .query(
          `SELECT * FROM sync_devices
            WHERE session_id = ?1
              AND device_id = ?2
              AND revoked_at IS NULL`,
        )
        .get(sessionId, deviceId) as SyncDeviceRow | null) ?? null
    );
  }

  private listActiveDevices(sessionId: string): SyncDeviceRow[] {
    return this.db
      .query(
        `SELECT * FROM sync_devices
          WHERE session_id = ?1
            AND revoked_at IS NULL
          ORDER BY paired_at ASC`,
      )
      .all(sessionId) as SyncDeviceRow[];
  }

  private countActiveDevices(sessionId: string): number {
    const result = this.db
      .query(
        `SELECT COUNT(*) as count
           FROM sync_devices
          WHERE session_id = ?1
            AND revoked_at IS NULL`,
      )
      .get(sessionId) as { count: number } | null;

    return result?.count ?? 0;
  }

  private broadcastDevices(sessionId: string): void {
    const session = this.getSessionById(sessionId);
    if (!session) {
      return;
    }

    this.broadcastToSession(session.id, {
      type: "sync_devices",
      devices: this.serializeDevices(session.id),
    });
  }

  private broadcastToSession(
    sessionId: string,
    message: Record<string, unknown>,
  ): void {
    for (const [socket, connection] of this.socketByConnection.entries()) {
      if (connection.sessionId !== sessionId) {
        continue;
      }

      this.send(socket, message);
    }
  }

  private broadcastToOthers(
    sessionId: string,
    sourceDeviceId: string,
    message: Record<string, unknown>,
  ): void {
    for (const [socket, connection] of this.socketByConnection.entries()) {
      if (
        connection.sessionId !== sessionId ||
        connection.deviceId === sourceDeviceId
      ) {
        continue;
      }

      this.send(socket, message);
    }
  }

  private send(ws: ServerWebSocket<any>, message: Record<string, unknown>): void {
    ws.send(JSON.stringify(message));
  }

  private serializeSession(
    session: SyncSessionRow,
    deviceToken: string,
  ): SyncSessionResponse {
    return {
      sessionId: session.id,
      pairCode: session.pair_code,
      profileId: session.profile_id,
      profileName: normalizeProfileName(session.profile_name),
      deviceToken,
      devices: this.serializeDevices(session.id),
    };
  }

  private serializeDevices(sessionId: string): SyncSessionDevice[] {
    return this.listActiveDevices(sessionId).map((device) => ({
      id: device.device_id,
      name: resolveDisplayName(device.custom_name, device.reported_name),
      displayName: resolveDisplayName(device.custom_name, device.reported_name),
      reportedName:
        normalizeNullableText(device.reported_name) ?? DEFAULT_REPORTED_DEVICE_NAME,
      customName: normalizeNullableText(device.custom_name),
      kind: device.kind,
      metadata: {
        platformFamily: normalizeNullableText(device.platform_family),
        platformVersion: normalizeNullableText(device.platform_version),
        architecture: normalizeNullableText(device.architecture),
        browserName: normalizeNullableText(device.browser_name),
        browserVersion: normalizeNullableText(device.browser_version),
        model: normalizeNullableText(device.model),
      },
      connected: this.socketByDeviceKey.has(
        this.getSocketKey(device.session_id, device.device_id),
      ),
      pairedAt: device.paired_at,
      lastSeenAt: device.last_seen_at,
    }));
  }

  private detachSocket(
    sessionId: string,
    deviceId: string,
  ): ServerWebSocket<any> | null {
    const socket = this.socketByDeviceKey.get(this.getSocketKey(sessionId, deviceId));
    if (!socket) {
      return null;
    }

    this.detachConnection(socket);
    return socket;
  }

  private detachConnection(ws: ServerWebSocket<any>): SyncSocketData | null {
    const connection = this.socketByConnection.get(ws);
    if (!connection) {
      return null;
    }

    this.socketByConnection.delete(ws);
    this.socketByDeviceKey.delete(
      this.getSocketKey(connection.sessionId, connection.deviceId),
    );

    return connection;
  }

  private getSocketKey(sessionId: string, deviceId: string): string {
    return `${sessionId}:${deviceId}`;
  }

  private generatePairCode(): string {
    let pairCode = "";

    while (
      !pairCode ||
      this.db
        .query("SELECT 1 FROM sync_sessions WHERE pair_code = ?1")
        .get(pairCode)
    ) {
      pairCode = Array.from({ length: 6 }, () => {
        const index = Math.floor(Math.random() * PAIR_CODE_ALPHABET.length);
        return PAIR_CODE_ALPHABET[index];
      }).join("");
    }

    return pairCode;
  }
}

export function getSyncService(): SyncService {
  return SyncService.getInstance();
}

export function __resetSyncServiceForTests(): void {
  SyncService.resetInstanceForTests();
}
