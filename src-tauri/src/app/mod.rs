use crate::{accounts, accounts::AccountManager, storage, studio};
use std::sync::{Arc, Mutex};
use tauri::Manager;
pub(crate) mod commands;
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(not(target_os = "ios"))]
    let builder = builder.plugin(
        tauri_plugin_updater::Builder::new()
            .pubkey(commands::updater::public_key())
            .build(),
    );
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|_, _, _| {}));
    #[cfg(target_os = "android")]
    let builder = builder
        .plugin(storage::mobile::init())
        .plugin(tauri_plugin_geolocation::init());
    if let Err(error) = builder
        .setup(|app| {
            let directory = app.path().app_local_data_dir()?;
            app.manage(Arc::new(Mutex::new(
                studio::submission::PreparedRuns::default(),
            )));
            #[cfg(target_os = "android")]
            let vault =
                storage::vault::EncryptedVault::new_android(directory, app.handle().clone());
            #[cfg(not(target_os = "android"))]
            let vault = storage::vault::EncryptedVault::new(directory);
            app.manage(Arc::new(Mutex::new(AccountManager::new(
                Box::new(vault),
                Box::new(accounts::protocol::SchoolAuthentication),
            ))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_application_info,
            commands::updater::update_status,
            commands::updater::check_application_update,
            commands::updater::restart_after_update,
            commands::accounts::list_accounts,
            commands::accounts::login_account,
            commands::accounts::switch_account,
            commands::accounts::remove_account,
            commands::submission::prepare_run,
            commands::submission::submit_run,
            commands::submission::submission_history,
            commands::submission::link_submission,
            commands::platform::sync_mobile_appearance,
            commands::platform::mobile_platform,
            commands::platform::export_mobile_preview,
            commands::studio::preview_run,
            commands::studio::studio_presets,
            commands::avatar::refresh_account_identity,
            commands::avatar::update_account_avatar,
            commands::exercise::read_exercise,
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("应用启动失败：{error}");
        std::process::exit(1);
    }
}
