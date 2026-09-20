// Capture2Text NextGen - Full OCR & Dual Translation Engine

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

document.addEventListener("DOMContentLoaded", () => {
  const sourceInput = document.getElementById("sourceInput") as HTMLTextAreaElement;
  const targetDisplay = document.getElementById("targetDisplay") as HTMLDivElement;
  const providerSelect = document.getElementById("providerSelect") as HTMLSelectElement;
  const targetLangSelect = document.getElementById("targetLangSelect") as HTMLSelectElement;
  const ocrLangSelect = document.getElementById("ocrLangSelect") as HTMLSelectElement;
  const translateBtn = document.getElementById("translateBtn") as HTMLButtonElement;
  const captureBtn = document.getElementById("captureBtn") as HTMLButtonElement;
  const copyBtn = document.getElementById("copyBtn") as HTMLButtonElement;
  const speechBtn = document.getElementById("speechBtn") as HTMLButtonElement;
  const toggleSettingsBtn = document.getElementById("toggleSettingsBtn") as HTMLButtonElement;
  const settingsPanel = document.getElementById("settingsPanel") as HTMLDivElement;
  const apiKeyInput = document.getElementById("apiKeyInput") as HTMLInputElement;
  const modelSelect = document.getElementById("modelSelect") as HTMLSelectElement;
  const saveSettingsBtn = document.getElementById("saveSettingsBtn") as HTMLButtonElement;
  const autoTranslateCheckbox = document.getElementById("autoTranslateCheckbox") as HTMLInputElement;
  const latencyDisplay = document.getElementById("latencyDisplay") as HTMLSpanElement;
  const statusBadge = document.getElementById("statusBadge") as HTMLDivElement;

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

  // Load saved settings
  apiKeyInput.value = localStorage.getItem(STORAGE_KEY_API_KEY) || "";
  modelSelect.value = localStorage.getItem(STORAGE_KEY_MODEL) || "llama-3.3-70b-versatile";
  providerSelect.value = localStorage.getItem(STORAGE_KEY_PROVIDER) || "google";
  ocrLangSelect.value = localStorage.getItem(STORAGE_KEY_OCR_LANG) || "jpn";

  function updateStatusBadge() {
    const provider = providerSelect.value;
    if (provider === "google") {
      statusBadge.textContent = "🌐 Google Translate";
      statusBadge.style.color = "#38bdf8";
      statusBadge.style.borderColor = "#38bdf8";
    } else {
      const key = localStorage.getItem(STORAGE_KEY_API_KEY) || "";
      if (key) {
        statusBadge.textContent = "⚡ Groq (Llama 3.3)";
        statusBadge.style.color = "#10b981";
        statusBadge.style.borderColor = "#10b981";
      } else {
        statusBadge.textContent = "⚡ Groq (Cần Key)";
        statusBadge.style.color = "#f59e0b";
        statusBadge.style.borderColor = "#f59e0b";
      }
    }
  }

  updateStatusBadge();

  providerSelect.addEventListener("change", () => {
    localStorage.setItem(STORAGE_KEY_PROVIDER, providerSelect.value);
    updateStatusBadge();
  });

  ocrLangSelect.addEventListener("change", () => {
    localStorage.setItem(STORAGE_KEY_OCR_LANG, ocrLangSelect.value);
  });

  toggleSettingsBtn.addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
  });

  saveSettingsBtn.addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEY_API_KEY, apiKeyInput.value.trim());
    localStorage.setItem(STORAGE_KEY_MODEL, modelSelect.value);
    updateStatusBadge();
    settingsPanel.classList.add("hidden");
    alert("Đã lưu cài đặt!");
  });

  clearImageBtn.addEventListener("click", () => {
    imagePreviewContainer.classList.add("hidden");
  });

  // ==========================================
  // CAPTURE2TEXT IMAGE PREPROCESSING ALGORITHM
  // (Scale x3.5, 300 DPI, Grayscale, Contrast Boost)
  // ==========================================
  function preprocessImageForOcr(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
    const scaleFactor = 3.5;
    const targetCanvas = document.createElement("canvas");
    targetCanvas.width = Math.round(sourceCanvas.width * scaleFactor);
    targetCanvas.height = Math.round(sourceCanvas.height * scaleFactor);

    const ctx = targetCanvas.getContext("2d");
    if (!ctx) return sourceCanvas;

    // Bilinear / Bicubic interpolation
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);

    // Grayscale & Contrast Enhancement
    const imgData = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Luminance formula (ITU-R BT.601)
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      // Gentle contrast stretch
      const adjusted = gray > 180 ? 255 : (gray < 80 ? 0 : gray);
      data[i] = adjusted;     // R
      data[i + 1] = adjusted; // G
      data[i + 2] = adjusted; // B
    }

    ctx.putImageData(imgData, 0, 0);
    return targetCanvas;
  }

  // ==========================================
  // CAPTURE2TEXT POST-PROCESSING ALGORITHM
  // (CJK vs Latin newline joining, Ligature fix)
  // ==========================================
  function cleanRecognizedText(rawText: string, lang: string): string {
    let text = rawText.trim();
    if (lang === "jpn" || lang === "chi_sim") {
      // CJK: Join lines without spaces
      text = text.replace(/[\r\n]+/g, "").replace(/\s+/g, "");
    } else {
      // Latin / Vietnamese: Replace line breaks with single space
      text = text.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ");
    }
    // Standardize quotes and typography
    text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    return text;
  }

  // ==========================================
  // OCR EXECUTION PIPELINE (Tesseract.js WASM)
  // ==========================================
  async function runOcrOnCanvas(canvas: HTMLCanvasElement) {
    const lang = ocrLangSelect.value;
    const processedCanvas = preprocessImageForOcr(canvas);

    // Display in preview thumbnail
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
        throw new Error("Thư viện Tesseract.js chưa tải xong. Vui lòng thử lại sau vài giây.");
      }

      const result = await Tesseract.recognize(processedCanvas, lang, {
        logger: (m: any) => {
          if (m.status === "recognizing text") {
            const progress = Math.round(m.progress * 100);
            ocrProgressFill.style.width = `${progress}%`;
            ocrProgressText.textContent = `Đang nhận diện chữ... ${progress}%`;
          } else if (m.status) {
            ocrProgressText.textContent = `Đang tải: ${m.status}`;
          }
        }
      });

      ocrProgressBar.classList.add("hidden");
      const cleaned = cleanRecognizedText(result.data.text, lang);

      if (!cleaned) {
        sourceInput.value = "(Không tìm thấy chữ trong vùng chọn)";
        return;
      }

      sourceInput.value = cleaned;

      if (autoTranslateCheckbox.checked) {
        performTranslation();
      }
    } catch (err: unknown) {
      ocrProgressBar.classList.add("hidden");
      const errStr = err instanceof Error ? err.message : String(err);
      alert(`Lỗi OCR: ${errStr}`);
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
              runOcrOnCanvas(tempCanvas);
            }
          };
          img.src = URL.createObjectURL(file);
          break;
        }
      }
    }
  });

  // ==========================================
  // SCREEN CAPTURE & SNIPPING OVERLAY
  // ==========================================
  captureBtn.addEventListener("click", async () => {
    try {
      // Prompt user to pick screen/window
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" }
      });

      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();

      // Wait a moment for frame to stabilize
      setTimeout(() => {
        const fullCanvas = document.createElement("canvas");
        fullCanvas.width = video.videoWidth;
        fullCanvas.height = video.videoHeight;
        const ctx = fullCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);
        }

        // Stop stream
        stream.getTracks().forEach(track => track.stop());

        // Open Snipping Overlay
        startSnippingSelection(fullCanvas);
      }, 300);
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      console.warn("Capture canceled or error:", errStr);
    }
  });

  function startSnippingSelection(fullScreenshotCanvas: HTMLCanvasElement) {
    snippingOverlay.classList.remove("hidden");
    snippingCanvas.width = window.innerWidth;
    snippingCanvas.height = window.innerHeight;

    const sCtx = snippingCanvas.getContext("2d");
    if (!sCtx) return;

    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    function draw() {
      if (!sCtx) return;
      sCtx.clearRect(0, 0, snippingCanvas.width, snippingCanvas.height);

      // Draw dimmed screenshot
      sCtx.drawImage(fullScreenshotCanvas, 0, 0, snippingCanvas.width, snippingCanvas.height);
      sCtx.fillStyle = "rgba(0, 0, 0, 0.45)";
      sCtx.fillRect(0, 0, snippingCanvas.width, snippingCanvas.height);

      if (isDrawing) {
        const x = Math.min(startX, currentX);
        const y = Math.min(startY, currentY);
        const w = Math.abs(currentX - startX);
        const h = Math.abs(currentY - startY);

        // Highlight selected rectangle
        sCtx.drawImage(
          fullScreenshotCanvas,
          (x / snippingCanvas.width) * fullScreenshotCanvas.width,
          (y / snippingCanvas.height) * fullScreenshotCanvas.height,
          (w / snippingCanvas.width) * fullScreenshotCanvas.width,
          (h / snippingCanvas.height) * fullScreenshotCanvas.height,
          x, y, w, h
        );

        sCtx.strokeStyle = "#38bdf8";
        sCtx.lineWidth = 2;
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

    const onMouseUp = () => {
      if (!isDrawing) return;
      isDrawing = false;
      cleanup();

      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      if (w > 10 && h > 10) {
        // Crop the rectangle
        const cropCanvas = document.createElement("canvas");
        const scaleX = fullScreenshotCanvas.width / snippingCanvas.width;
        const scaleY = fullScreenshotCanvas.height / snippingCanvas.height;

        cropCanvas.width = Math.round(w * scaleX);
        cropCanvas.height = Math.round(h * scaleY);
        const cropCtx = cropCanvas.getContext("2d");
        if (cropCtx) {
          cropCtx.drawImage(
            fullScreenshotCanvas,
            Math.round(x * scaleX),
            Math.round(y * scaleY),
            cropCanvas.width,
            cropCanvas.height,
            0,
            0,
            cropCanvas.width,
            cropCanvas.height
          );
          runOcrOnCanvas(cropCanvas);
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cleanup();
      }
    };

    function cleanup() {
      snippingOverlay.classList.add("hidden");
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
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
      throw new Error(`Google Translate error (HTTP ${res.status})`);
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

    translateBtn.disabled = true;
    translateBtn.innerHTML = "<span>⏳ Đang dịch...</span>";
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
          const fallback = confirm("Bạn chưa nhập Groq API Key trong nút Cấu hình. Bạn có muốn dùng Google Translate (miễn phí) để dịch ngay không?");
          if (fallback) {
            providerSelect.value = "google";
            updateStatusBadge();
            translationResult = await translateWithGoogle(text, targetLang);
          } else {
            targetDisplay.textContent = "Vui lòng bấm nút ⚙️ Cấu hình để nhập Groq API Key.";
            return;
          }
        } else {
          translationResult = await translateWithGroq(text, targetLang, apiKey, model);
        }
      }

      const elapsed = Math.round(performance.now() - startTime);
      latencyDisplay.textContent = `${elapsed}ms`;
      targetDisplay.textContent = translationResult;
    } catch (err: unknown) {
      const errorStr = err instanceof Error ? err.message : String(err);
      targetDisplay.textContent = `Lỗi: ${errorStr}`;
    } finally {
      translateBtn.disabled = false;
      translateBtn.innerHTML = "<span>Dịch Ngay</span>";
    }
  }

  translateBtn.addEventListener("click", performTranslation);

  // Copy Result
  copyBtn.addEventListener("click", async () => {
    const text = targetDisplay.textContent || "";
    if (text) {
      await navigator.clipboard.writeText(text);
      const origText = copyBtn.innerHTML;
      copyBtn.innerHTML = "✅ Đã sao chép!";
      setTimeout(() => {
        copyBtn.innerHTML = origText;
      }, 1500);
    }
  });

  // Speech / TTS
  speechBtn.addEventListener("click", () => {
    const text = targetDisplay.textContent || "";
    if (text && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      const targetLang = targetLangSelect.value;
      if (targetLang === "vi") utterance.lang = "vi-VN";
      else if (targetLang === "ja") utterance.lang = "ja-JP";
      else utterance.lang = "en-US";
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Trình duyệt không hỗ trợ Web Speech API.");
    }
  });
});
