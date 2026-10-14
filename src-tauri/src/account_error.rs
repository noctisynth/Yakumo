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
            "无法访问安全账号存储，请解锁系统密钥库后重试。",
        )
    }

    pub fn invalid() -> Self {
        Self::new("invalid_input", "请检查学校、账号、密码和传输确认。")
    }

    pub fn protocol() -> Self {
        Self::new(
            "invalid_response",
            "学校服务返回了无法识别的数据，请稍后重试。",
        )
    }
}

pub type AccountResult<T> = Result<T, AccountError>;
