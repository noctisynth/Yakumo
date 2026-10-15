mod accounts;
mod app;
mod avatars;
pub mod exercise;
mod storage;
mod studio;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app::run();
}
