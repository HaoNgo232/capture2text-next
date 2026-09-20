import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

declare const Tesseract: any;

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

const STORAGE_KEY_API_KEY = "capture2text_groq_api_key";
const STORAGE_KEY_MODEL = "capture2text_groq_model";
const STORAGE_KEY_PROVIDER = "capture2text_provider";
const STORAGE_KEY_OCR_LANG = "capture2text_ocr_lang";
const STORAGE_KEY_START_HIDDEN = "capture2text_start_hidden";

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

type ActiveView = "main" | "settings" | "shortcuts";

// Speech playback controller
let currentSpeechAudio: HTMLAudioElement | null = null;
let currentSpeechButton: HTMLButtonElement | null = null;
let currentSpeechOriginalHTML = "";

function stopCurrentSpeech() {
  if (currentSpeechAudio) {
    currentSpeechAudio.pause();
    currentSpeechAudio = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (currentSpeechButton) {
    currentSpeechButton.innerHTML = currentSpeechOriginalHTML;
    currentSpeechButton.classList.remove("btn-speaking");
    currentSpeechButton = null;
  }
}

function playNaturalSpeech(text: string, langCode: string, button?: HTMLButtonElement) {
  const clean = text.trim();
  if (!clean) return;

  // Toggle off if currently playing on this button
  if (currentSpeechButton === button && button !== undefined) {
    stopCurrentSpeech();
    return;
  }

  stopCurrentSpeech();

  if (button) {
    currentSpeechButton = button;
    currentSpeechOriginalHTML = button.innerHTML;
    button.classList.add("btn-speaking");
    button.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="4" width="4" height="16"></rect>
        <rect x="14" y="4" width="4" height="16"></rect>
      </svg>
      <span>Đang đọc...</span>
    `;
  }

  // Chunk text into sentences (Google TTS URL limit ~180 chars)
  const segments = clean.match(/[^.!?\n,]+[.!?\n,]?|\S+/g) || [clean];
  const chunks: string[] = [];
  let buffer = "";

  for (const seg of segments) {
    if ((buffer + seg).length > 150) {
      if (buffer.trim()) chunks.push(buffer.trim());
      buffer = seg;
    } else {
      buffer += (buffer ? " " : "") + seg;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());

  let chunkIdx = 0;

  function playNextChunk() {
    if (chunkIdx >= chunks.length) {
      stopCurrentSpeech();
      return;
    }

    const currentText = chunks[chunkIdx++];
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(langCode)}&client=tw-ob&q=${encodeURIComponent(currentText)}`;

    const audio = new Audio(ttsUrl);
    currentSpeechAudio = audio;

    audio.onended = () => {
      playNextChunk();
    };

    audio.onerror = () => {
      // Offline fallback: Use Web Speech API with native voice selection
      playFallbackWebSpeech(currentText, langCode, () => playNextChunk());
    };

    audio.play().catch(() => {
      playFallbackWebSpeech(currentText, langCode, () => playNextChunk());
    });
  }

  playNextChunk();
}

function playFallbackWebSpeech(text: string, langCode: string, onDone: () => void) {
  if (!("speechSynthesis" in window)) {
    onDone();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const targetPrefix = langCode.toLowerCase().split("-")[0];
  const matchedVoice = voices.find(v => v.lang.toLowerCase().replace("_", "-").startsWith(targetPrefix));
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }
  utterance.lang = langCode;
  utterance.onend = () => onDone();
  utterance.onerror = () => onDone();
  window.speechSynthesis.speak(utterance);
}

document.addEventListener("DOMContentLoaded", () => {
  // Views
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

  // Settings elements
  const apiKeyInput = document.getElementById("apiKeyInput") as HTMLInputElement;
  const modelSelect = document.getElementById("modelSelect") as HTMLSelectElement;
  const saveSettingsBtn = document.getElementById("saveSettingsBtn") as HTMLButtonElement;
  const autoTranslateCheckbox = document.getElementById("autoTranslateCheckbox") as HTMLInputElement;
  const startHiddenCheckbox = document.getElementById("startHiddenCheckbox") as HTMLInputElement | null;
  const shortcutPresetSelect = document.getElementById("shortcutPresetSelect") as HTMLSelectElement;
  const customShortcutInput = document.getElementById("customShortcutInput") as HTMLInputElement;
  const recordShortcutBtn = document.getElementById("recordShortcutBtn") as HTMLButtonElement;
  const shortcutHint = document.getElementById("shortcutHint") as HTMLElement;
  const currentGlobalShortcutDisplay = document.getElementById("currentGlobalShortcutDisplay") as HTMLElement | null;

  // Preview & Progress elements
  const imagePreviewContainer = document.getElementById("imagePreviewContainer") as HTMLDivElement;
  const previewCanvas = document.getElementById("previewCanvas") as HTMLCanvasElement;
  const clearImageBtn = document.getElementById("clearImageBtn") as HTMLButtonElement;
  const ocrProgressBar = document.getElementById("ocrProgressBar") as HTMLDivElement;
  const ocrProgressFill = document.getElementById("ocrProgressFill") as HTMLDivElement;
  const ocrProgressText = document.getElementById("ocrProgressText") as HTMLSpanElement;

  // Snipping Overlay elements
  const snippingOverlay = document.getElementById("snippingOverlay") as HTMLDivElement;
  const snippingCanvas = document.getElementById("snippingCanvas") as HTMLCanvasElement;

  // View state management
  let currentView: ActiveView = "main";

  function switchView(view: ActiveView) {
    stopCurrentSpeech();
    currentView = view;
    mainView.classList.toggle("hidden", view !== "main");
    settingsView.classList.toggle("hidden", view !== "settings");
    shortcutsView.classList.toggle("hidden", view !== "shortcuts");

    toggleSettingsBtn.classList.toggle("btn-active", view === "settings");
    if (shortcutsBtn) {
      shortcutsBtn.classList.toggle("btn-active", view === "shortcuts");
    }
  }

  const STORAGE_KEY_SHORTCUT = "capture2text_trigger_shortcut";

  function renderKbdShortcut(shortcut: string): string {
    const parts = shortcut.split("+").map(p => p.trim());
    return parts.map(p => `<kbd>${p}</kbd>`).join(" + ");
  }

  async function applyShortcut(shortcutStr: string): Promise<boolean> {
    try {
      const res = await invoke<string>("register_trigger_shortcut", { shortcut: shortcutStr });
      localStorage.setItem(STORAGE_KEY_SHORTCUT, res);
      if (currentGlobalShortcutDisplay) {
        currentGlobalShortcutDisplay.innerHTML = renderKbdShortcut(res);
      }
      if (shortcutHint) {
        shortcutHint.textContent = `Phím tắt hiện tại: ${res}. Nhấn tổ hợp phím này từ bất kỳ đâu để chụp màn hình và dịch.`;
        shortcutHint.style.color = "var(--text-secondary)";
      }
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (shortcutHint) {
        shortcutHint.textContent = `Lỗi phím tắt: ${msg}`;
        shortcutHint.style.color = "#E53E3E";
      }
      return false;
    }
  }

  // Load saved settings
  apiKeyInput.value = localStorage.getItem(STORAGE_KEY_API_KEY) || "";
  modelSelect.value = localStorage.getItem(STORAGE_KEY_MODEL) || "llama-3.3-70b-versatile";
  providerSelect.value = localStorage.getItem(STORAGE_KEY_PROVIDER) || "google";
  ocrLangSelect.value = localStorage.getItem(STORAGE_KEY_OCR_LANG) || "jpn";

  const savedStartHidden = localStorage.getItem(STORAGE_KEY_START_HIDDEN) === "true";
  if (startHiddenCheckbox) {
    startHiddenCheckbox.checked = savedStartHidden;
  }

  // If not configured to start hidden, show and focus the main window on startup
  if (!savedStartHidden) {
    invoke("show_main_window").catch((err) => console.warn("Failed to show window on startup:", err));
  }

  const savedShortcut = localStorage.getItem(STORAGE_KEY_SHORTCUT) || "Alt+Q";
  const knownPresets = ["Alt+Q", "Ctrl+Shift+S", "Ctrl+Shift+Q", "Alt+D", "F4"];

  function syncShortcutPicker(saved: string) {
    if (knownPresets.includes(saved)) {
      shortcutPresetSelect.value = saved;
      customShortcutInput.classList.add("hidden");
    } else {
      shortcutPresetSelect.value = "custom";
      customShortcutInput.value = saved;
      customShortcutInput.classList.remove("hidden");
    }
  }

  syncShortcutPicker(savedShortcut);

  if (currentGlobalShortcutDisplay) {
    currentGlobalShortcutDisplay.innerHTML = renderKbdShortcut(savedShortcut);
  }

  // Register hotkey with Rust backend on startup
  applyShortcut(savedShortcut);

  // Shortcut recorder state
  let isRecordingShortcut = false;

  function startRecordingShortcut() {
    isRecordingShortcut = true;
    recordShortcutBtn.classList.add("btn-recording");
    recordShortcutBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="6" width="12" height="12" rx="2"></rect>
      </svg>
      <span>Bấm phím... (Esc hủy)</span>
    `;
    customShortcutInput.classList.remove("hidden");
    customShortcutInput.value = "Đang chờ bấm tổ hợp phím...";
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
      <span>Ghi phím</span>
    `;
  }

  recordShortcutBtn.addEventListener("click", () => {
    if (isRecordingShortcut) {
      stopRecordingShortcut();
      const current = localStorage.getItem(STORAGE_KEY_SHORTCUT) || "Alt+Q";
      customShortcutInput.value = current;
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

  function updateProviderUI() {
    const provider = providerSelect.value;
    if (providerIcon) {
      providerIcon.innerHTML = provider === "google" ? GOOGLE_ICON_SVG : GROQ_ICON_SVG;
    }
  }

  updateProviderUI();

  // Navigation Event Listeners
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
      apiKeyInput.value = localStorage.getItem(STORAGE_KEY_API_KEY) || "";
      modelSelect.value = localStorage.getItem(STORAGE_KEY_MODEL) || "llama-3.3-70b-versatile";
      if (startHiddenCheckbox) {
        startHiddenCheckbox.checked = localStorage.getItem(STORAGE_KEY_START_HIDDEN) === "true";
      }
      const saved = localStorage.getItem(STORAGE_KEY_SHORTCUT) || "Alt+Q";
      syncShortcutPicker(saved);
      stopRecordingShortcut();
      switchView("main");
    });
  }
  if (backFromShortcutsBtn) {
    backFromShortcutsBtn.addEventListener("click", () => switchView("main"));
  }

  // Global Keydown Handler (for Recording and ESC navigation)
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (isRecordingShortcut) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        stopRecordingShortcut();
        const saved = localStorage.getItem(STORAGE_KEY_SHORTCUT) || "Alt+Q";
        customShortcutInput.value = saved;
        return;
      }

      // Ignore single modifier keydown
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
        return;
      }

      const mods: string[] = [];
      if (e.ctrlKey) mods.push("Ctrl");
      if (e.altKey) mods.push("Alt");
      if (e.shiftKey) mods.push("Shift");
      if (e.metaKey) mods.push("Super");

      let keyPart = e.key.toUpperCase();
      if (e.code && e.code.startsWith("Key")) {
        keyPart = e.code.replace("Key", "").toUpperCase();
      } else if (e.code && e.code.startsWith("Digit")) {
        keyPart = e.code.replace("Digit", "");
      } else if (e.key.startsWith("F") && !isNaN(Number(e.key.substring(1)))) {
        keyPart = e.key.toUpperCase();
      }

      // If no modifiers and not an F-key, default to Alt
      if (mods.length === 0 && !keyPart.startsWith("F")) {
        mods.push("Alt");
      }

      const combo = [...mods, keyPart].join("+");
      customShortcutInput.value = combo;
      shortcutPresetSelect.value = "custom";
      stopRecordingShortcut();
      return;
    }

    if (e.key === "Escape") {
      if (!snippingOverlay.classList.contains("hidden")) return;
      if (currentView !== "main") {
        switchView("main");
      }
    }
  });

  providerSelect.addEventListener("change", () => {
    localStorage.setItem(STORAGE_KEY_PROVIDER, providerSelect.value);
    updateProviderUI();
  });

  ocrLangSelect.addEventListener("change", () => {
    localStorage.setItem(STORAGE_KEY_OCR_LANG, ocrLangSelect.value);
  });

  saveSettingsBtn.addEventListener("click", async () => {
    const desiredShortcut = shortcutPresetSelect.value === "custom"
      ? customShortcutInput.value.trim()
      : shortcutPresetSelect.value;

    if (desiredShortcut) {
      const ok = await applyShortcut(desiredShortcut);
      if (!ok) {
        // Do not switch view if shortcut failed to register
        return;
      }
    }

    localStorage.setItem(STORAGE_KEY_API_KEY, apiKeyInput.value.trim());
    localStorage.setItem(STORAGE_KEY_MODEL, modelSelect.value);
    if (startHiddenCheckbox) {
      localStorage.setItem(STORAGE_KEY_START_HIDDEN, startHiddenCheckbox.checked ? "true" : "false");
    }

    updateProviderUI();
    switchView("main");
  });

  clearImageBtn.addEventListener("click", () => {
    imagePreviewContainer.classList.add("hidden");
  });

  if (clearSourceBtn) {
    clearSourceBtn.addEventListener("click", () => {
      stopCurrentSpeech();
      sourceInput.value = "";
      sourceInput.focus();
    });
  }

  // Keyboard shortcut: Ctrl+Enter / Cmd+Enter to translate
  sourceInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      performTranslation();
    }
  });

  // ==========================================
  // CAPTURE2TEXT IMAGE PREPROCESSING ALGORITHM
  // ==========================================
  function preprocessImageForOcr(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
    const scaleFactor = 3.5;
    const targetCanvas = document.createElement("canvas");
    targetCanvas.width = Math.round(sourceCanvas.width * scaleFactor);
    targetCanvas.height = Math.round(sourceCanvas.height * scaleFactor);

    const ctx = targetCanvas.getContext("2d");
    if (!ctx) return sourceCanvas;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);

    const imgData = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      const adjusted = gray > 180 ? 255 : (gray < 80 ? 0 : gray);
      data[i] = adjusted;
      data[i + 1] = adjusted;
      data[i + 2] = adjusted;
    }

    ctx.putImageData(imgData, 0, 0);
    return targetCanvas;
  }

  function cleanRecognizedText(rawText: string, lang: string): string {
    let text = rawText.trim();
    if (lang === "jpn" || lang === "chi_sim") {
      text = text.replace(/[\r\n]+/g, "").replace(/\s+/g, "");
    } else {
      text = text.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ");
    }
    text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    return text.trim();
  }

  // ==========================================
  // OCR EXECUTION PIPELINE (Tesseract.js WASM)
  // ==========================================
  async function runOcrOnCanvas(canvas: HTMLCanvasElement, showWindowWhenDone: boolean = false) {
    const lang = ocrLangSelect.value;
    const processedCanvas = preprocessImageForOcr(canvas);

    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;
    const pCtx = previewCanvas.getContext("2d");
    if (pCtx) {
      pCtx.drawImage(canvas, 0, 0);
    }
    imagePreviewContainer.classList.remove("hidden");
    ocrProgressBar.classList.remove("hidden");
    ocrProgressFill.style.width = "0%";
    ocrProgressText.textContent = "Đang nạp mô hình OCR...";

    try {
      if (typeof Tesseract === "undefined") {
        throw new Error("Thư viện OCR chưa sẵn sàng. Vui lòng thử lại sau vài giây.");
      }

      const result = await Tesseract.recognize(processedCanvas, lang, {
        logger: (m: any) => {
          if (m.status === "recognizing text") {
            const progress = Math.round(m.progress * 100);
            ocrProgressFill.style.width = `${progress}%`;
            ocrProgressText.textContent = `Nhận diện: ${progress}%`;
          } else if (m.status) {
            ocrProgressText.textContent = `${m.status}`;
          }
        }
      });

      ocrProgressBar.classList.add("hidden");
      const cleaned = cleanRecognizedText(result.data.text, lang);

      if (!cleaned) {
        sourceInput.value = "(Không tìm thấy ký tự trong vùng chọn)";
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
        if (translationText && !translationText.startsWith("Lỗi")) {
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
      targetDisplay.textContent = `Lỗi OCR: ${errStr}`;
      if (showWindowWhenDone) {
        switchView("main");
        await invoke("show_main_window");
      }
    }
  }

  // ==========================================
  // CLIPBOARD PASTE HANDLER (Ctrl + V)
  // ==========================================
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

  // ==========================================
  // NATIVE SCREEN CAPTURE & SNIPPING OVERLAY
  // ==========================================
  let isCapturing = false;

  async function triggerNativeCapture() {
    if (isCapturing) return;
    isCapturing = true;

    try {
      // 1. Invoke Rust backend to take screenshot of primary monitor
      const dataUrl = await invoke<string>("capture_screen");

      const img = new Image();
      img.onload = async () => {
        // 2. Hide card app and activate full screen snipping mode
        document.body.classList.add("snipping-active");
        try {
          await invoke("enter_snipping");
        } catch (err) {
          console.warn("Enter snipping error:", err);
        }

        startSnippingSelection(img);
      };
      img.onerror = () => {
        isCapturing = false;
        document.body.classList.remove("snipping-active");
      };
      img.src = dataUrl;
    } catch (err: unknown) {
      isCapturing = false;
      document.body.classList.remove("snipping-active");
      const errStr = err instanceof Error ? err.message : String(err);
      console.error("Lỗi chụp màn hình:", errStr);
      targetDisplay.textContent = `Lỗi chụp màn hình: ${errStr}`;
    }
  }

  captureBtn.addEventListener("click", () => {
    triggerNativeCapture();
  });

  // Listen for global shortcut triggered from Rust backend
  try {
    listen("trigger-capture", () => {
      triggerNativeCapture();
    });
  } catch (err) {
    console.warn("Could not register trigger-capture listener:", err);
  }

  function startSnippingSelection(fullScreenshot: HTMLImageElement | HTMLCanvasElement) {
    snippingOverlay.classList.remove("hidden");
    snippingCanvas.width = window.innerWidth;
    snippingCanvas.height = window.innerHeight;

    const sCtx = snippingCanvas.getContext("2d");
    if (!sCtx) {
      isCapturing = false;
      return;
    }

    const sourceWidth = "naturalWidth" in fullScreenshot ? fullScreenshot.naturalWidth : fullScreenshot.width;
    const sourceHeight = "naturalHeight" in fullScreenshot ? fullScreenshot.naturalHeight : fullScreenshot.height;

    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    function draw() {
      if (!sCtx) return;
      sCtx.clearRect(0, 0, snippingCanvas.width, snippingCanvas.height);

      sCtx.drawImage(fullScreenshot, 0, 0, snippingCanvas.width, snippingCanvas.height);
      sCtx.fillStyle = "rgba(0, 0, 0, 0.45)";
      sCtx.fillRect(0, 0, snippingCanvas.width, snippingCanvas.height);

      if (isDrawing) {
        const x = Math.min(startX, currentX);
        const y = Math.min(startY, currentY);
        const w = Math.abs(currentX - startX);
        const h = Math.abs(currentY - startY);

        sCtx.drawImage(
          fullScreenshot,
          (x / snippingCanvas.width) * sourceWidth,
          (y / snippingCanvas.height) * sourceHeight,
          (w / snippingCanvas.width) * sourceWidth,
          (h / snippingCanvas.height) * sourceHeight,
          x, y, w, h
        );

        sCtx.strokeStyle = "#FFFFFF";
        sCtx.lineWidth = 1.5;
        sCtx.setLineDash([4, 4]);
        sCtx.strokeRect(x, y, w, h);
      }
    }

    draw();

    const onMouseDown = (e: MouseEvent) => {
      isDrawing = true;
      startX = e.clientX;
      startY = e.clientY;
      currentX = e.clientX;
      currentY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDrawing) return;
      currentX = e.clientX;
      currentY = e.clientY;
      draw();
    };

    const onMouseUp = async () => {
      if (!isDrawing) return;
      isDrawing = false;

      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      // IMMEDIATELY hide window so user returns to desktop/Chrome
      await cleanup(false);

      if (w > 10 && h > 10) {
        const cropCanvas = document.createElement("canvas");
        const scaleX = sourceWidth / snippingCanvas.width;
        const scaleY = sourceHeight / snippingCanvas.height;

        cropCanvas.width = Math.round(w * scaleX);
        cropCanvas.height = Math.round(h * scaleY);
        const cropCtx = cropCanvas.getContext("2d");
        if (cropCtx) {
          cropCtx.drawImage(
            fullScreenshot,
            Math.round(x * scaleX),
            Math.round(y * scaleY),
            cropCanvas.width,
            cropCanvas.height,
            0,
            0,
            cropCanvas.width,
            cropCanvas.height
          );
          // Run OCR & translation in background, and ONLY show window when complete!
          await runOcrOnCanvas(cropCanvas, true);
        }
      }
      isCapturing = false;
    };

    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        await cleanup(false);
        isCapturing = false;
      }
    };

    async function cleanup(showWindow: boolean) {
      snippingOverlay.classList.add("hidden");
      document.body.classList.remove("snipping-active");
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);

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

  // ==========================================
  // TRANSLATION ENGINES
  // ==========================================
  async function translateWithGoogle(text: string, targetLang: string): Promise<string> {
    const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Lỗi kết nối Google Translate (HTTP ${res.status})`);
    }
    const data = await res.json();
    let result = "";
    if (Array.isArray(data) && Array.isArray(data[0])) {
      for (const segment of data[0]) {
        if (Array.isArray(segment) && segment[0]) {
          result += segment[0];
        }
      }
    }
    return result || text;
  }

  async function translateWithGroq(text: string, targetLang: string, apiKey: string, model: string): Promise<string> {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.1,
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `You are an expert translator. Translate faithfully into language code: ${targetLang}. Return ONLY the direct translation without quotes, markdown backticks, explanations, or notes.`
          },
          {
            role: "user",
            content: text
          }
        ]
      })
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

  async function performTranslation() {
    const text = sourceInput.value.trim();
    if (!text) return;

    const targetLang = targetLangSelect.value;
    const provider = providerSelect.value;

    const originalBtnContent = translateBtn.innerHTML;
    translateBtn.disabled = true;
    translateBtn.innerHTML = "<span>Đang dịch...</span>";
    targetDisplay.textContent = "Đang kết nối...";
    latencyDisplay.textContent = "...";

    const startTime = performance.now();

    try {
      let translationResult = "";

      if (provider === "google") {
        translationResult = await translateWithGoogle(text, targetLang);
      } else {
        const apiKey = localStorage.getItem(STORAGE_KEY_API_KEY) || "";
        const model = localStorage.getItem(STORAGE_KEY_MODEL) || "llama-3.3-70b-versatile";

        if (!apiKey) {
          const fallback = confirm("Chưa có Groq API Key trong Cấu hình. Bạn có muốn chuyển sang Google Translate miễn phí không?");
          if (fallback) {
            providerSelect.value = "google";
            updateProviderUI();
            translationResult = await translateWithGoogle(text, targetLang);
          } else {
            targetDisplay.textContent = "Vui lòng mở mục Cấu hình và nhập Groq API Key.";
            switchView("settings");
            return;
          }
        } else {
          translationResult = await translateWithGroq(text, targetLang, apiKey, model);
        }
      }

      const elapsed = Math.round(performance.now() - startTime);
      latencyDisplay.textContent = `${elapsed}ms`;
      targetDisplay.textContent = translationResult.trim();
    } catch (err: unknown) {
      const errorStr = err instanceof Error ? err.message : String(err);
      targetDisplay.textContent = `Lỗi: ${errorStr}`;
    } finally {
      translateBtn.disabled = false;
      translateBtn.innerHTML = originalBtnContent;
    }
  }

  translateBtn.addEventListener("click", performTranslation);

  // Copy Result
  copyBtn.addEventListener("click", async () => {
    const text = targetDisplay.textContent?.trim() || "";
    if (text) {
      await navigator.clipboard.writeText(text);
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Đã sao chép</span>
      `;
      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
      }, 1500);
    }
  });

  // Source Speech (TTS for original text)
  const OCR_TO_TTS_LANG: Record<string, string> = {
    vie: "vi",
    eng: "en",
    chi_sim: "zh-CN",
    jpn: "ja"
  };

  if (sourceSpeechBtn) {
    sourceSpeechBtn.addEventListener("click", () => {
      const text = sourceInput.value.trim();
      const ocrLang = ocrLangSelect.value;
      const langCode = OCR_TO_TTS_LANG[ocrLang] || "ja";
      playNaturalSpeech(text, langCode, sourceSpeechBtn);
    });
  }

  // Target Speech (TTS for translated text)
  speechBtn.addEventListener("click", () => {
    const text = targetDisplay.textContent?.trim() || "";
    const targetLang = targetLangSelect.value;
    playNaturalSpeech(text, targetLang, speechBtn);
  });
});
