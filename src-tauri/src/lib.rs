// Lagbok Desktop – Windows-skalet runt Lagboken.
//
// Huvudfönstret är en vanlig Windows-app (fäst mot kanter, delad skärm, minns storlek och läge).
// Snabbpanelen (panel.rs) visas och döljs med ett kortkommando var man än är i Windows, och slår upp
// text som är markerad i det program man står i (selection.rs). Krysset gömmer appen vid klockan så att
// kortkommandot alltid fungerar. Lagbok-länkar (lagbok://BrB/3/8) och hopplistan i aktivitetsfältet
// (jumplist.rs) öppnar lagrum direkt.

mod jumplist;
mod panel;
mod selection;
mod settings;

use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_window_state::StateFlags;

/// Startargument när appen startar med Windows: då börjar den dold vid klockan.
const HIDDEN_ARG: &str = "--hidden";

/// Lagbok-länk som kom innan webbdelen hann starta.
struct PendingLink(Mutex<Option<String>>);

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Kortkommandot: döljer panelen om den är framme, annars kopieras eventuell markerad text i programmet man
/// står i och panelen visas. Kopieringen väntar på att tangenterna släpps och görs därför i en egen tråd.
fn on_shortcut(app: &AppHandle) {
    if panel::is_active(app) {
        panel::hide(app);
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let lookup = if settings::get(&app).lookup_selection { selection::copy_selection() } else { None };
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || panel::show(&handle, lookup));
    });
}

// ---------- Lagbok-länkar ----------

fn link_in(args: &[String]) -> Option<String> {
    args.iter()
        .find(|a| a.to_ascii_lowercase().starts_with("lagbok:"))
        .cloned()
}

fn open_link(app: &AppHandle, url: String) {
    // lagbok://panel (hopplistan) visar snabbpanelen.
    if url.trim_end_matches('/').eq_ignore_ascii_case("lagbok://panel") {
        panel::show(app, None);
        return;
    }
    show_main(app);
    // Har webbdelen inte startat än hämtar den länken själv (take_pending_link).
    if let Some(state) = app.try_state::<PendingLink>() {
        *state.0.lock().unwrap() = Some(url.clone());
    }
    let _ = app.emit("deep-link", url);
}

// ---------- Kommandon från webbdelen ----------

#[tauri::command]
fn hide_panel(app: AppHandle) {
    panel::hide(&app);
}

#[tauri::command]
fn open_in_main(app: AppHandle, hash: String) {
    panel::hide(&app);
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
fn take_pending_link(state: tauri::State<PendingLink>) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// Huvudfönstrets titel följer det man läser ("BrB 3:8 – Lagbok Desktop"), i aktivitetsfältet och Alt + Tab.
#[tauri::command]
fn set_title(app: AppHandle, title: String) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_title(&title);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsView {
    autostart: bool,
    close_to_tray: bool,
    shortcut: String,
    shortcut_label: String,
    shortcut_ok: bool,
    panel_mode: String,
    lookup_selection: bool,
}

#[tauri::command]
fn get_desktop_settings(app: AppHandle) -> SettingsView {
    let s = settings::get(&app);
    SettingsView {
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
        close_to_tray: s.close_to_tray,
        shortcut_label: settings::shortcut_label(&s.shortcut),
        shortcut_ok: app.global_shortcut().is_registered(s.shortcut.as_str()),
        shortcut: s.shortcut,
        panel_mode: s.panel_mode,
        lookup_selection: s.lookup_selection,
    }
}

#[tauri::command]
fn set_autostart(app: AppHandle, on: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if on { manager.enable() } else { manager.disable() }.map_err(|e| e.to_string())
}

#[tauri::command]
fn set_close_to_tray(app: AppHandle, on: bool) {
    settings::update(&app, |s| s.close_to_tray = on);
}

#[tauri::command]
fn set_lookup_selection(app: AppHandle, on: bool) {
    settings::update(&app, |s| s.lookup_selection = on);
}

#[tauri::command]
fn set_panel_mode(app: AppHandle, mode: String) {
    panel::set_mode(&app, &mode);
}

/// Byter kortkommando. Går det nya inte att använda (upptaget av ett annat program) behålls det gamla.
#[tauri::command]
fn set_shortcut(app: AppHandle, shortcut: String) -> Result<String, String> {
    let shortcut = shortcut.trim().to_ascii_lowercase();
    let old = settings::get(&app).shortcut;
    if shortcut == old {
        return Ok(settings::shortcut_label(&old));
    }
    let gs = app.global_shortcut();
    let _ = gs.unregister(old.as_str());
    if let Err(e) = gs.register(shortcut.as_str()) {
        let _ = gs.register(old.as_str());
        return Err(e.to_string());
    }
    settings::update(&app, |s| s.shortcut = shortcut.clone());
    Ok(settings::shortcut_label(&shortcut))
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
    let panel_item = MenuItem::with_id(app, "panel", "Snabbpanel", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Avsluta", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &panel_item, &separator, &quit])?;
    let mut tray = TrayIconBuilder::with_id("lagbok")
        .tooltip("Lagbok Desktop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "panel" => panel::show(app, None),
            "quit" => {
                panel::remember(app);
                app.exit(0)
            }
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
    // Samma app-id som genvägarna från installationen, så att hopplistan hör till ikonen i aktivitetsfältet.
    jumplist::set_app_id();
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
                .with_denylist(&[panel::LABEL])
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
                        on_shortcut(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            hide_panel,
            open_in_main,
            open_external,
            take_pending_link,
            set_title,
            get_desktop_settings,
            set_autostart,
            set_close_to_tray,
            set_lookup_selection,
            set_panel_mode,
            set_shortcut,
            set_jump_list,
            check_update,
            install_update
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let loaded = settings::load(&handle);
            let shortcut = loaded.shortcut.clone();
            app.manage(settings::SettingsState(Mutex::new(loaded)));
            app.manage(PendingLink(Mutex::new(None)));
            build_tray(&handle)?;

            // Kortkommandot. Är det upptaget av ett annat program visar Inställningar det, och man kan välja ett annat.
            if app.global_shortcut().register(shortcut.as_str()).is_err() && shortcut != settings::DEFAULT_SHORTCUT {
                let _ = app.global_shortcut().register(settings::DEFAULT_SHORTCUT);
                settings::update(&handle, |s| s.shortcut = settings::DEFAULT_SHORTCUT.into());
            }

            // Under utveckling (utan installation) registreras Lagbok-länkarna här; annars gör installationen det.
            #[cfg(debug_assertions)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }

            // Snabbpanelen skapas i förväg, dold, så att den visas direkt första gången.
            let _ = panel::create(&handle);

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
                if window.label() == panel::LABEL {
                    api.prevent_close();
                    panel::hide(app);
                } else if settings::get(app).close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    panel::remember(app);
                    app.exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Lagbok Desktop kunde inte starta");
}
