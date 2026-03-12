import { Innertube, Log } from "youtubei.js";
import type { Track, LyricLine } from "../types/index.ts";

// 初始化 YouTube 客戶端
let ytClient: Innertube | null = null;

async function getClient() {
  if (!ytClient) {
    Log.setLevel(Log.Level.ERROR);
    ytClient = await Innertube.create();
  }
  return ytClient;
}

// 解析 LRC 格式歌詞
function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const lineRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

  for (const rawLine of lrc.split("\n")) {
    const match = lineRegex.exec(rawLine.trim());
    if (match) {
      const minutes = parseInt(match[1]!, 10);
      const seconds = parseInt(match[2]!, 10);
      const centiseconds = parseInt(match[3]!.padEnd(3, "0"), 10);
      const time = minutes * 60 + seconds + centiseconds / 1000;
      const text = match[4]!.trim();
      lines.push({ time, text });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

class MusicService {
  private searchCache = new Map<string, Track[]>();
  private lyricsCache = new Map<string, LyricLine[]>();

  async search(query: string, limit: number = 20): Promise<Track[]> {
    const cacheKey = `${query}:${limit}`;

    // 檢查快取
    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey)!;
    }

    try {
      const yt = await getClient();
      const musicSearch = await yt.music.search(query, { type: "song" });

      const tracks: Track[] = [];
      const contents = (musicSearch as any).songs?.contents || [];

      for (const item of contents) {
        const videoId = item.id?.trim();
        if (!videoId) continue;

        const artists = item.artists || [];
        const artistName =
          artists.length > 0
            ? artists.map((a: any) => a.name).join(", ")
            : "Unknown";

        // 提取縮圖 URL
        let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        if (item.thumbnail) {
          if (typeof item.thumbnail === "string") {
            thumbnailUrl = item.thumbnail;
          } else if (
            item.thumbnail.contents &&
            item.thumbnail.contents.length > 0
          ) {
            thumbnailUrl = item.thumbnail.contents[0].url;
          }
        }

        const track: Track = {
          videoId,
          title: item.title || "Unknown",
          artist: artistName,
          duration:
            typeof item.duration === "number"
              ? item.duration
              : item.duration?.seconds || 0,
          thumbnail: thumbnailUrl,
        };

        tracks.push(track);
      }

      // 如果 music search 沒結果，嘗試一般 YouTube 搜尋
      if (tracks.length === 0) {
        const search = await yt.search(query);
        const videos = (search as any).videos || [];

        for (const video of videos) {
          const videoId = video.id || video.video_id;
          if (!videoId) continue;

          tracks.push({
            videoId,
            title:
              typeof video.title === "string"
                ? video.title
                : video.title?.text || "Unknown",
            artist:
              typeof video.author === "string"
                ? video.author
                : video.author?.name || "Unknown",
            duration:
              typeof video.duration === "number"
                ? video.duration
                : video.duration?.seconds || 0,
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          });
        }
      }

      const result = tracks.slice(0, limit);
      this.searchCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error("Search failed:", error);
      return [];
    }
  }

  async getLyrics(
    trackName: string,
    artistName: string,
    duration?: number,
  ): Promise<LyricLine[]> {
    const cacheKey = `${trackName}::${artistName}`;

    // 檢查快取
    if (this.lyricsCache.has(cacheKey)) {
      return this.lyricsCache.get(cacheKey)!;
    }

    try {
      const params = new URLSearchParams({
        track_name: trackName,
        artist_name: artistName,
        ...(duration ? { duration: String(Math.round(duration)) } : {}),
      });

      const response = await fetch(
        `https://lrclib.net/api/get?${params.toString()}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.log("No lyrics found for:", trackName, "-", artistName);
          this.lyricsCache.set(cacheKey, []);
          return [];
        }
        throw new Error(`LRCLIB API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        syncedLyrics?: string;
        plainLyrics?: string;
      };

      const lyrics = data.syncedLyrics ? parseLrc(data.syncedLyrics) : [];

      this.lyricsCache.set(cacheKey, lyrics);
      console.log(
        "Lyrics loaded:",
        trackName,
        "- synced lines:",
        lyrics.length,
      );
      return lyrics;
    } catch (error) {
      console.error("Failed to fetch lyrics:", error);
      this.lyricsCache.set(cacheKey, []);
      return [];
    }
  }
}

// 單例模式
let musicServiceInstance: MusicService | null = null;

export function getMusicService(): MusicService {
  if (!musicServiceInstance) {
    musicServiceInstance = new MusicService();
  }
  return musicServiceInstance;
}
