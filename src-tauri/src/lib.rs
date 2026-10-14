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
mod exercise_service;
mod run_generator;

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

#[tauri::command]
async fn read_exercise(
    state: tauri::State<'_, Accounts>,
    account_id: String,
    query: exercise_service::ExerciseQuery,
) -> exercise_service::ExerciseResult<exercise_service::ExerciseResponse> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        query.validate()?;
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| exercise_service::ExerciseError {
                code: "clock_error",
                message: "系统时间异常。",
                http_status: None,
                business_code: None,
            })?
            .as_millis() as u64;
        let session = {
            let mut manager = state.lock().map_err(|_| exercise_service::ExerciseError {
                code: "storage_unavailable",
                message: "账号状态不可用。",
                http_status: None,
                business_code: None,
            })?;
            manager
                .active_session(&account_id, timestamp / 1000)
                .map_err(|error| exercise_service::ExerciseError {
                    code: error.code,
                    message: error.message,
                    http_status: None,
                    business_code: None,
                })?
        };
        let data = exercise_service::ExerciseClient {
            origin: "http://tygl.swpu.edu.cn/",
        }
        .read(&session, &query, timestamp)?;
        Ok(exercise_service::ExerciseResponse {
            account_id,
            fetched_at: timestamp,
            data,
        })
    })
    .await
    .map_err(|_| exercise_service::ExerciseError {
        code: "internal_error",
        message: "数据读取未能完成，请重试。",
        http_status: None,
        business_code: None,
    })?
}

#[tauri::command]
async fn preview_run(input: run_generator::RunInput) -> AccountResult<run_generator::RunPreview> {
    tauri::async_runtime::spawn_blocking(move || run_generator::generate(input))
        .await
        .map_err(|_| AccountError::new("internal_error", "生成未能完成。"))?
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
            remove_account,
            preview_run,
            read_exercise
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("应用启动失败：{error}");
        std::process::exit(1);
    }
}
