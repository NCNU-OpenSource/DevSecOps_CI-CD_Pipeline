import { describe, expect, test } from "bun:test";
import {
  detectDeviceInfo,
  detectDeviceInfoSync,
} from "../../frontend/src/utils/device-info.ts";

describe("device-info detection", () => {
  test("should enrich Apple Silicon compatibility strings with high-entropy hints", async () => {
    const device = await detectDeviceInfo({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      platform: "MacIntel",
      userAgentData: {
        mobile: false,
        platform: "macOS",
        brands: [{ brand: "Google Chrome", version: "137" }],
        getHighEntropyValues: async () => ({
          architecture: "arm64",
          bitness: "64",
          platformVersion: "14.4.0",
          uaFullVersion: "137.0.0.0",
        }),
      },
    } as unknown as Navigator);

    expect(device.kind).toBe("desktop");
    expect(device.reportedName).toBe("Desktop · macOS");
    expect(device.metadata).toEqual({
      platformFamily: "macOS",
      platformVersion: "14.4.0",
      architecture: "ARM (64-bit)",
      browserName: "Google Chrome",
      browserVersion: "137.0.0.0",
      model: null,
    });
  });

  test("should detect generic Linux desktop browsers", () => {
    const device = detectDeviceInfoSync({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64; rv:138.0) Gecko/20100101 Firefox/138.0",
      platform: "Linux x86_64",
    } as unknown as Navigator);

    expect(device.kind).toBe("desktop");
    expect(device.reportedName).toBe("Desktop · Linux");
    expect(device.metadata).toEqual({
      platformFamily: "Linux",
      platformVersion: null,
      architecture: null,
      browserName: "Firefox",
      browserVersion: "138.0",
      model: null,
    });
  });

  test("should fall back to mobile UA heuristics without userAgentData", () => {
    const device = detectDeviceInfoSync({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
    } as unknown as Navigator);

    expect(device.kind).toBe("mobile");
    expect(device.reportedName).toBe("Mobile · iOS");
    expect(device.metadata?.browserName).toBe("Safari");
  });

  test("should not let viewport-only changes flip device kind", () => {
    const narrowViewportDevice = detectDeviceInfoSync({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      platform: "Win32",
      viewportWidth: 480,
    } as unknown as Navigator & { viewportWidth: number });
    const wideViewportDevice = detectDeviceInfoSync({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      platform: "Win32",
      viewportWidth: 1440,
    } as unknown as Navigator & { viewportWidth: number });

    expect(narrowViewportDevice.kind).toBe("desktop");
    expect(wideViewportDevice.kind).toBe("desktop");
  });
});
