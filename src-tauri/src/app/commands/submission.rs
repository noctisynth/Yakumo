use super::{Accounts, Prepared, now_millis};
use crate::accounts::error::{AccountError, AccountResult};
use crate::{exercise, studio};
#[tauri::command]
pub(crate) async fn prepare_run(
    state: tauri::State<'_, Accounts>,
    prepared: tauri::State<'_, Prepared>,
    account_id: String,
    input: studio::generator::RunInput,
) -> AccountResult<studio::submission::Preparation> {
    let state = state.inner().clone();
    let prepared = prepared.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let now = now_millis()?;
        let session = state
            .lock()
            .map_err(|_| AccountError::storage())?
            .active_session(&account_id, now / 1000)?;
        let (mut result, ticket) = studio::submission::prepare(
            &session,
            account_id,
            input,
            now,
            "http://tygl.swpu.edu.cn/",
        )?;
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
pub(crate) async fn submit_run(
    state: tauri::State<'_, Accounts>,
    prepared: tauri::State<'_, Prepared>,
    account_id: String,
    ticket: String,
    consent: bool,
) -> AccountResult<studio::submission::Receipt> {
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
        studio::validation::validate(&draft.payload, now)?;
        let (session, receipt) =
            state
                .lock()
                .map_err(|_| AccountError::storage())?
                .reserve(&account_id, &draft, now)?;
        let receipt =
            studio::submission::send(&session, &draft, &receipt, now, "http://tygl.swpu.edu.cn/");
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
pub(crate) async fn submission_history(
    state: tauri::State<'_, Accounts>,
    account_id: String,
) -> AccountResult<Vec<studio::submission::Receipt>> {
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
pub(crate) async fn link_submission(
    state: tauri::State<'_, Accounts>,
    account_id: String,
    attempt_id: String,
    record_id: String,
) -> AccountResult<studio::submission::Receipt> {
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
        let data = exercise::service::ExerciseClient {
            origin: "http://tygl.swpu.edu.cn/",
        }
        .read(
            &session,
            &exercise::service::ExerciseQuery::Detail {
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
