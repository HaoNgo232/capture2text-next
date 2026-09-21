import { describe, it, expect } from "bun:test";
import { GoogleTranslateAdapter } from "../src/modules/translation/googleAdapter";
import { GroqTranslateAdapter } from "../src/modules/translation/groqAdapter";
import { TranslationService } from "../src/modules/translation/translationService";

describe("GoogleTranslateAdapter", () => {
  it("aggregates multiple segments from nested JSON response", async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify([
          [
            ["Xin chào ", "Hello ", null, null, 1],
            ["thế giới", "world", null, null, 1],
          ],
        ])
      );

    const adapter = new GoogleTranslateAdapter(fakeFetch as any);
    const result = await adapter.translate({
      text: "Hello world",
      targetLang: "vi",
    });

    expect(result).toBe("Xin chào thế giới");
  });

  it("throws a user-friendly error when HTTP response fails", async () => {
    const fakeFetch = async () =>
      new Response("Too Many Requests", { status: 429, statusText: "Too Many Requests" });

    const adapter = new GoogleTranslateAdapter(fakeFetch as any);
    expect(
      adapter.translate({ text: "Hello", targetLang: "vi" })
    ).rejects.toThrow("Google Translate connection error (HTTP 429)");
  });

  it("safely invokes fetch when bound to native window context (prevents Illegal invocation)", async () => {
    const nativeWindowFetch = function (this: any) {
      if (this && this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(
        new Response(
          JSON.stringify([
            [["Xin chào", "Hello", null, null, 1]],
          ])
        )
      );
    };

    const adapter = new GoogleTranslateAdapter(nativeWindowFetch as any);
    const result = await adapter.translate({ text: "Hello", targetLang: "vi" });
    expect(result).toBe("Xin chào");
  });
});

describe("GroqTranslateAdapter", () => {
  it("strips wrapping quotes and extracts translation from choices", async () => {
    let capturedBody: any = null;
    let capturedAuth = "";

    const fakeFetch = async (_url: any, init: any) => {
      capturedAuth = init.headers.Authorization;
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '"Phá vỡ rào cản ngôn ngữ"',
              },
            },
          ],
        })
      );
    };

    const adapter = new GroqTranslateAdapter({
      apiKey: "gsk_test_12345",
      model: "llama-3.3-70b-versatile",
      fetcher: fakeFetch as any,
    });

    const result = await adapter.translate({
      text: "Break language barriers",
      targetLang: "vi",
    });

    expect(result).toBe("Phá vỡ rào cản ngôn ngữ");
    expect(capturedAuth).toBe("Bearer gsk_test_12345");
    expect(capturedBody.model).toBe("llama-3.3-70b-versatile");
    expect(capturedBody.messages[0].content).toContain("vi");
    expect(capturedBody.messages[1].content).toBe("Break language barriers");
  });

  it("safely invokes fetch when bound to native window context (prevents Illegal invocation)", async () => {
    const nativeWindowFetch = function (this: any) {
      if (this && this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "Xin chào" } }],
          })
        )
      );
    };

    const adapter = new GroqTranslateAdapter({
      apiKey: "gsk_test_123",
      model: "llama-3.3-70b-versatile",
      fetcher: nativeWindowFetch as any,
    });

    const result = await adapter.translate({ text: "Hello", targetLang: "vi" });
    expect(result).toBe("Xin chào");
  });

  it("throws error with API error message if provided by Groq", async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "Invalid API Key provided",
          },
        }),
        { status: 401 }
      );

    const adapter = new GroqTranslateAdapter({
      apiKey: "invalid_key",
      model: "llama-3.3-70b-versatile",
      fetcher: fakeFetch as any,
    });

    expect(
      adapter.translate({ text: "Test", targetLang: "vi" })
    ).rejects.toThrow("Invalid API Key provided");
  });

  it("provides actionable error message when Groq reports model does not exist or no access", async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.",
          },
        }),
        { status: 404 }
      );

    const adapter = new GroqTranslateAdapter({
      apiKey: "valid_key",
      model: "llama-3.3-70b-versatile",
      fetcher: fakeFetch as any,
    });

    expect(
      adapter.translate({ text: "Test", targetLang: "vi" })
    ).rejects.toThrow("is not available or has been discontinued on Groq");
  });

  describe("fetchAvailableModels", () => {
    it("fetches active chat models from Groq API and filters out whisper and inactive models", async () => {
      let capturedUrl = "";
      let capturedAuth = "";

      const fakeFetch = async (url: any, init: any) => {
        capturedUrl = String(url);
        capturedAuth = init.headers.Authorization;
        return new Response(
          JSON.stringify({
            data: [
              { id: "llama-3.3-70b-versatile", active: true, context_window: 131072 },
              { id: "llama-3.1-8b-instant", active: true, context_window: 131072 },
              { id: "whisper-large-v3", active: true, context_window: 448 },
              { id: "llama-guard-3-8b", active: true, context_window: 8192 },
              { id: "deprecated-old-model", active: false, context_window: 4096 },
              { id: "mixtral-8x7b-32768", active: true, context_window: 32768 },
            ],
          })
        );
      };

      const models = await GroqTranslateAdapter.fetchAvailableModels("gsk_valid_key", fakeFetch as any);

      expect(capturedUrl).toBe("https://api.groq.com/openai/v1/models");
      expect(capturedAuth).toBe("Bearer gsk_valid_key");
      expect(models.map((m) => m.id)).toEqual([
        "llama-3.1-8b-instant",
        "llama-3.3-70b-versatile",
        "mixtral-8x7b-32768",
      ]);
    });

    it("throws a clear error when API key is missing", async () => {
      expect(GroqTranslateAdapter.fetchAvailableModels("")).rejects.toThrow(
        "Groq API Key is missing"
      );
    });

    it("throws error with API response message when request fails", async () => {
      const fakeFetch = async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Invalid API Key provided",
            },
          }),
          { status: 401 }
        );

      expect(
        GroqTranslateAdapter.fetchAvailableModels("bad_key", fakeFetch as any)
      ).rejects.toThrow("Invalid API Key provided");
    });
  });
});

