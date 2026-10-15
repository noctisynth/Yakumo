use super::*;
use base64::Engine;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

#[derive(Clone, Default)]
struct TestStorage {
    data: Arc<Mutex<Option<AccountData>>>,
    fail: Arc<AtomicBool>,
}

impl AccountStorage for TestStorage {
    fn load(&self) -> AccountResult<AccountData> {
        if self.fail.load(Ordering::SeqCst) {
            return Err(AccountError::storage());
        }
        Ok(self
            .data
            .lock()
            .expect("test mutex")
            .clone()
            .unwrap_or_default())
    }
    fn save(&self, data: &AccountData) -> AccountResult<()> {
        if self.fail.load(Ordering::SeqCst) {
            return Err(AccountError::storage());
        }
        *self.data.lock().expect("test mutex") = Some(data.clone());
        Ok(())
    }
}

struct TestAuthentication;
impl Authentication for TestAuthentication {
    fn identity(
        &self,
        session: &Session,
        now: u64,
    ) -> AccountResult<crate::avatars::reader::AccountIdentity> {
        Ok(crate::avatars::reader::AccountIdentity {
            display_name: if session.username.starts_with("named-") {
                Some(format!("合成姓名-{}", session.username))
            } else {
                None
            },
            avatar: Ok(self.avatar(session, now)?),
        })
    }
    fn avatar(&self, session: &Session, _now: u64) -> AccountResult<Option<String>> {
        if session.username == "avatar-failure" {
            return Err(AccountError::protocol());
        }
        if session.username.starts_with("avatar-") {
            return Ok(Some(format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(
                    [b"\x89PNG\r\n\x1a\n".as_slice(), session.username.as_bytes()].concat()
                )
            )));
        }
        Ok(None)
    }
    fn login(
        &self,
        username: &str,
        password: &str,
        device_id: &str,
        now: u64,
    ) -> AccountResult<Session> {
        if password == "rejected" {
            return Err(AccountError::new("authentication_rejected", "登录失败。"));
        }
        Ok(Session {
            access_token: format!("synthetic-access-{username}-{password}"),
            refresh_token: format!("synthetic-refresh-{username}"),
            user_id: username.to_string(),
            username: username.to_string(),
            device_id: device_id.to_string(),
            raw_app_id: "synthetic-app".into(),
            expires_at: now + 3600,
            avatar_url: None,
        })
    }
}

#[test]
fn account_names_are_cached_and_isolated_across_restart() {
    let storage = TestStorage::default();
    let mut app = manager(&storage);
    let a = app
        .login(input("named-a", "one"), 100)
        .expect("a")
        .active_id
        .expect("a id");
    app.login(input("named-b", "two"), 100).expect("b");
    let mut restored = manager(&storage);
    let snapshot = restored.list(100).expect("snapshot");
    let name = snapshot
        .accounts
        .iter()
        .find(|p| p.id == a)
        .expect("a")
        .display_name
        .as_deref();
    assert_eq!(name, Some("合成姓名-named-a"));
    assert_ne!(
        snapshot.accounts[0].display_name,
        snapshot.accounts[1].display_name
    );
}
#[test]
fn studio_presets_persist_isolate_and_preserve_data_on_failure() {
    use crate::studio::presets::{PresetAction, PresetConfig};
    let storage = TestStorage::default();
    let mut app = manager(&storage);
    let a = app
        .login(input("synthetic-a", "one"), 100)
        .expect("login")
        .active_id
        .expect("id");
    let config:PresetConfig=serde_json::from_value(serde_json::json!({"route":[{"latitude":0,"longitude":0},{"latitude":0,"longitude":0.002},{"latitude":0.002,"longitude":0.002}],"latitude":0,"longitude":0,"closeLoop":true,"coordinateNoiseM":0.8,"paceSecondsPerKm":450,"cadence":160,"distanceM":2000.3,"durationS":900,"steps":2400,"laps":5,"offsets":{"distanceM":[-30,30],"durationS":[-15,15],"steps":[-50,50],"laps":[0,0],"positionM":[0,0],"startMinutes":[0,0]}})).expect("config");
    let saved = app
        .studio_presets(
            &a,
            PresetAction::Save {
                id: None,
                name: "合成预设".into(),
                config: config.clone(),
            },
            100,
        )
        .expect("save");
    let id = saved[0].id.clone();
    let b = app
        .login(input("synthetic-b", "two"), 100)
        .expect("login b")
        .active_id
        .expect("id b");
    assert!(
        app.studio_presets(&b, PresetAction::List, 100)
            .expect("list b")
            .is_empty()
    );
    assert!(
        app.studio_presets(&b, PresetAction::Remove { id: id.clone() }, 100)
            .is_err()
    );
    app.switch(&a, 100).expect("switch");
    storage.fail.store(true, Ordering::SeqCst);
    assert!(
        app.studio_presets(
            &a,
            PresetAction::Save {
                id: Some(id.clone()),
                name: "失败更新".into(),
                config: config.clone()
            },
            100
        )
        .is_err()
    );
    storage.fail.store(false, Ordering::SeqCst);
    assert_eq!(
        app.studio_presets(&a, PresetAction::List, 100)
            .expect("preserved")[0]
            .name,
        "合成预设"
    );
    let mut restarted = manager(&storage);
    assert_eq!(
        restarted
            .studio_presets(&a, PresetAction::List, 100)
            .expect("restart")[0]
            .config
            .distance_m,
        2000.3
    );
    assert_eq!(
        restarted
            .studio_presets(&a, PresetAction::List, 100)
            .expect("route restored")[0]
            .config
            .route
            .len(),
        3
    );
    let renamed = restarted
        .studio_presets(
            &a,
            PresetAction::Save {
                id: Some(id.clone()),
                name: "新名称".into(),
                config,
            },
            100,
        )
        .expect("rename");
    assert_eq!(renamed[0].name, "新名称");
    assert!(
        restarted
            .studio_presets(&a, PresetAction::Remove { id }, 100)
            .expect("remove")
            .is_empty()
    );
    assert!(
        restarted
            .studio_presets(&a, PresetAction::List, 4001)
            .is_err()
    );
}

