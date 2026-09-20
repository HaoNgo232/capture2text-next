export type OcrLanguageCode = "jpn" | "eng" | "vie" | "chi_sim" | (string & {});
export type TargetLanguageCode = "vi" | "en" | "ja" | "zh-CN" | (string & {});
export type TtsLanguageCode = "vi" | "en" | "ja" | "zh-CN" | (string & {});

export interface TranslationRequest {
  text: string;
  sourceLang?: string;
  targetLang: TargetLanguageCode;
}

export interface TranslationResult {
  translatedText: string;
  provider: "google" | "groq";
  latencyMs: number;
}

export interface TranslationAdapter {
  translate(req: TranslationRequest): Promise<string>;
}

export interface TranslationServiceConfig {
  getProvider(): "google" | "groq";
  getGroqKey(): string;
  getGroqModel(): string;
  setProvider?(provider: "google" | "groq"): void;
  onMissingGroqKey?(): Promise<boolean> | boolean;
}
