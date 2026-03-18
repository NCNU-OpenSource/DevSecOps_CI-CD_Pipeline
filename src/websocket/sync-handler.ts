import type { ServerWebSocket } from "bun";
import {
  getSyncService,
  SyncServiceError,
} from "../services/sync.service.ts";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

export function handleSyncWebSocketOpen(_ws: ServerWebSocket<any>): void {
  // 等待客戶端送出 register 訊息
}

export function handleSyncWebSocketMessage(
  ws: ServerWebSocket<any>,
  message: string,
): void {
  try {
    const data = JSON.parse(message) as Record<string, unknown>;
    const syncService = getSyncService();

    switch (data.type) {
      case "sync_register": {
        const metadata = asMetadata(data.deviceMetadata ?? data.metadata);
        syncService.registerConnection(ws, {
          sessionId: String(data.sessionId ?? ""),
          device: {
            id: String(data.deviceId ?? ""),
            reportedName: asString(data.reportedName) ?? asString(data.deviceName),
            name: asString(data.deviceName),
            kind:
              data.deviceKind === "mobile" ? "mobile" : "desktop",
            metadata: metadata
              ? {
                  platformFamily: asString(metadata.platformFamily),
                  platformVersion: asString(metadata.platformVersion),
                  architecture: asString(metadata.architecture),
                  browserName: asString(metadata.browserName),
                  browserVersion: asString(metadata.browserVersion),
                  model: asString(metadata.model),
                }
              : null,
          },
          deviceToken: String(data.deviceToken ?? ""),
        });
        break;
      }

      case "sync_snapshot":
        syncService.relaySnapshot(
          String(data.sessionId ?? ""),
          String(data.sourceDeviceId ?? ""),
          data.payload,
        );
        break;

      default:
        break;
    }
  } catch (error) {
    if (error instanceof SyncServiceError) {
      ws.send(
        JSON.stringify({
          type: "sync_revoked",
          code: error.code,
          error: error.message,
        }),
      );
      ws.close();
      return;
    }

    ws.send(
      JSON.stringify({
        type: "sync_error",
        error: "Invalid sync message",
      }),
    );
  }
}

export function handleSyncWebSocketClose(ws: ServerWebSocket<any>): void {
  getSyncService().disconnectConnection(ws);
}