describe("TranslationService", () => {
  it("measures latency and routes to active provider", async () => {
    const fakeGoogleAdapter = {
      translate: async () => {
        // Small delay to verify latency calculation
        await new Promise((r) => setTimeout(r, 10));
        return "Kết quả Google";
      },
    };

    const service = new TranslationService(
      {
        getProvider: () => "google",
        getGroqKey: () => "",
        getGroqModel: () => "llama-3.3-70b-versatile",
      },
      { googleAdapter: fakeGoogleAdapter }
    );

    const result = await service.translate({
      text: "Hello",
      targetLang: "vi",
    });

    expect(result.translatedText).toBe("Kết quả Google");
    expect(result.provider).toBe("google");
    expect(result.latencyMs).toBeGreaterThanOrEqual(5);
  });

  it("triggers fallback prompt when Groq key is missing and switches to Google if confirmed", async () => {
    let switchedProvider = "";
    let prompted = false;

    const fakeGoogleAdapter = {
      translate: async () => "Dịch bằng Google Fallback",
    };

    const service = new TranslationService(
      {
        getProvider: () => "groq",
        getGroqKey: () => "",
        getGroqModel: () => "llama-3.3-70b-versatile",
        onMissingGroqKey: async () => {
          prompted = true;
          return true; // user confirms fallback to Google
        },
        setProvider: (p) => {
          switchedProvider = p;
        },
      },
      { googleAdapter: fakeGoogleAdapter }
    );

    const res = await service.translate({ text: "Hello", targetLang: "vi" });
    expect(prompted).toBe(true);
    expect(switchedProvider).toBe("google");
    expect(res.translatedText).toBe("Dịch bằng Google Fallback");
  });

  it("throws error if Groq key is missing and user declines fallback", async () => {
    const service = new TranslationService({
      getProvider: () => "groq",
      getGroqKey: () => "",
      getGroqModel: () => "llama-3.3-70b-versatile",
      onMissingGroqKey: async () => false,
    });

    expect(
      service.translate({ text: "Hello", targetLang: "vi" })
    ).rejects.toThrow("Please open Settings and enter Groq API Key.");
  });

  it("fetchGroqModels delegates to GroqTranslateAdapter with configured key and fetcher", async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: "llama-3.1-8b-instant", active: true },
            { id: "whisper-large-v3", active: true },
          ],
        })
      );

    const service = new TranslationService(
      {
        getProvider: () => "groq",
        getGroqKey: () => "gsk_service_key",
        getGroqModel: () => "llama-3.1-8b-instant",
      },
      { fetcher: fakeFetch as any }
    );

    const models = await service.fetchGroqModels();
    expect(models.length).toBe(1);
    expect(models[0].id).toBe("llama-3.1-8b-instant");
  });
});
