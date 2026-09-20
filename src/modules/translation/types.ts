export interface TranslationRequest {
  text: string;
  sourceLang?: string;
  targetLang: string;
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
