use super::Accounts;
use crate::accounts::error::{AccountError, AccountResult};
use crate::accounts::{AccountManager, AccountSnapshot, LoginInput};
use std::time::{SystemTime, UNIX_EPOCH};
async fn with_accounts(
    state: tauri::State<'_, Accounts>,
    action: impl FnOnce(&mut AccountManager, u64) -> AccountResult<AccountSnapshot> + Send + 'static,
) -> AccountResult<AccountSnapshot> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut manager = state.lock().map_err(|_| AccountError::storage())?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| AccountError::new("clock_error", "系统时间异常，请检查时间设置。"))?
            .as_secs();
        action(&mut manager, now)
    })
    .await
    .map_err(|_| AccountError::new("internal_error", "账号操作未能完成，请重试。"))?
}

#[tauri::command]
pub(crate) async fn list_accounts(
    state: tauri::State<'_, Accounts>,
) -> AccountResult<AccountSnapshot> {
    with_accounts(state, |manager, now| manager.list(now)).await
}

#[tauri::command]
pub(crate) async fn login_account(
    state: tauri::State<'_, Accounts>,
    input: LoginInput,
) -> AccountResult<AccountSnapshot> {
    with_accounts(state, move |manager, now| manager.login(input, now)).await
}

#[tauri::command]
pub(crate) async fn switch_account(
    state: tauri::State<'_, Accounts>,
    id: String,
) -> AccountResult<AccountSnapshot> {
    with_accounts(state, move |manager, now| manager.switch(&id, now)).await
}

#[tauri::command]
pub(crate) async fn remove_account(
    state: tauri::State<'_, Accounts>,
    id: String,
) -> AccountResult<AccountSnapshot> {
    with_accounts(state, move |manager, now| manager.remove(&id, now)).await
}
