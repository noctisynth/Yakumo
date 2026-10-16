use base64::{Engine, engine::general_purpose::STANDARD};
use minisign_verify::{PublicKey, Signature};
use std::{error::Error, fs, path::Path};

fn verify(directory: &Path, key: &str) -> Result<(), Box<dyn Error>> {
    let public = PublicKey::decode(&String::from_utf8(STANDARD.decode(key.trim())?)?)?;
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(directory.join("latest.json"))?)?;
    let version = manifest["version"].as_str().ok_or("missing version")?;
    let platforms = manifest["platforms"]
        .as_object()
        .ok_or("missing platforms")?;
    if platforms.is_empty() {
        return Err("empty platform set".into());
    }
    for platform in platforms.values() {
        let url = platform["url"].as_str().ok_or("missing URL")?;
        let name = url.rsplit('/').next().ok_or("missing artifact name")?;
        if !name.starts_with(&format!("Yakumo-{version}-")) || name.contains(['%', '?', '#', '\\'])
        {
            return Err("invalid artifact name".into());
        }
        let encoded = platform["signature"].as_str().ok_or("missing signature")?;
        let signature = Signature::decode(&String::from_utf8(STANDARD.decode(encoded)?)?)?;
        public.verify(&fs::read(directory.join(name))?, &signature, true)?;
        if signature
            .trusted_comment()
            .split('\t')
            .find_map(|field| field.strip_prefix("version:"))
            != Some(version)
        {
            return Err("signature version mismatch".into());
        }
    }
    Ok(())
}

fn main() {
    let result = (|| -> Result<(), Box<dyn Error>> {
        let directory = std::env::args()
            .nth(1)
            .ok_or("expected artifact directory")?;
        let key = std::env::var("YAKUMO_UPDATER_PUBLIC_KEY")?;
        verify(Path::new(&directory), &key)
    })();
    if result.is_err() {
        eprintln!("Updater artifact signature/version validation failed");
        std::process::exit(1);
    }
    println!("All updater artifacts verified against the release public key and version");
}

#[cfg(test)]
mod tests {
    use super::*;
    // Public synthetic vector from the pinned fork; no release signing private key.
    const KEY: &str = "untrusted comment: minisign public key: A49EF4746FA6E6D7\nRWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe";
    const SIG: &str = "untrusted comment: signature from tauri secret key\nRUTX5qZvdPSepPF2zsjvP/L/TQtBLRnWRvaq+4omK1UEugtQp/USrGiI1v762sDy3id3aor7bRC9ETyeot6lMHHrWoZ5hjUM1Qc=\ntrusted comment: timestamp:1791649051\tfile:payload\tversion:2.0.0\nDDq2CLOEl5cQmC2eJRHlnZPVViOZsu1CjpPKQoei4A/XBfkDqGO0B+QMrcrHgEQ5qV3mne75tdFWhJpqUXh9AA==";

    #[test]
    fn release_verifier_rejects_wrong_bytes_version_and_key() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path();
        let write_manifest = |version: &str| {
            let manifest = serde_json::json!({ "version": version, "platforms": { "windows-x86_64": {
                "url": format!("https://github.com/noctisynth/Yakumo/releases/download/yakumo-v{version}/Yakumo-{version}-windows-x64.exe"),
                "signature": STANDARD.encode(SIG)
            }}});
            fs::write(
                path.join("latest.json"),
                serde_json::to_vec(&manifest).unwrap(),
            )
            .unwrap();
        };
        write_manifest("2.0.0");
        fs::write(path.join("Yakumo-2.0.0-windows-x64.exe"), b"test").unwrap();
        assert!(verify(path, &STANDARD.encode(KEY)).is_ok());
        assert!(verify(path, "invalid public key").is_err());
        fs::write(path.join("Yakumo-2.0.0-windows-x64.exe"), b"tampered").unwrap();
        assert!(verify(path, &STANDARD.encode(KEY)).is_err());
        write_manifest("2.0.1");
        fs::write(path.join("Yakumo-2.0.1-windows-x64.exe"), b"test").unwrap();
        assert!(verify(path, &STANDARD.encode(KEY)).is_err());
    }
}
