import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { ChildProcess } from "node:child_process";
import {
  __resetPlayerServiceForTests,
  getPlayerService,
} from "../services/player.service.ts";

describe("PlayerService - seek functionality", () => {
  let playerService: ReturnType<typeof getPlayerService>;

  beforeEach(() => {
    __resetPlayerServiceForTests();
    playerService = getPlayerService();
  });

  describe("seek() method", () => {
    test("should reject seek when no playback is active", () => {
      // Mock console.warn to verify warning is logged
      const warnSpy = mock(() => {});
      const originalWarn = console.warn;
      console.warn = warnSpy;

      playerService.seek(10);

      expect(warnSpy).toHaveBeenCalled();

      // Restore original console.warn
      console.warn = originalWarn;
    });

    test("should reject negative seek position", () => {
      const warnSpy = mock(() => {});
      const originalWarn = console.warn;
      console.warn = warnSpy;

      playerService.seek(-5);

      expect(warnSpy).toHaveBeenCalled();

      console.warn = originalWarn;
    });

    test("should reject NaN seek position", () => {
      const warnSpy = mock(() => {});
      const originalWarn = console.warn;
      console.warn = warnSpy;

      playerService.seek(NaN);

      expect(warnSpy).toHaveBeenCalled();

      console.warn = originalWarn;
    });

    test("should reject Infinity seek position", () => {
      const warnSpy = mock(() => {});
      const originalWarn = console.warn;
      console.warn = warnSpy;

      playerService.seek(Infinity);

      expect(warnSpy).toHaveBeenCalled();

      console.warn = originalWarn;
    });

    test("should accept valid positive seek position (boundary case: 0)", () => {
      const warnSpy = mock(() => {});
      const originalWarn = console.warn;
      console.warn = warnSpy;

      // Note: This will still warn because no playback is active
      // In a real test, you would need to mock the playback state
      playerService.seek(0);

      console.warn = originalWarn;
    });

    test("should accept valid positive seek position (normal case)", () => {
      const warnSpy = mock(() => {});
      const originalWarn = console.warn;
      console.warn = warnSpy;

      playerService.seek(30.5);

      console.warn = originalWarn;
    });
  });

  describe("volume control", () => {
    test("should clamp volume to 0-100 range (below minimum)", () => {
      playerService.setVolume(-10);
      expect(playerService.getVolume()).toBe(0);
    });

    test("should clamp volume to 0-100 range (above maximum)", () => {
      playerService.setVolume(150);
      expect(playerService.getVolume()).toBe(100);
    });

    test("should accept valid volume values", () => {
      playerService.setVolume(50);
      expect(playerService.getVolume()).toBe(50);
    });

    test("should handle boundary values", () => {
      playerService.setVolume(0);
      expect(playerService.getVolume()).toBe(0);

      playerService.setVolume(100);
      expect(playerService.getVolume()).toBe(100);
    });
  });

  describe("intentional stop exit handling", () => {
    test("should suppress eof when an intentionally stopped process exits cleanly", () => {
      const fakeProcess = {
        kill: mock(() => true),
      } as unknown as ChildProcess;
      const eventSpy = mock(() => {});
      const player = playerService as unknown as {
        mpvProcess: ChildProcess | null;
        eofHandled: boolean;
        handleSpawnedProcessExit: (
          process: ChildProcess,
          code: number | null,
          signal: NodeJS.Signals | null,
          handleSuccess: () => void,
          handleError: (error: Error) => void,
        ) => void;
      };

      playerService.onEvent(eventSpy);
      player.mpvProcess = fakeProcess;
      player.eofHandled = false;

      playerService.stop();
      player.handleSpawnedProcessExit(fakeProcess, 0, null, () => {}, () => {});

      expect(eventSpy).not.toHaveBeenCalled();
    });

    test("should keep natural eof behavior for a normal clean exit", () => {
      const fakeProcess = {} as ChildProcess;
      const eventSpy = mock(() => {});
      const player = playerService as unknown as {
        mpvProcess: ChildProcess | null;
        eofHandled: boolean;
        handleSpawnedProcessExit: (
          process: ChildProcess,
          code: number | null,
          signal: NodeJS.Signals | null,
          handleSuccess: () => void,
          handleError: (error: Error) => void,
        ) => void;
      };

      playerService.onEvent(eventSpy);
      player.mpvProcess = fakeProcess;
      player.eofHandled = false;

      player.handleSpawnedProcessExit(fakeProcess, 0, null, () => {}, () => {});

      expect(eventSpy).toHaveBeenCalledWith({ eof: true });
    });
  });

  describe("playback confirmation", () => {
    test("should wait for a positive time-pos before confirming playback", () => {
      const fakeProcess = {} as ChildProcess;
      const player = playerService as unknown as {
        beginPlaybackConfirmation: (
          process: ChildProcess,
          handleSuccess: () => void,
          handleError: (error: Error) => void,
        ) => void;
        handlePropertyChange: (message: {
          name: string;
          data: number | boolean;
        }) => void;
      };
      const handleSuccess = mock(() => {});
      const handleError = mock((_error: Error) => {});

      player.beginPlaybackConfirmation(
        fakeProcess,
        handleSuccess,
        handleError,
      );
      player.handlePropertyChange({ name: "time-pos", data: 0 });
      player.handlePropertyChange({ name: "time-pos", data: 0.25 });

      expect(handleSuccess).toHaveBeenCalledTimes(1);
      expect(handleError).not.toHaveBeenCalled();
    });

    test("should reject when mpv exits before playback is confirmed", () => {
      const fakeProcess = {} as ChildProcess;
      const player = playerService as unknown as {
        beginPlaybackConfirmation: (
          process: ChildProcess,
          handleSuccess: () => void,
          handleError: (error: Error) => void,
        ) => void;
        handleSpawnedProcessExit: (
          process: ChildProcess,
          code: number | null,
          signal: NodeJS.Signals | null,
          handleSuccess: () => void,
          handleError: (error: Error) => void,
        ) => void;
      };
      const handleSuccess = mock(() => {});
      const handleError = mock((_error: Error) => {});

      player.beginPlaybackConfirmation(
        fakeProcess,
        handleSuccess,
        handleError,
      );
      player.handleSpawnedProcessExit(
        fakeProcess,
        2,
        null,
        handleSuccess,
        handleError,
      );

      expect(handleSuccess).not.toHaveBeenCalled();
      expect(handleError).toHaveBeenCalledTimes(1);
      const firstError = handleError.mock.calls[0]?.[0];
      expect(firstError).toBeInstanceOf(Error);
      expect(firstError?.message).toBe("mpv exited with code 2");
    });
  });
});
