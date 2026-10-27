// Snabbpanelen: ett eget fönster utan ram som visas och döljs med kortkommandot var man än är i Windows.
//
// Två lägen (Inställningar → Windows):
// - "float": ett fritt fönster, ungefär som ChatGPT:s skrivbordsfönster. Det hamnar till höger om mitten på
//   skärmen där muspekaren är och minns sedan var man flyttade det och hur stort man gjorde det.
// - "edge": längs högerkanten, en tredjedel av skärmens bredd och hela höjden ovanför aktivitetsfältet.
//
// Panelen döljs bara, den stängs aldrig, så den visar samma sida som när man lämnade den.

use crate::settings::{PanelRect, Settings};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

pub const LABEL: &str = "panel";

pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Lagbok – snabbpanel")
        // Webbdelen visar panelens knappar och dragrad och döljer panelen med Esc.
        .initialization_script("window.__LAGBOK_PANEL=true;")
        .decorations(false)
        .shadow(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .visible(false)
        .inner_size(540.0, 720.0)
        .min_inner_size(360.0, 420.0)
        .build()
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL).or_else(|| create(app).ok())
}

/// Skärmen där muspekaren är (annars huvudskärmen).
fn cursor_monitor(app: &AppHandle) -> Option<Monitor> {
    app.cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
}

/// Ligger rektangeln till största delen på någon av skärmarna? (Skärmar kan ha kopplats bort sedan sist.)
fn visible_on_screen(app: &AppHandle, r: &PanelRect) -> bool {
    app.available_monitors().unwrap_or_default().iter().any(|m| {
        let a = m.work_area();
        let (ax, ay, aw, ah) = (a.position.x, a.position.y, a.size.width as i32, a.size.height as i32);
        let cx = r.x + r.width as i32 / 2;
        let cy = r.y + 20;
        cx >= ax && cx < ax + aw && cy >= ay && cy < ay + ah
    })
}

fn place(app: &AppHandle, panel: &WebviewWindow, settings: &Settings) {
    let Some(m) = cursor_monitor(app) else { return };
    let area = *m.work_area();
    if settings.panel_mode == "edge" {
        let width = (area.size.width / 3).clamp(380, 720).min(area.size.width);
        let _ = panel.set_size(PhysicalSize::new(width, area.size.height));
        let _ = panel.set_position(PhysicalPosition::new(
            area.position.x + area.size.width as i32 - width as i32,
            area.position.y,
        ));
        return;
    }
    if let Some(r) = settings.panel_rect.as_ref().filter(|r| visible_on_screen(app, r)) {
        let _ = panel.set_size(PhysicalSize::new(r.width, r.height));
        let _ = panel.set_position(PhysicalPosition::new(r.x, r.y));
        return;
    }
    // Första gången: 540 × 720 punkter, till höger om mitten och lodrätt centrerat.
    let size: PhysicalSize<u32> = LogicalSize::new(540.0, 720.0).to_physical(m.scale_factor());
    let width = size.width.min(area.size.width);
    let height = size.height.min(area.size.height);
    let x = area.position.x + (area.size.width as i32 * 2 / 3 - width as i32 / 2)
        .clamp(0, area.size.width as i32 - width as i32);
    let y = area.position.y + (area.size.height as i32 - height as i32) / 2;
    let _ = panel.set_size(PhysicalSize::new(width, height));
    let _ = panel.set_position(PhysicalPosition::new(x, y));
}

/// Kom ihåg var det fria fönstret ligger, så att det öppnas där nästa gång.
pub fn remember(app: &AppHandle) {
    let Some(panel) = app.get_webview_window(LABEL) else { return };
    let (Ok(pos), Ok(size)) = (panel.outer_position(), panel.outer_size()) else { return };
    crate::settings::update(app, |s| {
        if s.panel_mode != "edge" {
            s.panel_rect = Some(PanelRect { x: pos.x, y: pos.y, width: size.width, height: size.height });
        }
    });
}

pub fn hide(app: &AppHandle) {
    if let Some(panel) = app.get_webview_window(LABEL) {
        if panel.is_visible().unwrap_or(false) {
            remember(app);
            let _ = panel.hide();
        }
    }
}

pub fn is_active(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL)
        .map(|p| p.is_visible().unwrap_or(false) && p.is_focused().unwrap_or(false))
        .unwrap_or(false)
}

/// Visar panelen. `lookup` är text som var markerad i ett annat program; webbdelen öppnar den om den är ett lagrum.
pub fn show(app: &AppHandle, lookup: Option<String>) {
    let Some(panel) = window(app) else { return };
    if !panel.is_visible().unwrap_or(false) {
        place(app, &panel, &crate::settings::get(app));
    }
    let _ = panel.show();
    let _ = panel.unminimize();
    let _ = panel.set_focus();
    // Sänds till alla fönster; bara panelen lyssnar (desktop.js).
    let _ = app.emit("panel-shown", lookup);
}

/// Byter läge och lägger panelen därefter om den syns.
pub fn set_mode(app: &AppHandle, mode: &str) {
    crate::settings::update(app, |s| s.panel_mode = if mode == "edge" { "edge".into() } else { "float".into() });
    if let Some(panel) = app.get_webview_window(LABEL) {
        if panel.is_visible().unwrap_or(false) {
            place(app, &panel, &crate::settings::get(app));
        }
    }
}
