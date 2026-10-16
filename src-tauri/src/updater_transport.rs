//! Shared production HTTPS policy for updater checks and downloads.
use reqwest_updater::{Certificate, ClientBuilder};
use tauri_plugin_updater::UpdaterBuilder;

#[derive(Debug)]
pub(crate) struct TransportError;

#[cfg(target_os = "android")]
fn roots() -> Result<Option<Vec<Certificate>>, TransportError> {
    // Reqwest 0.13's platform verifier needs a separate Android JVM/AAR setup,
    // which the pinned fork does not provide. Use a maintained Mozilla DER
    // bundle with normal WebPKI chain and hostname verification instead.
    let roots = webpki_root_certs::TLS_SERVER_ROOT_CERTS
        .iter()
        .map(|certificate| Certificate::from_der(certificate.as_ref()).map_err(|_| TransportError))
        .collect::<Result<Vec<_>, _>>()?;
    if roots.is_empty() {
        return Err(TransportError);
    }
    Ok(Some(roots))
}

#[cfg(not(target_os = "android"))]
fn roots() -> Result<Option<Vec<Certificate>>, TransportError> {
    Ok(None)
}

fn apply(builder: ClientBuilder, roots: &Option<Vec<Certificate>>) -> ClientBuilder {
    let builder = builder
        .https_only(true)
        .redirect(reqwest_updater::redirect::Policy::limited(8));
    if let Some(roots) = roots {
        builder.tls_certs_only(roots.clone())
    } else {
        builder
    }
}

pub(crate) fn configure(builder: UpdaterBuilder) -> Result<UpdaterBuilder, TransportError> {
    let roots = roots()?;
    Ok(builder.configure_client(move |builder| apply(builder, &roots)))
}

#[cfg(all(feature = "updater-validation", target_os = "android"))]
pub(crate) fn validation_public_client() -> Result<ClientBuilder, TransportError> {
    Ok(apply(reqwest_updater::Client::builder(), &roots()?))
}
