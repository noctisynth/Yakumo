use crate::{
    account_protocol::{Session, headers},
    exercise_protocol::Protocol,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use md5::{Digest, Md5};
use reqwest::{blocking::Client, redirect::Policy};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{io::Read, time::Duration};
use zeroize::Zeroizing;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseError {
    pub code: &'static str,
    pub message: &'static str,
    pub http_status: Option<u16>,
    pub business_code: Option<i64>,
}
pub type ExerciseResult<T> = Result<T, ExerciseError>;
fn error(code: &'static str, message: &'static str) -> ExerciseError {
    ExerciseError {
        code,
        message,
        http_status: None,
        business_code: None,
    }
}

#[derive(Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum ExerciseQuery {
    Profile,
    Summary,
    Statistics,
    Records {
        status: String,
        page: u32,
        date: String,
    },
    Detail {
        id: String,
    },
    Settings {
        latitude: f64,
        longitude: f64,
        #[serde(rename = "runType")]
        run_type: u32,
    },
}

impl ExerciseQuery {
    pub fn validate(&self) -> ExerciseResult<()> {
        match self {
            Self::Records { status, page, date }
                if !matches!(status.as_str(), "0" | "1")
                    || !(1..=120).contains(page)
                    || date.len() > 32
                    || date.chars().any(char::is_control) =>
            {
                Err(error("invalid_input", "记录筛选或日期页码无效。"))
            }
            Self::Detail { id }
                if id.is_empty() || id.len() > 128 || id.chars().any(char::is_control) =>
            {
                Err(error("invalid_input", "记录标识无效。"))
            }
            Self::Settings {
                latitude,
                longitude,
                run_type,
            } if !latitude.is_finite()
                || !longitude.is_finite()
                || latitude.abs() > 90.0
                || longitude.abs() > 180.0
                || *run_type != 1 =>
            {
                Err(error("invalid_input", "请检查坐标，当前仅支持运动类型 1。"))
            }
            _ => Ok(()),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseResponse {
    pub account_id: String,
    pub fetched_at: u64,
    pub data: Value,
}

pub(crate) fn signature_metadata() -> ExerciseResult<String> {
    let material: Value =
        serde_json::from_str(include_str!("../resources/protocol-materials.json"))
            .map_err(|_| error("protocol_encoding", "兼容材料不可用。"))?;
    let cert = STANDARD
        .decode(
            material["certificate_der_base64"]
                .as_str()
                .ok_or_else(|| error("protocol_encoding", "兼容材料不可用。"))?,
        )
        .map_err(|_| error("protocol_encoding", "兼容材料不可用。"))?;
    Ok(Md5::digest(cert)
        .iter()
        .map(|value| format!("{value:02X}"))
        .collect::<Vec<_>>()
        .join(":"))
}

pub struct ExerciseClient<'a> {
    pub origin: &'a str,
}
impl ExerciseClient<'_> {
    pub fn read(
        &self,
        session: &Session,
        query: &ExerciseQuery,
        timestamp: u64,
    ) -> ExerciseResult<Value> {
        query.validate()?;
        let protocol = Protocol::new(&session.access_token, &session.raw_app_id, timestamp);
        let mut params: Vec<(String, Option<String>)> = Vec::new();
        let path = match query {
            ExerciseQuery::Profile => "upms/basUser/getLoginUserInfo",
            ExerciseQuery::Summary => "exercise/exerciseRecord/sumExerciseRecord",
            ExerciseQuery::Statistics => "exercise/exerciseRecord/statisticsExerciseRecord",
            ExerciseQuery::Records { status, page, date } => {
                params.extend([
                    ("status".into(), Some(status.clone())),
                    ("datePageIndex".into(), Some(page.to_string())),
                    ("date".into(), Some(date.clone())),
                ]);
                "exercise/exerciseRecord/2a36d143/listExerciseRecord"
            }
            ExerciseQuery::Detail { id } => {
                params.push(("exerciseRecordId".into(), Some(id.clone())));
                "exercise/exerciseRecord/2a36d143/getExerciseRecord"
            }
            ExerciseQuery::Settings {
                latitude,
                longitude,
                run_type,
            } => {
                let payload = json!({"appType":"Android", "versionCode":20220, "versionName":"2.0.22", "signatureMD5":signature_metadata()?, "brand":"Yakumo", "model":"Desktop", "system":std::env::consts::OS, "version":"unknown", "uniqueCode":session.device_id, "latitude":latitude, "longitude":longitude, "runType":run_type});
                let envelope = protocol
                    .pack(&payload)
                    .map_err(|_| error("protocol_encoding", "学校配置请求封包失败。"))?;
                params.extend([
                    ("key".into(), Some(envelope.key)),
                    ("param".into(), Some(envelope.param)),
                ]);
                "exercise/exerciseSetting/2a36d143/getSetting"
            }
        };
        let sign = protocol
            .sign_get(&params)
            .map_err(|_| error("protocol_encoding", "请求签名失败。"))?;
        let client = Client::builder()
            .redirect(Policy::none())
            .retry(reqwest::retry::never())
            .no_proxy()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|_| error("network_error", "无法创建学校连接。"))?;
        let response = client
            .get(format!("{}{path}", self.origin))
            .query(&params)
            .headers(
                headers(&session.device_id, false)
                    .map_err(|_| error("invalid_input", "账号会话格式异常。"))?,
            )
            .bearer_auth(&session.access_token)
            .header("timestamp", protocol.timestamp())
            .header("sign", sign)
            .send()
            .map_err(|failure| {
                if failure.is_timeout() {
                    error("timeout", "学校服务响应超时，请稍后刷新。")
                } else {
                    error("network_error", "无法连接学校服务，请检查网络。")
                }
            })?;
        let status = response.status().as_u16();
        let mut body = Zeroizing::new(Vec::new());
        response
            .take(4 * 1024 * 1024 + 1)
            .read_to_end(&mut body)
            .map_err(|_| error("network_error", "读取学校响应失败。"))?;
        let mut data = parse_response(status, &body)?;
        if matches!(query, ExerciseQuery::Settings { .. }) {
            data = protocol
                .decrypt(
                    data.as_str()
                        .ok_or_else(|| error("invalid_response", "学校配置未返回预期加密数据。"))?,
                )
                .map_err(|_| error("decrypt_error", "学校配置解密失败，请重新读取。"))?;
        }
        if !data.is_object() && !data.is_null() {
            return Err(error("invalid_response", "学校返回了不支持的数据结构。"));
        }
        Ok(redact(data))
    }
}

