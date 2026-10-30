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
        .ok_or_else(|| invalid("运动数据异常，请重新生成。"))?;
    if object.len() != TEXT.len() + INTEGERS.len()
        || object
            .keys()
            .any(|k| !TEXT.contains(&k.as_str()) && !INTEGERS.contains(&k.as_str()))
    {
        return Err(invalid("运动数据不完整，请重新生成。"));
    }
    for key in TEXT {
        let text = object[*key]
            .as_str()
            .ok_or_else(|| invalid("运动数据异常，请重新生成。"))?;
        let limit = match *key {
            "gitudeLatitude" => 2_500_000,
            "geofence" => super::geofence::MAX_TEXT_BYTES,
            "stepNumbers" => 4096,
            _ => 4096,
        };
        if text.is_empty() || text.len() > limit {
            return Err(invalid("运动数据异常，请重新生成。"));
        }
    }
    for key in INTEGERS {
        if object[*key].as_u64().is_none() {
            return Err(invalid("运动数据异常，请重新生成。"));
        }
    }
    let integer = |key: &str| {
        object[key]
            .as_u64()
            .ok_or_else(|| invalid("运动数据异常，请重新生成。"))
    };
    let decimal = |key: &str| -> AccountResult<f64> {
        let n = object[key]
            .as_str()
            .and_then(|s| s.parse::<f64>().ok())
            .filter(|n| n.is_finite());
        n.ok_or_else(|| invalid("运动数据异常，请重新生成。"))
    };
    if integer("sportType")? != 1
        || integer("uploadType")? != 0
        || integer("isValid")? != 1
        || object["isFaceStatus"] != "1"
        || object["isSequencePoint"] != "0"
    {
        return Err(invalid("暂不支持提交此类型的运动，请重新选择。"));
    }
    for key in ["pointList", "okPointList"] {
        let array: Vec<Value> = serde_json::from_str(
            object[key]
                .as_str()
                .ok_or_else(|| invalid("运动数据异常，请重新生成。"))?,
        )
        .map_err(|_| invalid("运动数据异常，请重新生成。"))?;
        if !array.is_empty() {
            return Err(invalid(
                "本次运动需要完成检查点要求，请通过学校客户端完成。",
            ));
        }
    }
    for key in ["limitSpeed", "limitStride", "limitStepFrequency"] {
        if decimal(key)? <= 0.0 {
            return Err(invalid("学校运动要求读取失败，请刷新学校配置后重试。"));
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
        return Err(invalid("运动时间异常，请调整起止时间后重新生成。"));
    }
    let points: Vec<UploadPoint> = serde_json::from_str(
        object["gitudeLatitude"]
            .as_str()
            .ok_or_else(|| invalid("路线数据缺失，请重新生成。"))?,
    )
    .map_err(|_| invalid("路线数据异常，请重新生成。"))?;
    if points.len() != duration as usize + 1 {
        return Err(invalid("路线与运动时长不匹配，请重新生成。"));
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
            return Err(invalid("路线、配速或时间异常，请检查参数后重新生成。"));
        }
        if index > 0 {
            let previous = &points[index - 1];
            let segment = distance(&previous.point(), &p.point());
            if (segment - p.s).abs() > 0.000001 || p.e < previous.e || p.e - previous.e > 5 {
                return Err(invalid("路线与速度或步数不匹配，请重新生成。"));
            }
            if (p.s - previous.s).abs() > 4.0 {
                return Err(invalid("速度变化过大，请调整路线或配速后重新生成。"));
            }
            total += segment;
        } else if p.e != 0 {
            return Err(invalid("起始步数异常，请重新生成。"));
        }
    }
    super::geofence::check(&object["geofence"], points.iter().map(|p| (p.a, p.o)))
        .map_err(|error| invalid(error.message()))?;
    let steps = points
        .last()
        .map(|p| p.e)
        .ok_or_else(|| invalid("路线为空，请先规划路线并重新生成。"))?;
    let cadence = steps as f64 * 60.0 / duration as f64;
    let pace = duration as f64 * 1000.0 / total;
    if !(100.0 - 0.001..=30000.0 + 0.001).contains(&total) {
        return Err(invalid("里程超出 100 米至 30 公里。"));
    }
    if !super::pace::valid_derived(total, duration) {
        return Err(invalid("配速须在每公里 3 至 15 分钟内。"));
    }
    let cadence_rounding = 30.0 / duration as f64;
    if cadence + cadence_rounding < 80.0 || cadence - cadence_rounding > 220.0 {
        return Err(invalid("步频须在每分钟 80 至 220 步内。"));
    }
    if steps == 0 || !(0.3..=2.0).contains(&(total / steps as f64)) {
        return Err(invalid("估算单步距离超出 0.3 至 2 米。"));
    }
    let reported = decimal("sportRange")? * 1000.0;
    if reported > total + 0.001
        || total - reported > 10.001
        || (decimal("gpsDistance")? * 1000.0 - reported).abs() > 0.001
        || (decimal("avgSpeed")? - total / duration as f64 * 3.6).abs() > 0.011
    {
        return Err(invalid("路线与里程或平均速度不匹配，请重新生成。"));
    }
    let pace_text = object["speed"]
        .as_str()
        .and_then(|s| s.strip_suffix('"'))
        .and_then(|s| s.split_once('\''))
        .and_then(|(m, s)| Some((m.parse::<u32>().ok()?, s.parse::<u32>().ok()?)));
    if !pace_text.is_some_and(|(m, s)| s < 60 && (m as f64 * 60.0 + s as f64 - pace).abs() <= 1.01)
    {
        return Err(invalid("配速与时长或里程不匹配，请重新生成。"));
    }
    let buckets: Vec<u32> = serde_json::from_str(
        object["stepNumbers"]
            .as_str()
            .ok_or_else(|| invalid("步数数据缺失，请重新生成。"))?,
    )
    .map_err(|_| invalid("每分钟步数异常，请重新生成。"))?;
    if buckets.len() != duration.div_ceil(60) as usize {
        return Err(invalid("步数与运动时长不匹配，请重新生成。"));
    }
    let mut previous = 0;
    for (index, bucket) in buckets.iter().enumerate() {
        let second = ((index + 1) * 60).min(duration as usize);
        if *bucket != points[second].e - previous {
            return Err(invalid("步数数据不一致，请重新生成。"));
        }
        let seconds = if index == buckets.len() - 1 {
            duration - index as u64 * 60
        } else {
            60
        };
        if *bucket as f64 + 1.0 < 70.0 * seconds as f64 / 60.0
            || *bucket as f64 > 240.0 * seconds as f64 / 60.0 + 1.0
        {
            return Err(invalid("部分时段步频异常，请调整步频后重新生成。"));
        }
        previous = points[second].e;
    }
    if integer("f")? != points.len() as u64 || integer("m")? != 0 || integer("h")? != 0 {
        return Err(invalid("运动数据不一致，请重新生成。"));
    }
    Ok(())
}
