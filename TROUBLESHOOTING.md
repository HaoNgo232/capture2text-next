# Troubleshooting

Known failure modes and their causes.

**OCR is slow, or reports the OCR library is not ready on the first capture**

tesseract.js downloads the `*.traineddata` file for the selected language from the jsDelivr CDN the first time that language is used, then caches it. The first run therefore needs network access and takes noticeably longer; later runs are fast.

**OCR returns little or no text**

Select a tighter region around the text, prefer high-contrast content, and pick the correct source language in the control strip. Snippets smaller than 35 px are upscaled 2x automatically, but heavily compressed or rotated text will still fail.

**A global shortcut does nothing**

Another application is probably holding `Alt+Q` or `Alt+T`. Record a different combination in **Cấu hình**. A failed registration keeps the previous shortcut, so the app never becomes unreachable.

**Quick translate (`Alt+T`) picks up nothing**

The feature simulates `Ctrl+C` with Win32 `keybd_event`, which cannot reach an elevated (run-as-administrator) app from a non-elevated process, and some terminals or games ignore synthetic input. Copy the text manually and paste it into the source box instead.

**The captured region is black or blank**

Protected/DRM video surfaces and some GPU-accelerated layers cannot be captured. The overlay also freezes the desktop, so content that changes after the overlay appears is not in the crop — press the shortcut again to re-capture.

**No window appears after launching**

The app is tray-first. Check the tray icon, and note that *Silent startup* and auto-start with `--silent` intentionally launch without showing the window.

**A terminal window appears at sign-in, and closing it closes the app**

An earlier build could register the development (debug) executable for auto-start. Debug builds open a console window, so signing in started that console. The installed release build now rewrites the auto-start entry to point at itself on startup. If the terminal still appears, open **Cấu hình → Tự khởi động cùng Windows**, turn it off and on again, and save. Never enable auto-start from `bun run tauri dev`.

**Only the primary monitor is captured**

Screen capture targets the primary display, so on multi-monitor setups the snipping overlay covers the primary monitor only.

**The app window is missing from my screenshot**

That is intentional: the window is hidden just before capturing so it never appears in the crop.
