use std::io::Cursor;
use std::str::FromStr;
use base64::Engine;
use image::ImageFormat;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

use std::sync::{Mutex, OnceLock};
use image::RgbaImage;

static LAST_DESKTOP_IMAGE: Mutex<Option<RgbaImage>> = Mutex::new(None);
static CAPTURE_SHORTCUT: Mutex<Option<Shortcut>> = Mutex::new(None);
static QUICK_TRANSLATE_SHORTCUT: Mutex<Option<Shortcut>> = Mutex::new(None);
static CURRENT_LANG: OnceLock<Mutex<String>> = OnceLock::new();

fn current_lang() -> &'static Mutex<String> {
    CURRENT_LANG.get_or_init(|| Mutex::new(String::from("en")))
}

struct TrayLabels {
    show: String,
    capture: String,
    quick_translate: String,
    quit: String,
}

fn get_tray_labels(lang: &str) -> TrayLabels {
    match lang {
        "vi" => TrayLabels {
            show: "Mở giao diện".into(),
            capture: "Chụp màn hình (OCR)".into(),
            quick_translate: "Dịch nhanh văn bản chọn".into(),
            quit: "Thoát Capture2Text".into(),
        },
        _ => TrayLabels {
            show: "Show Window".into(),
            capture: "Screenshot (OCR)".into(),
            quick_translate: "Quick Translate Selection".into(),
            quit: "Quit Capture2Text".into(),
        },
    }
}

#[tauri::command]
fn capture_screen(app: tauri::AppHandle) -> Result<String, String> {
    // If main window is visible, hide it briefly so it is not captured in the screenshot
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
            let _ = window.hide();
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
    }

    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let primary = monitors
        .iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .or_else(|| monitors.first())
        .ok_or_else(|| "Không tìm thấy màn hình hiển thị".to_string())?;

    let image = primary.capture_image().map_err(|e| e.to_string())?;

    // Cache lossless 1:1 raw RGBA image for pixel-perfect OCR cropping on mouse-up
    if let Ok(mut guard) = LAST_DESKTOP_IMAGE.lock() {
        *guard = Some(image.clone());
    }

    // Convert to RGB8 and encode fast JPEG (quality 85) for instant UI overlay display (<20ms)
    let dynamic = image::DynamicImage::ImageRgba8(image);
    let rgb = dynamic.to_rgb8();

    let mut buf = Cursor::new(Vec::new());
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 85);
    encoder
        .encode_image(&rgb)
        .map_err(|e| e.to_string())?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(buf.get_ref());
    Ok(format!("data:image/jpeg;base64,{}", encoded))
}

#[tauri::command]
fn crop_captured_screen(
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    if width == 0 || height == 0 {
        return Err("Kích thước vùng chọn không hợp lệ".to_string());
    }

    let guard = LAST_DESKTOP_IMAGE
        .lock()
        .map_err(|e| format!("Lỗi lock bộ nhớ ảnh: {e}"))?;
    let full_image = guard
        .as_ref()
        .ok_or_else(|| "Không tìm thấy ảnh chụp màn hình gần nhất".to_string())?;

    let img_w = full_image.width();
    let img_h = full_image.height();
    if x >= img_w || y >= img_h {
        return Err("Tọa độ vùng chọn nằm ngoài màn hình".to_string());
    }
    let actual_w = width.min(img_w - x);
    let actual_h = height.min(img_h - y);

    let cropped = image::imageops::crop_imm(full_image, x, y, actual_w, actual_h);

    let mut buf = Cursor::new(Vec::new());
    cropped
        .to_image()
        .write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(buf.get_ref());
    Ok(format!("data:image/png;base64,{}", encoded))
}

#[tauri::command]
fn capture_region(
    app: tauri::AppHandle,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    if width == 0 || height == 0 {
        return Err("Kích thước vùng chọn không hợp lệ".to_string());
    }

    // Ensure main window is hidden so it is not captured in the screenshot
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
            let _ = window.hide();
            std::thread::sleep(std::time::Duration::from_millis(60));
        }
    }

    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let primary = monitors
        .iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .or_else(|| monitors.first())
        .ok_or_else(|| "Không tìm thấy màn hình hiển thị".to_string())?;

    let full_image = primary.capture_image().map_err(|e| e.to_string())?;

    let img_w = full_image.width();
    let img_h = full_image.height();
    if x >= img_w || y >= img_h {
        return Err("Tọa độ vùng chọn nằm ngoài màn hình".to_string());
    }
    let actual_w = width.min(img_w - x);
    let actual_h = height.min(img_h - y);

    let cropped = image::imageops::crop_imm(&full_image, x, y, actual_w, actual_h);

    let mut buf = Cursor::new(Vec::new());
    cropped
        .to_image()
        .write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(buf.get_ref());
    Ok(format!("data:image/png;base64,{}", encoded))
}

