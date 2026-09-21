import { describe, it, expect, beforeEach } from "bun:test";
import { createI18n, type I18n } from "../src/i18n";

const ALL_KEYS = [
  "header.minimize",
  "header.shortcuts",
  "header.settings",
  "main.sourceLabel",
  "main.captureBtn",
  "main.speechBtn",
  "main.clearBtn",
  "main.targetLabel",
  "main.copyBtn",
  "main.translateBtn",
  "main.placeholder",
  "settings.title",
  "settings.backBtn",
  "settings.saveBtn",
  "settings.cancelBtn",
  "settings.languageLabel",
  "settings.langVi",
  "settings.langEn",
  "settings.shortcutLabel",
  "settings.modelLabel",
  "settings.fetchModelsBtn",
  "settings.fetchingModels",
  "settings.fetchingModelsStatus",
  "settings.noModelsFound",
  "settings.modelsFound",
  "settings.enterApiKeyFirst",
  "settings.autoTranslate",
  "settings.startHidden",
  "settings.showPreview",
  "settings.translationOnly",
  "settings.autostart",
  "settings.quickTranslateLabel",
  "settings.recordBtn",
  "settings.customShortcut",
  "settings.customShortcutPlaceholder",
  "shortcuts.title",
  "shortcuts.subtitle",
  "shortcuts.backBtn",
  "shortcuts.globalCapture",
  "shortcuts.globalCaptureDetail",
  "shortcuts.quickTranslate",
  "shortcuts.quickTranslateDetail",
  "shortcuts.systemTray",
  "shortcuts.systemTrayDetail",
  "shortcuts.pasteImage",
  "shortcuts.pasteImageDetail",
  "shortcuts.escExit",
  "shortcuts.escExitDetail",
  "snipping.instruction",
  "snipping.escCancel",
  "status.recognizing",
  "status.loadingOcr",
  "status.translating",
  "status.connecting",
  "status.loading",
  "status.copied",
  "status.recording",
  "status.waitingForKey",
  "status.reading",
  "status.previewTitle",
  "error.ocrNotReady",
  "error.noTextFound",
  "error.snippingInit",
  "error.cropLoad",
  "error.cropProcess",
  "error.imageProcess",
  "error.imageLoadFail",
  "error.shortcutError",
  "error.ttsFallback",
  "error.missingGroqKey",
  "error.googleTranslateFail",
  "error.groqModelUnavailable",
  "error.errorPrefix",
  "error.ocrErrorPrefix",
  "confirm.fallbackToGoogle",
  "ocrLang.jpn",
  "ocrLang.eng",
  "ocrLang.vie",
  "ocrLang.chi_sim",
  "targetLang.vi",
  "targetLang.en",
  "targetLang.ja",
  "targetLang.zh",
  "targetLang.de",
  "targetLang.fr",
];

describe("i18n", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = createI18n();
  });

  it("returns English by default", () => {
    expect(i18n.getLang()).toBe("en");
    expect(i18n.t("header.minimize")).toBe("Minimize");
  });

  it("switches to Vietnamese", () => {
    i18n.setLang("vi");
    expect(i18n.getLang()).toBe("vi");
    expect(i18n.t("header.minimize")).toBe("Chạy ngầm");
  });

  it("returns key itself for unknown keys", () => {
    expect(i18n.t("unknown.key")).toBe("unknown.key");
  });

  it("supports parameter interpolation", () => {
    i18n.setLang("vi");
    expect(i18n.t("status.recognizing", { percent: "50" })).toBe("Nhận diện: 50%");
    i18n.setLang("en");
    expect(i18n.t("status.recognizing", { percent: "50" })).toBe("Recognizing: 50%");
  });

  it("notifies listener on language change", () => {
    let called = false;
    let newLang = "";
    i18n.onLangChange((lang) => {
      called = true;
      newLang = lang;
    });
    i18n.setLang("vi");
    expect(called).toBe(true);
    expect(newLang).toBe("vi");
  });

  it("does not notify listener if same language set", () => {
    let callCount = 0;
    i18n.onLangChange(() => {
      callCount++;
    });
    i18n.setLang("en");
    expect(callCount).toBe(0);
  });

  it("provides all expected Vietnamese keys", () => {
    for (const key of ALL_KEYS) {
      const vi = createI18n("vi");
      expect(vi.t(key), `Missing Vietnamese key: ${key}`).not.toBe(key);
    }
  });

  it("provides all expected English keys", () => {
    for (const key of ALL_KEYS) {
      const en = createI18n("en");
      expect(en.t(key), `Missing English key: ${key}`).not.toBe(key);
    }
  });
});
