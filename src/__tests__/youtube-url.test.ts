import { describe, expect, test } from "bun:test";
import { parseYouTubeUrl } from "../utils/youtube-url.ts";

describe("parseYouTubeUrl", () => {
  test("should parse watch URLs with a video id", () => {
    expect(
      parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toEqual({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      videoId: "dQw4w9WgXcQ",
    });
  });

  test("should parse short links and keep playlist context", () => {
    expect(
      parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?list=PL1234567890"),
    ).toEqual({
      url: "https://youtu.be/dQw4w9WgXcQ?list=PL1234567890",
      videoId: "dQw4w9WgXcQ",
      collection: {
        kind: "playlist",
        id: "PL1234567890",
        playlistId: "PL1234567890",
      },
    });
  });

  test("should parse shorts URLs", () => {
    expect(
      parseYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    ).toEqual({
      url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      videoId: "dQw4w9WgXcQ",
    });
  });

  test("should parse music album browse URLs", () => {
    expect(
      parseYouTubeUrl("https://music.youtube.com/browse/MPREb_abcdef123"),
    ).toEqual({
      url: "https://music.youtube.com/browse/MPREb_abcdef123",
      collection: {
        kind: "album",
        id: "MPREb_abcdef123",
        browseId: "MPREb_abcdef123",
      },
    });
  });

  test("should classify OLAK list ids as albums", () => {
    expect(
      parseYouTubeUrl("https://music.youtube.com/playlist?list=OLAK5uy_test"),
    ).toEqual({
      url: "https://music.youtube.com/playlist?list=OLAK5uy_test",
      collection: {
        kind: "album",
        id: "OLAK5uy_test",
        playlistId: "OLAK5uy_test",
      },
    });
  });

  test("should classify RD list ids as mixes", () => {
    expect(
      parseYouTubeUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMtest"),
    ).toEqual({
      url: "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMtest",
      videoId: "dQw4w9WgXcQ",
      collection: {
        kind: "mix",
        id: "RDAMVMtest",
        playlistId: "RDAMVMtest",
      },
    });
  });

  test("should return null for unsupported urls", () => {
    expect(parseYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYouTubeUrl("not a url")).toBeNull();
  });
});
