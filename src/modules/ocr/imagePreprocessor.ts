/**
 * Applies Rec. 601 grayscale luminance and adaptive contrast stretching to raw RGBA pixel data in place.
 * Rec. 601 formula: luminance = 0.299*R + 0.587*G + 0.114*B
 */
export function applyRec601Threshold(data: Uint8ClampedArray | number[]): void {
  let minLum = 255;
  let maxLum = 0;

  // First pass: find luminance bounds
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const range = maxLum - minLum;
  // If contrast is narrow (e.g. dark mode gray text on dark background), stretch linearly to full dynamic range [0, 255]
  if (range > 20 && range < 230) {
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      const normalized = Math.round(((lum - minLum) / range) * 255);
      data[i] = normalized;
      data[i + 1] = normalized;
      data[i + 2] = normalized;
    }
  } else {
    // Standard grayscale conversion preserving dynamic range
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      data[i] = lum;
      data[i + 1] = lum;
      data[i + 2] = lum;
    }
  }
}

/**
 * Preprocesses a canvas snippet for optimal OCR accuracy:
 * - Upscales very small snippets (< 40px min dimension) so character strokes are clear.
 * - Applies adaptive luminance contrast stretching without destroying antialiased font edges.
 */
export function preprocessImageForOcr(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  if (sourceCanvas.width === 0 || sourceCanvas.height === 0) return sourceCanvas;

  const minDim = Math.min(sourceCanvas.width, sourceCanvas.height);
  const scale = minDim < 35 ? 2.0 : 1.0;

  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = Math.round(sourceCanvas.width * scale);
  targetCanvas.height = Math.round(sourceCanvas.height * scale);

  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return sourceCanvas;

  ctx.imageSmoothingEnabled = scale > 1.0;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);

  const imgData = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
  applyRec601Threshold(imgData.data);
  ctx.putImageData(imgData, 0, 0);

  return targetCanvas;
}
