import { describe, it, expect } from "bun:test";
import { ShortcutManager } from "../src/modules/shortcuts/shortcutManager";

describe("ShortcutManager", () => {
  describe("parseFromEvent", () => {
    it("orders modifiers canonically (Ctrl -> Alt -> Shift -> Super)", () => {
      const event = {
        ctrlKey: true,
        altKey: true,
        shiftKey: false,
        metaKey: false,
        code: "KeyQ",
        key: "q",
      } as unknown as KeyboardEvent;

      expect(ShortcutManager.parseFromEvent(event)).toBe("Ctrl+Alt+Q");
      const detailed = ShortcutManager.parseDetailedFromEvent(event);
      expect(detailed).toEqual({
        modifiers: ["Ctrl", "Alt"],
        key: "Q",
        canonical: "Ctrl+Alt+Q",
      });
    });

    it("parses digit codes correctly", () => {
      const event = {
        ctrlKey: true,
        altKey: false,
        shiftKey: true,
        metaKey: false,
        code: "Digit1",
        key: "1",
      } as unknown as KeyboardEvent;

      expect(ShortcutManager.parseFromEvent(event)).toBe("Ctrl+Shift+1");
    });

    it("handles F-keys without requiring modifiers", () => {
      const event = {
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        code: "F4",
        key: "F4",
      } as unknown as KeyboardEvent;

      expect(ShortcutManager.parseFromEvent(event)).toBe("F4");
    });

    it("defaults to Alt modifier when a non-F key is pressed without modifiers", () => {
      const event = {
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        code: "KeyA",
        key: "a",
      } as unknown as KeyboardEvent;

      expect(ShortcutManager.parseFromEvent(event)).toBe("Alt+A");
    });

    it("returns null for standalone modifier presses", () => {
      const ctrlEvent = {
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        key: "Control",
      } as unknown as KeyboardEvent;

      expect(ShortcutManager.parseFromEvent(ctrlEvent)).toBeNull();

      const altEvent = {
        ctrlKey: false,
        altKey: true,
        shiftKey: false,
        metaKey: false,
        key: "Alt",
      } as unknown as KeyboardEvent;

      expect(ShortcutManager.parseFromEvent(altEvent)).toBeNull();
    });

    it("returns null when Escape is pressed", () => {
      const escEvent = {
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        key: "Escape",
      } as unknown as KeyboardEvent;

      expect(ShortcutManager.parseFromEvent(escEvent)).toBeNull();
    });
  });

  describe("normalize", () => {
    it("reorders arbitrary modifier sequence into canonical order", () => {
      expect(ShortcutManager.normalize("Alt+Ctrl+Q")).toBe("Ctrl+Alt+Q");
      expect(ShortcutManager.normalize("Shift+Alt+Ctrl+S")).toBe("Ctrl+Alt+Shift+S");
    });

    it("normalizes modifier aliases like cmd/win to Super", () => {
      expect(ShortcutManager.normalize("Cmd+Shift+K")).toBe("Shift+Super+K");
    });
  });

  describe("isValid", () => {
    it("accepts valid shortcuts with modifiers and key", () => {
      expect(ShortcutManager.isValid("Alt+Q")).toBe(true);
      expect(ShortcutManager.isValid("Ctrl+Shift+S")).toBe(true);
      expect(ShortcutManager.isValid("Ctrl+Alt+Shift+Super+Z")).toBe(true);
    });

    it("accepts standalone function keys F1 to F12", () => {
      expect(ShortcutManager.isValid("F4")).toBe(true);
      expect(ShortcutManager.isValid("F12")).toBe(true);
      expect(ShortcutManager.isValid("Ctrl+F1")).toBe(true);
    });

    it("rejects single modifier or modifier-only sequences", () => {
      expect(ShortcutManager.isValid("Ctrl")).toBe(false);
      expect(ShortcutManager.isValid("Alt+Shift")).toBe(false);
      expect(ShortcutManager.isValid("Ctrl+Alt+")).toBe(false);
    });

    it("rejects non-F keys without modifiers", () => {
      expect(ShortcutManager.isValid("Q")).toBe(false);
      expect(ShortcutManager.isValid("1")).toBe(false);
    });

    it("rejects Escape or empty strings", () => {
      expect(ShortcutManager.isValid("")).toBe(false);
      expect(ShortcutManager.isValid("Escape")).toBe(false);
      expect(ShortcutManager.isValid("   ")).toBe(false);
    });
  });

  describe("renderHtml", () => {
    it("formats shortcut string with semantic <kbd> tags", () => {
      expect(ShortcutManager.renderHtml("Alt+Q")).toBe("<kbd>Alt</kbd> + <kbd>Q</kbd>");
      expect(ShortcutManager.renderHtml("Ctrl+Shift+S")).toBe(
        "<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>"
      );
    });

    it("returns empty string for empty input", () => {
      expect(ShortcutManager.renderHtml("")).toBe("");
    });
  });
});
