use super::{ProtocolResult, invalid};
use aes::cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7};
use base64::{Engine, engine::general_purpose::STANDARD};
use md5::{Digest, Md5};
use std::collections::BTreeMap;

pub(crate) fn fingerprint(bytes: &[u8], token: &str) -> ProtocolResult<String> {
    let digest = format!("{:x}", Md5::digest(token.as_bytes()));
    let mut buffer = vec![0; bytes.len() + 16];
    buffer[..bytes.len()].copy_from_slice(bytes);
    let cipher = cbc::Encryptor::<aes::Aes128>::new_from_slices(
        &digest.as_bytes()[..16],
        &digest.as_bytes()[16..],
    )
    .map_err(|_| invalid())?;
    let encrypted = cipher
        .encrypt_padded_mut::<Pkcs7>(&mut buffer, bytes.len())
        .map_err(|_| invalid())?;
    Ok(format!(
        "{:x}",
        Md5::digest(STANDARD.encode(encrypted).as_bytes())
    ))
}

pub fn java_form_encode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'*' => {
                out.push(byte as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn decode_once(value: &str) -> ProtocolResult<Vec<u8>> {
    let mut out = Vec::new();
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => out.push(b' '),
            b'%' => {
                let pair = bytes.get(index + 1..index + 3).ok_or_else(invalid)?;
                let text = std::str::from_utf8(pair).map_err(|_| invalid())?;
                out.push(u8::from_str_radix(text, 16).map_err(|_| invalid())?);
                index += 2;
            }
            byte => out.push(byte),
        }
        index += 1;
    }
    Ok(out)
}

pub(super) fn sign_map(
    mut parameters: BTreeMap<String, String>,
    app_id: &str,
    token: &str,
    timestamp: &str,
) -> ProtocolResult<String> {
    parameters.insert(
        "appId".into(),
        fingerprint(format!("{app_id}{token}{timestamp}").as_bytes(), token)?,
    );
    parameters.insert(
        "appSecret".into(),
        fingerprint(format!("{token}{timestamp}").as_bytes(), token)?,
    );
    let canonical = parameters
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&");
    fingerprint(&decode_once(&canonical)?, token)
}

pub fn get_signature(
    app_id: &str,
    token: &str,
    timestamp: &str,
    parameters: &[(String, Option<String>)],
) -> ProtocolResult<String> {
    let mut map = BTreeMap::new();
    for (key, value) in parameters {
        map.entry(key.clone())
            .or_insert_with(|| value.clone().unwrap_or_default().replace('\n', ""));
    }
    sign_map(map, app_id, token, timestamp)
}
