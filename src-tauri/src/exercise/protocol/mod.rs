pub mod json;
pub mod sign;

use crate::accounts::error::{AccountError, AccountResult};
use aes::cipher::{BlockDecryptMut, BlockEncryptMut, KeyInit, block_padding::Pkcs7};
use base64::{Engine, engine::general_purpose::STANDARD};
use md5::{Digest, Md5};
use rand::rngs::OsRng;
use rsa::{Pkcs1v15Encrypt, RsaPublicKey, pkcs8::DecodePublicKey};
use serde_json::Value;
use sha2::Sha256;
use zeroize::Zeroizing;

pub type ProtocolResult<T> = AccountResult<T>;
fn invalid() -> AccountError {
    AccountError::new(
        "protocol_encoding",
        "协议数据编码或解码失败，未发送运动数据。",
    )
}

pub struct Envelope {
    pub key: String,
    pub param: String,
}
pub struct EncodedForm {
    pub body: String,
    pub sign: String,
}

pub struct Protocol<'a> {
    token: &'a str,
    app_id: &'a str,
    timestamp: u64,
}

impl<'a> Protocol<'a> {
    pub fn new(token: &'a str, app_id: &'a str, timestamp: u64) -> Self {
        Self {
            token,
            app_id,
            timestamp,
        }
    }
    pub fn timestamp(&self) -> String {
        self.timestamp.to_string()
    }
    pub fn sign_get(&self, params: &[(String, Option<String>)]) -> ProtocolResult<String> {
        sign::get_signature(self.app_id, self.token, &self.timestamp(), params)
    }
    pub fn sign_form(&self, params: &[(String, String)]) -> ProtocolResult<String> {
        sign::sign_map(
            params.iter().cloned().collect(),
            self.app_id,
            self.token,
            &self.timestamp(),
        )
    }
    fn key(&self) -> [u8; 16] {
        let text = format!(
            "{:x}",
            Md5::digest(format!("{}{}", self.token, self.timestamp).as_bytes())
        );
        let mut key = [0; 16];
        key.copy_from_slice(&text.as_bytes()[..16]);
        key
    }

    pub fn pack(&self, payload: &Value) -> ProtocolResult<Envelope> {
        let materials: Value =
            serde_json::from_str(include_str!("../../../resources/protocol-materials.json"))
                .map_err(|_| invalid())?;
        let cert = STANDARD
            .decode(
                materials["certificate_der_base64"]
                    .as_str()
                    .ok_or_else(invalid)?,
            )
            .map_err(|_| invalid())?;
        let der = STANDARD
            .decode(
                materials["upload_public_key_der_base64"]
                    .as_str()
                    .ok_or_else(invalid)?,
            )
            .map_err(|_| invalid())?;
        let public_key = RsaPublicKey::from_public_key_der(&der).map_err(|_| invalid())?;
        self.pack_with(payload, &cert, &public_key)
    }

    fn pack_with(
        &self,
        payload: &Value,
        cert: &[u8],
        public_key: &RsaPublicKey,
    ) -> ProtocolResult<Envelope> {
        let key = Zeroizing::new(self.key());
        let fingerprint = Sha256::digest(cert)
            .iter()
            .map(|byte| format!("{byte:02X}"))
            .collect::<Vec<_>>()
            .join(":");
        let stamp = STANDARD.encode(Sha256::digest(fingerprint.as_bytes()));
        let mut payload = payload.as_object().ok_or_else(invalid)?.clone();
        payload.insert(
            "v".into(),
            Value::String(encrypt(stamp.as_bytes(), key.as_slice())?),
        );
        let plaintext = Zeroizing::new(json::native_json(&Value::Object(payload))?);
        let wrapped_key = public_key
            .encrypt(&mut OsRng, Pkcs1v15Encrypt, key.as_slice())
            .map_err(|_| invalid())?;
        Ok(Envelope {
            key: STANDARD.encode(wrapped_key),
            param: encrypt(plaintext.as_bytes(), key.as_slice())?,
        })
    }

    pub fn decrypt(&self, value: &str) -> ProtocolResult<Value> {
        let mut bytes = Zeroizing::new(STANDARD.decode(value).map_err(|_| invalid())?);
        let key = Zeroizing::new(self.key());
        let plaintext = ecb::Decryptor::<aes::Aes128>::new_from_slice(key.as_slice())
            .map_err(|_| invalid())?
            .decrypt_padded_mut::<Pkcs7>(&mut bytes)
            .map_err(|_| invalid())?;
        serde_json::from_slice(plaintext).map_err(|_| invalid())
    }

