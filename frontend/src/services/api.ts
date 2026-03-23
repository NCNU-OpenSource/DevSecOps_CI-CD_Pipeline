import type {
  AlbumDetails,
  ApiResponse,
  PlaybackState,
  SearchResult,
  Track,
} from "@/types";
import type {
  SyncDeviceMetadata,
  SyncProfileResponse,
  SyncSessionDevice,
  SyncSessionResponse,
} from "@/types/library";

export interface SystemInfoResponse {
  appVersion: string;
  gitSha: string;
  buildVersion: string;
  environment: string;
}

const API_BASE = "/api";

type RequestedByPayload = Track["requestedBy"];

type SyncDevicePayload = {
  id: string;
  name?: string | null;
  reportedName?: string | null;
  kind: "desktop" | "mobile";
  metadata?: SyncDeviceMetadata | null;
};

class ApiService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
        ...options,
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        let errorCode: string | undefined;

        try {
          const errorPayload = (await response.json()) as ApiResponse;
          if (errorPayload.error) {
            errorMessage = errorPayload.error;
          }
          errorCode = errorPayload.code;
        } catch {
          // 保持預設 HTTP 錯誤訊息
        }

        return {
          success: false,
          error: errorMessage,
          code: errorCode,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "未知錯誤",
      };
    }
  }

  // 搜尋音樂
  async search(query: string): Promise<ApiResponse<SearchResult[]>> {
    return this.request<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`);
  }

  // 加入到佇列
  async addToQueue(
    track: Track,
    requestedBy?: RequestedByPayload,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>("/queue", {
      method: "POST",
      body: JSON.stringify({ track, requestedBy }),
    });
  }

  async addTracksToQueue(
    tracks: Track[],
    requestedBy?: RequestedByPayload,
  ): Promise<ApiResponse<{ message: string; count: number }>> {
    return this.request<{ message: string; count: number }>("/queue/batch", {
      method: "POST",
      body: JSON.stringify({ tracks, requestedBy }),
    });
  }

  // 創建 Mix 混合播放清單
  async createMix(
    track: Track,
    requestedBy?: RequestedByPayload,
  ): Promise<ApiResponse<{ count: number; tracks: Track[] }>> {
    return this.request<{ count: number; tracks: Track[] }>("/mix", {
      method: "POST",
      body: JSON.stringify({ track, requestedBy }),
    });
  }

  async enableRadio(): Promise<ApiResponse<void>> {
    return this.request<void>("/radio/enable", { method: "POST" });
  }

  async disableRadio(): Promise<ApiResponse<void>> {
    return this.request<void>("/radio/disable", { method: "POST" });
  }

  async toggleRadio(): Promise<ApiResponse<void>> {
    return this.request<void>("/radio/toggle", { method: "POST" });
  }

  // 播放
  async play(): Promise<ApiResponse<void>> {
    return this.request<void>("/play", { method: "POST" });
  }

  // 暫停
  async pause(): Promise<ApiResponse<void>> {
    return this.request<void>("/pause", { method: "POST" });
  }

  // 跳過
  async skip(): Promise<ApiResponse<void>> {
    return this.request<void>("/skip", { method: "POST" });
  }

  // 調整音量
  async setVolume(volume: number): Promise<ApiResponse<void>> {
    return this.request<void>("/volume", {
      method: "POST",
      body: JSON.stringify({ volume }),
    });
  }

  // 跳轉播放位置
  async seek(position: number): Promise<ApiResponse<void>> {
    return this.request<void>("/seek", {
      method: "POST",
      body: JSON.stringify({ position }),
    });
  }

  // 從佇列移除
  async removeFromQueue(index: number): Promise<ApiResponse<void>> {
    return this.request<void>(`/queue/${index}`, { method: "DELETE" });
  }

  // 重新排序佇列
  async reorderQueue(
    fromIndex: number,
    toIndex: number,
  ): Promise<ApiResponse<void>> {
    return this.request<void>("/queue/reorder", {
      method: "POST",
      body: JSON.stringify({ fromIndex, toIndex }),
    });
  }

  async playPlaylist(
    playlistId: string,
    tracks: Track[],
    requestedBy?: RequestedByPayload,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(
      `/library/playlists/${playlistId}/play`,
      {
        method: "POST",
        body: JSON.stringify({ tracks, requestedBy }),
      },
    );
  }

  async queuePlaylist(
    playlistId: string,
    tracks: Track[],
    requestedBy?: RequestedByPayload,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(
      `/library/playlists/${playlistId}/queue`,
      {
        method: "POST",
        body: JSON.stringify({ tracks, requestedBy }),
      },
    );
  }

  async queueAlbum(
    albumId: string,
    tracks: Track[],
    requestedBy?: RequestedByPayload,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(
      `/albums/${encodeURIComponent(albumId)}/queue`,
      {
        method: "POST",
        body: JSON.stringify({ tracks, requestedBy }),
      },
    );
  }

  async createSyncSession(payload: {
    sessionId?: string | null;
    deviceToken?: string | null;
    profileId: string;
    profileName?: string | null;
    device: SyncDevicePayload;
  }): Promise<ApiResponse<SyncSessionResponse>> {
    return this.request<SyncSessionResponse>("/sync/session", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async pairSyncSession(payload: {
    pairCode: string;
    profileId: string;
    device: SyncDevicePayload;
  }): Promise<ApiResponse<SyncSessionResponse>> {
    return this.request<SyncSessionResponse>("/sync/pair", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getSyncDevices(
    sessionId: string,
  ): Promise<ApiResponse<{ devices: SyncSessionResponse["devices"] }>> {
    return this.request<{ devices: SyncSessionResponse["devices"] }>(
      `/sync/devices?sessionId=${encodeURIComponent(sessionId)}`,
    );
  }

  async updateSyncProfileName(
    sessionId: string,
    profileName: string,
  ): Promise<ApiResponse<SyncProfileResponse>> {
    return this.request<SyncProfileResponse>("/sync/session/profile", {
      method: "PATCH",
      body: JSON.stringify({ sessionId, profileName }),
    });
  }

  async renameSyncDevice(
    sessionId: string,
    deviceId: string,
    name: string,
  ): Promise<ApiResponse<{ devices: SyncSessionDevice[] }>> {
    return this.request<{ devices: SyncSessionDevice[] }>(
      `/sync/devices/${encodeURIComponent(deviceId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ sessionId, name }),
      },
    );
  }

  async removeSyncDevice(
    sessionId: string,
    deviceId: string,
  ): Promise<ApiResponse<void>> {
    return this.request<void>(
      `/sync/devices/${encodeURIComponent(deviceId)}?sessionId=${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
      },
    );
  }

  // 取得當前狀態
  async getState(): Promise<ApiResponse<PlaybackState>> {
    return this.request<PlaybackState>("/state");
  }

  async getSystemInfo(): Promise<ApiResponse<SystemInfoResponse>> {
    return this.request<SystemInfoResponse>("/system/info");
  }

  async getAlbum(albumId: string): Promise<ApiResponse<AlbumDetails>> {
    return this.request<AlbumDetails>(`/albums/${encodeURIComponent(albumId)}`);
  }
}

export const api = new ApiService();
