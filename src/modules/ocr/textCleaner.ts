/**
 * Sanitizes raw OCR recognized text according to language typology:
 * - Japanese (jpn) and Simplified Chinese (chi_sim): Strips all whitespace, carriage returns, and newlines.
 * - Latin / European languages: Collapses line breaks and multiple consecutive spaces into single spaces.
 * - All languages: Normalizes typographic/curly quotes (“ ” ‘ ’) to standard ASCII quotes (" ').
 */
export function cleanRecognizedText(rawText: string, lang: string): string {
  if (!rawText) return "";

  let text = rawText.trim();
  const normalizedLang = lang.toLowerCase();

  if (normalizedLang === "jpn" || normalizedLang === "chi_sim") {
    text = text.replace(/[\r\n]+/g, "").replace(/\s+/g, "");
  } else {
    text = text.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ");
  }

  text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  return text.trim();
}
