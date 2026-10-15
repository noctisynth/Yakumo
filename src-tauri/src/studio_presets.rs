use crate::account_error::{AccountError, AccountResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
pub fn invalid() -> AccountError {
    AccountError::new("invalid_preset", "请检查预设名称、坐标、参数和偏移范围。")
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PresetConfig {
    pub latitude: f64,
    pub longitude: f64,
    pub distance_m: f64,
    pub duration_s: u32,
    pub steps: u32,
    pub laps: u32,
    pub offsets: BTreeMap<String, [f64; 2]>,
}
impl PresetConfig {
    pub fn validate(&self) -> AccountResult<()> {
        let limits = [
            ("distanceM", 1000.0),
            ("durationS", 600.0),
            ("steps", 2000.0),
            ("laps", 3.0),
            ("positionM", 100.0),
            ("startMinutes", 60.0),
        ];
        if !self.latitude.is_finite()
            || self.latitude.abs() > 85.0
            || !self.longitude.is_finite()
            || self.longitude.abs() > 179.0
            || !self.distance_m.is_finite()
            || !(100.0..=30000.0).contains(&self.distance_m)
            || !(60..=7200).contains(&self.duration_s)
            || !(1..=50000).contains(&self.steps)
            || !(1..=10).contains(&self.laps)
            || self.offsets.len() != limits.len()
        {
            return Err(invalid());
        }
        let speed = self.distance_m / self.duration_s as f64;
        let cadence = self.steps as f64 * 60.0 / self.duration_s as f64;
        let stride = self.distance_m / self.steps as f64;
        if !(0.5..=12.0).contains(&speed)
            || !(30.0..=300.0).contains(&cadence)
            || !(0.2..=3.0).contains(&stride)
            || self.duration_s < self.laps * 10
        {
            return Err(invalid());
        }
        for (key, max) in limits {
            let range = self.offsets.get(key).ok_or_else(invalid)?;
            if !range[0].is_finite()
                || !range[1].is_finite()
                || range[0] > range[1]
                || range[0] < -max
                || range[1] > max
            {
                return Err(invalid());
            }
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StudioPreset {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub config: PresetConfig,
}
impl StudioPreset {
    pub fn validate(&self) -> AccountResult<()> {
        if uuid::Uuid::parse_str(&self.id).is_err()
            || uuid::Uuid::parse_str(&self.account_id).is_err()
            || self.name.trim().is_empty()
            || self.name.chars().count() > 80
        {
            return Err(invalid());
        }
        self.config.validate()
    }
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum PresetAction {
    List,
    Save {
        id: Option<String>,
        name: String,
        config: PresetConfig,
    },
    Remove {
        id: String,
    },
}