fn reregister_all_shortcuts(app: &tauri::AppHandle) -> Result<(), String> {
    let _ = app.global_shortcut().unregister_all();
    if let Ok(guard) = CAPTURE_SHORTCUT.lock() {
        if let Some(sc) = guard.as_ref() {
            let _ = app.global_shortcut().register(sc.clone());
        }
    }
    if let Ok(guard) = QUICK_TRANSLATE_SHORTCUT.lock() {
        if let Some(sc) = guard.as_ref() {
            let _ = app.global_shortcut().register(sc.clone());
        }
    }
    Ok(())
}

#[tauri::command]
fn register_trigger_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<String, String> {
    let clean = shortcut.trim().to_string();
    let sc = Shortcut::from_str(&clean)
        .map_err(|e| format!("Phím tắt không hợp lệ: {e}"))?;
    
    if let Ok(mut guard) = CAPTURE_SHORTCUT.lock() {
        *guard = Some(sc);
    }
    reregister_all_shortcuts(&app)?;
    Ok(clean)
}

#[tauri::command]
fn register_quick_translate_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<String, String> {
    let clean = shortcut.trim().to_string();
    if clean.is_empty() {
        if let Ok(mut guard) = QUICK_TRANSLATE_SHORTCUT.lock() {
            *guard = None;
        }
        reregister_all_shortcuts(&app)?;
        return Ok("".to_string());
    }

    let sc = Shortcut::from_str(&clean)
        .map_err(|e| format!("Phím tắt dịch nhanh không hợp lệ: {e}"))?;
    
    if let Ok(mut guard) = QUICK_TRANSLATE_SHORTCUT.lock() {
        *guard = Some(sc);
    }
    reregister_all_shortcuts(&app)?;
    Ok(clean)
}

#[cfg(target_os = "windows")]
fn get_clipboard_text_win32() -> Option<String> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    extern "system" {
        fn OpenClipboard(hwnd: usize) -> i32;
        fn CloseClipboard() -> i32;
        fn GetClipboardData(uFormat: u32) -> usize;
        fn GlobalLock(hMem: usize) -> *const u16;
        fn GlobalUnlock(hMem: usize) -> i32;
    }
    const CF_UNICODETEXT: u32 = 13;

    unsafe {
        if OpenClipboard(0) == 0 {
            return None;
        }
        let handle = GetClipboardData(CF_UNICODETEXT);
        if handle == 0 {
            CloseClipboard();
            return None;
        }
        let ptr = GlobalLock(handle);
        if ptr.is_null() {
            CloseClipboard();
            return None;
        }
        let mut len = 0;
        while *ptr.add(len) != 0 {
            len += 1;
        }
        let slice = std::slice::from_raw_parts(ptr, len);
        let text = OsString::from_wide(slice).to_string_lossy().to_string();
        GlobalUnlock(handle);
        CloseClipboard();
        Some(text)
    }
}

#[tauri::command]
fn get_selected_text() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        unsafe {
            extern "system" {
                fn keybd_event(bVk: u8, bScan: u8, dwFlags: u32, dwExtraInfo: usize);
            }
            const VK_MENU: u8 = 0x12; // Alt
            const VK_SHIFT: u8 = 0x10; // Shift
            const VK_CONTROL: u8 = 0x11;
            const VK_C: u8 = 0x43;
            const KEYEVENTF_KEYUP: u32 = 0x0002;

            // Release modifiers
            keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
            keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0);
            std::thread::sleep(std::time::Duration::from_millis(15));

            // Send Ctrl+C
            keybd_event(VK_CONTROL, 0, 0, 0);
            keybd_event(VK_C, 0, 0, 0);
            keybd_event(VK_C, 0, KEYEVENTF_KEYUP, 0);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
        }

        std::thread::sleep(std::time::Duration::from_millis(80));

        if let Some(text) = get_clipboard_text_win32() {
            let clean = text.trim().to_string();
            if !clean.is_empty() {
                return Ok(clean);
            }
        }
    }
    Err("Không tìm thấy văn bản được chọn".to_string())
}

#[tauri::command]
fn is_silent_start() -> bool {
    std::env::args().any(|arg| arg == "--silent")
}

