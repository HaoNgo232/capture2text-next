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
  it("binarizes high luminance pixels (> 180) to 255", () => {
    // Pure white: R=255, G=255, B=255 => gray=255 (>180) => 255
    const pixels = new Uint8ClampedArray([255, 255, 255, 255]);
    applyRec601Threshold(pixels);
    expect(pixels[0]).toBe(255);
    expect(pixels[1]).toBe(255);
    expect(pixels[2]).toBe(255);
    expect(pixels[3]).toBe(255); // Alpha preserved

    // Light gray: R=200, G=200, B=200 => gray=200 (>180) => 255
    const light = new Uint8ClampedArray([200, 200, 200, 255]);
    applyRec601Threshold(light);
    expect(light[0]).toBe(255);
    expect(light[1]).toBe(255);
    expect(light[2]).toBe(255);
  });

  it("binarizes low luminance pixels (< 80) to 0", () => {
    // Pure black: R=0, G=0, B=0 => gray=0 (<80) => 0
    const black = new Uint8ClampedArray([0, 0, 0, 255]);
    applyRec601Threshold(black);
    expect(black[0]).toBe(0);
    expect(black[1]).toBe(0);
    expect(black[2]).toBe(0);

    // Dark gray: R=50, G=50, B=50 => gray=50 (<80) => 0
    const dark = new Uint8ClampedArray([50, 50, 50, 255]);
    applyRec601Threshold(dark);
    expect(dark[0]).toBe(0);
    expect(dark[1]).toBe(0);
    expect(dark[2]).toBe(0);
  });

  it("leaves mid-range luminance pixels (80 <= gray <= 180) at calculated grayscale value", () => {
    // R=100, G=100, B=100 => gray = 100 (between 80 and 180) => 100
    const mid = new Uint8ClampedArray([100, 100, 100, 255]);
    applyRec601Threshold(mid);
    expect(mid[0]).toBe(100);
    expect(mid[1]).toBe(100);
    expect(mid[2]).toBe(100);
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
