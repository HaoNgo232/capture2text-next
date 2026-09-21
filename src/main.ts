import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ConfigStore } from "./modules/config/configStore";
import { ShortcutManager } from "./modules/shortcuts/shortcutManager";
import { OcrPipeline } from "./modules/ocr/ocrPipeline";
import { TranslationService } from "./modules/translation/translationService";
import { NaturalSpeechPlayer } from "./modules/speech/speechPlayer";
import { i18n, type Lang } from "./i18n";

const GOOGLE_ICON_SVG = `
<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
</svg>`;

const GROQ_ICON_SVG = `
<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect width="24" height="24" rx="5" fill="#F55036"/>
  <path d="M12 6a6 6 0 1 0 4.24 10.24l2.12 2.12a1 1 0 0 0 1.41-1.41l-2.12-2.12A5.98 5.98 0 0 0 18 12a6 6 0 0 0-6-6zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z" fill="#FFFFFF"/>
</svg>`;

const OCR_TO_TTS_LANG: Record<string, string> = {
  vie: "vi",
  eng: "en",
  chi_sim: "zh-CN",
  jpn: "ja",
};

function applyTranslations() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = i18n.t(key);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) (el as HTMLInputElement).placeholder = i18n.t(key);
  });
  document.documentElement.lang = i18n.getLang();
}

const KNOWN_PRESETS = ["Alt+Q", "Ctrl+Shift+S", "Ctrl+Shift+Q", "Alt+D", "F4"];

type ActiveView = "main" | "settings" | "shortcuts";

