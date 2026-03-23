import { useEffect, useRef, useState } from "react";
import { api } from "@/services/api";
import { useLibraryStore, getCurrentDevice } from "@/stores/libraryStore";
import { detectDeviceInfo } from "@/utils/device-info";
import { toSyncedLibraryPayload } from "@/utils/librarySync";
import { getWebSocketUrl } from "@/utils/websocket-url";
import type { SyncSessionDevice, SyncedLibraryPayload } from "@/types/library";

const SNAPSHOT_SYNC_DEBOUNCE_MS = 400;

export function useLibrarySync(): void {
  const [socketAttempt, setSocketAttempt] = useState(0);
  const snapshot = useLibraryStore((state) => state.snapshot);
  const ready = useLibraryStore((state) => state.ready);
  const syncStatus = useLibraryStore((state) => state.syncStatus);
  const setSyncStatus = useLibraryStore((state) => state.setSyncStatus);
  const applySyncSession = useLibraryStore((state) => state.applySyncSession);
  const updatePairedDevices = useLibraryStore((state) => state.updatePairedDevices);
  const updateProfileName = useLibraryStore((state) => state.updateProfileName);
  const refreshCurrentDevice = useLibraryStore((state) => state.refreshCurrentDevice);
  const mergeRemoteSnapshot = useLibraryStore((state) => state.mergeRemoteSnapshot);
  const removeSyncSession = useLibraryStore((state) => state.removeSyncSession);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastSentPayloadRef = useRef<string | null>(null);
  const lastRegisteredSessionRef = useRef<string | null>(null);
  const recoveryAttemptKeyRef = useRef<string | null>(null);

  const currentDevice = getCurrentDevice(snapshot);
  const currentDeviceId = currentDevice?.id ?? null;
  const snapshotProfileId = snapshot?.profileId ?? "";
  const snapshotProfileName = snapshot?.profileName ?? "未命名使用者";
  const snapshotSessionId = snapshot?.syncSessionId ?? null;
  const snapshotDeviceToken = snapshot?.syncDeviceToken ?? null;

  const sendSnapshot = (
    nextSnapshot = useLibraryStore.getState().snapshot,
    options: { force?: boolean } = {},
  ): void => {
    if (
      !nextSnapshot?.syncSessionId ||
      socketRef.current?.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    const payload = toSyncedLibraryPayload(nextSnapshot);
    const serializedPayload = JSON.stringify(payload);

    if (!options.force && serializedPayload === lastSentPayloadRef.current) {
      return;
    }

    lastSentPayloadRef.current = serializedPayload;
    socketRef.current.send(
      JSON.stringify({
        type: "sync_snapshot",
        sessionId: nextSnapshot.syncSessionId,
        sourceDeviceId: nextSnapshot.deviceId,
        payload,
      }),
    );
  };

  useEffect(() => {
    if (
      !ready ||
      !snapshot ||
      !currentDeviceId
    ) {
      return;
    }

    const sessionId = snapshotSessionId;
    const deviceToken = snapshotDeviceToken;
    const profileId = snapshotProfileId;
    const deviceId = currentDeviceId;
    const recoveryKey = `${sessionId ?? "new"}:${deviceId}:${deviceToken ?? "none"}`;

    let cancelled = false;

    async function bootstrapSyncSession() {
      setSyncStatus("connecting", { error: null });
      const runtimeDevice = await detectDeviceInfo();

      if (cancelled) {
        return;
      }

      await refreshCurrentDevice({
        kind: runtimeDevice.kind,
        reportedName: runtimeDevice.reportedName,
        metadata: runtimeDevice.metadata,
      });

      const response = await api.createSyncSession({
        sessionId,
        deviceToken,
        profileId,
        profileName: snapshotProfileName,
        device: {
          id: deviceId,
          name: runtimeDevice.legacyName,
          kind: runtimeDevice.kind,
          reportedName: runtimeDevice.reportedName,
          metadata: runtimeDevice.metadata,
        },
      });

      if (cancelled) {
        return;
      }

      if (!response.success || !response.data) {
        if (
          sessionId &&
          (response.code === "SYNC_SESSION_NOT_FOUND" ||
            response.code === "SYNC_REPAIR_REQUIRED") &&
          recoveryAttemptKeyRef.current !== recoveryKey
        ) {
          recoveryAttemptKeyRef.current = recoveryKey;
          lastRegisteredSessionRef.current = null;
          await removeSyncSession();
          setSyncStatus("error", {
            error: "同步裝置需要重新配對，已建立新的本機 session",
          });
          return;
        }

        setSyncStatus("error", {
          error: response.error || "無法建立同步 session",
        });
        return;
      }

      recoveryAttemptKeyRef.current = null;
      await applySyncSession({
        ...response.data,
        pairCode: response.data.pairCode,
        profileName:
          String((response.data as { profileName?: unknown }).profileName ?? "").trim() ||
          snapshotProfileName,
      });
    }

    void bootstrapSyncSession();

    return () => {
      cancelled = true;
    };
  }, [
    applySyncSession,
    currentDeviceId,
    ready,
    refreshCurrentDevice,
    removeSyncSession,
    setSyncStatus,
    snapshotProfileName,
    snapshot?.profileId,
    snapshot?.syncDeviceToken,
    snapshot?.syncSessionId,
  ]);

  useEffect(() => {
    if (
      !ready ||
      !snapshotSessionId ||
      !snapshotDeviceToken ||
      !currentDeviceId
    ) {
      return;
    }

    const ws = new WebSocket(getWebSocketUrl("/ws/sync"));
    let closedIntentionally = false;
    socketRef.current = ws;
    setSyncStatus("connecting", { error: null });

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;

      void (async () => {
        const runtimeDevice = await detectDeviceInfo();
        if (closedIntentionally || ws.readyState !== WebSocket.OPEN) {
          return;
        }

        await refreshCurrentDevice({
          kind: runtimeDevice.kind,
          reportedName: runtimeDevice.reportedName,
          metadata: runtimeDevice.metadata,
        });

        if (closedIntentionally || ws.readyState !== WebSocket.OPEN) {
          return;
        }

        ws.send(
          JSON.stringify({
            type: "sync_register",
            sessionId: snapshotSessionId,
            deviceId: currentDeviceId,
            deviceName: runtimeDevice.legacyName,
            deviceKind: runtimeDevice.kind,
            deviceToken: snapshotDeviceToken,
            reportedName: runtimeDevice.reportedName,
            deviceMetadata: runtimeDevice.metadata,
          }),
        );
      })();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as Record<string, unknown>;

        switch (message.type) {
          case "sync_registered":
            lastRegisteredSessionRef.current = String(message.sessionId ?? "");
            void applySyncSession({
              sessionId: String(message.sessionId ?? ""),
              pairCode: String(message.pairCode ?? ""),
              profileId: String(message.profileId ?? snapshotProfileId ?? ""),
              profileName:
                String(message.profileName ?? snapshotProfileName ?? "").trim() ||
                "未命名使用者",
              deviceToken: String(
                message.deviceToken ?? snapshotDeviceToken ?? "",
              ),
              devices: Array.isArray(message.devices)
                ? (message.devices as SyncSessionDevice[])
                : [],
            });
            setSyncStatus("connected", {
              pairCode: String(message.pairCode ?? ""),
              error: null,
            });
            sendSnapshot(undefined, { force: true });
            break;

          case "sync_devices":
            if (Array.isArray(message.devices)) {
              void updatePairedDevices(message.devices as SyncSessionDevice[]);
            }
            break;

          case "sync_snapshot_request":
            sendSnapshot(undefined, { force: true });
            break;

          case "sync_snapshot":
            if (message.payload) {
              void mergeRemoteSnapshot(message.payload as SyncedLibraryPayload);
            }
            break;

          case "sync_revoked":
            lastRegisteredSessionRef.current = null;
            void removeSyncSession().then(() => {
              setSyncStatus("error", {
                error: "此裝置已被移出同步 session，請重新配對",
              });
            });
            break;

          case "sync_profile_updated":
            void updateProfileName(
              String(message.profileName ?? snapshotProfileName ?? "").trim() ||
                "未命名使用者",
            );
            break;

          case "sync_error":
            setSyncStatus("error", {
              error: String(message.error ?? "同步連線發生錯誤"),
            });
            break;

          default:
            break;
        }
      } catch {
        setSyncStatus("error", {
          error: "同步訊息解析失敗",
        });
      }
    };

    ws.onclose = () => {
      socketRef.current = null;

      if (closedIntentionally) {
        return;
      }

      if (lastRegisteredSessionRef.current !== snapshotSessionId) {
        return;
      }

      if (reconnectAttemptsRef.current >= 5) {
        setSyncStatus("error", { error: "同步連線中斷" });
        return;
      }

      const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 8000);
      reconnectAttemptsRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(() => {
        setSyncStatus("connecting", { error: null });
        lastRegisteredSessionRef.current = null;
        setSocketAttempt((attempt) => attempt + 1);
      }, delay);
    };

    return () => {
      closedIntentionally = true;
      ws.close();
      socketRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (snapshotSyncTimeoutRef.current) {
        clearTimeout(snapshotSyncTimeoutRef.current);
        snapshotSyncTimeoutRef.current = null;
      }
    };
  }, [
    applySyncSession,
    currentDeviceId,
    mergeRemoteSnapshot,
    ready,
    refreshCurrentDevice,
    removeSyncSession,
    setSyncStatus,
    snapshotDeviceToken,
    snapshotProfileId,
    snapshotProfileName,
    snapshotSessionId,
    socketAttempt,
    updateProfileName,
    updatePairedDevices,
  ]);

  useEffect(() => {
    if (
      !ready ||
      !snapshotSessionId ||
      !snapshot ||
      syncStatus !== "connected" ||
      socketRef.current?.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    if (snapshotSyncTimeoutRef.current) {
      clearTimeout(snapshotSyncTimeoutRef.current);
    }

    snapshotSyncTimeoutRef.current = setTimeout(() => {
      sendSnapshot(snapshot);
      snapshotSyncTimeoutRef.current = null;
    }, SNAPSHOT_SYNC_DEBOUNCE_MS);

    return () => {
      if (snapshotSyncTimeoutRef.current) {
        clearTimeout(snapshotSyncTimeoutRef.current);
        snapshotSyncTimeoutRef.current = null;
      }
    };
  }, [ready, snapshot, snapshotSessionId, syncStatus]);
}
