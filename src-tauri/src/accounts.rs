use serde::{Deserialize, Serialize};
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
            })
        }
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
}

#[derive(Clone, Serialize, Deserialize)]
pub struct AccountData {
    version: u8,
    active_id: Option<String>,
    accounts: Vec<Account>,
}

impl Default for AccountData {
    fn default() -> Self {
        Self {
            version: 1,
            active_id: None,
            accounts: Vec::new(),
        }
    }
}

impl AccountData {
    pub fn validate(&self) -> AccountResult<()> {
        if self.version != 1
            || self.accounts.len() > MAX_ACCOUNTS
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
}

impl AccountManager {
    pub fn new(storage: Box<dyn AccountStorage>, authentication: Box<dyn Authentication>) -> Self {
        Self {
            storage,
            authentication,
            data: None,
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
        Ok(self.data()?.snapshot(now))
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
