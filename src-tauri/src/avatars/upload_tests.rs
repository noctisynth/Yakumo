use super::upload::*;
use crate::accounts::protocol::Session;
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
};

fn session() -> Session {
    Session {
        access_token: "test-token".into(),
        refresh_token: "synthetic-refresh".into(),
        user_id: "synthetic-user".into(),
        username: "synthetic-user".into(),
        raw_app_id: "test-app".into(),
        device_id: "synthetic-device".into(),
        expires_at: 1_800_000_000,
        avatar_url: None,
    }
}
const PNG: &str = "data:image/png;base64,iVBORw0KGgr7+/8=";

#[test]
fn h5_raw_base64_signature_matches_independent_aes_vector() {
    assert_eq!(
        h5_signature(&session(), "1700000000000", PNG).expect("sign"),
        "3de35fd5f3d6208a55b284df7f359182"
    );
    assert_ne!(
        h5_signature(&session(), "1700000000000", PNG).expect("sign"),
        h5_signature(&session(), "1700000000000", &PNG.replace('+', " ")).expect("sign")
    );
}

#[test]
fn single_encoded_upload_binds_avatar_and_does_not_call_legacy_save() {
    for (body, expected) in [
        (
            r#"{"code":0,"data":{"imageRoute":"/synthetic.png","imageRouteUrl":null}}"#,
            None,
        ),
        (
            r#"{"code":1,"msg":"private content"}"#,
            Some("avatar_upload_failed"),
        ),
        ("not-json", Some("avatar_upload_unknown")),
    ] {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let origin = format!("http://{}/", listener.local_addr().expect("address"));
        let worker = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("request");
            let mut bytes = Vec::new();
            let mut buffer = [0; 4096];
            loop {
                let count = stream.read(&mut buffer).expect("read");
                assert!(count > 0);
                bytes.extend_from_slice(&buffer[..count]);
                if let Some(end) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
                    let head = String::from_utf8_lossy(&bytes[..end]);
                    let length: usize = head
                        .lines()
                        .find_map(|line| {
                            line.to_lowercase()
                                .strip_prefix("content-length: ")
                                .map(str::to_owned)
                        })
                        .expect("length")
                        .parse()
                        .expect("number");
                    if bytes.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("response");
            String::from_utf8(bytes).expect("utf8")
        });
        let result = upload(&origin, &session(), 1_700_000_000, PNG);
        assert_eq!(result.err().map(|e| e.code), expected);
        let request = worker.join().expect("server");
        assert!(request.starts_with("POST /upms/basUserImage/uploadBase64Pic HTTP/1.1"));
        assert!(request.contains("bas64Pic=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgr7%2B%2F8%3D"));
        assert!(request.contains("sign: 3de35fd5f3d6208a55b284df7f359182"));
        assert!(request.contains("authorization: Bearer test-token"));
        assert!(!request.contains("%252B"));
    }
    assert_eq!(
        upload("http://127.0.0.1:1/", &session(), 100, "invalid")
            .expect_err("reject before network")
            .code,
        "invalid_avatar"
    );
}
