pub(crate) mod error;
pub(crate) mod protocol;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::{
    accounts::error::{AccountError, AccountResult},
    accounts::protocol::{Authentication, Session},
    storage::vault::AccountStorage,
};

pub const MAX_ACCOUNTS: usize = 20;

#[derive(Clone, Serialize, Deserialize)]
pub struct Account {
    #[serde(default)]
    display_name: Option<String>,
    id: String,
    school: String,
    session: Session,
}

#[cfg(test)]
mod tests;

#[derive(Clone, Serialize, Deserialize)]
pub struct AccountData {
    version: u8,
    active_id: Option<String>,
    accounts: Vec<Account>,
    #[serde(default)]
    attempts: Vec<crate::studio::submission::Attempt>,
    #[serde(default)]
    presets: Vec<crate::studio::presets::StudioPreset>,
}

impl Default for AccountData {
    fn default() -> Self {
        Self {
            version: 1,
            active_id: None,
            accounts: Vec::new(),
            attempts: Vec::new(),
            presets: Vec::new(),
        }
    }
}

impl AccountData {
    pub fn validate(&self) -> AccountResult<()> {
        if self.version != 1
            || self.accounts.len() > MAX_ACCOUNTS
            || self.attempts.len() > 5000
            || self.presets.len() > 100
            || self
                .active_id
                .as_ref()
                .is_some_and(|id| !self.accounts.iter().any(|account| &account.id == id))
        {
            return Err(AccountError::protocol());
        }
        for (index, preset) in self.presets.iter().enumerate() {
            preset.validate()?;
            if !self.accounts.iter().any(|a| a.id == preset.account_id)
                || self.presets[..index].iter().any(|p| p.id == preset.id)
            {
                return Err(AccountError::invalid());
            }
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
                    .is_some_and(|avatar| !crate::avatars::reader::valid_cached_avatar(avatar))
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
                    display_name: account.display_name.clone(),
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
    pub display_name: Option<String>,
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

    pub fn studio_presets(
        &mut self,
        account_id: &str,
        action: crate::studio::presets::PresetAction,
        now: u64,
    ) -> AccountResult<Vec<crate::studio::presets::StudioPreset>> {
        self.active_session(account_id, now)?;
        let mut data = self.data()?.clone();
        match action {
            crate::studio::presets::PresetAction::List => {}
            crate::studio::presets::PresetAction::Save { id, name, config } => {
                let preset = crate::studio::presets::StudioPreset {
                    id: id.clone().unwrap_or_else(|| Uuid::new_v4().to_string()),
                    account_id: account_id.to_string(),
                    name: name.trim().to_string(),
                    config,
                };
                preset.validate()?;
                if let Some(id) = id {
                    let entry = data
                        .presets
                        .iter_mut()
                        .find(|p| p.id == id && p.account_id == account_id)
                        .ok_or_else(crate::studio::presets::invalid)?;
                    *entry = preset;
                } else {
                    if data
                        .presets
                        .iter()
                        .filter(|p| p.account_id == account_id)
                        .count()
                        >= 30
                    {
                        return Err(AccountError::new(
                            "preset_limit",
                            "每个账号最多保存 30 个预设。",
                        ));
                    }
                    data.presets.push(preset);
                }
                self.commit(data.clone(), now)?;
            }
            crate::studio::presets::PresetAction::Remove { id } => {
                if !data
                    .presets
                    .iter()
                    .any(|p| p.id == id && p.account_id == account_id)
                {
                    return Err(crate::studio::presets::invalid());
                }
                data.presets.retain(|p| p.id != id);
                self.commit(data.clone(), now)?;
            }
        }
        Ok(data
            .presets
            .into_iter()
            .filter(|p| p.account_id == account_id)
            .collect())
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
    ) -> AccountResult<Vec<crate::studio::submission::Receipt>> {
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
        ticket: &crate::studio::submission::Ticket,
        now: u64,
    ) -> AccountResult<(Session, crate::studio::submission::Receipt)> {
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
                "当前有已提交或待核对的运动，请先查看运动记录，勿重复提交。",
            ));
        }
        let receipt = crate::studio::submission::Receipt {
            id: Uuid::new_v4().to_string(),
            digest: ticket.digest.clone(),
            identify: ticket.identify.clone(),
            state: "unknown".into(),
            message: "提交结果待确认，请先查看运动记录，勿重复提交。".into(),
            record_id: None,
            created_at: now,
            algorithm: ticket.algorithm.clone(),
            source: "synthetic".into(),
        };
        data.attempts.push(crate::studio::submission::Attempt {
            owner,
            receipt: receipt.clone(),
        });
        self.commit(data, now / 1000)?;
        Ok((session, receipt))
    }
    pub fn finish_submission(
        &mut self,
        receipt: crate::studio::submission::Receipt,
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

    pub fn apply_identity(
        &mut self,
        id: &str,
        session: &Session,
        identity: crate::avatars::reader::AccountIdentity,
        now: u64,
    ) -> AccountResult<AccountSnapshot> {
        let current = self.active_session(id, now)?;
        if current.access_token != session.access_token || current.user_id != session.user_id {
            return Err(AccountError::new(
                "account_changed",
                "登录信息已更新，请刷新资料后重试。",
            ));
        }
        let avatar = identity.avatar?;
        if avatar
            .as_ref()
            .is_some_and(|v| !crate::avatars::reader::valid_cached_avatar(v))
        {
            return Err(AccountError::new(
                "avatar_unavailable",
                "头像图片无法读取。",
            ));
        }
        let mut data = self.data()?.clone();
        let account = data
            .accounts
            .iter_mut()
            .find(|a| a.id == id)
            .ok_or_else(AccountError::storage)?;
        account.display_name = identity.display_name;
        account.session.avatar_url = avatar;
        self.commit(data, now)?;
        self.avatar_checked.insert(id.into());
        Ok(self.data()?.snapshot(now))
    }
    fn enrich_avatar(&mut self, data: &mut AccountData, id: &str, now: u64) -> bool {
        let Some(account) = data.accounts.iter_mut().find(|account| account.id == id) else {
            return false;
        };
        if account.session.expires_at <= now || !self.avatar_checked.insert(id.to_string()) {
            return false;
        }
        let Ok(identity) = self.authentication.identity(&account.session, now) else {
            return false;
        };
        let mut changed = account.display_name != identity.display_name;
        account.display_name = identity.display_name;
        if let Ok(avatar) = identity.avatar
            && avatar
                .as_ref()
                .is_none_or(|value| crate::avatars::reader::valid_cached_avatar(value))
            && account.session.avatar_url != avatar
        {
            account.session.avatar_url = avatar;
            changed = true;
        }

        changed
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
                display_name: None,
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
        data.presets.retain(|preset| preset.account_id != id);
        if data.active_id.as_deref() == Some(id) {
            data.active_id = None;
        }
        self.commit(data, now)
    }
}
