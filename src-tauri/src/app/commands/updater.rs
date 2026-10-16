use serde::Serialize;
use tauri::{Manager, ResourceId};

#[derive(Debug, Serialize)]
pub(crate) struct UpdateError {
    code: &'static str,
    message: &'static str,
}

fn error(code: &'static str, message: &'static str) -> UpdateError {
    UpdateError { code, message }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateStatus {
    supported: bool,
    configured: bool,
    version: String,
    platform: &'static str,
}

#[tauri::command]
pub(crate) fn update_status(app: tauri::AppHandle) -> UpdateStatus {
    UpdateStatus {
        supported: !cfg!(target_os = "ios"),
        configured: !public_key().is_empty(),
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS,
    }
}

pub(crate) fn public_key() -> &'static str {
    option_env!("YAKUMO_UPDATER_PUBLIC_KEY")
        .unwrap_or("")
        .trim()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateMetadata {
    rid: ResourceId,
    current_version: String,
    version: String,
    body: Option<String>,
    raw_json: serde_json::Value,
}

#[cfg(not(target_os = "ios"))]
fn plugin_error(value: tauri_plugin_updater::Error) -> UpdateError {
    use tauri_plugin_updater::Error;
    match value {
        Error::Cancelled => error("cancelled", "下载已取消，请重新检查更新。"),
        Error::Minisign(_)
        | Error::Base64(_)
        | Error::SignatureUtf8(_)
        | Error::SignedVersionMismatch { .. }
        | Error::MissingSignedVersion => error(
            "verification",
            "更新签名或版本校验失败。已停止更新，请联系维护者。",
        ),
        Error::TargetNotFound(_) | Error::TargetsNotFound(_) => {
            error("platform", "此版本尚未提供当前平台的更新包，请稍后重试。")
        }
        _ => error("network", "暂时无法获取更新。请检查网络后重试。"),
    }
}

#[cfg(not(target_os = "ios"))]
fn validate_manifest(value: &serde_json::Value, version: &str) -> Result<(), UpdateError> {
    use base64::Engine;
    if version.split('.').count() != 3
        || version.split('.').any(|part| part.parse::<u64>().is_err())
    {
        return Err(error("manifest", "此更新通道仅接受正式版本。"));
    }
    let platforms = value
        .get("platforms")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| error("manifest", "更新清单格式不正确，请联系维护者。"))?;
    if platforms.is_empty() {
        return Err(error("manifest", "更新清单缺少平台。"));
    }
    for (platform, entry) in platforms {
        let url = entry
            .get("url")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| error("manifest", "更新清单缺少下载地址。"))?;
        validate_artifact_url(url, version)?;
        let suffix = match platform.as_str() {
            "windows-x86_64" => "windows-x64.exe",
            "linux-x86_64-appimage" => "linux-x64.AppImage",
            "linux-x86_64-deb" => "linux-x64.deb",
            "darwin-aarch64" => "macos-arm64.app.tar.gz",
            "darwin-x86_64" => "macos-x64.app.tar.gz",
            "android-aarch64" | "android-x86_64" => "android-universal.apk",
            _ => return Err(error("platform", "更新清单包含不支持的平台。")),
        };
        if !url.ends_with(&format!("/Yakumo-{version}-{suffix}")) {
            return Err(error("platform", "安装包与目标平台不匹配。"));
        }
        let encoded = entry
            .get("signature")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| error("verification", "更新签名缺失。"))?;
        let signature = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
            .and_then(|text| minisign_verify::Signature::decode(&text).ok())
            .ok_or_else(|| error("verification", "更新签名格式错误。"))?;
        // This is a rejection filter only. The fork must subsequently verify the
        // artifact AND the global signature that authenticates this trusted comment.
        let filename = format!("Yakumo-{version}-{suffix}");
        if signature
            .trusted_comment()
            .split('\t')
            .find_map(|part| part.strip_prefix("file:"))
            != Some(filename.as_str())
        {
            return Err(error("verification", "更新签名与平台文件名不匹配。"));
        }
        if let Some(mirrors) = entry.get("mirrors") {
            let mirrors = mirrors
                .as_array()
                .ok_or_else(|| error("manifest", "镜像列表格式错误。"))?;
            for mirror in mirrors {
                validate_artifact_url(mirror.as_str().unwrap_or(""), version)?;
                if mirror.as_str() != Some(url) {
                    return Err(error("manifest", "安装包镜像必须指向相同平台产物。"));
                }
            }
        }
    }
    Ok(())
}

#[cfg(not(target_os = "ios"))]
fn validate_artifact_url(value: &str, version: &str) -> Result<(), UpdateError> {
    let parsed = url::Url::parse(value).map_err(|_| error("manifest", "更新下载地址无效。"))?;
    let prefix = format!("/noctisynth/Yakumo/releases/download/yakumo-v{version}/");
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("github.com")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || !parsed.path().starts_with(&prefix)
        || !parsed.path()[prefix.len()..].starts_with(&format!("Yakumo-{version}-"))
        || parsed.path()[prefix.len()..].contains('/')
    {
        return Err(error("manifest", "更新地址与版本不匹配，已停止更新。"));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn check_application_update(
    webview: tauri::Webview,
) -> Result<Option<UpdateMetadata>, UpdateError> {
    if public_key().is_empty() {
        return Err(error(
            "not_configured",
            "此客户端尚未配置更新签名，请从官方发布页安装新版。",
        ));
    }
    #[cfg(target_os = "ios")]
    {
        let _ = webview;
        Err(error("unsupported", "当前平台不支持应用内更新。"))
    }
    #[cfg(not(target_os = "ios"))]
    {
        use tauri_plugin_updater::UpdaterExt;
        let updater = webview
            .updater_builder()
            .pubkey(public_key())
            .configure_client(|client| {
                client
                    .https_only(true)
                    .redirect(reqwest_updater::redirect::Policy::limited(8))
            })
            .build()
            .map_err(plugin_error)?;
        let Some(update) = updater.check().await.map_err(plugin_error)? else {
            return Ok(None);
        };
        validate_manifest(&update.raw_json, &update.version)?;
        let metadata = UpdateMetadata {
            rid: 0,
            current_version: update.current_version.clone(),
            version: update.version.clone(),
            body: update.body.clone(),
            raw_json: update.raw_json.clone(),
        };
        Ok(Some(UpdateMetadata {
            rid: webview.resources_table().add(update),
            ..metadata
        }))
    }
}

#[tauri::command]
pub(crate) fn restart_after_update(app: tauri::AppHandle) -> Result<(), UpdateError> {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        return Err(error(
            "unsupported",
            "请从系统重新打开应用以确认已安装版本。",
        ));
    }
    app.restart();
}

#[cfg(all(test, not(target_os = "ios")))]
mod tests {
    use super::*;
    #[test]
    fn artifact_urls_are_public_https_and_version_bound() {
        let valid = "https://github.com/noctisynth/Yakumo/releases/download/yakumo-v1.2.3/Yakumo-1.2.3-windows-x64.exe";
        assert!(validate_artifact_url(valid, "1.2.3").is_ok());
        for invalid in [
            valid.replace("https:", "http:"),
            valid.replace("github.com", "github.com.evil.invalid"),
            format!("{valid}?token=secret"),
            valid.replace("github.com", "user@github.com"),
            valid.replace("yakumo-v1.2.3", "yakumo-v2.0.0"),
            format!("{valid}/extra"),
        ] {
            assert!(validate_artifact_url(&invalid, "1.2.3").is_err());
        }
        assert!(validate_manifest(&serde_json::json!({"platforms":{}}), "1.2.3").is_err());
    }
}
