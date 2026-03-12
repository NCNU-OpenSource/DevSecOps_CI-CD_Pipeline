/**
 * YouTube 縮略圖解析度級別
 */
export const ThumbnailQuality = {
  /** 120x90 */
  DEFAULT: "default",
  /** 320x180 */
  MEDIUM: "mqdefault",
  /** 480x360 */
  HIGH: "hqdefault",
  /** 640x480 */
  STANDARD: "sddefault",
  /** 1280x720 (可能不可用) */
  MAXRES: "maxresdefault",
} as const;

export type ThumbnailQuality =
  (typeof ThumbnailQuality)[keyof typeof ThumbnailQuality];

/**
 * 將 YouTube 縮略圖 URL 轉換為指定解析度
 *
 * @param url 原始縮略圖 URL
 * @param quality 目標解析度級別（預設：HIGH）
 * @returns 高解析度縮略圖 URL
 *
 * @example
 * ```ts
 * const thumbnail = "https://i.ytimg.com/vi/VIDEO_ID/default.jpg";
 * const hqThumbnail = getHighQualityThumbnail(thumbnail);
 * // Returns: "https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg"
 * ```
 */
export function getHighQualityThumbnail(
  url: string,
  quality: ThumbnailQuality = ThumbnailQuality.HIGH,
): string {
  if (!url) return url;

  // 匹配 YouTube 縮略圖 URL 模式
  const match = url.match(
    /\/vi\/([^/]+)\/(default|mqdefault|hqdefault|sddefault|maxresdefault)\.jpg/,
  );

  if (!match) {
    // 不是標準 YouTube 縮略圖格式，直接返回
    return url;
  }

  const videoId = match[1];
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}
