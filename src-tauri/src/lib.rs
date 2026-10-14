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
mod run_submission;

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

type Prepared = Arc<Mutex<run_submission::PreparedRuns>>;
fn now_millis() -> AccountResult<u64> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| AccountError::new("clock_error", "系统时间异常。"))?
        .as_millis() as u64)
}
#[tauri::command]
async fn prepare_run(
    state: tauri::State<'_, Accounts>,
    prepared: tauri::State<'_, Prepared>,
    account_id: String,
    input: run_generator::RunInput,
) -> AccountResult<run_submission::Preparation> {
    let state = state.inner().clone();
    let prepared = prepared.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let now = now_millis()?;
        let session = state
            .lock()
            .map_err(|_| AccountError::storage())?
            .active_session(&account_id, now / 1000)?;
        let (mut result, ticket) =
            run_submission::prepare(&session, account_id, input, now, "http://tygl.swpu.edu.cn/")?;
        if let Some(ticket) = ticket {
            let mut cache = prepared.lock().map_err(|_| AccountError::storage())?;
            cache
                .tickets
                .retain(|_, t| now.saturating_sub(t.created_at) < 300000);
            if cache.tickets.len() >= 20 {
                return Err(AccountError::new(
                    "too_many_drafts",
                    "待确认草稿过多，请稍后重试。",
                ));
            }
            let id = uuid::Uuid::new_v4().to_string();
            cache.tickets.insert(id.clone(), ticket);
            result.ticket = Some(id);
        }
        Ok(result)
    })
    .await
    .map_err(|_| AccountError::new("internal_error", "学校要求检查未能完成。"))?
}
#[tauri::command]
async fn submit_run(
    state: tauri::State<'_, Accounts>,
    prepared: tauri::State<'_, Prepared>,
    account_id: String,
    ticket: String,
    consent: bool,
) -> AccountResult<run_submission::Receipt> {
    if !consent {
        return Err(AccountError::new(
            "consent_required",
            "请先确认合成来源与明文提交。",
        ));
    }
    let state = state.inner().clone();
    let prepared = prepared.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let now = now_millis()?;
        let draft = prepared
            .lock()
            .map_err(|_| AccountError::storage())?
            .tickets
            .remove(&ticket)
            .ok_or_else(|| {
                AccountError::new("draft_expired", "草稿确认已失效，请重新检查学校要求。")
            })?;
        if draft.account_id != account_id
            || now < draft.created_at
            || now.saturating_sub(draft.created_at) > 300000
        {
            return Err(AccountError::new(
                "draft_expired",
                "账号或草稿已变化，请重新检查。",
            ));
        }
        let (session, receipt) =
            state
                .lock()
                .map_err(|_| AccountError::storage())?
                .reserve(&account_id, &draft, now)?;
        let receipt =
            run_submission::send(&session, &draft, &receipt, now, "http://tygl.swpu.edu.cn/");
        state
            .lock()
            .map_err(|_| AccountError::storage())?
            .finish_submission(receipt.clone(), now)?;
        Ok(receipt)
    })
    .await
    .map_err(|_| {
        AccountError::new(
            "submission_unknown",
            "提交结果不确定，请先核对记录，勿重传。",
        )
    })?
}
#[tauri::command]
async fn submission_history(
    state: tauri::State<'_, Accounts>,
    account_id: String,
) -> AccountResult<Vec<run_submission::Receipt>> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state
            .lock()
            .map_err(|_| AccountError::storage())?
            .receipts(&account_id, now_millis()? / 1000)
    })
    .await
    .map_err(|_| AccountError::storage())?
}
#[tauri::command]
async fn link_submission(
    state: tauri::State<'_, Accounts>,
    account_id: String,
    attempt_id: String,
    record_id: String,
) -> AccountResult<run_submission::Receipt> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let now = now_millis()?;
        let (session, mut receipt) = {
            let mut manager = state.lock().map_err(|_| AccountError::storage())?;
            let receipt = manager
                .receipts(&account_id, now / 1000)?
                .into_iter()
                .find(|r| r.id == attempt_id)
                .ok_or_else(AccountError::invalid)?;
            (manager.active_session(&account_id, now / 1000)?, receipt)
        };
        let data = exercise_service::ExerciseClient {
            origin: "http://tygl.swpu.edu.cn/",
        }
        .read(
            &session,
            &exercise_service::ExerciseQuery::Detail {
                id: record_id.clone(),
            },
            now,
        )
        .map_err(|e| AccountError::new(e.code, e.message))?;
        if data["identify"].as_str() != Some(&receipt.identify) {
            return Err(AccountError::new(
                "identity_unconfirmed",
                "详情未返回匹配的运动关联标识，无法可靠关联；仍保留原状态。",
            ));
        }
        receipt.record_id = Some(record_id);
        receipt.state = "accepted".into();
        receipt.message = "已通过详情关联标识核对入库，合格与统计仍需分别核对。".into();
        state
            .lock()
            .map_err(|_| AccountError::storage())?
            .finish_submission(receipt.clone(), now)?;
        Ok(receipt)
    })
    .await
    .map_err(|_| AccountError::storage())?
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
            app.manage(Arc::new(
                Mutex::new(run_submission::PreparedRuns::default()),
            ));
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
            prepare_run,
            submit_run,
            submission_history,
            link_submission,
            preview_run,
            read_exercise
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("应用启动失败：{error}");
        std::process::exit(1);
    }
}
