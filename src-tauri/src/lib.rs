// Lagbok Desktop – Windows-skalet runt Lagboken.
//
// Huvudfönstret är en vanlig Windows-app (fäst mot kanter, delad skärm, minns storlek och läge).
// Snabbpanelen är ett eget fönster utan ram som glider fram i högerkanten med Ctrl + Alt + L,
// var man än är i Windows. Krysset gömmer appen vid klockan så att kortkommandot alltid fungerar.
// Lagbok-länkar (lagbok://BrB/3/8) och hopplistan i aktivitetsfältet öppnar lagrum direkt.

mod jumplist;

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_window_state::StateFlags;

const SHORTCUT: &str = "ctrl+alt+l";
const SHORTCUT_LABEL: &str = "Ctrl+Alt+L";
/// Startargument när appen startar med Windows: då börjar den dold vid klockan.
const HIDDEN_ARG: &str = "--hidden";

/// Inställningar som bara gäller Windows-skalet (appens egna inställningar ligger i webbdelen).
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DesktopSettings {
    close_to_tray: bool,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self { close_to_tray: true }
    }
}

struct AppState {
    settings: Mutex<DesktopSettings>,
    /// Lagbok-länk som kom innan webbdelen hann starta.
    pending_link: Mutex<Option<String>>,
}

fn settings_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("desktop.json"))
}

fn load_settings(app: &AppHandle) -> DesktopSettings {
    settings_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_settings(app: &AppHandle, settings: &DesktopSettings) {
    if let Some(path) = settings_path(app) {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(path, serde_json::to_string_pretty(settings).unwrap_or_default());
    }
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// ---------- Snabbpanelen ----------

fn create_panel(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, "panel", WebviewUrl::App("index.html".into()))
        .title("Lagbok – snabbpanel")
        // Webbdelen visar panelens knappar och döljer panelen med Esc.
        .initialization_script("window.__LAGBOK_PANEL=true;")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .visible(false)
        .inner_size(440.0, 800.0)
        .min_inner_size(320.0, 400.0)
        .build()
}

/// Lägger panelen längs högerkanten på den skärm där muspekaren är: en tredjedel av bredden och
/// hela höjden ovanför aktivitetsfältet.
fn place_panel(app: &AppHandle, panel: &WebviewWindow) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    if let Some(m) = monitor {
        let area = m.work_area();
        let width = (area.size.width / 3).clamp(380, 720).min(area.size.width);
        let _ = panel.set_size(PhysicalSize::new(width, area.size.height));
        let _ = panel.set_position(PhysicalPosition::new(
            area.position.x + area.size.width as i32 - width as i32,
            area.position.y,
        ));
    }
}

fn toggle_panel(app: &AppHandle) {
    let panel = match app.get_webview_window("panel") {
        Some(p) => p,
        None => match create_panel(app) {
            Ok(p) => p,
            Err(_) => return,
        },
    };
    let visible = panel.is_visible().unwrap_or(false);
    if visible && panel.is_focused().unwrap_or(false) {
        let _ = panel.hide();
        return;
    }
    if !visible {
        place_panel(app, &panel);
    }
    let _ = panel.show();
    let _ = panel.set_focus();
    // Händelserna sänds till alla fönster; varje fönster lyssnar bara på sina egna (desktop.js).
    let _ = app.emit("panel-shown", ());
}

// ---------- Lagbok-länkar ----------

fn link_in(args: &[String]) -> Option<String> {
    args.iter()
        .find(|a| a.to_ascii_lowercase().starts_with("lagbok:"))
        .cloned()
}

fn open_link(app: &AppHandle, url: String) {
    show_main(app);
    // Har webbdelen inte startat än hämtar den länken själv (take_pending_link).
    if let Some(state) = app.try_state::<AppState>() {
        *state.pending_link.lock().unwrap() = Some(url.clone());
    }
    let _ = app.emit("deep-link", url);
}

// ---------- Kommandon från webbdelen ----------

#[tauri::command]
fn hide_panel(app: AppHandle) {
    if let Some(p) = app.get_webview_window("panel") {
        let _ = p.hide();
    }
}