#[test]
fn submission_journal_survives_restart_isolates_users_and_blocks_duplicates() {
    let storage = TestStorage::default();
    let mut app = manager(&storage);
    let id = app
        .login(input("synthetic-a", "one"), 100)
        .expect("login")
        .active_id
        .expect("id");
    let ticket = crate::studio::submission::Ticket {
        algorithm: "waypoints-v1".into(),
        account_id: id.clone(),
        digest: "a".repeat(64),
        identify: "synthetic-identify".into(),
        payload: serde_json::json!({}),
        created_at: 100000,
    };
    storage.fail.store(true, Ordering::SeqCst);
    assert!(app.reserve(&id, &ticket, 100000).is_err());
    assert!(app.receipts(&id, 100).expect("empty").is_empty());
    storage.fail.store(false, Ordering::SeqCst);
    let (_, mut receipt) = app.reserve(&id, &ticket, 100000).expect("reserve");
    assert_eq!(receipt.algorithm, "waypoints-v1");
    assert!(app.reserve(&id, &ticket, 100000).is_err());
    let mut restarted = manager(&storage);
    assert!(restarted.reserve(&id, &ticket, 100000).is_err());
    assert_eq!(
        restarted.receipts(&id, 100).expect("history")[0].state,
        "unknown"
    );
    let b = restarted
        .login(input("synthetic-b", "two"), 100)
        .expect("b")
        .active_id
        .expect("id");
    assert!(restarted.receipts(&b, 100).expect("b history").is_empty());
    restarted.switch(&id, 100).expect("switch");
    receipt.state = "accepted".into();
    receipt.record_id = Some("synthetic-record".into());
    storage.fail.store(true, Ordering::SeqCst);
    assert!(
        restarted
            .finish_submission(receipt.clone(), 100000)
            .is_err()
    );
    assert_eq!(
        restarted.receipts(&id, 100).expect("uncertain")[0].state,
        "unknown"
    );
    storage.fail.store(false, Ordering::SeqCst);
    assert_eq!(
        manager(&storage)
            .receipts(&id, 100)
            .expect("durable uncertain")[0]
            .state,
        "unknown"
    );
    restarted
        .finish_submission(receipt, 100000)
        .expect("finish");
    assert!(restarted.reserve(&id, &ticket, 100000).is_err());
    assert_eq!(
        manager(&storage).receipts(&id, 100).expect("restored")[0]
            .record_id
            .as_deref(),
        Some("synthetic-record")
    );
}

fn manager(storage: &TestStorage) -> AccountManager {
    AccountManager::new(Box::new(storage.clone()), Box::new(TestAuthentication))
}
fn input(username: &str, password: &str) -> LoginInput {
    LoginInput {
        school: "swpu".into(),
        username: username.into(),
        password: password.into(),
        allow_insecure_transport: true,
    }
}

