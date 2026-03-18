import type {
  DeletedPlaylist,
  DeletedSavedMix,
  FavoriteTrack,
  HistoryEntry,
  LibrarySnapshot,
  PairedDevice,
  Playlist,
  RemovedFavorite,
  SavedMix,
  SyncDeviceMetadata,
  SyncSessionDevice,
  SyncedLibraryPayload,
} from "../types/library";

const MAX_HISTORY_ENTRIES = 1000;
const MAX_SAVED_MIXES = 50;

function compareIsoDateDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

function mergeByKey<T>(
  current: T[],
  incoming: T[],
  getKey: (item: T) => string,
  pickPreferred: (left: T, right: T) => T,
): T[] {
  const merged = new Map<string, T>();

  for (const item of [...current, ...incoming]) {
    const key = getKey(item);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, item);
      continue;
    }

    merged.set(key, pickPreferred(existing, item));
  }

  return Array.from(merged.values());
}

function pickLatestFavorite(left: FavoriteTrack, right: FavoriteTrack): FavoriteTrack {
  return left.updatedAt >= right.updatedAt ? left : right;
}

function pickLatestHistory(left: HistoryEntry, right: HistoryEntry): HistoryEntry {
  return left.playedAt >= right.playedAt ? left : right;
}

function pickLatestPlaylist(left: Playlist, right: Playlist): Playlist {
  return left.updatedAt >= right.updatedAt ? left : right;
}

function pickLatestRemovedFavorite(
  left: RemovedFavorite,
  right: RemovedFavorite,
): RemovedFavorite {
  return left.removedAt >= right.removedAt ? left : right;
}

function pickLatestDeletedPlaylist(
  left: DeletedPlaylist,
  right: DeletedPlaylist,
): DeletedPlaylist {
  return left.removedAt >= right.removedAt ? left : right;
}

function pickLatestDeletedSavedMix(
  left: DeletedSavedMix,
  right: DeletedSavedMix,
): DeletedSavedMix {
  return left.removedAt >= right.removedAt ? left : right;
}

function sortFavorites(items: FavoriteTrack[]): FavoriteTrack[] {
  return [...items].sort((left, right) =>
    compareIsoDateDesc(left.updatedAt, right.updatedAt),
  );
}

function sortHistory(items: HistoryEntry[]): HistoryEntry[] {
  return [...items]
    .sort((left, right) => compareIsoDateDesc(left.playedAt, right.playedAt))
    .slice(0, MAX_HISTORY_ENTRIES);
}

function sortSavedMixes(items: SavedMix[]): SavedMix[] {
  return [...items]
    .sort((left, right) => compareIsoDateDesc(left.createdAt, right.createdAt))
    .slice(0, MAX_SAVED_MIXES);
}

function sortPlaylists(items: Playlist[]): Playlist[] {
  return [...items].sort((left, right) =>
    compareIsoDateDesc(left.updatedAt, right.updatedAt),
  );
}

function sortRemovedFavorites(items: RemovedFavorite[]): RemovedFavorite[] {
  return [...items].sort((left, right) =>
    compareIsoDateDesc(left.removedAt, right.removedAt),
  );
}

function sortDeletedPlaylists(items: DeletedPlaylist[]): DeletedPlaylist[] {
  return [...items].sort((left, right) =>
    compareIsoDateDesc(left.removedAt, right.removedAt),
  );
}

function sortDeletedSavedMixes(items: DeletedSavedMix[]): DeletedSavedMix[] {
  return [...items].sort((left, right) =>
    compareIsoDateDesc(left.removedAt, right.removedAt),
  );
}

export function toSyncedLibraryPayload(
  snapshot: LibrarySnapshot,
): SyncedLibraryPayload {
  return {
    profileId: snapshot.profileId,
    profileName: snapshot.profileName,
    updatedAt: snapshot.updatedAt,
    syncSessionId: snapshot.syncSessionId,
    favorites: snapshot.favorites,
    history: snapshot.history,
    savedMixes: snapshot.savedMixes,
    playlists: snapshot.playlists,
    removedFavorites: snapshot.removedFavorites ?? [],
    deletedPlaylists: snapshot.deletedPlaylists ?? [],
    deletedSavedMixes: snapshot.deletedSavedMixes ?? [],
  };
}

