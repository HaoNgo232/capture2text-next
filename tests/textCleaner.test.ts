import { describe, it, expect } from "bun:test";
import { cleanRecognizedText } from "../src/modules/ocr/textCleaner";
import { applyRec601Threshold } from "../src/modules/ocr/imagePreprocessor";

describe("cleanRecognizedText", () => {
  it("removes whitespace and line breaks for Japanese (jpn)", () => {
    const raw = "こ ん に\nち は 、\r\n世 界 ！";
    expect(cleanRecognizedText(raw, "jpn")).toBe("こんにちは、世界！");
  });

  it("removes whitespace and line breaks for Simplified Chinese (chi_sim)", () => {
    const raw = "你 好 \n， 世 \r\n界 ！";
    expect(cleanRecognizedText(raw, "chi_sim")).toBe("你好，世界！");
  });

  it("normalizes excessive spaces and collapses newlines into single spaces for Latin text", () => {
    const raw = "Hello    world,\nthis is   Capture2Text!";
    expect(cleanRecognizedText(raw, "eng")).toBe("Hello world, this is Capture2Text!");
  });

  it("normalizes typographic/curly quotes into standard ASCII quotes", () => {
    const raw = "“Capture2Text” is ‘awesome’";
    expect(cleanRecognizedText(raw, "eng")).toBe('"Capture2Text" is \'awesome\'');
  });

  it("handles empty or whitespace-only text gracefully", () => {
    expect(cleanRecognizedText("", "eng")).toBe("");
    expect(cleanRecognizedText("   \n\t  ", "jpn")).toBe("");
  });
});

describe("applyRec601Threshold", () => {
  it("converts pixels to Rec. 601 grayscale while preserving alpha", () => {
    // Pure white: R=255, G=255, B=255 => gray=255
    const pixels = new Uint8ClampedArray([255, 255, 255, 255]);
    applyRec601Threshold(pixels);
    expect(pixels[0]).toBe(255);
    expect(pixels[1]).toBe(255);
    expect(pixels[2]).toBe(255);
    expect(pixels[3]).toBe(255); // Alpha preserved

    // Pure black: R=0, G=0, B=0 => gray=0
    const black = new Uint8ClampedArray([0, 0, 0, 255]);
    applyRec601Threshold(black);
    expect(black[0]).toBe(0);
    expect(black[1]).toBe(0);
    expect(black[2]).toBe(0);
  });

  it("stretches contrast for low-contrast text regions (e.g. dark mode IDE)", () => {
    // Two pixels: dark background (lum=30) and dim text (lum=90), range = 60
    const lowContrast = new Uint8ClampedArray([
      30, 30, 30, 255,
      90, 90, 90, 255,
    ]);
    applyRec601Threshold(lowContrast);

    // After stretching: 30 maps to 0, 90 maps to 255
    expect(lowContrast[0]).toBe(0);
    expect(lowContrast[4]).toBe(255);
  });

  it("leaves standard wide-range grayscale intact without artificial clipping", () => {
    // Pixels already spanning wide dynamic range (0 to 255)
    const wide = new Uint8ClampedArray([
      0, 0, 0, 255,
      100, 100, 100, 255,
      255, 255, 255, 255,
    ]);
    applyRec601Threshold(wide);
    expect(wide[0]).toBe(0);
    expect(wide[4]).toBe(100);
    expect(wide[8]).toBe(255);
  });

  it("accurately computes Rec. 601 weighting (0.299*R + 0.587*G + 0.114*B)", () => {
    // Pure green: R=0, G=200, B=0 => gray = round(0.587 * 200) = 117 (mid-range, remains 117)
    const green = new Uint8ClampedArray([0, 200, 0, 255]);
    applyRec601Threshold(green);
    expect(green[0]).toBe(117);
    expect(green[1]).toBe(117);
    expect(green[2]).toBe(117);
  });
});
