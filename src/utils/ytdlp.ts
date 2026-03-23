import { existsSync } from "node:fs";

const DEFAULT_EXTRACTOR_ARGS = "youtube:player_client=android_vr";

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getYtDlpExecutable(): string {
  return (
    normalizeEnvValue(process.env.YTDLP_PATH) ??
    normalizeEnvValue(process.env.YT_DLP_PATH) ??
    (process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp")
  );
}

export function getYtDlpExtractorArgs(): string {
  return (
    normalizeEnvValue(process.env.YTDLP_EXTRACTOR_ARGS) ??
    DEFAULT_EXTRACTOR_ARGS
  );
}

export function getYtDlpCookiesPath(): string | null {
  const cookiePath = normalizeEnvValue(process.env.YTDLP_COOKIES_FILE);

  if (!cookiePath) {
    return null;
  }

  return existsSync(cookiePath) ? cookiePath : null;
}

export function getYtDlpCliArgs(url: string): string[] {
  const args = [
    "--no-warnings",
    "--no-playlist",
    "-g",
    "-f",
    "bestaudio/best",
  ];

  const extractorArgs = getYtDlpExtractorArgs();
  if (extractorArgs) {
    args.push("--extractor-args", extractorArgs);
  }

  const cookiesPath = getYtDlpCookiesPath();
  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  args.push(url);
  return args;
}

export function getYtDlpMetadataArgs(
  url: string,
  options: {
    flatPlaylist?: boolean;
    maxPlaylistItems?: number;
    noPlaylist?: boolean;
  } = {},
): string[] {
  const args = ["--no-warnings", "--dump-single-json"];

  if (options.flatPlaylist) {
    args.push("--flat-playlist");
  }

  if (typeof options.maxPlaylistItems === "number" && options.maxPlaylistItems > 0) {
    args.push("--playlist-items", `1:${options.maxPlaylistItems}`);
  }

  if (options.noPlaylist) {
    args.push("--no-playlist");
  }

  const extractorArgs = getYtDlpExtractorArgs();
  if (extractorArgs) {
    args.push("--extractor-args", extractorArgs);
  }

  const cookiesPath = getYtDlpCookiesPath();
  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  args.push(url);
  return args;
}

export function getMpvYtdlRawOptions(): string[] {
  const rawOptions: string[] = [];
  const extractorArgs = getYtDlpExtractorArgs();

  if (extractorArgs) {
    rawOptions.push(`extractor-args=[${extractorArgs}]`);
  }

  const cookiesPath = getYtDlpCookiesPath();
  if (cookiesPath) {
    rawOptions.push(`cookies=${cookiesPath}`);
  }

  return rawOptions;
}