fn parse_response(status: u16, bytes: &[u8]) -> ExerciseResult<Value> {
    let parsed = (bytes.len() <= 4 * 1024 * 1024)
        .then(|| serde_json::from_slice::<Value>(bytes).ok())
        .flatten();
    let business_code = parsed
        .as_ref()
        .and_then(|value| scalar_number(&value["code"]))
        .filter(|value| value.fract() == 0.0)
        .map(|value| value as i64);
    let mut failure = if matches!(status, 401 | 403) {
        error("session_expired", "登录状态已失效，请重新登录。")
    } else if !(200..300).contains(&status) {
        error("http_error", "学校服务暂时不可用。")
    } else if parsed.is_none() {
        error("invalid_response", "学校返回了非 JSON 或超限数据。")
    } else if business_code.is_none() || parsed.as_ref().is_some_and(|value| !value.is_object()) {
        error("invalid_response", "学校响应结构或业务码无法识别。")
    } else if business_code != Some(0) {
        error("business_rejected", "学校拒绝了本次读取。")
    } else {
        return parsed
            .and_then(|mut value| value.as_object_mut().and_then(|map| map.remove("data")))
            .ok_or_else(|| error("invalid_response", "学校响应缺少数据字段。"));
    };
    if !matches!(status, 401 | 403)
        && let Some(message) = parsed.as_ref().and_then(|value| value["msg"].as_str())
    {
        if message.contains("60004") {
            failure = error("client_outdated", "学校要求更新客户端兼容参数（60004）。");
        } else if message.contains("今日跑步里程已达标") {
            failure = error("daily_limit", "学校提示今日跑步里程已达标，暂不提供配置。");
        }
    }
    failure.http_status = Some(status);
    failure.business_code = business_code;
    Err(failure)
}

pub fn scalar_number(value: &Value) -> Option<f64> {
    let number = if let Some(text) = value.as_str() {
        if text.trim().is_empty() {
            return None;
        }
        text.parse::<f64>().ok()?
    } else {
        value.as_f64()?
    };
    number.is_finite().then_some(number)
}

