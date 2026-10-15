use std::{
    io::Read,
    net::{IpAddr, ToSocketAddrs},
    time::Duration,
};

use base64::{Engine, engine::general_purpose::STANDARD};

use reqwest::{Url, blocking::Client, redirect::Policy};

use crate::{
    accounts::error::{AccountError, AccountResult},
    accounts::protocol::{Session, headers, response},
};

const MAX_IMAGE: usize = 2 * 1024 * 1024;

fn unavailable() -> AccountError {
    AccountError::new("avatar_unavailable", "头像暂时无法读取，已保留账号占位。")
}

fn signature(token: &str, app_id: &str, timestamp: &str) -> AccountResult<String> {
    crate::exercise::protocol::sign::get_signature(app_id, token, timestamp, &[])
}

fn image_url(origin: &str, value: &str) -> AccountResult<Option<Url>> {
    if value.trim().is_empty() {
        return Ok(None);
    }
    if value.len() > 8192 || value.chars().any(char::is_control) {
        return Err(unavailable());
    }
    let mut url = Url::parse(origin)
        .and_then(|base| base.join(value.trim()))
        .map_err(|_| unavailable())?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str().is_none()
    {
        return Err(unavailable());
    }
    url.set_fragment(None);
    Ok(Some(url))
}

fn public_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(ip) => {
            let octets = ip.octets();
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_unspecified()
                && !ip.is_broadcast()
                && !ip.is_documentation()
                && !ip.is_multicast()
                && octets[0] != 0
                && octets[0] < 224
                && !(octets[0] == 100 && (64..=127).contains(&octets[1]))
                && !(octets[0] == 192 && octets[1] == 0 && octets[2] == 0)
                && !(octets[0] == 198 && (18..=19).contains(&octets[1]))
        }
        IpAddr::V6(ip) => {
            let segments = ip.segments();
            segments[0] & 0xe000 == 0x2000 && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
        }
    }
}

fn client_builder() -> reqwest::blocking::ClientBuilder {
    Client::builder()
        .redirect(Policy::none())
        .retry(reqwest::retry::never())
        .referer(false)
        .no_proxy()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
}

fn image_client(url: &Url, allow_local: bool) -> AccountResult<Client> {
    let host = url
        .host_str()
        .ok_or_else(unavailable)?
        .trim_start_matches('[')
        .trim_end_matches(']');
    let port = url.port_or_known_default().ok_or_else(unavailable)?;
    let addresses: Vec<_> = (host, port)
        .to_socket_addrs()
        .map_err(|_| unavailable())?
        .collect();
    if addresses.is_empty()
        || (!allow_local && addresses.iter().any(|address| !public_ip(address.ip())))
    {
        return Err(unavailable());
    }
    // Pin the checked addresses so a second DNS lookup cannot change the target.
    client_builder()
        .resolve_to_addrs(host, &addresses)
        .build()
        .map_err(|_| unavailable())
}

fn encode_image(bytes: &[u8], mime: &str) -> AccountResult<String> {
    let signature_matches = match mime {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(b"\xff\xd8\xff"),
        "image/gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "image/webp" => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"),
        _ => false,
    };
    if bytes.len() > MAX_IMAGE || !signature_matches {
        return Err(unavailable());
    }
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

pub fn valid_cached_avatar(value: &str) -> bool {
    let Some((prefix, encoded)) = value.split_once(",") else {
        return false;
    };
    let Some(mime) = prefix
        .strip_prefix("data:")
        .and_then(|text| text.strip_suffix(";base64"))
    else {
        return false;
    };
    if encoded.len() > MAX_IMAGE.div_ceil(3) * 4 {
        return false;
    }
    STANDARD
        .decode(encoded)
        .ok()
        .is_some_and(|bytes| encode_image(&bytes, mime).is_ok())
}

pub struct AccountIdentity {
    pub display_name: Option<String>,
    pub avatar: AccountResult<Option<String>>,
}
fn display_name(data: &serde_json::Map<String, serde_json::Value>) -> Option<String> {
    ["realName", "name", "nickName"]
        .iter()
        .filter_map(|key| data.get(*key).and_then(serde_json::Value::as_str))
        .map(str::trim)
        .find(|name| {
            !name.is_empty() && name.chars().count() <= 128 && !name.chars().any(char::is_control)
        })
        .map(str::to_owned)
}

pub struct AvatarReader<'a> {
    origin: &'a str,
    allow_local: bool,
}

impl<'a> AvatarReader<'a> {
    pub fn new(origin: &'a str) -> Self {
        Self {
            origin,
            allow_local: false,
        }
    }

