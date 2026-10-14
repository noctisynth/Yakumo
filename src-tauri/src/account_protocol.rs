use std::{io::Read, time::Duration};

use base64::{Engine, engine::general_purpose::STANDARD};
use rand::rngs::OsRng;
use reqwest::{blocking::Client, header, redirect::Policy};
use rsa::{Pkcs1v15Encrypt, RsaPublicKey, pkcs8::DecodePublicKey, traits::PublicKeyParts};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

use crate::account_error::{AccountError, AccountResult};

const SCHOOL_ORIGIN: &str = "http://tygl.swpu.edu.cn/";
// Public application compatibility constant, recovered from the 2.0.24 interceptor.
const CLIENT_SECRET: &str = "zp0tamWSX8N1ZiRiViQJJcyqnCfVIItL";
const MAX_RESPONSE: u64 = 1024 * 1024;

#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct Session {
    pub access_token: String,
    pub refresh_token: String,
    pub user_id: String,
    pub username: String,
    pub raw_app_id: String,
    pub device_id: String,
    pub expires_at: u64,
    #[serde(default)]
    pub avatar_url: Option<String>,
}

pub trait Authentication: Send {
    fn avatar(&self, session: &Session, now: u64) -> AccountResult<Option<String>>;
    fn login(
        &self,
        username: &str,
        password: &str,
        device_id: &str,
        now: u64,
    ) -> AccountResult<Session>;
}

pub struct SchoolAuthentication;

struct LoginProtocol<'a> {
    origin: &'a str,
}

fn network_error(error: reqwest::Error) -> AccountError {
    if error.is_timeout() {
        AccountError::new("timeout", "连接学校服务超时，请稍后重试。")
    } else {
        AccountError::new("network_error", "无法连接学校服务，请检查网络后重试。")
    }
}

fn client() -> AccountResult<Client> {
    Client::builder()
        .redirect(Policy::none())
        .no_proxy()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(network_error)
}

pub(crate) fn headers(device_id: &str, basic: bool) -> AccountResult<header::HeaderMap> {
    let mut headers = header::HeaderMap::new();
    headers.insert("school", header::HeaderValue::from_static("swpu"));
    headers.insert(
        header::COOKIE,
        header::HeaderValue::from_static("host=swpu"),
    );
    headers.insert(
        header::ACCEPT,
        header::HeaderValue::from_static("application/json"),
    );
    headers.insert("model", header::HeaderValue::from_static("Yakumo-Desktop"));
    headers.insert(
        "uniqueCode",
        header::HeaderValue::from_str(device_id).map_err(|_| AccountError::invalid())?,
    );
    if basic {
        let value = format!(
            "Basic  {}",
            STANDARD.encode(format!("swpu:{CLIENT_SECRET}"))
        );
        headers.insert(
            header::AUTHORIZATION,
            header::HeaderValue::from_str(&value).map_err(|_| AccountError::protocol())?,
        );
    }
    Ok(headers)
}

pub(crate) fn response(request: reqwest::blocking::RequestBuilder) -> AccountResult<Value> {
    let response = request.send().map_err(network_error)?;
    let status = response.status();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err(AccountError::new(
            "authentication_rejected",
            "登录凭据或会话已失效，请重新登录。",
        ));
    }
    if !status.is_success() {
        return Err(AccountError::new(
            "http_error",
            "学校服务暂时无法处理请求，请稍后重试。",
        ));
    }
    let mut body = Zeroizing::new(Vec::new());
    response
        .take(MAX_RESPONSE + 1)
        .read_to_end(&mut body)
        .map_err(|_| AccountError::new("network_error", "读取学校服务响应失败，请重试。"))?;
    if body.len() as u64 > MAX_RESPONSE {
        return Err(AccountError::protocol());
    }
    let value: Value = serde_json::from_slice(&body).map_err(|_| AccountError::protocol())?;
    if value.get("error").is_some()
        || value
            .get("code")
            .is_some_and(|code| code != 0 && code != "0")
    {
        return Err(AccountError::new(
            "authentication_rejected",
            "学校服务拒绝了登录请求，请核对账号、密码或会话。",
        ));
    }
    Ok(value)
}

fn text(value: &Value, name: &str) -> AccountResult<String> {
    let value = value.get(name).ok_or_else(AccountError::protocol)?;
    let text = match value {
        Value::String(value) => value.clone(),
        Value::Number(value) => value.to_string(),
        _ => return Err(AccountError::protocol()),
    };
    if text.is_empty() || text.len() > 32_768 {
        return Err(AccountError::protocol());
    }
    Ok(text)
}

