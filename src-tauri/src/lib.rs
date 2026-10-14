use serde::Serialize;
use std::{
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

mod account_avatar;
mod account_error;
mod account_protocol;
mod account_vault;
mod accounts;
pub mod exercise_protocol;

use account_error::{AccountError, AccountResult};
use accounts::{AccountManager, AccountSnapshot, LoginInput};

type Accounts = Arc<Mutex<AccountManager>>;

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
async fn list_accounts(state: tauri::State<'_, Accounts>) -> AccountResult<AccountSnapshot> {
    with_accounts(state, |manager, now| manager.list(now)).await
}

#[tauri::command]
async fn login_account(
    state: tauri::State<'_, Accounts>,
    input: LoginInput,
) -> AccountResult<AccountSnapshot> {
    with_accounts(state, move |manager, now| manager.login(input, now)).await
}

#[tauri::command]
async fn switch_account(
    state: tauri::State<'_, Accounts>,
    id: String,
) -> AccountResult<AccountSnapshot> {
    with_accounts(state, move |manager, now| manager.switch(&id, now)).await
}

#[tauri::command]
async fn remove_account(
    state: tauri::State<'_, Accounts>,
    id: String,
) -> AccountResult<AccountSnapshot> {
    with_accounts(state, move |manager, now| manager.remove(&id, now)).await
}

#[derive(Serialize)]
struct ApplicationInfo {
    name: &'static str,
    version: String,
}

#[tauri::command]
fn get_application_info(app: tauri::AppHandle) -> ApplicationInfo {
    ApplicationInfo {
        name: "八云爱",
        version: app.package_info().version.to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(error) = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .setup(|app| {
            let directory = app.path().app_local_data_dir()?;
            app.manage(Arc::new(Mutex::new(AccountManager::new(
                Box::new(account_vault::EncryptedVault::new(directory)),
                Box::new(account_protocol::SchoolAuthentication),
            ))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_application_info,
            list_accounts,
            login_account,
            switch_account,
            remove_account
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("应用启动失败：{error}");
        std::process::exit(1);
    }
}
