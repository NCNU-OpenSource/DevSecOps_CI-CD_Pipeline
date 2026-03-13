import { useEffect, useRef, useCallback } from "react";
import { usePlayerStore } from "@/stores/playerStore";
import type { WSMessage } from "@/types";

export const useWebSocket = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);

  // 從 store 獲取 setter 函數（只獲取一次）
  const setConnectionStatus = usePlayerStore(
    (state) => state.setConnectionStatus,
  );
  const setPlaybackState = usePlayerStore((state) => state.setPlaybackState);
  const updatePlaybackState = usePlayerStore(
    (state) => state.updatePlaybackState,
  );
  const setLyrics = usePlayerStore((state) => state.setLyrics);

  const handleMessage = useCallback(
    (message: WSMessage) => {
      switch (message.type) {
        case "playback_state":
          setPlaybackState(message.state);
          break;

        case "now_playing":
          updatePlaybackState({
            currentTrack: message.track,
            position: message.position,
            duration: message.duration,
            isPlaying: true,
          });
          break;

        case "queue_updated":
          updatePlaybackState({ queue: message.queue });
          break;

        case "lyrics":
          setLyrics(message.lyrics);
          break;

        case "track_ended":
          updatePlaybackState({
            currentTrack: null,
            position: 0,
            duration: 0,
            isPlaying: false,
          });
          setLyrics([]);
          break;

        case "play":
          updatePlaybackState({ isPlaying: true });
          break;

        case "pause":
          updatePlaybackState({ isPlaying: false });
          break;

        default:
          console.log("未處理的訊息類型:", message);
      }
    },
    [setPlaybackState, updatePlaybackState, setLyrics],
  );

  const connect = useCallback(() => {
    if (!mountedRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus("connecting");

    // 開發模式直接連接到後端，生產模式使用相對路徑
    const isDev = import.meta.env.DEV;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = isDev
      ? "ws://localhost:3000/ws"
      : `${protocol}://${window.location.host}/ws`;

    console.log(
      "嘗試連接 WebSocket:",
      wsUrl,
      `(protocol: ${window.location.protocol})`,
    );
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket 已連線");
      setConnectionStatus("connected");
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error("解析 WebSocket 訊息失敗:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket 錯誤:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket 已斷線");
      setConnectionStatus("disconnected");
      wsRef.current = null;

      if (!mountedRef.current) {
        return;
      }

      // 指數退避重連，最多嘗試 5 次
      if (reconnectAttemptsRef.current < 5) {
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptsRef.current),
          10000,
        );
        reconnectAttemptsRef.current++;

        console.log(
          `將在 ${delay}ms 後重新連線 (第 ${reconnectAttemptsRef.current} 次)...`,
        );
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        console.error("WebSocket 重連次數已達上限，停止重連");
      }
    };

    wsRef.current = ws;
  }, [setConnectionStatus, handleMessage]);

  const disconnect = useCallback(() => {
    mountedRef.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus("disconnected");
  }, [setConnectionStatus]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    reconnect: connect,
  };
};
