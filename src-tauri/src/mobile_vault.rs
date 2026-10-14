use crate::account_error::{AccountError, AccountResult};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Deserialize;
use tauri::{
    Manager, Runtime,
    plugin::{Builder, PluginHandle, TauriPlugin},
};
use zeroize::Zeroizing;
pub struct Vault<R: Runtime>(PluginHandle<R>);
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-vault")
        .setup(|app, api| {
            app.manage(Vault(
                api.register_android_plugin("app.yakumo.vault", "VaultPlugin")?,
            ));
            Ok(())
        })
        .build()
}
#[derive(Deserialize)]
struct KeyReply {
    key: String,
}
pub fn key(app: &tauri::AppHandle, create: bool) -> AccountResult<Zeroizing<Vec<u8>>> {
    let reply: KeyReply = app
        .state::<Vault<tauri::Wry>>()
        .0
        .run_mobile_plugin("key", serde_json::json!({"create":create}))
        .map_err(|_| AccountError::storage())?;
    let encoded = Zeroizing::new(reply.key);
    let key = Zeroizing::new(
        STANDARD
            .decode(encoded.as_bytes())
            .map_err(|_| AccountError::storage())?,
    );
    if key.len() != 32 {
        return Err(AccountError::storage());
    }
    Ok(key)
}
#[derive(Deserialize, serde::Serialize)]
pub struct ExportReply {
    pub cancelled: bool,
}
pub fn export(
    app: &tauri::AppHandle,
    input: crate::run_generator::RunInput,
) -> AccountResult<ExportReply> {
    let preview = crate::run_generator::generate(input)?;
    let filename = format!("yakumo-synthetic-{}.json", &preview.digest[..12]);
    let content = serde_json::to_string_pretty(&preview).map_err(|_| AccountError::storage())?;
    app.state::<Vault<tauri::Wry>>()
        .0
        .run_mobile_plugin(
            "exportPreview",
            serde_json::json!({"filename":filename,"content":content}),
        )
        .map_err(|_| AccountError::new("export_failed", "无法保存预览，请重试。"))
}

pub fn appearance(app: &tauri::AppHandle, dark: bool) -> AccountResult<serde_json::Value> {
    app.state::<Vault<tauri::Wry>>()
        .0
        .run_mobile_plugin("appearance", serde_json::json!({"dark":dark}))
        .map_err(|_| AccountError::new("appearance_unavailable", "无法同步系统显示区域。"))
}
