import { invoke } from "@tauri-apps/api/core";

/**
 * Splits text into chunks respecting sentence/clause punctuation and character limits (default 150 chars),
 * preventing Google TTS HTTP 400 rejection on large requests.
 */
export function chunkTextForTts(text: string, maxChunkLen: number = 150): string[] {
  const clean = text.trim();
  if (!clean) return [];

  // Match sentences or clauses ending in punctuation, or individual whitespace-delimited tokens
  const rawSegments = clean.match(/[^.!?\n,]+[.!?\n,]?|\S+/g) || [clean];

  // If any single segment exceeds maxChunkLen, subdivide by words or character length
  const segments: string[] = [];
  for (const seg of rawSegments) {
    const trimmedSeg = seg.trim();
    if (!trimmedSeg) continue;

    if (trimmedSeg.length <= maxChunkLen) {
      segments.push(trimmedSeg);
    } else {
      // Split overlong segment by words
      const words = trimmedSeg.split(/\s+/);
      let wordBuf = "";
      for (const w of words) {
        if ((wordBuf + (wordBuf ? " " : "") + w).length <= maxChunkLen) {
          wordBuf += (wordBuf ? " " : "") + w;
        } else {
          if (wordBuf) segments.push(wordBuf);
          if (w.length <= maxChunkLen) {
            wordBuf = w;
          } else {
            // Word itself is longer than maxChunkLen, slice by length
            for (let i = 0; i < w.length; i += maxChunkLen) {
              segments.push(w.slice(i, i + maxChunkLen));
            }
            wordBuf = "";
          }
        }
      }
      if (wordBuf) segments.push(wordBuf);
    }
  }

  const chunks: string[] = [];
  let buffer = "";

  for (const seg of segments) {
    const combined = buffer ? `${buffer} ${seg}` : seg;
    if (combined.length <= maxChunkLen) {
      buffer = combined;
    } else {
      if (buffer.trim()) chunks.push(buffer.trim());
      buffer = seg;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());

  return chunks;
}

export interface SpeechPlaybackListener {
  onStart?(): void;
  onEnd?(): void;
  onError?(err: Error): void;
}

export class NaturalSpeechPlayer {
  private currentAudio: HTMLAudioElement | null = null;
  private activeListener: SpeechPlaybackListener | null = null;
  private active: boolean = false;

  constructor(
    private audioFactory: (url: string) => HTMLAudioElement = (url) => new Audio(url),
    private getSynthesis: () => SpeechSynthesis | undefined = () =>
      typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : undefined,
    private synthesizer: (text: string, lang: string) => Promise<string> = (text, lang) =>
      invoke<string>("synthesize_speech", { text, lang })
  ) {}

  isPlaying(): boolean {
    return this.active;
  }

  stop(): void {
    if (!this.active && !this.currentAudio) return;

    this.active = false;
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    const synth = this.getSynthesis();
    if (synth) {
      try {
        synth.cancel();
      } catch {
        // Ignore synthesis cancel error
      }
    }

    const listener = this.activeListener;
    this.activeListener = null;
    if (listener?.onEnd) {
      listener.onEnd();
    }
  }

  play(text: string, langCode: string, listener?: SpeechPlaybackListener): void {
    this.stop();

    const chunks = chunkTextForTts(text, 150);
    if (chunks.length === 0) return;

    this.active = true;
    this.activeListener = listener ?? null;
    this.activeListener?.onStart?.();

    let chunkIdx = 0;

    const playNextChunk = async () => {
      if (!this.active) return;

      if (chunkIdx >= chunks.length) {
        this.stop();
        return;
      }

      const currentText = chunks[chunkIdx++];

      try {
        const audioSrc = await this.synthesizer(currentText, langCode);
        if (!this.active) return;

        const audio = this.audioFactory(audioSrc);
        this.currentAudio = audio;

        audio.onended = () => {
          if (!this.active) return;
          playNextChunk();
        };

        audio.onerror = () => {
          if (!this.active) return;
          this.playFallbackWebSpeech(currentText, langCode, () => playNextChunk());
        };

        const playPromise = audio.play();
        if (playPromise !== undefined && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            if (!this.active) return;
            this.playFallbackWebSpeech(currentText, langCode, () => playNextChunk());
          });
        }
      } catch (err) {
        console.warn("Backend TTS không phản hồi, thử Web Speech API:", err);
        if (!this.active) return;
        this.playFallbackWebSpeech(currentText, langCode, () => playNextChunk());
      }
    };

    playNextChunk();
  }

  private playFallbackWebSpeech(text: string, langCode: string, onDone: () => void): void {
    const synth = this.getSynthesis();
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
      onDone();
      return;
    }

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices ? synth.getVoices() : [];
      const targetPrefix = langCode.toLowerCase().split("-")[0];
      const matchingVoices = voices.filter((v) =>
        v.lang.toLowerCase().replace("_", "-").startsWith(targetPrefix)
      );

      // Prioritize natural, neural, or online voices available on OS
      const bestVoice =
        matchingVoices.find((v) => /natural|neural|online/i.test(v.name)) ||
        matchingVoices[0];

      if (!bestVoice) {
        // Prevent English default voice (e.g. Microsoft David) from mispronouncing foreign languages
        console.warn(`Hệ điều hành chưa cài đặt voice cho ngôn ngữ: ${langCode}`);
        onDone();
        return;
      }

      utterance.voice = bestVoice;
      utterance.lang = langCode;

      utterance.onend = () => onDone();
      utterance.onerror = () => onDone();

      synth.speak(utterance);
    } catch {
      onDone();
    }
  }
}
