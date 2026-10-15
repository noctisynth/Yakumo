use crate::{
    account_error::{AccountError, AccountResult},
    account_protocol::{Session, headers},
    exercise_protocol::Protocol,
    exercise_service::{ExerciseClient, ExerciseQuery, scalar_number},
    run_generator::{RunInput, generate},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::HashMap, io::Read, time::Duration};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub id: String,
    pub digest: String,
    pub identify: String,
    pub state: String,
    pub message: String,
    pub record_id: Option<String>,
    pub created_at: u64,
    pub algorithm: String,
    pub source: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Attempt {
    pub owner: String,
    pub receipt: Receipt,
}
pub struct Ticket {
    pub algorithm: String,
    pub account_id: String,
    pub digest: String,
    pub identify: String,
    pub payload: Value,
    pub created_at: u64,
}
#[derive(Default)]
pub struct PreparedRuns {
    pub tickets: HashMap<String, Ticket>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preparation {
    pub ticket: Option<String>,
    pub blockers: Vec<String>,
    pub notes: Vec<String>,
    pub expires_at: u64,
}
fn failed(message: &'static str) -> AccountError {
    AccountError::new("submission_blocked", message)
}
fn number(settings: &Value, key: &str) -> Option<f64> {
    scalar_number(&settings[key])
}
fn empty_array(settings: &Value, key: &str) -> bool {
    settings[key].as_array().is_some_and(Vec::is_empty)
}
fn rule(settings: &Value, key: &str) -> Option<bool> {
    match settings[key].as_str() {
        Some("0") => Some(false),
        Some("1") => Some(true),
        _ => match settings[key].as_i64() {
            Some(0) => Some(false),
            Some(1) => Some(true),
            _ => None,
        },
    }
}
pub fn prepare(
    session: &Session,
    account_id: String,
    input: RunInput,
    now: u64,
    origin: &str,
) -> AccountResult<(Preparation, Option<Ticket>)> {
    let preview = generate(input)?;
    let input = &preview.input;
    let settings = ExerciseClient { origin }
        .read(
            session,
            &ExerciseQuery::Settings {
                latitude: input.latitude,
                longitude: input.longitude,
                run_type: 1,
            },
            now,
        )
        .map_err(|e| AccountError::new(e.code, e.message))?;
    prepare_settings(account_id, preview, &settings, session, now)
}
fn prepare_settings(
    account_id: String,
    preview: crate::run_generator::RunPreview,
    settings: &Value,
    session: &Session,
    now: u64,
) -> AccountResult<(Preparation, Option<Ticket>)> {
    let input = &preview.input;
    let mut blockers = Vec::new();
    if preview.end_time > now || now.saturating_sub(preview.end_time) > 7 * 86400000 {
        blockers.push("运动须已结束，且结束时间在最近 7 天内（本客户端限制）。".into());
    }
    for (key, label) in [
        ("isStartFace", "开始人脸"),
        ("isEndFace", "结束人脸"),
        ("isMidwayFace", "中途人脸"),
        ("needRegisterFace", "人脸注册"),
    ] {
        if rule(settings, key) != Some(false) {
            blockers.push(format!(
                "学校要求{label}，或未明确返回关闭状态；首版未实现该流程。"
            ));
        }
    }
    for (key, label) in [
        ("list", "必经点"),
        ("geofence", "围栏"),
        ("middleFaces", "中途人脸"),
    ] {
        if !empty_array(settings, key) {
            blockers.push(format!("{label}非空或结构未知，首版暂不支持。"));
        }
    }
    if rule(settings, "isStepRecursion") != Some(false) {
        blockers.push("递增步数规则已启用或未知，尚不能完整验证。".into());
    }
    if number(settings, "runType") != Some(1.0)
        || rule(settings, "isSequencePoint") != Some(false)
        || rule(settings, "isSpeedRangeCheck") != Some(false)
    {
        blockers.push("运动类型、顺序检查或速度范围规则未处于首版支持范围。".into());
    }
    for key in ["limitSpeed", "endStride", "endLimitStepFrequency"] {
        if number(settings, key).is_none() {
            blockers.push("学校阈值字段缺失或无法解析，无法构造完整请求。".into());
            break;
        }
    }
    let range = number(settings, "totalRange");
    let steps = number(settings, "step");
    let min = number(settings, "startQualifiedTime");
    let max = number(settings, "endQualifiedTime");
    match (range, steps, min, max) {
        (Some(r), Some(s), Some(lo), Some(hi))
            if r > 0.0 && s >= 0.0 && lo >= 0.0 && (hi == -1.0 || hi >= lo) =>
        {
            if (input.distance_m / 10.0).floor() / 100.0 < r
                || (input.steps as f64) < s
                || (input.duration_s as f64) < lo * 60.0
                || (hi != -1.0 && input.duration_s as f64 > hi * 60.0)
            {
                blockers.push("距离、步数或时长未满足当前基础要求；首版采用保守区间检查。".into());
            }
        }
        _ => blockers.push("学校基础距离、时长或步数要求不完整。".into()),
    }
    let identify = settings["identify"]
        .as_str()
        .filter(|v| !v.is_empty() && v.len() <= 128 && !v.chars().any(char::is_control))
        .map(str::to_owned)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let preparation = Preparation {
        ticket: None,
        blockers,
        notes: vec![
            "轨迹为合成数据；服务端可能拒绝或判定无效。".into(),
            format!(
                "协议上报距离向下保留两位公里：{:.2} km。",
                (input.distance_m / 10.0).floor() / 100.0
            ),
            "不执行开始接口、真实定位或人脸流程；不伪造设备环境证明。".into(),
            "HTTP 明文入口会传输账号认证与运动数据。".into(),
        ],
        expires_at: now + 300000,
    };
    if !preparation.blockers.is_empty() {
        return Ok((preparation, None));
    }
    let as_text = |key: &str| match &settings[key] {
        Value::String(v) => v.clone(),
        Value::Number(v) => v.to_string(),
        _ => String::new(),
    };
    let points: Vec<Value> = preview
        .points
        .iter()
        .map(|p| json!({"a":p.a,"o":p.o,"t":p.t,"s":p.s,"i":p.i,"c":p.c,"e":p.e,"f":true}))
        .collect();
    let stringify =
        |value: &Value| serde_json::to_string(value).map_err(|_| failed("生成载荷失败。"));
    let reported_km = (input.distance_m / 10.0).floor() / 100.0;
    let payload = json!({"sportType":1,"startTime":input.start_time,"endTime":preview.end_time,"sportTime":input.duration_s,"sportRange":format!("{reported_km:.2}"),"gpsDistance":format!("{reported_km:.2}"),"speed":preview.pace,"avgSpeed":format!("{:.2}",preview.average_kmh),"brand":"Yakumo","model":"Synthetic","system":std::env::consts::OS,"version":"unknown","appVersion":"2.0.22","appType":"Android","versionCode":20220,"versionName":"2.0.22","signatureMD5":crate::exercise_service::signature_metadata().map_err(|_|failed("兼容材料不可用。"))?,"uniqueCode":session.device_id,"pointList":stringify(&settings["list"] )?,"geofence":stringify(&settings["geofence"] )?,"isSequencePoint":as_text("isSequencePoint"),"stepNumbers":stringify(&json!(preview.step_buckets))?,"gitudeLatitude":stringify(&json!(points))?,"okPointList":"[]","isFaceStatus":"0","uploadType":0,"identify":identify,"limitSpeed":as_text("limitSpeed"),"limitStride":as_text("endStride"),"limitStepFrequency":as_text("endLimitStepFrequency"),"f":preview.points.len(),"m":0,"h":0,"isValid":1});
    Ok((
        preparation,
        Some(Ticket {
            algorithm: preview.algorithm.into(),
            account_id,
            digest: preview.digest,
            identify,
            payload,
            created_at: now,
        }),
    ))
}
pub fn send(
    session: &Session,
    ticket: &Ticket,
    receipt: &Receipt,
    now: u64,
    origin: &str,
) -> Receipt {
    let mut outcome = receipt.clone();
    let protocol = Protocol::new(&session.access_token, &session.raw_app_id, now);
    let response = (|| -> Result<(u16, Vec<u8>), ()> {
        let envelope = protocol.pack(&ticket.payload).map_err(|_| ())?;
        let form = protocol.double_form(&envelope).map_err(|_| ())?;
        let client = reqwest::blocking::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .no_proxy()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(25))
            .build()
            .map_err(|_| ())?;
        let response = client
            .post(format!(
                "{origin}exercise/exerciseRecord/2a36d143/addExerciseRecord"
            ))
            .headers(headers(&session.device_id, false).map_err(|_| ())?)
            .bearer_auth(&session.access_token)
            .header("timestamp", now.to_string())
            .header("sign", form.sign)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(form.body)
            .send()
            .map_err(|_| ())?;
        let status = response.status().as_u16();
        let mut body = Vec::new();
        response
            .take(1024 * 1024 + 1)
            .read_to_end(&mut body)
            .map_err(|_| ())?;
        if body.len() > 1024 * 1024 {
            return Err(());
        }
        Ok((status, body))
    })();
    match response {
        Ok((status, body)) => {
            let (state, message, id) = classify(status, &body);
            outcome.state = state.into();
            outcome.message = message.into();
            outcome.record_id = id;
        }
        Err(()) => {
            outcome.state = "unknown".into();
            outcome.message = "连接或响应失败，结果不确定。请先核对学校记录，勿重传。".into();
        }
    }
    outcome
}
fn classify(status: u16, body: &[u8]) -> (&'static str, &'static str, Option<String>) {
    let unknown = (
        "unknown",
        "未获得可识别回执，结果不确定。请核对学校记录，勿重传。",
        None,
    );
    let Ok(value) = serde_json::from_slice::<Value>(body) else {
        return unknown;
    };
    if !(200..300).contains(&status) {
        return unknown;
    }
    match scalar_number(&value["code"]) {
        Some(0.0) => {
            let id = value["exerciseRecordId"]
                .as_str()
                .or_else(|| value["data"]["exerciseRecordId"].as_str())
                .filter(|v| !v.is_empty() && v.len() <= 128 && !v.chars().any(char::is_control))
                .map(str::to_owned);
            if id.is_none() && value["data"] != true {
                return unknown;
            }
            (
                "accepted",
                "学校已确认接收；入库、合格与统计仍需分别核对。",
                id,
            )
        }
        Some(n) if n.fract() == 0.0 => (
            "rejected",
            "学校明确拒绝本次提交；该草稿已锁定，核对后再处理。",
            None,
        ),
        _ => unknown,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn sample_session() -> Session {
        Session {
            access_token: "synthetic-token".into(),
            refresh_token: "synthetic-refresh".into(),
            user_id: "synthetic-user".into(),
            username: "synthetic-user".into(),
            raw_app_id: "synthetic-app".into(),
            device_id: "synthetic-device".into(),
            expires_at: 1800000000,
            avatar_url: None,
        }
    }
    fn sample_preview() -> crate::run_generator::RunPreview {
        generate(RunInput {
            route: vec![],
            seed: "synthetic".into(),
            start_time: 1700000000000,
            latitude: 0.0,
            longitude: 0.0,
            distance_m: 2021.0,
            duration_s: 899,
            steps: 2397,
            laps: 5,
        })
        .expect("preview")
    }
    fn sample_settings() -> Value {
        json!({"runType":"1","totalRange":1,"step":"1000","startQualifiedTime":4,"endQualifiedTime":20,"isStartFace":"0","isEndFace":"0","isMidwayFace":"0","needRegisterFace":"0","isStepRecursion":"0","isSequencePoint":"0","isSpeedRangeCheck":"0","list":[],"geofence":[],"middleFaces":[],"limitSpeed":"3.33","endStride":"2.3","endLimitStepFrequency":"300"})
    }
    #[test]
    fn unsupported_requirements_and_unknowns_block_preparation() {
        let session = sample_session();
        for settings in [json!({}), json!({"isStartFace":"1"}), Value::Null] {
            let (result, ticket) = prepare_settings(
                "synthetic-account".into(),
                sample_preview(),
                &settings,
                &session,
                1700000900000,
            )
            .expect("prepare");
            assert!(!result.blockers.is_empty());
            assert!(ticket.is_none());
        }
        let (result, ticket) = prepare_settings(
            "synthetic-account".into(),
            sample_preview(),
            &sample_settings(),
            &session,
            1700000900000,
        )
        .expect("prepare");
        assert!(result.blockers.is_empty());
        let ticket = ticket.expect("ticket");
        assert_eq!(ticket.payload["sportRange"], "2.02");
        assert!(ticket.payload.get("environment").is_none());
        assert_eq!(ticket.payload["isFaceStatus"], "0");
        let points: Value =
            serde_json::from_str(ticket.payload["gitudeLatitude"].as_str().expect("text"))
                .expect("points");
        assert_eq!(points[0]["f"], true);
        assert_eq!(points.as_array().expect("array").len(), 900);
    }
    #[test]
    fn post_transport_uses_same_snapshot_and_double_form() {
        use std::{io::Write, net::TcpListener, thread};
        let session = sample_session();
        let (_, ticket) = prepare_settings(
            "synthetic-account".into(),
            sample_preview(),
            &sample_settings(),
            &session,
            1700000900000,
        )
        .expect("prepare");
        let ticket = ticket.expect("ticket");
        let listener = TcpListener::bind("127.0.0.1:0").expect("listener");
        let origin = format!("http://{}/", listener.local_addr().expect("address"));
        let worker = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .expect("timeout");
            let mut request = Vec::new();
            let mut byte = [0];
            while !request.ends_with(b"\r\n\r\n") {
                stream.read_exact(&mut byte).expect("headers");
                request.push(byte[0]);
                assert!(request.len() < 65536);
            }
            let headers = String::from_utf8(request)
                .expect("header text")
                .to_lowercase();
            assert!(
                headers.starts_with("post /exercise/exerciserecord/2a36d143/addexerciserecord ")
            );
            assert!(headers.contains("authorization: bearer synthetic-token"));
            let len = headers
                .lines()
                .find_map(|l| l.strip_prefix("content-length: "))
                .expect("length")
                .parse::<usize>()
                .expect("number");
            let mut body = vec![0; len];
            stream.read_exact(&mut body).expect("body");
            let body = String::from_utf8(body).expect("form");
            assert!(body.contains("%25"));
            let url =
                reqwest::Url::parse(&format!("http://school.example/?{body}")).expect("formurl");
            let fields: Vec<_> = url.query_pairs().into_owned().collect();
            let protocol = Protocol::new("synthetic-token", "synthetic-app", 1700000900000);
            assert!(headers.contains(&format!(
                "sign: {}",
                protocol.sign_form(&fields).expect("sign")
            )));
            let param = &fields.iter().find(|(k, _)| k == "param").expect("param").1;
            let decoded = reqwest::Url::parse(&format!("http://school.example/?v={param}"))
                .expect("url")
                .query_pairs()
                .next()
                .expect("raw")
                .1
                .into_owned();
            let payload = protocol.decrypt(&decoded).expect("decrypt");
            assert_eq!(payload["sportTime"], 899);
            assert_eq!(payload["sportRange"], "2.02");
            let body = r#"{"code":0,"data":true,"exerciseRecordId":"synthetic-record"}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .expect("response");
        });
        let receipt = Receipt {
            id: "synthetic-receipt".into(),
            digest: ticket.digest.clone(),
            identify: ticket.identify.clone(),
            state: "unknown".into(),
            message: String::new(),
            record_id: None,
            created_at: 1700000900000,
            algorithm: "circle-v1".into(),
            source: "synthetic".into(),
        };
        let outcome = send(&session, &ticket, &receipt, 1700000900000, &origin);
        assert_eq!(outcome.state, "accepted");
        assert_eq!(outcome.record_id.as_deref(), Some("synthetic-record"));
        worker.join().expect("worker");
    }
    #[test]
    fn outcomes_do_not_equate_ack_with_validity() {
        assert_eq!(
            classify(
                200,
                br#"{"code":0,"data":true,"exerciseRecordId":"synthetic-record"}"#
            )
            .0,
            "accepted"
        );
        assert_eq!(
            classify(200, br#"{"code":"1","msg":"private"}"#).0,
            "rejected"
        );
        for (s, b) in [
            (500, b"error".as_slice()),
            (200, b"<html>private</html>"),
            (200, b"{}"),
            (200, br#"{"code":0,"data":false}"#),
        ] {
            assert_eq!(classify(s, b).0, "unknown");
        }
    }
}
