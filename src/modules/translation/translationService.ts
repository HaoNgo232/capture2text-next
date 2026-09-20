import { GoogleTranslateAdapter } from "./googleAdapter";
import { GroqTranslateAdapter } from "./groqAdapter";
import type {
  TranslationAdapter,
  TranslationRequest,
  TranslationResult,
  TranslationServiceConfig,
} from "./types";

export interface TranslationServiceOptions {
  fetcher?: typeof fetch;
  googleAdapter?: TranslationAdapter;
  groqAdapter?: TranslationAdapter;
}

export class TranslationService {
  private googleAdapter: TranslationAdapter;
  private groqAdapter: TranslationAdapter;

  constructor(
    private config: TranslationServiceConfig,
    options: TranslationServiceOptions = {}
  ) {
    const fetcher = options.fetcher ?? fetch;
    this.googleAdapter =
      options.googleAdapter ?? new GoogleTranslateAdapter(fetcher);
    this.groqAdapter =
      options.groqAdapter ??
      new GroqTranslateAdapter({
        apiKey: () => this.config.getGroqKey(),
        model: () => this.config.getGroqModel(),
        fetcher,
      });
  }

  async translate(req: TranslationRequest): Promise<TranslationResult> {
    const startTime = performance.now();
    let provider = this.config.getProvider();

    if (provider === "groq") {
      const apiKey = this.config.getGroqKey().trim();
      if (!apiKey) {
        if (this.config.onMissingGroqKey) {
          const fallbackToGoogle = await this.config.onMissingGroqKey();
          if (fallbackToGoogle) {
            provider = "google";
            this.config.setProvider?.("google");
          } else {
            throw new Error("Vui lòng mở mục Cấu hình và nhập Groq API Key.");
          }
        } else {
          throw new Error("Vui lòng mở mục Cấu hình và nhập Groq API Key.");
        }
      }
    }

    const adapter = provider === "groq" ? this.groqAdapter : this.googleAdapter;
    const translatedText = await adapter.translate(req);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      translatedText: translatedText.trim(),
      provider,
      latencyMs,
    };
  }
}