pub fn encrypt_password(public_key: &str, password: &str) -> AccountResult<String> {
    let pem = if public_key.starts_with("-----BEGIN PUBLIC KEY-----") {
        public_key.to_string()
    } else {
        format!("-----BEGIN PUBLIC KEY-----\n{public_key}\n-----END PUBLIC KEY-----")
    };
    let key = RsaPublicKey::from_public_key_pem(&pem).map_err(|_| AccountError::protocol())?;
    if !(2048..=4096).contains(&key.n().bits()) {
        return Err(AccountError::protocol());
    }
    let encrypted = key
        .encrypt(&mut OsRng, Pkcs1v15Encrypt, password.as_bytes())
        .map_err(|_| AccountError::new("password_encoding", "密码长度超出学校登录协议限制。"))?;
    Ok(format!("RSA:{}", STANDARD.encode(encrypted)))
}

fn parse_session(
    value: &Value,
    username: &str,
    device_id: &str,
    now: u64,
) -> AccountResult<Session> {
    let expires = text(value, "expires_in")?
        .parse::<u64>()
        .map_err(|_| AccountError::protocol())?;
    let expires_at = now
        .checked_add(expires)
        .filter(|_| expires > 0)
        .ok_or_else(AccountError::protocol)?;
    if !text(value, "token_type")?.eq_ignore_ascii_case("bearer") {
        return Err(AccountError::protocol());
    }
    let user_id = text(value, "user_id")?;
    let refresh_token = text(value, "refresh_token")?;
    Ok(Session {
        access_token: text(value, "access_token")?,
        refresh_token,
        user_id,
        username: value
            .get("username")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or(username)
            .to_string(),
        raw_app_id: String::new(),
        device_id: device_id.to_string(),
        expires_at,
        avatar_url: None,
    })
}

impl Authentication for SchoolAuthentication {
    fn avatar(&self, session: &Session, now: u64) -> AccountResult<Option<String>> {
        crate::account_avatar::AvatarReader::new(SCHOOL_ORIGIN).read(session, now)
    }
    fn login(
        &self,
        username: &str,
        password: &str,
        device_id: &str,
        now: u64,
    ) -> AccountResult<Session> {
        LoginProtocol {
            origin: SCHOOL_ORIGIN,
        }
        .login(username, password, device_id, now)
    }
}

