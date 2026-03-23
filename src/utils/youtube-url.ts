import type { SearchCollectionKind } from "../types/index.ts";

export interface ParsedYouTubeCollection {
  kind: SearchCollectionKind;
  id: string;
  browseId?: string;
  playlistId?: string;
}

export interface ParsedYouTubeUrl {
  url: string;
  videoId?: string;
  collection?: ParsedYouTubeCollection;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase();
}

function getCollectionFromListId(listId: string): ParsedYouTubeCollection {
  if (listId.startsWith("OLAK")) {
    return {
      kind: "album",
      id: listId,
      playlistId: listId,
    };
  }

  if (listId.startsWith("RD")) {
    return {
      kind: "mix",
      id: listId,
      playlistId: listId,
    };
  }

  return {
    kind: "playlist",
    id: listId,
    playlistId: listId,
  };
}

function getVideoIdFromPath(pathname: string): string | undefined {
  const segments = pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return undefined;
  }

  if (
    segments[0] === "watch" ||
    segments[0] === "playlist" ||
    segments[0] === "browse"
  ) {
    return undefined;
  }

  if (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live") {
    return segments[1] || undefined;
  }

  return segments[0] || undefined;
}

export function parseYouTubeUrl(value: string): ParsedYouTubeUrl | null {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    return null;
  }

  const hostname = normalizeHost(parsedUrl.hostname);
  if (!YOUTUBE_HOSTS.has(hostname)) {
    return null;
  }

  const searchVideoId = parsedUrl.searchParams.get("v")?.trim();
  const searchListId = parsedUrl.searchParams.get("list")?.trim();
  const pathVideoId = getVideoIdFromPath(parsedUrl.pathname)?.trim();
  const browseId = parsedUrl.pathname.startsWith("/browse/")
    ? parsedUrl.pathname.split("/").filter(Boolean)[1]?.trim()
    : undefined;

  const result: ParsedYouTubeUrl = {
    url: parsedUrl.toString(),
  };

  if (hostname === "youtu.be" || hostname === "www.youtu.be") {
    result.videoId = pathVideoId;
  } else if (searchVideoId) {
    result.videoId = searchVideoId;
  } else if (pathVideoId) {
    result.videoId = pathVideoId;
  }

  if (browseId) {
    result.collection = {
      kind: "album",
      id: browseId,
      browseId,
    };
  } else if (searchListId) {
    result.collection = getCollectionFromListId(searchListId);
  }

  if (!result.videoId && !result.collection) {
    return null;
  }

  return result;
}