#[tauri::command]
fn set_language(app: tauri::AppHandle, lang: String) -> Result<(), String> {
    let valid_lang = match lang.as_str() {
        "vi" | "en" => lang,
        _ => "en".into(),
    };
    if let Ok(mut guard) = current_lang().lock() {
        *guard = valid_lang.clone();
    }
    let labels = get_tray_labels(&valid_lang);
    if let Some(tray) = app.tray_by_id("main") {
        let quit_i = MenuItem::with_id(&app, "quit", &labels.quit, true, None::<&str>).map_err(|e| e.to_string())?;
        let show_i = MenuItem::with_id(&app, "show", &labels.show, true, None::<&str>).map_err(|e| e.to_string())?;
        let capture_i = MenuItem::with_id(&app, "capture", &labels.capture, true, None::<&str>).map_err(|e| e.to_string())?;
        let quick_trans_i = MenuItem::with_id(&app, "quick_translate", &labels.quick_translate, true, None::<&str>).map_err(|e| e.to_string())?;
        let menu = Menu::with_items(&app, &[&show_i, &capture_i, &quick_trans_i, &quit_i]).map_err(|e| e.to_string())?;
        let _ = tray.set_menu(Some(menu));
    }
    Ok(())
}

#[tauri::command]
fn is_autostart_enabled() -> bool {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("reg")
            .args(&[
                "query",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "Capture2TextNext",
            ])
            .output();
        if let Ok(out) = output {
            return out.status.success();
        }
    }
    false
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        if enabled {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let exe_str = exe.to_str().ok_or("Đường dẫn exe không hợp lệ")?;
            let reg_value = format!("\"{}\" --silent", exe_str);

            let output = std::process::Command::new("reg")
                .args(&[
                    "add",
                    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                    "/v",
                    "Capture2TextNext",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &reg_value,
                    "/f",
                ])
                .output()
                .map_err(|e| e.to_string())?;

            if !output.status.success() {
                return Err("Không thể ghi cấu hình vào Windows Registry".to_string());
            }
        } else {
            let _ = std::process::Command::new("reg")
                .args(&[
                    "delete",
                    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                    "/v",
                    "Capture2TextNext",
                    "/f",
                ])
                .output();
        }
        return Ok(enabled);
    }
    #[cfg(not(target_os = "windows"))]
    Ok(false)
}

#[tauri::command]
fn enter_snipping(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_fullscreen(true);
        let _ = window.set_always_on_top(true);
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn exit_snipping(app: tauri::AppHandle, show_window: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if !show_window {
            // Hide BEFORE restoring from fullscreen: otherwise Windows composites
            // a frame of the normal-size window over the desktop (UI flicker on
            // mouse release during snipping).
            let _ = window.hide();
            let _ = window.set_always_on_top(false);
            let _ = window.set_fullscreen(false);
        } else {
            let _ = window.set_always_on_top(false);
            let _ = window.set_fullscreen(false);
            focus_main_window(&app);
        }
    }
    Ok(())
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    focus_main_window(&app);
    Ok(())
}

