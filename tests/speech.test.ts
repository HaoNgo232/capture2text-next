import { describe, it, expect } from "bun:test";
import { chunkTextForTts, NaturalSpeechPlayer } from "../src/modules/speech/speechPlayer";

describe("chunkTextForTts", () => {
  it("keeps short sentences together when under limit", () => {
    const text = "Hello world. How are you today?";
    const chunks = chunkTextForTts(text, 150);
    expect(chunks).toEqual(["Hello world. How are you today?"]);
  });

  it("splits long text (> 150 chars) across sentence boundaries", () => {
    const sentence1 = "This is the first sentence that has some length to it and conveys useful information.";
    const sentence2 = "Here is a second sentence that will push the cumulative buffer over the 150 character limit.";
    const fullText = `${sentence1} ${sentence2}`;

    const chunks = chunkTextForTts(fullText, 150);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(sentence1);
    expect(chunks[1]).toBe(sentence2);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(150);
    });
  });

  it("subdivides a single continuous sentence longer than 150 characters without exceeding limit", () => {
    const longSentence =
      "This is an extraordinarily long sentence without any typical punctuation delimiters that goes on and on describing various intricate technical details of screen capture and optical character recognition software.";

    const chunks = chunkTextForTts(longSentence, 150);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(150);
    });
  });

  it("returns empty array for empty or whitespace text", () => {
    expect(chunkTextForTts("")).toEqual([]);
    expect(chunkTextForTts("    \n\t  ")).toEqual([]);
  });
});

describe("NaturalSpeechPlayer", () => {
  it("sequences multiple audio chunks and notifies listener onEnd", async () => {
    const playedUrls: string[] = [];
    const createdAudios: any[] = [];

    const fakeAudioFactory = (url: string) => {
      playedUrls.push(url);
      const audio = {
        src: url,
        play: async () => {},
        pause: () => {},
        onended: null as any,
        onerror: null as any,
      };
      createdAudios.push(audio);

      // Simulate audio end asynchronously
      setTimeout(() => {
        if (audio.onended) audio.onended();
      }, 10);

      return audio as any;
    };

    let started = false;
    let ended = false;

    const player = new NaturalSpeechPlayer(fakeAudioFactory, () => undefined);

    player.play("First chunk. Second chunk.", "en", {
      onStart: () => {
        started = true;
      },
      onEnd: () => {
        ended = true;
      },
    });

    expect(started).toBe(true);
    expect(player.isPlaying()).toBe(true);

    // Wait for async audio chunks to end
    await new Promise((r) => setTimeout(r, 50));

    expect(ended).toBe(true);
    expect(player.isPlaying()).toBe(false);
    expect(playedUrls.length).toBeGreaterThanOrEqual(1);
  });

  it("stops playback immediately when stop() is called", () => {
    let paused = false;
    const fakeAudioFactory = (_url: string) => {
      return {
        play: async () => {},
        pause: () => {
          paused = true;
        },
        onended: null as any,
        onerror: null as any,
      } as any;
    };

    const player = new NaturalSpeechPlayer(fakeAudioFactory, () => undefined);
    player.play("Some text to play", "en");
    expect(player.isPlaying()).toBe(true);

    player.stop();
    expect(player.isPlaying()).toBe(false);
    expect(paused).toBe(true);
  });
});
