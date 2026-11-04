use super::Accounts;
use crate::exercise;
use std::time::{SystemTime, UNIX_EPOCH};
fn current_timestamp() -> exercise::service::ExerciseResult<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|_| exercise::service::ExerciseError {
            code: "clock_error",
            message: "系统时间异常。",
            http_status: None,
            business_code: None,
        })
}
#[tauri::command]
pub(crate) async fn read_exercise(
    state: tauri::State<'_, Accounts>,
    account_id: String,
    query: exercise::service::ExerciseQuery,
) -> exercise::service::ExerciseResult<exercise::service::ExerciseResponse> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        query.validate()?;
        let timestamp = current_timestamp()?;
        let session = {
            let mut manager = state.lock().map_err(|_| exercise::service::ExerciseError {
                code: "storage_unavailable",
                message: "账号状态不可用。",
                http_status: None,
                business_code: None,
            })?;
            manager
                .active_session(&account_id, timestamp / 1000)
                .map_err(|error| exercise::service::ExerciseError {
                    code: error.code,
                    message: error.message,
                    http_status: None,
                    business_code: None,
                })?
        };
        let timestamp = current_timestamp()?;
        let client = exercise::service::ExerciseClient {
            origin: "http://tygl.swpu.edu.cn/",
        };
        let data = match client.read(&session, &query, timestamp) {
            Err(error) if error.code == "access_rejected" => {
                let mut manager = state.lock().map_err(|_| exercise::service::ExerciseError {
                    code: "storage_unavailable",
                    message: "账号状态不可用。",
                    http_status: None,
                    business_code: None,
                })?;
                let current = manager
                    .active_session(&account_id, timestamp / 1000)
                    .and_then(|current| {
                        if current.access_token != session.access_token {
                            Ok(current)
                        } else {
                            manager.ensure_session(&account_id, timestamp / 1000, true)
                        }
                    })
                    .map_err(|error| exercise::service::ExerciseError {
                        code: error.code,
                        message: error.message,
                        http_status: None,
                        business_code: None,
                    })?;
                drop(manager);
                client.read(&current, &query, current_timestamp()?)?
            }
            result => result?,
        };
        Ok(exercise::service::ExerciseResponse {
            account_id,
            fetched_at: timestamp,
            data,
        })
    })
    .await
    .map_err(|_| exercise::service::ExerciseError {
        code: "internal_error",
        message: "数据读取未能完成，请重试。",
        http_status: None,
        business_code: None,
    })?
}
