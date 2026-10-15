use crate::{
    accounts::AccountSnapshot,
    accounts::error::{AccountError, AccountResult},
    app::commands::Accounts,
};

async fn update(
    state: tauri::State<'_, Accounts>,
    account_id: String,
    data_uri: Option<String>,
) -> AccountResult<AccountSnapshot> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let now = crate::app::commands::now_millis()? / 1000;
        let session = state
            .lock()
            .map_err(|_| AccountError::storage())?
            .active_session(&account_id, now)?;
        let uploaded = data_uri.is_some();
        if let Some(data_uri) = data_uri {
            let data_uri = zeroize::Zeroizing::new(data_uri);
            crate::avatars::upload::upload("http://tygl.swpu.edu.cn/", &session, now, &data_uri)?;
        }
        let identity = crate::avatars::reader::AvatarReader::new("http://tygl.swpu.edu.cn/")
            .read_identity(&session, now)
            .map_err(|e| {
                if uploaded {
                    AccountError::new(
                        "avatar_refresh_failed",
                        "头像已保存，但暂未读取到新头像，请点击刷新资料确认。",
                    )
                } else {
                    e
                }
            })?;
        if uploaded && identity.avatar.is_err() {
            return Err(AccountError::new(
                "avatar_refresh_failed",
                "头像已保存，但图片暂时无法读取，请刷新资料确认。",
            ));
        }
        state
            .lock()
            .map_err(|_| AccountError::storage())?
            .apply_identity(&account_id, &session, identity, now)
    })
    .await
    .map_err(|_| AccountError::new("avatar_unavailable", "头像操作未能完成，请稍后重试。"))?
}

#[tauri::command]
pub async fn refresh_account_identity(
    state: tauri::State<'_, Accounts>,
    account_id: String,
) -> AccountResult<AccountSnapshot> {
    update(state, account_id, None).await
}
#[tauri::command]
pub async fn update_account_avatar(
    state: tauri::State<'_, Accounts>,
    account_id: String,
    data_uri: String,
) -> AccountResult<AccountSnapshot> {
    update(state, account_id, Some(data_uri)).await
}
