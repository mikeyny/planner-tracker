use std::net::TcpStream;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const API_ADDR: &str = "127.0.0.1:4040";

/// The monorepo root, so the app can start the local API with `bun`.
fn repo_root() -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .join("..")
        .join("..")
        .join("..")
        .canonicalize()
        .unwrap_or(manifest)
}

fn api_up() -> bool {
    TcpStream::connect_timeout(&API_ADDR.parse().unwrap(), Duration::from_millis(300)).is_ok()
}

/// ~/.deep, where the API log and first-run markers live.
fn deep_dir() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    let dir = PathBuf::from(home).join(".deep");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

/// `bun` from PATH, or the default install location (PATH can be thin at login).
fn bun_candidates() -> Vec<PathBuf> {
    let mut out = vec![PathBuf::from("bun")];
    if let Some(home) = std::env::var_os("USERPROFILE") {
        out.push(PathBuf::from(home).join(".bun").join("bin").join("bun.exe"));
    }
    out
}

/// Start the Bun API in the background if nothing is listening on its port yet.
/// Its output goes to ~/.deep/api.log.
fn ensure_api_running() {
    if api_up() {
        return;
    }
    let root = repo_root();
    let log = deep_dir().and_then(|d| {
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(d.join("api.log"))
            .ok()
    });
    for bun in bun_candidates() {
        let mut cmd = Command::new(&bun);
        cmd.args(["--env-file=.env", "apps/api/src/index.ts"])
            .current_dir(&root);
        if let Some(f) = &log {
            if let (Ok(out), Ok(err)) = (f.try_clone(), f.try_clone()) {
                cmd.stdout(out).stderr(err);
            }
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        match cmd.spawn() {
            Ok(_) => return,
            Err(e) => eprintln!("[deep] could not start API with {}: {e}", bun.display()),
        }
    }
}

/// The installed app turns "start with Windows" on the first time it runs
/// (Settings can switch it off). Dev builds never touch it.
fn enable_autostart_once(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let Some(marker) = deep_dir().map(|d| d.join("autostart-initialized")) else {
        return;
    };
    if marker.exists() {
        return;
    }
    use tauri_plugin_autostart::ManagerExt;
    match app.autolaunch().enable() {
        Ok(()) => {
            let _ = std::fs::write(&marker, "1");
        }
        Err(e) => eprintln!("[deep] could not enable start with Windows: {e}"),
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_minimized().unwrap_or(false) {
            let _ = w.unminimize();
        }
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Top-right corner of the primary monitor, in logical pixels.
fn top_right(app: &AppHandle, w: f64, margin: f64) -> (f64, f64) {
    if let Ok(Some(m)) = app.primary_monitor() {
        let scale = m.scale_factor();
        let size = m.size().to_logical::<f64>(scale);
        let pos = m.position().to_logical::<f64>(scale);
        return (pos.x + size.width - w - margin, pos.y + margin + 8.0);
    }
    (40.0, 40.0)
}

fn open_mini(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("mini") {
        w.show().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let (x, y) = top_right(app, 340.0, 24.0);
    WebviewWindowBuilder::new(app, "mini", WebviewUrl::App("index.html".into()))
        .title("Deep timer")
        .inner_size(340.0, 96.0)
        .position(x, y)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(true)
        .focused(false)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Window-creating commands must be async: a sync command that builds a window
// deadlocks the webview on Windows and the new window stays blank.
#[tauri::command]
async fn show_mini(app: AppHandle) -> Result<(), String> {
    open_mini(&app)
}

#[tauri::command]
fn hide_mini(app: AppHandle) {
    if let Some(w) = app.get_webview_window("mini") {
        let _ = w.hide();
    }
}

fn open_capture(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("capture") {
        let _ = w.center();
        w.show().map_err(|e| e.to_string())?;
        let _ = w.set_focus();
        let _ = w.emit("capture-shown", ());
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "capture", WebviewUrl::App("index.html".into()))
        .title("Capture")
        .inner_size(600.0, 132.0)
        .center()
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(true)
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn show_capture(app: AppHandle) -> Result<(), String> {
    open_capture(&app)
}

#[tauri::command]
fn hide_capture(app: AppHandle) {
    if let Some(w) = app.get_webview_window("capture") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn show_main(app: AppHandle) {
    show_main_window(&app);
}

#[tauri::command]
fn set_tray_tooltip(app: AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(text));
    }
}

fn spawn_hidden(program: &str, args: &[&str]) -> Result<(), String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Open a web link (a meeting's join link) in the default browser.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only web links can be opened.".into());
    }
    // rundll32 hands the URL to the default browser without a console window or shell parsing.
    spawn_hidden("rundll32", &["url.dll,FileProtocolHandler", &url])
}

/// Show a folder in File Explorer.
#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    if !std::path::Path::new(&path).is_dir() {
        return Err("That folder doesn't exist.".into());
    }
    Command::new("explorer").arg(&path).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

pub fn run() {
    ensure_api_running();

    let capture_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            // Launched at login: start quietly in the tray.
            Some(vec!["--hidden"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &capture_shortcut && event.state() == ShortcutState::Pressed {
                        let _ = open_capture(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            show_mini,
            hide_mini,
            show_capture,
            hide_capture,
            show_main,
            set_tray_tooltip,
            open_url,
            open_folder,
            quit_app
        ])
        .setup(move |app| {
            let handle = app.handle();

            enable_autostart_once(handle);
            // The main window starts hidden (no flash); show it unless launched at login.
            if !std::env::args().any(|a| a == "--hidden") {
                show_main_window(handle);
            }

            if let Err(e) = handle.global_shortcut().register(capture_shortcut) {
                eprintln!("[deep] could not register Ctrl+Shift+Space: {e}");
            }

            let open = MenuItem::with_id(handle, "open", "Open Deep", true, None::<&str>)?;
            let capture = MenuItem::with_id(handle, "capture", "Quick capture\tCtrl+Shift+Space", true, None::<&str>)?;
            let toggle = MenuItem::with_id(handle, "toggle", "Pause / resume", true, None::<&str>)?;
            let mini = MenuItem::with_id(handle, "mini", "Show mini timer", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(handle)?;
            let quit = MenuItem::with_id(handle, "quit", "Quit Deep", true, None::<&str>)?;
            let menu = Menu::with_items(handle, &[&open, &capture, &toggle, &mini, &sep, &quit])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Deep")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "capture" => {
                        let _ = open_capture(app);
                    }
                    "toggle" => {
                        let _ = app.emit_to("main", "tray-toggle", ());
                    }
                    "mini" => {
                        let _ = open_mini(app);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window hides it to the tray so tracking keeps running.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Deep");
}
