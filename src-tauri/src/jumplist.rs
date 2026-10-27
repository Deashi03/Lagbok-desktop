// Hopplistan: högerklick på Lagbok Desktop i aktivitetsfältet visar favoriter och senast lästa lagrum.
// Varje rad startar appen med en Lagbok-länk (lagbok://go/…), som den redan öppna appen tar emot.

use serde::Deserialize;

#[derive(Deserialize, Clone)]
#[cfg_attr(not(windows), allow(dead_code))]
pub struct Item {
    pub title: String,
    pub url: String,
}

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
            let list: ICustomDestinationList = CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
            let mut slots = 0u32;
            let _removed: IObjectArray = list.BeginList(&mut slots)?;
            for (name, items) in [("Favoriter", favourites), ("Senast lästa", recents)] {
                if items.is_empty() {
                    continue;
                }
                let collection: IObjectCollection =
                    CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
                for item in items.iter().take(8) {
                    let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
                    link.SetPath(&exe)?;
                    link.SetArguments(&HSTRING::from(format!("\"{}\"", item.url.replace('"', ""))))?;
                    link.SetIconLocation(&exe, 0)?;
                    link.SetDescription(&HSTRING::from(item.title.as_str()))?;
                    let store: IPropertyStore = link.cast()?;
                    // Raden i listan visar titeln (PKEY_Title), en sträng som Windows själv frigör med PropVariantClear.
                    let mut value = PROPVARIANT::default();
                    {
                        let inner = &mut *value.Anonymous.Anonymous;
                        inner.vt = VT_LPWSTR;
                        inner.Anonymous.pwszVal = SHStrDupW(&HSTRING::from(item.title.as_str()))?;
                    }
                    let stored = store.SetValue(&PKEY_Title, &value).and_then(|_| store.Commit());
                    let _ = PropVariantClear(&mut value);
                    stored?;
                    collection.AddObject(&link)?;
                }
                let array: IObjectArray = collection.cast()?;
                list.AppendCategory(&HSTRING::from(name), &array)?;
            }
            list.CommitList()
        })();
        CoUninitialize();
        result.map_err(|e| e.to_string())
    }
}
