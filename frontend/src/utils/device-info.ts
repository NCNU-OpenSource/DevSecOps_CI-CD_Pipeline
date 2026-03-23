import type { SyncDeviceKind, SyncDeviceMetadata } from "../types/library";

const MOBILE_UA_PATTERN =
  /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i;

type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    mobile?: boolean;
    platform?: string;
    brands?: Array<{ brand?: string; version?: string }>;
    getHighEntropyValues?: (
      hints: string[],
    ) => Promise<Record<string, unknown>>;
  };
};

export interface RuntimeDeviceInfo {
  kind: SyncDeviceKind;
  reportedName: string;
  legacyName: string;
  metadata: SyncDeviceMetadata | null;
}

function getDefaultNavigator(): NavigatorWithUAData {
  const navigatorLike = globalThis.navigator as NavigatorWithUAData | undefined;

  if (!navigatorLike) {
    throw new Error("Navigator is not available in this environment");
  }

  return navigatorLike;
}

function detectKind(userAgent: string, navigatorLike: NavigatorWithUAData): SyncDeviceKind {
  if (typeof navigatorLike.userAgentData?.mobile === "boolean") {
    return navigatorLike.userAgentData.mobile ? "mobile" : "desktop";
  }

  return MOBILE_UA_PATTERN.test(userAgent) ? "mobile" : "desktop";
}

function detectPlatformFamily(
  userAgent: string,
  navigatorLike: NavigatorWithUAData,
): string {
  const rawPlatform = navigatorLike.userAgentData?.platform ?? navigatorLike.platform ?? "";
  const normalized = rawPlatform.toLowerCase();

  if (normalized.includes("mac")) {
    return "macOS";
  }
  if (normalized.includes("win")) {
    return "Windows";
  }
  if (normalized.includes("linux")) {
    return "Linux";
  }
  if (normalized.includes("android")) {
    return "Android";
  }
  if (normalized.includes("ios") || normalized.includes("iphone") || normalized.includes("ipad")) {
    return "iOS";
  }

  if (/Android/i.test(userAgent)) {
    return "Android";
  }
  if (/(iPhone|iPad|iPod)/i.test(userAgent)) {
    return "iOS";
  }
  if (/Mac OS X/i.test(userAgent)) {
    return "macOS";
  }
  if (/Windows NT/i.test(userAgent)) {
    return "Windows";
  }
  if (/Linux/i.test(userAgent)) {
    return "Linux";
  }

  return rawPlatform || "Unknown";
}

function detectBrowser(userAgent: string, navigatorLike: NavigatorWithUAData): {
  name?: string | null;
  version?: string | null;
} {
  const brands = navigatorLike.userAgentData?.brands ?? [];
  const preferredBrand = brands.find((brand) => {
    const label = (brand.brand ?? "").toLowerCase();
    return (
      label.length > 0 &&
      label !== "not a brand" &&
      label !== "not_a brand" &&
      label !== "chromium"
    );
  });

  if (preferredBrand?.brand) {
    return {
      name: preferredBrand.brand,
      version: preferredBrand.version ?? null,
    };
  }

  const rules = [
    { pattern: /(Edg|Edge)\/([\d.]+)/, name: "Edge" },
    { pattern: /Firefox\/([\d.]+)/, name: "Firefox" },
    { pattern: /Version\/([\d.]+).*Safari/, name: "Safari" },
    { pattern: /Chrome\/([\d.]+)/, name: "Chrome" },
  ];

  for (const rule of rules) {
    const match = userAgent.match(rule.pattern);
    if (match) {
      const versionIndex = match.length > 2 ? 2 : 1;
      return {
        name: rule.name,
        version: match[versionIndex] ?? null,
      };
    }
  }

  return {};
}

function normalizeArchitecture(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "arm" || normalized === "arm64" || normalized === "aarch64") {
    return "ARM";
  }
  if (
    normalized === "x86" ||
    normalized === "x86_64" ||
    normalized === "x64" ||
    normalized === "amd64"
  ) {
    return "x86_64";
  }

  return value.trim();
}

