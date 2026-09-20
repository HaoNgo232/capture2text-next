/**
 * Applies Rec. 601 grayscale luminance and dual-threshold binarization to raw RGBA pixel data in place.
 * Rec. 601 formula: luminance = 0.299*R + 0.587*G + 0.114*B
 * Dual-thresholding: > 180 => 255, < 80 => 0, otherwise remains grayscale.
 */
export function applyRec601Threshold(data: Uint8ClampedArray | number[]): void {
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    const adjusted = gray > 180 ? 255 : (gray < 80 ? 0 : gray);
    data[i] = adjusted;
    data[i + 1] = adjusted;
    data[i + 2] = adjusted;
  }
}

/**
 * Preprocesses a canvas snippet for optimal OCR accuracy:
 * - Upscales 3.5x with high-quality smoothing.
 * - Applies Rec. 601 grayscale luminance and contrast binarization.
 */
export function preprocessImageForOcr(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
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
  applyRec601Threshold(imgData.data);
  ctx.putImageData(imgData, 0, 0);

  return targetCanvas;
}
