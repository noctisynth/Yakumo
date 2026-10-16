//! Local-only installed-app validation. Never enabled in production builds.
use std::{
    io::Write,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    time::Duration,
};
use tauri::Manager;
use tauri_plugin_updater::{UpdaterBuilder, UpdaterExt};

const CA: &[u8] = include_bytes!(env!("YAKUMO_UPDATER_TEST_CA"));

pub(crate) fn configure(builder: UpdaterBuilder) -> UpdaterBuilder {
    builder.configure_client(fixture_client)
}

fn fixture_client(builder: reqwest_updater::ClientBuilder) -> reqwest_updater::ClientBuilder {
    let builder = builder
        .https_only(true)
        .no_proxy()
        .timeout(Duration::from_secs(30))
        .redirect(reqwest_updater::redirect::Policy::limited(8));
    let mut builder = if let Ok(certificate) = reqwest_updater::Certificate::from_pem(CA) {
        builder.add_root_certificate(certificate)
    } else {
        builder
    };
    // Every updater host resolves to the CI machine's local fixture server.
    // Android reaches that same server through adb reverse tcp:443.
    for host in [
        "ghfast.top",
        "gh-proxy.com",
        "github.com",
        "raw.githubusercontent.com",
    ] {
        builder = builder.resolve(host, SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 443));
    }
    builder
}

fn report(app: &tauri::AppHandle, version: &str, event: &str) {
    let Ok(directory) = app.path().app_local_data_dir() else {
        return;
    };
    if std::fs::create_dir_all(&directory).is_err() {
        return;
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join("validation-events.jsonl"))
    {
        let _ = writeln!(
            file,
            "{}",
            serde_json::json!({ "version": version, "event": event })
        );
    }
}

pub(crate) fn start(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let version = app.package_info().version.to_string();
        if !["99.0.1", "99.0.2"].contains(&version.as_str()) {
            report(&app, &version, "invalid_validation_version");
            return;
        }
        report(&app, &version, "launched");
        if version == "99.0.2" {
            app.exit(0);
            return;
        }
        let Ok(updater) = configure(app.updater_builder()).build() else {
            report(&app, &version, "builder_failed");
            return;
        };
        let update = match updater.check().await {
            Ok(Some(update)) => update,
            Ok(None) => {
                report(&app, &version, "no_update");
                return;
            }
            Err(_) => {
                report(&app, &version, "check_failed");
                return;
            }
        };
        report(&app, &version, "update_found");
        if crate::app::commands::updater::validate_manifest(&update.raw_json, &update.version)
            .is_err()
        {
            report(&app, &version, "manifest_rejected");
            return;
        }
        let cancellation = update.clone();
        let cancel = app
            .path()
            .app_local_data_dir()
            .is_ok_and(|directory| directory.join("cancel-download").exists());
        let bytes = match update
            .download(
                move |_, _| {
                    if cancel {
                        cancellation.cancel();
                    }
                },
                || {},
            )
            .await
        {
            Ok(bytes) => bytes,
            Err(tauri_plugin_updater::Error::Cancelled) => {
                report(&app, &version, "download_cancelled");
                return;
            }
            Err(_) => {
                report(&app, &version, "download_or_verification_failed");
                return;
            }
        };
        report(&app, &version, "verified");
        report(&app, &version, "install_started");
        let result = tauri::async_runtime::spawn_blocking(move || update.install(bytes)).await;
        match result {
            Ok(Ok(())) => {
                report(&app, &version, "installed");
                #[cfg(not(target_os = "android"))]
                app.restart();
            }
            Ok(Err(tauri_plugin_updater::Error::AndroidInstall { code, .. })) => {
                report(&app, &version, &code)
            }
            _ => report(&app, &version, "install_failed"),
        }
    });
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "Requires the explicitly started local HTTPS validation fixture"]
    fn fixture_tls_routes_stay_local_and_reject_http() {
        let _ = rustls::crypto::ring::default_provider().install_default();
        tauri::async_runtime::block_on(async {
            let client = super::fixture_client(reqwest_updater::Client::builder())
                .build()
                .unwrap();
            assert!(
                client
                    .get("http://gh-proxy.com/latest.json")
                    .send()
                    .await
                    .is_err()
            );
            assert_eq!(
                client
                    .get("https://ghfast.top/latest.json")
                    .send()
                    .await
                    .unwrap()
                    .status()
                    .as_u16(),
                503
            );
            assert_eq!(
                client
                    .get("https://gh-proxy.com/latest.json")
                    .send()
                    .await
                    .unwrap()
                    .status()
                    .as_u16(),
                200
            );
        });
    }
}
