// Inställningar som bara gäller Windows-skalet; appens egna inställningar ligger i webbdelen.
// Sparas i desktop.json i appens konfigurationsmapp (%APPDATA%\se.lagbok.desktop).

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub const DEFAULT_SHORTCUT: &str = "ctrl+alt+l";

#[derive(Serialize, Deserialize, Clone, Copy)]
pub struct PanelRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Krysset gömmer appen vid klockan i stället för att avsluta den.
    pub close_to_tray: bool,
    /// Kortkommandot för snabbpanelen, t.ex. "ctrl+alt+l".
    pub shortcut: String,
    /// "float" (fritt fönster) eller "edge" (längs högerkanten).
    pub panel_mode: String,
    /// Markerad text i andra program slås upp när kortkommandot trycks.
    pub lookup_selection: bool,
    /// Var det fria panelfönstret låg senast (skärmpunkter).
    pub panel_rect: Option<PanelRect>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            shortcut: DEFAULT_SHORTCUT.into(),
            panel_mode: "float".into(),
            lookup_selection: true,
            panel_rect: None,
        }
    }
}

pub struct SettingsState(pub Mutex<Settings>);

fn path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("desktop.json"))
}

pub fn load(app: &AppHandle) -> Settings {
    path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn get(app: &AppHandle) -> Settings {
    app.try_state::<SettingsState>()
        .map(|s| s.0.lock().unwrap().clone())
        .unwrap_or_default()
}

/// Ändrar inställningarna och sparar dem direkt.
pub fn update(app: &AppHandle, change: impl FnOnce(&mut Settings)) {
    let Some(state) = app.try_state::<SettingsState>() else { return };
    let mut settings = state.0.lock().unwrap();
    change(&mut settings);
    if let Some(p) = path(app) {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(p, serde_json::to_string_pretty(&*settings).unwrap_or_default());
    }
}

/// "ctrl+alt+l" → "Ctrl + Alt + L", som det visas i appen.
pub fn shortcut_label(shortcut: &str) -> String {
    shortcut
        .split('+')
        .map(|part| match part.trim().to_ascii_lowercase().as_str() {
            "ctrl" | "control" => "Ctrl".to_string(),
            "alt" | "option" => "Alt".to_string(),
            "shift" => "Shift".to_string(),
            "super" | "meta" | "cmd" | "command" => "Win".to_string(),
            "space" => "Mellanslag".to_string(),
            other => {
                let other = other.strip_prefix("key").or_else(|| other.strip_prefix("digit")).unwrap_or(other);
                let mut c = other.chars();
                c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
            }
        })
        .collect::<Vec<_>>()
        .join(" + ")
}
