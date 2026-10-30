use std::{fs, io::Write, path::PathBuf};

use chacha20poly1305::{
    ChaCha20Poly1305, KeyInit, Nonce,
    aead::{Aead, Payload},
};
use rand::{RngCore, rngs::OsRng};
use zeroize::Zeroizing;

use crate::{
    accounts::AccountData,
    accounts::error::{AccountError, AccountResult},
};

const AAD: &[u8] = b"app.yakumo.client/accounts/v1";
const MAX_VAULT_SIZE: u64 = 16 * 1024 * 1024;

pub trait AccountStorage: Send {
    fn load(&self) -> AccountResult<AccountData>;
    fn save(&self, data: &AccountData) -> AccountResult<()>;
}

pub struct EncryptedVault {
    directory: PathBuf,
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    key_account: String,
    #[cfg(target_os = "android")]
    mobile: Option<tauri::AppHandle>,
}

fn damaged() -> AccountError {
    AccountError::new(
        "storage_damaged",
        "无法打开已保存的账号。请保留应用数据，解锁设备后重试；仍无法读取时请联系维护者。",
    )
}

fn encrypt(key: &[u8], plaintext: &[u8]) -> AccountResult<Vec<u8>> {
    let cipher = ChaCha20Poly1305::new_from_slice(key).map_err(|_| damaged())?;
    let mut nonce = [0_u8; 12];
    OsRng
        .try_fill_bytes(&mut nonce)
        .map_err(|_| AccountError::storage())?;
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad: AAD,
            },
        )
        .map_err(|_| AccountError::storage())?;
    Ok([nonce.as_slice(), ciphertext.as_slice()].concat())
}

fn decrypt(key: &[u8], bytes: &[u8]) -> AccountResult<Zeroizing<Vec<u8>>> {
    if bytes.len() < 28 {
        return Err(damaged());
    }
    let cipher = ChaCha20Poly1305::new_from_slice(key).map_err(|_| damaged())?;
    cipher
        .decrypt(
            Nonce::from_slice(&bytes[..12]),
            Payload {
                msg: &bytes[12..],
                aad: AAD,
            },
        )
        .map(Zeroizing::new)
        .map_err(|_| damaged())
}

impl EncryptedVault {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            key_account: "accounts-v1-key".into(),
            #[cfg(target_os = "android")]
            mobile: None,
        }
    }

    #[cfg(target_os = "android")]
    pub fn new_android(directory: PathBuf, app: tauri::AppHandle) -> Self {
        let mut vault = Self::new(directory);
        vault.mobile = Some(app);
        vault
    }
    #[cfg(target_os = "android")]
    fn key(&self, create: bool) -> AccountResult<Zeroizing<Vec<u8>>> {
        crate::storage::mobile::key(
            self.mobile.as_ref().ok_or_else(AccountError::storage)?,
            create,
        )
    }
    #[cfg(target_os = "ios")]
    fn key(&self, _create: bool) -> AccountResult<Zeroizing<Vec<u8>>> {
        Err(AccountError::storage())
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    fn key(&self, create: bool) -> AccountResult<Zeroizing<Vec<u8>>> {
        // Never fall back to keyring's mock backend on unsupported platforms.
        if !cfg!(any(
            target_os = "windows",
            target_os = "macos",
            target_os = "linux"
        )) {
            return Err(AccountError::storage());
        }
        let entry = keyring::Entry::new("app.yakumo.client", &self.key_account)
            .map_err(|_| AccountError::storage())?;
        match entry.get_secret() {
            Ok(key) if key.len() == 32 => Ok(Zeroizing::new(key)),
            Err(keyring::Error::NoEntry) if create => {
                let mut key = Zeroizing::new(vec![0_u8; 32]);
                OsRng
                    .try_fill_bytes(&mut key)
                    .map_err(|_| AccountError::storage())?;
                entry
                    .set_secret(&key)
                    .map_err(|_| AccountError::storage())?;
                Ok(key)
            }
            _ => Err(AccountError::storage()),
        }
    }
}

