export interface AppConfig {
  apiKey: string;
  model: string;
  provider: "google" | "groq";
  ocrLang: string;
  shortcut: string;
  startHidden: boolean;
  showPreview: boolean;
  autoTranslate: boolean;
}

export const STORAGE_KEYS = {
  API_KEY: "capture2text_groq_api_key",
  MODEL: "capture2text_groq_model",
  PROVIDER: "capture2text_provider",
  OCR_LANG: "capture2text_ocr_lang",
  SHORTCUT: "capture2text_trigger_shortcut",
  START_HIDDEN: "capture2text_start_hidden",
  SHOW_PREVIEW: "capture2text_show_preview",
  AUTO_TRANSLATE: "capture2text_auto_translate",
} as const;

export const DEFAULT_CONFIG: AppConfig = {
  apiKey: "",
  model: "llama-3.3-70b-versatile",
  provider: "google",
  ocrLang: "jpn",
  shortcut: "Alt+Q",
  startHidden: false,
  showPreview: false,
  autoTranslate: true,
};

export interface SimpleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

class MemoryStorage implements SimpleStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

export class ConfigStore {
  private storage: SimpleStorage;

  constructor(storage?: SimpleStorage) {
    if (storage) {
      this.storage = storage;
    } else if (typeof window !== "undefined" && window.localStorage) {
      this.storage = window.localStorage;
    } else {
      this.storage = new MemoryStorage();
    }
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    switch (key) {
      case "apiKey": {
        return (this.storage.getItem(STORAGE_KEYS.API_KEY) ?? DEFAULT_CONFIG.apiKey) as AppConfig[K];
      }
      case "model": {
        return (this.storage.getItem(STORAGE_KEYS.MODEL) ?? DEFAULT_CONFIG.model) as AppConfig[K];
      }
      case "provider": {
        const val = this.storage.getItem(STORAGE_KEYS.PROVIDER);
        return (val === "groq" || val === "google" ? val : DEFAULT_CONFIG.provider) as AppConfig[K];
      }
      case "ocrLang": {
        return (this.storage.getItem(STORAGE_KEYS.OCR_LANG) ?? DEFAULT_CONFIG.ocrLang) as AppConfig[K];
      }
      case "shortcut": {
        return (this.storage.getItem(STORAGE_KEYS.SHORTCUT) ?? DEFAULT_CONFIG.shortcut) as AppConfig[K];
      }
      case "startHidden": {
        const val = this.storage.getItem(STORAGE_KEYS.START_HIDDEN);
        return (val === null ? DEFAULT_CONFIG.startHidden : val === "true") as AppConfig[K];
      }
      case "showPreview": {
        const val = this.storage.getItem(STORAGE_KEYS.SHOW_PREVIEW);
        return (val === null ? DEFAULT_CONFIG.showPreview : val === "true") as AppConfig[K];
      }
      case "autoTranslate": {
        const val = this.storage.getItem(STORAGE_KEYS.AUTO_TRANSLATE);
        return (val === null ? DEFAULT_CONFIG.autoTranslate : val === "true") as AppConfig[K];
      }
      default:
        return DEFAULT_CONFIG[key];
    }
  }

  getAll(): AppConfig {
    return {
      apiKey: this.get("apiKey"),
      model: this.get("model"),
      provider: this.get("provider"),
      ocrLang: this.get("ocrLang"),
      shortcut: this.get("shortcut"),
      startHidden: this.get("startHidden"),
      showPreview: this.get("showPreview"),
      autoTranslate: this.get("autoTranslate"),
    };
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    switch (key) {
      case "apiKey":
        this.storage.setItem(STORAGE_KEYS.API_KEY, String(value));
        break;
      case "model":
        this.storage.setItem(STORAGE_KEYS.MODEL, String(value));
        break;
      case "provider":
        this.storage.setItem(STORAGE_KEYS.PROVIDER, String(value));
        break;
      case "ocrLang":
        this.storage.setItem(STORAGE_KEYS.OCR_LANG, String(value));
        break;
      case "shortcut":
        this.storage.setItem(STORAGE_KEYS.SHORTCUT, String(value));
        break;
      case "startHidden":
        this.storage.setItem(STORAGE_KEYS.START_HIDDEN, String(value));
        break;
      case "showPreview":
        this.storage.setItem(STORAGE_KEYS.SHOW_PREVIEW, String(value));
        break;
      case "autoTranslate":
        this.storage.setItem(STORAGE_KEYS.AUTO_TRANSLATE, String(value));
        break;
    }
  }

  setMany(partial: Partial<AppConfig>): void {
    for (const [k, v] of Object.entries(partial) as [keyof AppConfig, AppConfig[keyof AppConfig]][]) {
      if (v !== undefined) {
        this.set(k, v);
      }
    }
  }
}
