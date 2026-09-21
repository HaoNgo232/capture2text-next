import type { TranslationAdapter, TranslationRequest } from "./types";
import { i18n } from "../../i18n";

export class GoogleTranslateAdapter implements TranslationAdapter {
  private fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = (url: RequestInfo | URL, init?: RequestInit) => fetcher(url, init);
  }

  async translate(req: TranslationRequest): Promise<string> {
    const sourceLang = req.sourceLang || "auto";
    const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${encodeURIComponent(
      sourceLang
    )}&tl=${encodeURIComponent(req.targetLang)}&dt=t&q=${encodeURIComponent(req.text)}`;

    const res = await this.fetcher(url);
    if (!res.ok) {
      throw new Error(i18n.t("error.googleTranslateFail", { status: String(res.status) }));
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

    return result || req.text;
  }
}