impl AccountStorage for EncryptedVault {
    fn load(&self) -> AccountResult<AccountData> {
        let path = self.directory.join("accounts-v1.bin");
        let metadata = match fs::metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(AccountData::default());
            }
            Err(_) => return Err(AccountError::storage()),
        };
        if metadata.len() > MAX_VAULT_SIZE {
            return Err(damaged());
        }
        let key = self.key(false)?;
        let bytes = fs::read(path).map_err(|_| AccountError::storage())?;
        let plaintext = decrypt(&key, &bytes)?;
        let data: AccountData = serde_json::from_slice(&plaintext).map_err(|_| damaged())?;
        data.validate().map_err(|_| damaged())?;
        Ok(data)
    }

    fn save(&self, data: &AccountData) -> AccountResult<()> {
        let path = self.directory.join("accounts-v1.bin");
        // If an existing vault loses its key, do not replace the key or overwrite it.
        let key = self.key(!path.try_exists().map_err(|_| AccountError::storage())?)?;
        let plaintext =
            Zeroizing::new(serde_json::to_vec(data).map_err(|_| AccountError::storage())?);
        if plaintext.len() as u64 > MAX_VAULT_SIZE - 28 {
            return Err(AccountError::storage());
        }
        let ciphertext = encrypt(&key, &plaintext)?;
        fs::create_dir_all(&self.directory).map_err(|_| AccountError::storage())?;
        let mut file = tempfile::NamedTempFile::new_in(&self.directory)
            .map_err(|_| AccountError::storage())?;
        file.write_all(&ciphertext)
            .map_err(|_| AccountError::storage())?;
        file.as_file()
            .sync_all()
            .map_err(|_| AccountError::storage())?;
        file.persist(path).map_err(|_| AccountError::storage())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Requires an unlocked native system keyring; run explicitly outside CI"]
    fn native_keyring_storage_round_trip() {
        let directory = tempfile::tempdir().expect("temporary vault");
        let key_account = format!("test-{}", uuid::Uuid::new_v4());
        let entry = keyring::Entry::new("app.yakumo.client", &key_account).expect("test entry");
        struct Cleanup(keyring::Entry);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = self.0.delete_credential();
            }
        }
        let _cleanup = Cleanup(entry);
        let vault = EncryptedVault {
            directory: directory.path().to_path_buf(),
            key_account,
        };
        let first = vault.load().expect("empty load");
        vault
            .save(&first)
            .expect("first write and native key creation");
        let data: AccountData = serde_json::from_value(serde_json::json!({
            "version":1, "active_id":"4dc94249-c888-4d90-ab96-6a05ddfdc482", "accounts":[{
                "id":"4dc94249-c888-4d90-ab96-6a05ddfdc482", "school":"swpu", "session":{
                    "access_token":"synthetic-access-secret", "refresh_token":"synthetic-refresh-secret", "user_id":"synthetic-user", "username":"synthetic-account", "raw_app_id":"synthetic-app", "device_id":"14b41e74-19b1-4e28-b2f9-9a68a456d1f0", "expires_at":5000
                }
            }]
        })).expect("synthetic data");
        vault.save(&data).expect("atomic replacement");
        let restored = vault.load().expect("read native key and ciphertext");
        assert_eq!(
            serde_json::to_value(restored).expect("json"),
            serde_json::to_value(&data).expect("json")
        );
        let path = directory.path().join("accounts-v1.bin");
        let bytes = fs::read(&path).expect("encrypted bytes");
        assert!(
            !bytes
                .windows(b"synthetic".len())
                .any(|part| part == b"synthetic")
        );
        fs::write(path, b"damaged synthetic vault").expect("corrupt fixture");
        assert_eq!(
            vault.load().err().expect("reject corruption").code,
            "storage_damaged"
        );
    }

    #[test]
    fn encrypted_vault_rejects_tampering_and_wrong_key() {
        let plaintext = b"synthetic-access-token and synthetic-account";
        let mut encrypted = encrypt(&[7; 32], plaintext).expect("encrypt");
        assert!(
            !encrypted
                .windows(plaintext.len())
                .any(|window| window == plaintext)
        );
        assert_eq!(
            decrypt(&[7; 32], &encrypted).expect("decrypt").as_slice(),
            plaintext
        );
        assert_ne!(
            encrypted,
            encrypt(&[7; 32], plaintext).expect("fresh nonce")
        );
        assert!(decrypt(&[8; 32], &encrypted).is_err());
        encrypted[15] ^= 1;
        assert!(decrypt(&[7; 32], &encrypted).is_err());
        assert!(decrypt(&[7; 32], &[0; 12]).is_err());
    }
}
