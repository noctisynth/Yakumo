use super::Accounts;
use crate::accounts::error::{AccountError, AccountResult};
use crate::studio;
use std::time::{SystemTime, UNIX_EPOCH};
#[tauri::command]
pub(crate) async fn studio_presets(
    state: tauri::State<'_, Accounts>,
    account_id: String,
    action: studio::presets::PresetAction,
) -> AccountResult<Vec<studio::presets::StudioPreset>> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| AccountError::new("clock_error", "系统时间异常。"))?
            .as_secs();
        state
            .lock()
            .map_err(|_| AccountError::storage())?
            .studio_presets(&account_id, action, now)
    })
    .await
    .map_err(|_| AccountError::new("internal_error", "预设操作未能完成，请重试。"))?
}

#[tauri::command]
pub(crate) async fn preview_run(
    input: studio::generator::RunInput,
) -> AccountResult<studio::generator::RunPreview> {
    tauri::async_runtime::spawn_blocking(move || studio::generator::generate(input))
        .await
        .map_err(|_| AccountError::new("internal_error", "生成未能完成。"))?
}