export function mergeLibraryPayload(
  currentSnapshot: LibrarySnapshot,
  incomingPayload: SyncedLibraryPayload,
): LibrarySnapshot {
  const removedFavorites = sortRemovedFavorites(
    mergeByKey(
      currentSnapshot.removedFavorites ?? [],
      incomingPayload.removedFavorites ?? [],
      (item) => item.videoId,
      pickLatestRemovedFavorite,
    ),
  );

  const deletedPlaylists = sortDeletedPlaylists(
    mergeByKey(
      currentSnapshot.deletedPlaylists ?? [],
      incomingPayload.deletedPlaylists ?? [],
      (item) => item.id,
      pickLatestDeletedPlaylist,
    ),
  );

  const deletedSavedMixes = sortDeletedSavedMixes(
    mergeByKey(
      currentSnapshot.deletedSavedMixes ?? [],
      incomingPayload.deletedSavedMixes ?? [],
      (item) => item.id,
      pickLatestDeletedSavedMix,
    ),
  );

  const removedFavoritesByVideoId = new Map(
    removedFavorites.map((item) => [item.videoId, item]),
  );
  const deletedPlaylistsById = new Map(
    deletedPlaylists.map((item) => [item.id, item]),
  );
  const deletedSavedMixesById = new Map(
    deletedSavedMixes.map((item) => [item.id, item]),
  );

  const favorites = sortFavorites(
    mergeByKey(
      currentSnapshot.favorites,
      incomingPayload.favorites,
      (item) => item.videoId,
      pickLatestFavorite,
    ),
  ).filter((favorite) => {
    const removed = removedFavoritesByVideoId.get(favorite.videoId);
    return !removed || removed.removedAt < favorite.updatedAt;
  });

  const history = sortHistory(
    mergeByKey(
      currentSnapshot.history,
      incomingPayload.history,
      (item) => item.track.videoId,
      pickLatestHistory,
    ),
  );

  const savedMixes = sortSavedMixes(
    mergeByKey(
      currentSnapshot.savedMixes,
      incomingPayload.savedMixes,
      (item) => item.id,
      (left, right) => (left.createdAt >= right.createdAt ? left : right),
    ),
  ).filter((savedMix) => {
    const deleted = deletedSavedMixesById.get(savedMix.id);
    return !deleted || deleted.removedAt < savedMix.createdAt;
  });

  const playlists = sortPlaylists(
    mergeByKey(
      currentSnapshot.playlists,
      incomingPayload.playlists,
      (item) => item.id,
      pickLatestPlaylist,
    ),
  ).filter((playlist) => {
    const deleted = deletedPlaylistsById.get(playlist.id);
    return !deleted || deleted.removedAt < playlist.updatedAt;
  });

  return {
    ...currentSnapshot,
    profileId: currentSnapshot.profileId || incomingPayload.profileId,
    profileName:
      (incomingPayload.profileName &&
      incomingPayload.profileName.trim().length > 0
        ? incomingPayload.profileName
        : currentSnapshot.profileName) || "未命名使用者",
    syncSessionId: incomingPayload.syncSessionId ?? currentSnapshot.syncSessionId,
    updatedAt:
      currentSnapshot.updatedAt >= incomingPayload.updatedAt
        ? currentSnapshot.updatedAt
        : incomingPayload.updatedAt,
    favorites,
    history,
    savedMixes,
    playlists,
    removedFavorites,
    deletedPlaylists,
    deletedSavedMixes,
  };
}

function normalizeMetadata(
  incoming: SyncDeviceMetadata | null | undefined,
  existing: SyncDeviceMetadata | null | undefined,
): SyncDeviceMetadata | null {
  const candidate = incoming ?? existing;
  if (!candidate) {
    return null;
  }

  return {
    platformFamily: candidate.platformFamily ?? null,
    platformVersion: candidate.platformVersion ?? null,
    architecture: candidate.architecture ?? null,
    browserName: candidate.browserName ?? null,
    browserVersion: candidate.browserVersion ?? null,
    model: candidate.model ?? null,
  };
}

export function mergePairedDevices(
  currentDeviceId: string,
  existingDevices: PairedDevice[],
  sessionDevices: SyncSessionDevice[],
): PairedDevice[] {
  const existingById = new Map(existingDevices.map((device) => [device.id, device]));

  return sessionDevices.map((device) => {
    const existing = existingById.get(device.id);
    const reportedName =
      device.reportedName || existing?.reportedName || device.displayName || device.name;
    const customName = device.customName ?? existing?.customName ?? null;
    const displayName =
      device.displayName || customName || reportedName || existing?.displayName || "Unknown";
    const metadata = normalizeMetadata(device.metadata, existing?.metadata);

    return {
      id: device.id,
      name: displayName,
      reportedName,
      customName,
      displayName,
      kind: device.kind,
      metadata,
      pairedAt: existing?.pairedAt ?? device.pairedAt,
      isCurrentDevice: device.id === currentDeviceId,
      status: "available",
      connected: device.connected,
      lastSeenAt: device.lastSeenAt,
    };
  });
}