#[tauri::command]
fn open_in_main(app: AppHandle, hash: String) {
    hide_panel(app.clone());
    show_main(&app);
    let _ = app.emit("open-hash", hash);
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")) {
        return Err("bara webb- och e-postlänkar".into());
    }
    app.opener().open_url(url, None::<String>).map_err(|e| e.to_string())
}

#[tauri::command]
fn take_pending_link(state: tauri::State<AppState>) -> Option<String> {
    state.pending_link.lock().unwrap().take()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsView {
    autostart: bool,
    close_to_tray: bool,
    shortcut: String,
}

#[tauri::command]
fn get_desktop_settings(app: AppHandle, state: tauri::State<AppState>) -> SettingsView {
    SettingsView {
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
        close_to_tray: state.settings.lock().unwrap().close_to_tray,
        shortcut: SHORTCUT_LABEL.into(),
    }
}

#[tauri::command]
fn set_autostart(app: AppHandle, on: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if on { manager.enable() } else { manager.disable() }.map_err(|e| e.to_string())
}

#[tauri::command]
fn set_close_to_tray(app: AppHandle, state: tauri::State<AppState>, on: bool) {
    let mut settings = state.settings.lock().unwrap();
    settings.close_to_tray = on;
    save_settings(&app, &settings);
}

#[tauri::command]
fn set_jump_list(favourites: Vec<jumplist::Item>, recents: Vec<jumplist::Item>) {
    // Hopplistan byggs i en egen tråd så att fönstret aldrig väntar på Windows.
    std::thread::spawn(move || {
        let _ = jumplist::set(&favourites, &recents);
    });
}

#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<String>, String> {
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(update.map(|u| u.version))
}

#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    if let Some(update) = update {
        update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
        app.restart();
    }
    Ok(())
}

// ---------- Ikonen vid klockan ----------

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Visa Lagbok Desktop", true, None::<&str>)?;
    let panel = MenuItem::with_id(app, "panel", "Snabbpanel (Ctrl + Alt + L)", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Avsluta", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &panel, &separator, &quit])?;
    let mut tray = TrayIconBuilder::with_id("lagbok")
        .tooltip("Lagbok Desktop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "panel" => toggle_panel(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Måste vara först: startar man appen igen, eller trycker på en Lagbok-länk, används det fönster som redan är öppet.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| match link_in(&args) {
            Some(url) => open_link(app, url),
            None => show_main(app),
        }))
        .plugin(tauri_plugin_deep_link::init())
        // Storlek, läge och skärm sparas; om fönstret syns bestämmer appen själv (start med Windows börjar dold).
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["panel"])
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().args([HIDDEN_ARG]).build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_panel(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            hide_panel,
            open_in_main,
            open_external,
            take_pending_link,
            get_desktop_settings,
            set_autostart,
            set_close_to_tray,
            set_jump_list,
            check_update,
            install_update
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(AppState {
                settings: Mutex::new(load_settings(&handle)),
                pending_link: Mutex::new(None),
            });
            build_tray(&handle)?;

            // Kortkommandot. Är det upptaget av ett annat program fortsätter appen utan det.
            let _ = app.global_shortcut().register(SHORTCUT);

            // Under utveckling (utan installation) registreras Lagbok-länkarna här; annars gör installationen det.
            #[cfg(debug_assertions)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }

            // Snabbpanelen skapas i förväg, dold, så att den visas direkt första gången.
            let _ = create_panel(&handle);

            let args: Vec<String> = std::env::args().collect();
            if let Some(url) = link_in(&args) {
                open_link(&handle, url);
            } else if !args.iter().any(|a| a == HIDDEN_ARG) {
                show_main(&handle);
            }

            // Leta efter en ny version en stund efter starten.
            let updates = handle.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(8)).await;
                if let Ok(updater) = updates.updater() {
                    if let Ok(Some(update)) = updater.check().await {
                        let _ = updates.emit("update-available", update.version);
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let to_tray = window.label() == "panel"
                    || app
                        .try_state::<AppState>()
                        .map(|s| s.settings.lock().unwrap().close_to_tray)
                        .unwrap_or(true);
                if to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    app.exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Lagbok Desktop kunde inte starta");
}