document.addEventListener("DOMContentLoaded", () => {
  // Deep Module Instances
  const configStore = new ConfigStore();
  const ocrPipeline = new OcrPipeline();
  const speechPlayer = new NaturalSpeechPlayer();

  // DOM Elements: Views
  const mainView = document.getElementById("mainView") as HTMLElement;
  const settingsView = document.getElementById("settingsView") as HTMLElement;
  const shortcutsView = document.getElementById("shortcutsView") as HTMLElement;

  // Header Nav buttons
  const minimizeToTrayBtn = document.getElementById("minimizeToTrayBtn") as HTMLButtonElement | null;
  const shortcutsBtn = document.getElementById("shortcutsBtn") as HTMLButtonElement | null;
  const toggleSettingsBtn = document.getElementById("toggleSettingsBtn") as HTMLButtonElement;
  const backFromSettingsBtn = document.getElementById("backFromSettingsBtn") as HTMLButtonElement | null;
  const cancelSettingsBtn = document.getElementById("cancelSettingsBtn") as HTMLButtonElement | null;
  const backFromShortcutsBtn = document.getElementById("backFromShortcutsBtn") as HTMLButtonElement | null;

  // Translation UI
  const sourceInput = document.getElementById("sourceInput") as HTMLTextAreaElement;
  const targetDisplay = document.getElementById("targetDisplay") as HTMLDivElement;
  const providerSelect = document.getElementById("providerSelect") as HTMLSelectElement;
  const providerIcon = document.getElementById("providerIcon") as HTMLSpanElement | null;
  const targetLangSelect = document.getElementById("targetLangSelect") as HTMLSelectElement;
  const ocrLangSelect = document.getElementById("ocrLangSelect") as HTMLSelectElement;
  const translateBtn = document.getElementById("translateBtn") as HTMLButtonElement;
  const captureBtn = document.getElementById("captureBtn") as HTMLButtonElement;
  const sourceSpeechBtn = document.getElementById("sourceSpeechBtn") as HTMLButtonElement | null;
  const copyBtn = document.getElementById("copyBtn") as HTMLButtonElement;
  const speechBtn = document.getElementById("speechBtn") as HTMLButtonElement;
  const latencyDisplay = document.getElementById("latencyDisplay") as HTMLSpanElement;
  const clearSourceBtn = document.getElementById("clearSourceBtn") as HTMLButtonElement | null;

  // Settings UI
  const apiKeyInput = document.getElementById("apiKeyInput") as HTMLInputElement;
  const modelSelect = document.getElementById("modelSelect") as HTMLSelectElement;
  const fetchModelsBtn = document.getElementById("fetchModelsBtn") as HTMLButtonElement | null;
  const fetchModelsBtnText = document.getElementById("fetchModelsBtnText") as HTMLElement | null;
  const fetchModelsHint = document.getElementById("fetchModelsHint") as HTMLElement | null;
  const GROQ_CACHED_MODELS_KEY = "capture2text_groq_cached_models";

  function populateModelDropdown(models: string[], selectedModel?: string) {
    const currentVal = selectedModel ?? modelSelect.value;
    modelSelect.innerHTML = "";

    const uniqueModels = Array.from(new Set(models));
    if (currentVal && !uniqueModels.includes(currentVal)) {
      uniqueModels.unshift(currentVal);
    }

    for (const m of uniqueModels) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      modelSelect.appendChild(opt);
    }

    if (currentVal) {
      modelSelect.value = currentVal;
    }
  }

  function loadCachedModels() {
    try {
      const raw = localStorage.getItem(GROQ_CACHED_MODELS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          populateModelDropdown(parsed, configStore.get("model"));
          return;
        }
      }
    } catch {
      // ignore
    }
    const defaults = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "llama-3.1-70b-versatile"];
    populateModelDropdown(defaults, configStore.get("model"));
  }

  const saveSettingsBtn = document.getElementById("saveSettingsBtn") as HTMLButtonElement;
  const autoTranslateCheckbox = document.getElementById("autoTranslateCheckbox") as HTMLInputElement;
  const startHiddenCheckbox = document.getElementById("startHiddenCheckbox") as HTMLInputElement | null;
  const showPreviewCheckbox = document.getElementById("showPreviewCheckbox") as HTMLInputElement | null;
  const autostartCheckbox = document.getElementById("autostartCheckbox") as HTMLInputElement | null;
  const shortcutPresetSelect = document.getElementById("shortcutPresetSelect") as HTMLSelectElement;
  const customShortcutInput = document.getElementById("customShortcutInput") as HTMLInputElement;
  const recordShortcutBtn = document.getElementById("recordShortcutBtn") as HTMLButtonElement;
  const shortcutHint = document.getElementById("shortcutHint") as HTMLElement;
  const currentGlobalShortcutDisplay = document.getElementById("currentGlobalShortcutDisplay") as HTMLElement | null;
  const quickTranslateShortcutInput = document.getElementById("quickTranslateShortcutInput") as HTMLInputElement | null;
  const recordQuickTranslateShortcutBtn = document.getElementById("recordQuickTranslateShortcutBtn") as HTMLButtonElement | null;
  const currentQuickTranslateShortcutDisplay = document.getElementById("currentQuickTranslateShortcutDisplay") as HTMLElement | null;

  // Preview & Progress
  const imagePreviewContainer = document.getElementById("imagePreviewContainer") as HTMLDivElement;
  const previewCanvas = document.getElementById("previewCanvas") as HTMLCanvasElement;
  const clearImageBtn = document.getElementById("clearImageBtn") as HTMLButtonElement;
  const ocrProgressBar = document.getElementById("ocrProgressBar") as HTMLDivElement;
  const ocrProgressFill = document.getElementById("ocrProgressFill") as HTMLDivElement;
  const ocrProgressText = document.getElementById("ocrProgressText") as HTMLSpanElement;

  // Snipping Overlay
  const snippingOverlay = document.getElementById("snippingOverlay") as HTMLDivElement;
  const snippingCanvas = document.getElementById("snippingCanvas") as HTMLCanvasElement;

  // View state
  let currentView: ActiveView = "main";
  let isRecordingShortcut = false;
  let isRecordingQtShortcut = false;
  let isCapturing = false;
  let activeSpeechButton: HTMLButtonElement | null = null;
  let activeSpeechButtonHTML = "";

  function stopSpeech() {
    speechPlayer.stop();
    if (activeSpeechButton) {
      activeSpeechButton.innerHTML = activeSpeechButtonHTML;
      activeSpeechButton.classList.remove("btn-speaking");
      activeSpeechButton = null;
    }
  }

  function playButtonSpeech(text: string, langCode: string, button: HTMLButtonElement | null) {
    const clean = text.trim();
    if (!clean) return;

    if (speechPlayer.isPlaying() && activeSpeechButton === button && button !== null) {
      stopSpeech();
      return;
    }

    stopSpeech();

    if (button) {
      activeSpeechButton = button;
      activeSpeechButtonHTML = button.innerHTML;
      button.classList.add("btn-speaking");
      button.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
        <span>${i18n.t("status.reading")}</span>
      `;
    }

    speechPlayer.play(clean, langCode, {
      onEnd: () => {
        if (button && activeSpeechButton === button) {
          button.innerHTML = activeSpeechButtonHTML;
          button.classList.remove("btn-speaking");
          activeSpeechButton = null;
        }
      },
      onError: () => {
        if (button && activeSpeechButton === button) {
          button.innerHTML = activeSpeechButtonHTML;
          button.classList.remove("btn-speaking");
          activeSpeechButton = null;
        }
      },
    });
  }

  function switchView(view: ActiveView) {
    stopSpeech();
    currentView = view;
    mainView.classList.toggle("hidden", view !== "main");
    settingsView.classList.toggle("hidden", view !== "settings");
    shortcutsView.classList.toggle("hidden", view !== "shortcuts");

    toggleSettingsBtn.classList.toggle("btn-active", view === "settings");
    if (shortcutsBtn) {
      shortcutsBtn.classList.toggle("btn-active", view === "shortcuts");
    }
  }

  function updateProviderUI() {
    const provider = providerSelect.value;
    if (providerIcon) {
      providerIcon.innerHTML = provider === "google" ? GOOGLE_ICON_SVG : GROQ_ICON_SVG;
    }
  }

  function syncShortcutPicker(saved: string) {
    if (KNOWN_PRESETS.includes(saved)) {
      shortcutPresetSelect.value = saved;
      customShortcutInput.classList.add("hidden");
    } else {
      shortcutPresetSelect.value = "custom";
      customShortcutInput.value = saved;
      customShortcutInput.classList.remove("hidden");
    }
  }

  async function applyShortcut(shortcutStr: string): Promise<boolean> {
    try {
      const res = await invoke<string>("register_trigger_shortcut", { shortcut: shortcutStr });
      configStore.set("shortcut", res);
      if (currentGlobalShortcutDisplay) {
        currentGlobalShortcutDisplay.innerHTML = ShortcutManager.renderHtml(res);
      }
      if (shortcutHint) {
        shortcutHint.textContent = "";
        shortcutHint.classList.add("hidden");
      }
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (shortcutHint) {
        shortcutHint.textContent = `${i18n.t("error.shortcutError")}: ${msg}`;
        shortcutHint.style.color = "#E53E3E";
        shortcutHint.classList.remove("hidden");
      }
      return false;
    }
  }

  async function applyQuickTranslateShortcut(shortcutStr: string): Promise<boolean> {
    try {
      const res = await invoke<string>("register_quick_translate_shortcut", { shortcut: shortcutStr });
      configStore.set("quickTranslateShortcut", res);
      if (currentQuickTranslateShortcutDisplay) {
        currentQuickTranslateShortcutDisplay.innerHTML = ShortcutManager.renderHtml(res);
      }
      if (quickTranslateShortcutInput) {
        quickTranslateShortcutInput.value = res;
      }
      return true;
    } catch (err: unknown) {
      console.warn("Quick translate shortcut registration error:", err);
      return false;
    }
  }

  // Translation Service Coordinator
  const translationService = new TranslationService({
    getProvider: () => configStore.get("provider"),
    getGroqKey: () => configStore.get("apiKey"),
    getGroqModel: () => configStore.get("model"),
    setProvider: (provider) => {
      configStore.set("provider", provider);
      providerSelect.value = provider;
      updateProviderUI();
    },
    onMissingGroqKey: async () => {
      const fallback = confirm(
        i18n.t("confirm.fallbackToGoogle")
      );
      if (fallback) {
        return true;
      }
      targetDisplay.textContent = i18n.t("error.missingGroqKey");
      switchView("settings");
      return false;
    },
  });

  async function performTranslation() {
    const text = sourceInput.value.trim();
    if (!text) return;

    const targetLang = targetLangSelect.value;
    const originalBtnContent = translateBtn.innerHTML;
    translateBtn.disabled = true;
    translateBtn.innerHTML = `<span>${i18n.t("status.translating")}</span>`;
    targetDisplay.textContent = i18n.t("status.connecting");
    latencyDisplay.textContent = "...";

    try {
      const result = await translationService.translate({
        text,
        targetLang,
      });
      latencyDisplay.textContent = `${result.latencyMs}ms`;
      targetDisplay.textContent = result.translatedText;
    } catch (err: unknown) {
      const errorStr = err instanceof Error ? err.message : String(err);
      targetDisplay.textContent = `${i18n.t("error.errorPrefix")}: ${errorStr}`;
    } finally {
      translateBtn.disabled = false;
      translateBtn.innerHTML = originalBtnContent;
    }
  }

  async function runOcrOnCanvas(canvas: HTMLCanvasElement, showWindowWhenDone: boolean = false) {
    const lang = ocrLangSelect.value;

    const showPreview = configStore.get("showPreview");
    if (showPreview) {
      previewCanvas.width = canvas.width;
      previewCanvas.height = canvas.height;
      const pCtx = previewCanvas.getContext("2d");
      if (pCtx) {
        pCtx.drawImage(canvas, 0, 0);
      }
      imagePreviewContainer.classList.remove("hidden");
    } else {
      imagePreviewContainer.classList.add("hidden");
    }

    ocrProgressBar.classList.remove("hidden");
    ocrProgressFill.style.width = "0%";
    ocrProgressText.textContent = i18n.t("status.loadingOcr");

    try {
      const cleaned = await ocrPipeline.recognize(canvas, lang, (progress) => {
        ocrProgressFill.style.width = `${progress.percent}%`;
        ocrProgressText.textContent = progress.status;
      });

      ocrProgressBar.classList.add("hidden");

      if (!cleaned) {
        sourceInput.value = i18n.t("status.noTextFound");
        if (showWindowWhenDone) {
          switchView("main");
          await invoke("show_main_window");
        }
        return;
      }

      sourceInput.value = cleaned;

      if (autoTranslateCheckbox.checked) {
        await performTranslation();
      }

      if (showWindowWhenDone) {
        switchView("main");
        const translationText = targetDisplay.textContent?.trim() || "";
        if (translationText && !translationText.startsWith(i18n.t("error.errorPrefix"))) {
          try {
            await navigator.clipboard.writeText(translationText);
          } catch (e) {
            console.warn("Clipboard auto-write:", e);
          }
        }
        await invoke("show_main_window");
      }
    } catch (err: unknown) {
      ocrProgressBar.classList.add("hidden");
      const errStr = err instanceof Error ? err.message : String(err);
      targetDisplay.textContent = `${i18n.t("error.ocrErrorPrefix")}: ${errStr}`;
      if (showWindowWhenDone) {
        switchView("main");
        await invoke("show_main_window");
      }
    }
  }

  // Native Snipping & Screen Capture (Frozen Screen Instant Selection)
  async function triggerNativeCapture() {
    if (isCapturing) return;
    isCapturing = true;

    try {
      // 1. Capture clean desktop snapshot at t=0 BEFORE overlay
      // This caches 100% lossless RGBA in Rust backend and returns a lightweight fast JPEG (<20ms) for UI overlay
      const desktopDataUrl = await invoke<string>("capture_screen");

      const desktopImg = new Image();
      const loadPromise = new Promise<void>((resolve, reject) => {
        desktopImg.onload = () => resolve();
        desktopImg.onerror = () => reject(new Error(i18n.t("error.imageLoadFail")));
      });
      desktopImg.src = desktopDataUrl;

      // 2. Prepare fullscreen canvas overlay and enter snipping concurrently with image decoding
      document.documentElement.classList.add("snipping-active");
      document.body.classList.add("snipping-active");
      snippingOverlay.classList.remove("hidden");

      await Promise.all([loadPromise, invoke("enter_snipping")]);

      startSnippingSelection(desktopImg);
    } catch (err: unknown) {
      isCapturing = false;
      document.documentElement.classList.remove("snipping-active");
      document.body.classList.remove("snipping-active");
      snippingOverlay.classList.add("hidden");
      await invoke("exit_snipping", { showWindow: true });
      const errStr = err instanceof Error ? err.message : String(err);
      console.error("Snipping init error:", errStr);
      targetDisplay.textContent = `${i18n.t("error.snippingInit")}: ${errStr}`;
    }
  }

  function startSnippingSelection(desktopImg: HTMLImageElement) {
    snippingCanvas.width = desktopImg.naturalWidth;
    snippingCanvas.height = desktopImg.naturalHeight;

    const sCtx = snippingCanvas.getContext("2d");
    if (!sCtx) {
      isCapturing = false;
      return;
    }

    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    function draw() {
      if (!sCtx) return;

      const fullW = snippingCanvas.width;
      const fullH = snippingCanvas.height;

      // Draw frozen desktop
      sCtx.drawImage(desktopImg, 0, 0, fullW, fullH);

      // Darken entire screen with dim overlay
      sCtx.fillStyle = "rgba(0, 0, 0, 0.35)";
      sCtx.fillRect(0, 0, fullW, fullH);

      if (isDrawing) {
        const xCss = Math.min(startX, currentX);
        const yCss = Math.min(startY, currentY);
        const wCss = Math.abs(currentX - startX);
        const hCss = Math.abs(currentY - startY);

        if (wCss > 0 && hCss > 0) {
          const scaleX = fullW / window.innerWidth;
          const scaleY = fullH / window.innerHeight;

          const px = Math.round(xCss * scaleX);
          const py = Math.round(yCss * scaleY);
          const pw = Math.round(wCss * scaleX);
          const ph = Math.round(hCss * scaleY);

          // Restore bright original pixels for selected box
          sCtx.drawImage(desktopImg, px, py, pw, ph, px, py, pw, ph);

          // Outer shadow border for contrast on light backgrounds
          sCtx.strokeStyle = "rgba(0, 0, 0, 0.5)";
          sCtx.lineWidth = 3;
          sCtx.setLineDash([]);
          sCtx.strokeRect(px, py, pw, ph);

          // Bright cyan selection border
          sCtx.strokeStyle = "#38bdf8";
          sCtx.lineWidth = 2;
          sCtx.setLineDash([6, 4]);
          sCtx.strokeRect(px, py, pw, ph);

          // Dimension badge
          if (pw > 60 && ph > 25) {
            const badgeText = `${pw} × ${ph}`;
            sCtx.font = "bold 13px system-ui, sans-serif";
            const textMetrics = sCtx.measureText(badgeText);
            const badgeW = textMetrics.width + 16;
            const badgeH = 22;
            const badgeX = px + 6;
            const badgeY = py + ph - badgeH - 6;

            sCtx.fillStyle = "rgba(17, 17, 17, 0.9)";
            sCtx.setLineDash([]);
            sCtx.fillRect(badgeX, badgeY, badgeW, badgeH);

            sCtx.fillStyle = "#38bdf8";
            sCtx.textBaseline = "middle";
            sCtx.fillText(badgeText, badgeX + 8, badgeY + badgeH / 2);
          }
        }
      }
    }

    // Initial draw to freeze screen with tint
    draw();

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isDrawing = true;
      startX = e.clientX;
      startY = e.clientY;
      currentX = e.clientX;
      currentY = e.clientY;
      draw();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDrawing) return;
      currentX = e.clientX;
      currentY = e.clientY;
      draw();
    };

    const onMouseUp = async (e: MouseEvent) => {
      if (!isDrawing) return;
      isDrawing = false;

      currentX = e.clientX;
      currentY = e.clientY;

      const xCss = Math.min(startX, currentX);
      const yCss = Math.min(startY, currentY);
      const wCss = Math.abs(currentX - startX);
      const hCss = Math.abs(currentY - startY);

      const fullW = snippingCanvas.width;
      const fullH = snippingCanvas.height;
      const scaleX = fullW / window.innerWidth;
      const scaleY = fullH / window.innerHeight;

      const px = Math.round(xCss * scaleX);
      const py = Math.round(yCss * scaleY);
      const pw = Math.round(wCss * scaleX);
      const ph = Math.round(hCss * scaleY);

      // Clean up overlay immediately
      await cleanup(false);

      if (pw > 6 && ph > 6) {
        try {
          const cropCanvas = document.createElement("canvas");
          cropCanvas.width = pw;
          cropCanvas.height = ph;
          const ctx = cropCanvas.getContext("2d");

          let loadedLossless = false;
          try {
            // Retrieve pixel-perfect lossless PNG crop directly from Rust in-memory buffer (<0.5ms)
            const losslessDataUrl = await invoke<string>("crop_captured_screen", {
              x: px,
              y: py,
              width: pw,
              height: ph,
            });
            const cropImg = new Image();
            await new Promise<void>((resolve, reject) => {
              cropImg.onload = () => resolve();
              cropImg.onerror = () => reject(new Error(i18n.t("error.cropLoad")));
              cropImg.src = losslessDataUrl;
            });
            if (ctx) {
              cropCanvas.width = cropImg.naturalWidth || pw;
              cropCanvas.height = cropImg.naturalHeight || ph;
              ctx.drawImage(cropImg, 0, 0);
              loadedLossless = true;
            }
          } catch (backendErr) {
            console.warn("Backend crop fallback to canvas:", backendErr);
          }

          if (!loadedLossless && ctx) {
            ctx.drawImage(desktopImg, px, py, pw, ph, 0, 0, pw, ph);
          }

          await runOcrOnCanvas(cropCanvas, true);
        } catch (err: unknown) {
          const errStr = err instanceof Error ? err.message : String(err);
          console.error("Crop processing error:", errStr);
          targetDisplay.textContent = `${i18n.t("error.imageProcess")}: ${errStr}`;
          await invoke("show_main_window");
        }
      } else {
        await invoke("show_main_window");
      }

      isCapturing = false;
    };

    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        await cleanup(true);
        isCapturing = false;
      }
    };

    async function cleanup(showWindow: boolean) {
      snippingOverlay.classList.add("hidden");
      document.documentElement.classList.remove("snipping-active");
      document.body.classList.remove("snipping-active");
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);

      if (sCtx) {
        sCtx.clearRect(0, 0, snippingCanvas.width, snippingCanvas.height);
      }

      try {
        await invoke("exit_snipping", { showWindow });
      } catch (err) {
        console.warn("Exit snipping error:", err);
      }
    }

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
  }

  // Shortcut Recording Helpers
  function startRecordingShortcut() {
    isRecordingShortcut = true;
    recordShortcutBtn.classList.add("btn-recording");
    recordShortcutBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="6" width="12" height="12" rx="2"></rect>
      </svg>
      <span>${i18n.t("status.recording")}</span>
    `;
    customShortcutInput.classList.remove("hidden");
    customShortcutInput.value = i18n.t("status.waitingForKey");
    customShortcutInput.focus();
  }

  function stopRecordingShortcut() {
    isRecordingShortcut = false;
    recordShortcutBtn.classList.remove("btn-recording");
    recordShortcutBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
      <span>${i18n.t("settings.recordBtn")}</span>
    `;
  }

  // Load Initial Configurations into UI
  apiKeyInput.value = configStore.get("apiKey");
  loadCachedModels();
  modelSelect.value = configStore.get("model");
  providerSelect.value = configStore.get("provider");
  ocrLangSelect.value = configStore.get("ocrLang");
  if (startHiddenCheckbox) startHiddenCheckbox.checked = configStore.get("startHidden");
  if (showPreviewCheckbox) showPreviewCheckbox.checked = configStore.get("showPreview");
  autoTranslateCheckbox.checked = configStore.get("autoTranslate");

  // Initialize i18n from config
  const savedLang = configStore.get("language");
  i18n.setLang(savedLang);
  applyTranslations();
  invoke("set_language", { lang: savedLang }).catch(() => {});

  // Language selector wiring
  const languageSelect = document.getElementById("languageSelect") as HTMLSelectElement | null;
  if (languageSelect) {
    languageSelect.value = savedLang;
    languageSelect.addEventListener("change", () => {
      const lang = languageSelect.value as Lang;
      configStore.set("language", lang);
      i18n.setLang(lang);
      applyTranslations();
      invoke("set_language", { lang }).catch(() => {});
    });
  }

  updateProviderUI();

  const savedShortcut = configStore.get("shortcut");
  syncShortcutPicker(savedShortcut);
  if (currentGlobalShortcutDisplay) {
    currentGlobalShortcutDisplay.innerHTML = ShortcutManager.renderHtml(savedShortcut);
  }

  // Sync quick translate shortcut display
  const savedQtShortcut = configStore.get("quickTranslateShortcut");
  if (quickTranslateShortcutInput) quickTranslateShortcutInput.value = savedQtShortcut;
  if (currentQuickTranslateShortcutDisplay) {
    currentQuickTranslateShortcutDisplay.innerHTML = ShortcutManager.renderHtml(savedQtShortcut);
  }

  // Sync autostart checkbox from registry
  invoke<boolean>("is_autostart_enabled")
    .then((enabled) => {
      if (autostartCheckbox) autostartCheckbox.checked = enabled;
    })
    .catch(() => {/* ignore */});

  // Startup window display — respect --silent flag (auto startup)
  invoke<boolean>("is_silent_start")
    .then((silent) => {
      if (!silent && !configStore.get("startHidden")) {
        invoke("show_main_window").catch((err) => console.warn("Failed to show window on startup:", err));
      }
    })
    .catch(() => {
      if (!configStore.get("startHidden")) {
        invoke("show_main_window").catch((err) => console.warn("Failed to show window on startup:", err));
      }
    });

  // Register shortcuts on startup
  applyShortcut(savedShortcut);
  applyQuickTranslateShortcut(savedQtShortcut);

  // Event Listeners: Navigation
  toggleSettingsBtn.addEventListener("click", () => {
    switchView(currentView === "settings" ? "main" : "settings");
  });

  if (shortcutsBtn) {
    shortcutsBtn.addEventListener("click", () => {
      switchView(currentView === "shortcuts" ? "main" : "shortcuts");
    });
  }

  if (minimizeToTrayBtn) {
    minimizeToTrayBtn.addEventListener("click", async () => {
      try {
        await invoke("hide_main_window");
      } catch (err) {
        console.warn("Could not hide window to tray:", err);
      }
    });
  }

  if (backFromSettingsBtn) {
    backFromSettingsBtn.addEventListener("click", () => switchView("main"));
  }

  if (cancelSettingsBtn) {
    cancelSettingsBtn.addEventListener("click", () => {
      apiKeyInput.value = configStore.get("apiKey");
      loadCachedModels();
      modelSelect.value = configStore.get("model");
      if (fetchModelsHint) fetchModelsHint.classList.add("hidden");
      if (startHiddenCheckbox) startHiddenCheckbox.checked = configStore.get("startHidden");
      if (showPreviewCheckbox) showPreviewCheckbox.checked = configStore.get("showPreview");
      autoTranslateCheckbox.checked = configStore.get("autoTranslate");
      if (quickTranslateShortcutInput) quickTranslateShortcutInput.value = configStore.get("quickTranslateShortcut");
      const savedLang = configStore.get("language");
      if (languageSelect) languageSelect.value = savedLang;
      i18n.setLang(savedLang);
      applyTranslations();
      invoke("set_language", { lang: savedLang }).catch(() => {});
      invoke<boolean>("is_autostart_enabled")
        .then((enabled) => { if (autostartCheckbox) autostartCheckbox.checked = enabled; })
        .catch(() => {});
      syncShortcutPicker(configStore.get("shortcut"));
      stopRecordingShortcut();
      switchView("main");
    });
  }

  if (backFromShortcutsBtn) {
    backFromShortcutsBtn.addEventListener("click", () => switchView("main"));
  }

  // Event Listeners: Shortcuts & Keys
  recordShortcutBtn.addEventListener("click", () => {
    if (isRecordingShortcut) {
      stopRecordingShortcut();
      customShortcutInput.value = configStore.get("shortcut");
    } else {
      startRecordingShortcut();
    }
  });

  shortcutPresetSelect.addEventListener("change", () => {
    if (shortcutPresetSelect.value === "custom") {
      customShortcutInput.classList.remove("hidden");
      startRecordingShortcut();
    } else {
      customShortcutInput.classList.add("hidden");
      stopRecordingShortcut();
    }
  });

  if (recordQuickTranslateShortcutBtn && quickTranslateShortcutInput) {
    recordQuickTranslateShortcutBtn.addEventListener("click", () => {
      if (isRecordingQtShortcut) {
        isRecordingQtShortcut = false;
        recordQuickTranslateShortcutBtn.querySelector("span")!.textContent = i18n.t("settings.recordBtn");
        quickTranslateShortcutInput.value = configStore.get("quickTranslateShortcut");
      } else {
        isRecordingQtShortcut = true;
        recordQuickTranslateShortcutBtn.querySelector("span")!.textContent = i18n.t("status.recording");
        quickTranslateShortcutInput.value = i18n.t("status.waitingForKey");
        quickTranslateShortcutInput.focus();
      }
    });
  }

  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (isRecordingShortcut) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        stopRecordingShortcut();
        customShortcutInput.value = configStore.get("shortcut");
        return;
      }

      const parsed = ShortcutManager.parseFromEvent(e);
      if (parsed) {
        customShortcutInput.value = parsed;
        shortcutPresetSelect.value = "custom";
        stopRecordingShortcut();
      }
      return;
    }

    if (isRecordingQtShortcut && quickTranslateShortcutInput && recordQuickTranslateShortcutBtn) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        isRecordingQtShortcut = false;
        recordQuickTranslateShortcutBtn.querySelector("span")!.textContent = i18n.t("settings.recordBtn");
        quickTranslateShortcutInput.value = configStore.get("quickTranslateShortcut");
        return;
      }

      const parsed = ShortcutManager.parseFromEvent(e);
      if (parsed) {
        quickTranslateShortcutInput.value = parsed;
        isRecordingQtShortcut = false;
        recordQuickTranslateShortcutBtn.querySelector("span")!.textContent = i18n.t("settings.recordBtn");
      }
      return;
    }

    if (e.key === "Escape") {
      if (!snippingOverlay.classList.contains("hidden")) return;
      if (currentView !== "main") {
        switchView("main");
      }
    }
  });

  if (fetchModelsBtn) {
    fetchModelsBtn.addEventListener("click", async () => {
      const apiKey = apiKeyInput.value.trim() || configStore.get("apiKey").trim();
      if (!apiKey) {
        if (fetchModelsHint) {
          fetchModelsHint.className = "setting-hint error";
          fetchModelsHint.textContent = i18n.t("settings.enterApiKeyFirst");
          fetchModelsHint.classList.remove("hidden");
        }
        apiKeyInput.focus();
        return;
      }

      fetchModelsBtn.disabled = true;
      if (fetchModelsBtnText) fetchModelsBtnText.textContent = i18n.t("settings.fetchingModels");
      if (fetchModelsHint) {
        fetchModelsHint.className = "setting-hint";
        fetchModelsHint.textContent = i18n.t("settings.fetchingModelsStatus");
        fetchModelsHint.classList.remove("hidden");
      }

      try {
        const models = await translationService.fetchGroqModels(apiKey);
        if (models.length === 0) {
          if (fetchModelsHint) {
            fetchModelsHint.className = "setting-hint error";
            fetchModelsHint.textContent = i18n.t("settings.noModelsFound");
          }
        } else {
          const ids = models.map((m) => m.id);
          try {
            localStorage.setItem(GROQ_CACHED_MODELS_KEY, JSON.stringify(ids));
          } catch {
            // ignore
          }
          const prev = modelSelect.value;
          populateModelDropdown(ids, ids.includes(prev) ? prev : ids[0]);
          if (fetchModelsHint) {
            fetchModelsHint.className = "setting-hint success";
            fetchModelsHint.textContent = i18n.t("settings.modelsFound", { count: String(models.length) });
          }
        }
      } catch (err: unknown) {
        if (fetchModelsHint) {
          fetchModelsHint.className = "setting-hint error";
          const msg = err instanceof Error ? err.message : String(err);
          fetchModelsHint.textContent = `Error: ${msg}`;
        }
      } finally {
        fetchModelsBtn.disabled = false;
        if (fetchModelsBtnText) fetchModelsBtnText.textContent = i18n.t("settings.fetchModelsBtn");
      }
    });
  }

  providerSelect.addEventListener("change", () => {
    const val = providerSelect.value as "google" | "groq";
    configStore.set("provider", val);
    updateProviderUI();
  });

  ocrLangSelect.addEventListener("change", () => {
    configStore.set("ocrLang", ocrLangSelect.value);
  });

  saveSettingsBtn.addEventListener("click", async () => {
    const desiredShortcut =
      shortcutPresetSelect.value === "custom"
        ? customShortcutInput.value.trim()
        : shortcutPresetSelect.value;

    if (desiredShortcut) {
      const ok = await applyShortcut(desiredShortcut);
      if (!ok) return;
    }

    // Apply quick translate shortcut
    if (quickTranslateShortcutInput && quickTranslateShortcutInput.value.trim()) {
      await applyQuickTranslateShortcut(quickTranslateShortcutInput.value.trim());
    }

    // Apply autostart registry setting
    if (autostartCheckbox) {
      invoke("set_autostart", { enabled: autostartCheckbox.checked }).catch((err) =>
        console.warn("Autostart set error:", err)
      );
    }

    configStore.setMany({
      apiKey: apiKeyInput.value.trim(),
      model: modelSelect.value,
      startHidden: startHiddenCheckbox ? startHiddenCheckbox.checked : false,
      showPreview: showPreviewCheckbox ? showPreviewCheckbox.checked : false,
      autoTranslate: autoTranslateCheckbox.checked,
      quickTranslateShortcut: quickTranslateShortcutInput ? quickTranslateShortcutInput.value.trim() : configStore.get("quickTranslateShortcut"),
    });

    if (fetchModelsHint) fetchModelsHint.classList.add("hidden");
    updateProviderUI();
    switchView("main");
  });

  clearImageBtn.addEventListener("click", () => {
    imagePreviewContainer.classList.add("hidden");
  });

  if (clearSourceBtn) {
    clearSourceBtn.addEventListener("click", () => {
      stopSpeech();
      sourceInput.value = "";
      sourceInput.focus();
    });
  }

  // Ctrl+Enter or Cmd+Enter to trigger translation
  sourceInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      performTranslation();
    }
  });

  // Clipboard Paste (Ctrl+V) handler for images
  window.addEventListener("paste", async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const img = new Image();
          img.onload = () => {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const ctx = tempCanvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              runOcrOnCanvas(tempCanvas, false);
            }
          };
          img.src = URL.createObjectURL(file);
          break;
        }
      }
    }
  });

  // Actions
  captureBtn.addEventListener("click", () => {
    triggerNativeCapture();
  });

  try {
    listen("trigger-capture", () => {
      triggerNativeCapture();
    });
  } catch (err) {
    console.warn("Could not register trigger-capture listener:", err);
  }

  try {
    listen<string>("trigger-quick-translate", async (event) => {
      const text = event.payload?.trim() ?? "";
      if (text) {
        sourceInput.value = text;
        await performTranslation();
      }
    });
  } catch (err) {
    console.warn("Could not register trigger-quick-translate listener:", err);
  }

  translateBtn.addEventListener("click", performTranslation);

  copyBtn.addEventListener("click", async () => {
    const text = targetDisplay.textContent?.trim() || "";
    if (text) {
      await navigator.clipboard.writeText(text);
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>${i18n.t("status.copied")}</span>
      `;
      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
      }, 1500);
    }
  });

  if (sourceSpeechBtn) {
    sourceSpeechBtn.addEventListener("click", () => {
      const text = sourceInput.value.trim();
      const ocrLang = ocrLangSelect.value;
      const langCode = OCR_TO_TTS_LANG[ocrLang] || "ja";
      playButtonSpeech(text, langCode, sourceSpeechBtn);
    });
  }

  speechBtn.addEventListener("click", () => {
    const text = targetDisplay.textContent?.trim() || "";
    const targetLang = targetLangSelect.value;
    playButtonSpeech(text, targetLang, speechBtn);
  });
});
