use crate::{
    accounts::error::{AccountError, AccountResult},
    accounts::protocol::{Session, headers},
};
use std::{io::Read, time::Duration};
const H5_APP_ID: &str = "c9292ee89d2f49492f983f5931af0d09";
fn failed() -> AccountError {
    AccountError::new("avatar_upload_failed", "头像未能保存，请稍后重试。")
}
fn uncertain() -> AccountError {
    AccountError::new(
        "avatar_upload_unknown",
        "未收到明确结果，请先刷新资料确认后再决定是否重试。",
    )
}

pub(crate) fn h5_signature(
    session: &Session,
    timestamp: &str,
    data_uri: &str,
) -> AccountResult<String> {
    let fingerprint = |bytes: &[u8]| {
        crate::exercise::protocol::sign::fingerprint(bytes, &session.access_token)
            .map_err(|_| failed())
    };
    let app = fingerprint(format!("{H5_APP_ID}{}{timestamp}", session.access_token).as_bytes())?;
    let secret = fingerprint(format!("{}{timestamp}", session.access_token).as_bytes())?;
    let mut fragments = [
        format!("bas64Pic={data_uri}"),
        format!("appId={app}"),
        format!("appSecret={secret}"),
    ];
    fragments.sort();
    // H5 signs the original values. In particular, '+' in Base64 is not a space.
    fingerprint(fragments.join("&").as_bytes())
}

pub fn upload(origin: &str, session: &Session, now: u64, data_uri: &str) -> AccountResult<()> {
    if session.expires_at <= now {
        return Err(AccountError::new(
            "session_expired",
            "登录已过期，请重新登录。",
        ));
    }
    if !matches!(
        data_uri.split_once(',').map(|(prefix, _)| prefix),
        Some("data:image/png;base64" | "data:image/jpeg;base64")
    ) || !crate::avatars::reader::valid_cached_avatar(data_uri)
    {
        return Err(AccountError::new(
            "invalid_avatar",
            "请选择不超过 2 MiB 的 PNG 或 JPEG 图片。",
        ));
    }
    let timestamp = now.checked_mul(1000).ok_or_else(failed)?.to_string();
    let sign = h5_signature(session, &timestamp, data_uri)?;
    let response = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .no_proxy()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| failed())?
        .post(format!("{origin}upms/basUserImage/uploadBase64Pic"))
        .headers(headers(&session.device_id, false)?)
        .bearer_auth(&session.access_token)
        .header("timestamp", timestamp)
        .header("sign", sign)
        .form(&[("bas64Pic", data_uri)])
        .send()
        .map_err(|_| uncertain())?;
    if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
        return Err(AccountError::new(
            "session_expired",
            "会话已失效，请重新登录。",
        ));
    }
    if !response.status().is_success() {
        return Err(failed());
    }
    let mut bytes = Vec::new();
    response
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| uncertain())?;
    if bytes.len() > 1024 * 1024 {
        return Err(uncertain());
    }
    let result: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| uncertain())?;
    if result["code"] != 0 && result["code"] != "0" {
        return Err(failed());
    }
    if !result["data"]["imageRoute"]
        .as_str()
        .is_some_and(|s| !s.is_empty())
    {
        return Err(uncertain());
    }
    Ok(())
}