impl LoginProtocol<'_> {
    fn login(
        &self,
        username: &str,
        password: &str,
        device_id: &str,
        now: u64,
    ) -> AccountResult<Session> {
        let origin = self.origin;
        let client = client()?;
        let key = response(
            client
                .get(format!("{origin}auth/rsa-public-key"))
                .headers(headers(device_id, false)?),
        )?;
        let password = Zeroizing::new(encrypt_password(
            key.get("data")
                .and_then(Value::as_str)
                .ok_or_else(AccountError::protocol)?,
            password,
        )?);
        let params = [
            ("username", username),
            ("password", password.as_str()),
            ("grant_type", "password"),
            ("type", "app"),
            ("appType", "stuApp"),
        ];
        let token = response(
            client
                .post(format!("{origin}auth/oauth/token"))
                .headers(headers(device_id, true)?)
                .query(&params)
                .body(""),
        )?;
        let mut session = parse_session(&token, username, device_id, now)?;
        let app_id = response(
            client
                .get(format!("{origin}upms/sysSchool/getAppid"))
                .headers(headers(device_id, false)?),
        )?;
        session.raw_app_id = text(&app_id, "data")?;
        Ok(session)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rsa::{
        RsaPrivateKey,
        pkcs8::{EncodePublicKey, LineEnding},
    };
    use std::{io::Write, net::TcpListener, thread};

    fn mock_server(replies: Vec<(u16, String)>) -> (String, thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("local listener");
        let origin = format!("http://{}/", listener.local_addr().expect("local address"));
        let worker = thread::spawn(move || {
            let mut requests = Vec::new();
            for (status, body) in replies {
                let (mut stream, _) = listener.accept().expect("request");
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .expect("read timeout");
                let mut request = Vec::new();
                let mut byte = [0_u8; 1];
                while !request.ends_with(b"\r\n\r\n") {
                    stream.read_exact(&mut byte).expect("request bytes");
                    request.push(byte[0]);
                    assert!(request.len() < 65536);
                }
                requests.push(String::from_utf8(request).expect("http text"));
                write!(stream, "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{body}", body.len()).expect("reply");
            }
            requests
        });
        (origin, worker)
    }

    #[test]
    fn login_http_contract_uses_rsa_query_and_original_app_id() {
        let private = RsaPrivateKey::new(&mut OsRng, 2048).expect("synthetic rsa");
        let pem = private
            .to_public_key()
            .to_public_key_pem(LineEnding::LF)
            .expect("pem");
        let (origin, worker) = mock_server(vec![
            (200, serde_json::json!({"code":0,"data":pem}).to_string()),
            (200, serde_json::json!({"access_token":"synthetic-access", "refresh_token":"synthetic-refresh", "token_type":"bearer", "expires_in":3600, "user_id":"synthetic-user"}).to_string()),
            (200, serde_json::json!({"code":0,"data":"synthetic-original-app"}).to_string()),
        ]);
        let session = LoginProtocol { origin: &origin }
            .login("synthetic +&用户", "合成密码 +&", "synthetic-device", 100)
            .expect("login");
        assert_eq!(session.raw_app_id, "synthetic-original-app");
        assert_eq!(session.username, "synthetic +&用户");
        let requests = worker.join().expect("mock worker");
        assert!(requests[0].starts_with("GET /auth/rsa-public-key "));
        assert!(requests[1].starts_with("POST /auth/oauth/token?"));
        let request_url = requests[1].split_whitespace().nth(1).expect("request url");
        let url = reqwest::Url::parse(&format!("{origin}{}", &request_url[1..])).expect("url");
        let query: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(query.len(), 5);
        assert_eq!(query["username"], "synthetic +&用户");
        assert_eq!(query["grant_type"], "password");
        assert_eq!(query["type"], "app");
        assert_eq!(query["appType"], "stuApp");
        let ciphertext = STANDARD
            .decode(query["password"].strip_prefix("RSA:").expect("prefix"))
            .expect("base64");
        assert_eq!(
            private
                .decrypt(Pkcs1v15Encrypt, &ciphertext)
                .expect("decrypt"),
            "合成密码 +&".as_bytes()
        );
        let expected_auth = format!(
            "authorization: basic  {}",
            STANDARD
                .encode(format!("swpu:{CLIENT_SECRET}"))
                .to_lowercase()
        );
        assert!(requests[1].to_lowercase().contains(&expected_auth));
        for request in &requests {
            let request = request.to_lowercase();
            assert!(request.contains("school: swpu\r\n"));
            assert!(request.contains("cookie: host=swpu\r\n"));
            assert!(request.contains("uniquecode: synthetic-device\r\n"));
            assert!(!request.contains("合成密码"));
        }
        assert!(requests[2].starts_with("GET /upms/sysSchool/getAppid "));
    }

    #[test]
    fn http_business_and_html_errors_are_classified_without_echoing_secrets() {
        for (status, body, expected) in [
            (401, "synthetic-secret", "authentication_rejected"),
            (500, "synthetic-secret", "http_error"),
            (302, "synthetic-secret", "http_error"),
            (200, "<html>synthetic-secret</html>", "invalid_response"),
            (
                200,
                r#"{"code":1,"msg":"synthetic-secret"}"#,
                "authentication_rejected",
            ),
        ] {
            let (origin, worker) = mock_server(vec![(status, body.into())]);
            let error =
                response(client().expect("client").get(origin)).expect_err("reject response");
            assert_eq!(error.code, expected);
            assert!(
                !serde_json::to_string(&error)
                    .expect("error json")
                    .contains("synthetic-secret")
            );
            worker.join().expect("worker");
        }
    }

    #[test]
    fn rsa_round_trip_and_random_padding() {
        let private = RsaPrivateKey::new(&mut OsRng, 2048).expect("synthetic key");
        let pem = private
            .to_public_key()
            .to_public_key_pem(LineEnding::LF)
            .expect("public pem");
        let first = encrypt_password(&pem, "合成密码 +&").expect("encryption");
        let second = encrypt_password(&pem, "合成密码 +&").expect("encryption");
        assert_ne!(first, second);
        let cipher = STANDARD
            .decode(first.strip_prefix("RSA:").expect("prefix"))
            .expect("base64");
        assert_eq!(
            private.decrypt(Pkcs1v15Encrypt, &cipher).expect("decrypt"),
            "合成密码 +&".as_bytes()
        );
        assert!(encrypt_password("bad public key", "secret").is_err());
    }

    #[test]
    fn token_types_identity_and_expiration_are_validated() {
        let value = serde_json::json!({"access_token":"synthetic-access", "refresh_token":"synthetic-refresh", "token_type":"bearer", "expires_in":"3600", "user_id":123});
        let session =
            parse_session(&value, "synthetic-user", "synthetic-device", 100).expect("session");
        assert_eq!(session.expires_at, 3700);
        assert_eq!(session.user_id, "123");
        let mut changed = value.clone();
        changed["user_id"] = Value::Null;
        assert!(parse_session(&changed, "user", "device", 100).is_err());
        changed = value;
        changed["expires_in"] = Value::from(0);
        assert!(parse_session(&changed, "user", "device", 100).is_err());
    }
}
