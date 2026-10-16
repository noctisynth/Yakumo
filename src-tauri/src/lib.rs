mod accounts;
mod app;
mod avatars;
pub mod exercise;
mod storage;
mod studio;
#[cfg(not(target_os = "ios"))]
mod updater_transport;
#[cfg(all(feature = "updater-validation", not(target_os = "ios")))]
mod updater_validation;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app::run();
}
