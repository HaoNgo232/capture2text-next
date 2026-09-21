export interface AppConfig {
  apiKey: string;
  model: string;
  provider: "google" | "groq";
  ocrLang: string;
  shortcut: string;
  quickTranslateShortcut: string;
  startHidden: boolean;
  autostart: boolean;
  showPreview: boolean;
  autoTranslate: boolean;
}

export const STORAGE_KEYS = {
  API_KEY: "capture2text_groq_api_key",
  MODEL: "capture2text_groq_model",
  PROVIDER: "capture2text_provider",
  OCR_LANG: "capture2text_ocr_lang",
  SHORTCUT: "capture2text_trigger_shortcut",
  QUICK_TRANSLATE_SHORTCUT: "capture2text_quick_translate_shortcut",
  START_HIDDEN: "capture2text_start_hidden",
  AUTOSTART: "capture2text_autostart",
  SHOW_PREVIEW: "capture2text_show_preview",
  AUTO_TRANSLATE: "capture2text_auto_translate",
} as const;

export const DEFAULT_CONFIG: AppConfig = {
  apiKey: "",
  model: "llama-3.1-8b-instant",
  provider: "google",
  ocrLang: "jpn",
  shortcut: "Alt+Q",
  quickTranslateShortcut: "Alt+T",
  startHidden: false,
  autostart: false,
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

interface ConfigFieldDef<T> {
  storageKey: string;
  defaultVal: T;
  deserialize: (raw: string | null) => T;
  serialize: (val: T) => string;
}

const CONFIG_SCHEMA: { [K in keyof AppConfig]: ConfigFieldDef<AppConfig[K]> } = {
  apiKey: {
    storageKey: STORAGE_KEYS.API_KEY,
    defaultVal: DEFAULT_CONFIG.apiKey,
    deserialize: (raw) => raw ?? DEFAULT_CONFIG.apiKey,
    serialize: String,
  },
  model: {
    storageKey: STORAGE_KEYS.MODEL,
    defaultVal: DEFAULT_CONFIG.model,
    deserialize: (raw) => raw ?? DEFAULT_CONFIG.model,
    serialize: String,
  },
  provider: {
    storageKey: STORAGE_KEYS.PROVIDER,
    defaultVal: DEFAULT_CONFIG.provider,
    deserialize: (raw) => (raw === "groq" || raw === "google" ? raw : DEFAULT_CONFIG.provider),
    serialize: String,
  },
  ocrLang: {
    storageKey: STORAGE_KEYS.OCR_LANG,
    defaultVal: DEFAULT_CONFIG.ocrLang,
    deserialize: (raw) => raw ?? DEFAULT_CONFIG.ocrLang,
    serialize: String,
  },
  shortcut: {
    storageKey: STORAGE_KEYS.SHORTCUT,
    defaultVal: DEFAULT_CONFIG.shortcut,
    deserialize: (raw) => raw ?? DEFAULT_CONFIG.shortcut,
    serialize: String,
  },
  quickTranslateShortcut: {
    storageKey: STORAGE_KEYS.QUICK_TRANSLATE_SHORTCUT,
    defaultVal: DEFAULT_CONFIG.quickTranslateShortcut,
    deserialize: (raw) => raw ?? DEFAULT_CONFIG.quickTranslateShortcut,
    serialize: String,
  },
  startHidden: {
    storageKey: STORAGE_KEYS.START_HIDDEN,
    defaultVal: DEFAULT_CONFIG.startHidden,
    deserialize: (raw) => (raw === null ? DEFAULT_CONFIG.startHidden : raw === "true"),
    serialize: String,
  },
  autostart: {
    storageKey: STORAGE_KEYS.AUTOSTART,
    defaultVal: DEFAULT_CONFIG.autostart,
    deserialize: (raw) => (raw === null ? DEFAULT_CONFIG.autostart : raw === "true"),
    serialize: String,
  },
  showPreview: {
    storageKey: STORAGE_KEYS.SHOW_PREVIEW,
    defaultVal: DEFAULT_CONFIG.showPreview,
    deserialize: (raw) => (raw === null ? DEFAULT_CONFIG.showPreview : raw === "true"),
    serialize: String,
  },
  autoTranslate: {
    storageKey: STORAGE_KEYS.AUTO_TRANSLATE,
    defaultVal: DEFAULT_CONFIG.autoTranslate,
    deserialize: (raw) => (raw === null ? DEFAULT_CONFIG.autoTranslate : raw === "true"),
    serialize: String,
  },
};

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
    const field = CONFIG_SCHEMA[key];
    if (!field) {
      return DEFAULT_CONFIG[key];
    }
    return field.deserialize(this.storage.getItem(field.storageKey)) as AppConfig[K];
  }

  getAll(): AppConfig {
    const keys = Object.keys(CONFIG_SCHEMA) as (keyof AppConfig)[];
    const result = {} as AppConfig;
    for (const key of keys) {
      result[key] = this.get(key) as never;
    }
    return result;
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    const field = CONFIG_SCHEMA[key];
    if (field) {
      this.storage.setItem(field.storageKey, field.serialize(value));
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
