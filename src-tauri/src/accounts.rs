use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::{
    account_error::{AccountError, AccountResult},
    account_protocol::{Authentication, Session},
    account_vault::AccountStorage,
};

pub const MAX_ACCOUNTS: usize = 20;

#[derive(Clone, Serialize, Deserialize)]
pub struct Account {
    id: String,
    school: String,
    session: Session,
}

#[cfg(test)]
mod tests {
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
    fn submission_journal_survives_restart_isolates_users_and_blocks_duplicates() {
        let storage = TestStorage::default();
        let mut app = manager(&storage);
        let id = app
            .login(input("synthetic-a", "one"), 100)
            .expect("login")
            .active_id
            .expect("id");
        let ticket = crate::run_submission::Ticket {
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
}

#[derive(Clone, Serialize, Deserialize)]
pub struct AccountData {
    version: u8,
    active_id: Option<String>,
    accounts: Vec<Account>,
    #[serde(default)]
    attempts: Vec<crate::run_submission::Attempt>,
}

impl Default for AccountData {
    fn default() -> Self {
        Self {
            version: 1,
            active_id: None,
            accounts: Vec::new(),
            attempts: Vec::new(),
        }
    }
}

impl AccountData {
    pub fn validate(&self) -> AccountResult<()> {
        if self.version != 1
            || self.accounts.len() > MAX_ACCOUNTS
            || self.attempts.len() > 5000
            || self
                .active_id
                .as_ref()
                .is_some_and(|id| !self.accounts.iter().any(|account| &account.id == id))
        {
            return Err(AccountError::protocol());
        }
        for (index, account) in self.accounts.iter().enumerate() {
            if Uuid::parse_str(&account.id).is_err()
                || account.school != "swpu"
                || account.session.user_id.is_empty()
                || account.session.username.is_empty()
                || account.session.access_token.is_empty()
                || account.session.refresh_token.is_empty()
                || account.session.raw_app_id.is_empty()
                || account
                    .session
                    .avatar_url
                    .as_ref()
                    .is_some_and(|avatar| !crate::account_avatar::valid_cached_avatar(avatar))
                || Uuid::parse_str(&account.session.device_id).is_err()
                || self.accounts[..index].iter().any(|other| {
                    other.id == account.id
                        || (other.school == account.school
                            && other.session.user_id == account.session.user_id)
                })
            {
                return Err(AccountError::protocol());
            }
        }
        Ok(())
    }

    fn snapshot(&self, now: u64) -> AccountSnapshot {
        AccountSnapshot {
            active_id: self.active_id.clone(),
            accounts: self
                .accounts
                .iter()
                .map(|account| AccountSummary {
                    id: account.id.clone(),
                    school: account.school.clone(),
                    school_name: "西南石油大学",
                    username: account.session.username.clone(),
                    expires_at: account.session.expires_at,
                    expired: account.session.expires_at <= now,
                    avatar_url: account.session.avatar_url.clone(),
                })
                .collect(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    pub id: String,
    pub school: String,
    pub school_name: &'static str,
    pub username: String,
    pub expires_at: u64,
    pub expired: bool,
    pub avatar_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSnapshot {
    pub active_id: Option<String>,
    pub accounts: Vec<AccountSummary>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoginInput {
    pub school: String,
    pub username: String,
    pub password: String,
    pub allow_insecure_transport: bool,
}

pub struct AccountManager {
    storage: Box<dyn AccountStorage>,
    authentication: Box<dyn Authentication>,
    data: Option<AccountData>,
    avatar_checked: HashSet<String>,
}

impl AccountManager {
    pub fn new(storage: Box<dyn AccountStorage>, authentication: Box<dyn Authentication>) -> Self {
        Self {
            storage,
            authentication,
            data: None,
            avatar_checked: HashSet::new(),
        }
    }

    fn data(&mut self) -> AccountResult<&AccountData> {
        if self.data.is_none() {
            let data = self.storage.load()?;
            data.validate()?;
            self.data = Some(data);
        }
        self.data.as_ref().ok_or_else(AccountError::storage)
    }

    fn commit(&mut self, data: AccountData, now: u64) -> AccountResult<AccountSnapshot> {
        data.validate()?;
        self.storage.save(&data)?;
        let snapshot = data.snapshot(now);
        self.data = Some(data);
        Ok(snapshot)
    }

    pub fn list(&mut self, now: u64) -> AccountResult<AccountSnapshot> {
        let mut data = self.data()?.clone();
        if let Some(id) = data.active_id.clone()
            && self.enrich_avatar(&mut data, &id, now)
            && self.storage.save(&data).is_ok()
        {
            self.data = Some(data);
        }
        Ok(self.data()?.snapshot(now))
    }

    pub fn active_session(&mut self, id: &str, now: u64) -> AccountResult<Session> {
        let data = self.data()?;
        if data.active_id.as_deref() != Some(id) {
            return Err(AccountError::new(
                "account_changed",
                "当前账号已切换，请重新读取。",
            ));
        }
        let account = data
            .accounts
            .iter()
            .find(|account| account.id == id)
            .ok_or_else(|| AccountError::new("account_not_found", "账号已不存在。"))?;
        if account.session.expires_at <= now {
            return Err(AccountError::new(
                "session_expired",
                "登录已过期，请重新登录。",
            ));
        }
        Ok(account.session.clone())
    }

    fn owner(session: &Session) -> String {
        use sha2::{Digest, Sha256};
        format!("{:x}", Sha256::digest(format!("swpu:{}", session.user_id)))
    }
    pub fn receipts(
        &mut self,
        id: &str,
        now: u64,
    ) -> AccountResult<Vec<crate::run_submission::Receipt>> {
        let session = self.active_session(id, now)?;
        let owner = Self::owner(&session);
        Ok(self
            .data()?
            .attempts
            .iter()
            .filter(|a| a.owner == owner)
            .map(|a| a.receipt.clone())
            .rev()
            .collect())
    }
    pub fn reserve(
        &mut self,
        id: &str,
        ticket: &crate::run_submission::Ticket,
        now: u64,
    ) -> AccountResult<(Session, crate::run_submission::Receipt)> {
        let session = self.active_session(id, now / 1000)?;
        let owner = Self::owner(&session);
        let mut data = self.data()?.clone();
        if data.attempts.iter().any(|a| {
            a.owner == owner
                && (a.receipt.digest == ticket.digest
                    || a.receipt.identify == ticket.identify
                    || a.receipt.state == "unknown")
        }) {
            return Err(AccountError::new(
                "duplicate_submission",
                "同一草稿或关联运动已提交，或有结果不确定的提交；请先核对记录，禁止重传。",
            ));
        }
        let receipt = crate::run_submission::Receipt {
            id: Uuid::new_v4().to_string(),
            digest: ticket.digest.clone(),
            identify: ticket.identify.clone(),
            state: "unknown".into(),
            message: "提交意图已保存；结果尚未确认，请勿重传。".into(),
            record_id: None,
            created_at: now,
            algorithm: "circle-v1".into(),
            source: "synthetic".into(),
        };
        data.attempts.push(crate::run_submission::Attempt {
            owner,
            receipt: receipt.clone(),
        });
        self.commit(data, now / 1000)?;
        Ok((session, receipt))
    }
    pub fn finish_submission(
        &mut self,
        receipt: crate::run_submission::Receipt,
        now: u64,
    ) -> AccountResult<()> {
        let mut data = self.data()?.clone();
        let attempt = data
            .attempts
            .iter_mut()
            .find(|a| a.receipt.id == receipt.id)
            .ok_or_else(AccountError::storage)?;
        attempt.receipt = receipt;
        self.commit(data, now / 1000)?;
        Ok(())
    }

    fn enrich_avatar(&mut self, data: &mut AccountData, id: &str, now: u64) -> bool {
        let Some(account) = data.accounts.iter_mut().find(|account| account.id == id) else {
            return false;
        };
        if account.session.expires_at <= now || !self.avatar_checked.insert(id.to_string()) {
            return false;
        }
        let Ok(avatar) = self.authentication.avatar(&account.session, now) else {
            return false;
        };
        if avatar
            .as_ref()
            .is_some_and(|value| !crate::account_avatar::valid_cached_avatar(value))
            || account.session.avatar_url == avatar
        {
            return false;
        }
        account.session.avatar_url = avatar;
        true
    }

    pub fn login(&mut self, input: LoginInput, now: u64) -> AccountResult<AccountSnapshot> {
        let password = Zeroizing::new(input.password);
        let username = input.username.trim();
        if input.school != "swpu"
            || !input.allow_insecure_transport
            || username.is_empty()
            || username.len() > 128
            || username.chars().any(char::is_control)
            || password.is_empty()
            || password.len() > 512
        {
            return Err(AccountError::invalid());
        }
        let mut data = self.data()?.clone();
        let device_id = data
            .accounts
            .iter()
            .find(|account| account.school == input.school && account.session.username == username)
            .map(|account| account.session.device_id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let session = self
            .authentication
            .login(username, &password, &device_id, now)?;
        let existing = data.accounts.iter_mut().find(|account| {
            account.school == input.school && account.session.user_id == session.user_id
        });
        let id = if let Some(account) = existing {
            account.session = session;
            account.id.clone()
        } else {
            if data.accounts.len() >= MAX_ACCOUNTS {
                return Err(AccountError::new(
                    "account_limit",
                    "最多保存 20 个账号，请先移除不再使用的账号。",
                ));
            }
            let id = Uuid::new_v4().to_string();
            data.accounts.push(Account {
                id: id.clone(),
                school: input.school,
                session,
            });
            id
        };
        self.avatar_checked.remove(&id);
        self.enrich_avatar(&mut data, &id, now);
        data.active_id = Some(id);
        self.commit(data, now)
    }

    pub fn switch(&mut self, id: &str, now: u64) -> AccountResult<AccountSnapshot> {
        let mut data = self.data()?.clone();
        let account = data
            .accounts
            .iter()
            .find(|account| account.id == id)
            .ok_or_else(|| {
                AccountError::new("account_not_found", "账号已不存在，请刷新账号列表。")
            })?;
        if account.session.expires_at <= now {
            return Err(AccountError::new(
                "session_expired",
                "该账号的登录已过期，请重新登录后切换。",
            ));
        }
        data.active_id = Some(id.to_string());
        self.enrich_avatar(&mut data, id, now);
        self.commit(data, now)
    }

    pub fn remove(&mut self, id: &str, now: u64) -> AccountResult<AccountSnapshot> {
        let mut data = self.data()?.clone();
        if !data.accounts.iter().any(|account| account.id == id) {
            return Err(AccountError::new(
                "account_not_found",
                "账号已不存在，请刷新账号列表。",
            ));
        }
        data.accounts.retain(|account| account.id != id);
        if data.active_id.as_deref() == Some(id) {
            data.active_id = None;
        }
        self.commit(data, now)
    }
}
