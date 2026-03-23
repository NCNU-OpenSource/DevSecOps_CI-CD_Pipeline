import { spawnSync } from "node:child_process";
import { log } from "./logger.ts";
import { getYtDlpExecutable } from "./ytdlp.ts";

type RuntimeDependency = {
  name: "mpv" | "yt-dlp";
  executable: string;
  required: boolean;
  purpose: string;
};

type DependencyProbeResult = {
  available: boolean;
  version?: string;
  error?: string;
};

export function getMpvExecutable(): string {
  const configuredPath = process.env.MPV_PATH?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  return process.platform === "win32" ? "mpv.exe" : "mpv";
}

function probeExecutable(executable: string): DependencyProbeResult {
  const result = spawnSync(executable, ["--version"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    return {
      available: false,
      error: result.error.message,
    };
  }

  if (result.status !== 0) {
    return {
      available: false,
      error:
        result.stderr.trim() ||
        result.stdout.trim() ||
        `exited with code ${result.status ?? "unknown"}`,
    };
  }

  const versionLine =
    `${result.stdout}`.trim().split(/\r?\n/).find(Boolean) ?? "unknown";

  return {
    available: true,
    version: versionLine,
  };
}

export function logRuntimeDependencyStatus(): void {
  const dependencies: RuntimeDependency[] = [
    {
      name: "mpv",
      executable: getMpvExecutable(),
      required: true,
      purpose: "audio playback",
    },
    {
      name: "yt-dlp",
      executable: getYtDlpExecutable(),
      required: false,
      purpose: "YouTube fallback extraction",
    },
  ];

  for (const dependency of dependencies) {
    const result = probeExecutable(dependency.executable);

    if (result.available) {
      log.info("Runtime dependency available", {
        dependency: dependency.name,
        executable: dependency.executable,
        version: result.version,
        purpose: dependency.purpose,
      });
      continue;
    }

    const context = {
      dependency: dependency.name,
      executable: dependency.executable,
      purpose: dependency.purpose,
      error: result.error,
    };

    if (dependency.required) {
      log.error("Required runtime dependency missing", context);
      continue;
    }

    log.warn("Optional runtime dependency missing", context);
  }
}
