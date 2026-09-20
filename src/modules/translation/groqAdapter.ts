import type { TranslationAdapter, TranslationRequest } from "./types";

export interface GroqAdapterOptions {
  apiKey: string | (() => string);
  model: string | (() => string);
  fetcher?: typeof fetch;
}

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export class GroqTranslateAdapter implements TranslationAdapter {
  private getApiKey: () => string;
  private getModel: () => string;
  private fetcher: typeof fetch;

  constructor(options: GroqAdapterOptions) {
    this.getApiKey = typeof options.apiKey === "function" ? options.apiKey : () => options.apiKey as string;
    this.getModel = typeof options.model === "function" ? options.model : () => options.model as string;
    const rawFetcher = options.fetcher ?? fetch;
    this.fetcher = (url: RequestInfo | URL, init?: RequestInit) => rawFetcher(url, init);
  }

  async translate(req: TranslationRequest): Promise<string> {
    const apiKey = this.getApiKey().trim();
    if (!apiKey) {
      throw new Error("Groq API Key is missing");
    }

    const model = this.getModel();

    const response = await this.fetcher("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.1,
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `You are an expert translator. Translate faithfully into language code: ${req.targetLang}. Return ONLY the direct translation without quotes, markdown backticks, explanations, or notes.`,
          },
          {
            role: "user",
            content: req.text,
          },
        ],
      }),
    });

    const data: GroqChatResponse = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `HTTP ${response.status}`);
    }

    let translation = data.choices?.[0]?.message?.content?.trim() || "";
    if (translation.startsWith('"') && translation.endsWith('"') && translation.length >= 2) {
      translation = translation.slice(1, -1).trim();
    }

    return translation;
  }
}