    pub fn read(&self, session: &Session, now: u64) -> AccountResult<Option<String>> {
        if session.expires_at <= now {
            return Ok(None);
        }
        let data = self.profile(session, now)?;
        self.read_image(&data)
    }
    pub fn read_identity(&self, session: &Session, now: u64) -> AccountResult<AccountIdentity> {
        if session.expires_at <= now {
            return Err(unavailable());
        }
        let data = self.profile(session, now)?;
        Ok(AccountIdentity {
            display_name: display_name(&data),
            avatar: self.read_image(&data),
        })
    }
    fn profile(
        &self,
        session: &Session,
        now: u64,
    ) -> AccountResult<serde_json::Map<String, serde_json::Value>> {
        let timestamp = now.checked_mul(1000).ok_or_else(unavailable)?.to_string();
        let sign = signature(&session.access_token, &session.raw_app_id, &timestamp)?;
        let profile = response(
            client_builder()
                .build()
                .map_err(|_| unavailable())?
                .get(format!("{}upms/basUser/getLoginUserInfo", self.origin))
                .headers(headers(&session.device_id, false)?)
                .bearer_auth(&session.access_token)
                .header("timestamp", &timestamp)
                .header("sign", sign),
        )?;
        profile
            .get("data")
            .and_then(serde_json::Value::as_object)
            .cloned()
            .ok_or_else(unavailable)
    }
    fn read_image(
        &self,
        data: &serde_json::Map<String, serde_json::Value>,
    ) -> AccountResult<Option<String>> {
        let value = match data.get("imageRouteUrl") {
            None | Some(serde_json::Value::Null) => return Ok(None),
            Some(serde_json::Value::String(value)) => value,
            _ => return Err(unavailable()),
        };
        let Some(url) = image_url(self.origin, value)? else {
            return Ok(None);
        };
        // Never attach school authentication headers to image requests, including same-origin ones.
        let image = image_client(&url, self.allow_local)?
            .get(url)
            .header("Accept", "image/png,image/jpeg,image/gif,image/webp")
            .send()
            .map_err(|_| unavailable())?;
        if !image.status().is_success()
            || image
                .content_length()
                .is_some_and(|length| length > MAX_IMAGE as u64)
        {
            return Err(unavailable());
        }
        let mime = image
            .headers()
            .get("Content-Type")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(';').next())
            .ok_or_else(unavailable)?
            .trim()
            .to_ascii_lowercase();
        let mut bytes = Vec::new();
        image
            .take(MAX_IMAGE as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| unavailable())?;
        encode_image(&bytes, &mime).map(Some)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write, net::TcpListener, thread};

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

    fn server(
        profile: serde_json::Value,
        image: Option<(u16, &'static str, Vec<u8>)>,
    ) -> (String, thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("local listener");
        let origin = format!("http://{}/", listener.local_addr().expect("address"));
        let worker = thread::spawn(move || {
            let mut replies = vec![(200, "application/json", profile.to_string().into_bytes())];
            if let Some(image) = image {
                replies.push(image);
            }
            let mut requests = Vec::new();
            for (status, content_type, body) in replies {
                let (mut stream, _) = listener.accept().expect("request");
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .expect("timeout");
                let mut request = Vec::new();
                let mut byte = [0; 1];
                while !request.ends_with(b"\r\n\r\n") {
                    stream.read_exact(&mut byte).expect("read");
                    request.push(byte[0]);
                    assert!(request.len() < 65536);
                }
                requests.push(String::from_utf8(request).expect("request text"));
                write!(stream, "HTTP/1.1 {status} Test\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()).expect("headers");
                // Oversized bodies may be rejected before the client reads them.
                let _ = stream.write_all(&body);
            }
            requests
        });
        (origin, worker)
    }

    #[test]
    fn profile_name_prefers_real_name_and_keeps_nickname_as_fallback() {
        let value =
            serde_json::json!({"realName":"合成姓名","name":"其他姓名","nickName":"合成昵称"});
        assert_eq!(
            display_name(value.as_object().expect("object")).as_deref(),
            Some("合成姓名")
        );
        let value = serde_json::json!({"realName":"","name":null,"nickName":"合成昵称"});
        assert_eq!(
            display_name(value.as_object().expect("object")).as_deref(),
            Some("合成昵称")
        );
        let value = serde_json::json!({"realName":"bad\nname","nickName":123});
        assert!(display_name(value.as_object().expect("object")).is_none());
    }
    #[test]
    fn reads_actual_profile_field_with_signed_session_but_downloads_without_credentials() {
        let png = b"\x89PNG\r\n\x1a\nsynthetic".to_vec();
        let (origin, worker) = server(
            serde_json::json!({"code":0,"data":{"imageRouteUrl":"/avatar.png","avatarUrl":"ignored"}}),
            Some((200, "image/png", png.clone())),
        );
        let reader = AvatarReader {
            origin: &origin,
            allow_local: true,
        };
        assert_eq!(
            reader.read(&session(), 1_700_000_000).expect("avatar"),
            Some(encode_image(&png, "image/png").expect("encoded"))
        );
        let requests = worker.join().expect("worker");
        let profile = requests[0].to_lowercase();
        assert!(profile.starts_with("get /upms/basuser/getloginuserinfo http/1.1\r\n"));
        assert!(profile.contains("authorization: bearer test-token\r\n"));
        assert!(profile.contains("timestamp: 1700000000000\r\n"));
        assert!(profile.contains(&format!(
            "sign: {}\r\n",
            signature("test-token", "test-app", "1700000000000").expect("sign")
        )));
        let image = requests[1].to_lowercase();
        assert!(image.starts_with("get /avatar.png http/1.1\r\n"));
        for name in [
            "authorization:",
            "cookie:",
            "school:",
            "referer:",
            "sign:",
            "timestamp:",
        ] {
            assert!(!image.contains(name));
        }
    }

    #[test]
    fn empty_missing_and_null_avatar_are_normal_without_image_requests() {
        for data in [
            serde_json::json!({"imageRouteUrl":""}),
            serde_json::json!({"imageRouteUrl":null}),
            serde_json::json!({"headImageUrl":"ignored", "collectPhoto":"ignored", "avatarUrl":"ignored"}),
        ] {
            let (origin, worker) = server(serde_json::json!({"code":0,"data":data}), None);
            assert!(
                AvatarReader {
                    origin: &origin,
                    allow_local: true
                }
                .read(&session(), 100)
                .expect("no avatar")
                .is_none()
            );
            assert_eq!(worker.join().expect("worker").len(), 1);
        }
    }

    #[test]
    fn blocked_hosts_redirects_html_and_oversized_images_are_rejected() {
        let (origin, worker) = server(
            serde_json::json!({"code":0,"data":{"imageRouteUrl":"http://127.0.0.1/private.png"}}),
            None,
        );
        assert!(AvatarReader::new(&origin).read(&session(), 100).is_err());
        worker.join().expect("worker");
        for image in [
            (302, "image/png", Vec::new()),
            (200, "text/html", b"private-response".to_vec()),
            (200, "image/svg+xml", b"<svg/>".to_vec()),
            (200, "image/png", vec![0; MAX_IMAGE + 1]),
        ] {
            let (origin, worker) = server(
                serde_json::json!({"code":0,"data":{"imageRouteUrl":"/avatar.png"}}),
                Some(image),
            );
            assert!(
                AvatarReader {
                    origin: &origin,
                    allow_local: true
                }
                .read(&session(), 100)
                .is_err()
            );
            worker.join().expect("worker");
        }
        assert!(
            AvatarReader::new("http://127.0.0.1:1/")
                .read(&session(), 1_900_000_000)
                .expect("expired no request")
                .is_none()
        );
    }

    #[test]
    fn signature_matches_recovered_derivations() {
        assert_eq!(
            signature("test-token", "test-app", "1700000000123").expect("signed GET"),
            "587d94e43d9e1a24dd6d78c2a959fbb5"
        );
        assert_eq!(
            crate::exercise::protocol::sign::fingerprint(
                b"test-apptest-token1700000000123",
                "test-token"
            )
            .expect("derive"),
            "3af3a313ee0c47461187784299bac29b"
        );
        assert_eq!(
            crate::exercise::protocol::sign::fingerprint(b"test-token1700000000123", "test-token")
                .expect("derive"),
            "5f63882c88c1985206573379a519a6e7"
        );
    }

    #[test]
    fn resolves_supported_addresses_and_rejects_unsafe_schemes() {
        let origin = "https://school.example/";
        assert_eq!(
            image_url(origin, "/images/me.png")
                .expect("relative")
                .expect("url")
                .as_str(),
            "https://school.example/images/me.png"
        );
        assert_eq!(
            image_url(origin, "//cdn.example/a.png")
                .expect("protocol relative")
                .expect("url")
                .as_str(),
            "https://cdn.example/a.png"
        );
        assert!(image_url(origin, "  ").expect("empty").is_none());
        for url in [
            "file:///secret",
            "data:image/svg+xml,secret",
            "javascript:secret",
            "https://user:secret@cdn.example/a.png",
        ] {
            assert!(image_url(origin, url).is_err());
        }
        for address in [
            "127.0.0.1",
            "10.0.0.1",
            "169.254.169.254",
            "100.64.0.1",
            "198.18.0.1",
            "::1",
            "fc00::1",
            "::ffff:127.0.0.1",
        ] {
            assert!(!public_ip(address.parse().expect("ip")));
        }
        assert!(public_ip("1.1.1.1".parse().expect("ip")));
    }

    #[test]
    fn cache_allows_only_bounded_raster_images() {
        let png = b"\x89PNG\r\n\x1a\nsynthetic";
        let cached = encode_image(png, "image/png").expect("png");
        assert!(valid_cached_avatar(&cached));
        let mut large_png = vec![0; 283_184];
        large_png[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        assert!(valid_cached_avatar(
            &encode_image(&large_png, "image/png").expect("observed-size PNG")
        ));
        assert!(!valid_cached_avatar("https://cdn.example/private.png"));
        assert!(encode_image(b"<svg/>", "image/svg+xml").is_err());
        assert!(encode_image(b"<html/>", "image/png").is_err());
        assert!(encode_image(&vec![0; MAX_IMAGE + 1], "image/png").is_err());
    }
}
