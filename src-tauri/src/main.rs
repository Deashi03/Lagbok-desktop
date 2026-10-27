// Inget konsolfönster bakom appen i Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lagbok_desktop_lib::run()
}
