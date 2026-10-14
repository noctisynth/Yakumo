use serde::Serialize;

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
        .invoke_handler(tauri::generate_handler![get_application_info])
        .run(tauri::generate_context!())
    {
        eprintln!("应用启动失败：{error}");
        std::process::exit(1);
    }
}
