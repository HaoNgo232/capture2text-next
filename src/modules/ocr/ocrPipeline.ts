import Tesseract from "tesseract.js";
import { preprocessImageForOcr } from "./imagePreprocessor";
import { cleanRecognizedText } from "./textCleaner";
import { i18n } from "../../i18n";

export interface OcrProgress {
  status: string;
  percent: number;
}

export interface OcrPipelineDependencies {
  getTesseract?: () => any;
  preprocess?: (canvas: HTMLCanvasElement) => HTMLCanvasElement;
  cleanText?: (rawText: string, lang: string) => string;
}

export class OcrPipeline {
  private getTesseract: () => any;
  private preprocess: (canvas: HTMLCanvasElement) => HTMLCanvasElement;
  private cleanText: (rawText: string, lang: string) => string;

  constructor(deps: OcrPipelineDependencies = {}) {
    this.getTesseract =
      deps.getTesseract ??
      (() => {
        if (typeof window !== "undefined" && (window as any).Tesseract) {
          return (window as any).Tesseract;
        }
        if (typeof (globalThis as any).Tesseract !== "undefined") {
          return (globalThis as any).Tesseract;
        }
        return Tesseract;
      });
    this.preprocess = deps.preprocess ?? preprocessImageForOcr;
    this.cleanText = deps.cleanText ?? cleanRecognizedText;
  }

  async recognize(
    canvas: HTMLCanvasElement,
    lang: string,
    onProgress?: (progress: OcrProgress) => void
  ): Promise<string> {
    const tesseract = this.getTesseract();
    if (!tesseract) {
      throw new Error(i18n.t("error.ocrNotReady"));
    }

    const processedCanvas = this.preprocess(canvas);

    const result = await tesseract.recognize(processedCanvas, lang, {
      logger: (m: any) => {
        if (!onProgress) return;
        if (m.status === "recognizing text") {
          const percent = Math.round((m.progress ?? 0) * 100);
          onProgress({ status: i18n.t("status.recognizing", { percent: String(percent) }), percent });
        } else if (m.status) {
          onProgress({ status: m.status, percent: 0 });
        }
      },
    });

    const rawText = result?.data?.text ?? "";
    return this.cleanText(rawText, lang);
  }
}