    pub fn double_form(&self, envelope: &Envelope) -> ProtocolResult<EncodedForm> {
        let fields = [
            ("key".into(), sign::java_form_encode(&envelope.key)),
            ("param".into(), sign::java_form_encode(&envelope.param)),
        ];
        let body = fields
            .iter()
            .map(|(key, value)| format!("{key}={}", sign::java_form_encode(value)))
            .collect::<Vec<_>>()
            .join("&");
        Ok(EncodedForm {
            body,
            sign: self.sign_form(&fields)?,
        })
    }
}

fn encrypt(plaintext: &[u8], key: &[u8]) -> ProtocolResult<String> {
    let mut buffer = vec![0; plaintext.len() + 16];
    buffer[..plaintext.len()].copy_from_slice(plaintext);
    let encrypted = ecb::Encryptor::<aes::Aes128>::new_from_slice(key)
        .map_err(|_| invalid())?
        .encrypt_padded_mut::<Pkcs7>(&mut buffer, plaintext.len())
        .map_err(|_| invalid())?;
    Ok(STANDARD.encode(encrypted))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rsa::RsaPrivateKey;

    #[test]
    fn native_seven_json_vectors_and_stamp_match() {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../../../resources/native-json-vectors.json"))
                .expect("synthetic vectors");
        let protocol = Protocol::new("test-token", "test-app", 1700000000123);
        for case in cases {
            let envelope = protocol.pack(&case["input"]).expect("pack");
            let payload = protocol.decrypt(&envelope.param).expect("decrypt");
            assert_eq!(
                json::native_json(&payload).expect("dump"),
                case["native_plaintext"].as_str().expect("expected")
            );
        }
        assert!(
            json::native_json(
                &serde_json::from_str::<Value>("18446744073709551616").expect("json")
            )
            .is_err()
        );
        assert_eq!(
            json::omit_object_nulls(&serde_json::json!({"a":null,"b":[null],"c":false})),
            serde_json::json!({"b":[null],"c":false})
        );
    }

    #[test]
    fn rsa_roundtrip_randomness_and_bound_snapshot() {
        let private = RsaPrivateKey::new(&mut OsRng, 2048).expect("synthetic RSA");
        let protocol = Protocol::new("test-token", "test-app", 1700000000123);
        let envelope = protocol
            .pack_with(
                &serde_json::json!({"test":1}),
                b"synthetic-certificate",
                &private.to_public_key(),
            )
            .expect("pack");
        assert_eq!(
            private
                .decrypt(
                    Pkcs1v15Encrypt,
                    &STANDARD.decode(&envelope.key).expect("base64")
                )
                .expect("RSA decrypt"),
            protocol.key()
        );
        assert_eq!(
            protocol.decrypt(&envelope.param).expect("decrypt")["test"],
            1
        );
        assert!(
            Protocol::new("other-token", "test-app", 1700000000123)
                .decrypt(&envelope.param)
                .is_err()
        );
        let next = protocol
            .pack_with(
                &serde_json::json!({"test":1}),
                b"synthetic-certificate",
                &private.to_public_key(),
            )
            .expect("pack");
        assert_ne!(next.key, envelope.key);
        assert_eq!(next.param, envelope.param);
    }

    #[test]
    fn encoding_and_signature_match_native_vector() {
        let protocol = Protocol::new("test-token", "test-app", 1700000000123);
        let form = protocol
            .double_form(&Envelope {
                key: "++//AA==".into(),
                param: "AA==".into(),
            })
            .expect("form");
        assert_eq!(
            form.body,
            "key=%252B%252B%252F%252FAA%253D%253D&param=AA%253D%253D"
        );
        assert_eq!(form.sign, "94eddfc82b89d87fef73eb8f3641305f");
        assert_eq!(
            sign::java_form_encode(" +/=~*中文"),
            "+%2B%2F%3D%7E*%E4%B8%AD%E6%96%87"
        );
        assert!(protocol.sign_form(&[("bad".into(), "%GG".into())]).is_err());
        let get = vec![
            ("q".into(), Some("first\n".into())),
            ("q".into(), Some("last".into())),
        ];
        assert_eq!(
            protocol.sign_get(&get).expect("GET"),
            protocol
                .sign_get(&[("q".into(), Some("first".into()))])
                .expect("first")
        );
        assert_eq!(
            protocol
                .sign_form(&[("q".into(), "first".into()), ("q".into(), "last".into())])
                .expect("form"),
            protocol
                .sign_get(&[("q".into(), Some("last".into()))])
                .expect("last")
        );
    }
}
