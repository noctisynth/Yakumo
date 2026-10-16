use crate::{
    accounts::error::{AccountError, AccountResult},
    studio::generator::{Point, distance},
};
use serde::Deserialize;
use serde_json::Value;

fn invalid(message: &'static str) -> AccountError {
    AccountError::new("invalid_submission", message)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UploadPoint {
    a: f64,
    o: f64,
    t: u64,
    s: f64,
    i: bool,
    c: u32,
    e: u32,
    f: bool,
}
impl UploadPoint {
    fn point(&self) -> Point {
        Point {
            a: self.a,
            o: self.o,
            t: self.t,
            s: self.s,
            i: self.i,
            c: self.c,
            e: self.e,
        }
    }
}

// The supported client payload, not the union of every observed server field.
const TEXT: &[&str] = &[
    "sportRange",
    "gpsDistance",
    "speed",
    "avgSpeed",
    "brand",
    "model",
    "system",
    "version",
    "appVersion",
    "appType",
    "versionName",
    "signatureMD5",
    "uniqueCode",
    "pointList",
    "stepNumbers",
    "gitudeLatitude",
    "okPointList",
    "geofence",
    "limitSpeed",
    "limitStride",
    "limitStepFrequency",
    "isSequencePoint",
    "isFaceStatus",
    "identify",
];
const INTEGERS: &[&str] = &[
    "sportType",
    "startTime",
    "endTime",
    "sportTime",
    "versionCode",
    "uploadType",
    "isValid",
    "f",
    "m",
    "h",
];

pub fn validate(payload: &Value, now: u64) -> AccountResult<()> {
    let object = payload
        .as_object()
        .ok_or_else(|| invalid("载荷必须是对象。"))?;
    if object.len() != TEXT.len() + INTEGERS.len()
        || object
            .keys()
            .any(|k| !TEXT.contains(&k.as_str()) && !INTEGERS.contains(&k.as_str()))
    {
        return Err(invalid("字段缺失或包含当前不支持的字段。"));
    }
    for key in TEXT {
        let text = object[*key]
            .as_str()
            .ok_or_else(|| invalid("上报字符串字段类型错误。"))?;
        let limit = match *key {
            "gitudeLatitude" => 2_500_000,
            "geofence" => super::geofence::MAX_TEXT_BYTES,
            "stepNumbers" => 4096,
            _ => 4096,
        };
        if text.is_empty() || text.len() > limit {
            return Err(invalid("上报字符串字段为空或超长。"));
        }
    }
    for key in INTEGERS {
        if object[*key].as_u64().is_none() {
            return Err(invalid("上报整数字段类型错误。"));
        }
    }
    let integer = |key: &str| {
        object[key]
            .as_u64()
            .ok_or_else(|| invalid("整数类型错误。"))
    };
    let decimal = |key: &str| -> AccountResult<f64> {
        let n = object[key]
            .as_str()
            .and_then(|s| s.parse::<f64>().ok())
            .filter(|n| n.is_finite());
        n.ok_or_else(|| invalid("上报数值字段必须是有限数。"))
    };
    if integer("sportType")? != 1
        || integer("uploadType")? != 0
        || integer("isValid")? != 1
        || object["isFaceStatus"] != "1"
        || object["isSequencePoint"] != "0"
    {
        return Err(invalid("运动类型或运行状态不属于当前支持范围。"));
    }
    for key in ["pointList", "okPointList"] {
        let array: Vec<Value> = serde_json::from_str(
            object[key]
                .as_str()
                .ok_or_else(|| invalid("数组文本类型错误。"))?,
        )
        .map_err(|_| invalid("内嵌数组不是有效的 JSON 文本。"))?;
        if !array.is_empty() {
            return Err(invalid("当前不支持非空检查点。"));
        }
    }
    for key in ["limitSpeed", "limitStride", "limitStepFrequency"] {
        if decimal(key)? <= 0.0 {
            return Err(invalid("学校阈值必须是正有限数。"));
        }
    }
    let start = integer("startTime")?;
    let end = integer("endTime")?;
    let duration = integer("sportTime")?;
    if !(60..=7200).contains(&duration)
        || !(946684800000..=4102444800000).contains(&start)
        || end.checked_sub(start) != Some(duration * 1000)
        || end > now
        || now.saturating_sub(end) > 7 * 86400000
    {
        return Err(invalid("开始、结束和有效时长不一致或超出支持范围。"));
    }
    let points: Vec<UploadPoint> = serde_json::from_str(
        object["gitudeLatitude"]
            .as_str()
            .ok_or_else(|| invalid("轨迹文本缺失。"))?,
    )
    .map_err(|_| invalid("轨迹点字段缺失、类型错误或含未知字段。"))?;
    if points.len() != duration as usize + 1 {
        return Err(invalid("轨迹点数量与逐秒时长不一致。"));
    }
    let mut total = 0.0;
    for (index, p) in points.iter().enumerate() {
        if !p.a.is_finite()
            || !p.o.is_finite()
            || p.a.abs() > 85.0
            || p.o.abs() > 179.0
            || !p.s.is_finite()
            || !(0.0..=8.0).contains(&p.s)
            || p.i
            || p.t != start + index as u64 * 1000
            || p.c != index as u32
            || !p.f
        {
            return Err(invalid(
                "轨迹含无效坐标、异常速度、时间或当前不支持的状态。",
            ));
        }
        if index > 0 {
            let previous = &points[index - 1];
            let segment = distance(&previous.point(), &p.point());
            if (segment - p.s).abs() > 0.000001 || p.e < previous.e || p.e - previous.e > 5 {
                return Err(invalid("逐段速度或累计步数与轨迹不一致。"));
            }
            if (p.s - previous.s).abs() > 4.0 {
                return Err(invalid("相邻秒速度跳变过大。"));
            }
            total += segment;
        } else if p.e != 0 {
            return Err(invalid("起始累计步数必须为零。"));
        }
    }
    super::geofence::check(&object["geofence"], points.iter().map(|p| (p.a, p.o)))
        .map_err(|error| invalid(error.message()))?;
    let steps = points
        .last()
        .map(|p| p.e)
        .ok_or_else(|| invalid("轨迹为空。"))?;
    let cadence = steps as f64 * 60.0 / duration as f64;
    let pace = duration as f64 * 1000.0 / total;
    if !(100.0 - 0.001..=30000.0 + 0.001).contains(&total) {
        return Err(invalid("里程超出 100 米至 30 公里（客户端安全门禁）。"));
    }
    let pace_rounding = 501.0 / total;
    if pace + pace_rounding < 180.0 || pace - pace_rounding > 900.0 {
        return Err(invalid("配速须在每公里 3 至 15 分钟内（客户端安全门禁）。"));
    }
    let cadence_rounding = 30.0 / duration as f64;
    if cadence + cadence_rounding < 80.0 || cadence - cadence_rounding > 220.0 {
        return Err(invalid("步频须在每分钟 80 至 220 步内（客户端安全门禁）。"));
    }
    if steps == 0 || !(0.3..=2.0).contains(&(total / steps as f64)) {
        return Err(invalid("估算单步距离超出 0.3 至 2 米（客户端安全门禁）。"));
    }
    let reported = decimal("sportRange")? * 1000.0;
    if reported > total + 0.001
        || total - reported > 10.001
        || (decimal("gpsDistance")? * 1000.0 - reported).abs() > 0.001
        || (decimal("avgSpeed")? - total / duration as f64 * 3.6).abs() > 0.011
    {
        return Err(invalid("上报里程或平均速度与实际轨迹不一致。"));
    }
    let pace_text = object["speed"]
        .as_str()
        .and_then(|s| s.strip_suffix('"'))
        .and_then(|s| s.split_once('\''))
        .and_then(|(m, s)| Some((m.parse::<u32>().ok()?, s.parse::<u32>().ok()?)));
    if !pace_text.is_some_and(|(m, s)| s < 60 && (m as f64 * 60.0 + s as f64 - pace).abs() <= 1.01)
    {
        return Err(invalid("上报配速与时长、轨迹里程不一致。"));
    }
    let buckets: Vec<u32> = serde_json::from_str(
        object["stepNumbers"]
            .as_str()
            .ok_or_else(|| invalid("步数桶缺失。"))?,
    )
    .map_err(|_| invalid("分钟步数必须是整数数组 JSON 文本。"))?;
    if buckets.len() != duration.div_ceil(60) as usize {
        return Err(invalid("分钟步数桶数量与时长不一致。"));
    }
    let mut previous = 0;
    for (index, bucket) in buckets.iter().enumerate() {
        let second = ((index + 1) * 60).min(duration as usize);
        if *bucket != points[second].e - previous {
            return Err(invalid("分钟步数桶与点级累计步数不一致。"));
        }
        let seconds = if index == buckets.len() - 1 {
            duration - index as u64 * 60
        } else {
            60
        };
        if *bucket as f64 + 1.0 < 70.0 * seconds as f64 / 60.0
            || *bucket as f64 > 240.0 * seconds as f64 / 60.0 + 1.0
        {
            return Err(invalid("局部分钟步频异常（客户端安全门禁）。"));
        }
        previous = points[second].e;
    }
    if integer("f")? != points.len() as u64 || integer("m")? != 0 || integer("h")? != 0 {
        return Err(invalid("点级标记与汇总计数不一致。"));
    }
    Ok(())
}
