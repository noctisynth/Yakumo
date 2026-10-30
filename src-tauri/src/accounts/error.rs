use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct AccountError {
    pub code: &'static str,
    pub message: &'static str,
}

impl AccountError {
    pub fn new(code: &'static str, message: &'static str) -> Self {
        Self { code, message }
    }

    pub fn storage() -> Self {
        Self::new(
            "storage_unavailable",
            "无法读取已保存的账号，请解锁设备后重试。",
        )
    }

    pub fn invalid() -> Self {
        Self::new("invalid_input", "请检查学校、账号和密码，并确认连接风险。")
    }

    pub fn protocol() -> Self {
        Self::new("invalid_response", "学校数据读取失败，请稍后重试。")
    }
}

pub type AccountResult<T> = Result<T, AccountError>;