fn redact(value: Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .filter(|(key, _)| {
                    let key = key.to_ascii_lowercase();
                    !key.contains("token")
                        && !key.contains("password")
                        && !key.contains("secret")
                        && !key.contains("credential")
                        && !matches!(
                            key.as_str(),
                            "uniquecode"
                                | "environment"
                                | "signaturemd5"
                                | "faceurl"
                                | "collectphoto"
                                | "imagerouteurl"
                                | "v"
                        )
                })
                .map(|(key, value)| (key, redact(value)))
                .collect(),
        ),
        Value::Array(values) => Value::Array(values.into_iter().map(redact).collect()),
        _ => value,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write, net::TcpListener, thread};

    #[test]
    fn fixed_read_routes_signatures_and_settings_roundtrip() {
        let session = Session {
            access_token: "test-token".into(),
            refresh_token: "synthetic-refresh".into(),
            user_id: "synthetic-user".into(),
            username: "synthetic-user".into(),
            raw_app_id: "test-app".into(),
            device_id: "synthetic-device".into(),
            expires_at: 1_800_000_000,
            avatar_url: None,
        };
        for (query, path) in [
            (ExerciseQuery::Profile, "/upms/basUser/getLoginUserInfo"),
            (
                ExerciseQuery::Summary,
                "/exercise/exerciseRecord/sumExerciseRecord",
            ),
            (
                ExerciseQuery::Statistics,
                "/exercise/exerciseRecord/statisticsExerciseRecord",
            ),
            (
                ExerciseQuery::Records {
                    status: "1".into(),
                    page: 1,
                    date: String::new(),
                },
                "/exercise/exerciseRecord/2a36d143/listExerciseRecord",
            ),
            (
                ExerciseQuery::Detail {
                    id: "synthetic-id +&".into(),
                },
                "/exercise/exerciseRecord/2a36d143/getExerciseRecord",
            ),
            (
                ExerciseQuery::Settings {
                    latitude: 0.0,
                    longitude: 0.0,
                    run_type: 1,
                },
                "/exercise/exerciseSetting/2a36d143/getSetting",
            ),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").expect("listener");
            let origin = format!("http://{}/", listener.local_addr().expect("address"));
            let settings = matches!(query, ExerciseQuery::Settings { .. });
            let worker = thread::spawn(move || {
                let (mut stream, _) = listener.accept().expect("request");
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .expect("timeout");
                let mut request = Vec::new();
                let mut byte = [0; 1];
                while !request.ends_with(b"\r\n\r\n") {
                    stream.read_exact(&mut byte).expect("bytes");
                    request.push(byte[0]);
                    assert!(request.len() < 65536);
                }
                let request = String::from_utf8(request).expect("http text");
                let uri = request.split_whitespace().nth(1).expect("uri");
                let url = reqwest::Url::parse(&format!("http://school.example{uri}")).expect("url");
                assert_eq!(url.path(), path);
                let params: Vec<_> = url
                    .query_pairs()
                    .map(|(key, value)| (key.to_string(), Some(value.to_string())))
                    .collect();
                let protocol = Protocol::new("test-token", "test-app", 1700000000123);
                assert!(request.to_lowercase().contains(&format!(
                    "sign: {}\r\n",
                    protocol.sign_get(&params).expect("sign")
                )));
                assert!(
                    request
                        .to_lowercase()
                        .contains("authorization: bearer test-token\r\n")
                );
                let data = if settings {
                    let input = protocol
                        .decrypt(
                            params
                                .iter()
                                .find(|(key, _)| key == "param")
                                .expect("param")
                                .1
                                .as_deref()
                                .expect("value"),
                        )
                        .expect("request decrypt");
                    assert_eq!(input["latitude"], 0.0);
                    assert_eq!(input["runType"], 1);
                    assert_eq!(
                        input["signatureMD5"],
                        "7F:C0:22:E6:7C:7D:2A:CC:C3:C8:77:0A:46:13:8D:C3"
                    );
                    json!(
                        protocol
                            .pack(&json!({"totalRange":1,"step":"1000","extra":null}))
                            .expect("pack reply")
                            .param
                    )
                } else {
                    json!({"value":"2.020","extra":null,"access_token":"private"})
                };
                let body = json!({"code":0,"data":data}).to_string();
                write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).expect("reply");
            });
            let data = ExerciseClient { origin: &origin }
                .read(&session, &query, 1700000000123)
                .expect("read");
            assert!(data.get("access_token").is_none());
            assert!(data["extra"].is_null());
            if settings {
                assert_eq!(data["step"], "1000");
            } else {
                assert_eq!(data["value"], "2.020");
            }
            worker.join().expect("worker");
        }
    }

    #[test]
    fn invalid_settings_and_record_queries_fail_before_network() {
        for query in [
            ExerciseQuery::Settings {
                latitude: 91.0,
                longitude: 0.0,
                run_type: 1,
            },
            ExerciseQuery::Settings {
                latitude: 0.0,
                longitude: 0.0,
                run_type: 99,
            },
            ExerciseQuery::Records {
                status: String::new(),
                page: 1,
                date: String::new(),
            },
            ExerciseQuery::Records {
                status: "1".into(),
                page: 0,
                date: String::new(),
            },
            ExerciseQuery::Detail { id: String::new() },
        ] {
            assert_eq!(query.validate().expect_err("invalid").code, "invalid_input");
        }
    }
    #[test]
    fn errors_null_numbers_and_public_compatibility_are_classified() {
        assert_eq!(
            signature_metadata().expect("public MD5"),
            "7F:C0:22:E6:7C:7D:2A:CC:C3:C8:77:0A:46:13:8D:C3"
        );
        assert_eq!(scalar_number(&json!("2.02")), Some(2.02));
        assert_eq!(scalar_number(&Value::Null), None);
        assert_eq!(scalar_number(&json!("NaN")), None);
        assert!(
            parse_response(200, br#"{"code":"0","data":null}"#)
                .expect("null")
                .is_null()
        );
        assert_eq!(
            parse_response(200, b"<html>private</html>")
                .expect_err("HTML")
                .code,
            "invalid_response"
        );
        assert_eq!(
            parse_response(999, br#"{"code":1,"msg":"60004 private"}"#)
                .expect_err("version")
                .code,
            "client_outdated"
        );
        assert_eq!(
            parse_response(401, b"private").expect_err("expired").code,
            "session_expired"
        );
        assert_eq!(
            redact(
                json!({"access_token":"private","password":"private","clientSecret":"private","environment":{},"distance":"2.02","nested":{"refresh_token":"private","extra":null}})
            ),
            json!({"distance":"2.02","nested":{"extra":null}})
        );
    }
}
