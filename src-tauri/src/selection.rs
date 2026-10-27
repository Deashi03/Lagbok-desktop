// Slå upp markerad text: när kortkommandot trycks i ett annat program kopieras det som är markerat där
// (Ctrl + C), läses från urklipp och läggs tillbaka som det var. Panelen öppnar sedan lagrummet om texten är
// en hänvisning som "20 kap. 1 § brottsbalken" eller "RB 23:4".
//
// Kopieringen görs inte i terminaler, där Ctrl + C avbryter det som körs.

#[cfg(not(windows))]
pub fn copy_selection() -> Option<String> {
    None
}

#[cfg(windows)]
pub fn copy_selection() -> Option<String> {
    use std::time::{Duration, Instant};
    use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        VIRTUAL_KEY, VK_C, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
    };

    if !foreground_allows_copy() {
        return None;
    }
    unsafe {
        // Vänta tills kortkommandots tangenter är släppta, annars blir Ctrl + C till Ctrl + Alt + C.
        let held = |vk: VIRTUAL_KEY| GetAsyncKeyState(vk.0 as i32) as u16 & 0x8000 != 0;
        let start = Instant::now();
        while start.elapsed() < Duration::from_millis(800)
            && [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN].into_iter().any(held)
        {
            std::thread::sleep(Duration::from_millis(10));
        }

        let mut clipboard = arboard::Clipboard::new().ok()?;
        let previous_text = clipboard.get_text().ok();
        let previous_image = if previous_text.is_none() { clipboard.get_image().ok() } else { None };
        let before = GetClipboardSequenceNumber();

        let key = |vk: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
        };
        let inputs = [
            key(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
            key(VK_C, KEYBD_EVENT_FLAGS(0)),
            key(VK_C, KEYEVENTF_KEYUP),
            key(VK_CONTROL, KEYEVENTF_KEYUP),
        ];
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);

        // Programmet lägger texten i urklipp strax efteråt; inget nytt i urklipp betyder att inget var markerat.
        let start = Instant::now();
        while GetClipboardSequenceNumber() == before && start.elapsed() < Duration::from_millis(300) {
            std::thread::sleep(Duration::from_millis(10));
        }
        if GetClipboardSequenceNumber() == before {
            return None;
        }
        std::thread::sleep(Duration::from_millis(20));
        let copied = clipboard.get_text().ok();

        // Urklipp tillbaka som det var före kortkommandot.
        match (previous_text, previous_image) {
            (Some(text), _) => {
                let _ = clipboard.set_text(text);
            }
            (None, Some(image)) => {
                let _ = clipboard.set_image(image);
            }
            _ => {
                let _ = clipboard.clear();
            }
        }

        copied
            .map(|t| t.split_whitespace().collect::<Vec<_>>().join(" "))
            .filter(|t| !t.is_empty() && t.chars().count() <= 200)
    }
}

/// Ctrl + C skickas inte till terminaler (där avbryter det) eller till Lagbok Desktop självt.
#[cfg(windows)]
fn foreground_allows_copy() -> bool {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    const SKIP: [&str; 14] = [
        "windowsterminal.exe", "wt.exe", "cmd.exe", "powershell.exe", "pwsh.exe", "conhost.exe", "openconsole.exe",
        "putty.exe", "mintty.exe", "alacritty.exe", "wezterm-gui.exe", "code.exe", "lagbok-desktop.exe",
        "lagbok desktop.exe",
    ];
    unsafe {
        let window = GetForegroundWindow();
        if window.0.is_null() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(window, Some(&mut pid));
        if pid == std::process::id() {
            return false;
        }
        let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return true;
        };
        let mut buffer = [0u16; 1024];
        let mut length = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buffer.as_mut_ptr()), &mut length).is_ok();
        let _ = CloseHandle(process);
        if !ok {
            return true;
        }
        let path = String::from_utf16_lossy(&buffer[..length as usize]).to_lowercase();
        let name = path.rsplit('\\').next().unwrap_or("");
        !SKIP.contains(&name)
    }
}
