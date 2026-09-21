import vi from "./vi";
import en from "./en";

export type Lang = "vi" | "en";

type NestedStrings = {
  [key: string]: string | NestedStrings;
};

const translations: Record<Lang, NestedStrings> = { vi, en };

function getNestedValue(obj: NestedStrings, path: string): string | undefined {
  const parts = path.split(".");
  let current: NestedStrings | string = obj;
  for (const part of parts) {
    if (typeof current === "string") return undefined;
    current = current[part];
    if (current === undefined) return undefined;
  }
  return typeof current === "string" ? current : undefined;
}

function interpolate(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), v),
    template
  );
}

export interface I18n {
  t(key: string, params?: Record<string, string>): string;
  getLang(): Lang;
  setLang(lang: Lang): void;
  onLangChange(listener: (lang: Lang) => void): () => void;
}

export function createI18n(initialLang: Lang = "en"): I18n {
  let currentLang: Lang = initialLang;
  const listeners: Array<(lang: Lang) => void> = [];

  return {
    t(key: string, params?: Record<string, string>): string {
      const value = getNestedValue(translations[currentLang], key);
      if (value === undefined) return key;
      if (!params) return value;
      return interpolate(value, params);
    },

    getLang(): Lang {
      return currentLang;
    },

    setLang(lang: Lang): void {
      if (lang === currentLang) return;
      currentLang = lang;
      for (const listener of listeners) {
        listener(lang);
      }
    },

    onLangChange(listener: (lang: Lang) => void): () => void {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
  };
}

export const i18n = createI18n();
