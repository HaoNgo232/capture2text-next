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

#[tauri::command]
fn capture_screen(app: tauri::AppHandle) -> Result<String, String> {
    // If main window is visible, hide it briefly so it is not captured in the screenshot
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
            let _ = window.hide();
            std::thread::sleep(std::time::Duration::from_millis(90));
        }
    }

    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let primary = monitors
        .iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .or_else(|| monitors.first())
        .ok_or_else(|| "Không tìm thấy màn hình hiển thị".to_string())?;

    let image = primary.capture_image().map_err(|e| e.to_string())?;

    let mut buf = Cursor::new(Vec::new());
    image
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

#[tauri::command]
fn register_trigger_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<String, String> {
    let clean = shortcut.trim().to_string();
    let sc = Shortcut::from_str(&clean)
        .map_err(|e| format!("Phím tắt không hợp lệ: {e}"))?;
    
    // Unregister existing shortcuts
    let _ = app.global_shortcut().unregister_all();
    app.global_shortcut()
        .register(sc)
        .map_err(|e| format!("Không thể đăng ký phím tắt '{clean}': {e}"))?;

    Ok(clean)
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
        if show_window {
            let _ = window.set_always_on_top(false);
            let _ = window.set_fullscreen(false);
            let _ = window.show();
            let _ = window.set_focus();
        } else {
            let _ = window.hide();
            let _ = window.set_always_on_top(false);
            let _ = window.set_fullscreen(false);
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
        let _ = window.hide();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            // Emit trigger-capture directly without popping window first
                            let _ = window.emit("trigger-capture", ());
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Build Tray Menu
            let quit_i = MenuItem::with_id(app, "quit", "Thoát Capture2Text", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Mở giao diện", true, None::<&str>)?;
            let capture_i = MenuItem::with_id(app, "capture", "Chụp màn hình (OCR)", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &capture_i, &quit_i])?;

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

            // Register default trigger shortcut (e.g. Alt+Q or Ctrl+Shift+S)
            // Can also be registered/updated from frontend on boot
            let _ = app.global_shortcut().register(Shortcut::from_str("Alt+Q").unwrap());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Keep app running in background / tray when window is closed
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            capture_screen,
            capture_region,
            register_trigger_shortcut,
            enter_snipping,
            exit_snipping,
            show_main_window,
            hide_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