function buildReportedName(kind: SyncDeviceKind, metadata: SyncDeviceMetadata | null): string {
  const kindLabel = kind === "desktop" ? "Desktop" : "Mobile";
  const platformFamily = metadata?.platformFamily?.trim();
  return platformFamily ? `${kindLabel} · ${platformFamily}` : `${kindLabel} · Unknown`;
}

function createBaseMetadata(
  userAgent: string,
  navigatorLike: NavigatorWithUAData,
): SyncDeviceMetadata {
  const platformFamily = detectPlatformFamily(userAgent, navigatorLike);
  const browser = detectBrowser(userAgent, navigatorLike);

  return {
    platformFamily,
    browserName: browser.name ?? null,
    browserVersion: browser.version ?? null,
    platformVersion: null,
    architecture: null,
    model: null,
  };
}

export function formatDeviceDetail(
  metadata: SyncDeviceMetadata | null,
  kind: SyncDeviceKind,
): string {
  const segments: string[] = [];

  if (metadata?.platformFamily) {
    const withVersion = metadata.platformVersion
      ? `${metadata.platformFamily} ${metadata.platformVersion}`
      : metadata.platformFamily;
    segments.push(withVersion);
  } else {
    segments.push(kind === "desktop" ? "桌面裝置" : "手機裝置");
  }

  if (metadata?.architecture) {
    segments.push(metadata.architecture);
  }

  if (metadata?.browserName) {
    const browserWithVersion = metadata.browserVersion
      ? `${metadata.browserName} ${metadata.browserVersion}`
      : metadata.browserName;
    segments.push(browserWithVersion);
  }

  return segments.join(" · ");
}

export function detectDeviceInfoSync(
  navigatorLike: NavigatorWithUAData = getDefaultNavigator(),
): RuntimeDeviceInfo {
  const userAgent = navigatorLike.userAgent ?? "";
  const kind = detectKind(userAgent, navigatorLike);
  const metadata = createBaseMetadata(userAgent, navigatorLike);
  const reportedName = buildReportedName(kind, metadata);

  return {
    kind,
    reportedName,
    legacyName: reportedName,
    metadata,
  };
}

export async function detectDeviceInfo(
  navigatorLike: NavigatorWithUAData = getDefaultNavigator(),
): Promise<RuntimeDeviceInfo> {
  const base = detectDeviceInfoSync(navigatorLike);
  const metadata: SyncDeviceMetadata = {
    ...(base.metadata ?? {}),
  };

  try {
    const hints = await navigatorLike.userAgentData?.getHighEntropyValues?.([
      "architecture",
      "bitness",
      "model",
      "platformVersion",
      "uaFullVersion",
    ]);

    const architecture = normalizeArchitecture(hints?.architecture);
    const bitness = typeof hints?.bitness === "string" ? hints.bitness : null;
    const model = typeof hints?.model === "string" && hints.model.trim() ? hints.model : null;
    const platformVersion =
      typeof hints?.platformVersion === "string" && hints.platformVersion.trim()
        ? hints.platformVersion
        : null;
    const uaFullVersion =
      typeof hints?.uaFullVersion === "string" && hints.uaFullVersion.trim()
        ? hints.uaFullVersion
        : null;

    if (architecture) {
      metadata.architecture = bitness ? `${architecture} (${bitness}-bit)` : architecture;
    }

    if (model) {
      metadata.model = model;
    }

    if (platformVersion) {
      metadata.platformVersion = platformVersion;
    }

    if (uaFullVersion && metadata.browserName) {
      metadata.browserVersion = uaFullVersion;
    }
  } catch {
    // High entropy hints are optional; fallback data is already populated.
  }

  const reportedName = buildReportedName(base.kind, metadata);
  return {
    ...base,
    reportedName,
    legacyName: reportedName,
    metadata,
  };
}
