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
        builder.tls_certs_only([certificate])
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
    report_record(
        app,
        serde_json::json!({ "version": version, "event": event }),
    );
}

fn report_record(app: &tauri::AppHandle, record: serde_json::Value) {
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
        let _ = writeln!(file, "{record}");
    }
}

fn report_check_failure(
    app: &tauri::AppHandle,
    version: &str,
    error: &tauri_plugin_updater::Error,
) {
    // This module only sends requests to the loopback fixture, without headers
    // or account state. Keep a bounded cause chain to diagnose TLS/route errors.
    let mut source = std::error::Error::source(error);
    let mut causes = Vec::new();
    while let Some(cause) = source {
        causes.push(cause.to_string().chars().take(512).collect::<String>());
        if causes.len() == 5 {
            break;
        }
        source = cause.source();
    }
    report_record(
        app,
        serde_json::json!({ "version": version, "event": "check_failed", "causes": causes }),
    );
}

#[cfg(target_os = "android")]
async fn public_https_probe(app: &tauri::AppHandle, version: &str) -> bool {
    use sha2::{Digest, Sha256};
    let Ok(directory) = app.path().app_local_data_dir() else {
        return false;
    };
    let marker = directory.join("public-https-verified");
    if marker.exists() {
        return true;
    }
    let Ok(builder) = crate::updater_transport::validation_public_client() else {
        return false;
    };
    let Ok(client) = builder.timeout(Duration::from_secs(15)).build() else {
        return false;
    };
    // Public immutable checksum only, no authentication, headers or user data.
    let source = "https://github.com/noctisynth/Yakumo/releases/download/yakumo-v0.1.2/Yakumo-0.1.2-windows-x64.sha256";
    for prefix in ["https://ghfast.top/", "https://gh-proxy.com/", ""] {
        let Ok(response) = client.get(format!("{prefix}{source}")).send().await else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        let Ok(bytes) = response.bytes().await else {
            continue;
        };
        if format!("{:x}", Sha256::digest(&bytes))
            == "632ace1a67d498734b204a001b2e3d0e03dd8a03c3e577f1c887baec00f5e0ff"
        {
            if std::fs::write(
                marker,
                b"verified public HTTPS without platform-verifier JNI",
            )
            .is_err()
            {
                return false;
            }
            report(app, version, "public_https_verified");
            return true;
        }
    }
    false
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
        let Ok(production_builder) = crate::updater_transport::configure(app.updater_builder())
        else {
            report(&app, &version, "builder_failed");
            return;
        };
        // Building/checking the fork initializes its process-wide TLS provider.
        let Ok(updater) = configure(production_builder).build() else {
            report(&app, &version, "builder_failed");
            return;
        };
        let checked = updater.check().await;
        #[cfg(target_os = "android")]
        if !public_https_probe(&app, &version).await {
            report(&app, &version, "public_https_failed");
            return;
        }
        let update = match checked {
            Ok(Some(update)) => update,
            Ok(None) => {
                report(&app, &version, "no_update");
                return;
            }
            Err(error) => {
                report_check_failure(&app, &version, &error);
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
