// Hopplistan: högerklick på Lagbok Desktop i aktivitetsfältet visar snabbpanelen, favoriterna och de senast
// lästa lagrummen. Varje rad startar appen med en Lagbok-länk (lagbok://go/…), som den redan öppna appen tar emot.
//
// Listan hör till appens id (APP_ID), samma som installationen ger genvägarna i Start-menyn. Favoriterna ligger
// bland uppgifterna, som alltid syns; "Senast lästa" döljs av Windows om man har stängt av senast öppnade objekt.

use serde::Deserialize;

/// Appens id i Windows (AppUserModelID): samma som "identifier" i tauri.conf.json.
#[cfg_attr(not(windows), allow(dead_code))]
pub const APP_ID: &str = "se.lagbok.desktop";

#[derive(Deserialize, Clone)]
#[cfg_attr(not(windows), allow(dead_code))]
pub struct Item {
    pub title: String,
    pub url: String,
}

/// Talar om för Windows att fönstren hör till appens id, så att aktivitetsfältet visar rätt hopplista.
#[cfg(windows)]
pub fn set_app_id() {
    use windows::core::HSTRING;
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(APP_ID));
    }
}

#[cfg(not(windows))]
pub fn set_app_id() {}

#[cfg(not(windows))]
pub fn set(_favourites: &[Item], _recents: &[Item]) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub fn set(favourites: &[Item], recents: &[Item]) -> Result<(), String> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::Storage::EnhancedStorage::PKEY_Title;
    use windows::Win32::System::Com::StructuredStorage::{PropVariantClear, PROPVARIANT};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::Variant::VT_LPWSTR;
    use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
    use windows::Win32::UI::Shell::{
        DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, SHStrDupW, ShellLink,
    };

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe = HSTRING::from(exe.as_os_str());
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let result = (|| -> windows::core::Result<()> {
            let link = |title: &str, url: &str| -> windows::core::Result<IShellLinkW> {
                let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
                link.SetPath(&exe)?;
                link.SetArguments(&HSTRING::from(format!("\"{}\"", url.replace('"', ""))))?;
                link.SetIconLocation(&exe, 0)?;
                link.SetDescription(&HSTRING::from(title))?;
                // Raden i listan visar titeln (PKEY_Title), en sträng som frigörs med PropVariantClear.
                let store: IPropertyStore = link.cast()?;
                let mut value = PROPVARIANT::default();
                {
                    let inner = &mut *value.Anonymous.Anonymous;
                    inner.vt = VT_LPWSTR;
                    inner.Anonymous.pwszVal = SHStrDupW(&HSTRING::from(title))?;
                }
                let stored = store.SetValue(&PKEY_Title, &value).and_then(|_| store.Commit());
                let _ = PropVariantClear(&mut value);
                stored?;
                Ok(link)
            };
            let collection = |items: &[(String, String)]| -> windows::core::Result<IObjectArray> {
                let collection: IObjectCollection =
                    CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
                for (title, url) in items {
                    collection.AddObject(&link(title, url)?)?;
                }
                collection.cast()
            };

            let list: ICustomDestinationList = CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
            list.SetAppID(&HSTRING::from(APP_ID))?;
            let mut slots = 0u32;
            let _removed: IObjectArray = list.BeginList(&mut slots)?;
            if !recents.is_empty() {
                let items: Vec<_> = recents.iter().take(8).map(|i| (i.title.clone(), i.url.clone())).collect();
                // Misslyckas om Windows döljer senast öppnade objekt; resten av listan visas ändå.
                let _ = list.AppendCategory(&HSTRING::from("Senast lästa"), &collection(&items)?);
            }
            let mut tasks = vec![("Öppna snabbpanelen".to_string(), "lagbok://panel".to_string())];
            tasks.extend(favourites.iter().take(8).map(|i| (format!("★ {}", i.title), i.url.clone())));
            list.AddUserTasks(&collection(&tasks)?)?;
            list.CommitList()
        })();
        CoUninitialize();
        result.map_err(|e| e.to_string())
    }
}
