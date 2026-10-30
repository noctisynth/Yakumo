use crate::accounts::error::{AccountError, AccountResult};
#[cfg(target_os = "android")]
use crate::storage;
use crate::studio;
#[tauri::command]
pub(crate) async fn sync_mobile_appearance(
    app: tauri::AppHandle,
    dark: bool,
) -> AccountResult<Option<serde_json::Value>> {
    #[cfg(target_os = "android")]
    return tauri::async_runtime::spawn_blocking(move || {
        storage::mobile::appearance(&app, dark).map(Some)
    })
    .await
    .map_err(|_| AccountError::storage())?;
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, dark);
        Ok(None)
    }
}

#[tauri::command]
pub(crate) fn mobile_platform() -> bool {
    cfg!(target_os = "android")
}
#[tauri::command]
pub(crate) async fn export_mobile_preview(
    app: tauri::AppHandle,
    input: studio::generator::RunInput,
) -> AccountResult<serde_json::Value> {
    #[cfg(target_os = "android")]
    return tauri::async_runtime::spawn_blocking(move || {
        storage::mobile::export(&app, input)
            .and_then(|r| serde_json::to_value(r).map_err(|_| AccountError::storage()))
    })
    .await
    .map_err(|_| AccountError::storage())?;
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, input);
        Err(AccountError::new(
            "unsupported_platform",
            "请在 Android 应用中保存预览。",
        ))
    }
}