#[test]
fn explicit_avatar_refresh_replaces_cache_and_rejects_stale_sessions() {
    use crate::avatars::reader::AccountIdentity;
    let storage = TestStorage::default();
    let mut app = manager(&storage);
    let id = app
        .login(input("synthetic-a", "one"), 100)
        .expect("login")
        .active_id
        .expect("id");
    let session = app.active_session(&id, 100).expect("session");
    let png = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(b"\x89PNG\r\n\x1a\nsynthetic-new-avatar")
    );
    let identity = || AccountIdentity {
        display_name: Some("合成姓名".into()),
        avatar: Ok(Some(png.clone())),
    };
    let snapshot = app
        .apply_identity(&id, &session, identity(), 100)
        .expect("refresh");
    assert_eq!(
        snapshot.accounts[0].avatar_url.as_deref(),
        Some(png.as_str())
    );
    assert_eq!(
        manager(&storage)
            .data()
            .expect("restored cache")
            .snapshot(100)
            .accounts[0]
            .avatar_url
            .as_deref(),
        Some(png.as_str())
    );
    storage.fail.store(true, Ordering::SeqCst);
    assert!(
        app.apply_identity(
            &id,
            &session,
            AccountIdentity {
                display_name: None,
                avatar: Ok(None)
            },
            100
        )
        .is_err()
    );
    storage.fail.store(false, Ordering::SeqCst);
    assert_eq!(
        app.list(100).expect("unchanged").accounts[0]
            .avatar_url
            .as_deref(),
        Some(png.as_str())
    );
    app.login(input("synthetic-a", "new-session"), 101)
        .expect("relogin");
    assert!(app.apply_identity(&id, &session, identity(), 101).is_err());
}

#[test]
fn two_accounts_switch_restore_and_remove_without_crossing_sessions() {
    let storage = TestStorage::default();
    let mut app = manager(&storage);
    let first = app
        .login(input("synthetic-a", "one"), 100)
        .expect("login a")
        .active_id
        .expect("active a");
    let second = app
        .login(input("synthetic-b", "two"), 100)
        .expect("login b")
        .active_id
        .expect("active b");
    assert_ne!(first, second);
    let snapshot = app.switch(&first, 200).expect("switch a");
    assert_eq!(snapshot.active_id.as_deref(), Some(first.as_str()));
    assert_eq!(snapshot.accounts.len(), 2);
    let native = app.data().expect("data");
    assert!(
        native.accounts[0]
            .session
            .access_token
            .contains("synthetic-a-one")
    );
    assert!(
        native.accounts[1]
            .session
            .access_token
            .contains("synthetic-b-two")
    );
    let public = serde_json::to_string(&snapshot).expect("public json");
    for secret in [
        "access_token",
        "refresh_token",
        "raw_app_id",
        "device_id",
        "synthetic-access",
        "synthetic-refresh",
    ] {
        assert!(!public.contains(secret));
    }
    let mut restarted = manager(&storage);
    assert_eq!(
        restarted.list(200).expect("restored").active_id,
        Some(first.clone())
    );
    let removed = restarted.remove(&first, 200).expect("remove active");
    assert_eq!(removed.active_id, None);
    assert_eq!(removed.accounts.len(), 1);
    assert_eq!(removed.accounts[0].id, second);
    restarted.remove(&second, 200).expect("remove last");
    assert!(
        manager(&storage)
            .list(200)
            .expect("empty restored")
            .accounts
            .is_empty()
    );
}

#[test]
fn relogin_updates_in_place_and_failure_preserves_active_account() {
    let storage = TestStorage::default();
    let mut app = manager(&storage);
    let first = app
        .login(input("synthetic-a", "one"), 100)
        .expect("login")
        .active_id;
    let device = app.data().expect("data").accounts[0]
        .session
        .device_id
        .clone();
    app.login(input("synthetic-b", "two"), 100)
        .expect("login b");
    let next = app
        .login(input("synthetic-a", "new"), 200)
        .expect("relogin");
    assert_eq!(next.active_id, first);
    assert_eq!(next.accounts.len(), 2);
    assert_eq!(
        app.data().expect("data").accounts[0].session.device_id,
        device
    );
    assert!(app.login(input("synthetic-b", "rejected"), 200).is_err());
    assert_eq!(app.list(200).expect("unchanged").active_id, first);
    assert!(app.switch("unknown", 200).is_err());
    assert!(app.switch(first.as_deref().expect("id"), 4000).is_err());
    assert!(app.list(4000).expect("expired").accounts[0].expired);
}

#[test]
fn storage_failures_do_not_commit_or_erase_and_loading_can_retry() {
    let storage = TestStorage::default();
    let mut app = manager(&storage);
    let first = app
        .login(input("synthetic-a", "one"), 100)
        .expect("login")
        .active_id
        .expect("id");
    storage.fail.store(true, Ordering::SeqCst);
    assert!(app.login(input("synthetic-b", "two"), 100).is_err());
    assert!(app.remove(&first, 100).is_err());
    assert_eq!(app.list(100).expect("memory retained").accounts.len(), 1);
    let mut restarted = manager(&storage);
    assert!(restarted.list(100).is_err());
    storage.fail.store(false, Ordering::SeqCst);
    assert_eq!(restarted.list(100).expect("retry").active_id, Some(first));
}

