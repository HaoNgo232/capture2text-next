import { describe, it, expect } from "bun:test";
import { ConfigStore, DEFAULT_CONFIG } from "../src/modules/config/configStore";

describe("ConfigStore", () => {
  it("returns default values when storage is empty", () => {
    const store = new ConfigStore();
    expect(store.get("shortcut")).toBe("Alt+Q");
    expect(store.get("provider")).toBe("google");
    expect(store.get("ocrLang")).toBe("jpn");
    expect(store.get("startHidden")).toBe(false);
    expect(store.get("showPreview")).toBe(false);
    expect(store.get("autoTranslate")).toBe(true);
  });

  it("persists and reads back typed configuration values", () => {
    const store = new ConfigStore();
    store.set("apiKey", "gsk_custom_123");
    store.set("provider", "groq");
    store.set("startHidden", true);
    store.set("shortcut", "Ctrl+Shift+S");

    expect(store.get("apiKey")).toBe("gsk_custom_123");
    expect(store.get("provider")).toBe("groq");
    expect(store.get("startHidden")).toBe(true);
    expect(store.get("shortcut")).toBe("Ctrl+Shift+S");
  });

  it("updates multiple settings at once with setMany", () => {
    const store = new ConfigStore();
    store.setMany({
      model: "llama-3.1-8b-instant",
      ocrLang: "vie",
      showPreview: true,
    });

    const all = store.getAll();
    expect(all.model).toBe("llama-3.1-8b-instant");
    expect(all.ocrLang).toBe("vie");
    expect(all.showPreview).toBe(true);
  });
});