#[tauri::command]
fn hide_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn synthesize_speech(text: String, lang: String) -> Result<String, String> {
    let clean_text = text.trim();
    if clean_text.is_empty() {
        return Err("Văn bản phát âm không được để trống".to_string());
    }

    let lang_code = if lang.trim().is_empty() { "vi" } else { lang.trim() };

    let url = reqwest::Url::parse_with_params(
        "https://translate.google.com/translate_tts",
        &[
            ("ie", "UTF-8"),
            ("tl", lang_code),
            ("client", "gtx"),
            ("q", clean_text),
        ],
    ).map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(url)
        .header("Referer", "https://translate.google.com/")
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối máy chủ phát âm: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Máy chủ phát âm phản hồi mã lỗi: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Lỗi nhận dữ liệu âm thanh: {}", e))?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:audio/mp3;base64,{}", encoded))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let is_quick_translate = QUICK_TRANSLATE_SHORTCUT
                            .lock()
                            .ok()
                            .and_then(|g| g.as_ref().map(|s| s == shortcut))
                            .unwrap_or(false);

                        if is_quick_translate {
                            // Grab selected text NOW — before focus shifts to our window.
                            // We do this on a spawned thread so the shortcut handler is not blocked.
                            let app_handle = app.clone();
                            std::thread::spawn(move || {
                                // Small delay so the OS finishes registering the key-up for Alt.
                                std::thread::sleep(std::time::Duration::from_millis(60));

                                // Simulate Ctrl+C to copy selected text
                                #[cfg(target_os = "windows")]
                                {
                                    unsafe {
                                        extern "system" {
                                            fn keybd_event(bVk: u8, bScan: u8, dwFlags: u32, dwExtraInfo: usize);
                                        }
                                        const VK_MENU: u8 = 0x12;
                                        const VK_SHIFT: u8 = 0x10;
                                        const VK_CONTROL: u8 = 0x11;
                                        const VK_C: u8 = 0x43;
                                        const KEYEVENTF_KEYUP: u32 = 0x0002;

                                        // Release any lingering modifier keys
                                        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
                                        keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0);
                                        std::thread::sleep(std::time::Duration::from_millis(20));

                                        // Send Ctrl+C to the foreground app
                                        keybd_event(VK_CONTROL, 0, 0, 0);
                                        keybd_event(VK_C, 0, 0, 0);
                                        keybd_event(VK_C, 0, KEYEVENTF_KEYUP, 0);
                                        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
                                    }
                                    // Wait for clipboard to be populated
                                    std::thread::sleep(std::time::Duration::from_millis(120));

                                    let text = get_clipboard_text_win32()
                                        .map(|t| t.trim().to_string())
                                        .filter(|t| !t.is_empty())
                                        .unwrap_or_default();

                                    // Now show our window and send the text
                                    if let Some(window) = app_handle.get_webview_window("main") {
                                        let _ = window.show();
                                        let _ = window.unminimize();
                                        let _ = window.set_focus();
                                        let _ = window.emit("trigger-quick-translate", text);
                                    }
                                }
                                #[cfg(not(target_os = "windows"))]
                                {
                                    if let Some(window) = app_handle.get_webview_window("main") {
                                        let _ = window.emit("trigger-quick-translate", String::new());
                                    }
                                }
                            });
                        } else if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("trigger-capture", ());
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let lang = current_lang().lock().map(|g| g.clone()).unwrap_or_else(|_| "en".into());
            let labels = get_tray_labels(&lang);
            let quit_i = MenuItem::with_id(app, "quit", &labels.quit, true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", &labels.show, true, None::<&str>)?;
            let capture_i = MenuItem::with_id(app, "capture", &labels.capture, true, None::<&str>)?;
            let quick_trans_i = MenuItem::with_id(app, "quick_translate", &labels.quick_translate, true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &capture_i, &quick_trans_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Capture2Text Next")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        focus_main_window(app);
                    }
                    "capture" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("trigger-capture", ());
                        }
                    }
                    "quick_translate" => {
                        let app_handle = app.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(60));
                            #[cfg(target_os = "windows")]
                            {
                                unsafe {
                                    extern "system" {
                                        fn keybd_event(bVk: u8, bScan: u8, dwFlags: u32, dwExtraInfo: usize);
                                    }
                                    const VK_CONTROL: u8 = 0x11;
                                    const VK_C: u8 = 0x43;
                                    const KEYEVENTF_KEYUP: u32 = 0x0002;
                                    keybd_event(VK_CONTROL, 0, 0, 0);
                                    keybd_event(VK_C, 0, 0, 0);
                                    keybd_event(VK_C, 0, KEYEVENTF_KEYUP, 0);
                                    keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
                                }
                                std::thread::sleep(std::time::Duration::from_millis(120));
                                let text = get_clipboard_text_win32()
                                    .map(|t| t.trim().to_string())
                                    .filter(|t| !t.is_empty())
                                    .unwrap_or_default();
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                    let _ = window.emit("trigger-quick-translate", text);
                                }
                            }
                        });
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        focus_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // Register default trigger shortcuts
            if let Ok(sc) = Shortcut::from_str("Alt+Q") {
                if let Ok(mut g) = CAPTURE_SHORTCUT.lock() {
                    *g = Some(sc.clone());
                }
                let _ = app.global_shortcut().register(sc);
            }
            if let Ok(sc) = Shortcut::from_str("Alt+T") {
                if let Ok(mut g) = QUICK_TRANSLATE_SHORTCUT.lock() {
                    *g = Some(sc.clone());
                }
                let _ = app.global_shortcut().register(sc);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Prevent window destruction and hide cleanly to system tray
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            capture_screen,
            crop_captured_screen,
            capture_region,
            register_trigger_shortcut,
            register_quick_translate_shortcut,
            get_selected_text,
            is_silent_start,
            is_autostart_enabled,
            set_autostart,
            set_language,
            enter_snipping,
            exit_snipping,
            show_main_window,
            hide_main_window,
            synthesize_speech
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

