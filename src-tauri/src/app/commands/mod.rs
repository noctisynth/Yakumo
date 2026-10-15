use crate::accounts::AccountManager;
use crate::accounts::error::{AccountError, AccountResult};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
pub(crate) mod accounts;
pub(crate) mod avatar;
pub(crate) mod exercise;
pub(crate) mod platform;
pub(crate) mod studio;
pub(crate) mod submission;

pub(crate) type Accounts = Arc<Mutex<AccountManager>>;
pub(crate) type Prepared = Arc<Mutex<crate::studio::submission::PreparedRuns>>;
pub(crate) fn now_millis() -> AccountResult<u64> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| AccountError::new("clock_error", "系统时间异常。"))?
        .as_millis() as u64)
}
#[derive(Serialize)]
pub(crate) struct ApplicationInfo {
    name: &'static str,
    version: String,
}

#[tauri::command]
pub(crate) fn get_application_info(app: tauri::AppHandle) -> ApplicationInfo {
    ApplicationInfo {
        name: "八云爱",
        version: app.package_info().version.to_string(),
    }
}