#[test]
fn invalid_credentials_and_missing_transport_consent_are_rejected() {
    let mut app = manager(&TestStorage::default());
    let mut request = input("synthetic-a", "one");
    request.allow_insecure_transport = false;
    assert!(app.login(request, 100).is_err());
    assert!(app.login(input("  ", "one"), 100).is_err());
    assert!(app.login(input("synthetic-a", ""), 100).is_err());
    let mut request = input("synthetic-a", "one");
    request.school = "unsupported".into();
    assert!(app.login(request, 100).is_err());
    assert!(app.list(100).expect("empty").accounts.is_empty());
}

#[test]
fn reads_use_an_immutable_active_account_snapshot() {
    let storage = TestStorage::default();
    let mut app = manager(&storage);
    let a = app
        .login(input("synthetic-a", "one"), 100)
        .expect("login")
        .active_id
        .expect("id");
    let snapshot = app.active_session(&a, 100).expect("snapshot");
    let b = app
        .login(input("synthetic-b", "two"), 100)
        .expect("login")
        .active_id
        .expect("id");
    assert_eq!(snapshot.user_id, "synthetic-a");
    assert_eq!(
        app.active_session(&a, 100).err().expect("changed").code,
        "account_changed"
    );
    assert_eq!(
        app.active_session(&b, 4000).err().expect("expired").code,
        "session_expired"
    );
}

#[test]
fn avatars_are_isolated_persisted_and_optional_without_blocking_login() {
    let storage = TestStorage::default();
    let mut app = manager(&storage);
    let first = app.login(input("avatar-a", "one"), 100).expect("login a");
    let avatar_a = first.accounts[0].avatar_url.clone().expect("avatar a");
    let second = app.login(input("avatar-b", "two"), 100).expect("login b");
    assert_ne!(second.accounts[1].avatar_url.as_ref(), Some(&avatar_a));
    let id = first.active_id.expect("first id");
    assert_eq!(
        app.switch(&id, 100).expect("switch").accounts[0]
            .avatar_url
            .as_ref(),
        Some(&avatar_a)
    );
    assert_eq!(
        manager(&storage).list(100).expect("restored").accounts[0]
            .avatar_url
            .as_ref(),
        Some(&avatar_a)
    );
    let failed = app
        .login(input("avatar-failure", "one"), 100)
        .expect("avatar failure does not reject login");
    assert!(failed.accounts[2].avatar_url.is_none());
    let persisted = storage.data.lock().expect("storage").clone().expect("data");
    let mut old = serde_json::to_value(persisted).expect("json");
    for account in old["accounts"].as_array_mut().expect("accounts") {
        account["session"]
            .as_object_mut()
            .expect("session")
            .remove("avatar_url");
    }
    let migrated: AccountData = serde_json::from_value(old).expect("old format");
    migrated.validate().expect("backward compatible");
    assert!(
        migrated
            .accounts
            .iter()
            .all(|account| account.session.avatar_url.is_none())
    );
    app.remove(&id, 100).expect("remove a");
    let saved = serde_json::to_string(&*storage.data.lock().expect("storage")).expect("json");
    assert!(!saved.contains(&avatar_a));
}

#[test]
fn legacy_current_account_is_hydrated_once_and_expired_accounts_do_not_fetch() {
    use std::sync::atomic::AtomicUsize;
    struct CountingAuthentication(Arc<AtomicUsize>);
    impl Authentication for CountingAuthentication {
        fn login(
            &self,
            username: &str,
            password: &str,
            device_id: &str,
            now: u64,
        ) -> AccountResult<Session> {
            TestAuthentication.login(username, password, device_id, now)
        }
        fn avatar(&self, session: &Session, now: u64) -> AccountResult<Option<String>> {
            self.0.fetch_add(1, Ordering::SeqCst);
            TestAuthentication.avatar(session, now)
        }
    }
    let storage = TestStorage::default();
    let calls = Arc::new(AtomicUsize::new(0));
    let mut app = AccountManager::new(
        Box::new(storage.clone()),
        Box::new(CountingAuthentication(calls.clone())),
    );
    let id = app
        .login(input("avatar-a", "one"), 100)
        .expect("login")
        .active_id
        .expect("id");
    app.list(100).expect("list");
    app.switch(&id, 100).expect("switch");
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    storage
        .data
        .lock()
        .expect("data")
        .as_mut()
        .expect("stored")
        .accounts[0]
        .session
        .avatar_url = None;
    let mut restarted = AccountManager::new(
        Box::new(storage.clone()),
        Box::new(CountingAuthentication(calls.clone())),
    );
    assert!(
        restarted.list(100).expect("hydrate old data").accounts[0]
            .avatar_url
            .is_some()
    );
    restarted.list(100).expect("second read");
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    let mut expired = AccountManager::new(
        Box::new(storage),
        Box::new(CountingAuthentication(calls.clone())),
    );
    assert!(expired.list(4000).expect("expired").accounts[0].expired);
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}
