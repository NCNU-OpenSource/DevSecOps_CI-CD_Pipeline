import type { Track } from "../types/index";
import type { LibrarySnapshot } from "../types/library";

const requesterCache = new WeakMap<
  LibrarySnapshot,
  NonNullable<Track["requestedBy"]>
>();

export function getCurrentRequester(
  snapshot: LibrarySnapshot | null,
): Track["requestedBy"] | undefined {
  if (!snapshot) {
    return undefined;
  }

  const profileId = snapshot.profileId.trim();
  const profileName = snapshot.profileName.trim();

  if (!profileId || !profileName) {
    return undefined;
  }

  const cached = requesterCache.get(snapshot);
  if (cached) {
    return cached;
  }

  const requester = {
    profileId,
    profileName,
  };

  requesterCache.set(snapshot, requester);
  return requester;
}
