export type Modifier = "Ctrl" | "Alt" | "Shift" | "Super";

export interface ParsedShortcut {
  modifiers: Modifier[];
  key: string;
  canonical: string;
}

const CANONICAL_MODIFIERS: Modifier[] = ["Ctrl", "Alt", "Shift", "Super"];

const MODIFIER_ALIASES: Record<string, Modifier> = {
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  super: "Super",
  meta: "Super",
  command: "Super",
  cmd: "Super",
  win: "Super",
  windows: "Super",
};

export class ShortcutManager {
  /**
   * Parses a KeyboardEvent into a structured ParsedShortcut object.
   * Returns null for standalone modifier presses or Escape.
   */
  static parseDetailedFromEvent(e: KeyboardEvent, defaultToAlt: boolean = true): ParsedShortcut | null {
    if (e.key === "Escape") {
      return null;
    }

    // Ignore single modifier keydown
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
      return null;
    }

    const mods: Modifier[] = [];
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

    const isFKey = /^F([1-9]|1[0-2])$/i.test(keyPart);
    if (mods.length === 0 && !isFKey && defaultToAlt) {
      mods.push("Alt");
    }

    const orderedMods = CANONICAL_MODIFIERS.filter((m) => mods.includes(m));
    const canonical = [...orderedMods, keyPart].join("+");

    return {
      modifiers: orderedMods,
      key: keyPart,
      canonical,
    };
  }

  /**
   * Parses a KeyboardEvent into a canonical shortcut string (e.g., "Ctrl+Alt+Q").
   * Returns null for standalone modifier presses or Escape.
   */
  static parseFromEvent(e: KeyboardEvent): string | null {
    const detailed = this.parseDetailedFromEvent(e, true);
    return detailed ? detailed.canonical : null;
  }

  /**
   * Normalizes an existing shortcut string into canonical modifier order.
   * e.g., "Alt+Ctrl+Q" -> "Ctrl+Alt+Q"
   */
  static normalize(shortcut: string): string {
    const rawTokens = shortcut
      .split("+")
      .map((t) => t.trim())
      .filter(Boolean);

    if (rawTokens.length === 0) return "";

    const mods: Modifier[] = [];
    let key = "";

    for (const token of rawTokens) {
      const lower = token.toLowerCase();
      if (MODIFIER_ALIASES[lower]) {
        const canonicalMod = MODIFIER_ALIASES[lower];
        if (!mods.includes(canonicalMod)) {
          mods.push(canonicalMod);
        }
      } else {
        key = token.toUpperCase();
      }
    }

    const orderedMods = CANONICAL_MODIFIERS.filter((m) => mods.includes(m));
    if (!key) {
      return orderedMods.join("+");
    }
    return [...orderedMods, key].join("+");
  }

  /**
   * Validates whether a shortcut string is complete and bindable.
   * - Function keys (F1-F12) are valid with or without modifiers.
   * - Other alphanumeric keys require at least one modifier.
   * - Single modifiers alone or Escape are invalid.
   */
  static isValid(shortcut: string): boolean {
    if (!shortcut || typeof shortcut !== "string") return false;

    const trimmed = shortcut.trim();
    if (!trimmed || trimmed.toLowerCase() === "escape") return false;

    const parts = trimmed.split("+").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return false;

    const lastPart = parts[parts.length - 1];
    const isModifierOnly = ["ctrl", "alt", "shift", "super", "meta", "control", "cmd"].includes(
      lastPart.toLowerCase()
    );

    if (isModifierOnly) return false;

    const isFKey = /^F([1-9]|1[0-2])$/i.test(lastPart);
    const modCount = parts.length - 1;

    // F1-F12 can exist with 0 or more modifiers
    if (isFKey) {
      return true;
    }

    // Other keys require at least 1 modifier
    return modCount >= 1;
  }

  /**
   * Formats a shortcut string into semantic HTML `<kbd>` elements.
   * e.g. "Ctrl+Alt+Q" -> "<kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Q</kbd>"
   */
  static renderHtml(shortcut: string): string {
    if (!shortcut) return "";
    const parts = shortcut.split("+").map((p) => p.trim()).filter(Boolean);
    return parts.map((p) => `<kbd>${p}</kbd>`).join(" + ");
  }
}
