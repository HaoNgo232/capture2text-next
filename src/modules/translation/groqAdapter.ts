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

export interface GroqModelItem {
  id: string;
  active?: boolean;
  context_window?: number;
}

export class GroqTranslateAdapter implements TranslationAdapter {
  private getApiKey: () => string;
  private getModel: () => string;
  private fetcher: typeof fetch;

  static async fetchAvailableModels(
    apiKey: string,
    fetcher?: typeof fetch
  ): Promise<GroqModelItem[]> {
    const key = apiKey.trim();
    if (!key) {
      throw new Error("Groq API Key is missing");
    }

    const rawFetcher = fetcher ?? fetch;
    const safeFetcher = (url: RequestInfo | URL, init?: RequestInit) => rawFetcher(url, init);

    const response = await safeFetcher("https://api.groq.com/openai/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `HTTP ${response.status}`);
    }

    const list: Array<{ id: string; active?: boolean; context_window?: number }> = data.data || [];

    // Filter active chat completion models: exclude whisper, guard, embeddings
    const chatModels = list.filter((m) => {
      if (m.active === false) return false;
      const id = m.id.toLowerCase();
      if (id.includes("whisper") || id.includes("guard") || id.includes("embed")) {
        return false;
      }
      return true;
    });

    chatModels.sort((a, b) => a.id.localeCompare(b.id));
    return chatModels;
  }

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
      const msg = data.error?.message || `HTTP ${response.status}`;
      if (msg.includes("does not exist") || msg.includes("access to it")) {
        throw new Error(
          `Mô hình '${model}' không khả dụng hoặc đã ngừng hoạt động trên Groq. Vui lòng mở 'Cấu hình' và bấm 'Tải danh sách model' để chọn mô hình khả dụng.`
        );
      }
      throw new Error(msg);
    }

    let translation = data.choices?.[0]?.message?.content?.trim() || "";
    if (translation.startsWith('"') && translation.endsWith('"') && translation.length >= 2) {
      translation = translation.slice(1, -1).trim();
    }

    return translation;
  }
}
