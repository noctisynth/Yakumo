use crate::account_error::{AccountError, AccountResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunInput {
    pub seed: String,
    pub start_time: u64,
    pub latitude: f64,
    pub longitude: f64,
    pub distance_m: u32,
    pub duration_s: u32,
    pub steps: u32,
    pub laps: u32,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Point {
    pub a: f64,
    pub o: f64,
    pub t: u64,
    pub s: f64,
    pub i: bool,
    pub c: u32,
    pub e: u32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunPreview {
    pub input: RunInput,
    pub digest: String,
    pub algorithm: &'static str,
    pub source: &'static str,
    pub points: Vec<Point>,
    pub step_buckets: Vec<u32>,
    pub actual_distance_m: f64,
    pub pace: String,
    pub average_kmh: f64,
    pub end_time: u64,
    pub checks: Vec<&'static str>,
}
pub fn distance(a: &Point, b: &Point) -> f64 {
    let lat = (b.a - a.a).to_radians();
    let lon = (b.o - a.o).to_radians();
    let h = (lat / 2.0).sin().powi(2)
        + a.a.to_radians().cos() * b.a.to_radians().cos() * (lon / 2.0).sin().powi(2);
    12_742_000.0 * h.clamp(0.0, 1.0).sqrt().asin()
}
pub fn generate(input: RunInput) -> AccountResult<RunPreview> {
    let invalid = || {
        AccountError::new(
            "invalid_run",
            "请检查参数：距离 100–30000 米、时长 60–7200 秒、圈数 1–10、有效坐标、步数及合理速度/步频。 ",
        )
    };
    if input.seed.is_empty()
        || input.seed.len() > 128
        || !input.latitude.is_finite()
        || !input.longitude.is_finite()
        || input.latitude.abs() > 85.0
        || input.longitude.abs() > 179.0
        || !(100..=30000).contains(&input.distance_m)
        || !(60..=7200).contains(&input.duration_s)
        || !(1..=10).contains(&input.laps)
        || input.steps > 50000
        || input.start_time < 946684800000
        || input.start_time > 4102444800000
    {
        return Err(invalid());
    }
    let speed = input.distance_m as f64 / input.duration_s as f64;
    let cadence = input.steps as f64 * 60.0 / input.duration_s as f64;
    let stride = input.distance_m as f64 / input.steps.max(1) as f64;
    if !(0.5..=12.0).contains(&speed)
        || !(30.0..=300.0).contains(&cadence)
        || !(0.2..=3.0).contains(&stride)
        || input.duration_s < input.laps * 10
    {
        return Err(invalid());
    }
    let digest = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&input).map_err(|_| invalid())?)
    );
    let seed = Sha256::digest(input.seed.as_bytes());
    let phase = u32::from_le_bytes([seed[0], seed[1], seed[2], seed[3]]) as f64 / u32::MAX as f64
        * std::f64::consts::TAU;
    let route = |radius: f64| -> Vec<Point> {
        (0..=input.duration_s)
            .map(|second| {
                let theta = phase
                    + std::f64::consts::TAU * input.laps as f64 * second as f64
                        / input.duration_s as f64;
                Point {
                    a: input.latitude + radius * theta.cos() / 111_195.0,
                    o: input.longitude
                        + radius * theta.sin() / (111_195.0 * input.latitude.to_radians().cos()),
                    t: input.start_time + second as u64 * 1000,
                    s: 0.0,
                    i: false,
                    c: second,
                    e: (input.steps as u64 * second as u64 / input.duration_s as u64) as u32,
                }
            })
            .collect()
    };
    let length = |points: &[Point]| {
        points
            .windows(2)
            .map(|pair| distance(&pair[0], &pair[1]))
            .sum::<f64>()
    };
    let (mut lo, mut hi) = (0.0, 10000.0);
    for _ in 0..45 {
        let mid = (lo + hi) / 2.0;
        if length(&route(mid)) < input.distance_m as f64 {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    let mut points = route((lo + hi) / 2.0);
    for n in 1..points.len() {
        points[n].s = distance(&points[n - 1], &points[n]);
    }
    points[0].s = points[1].s;
    let actual = length(&points);
    if (actual - input.distance_m as f64).abs() > 0.001 {
        return Err(invalid());
    }
    let mut buckets = Vec::new();
    let mut previous = 0;
    for second in (60..input.duration_s)
        .step_by(60)
        .chain(std::iter::once(input.duration_s))
    {
        let total = (input.steps as u64 * second as u64 / input.duration_s as u64) as u32;
        buckets.push(total - previous);
        previous = total;
    }
    let pace_s = (input.duration_s as f64 * 1000.0 / input.distance_m as f64).round() as u32;
    Ok(RunPreview {
        end_time: input.start_time + input.duration_s as u64 * 1000,
        pace: format!("{}'{:02}\"", pace_s / 60, pace_s % 60),
        average_kmh: speed * 3.6,
        input,
        digest,
        algorithm: "circle-v1",
        source: "synthetic",
        points,
        step_buckets: buckets,
        actual_distance_m: actual,
        checks: vec![
            "逐段距离与目标误差小于 1 毫米",
            "逐秒时间、速度与有效时长一致",
            "累计步数与分钟增量桶总和一致",
            "来源明确为合成，未执行道路匹配",
        ],
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    fn input() -> RunInput {
        RunInput {
            seed: "synthetic-seed".into(),
            start_time: 1700000000000,
            latitude: 0.0,
            longitude: 0.0,
            distance_m: 2021,
            duration_s: 899,
            steps: 2397,
            laps: 5,
        }
    }
    #[test]
    fn reproducible_geometry_timing_and_steps() {
        let a = generate(input()).expect("generate");
        let b = generate(input()).expect("repeat");
        assert_eq!(
            serde_json::to_string(&a).expect("a"),
            serde_json::to_string(&b).expect("b")
        );
        assert_eq!(a.points.len(), 900);
        assert_eq!(a.step_buckets.len(), 15);
        assert_eq!(a.step_buckets.iter().sum::<u32>(), 2397);
        assert!((a.actual_distance_m - 2021.0).abs() < 0.001);
        for p in a.points.windows(2) {
            assert_eq!(p[1].t - p[0].t, 1000);
            assert!((p[1].s - distance(&p[0], &p[1])).abs() < 1e-9);
        }
        assert!(distance(&a.points[0], a.points.last().expect("last")) < 0.001);
    }
    #[test]
    fn rejects_impossible_and_unbounded_inputs() {
        let mut a = input();
        a.steps = 0;
        assert!(generate(a).is_err());
        let mut a = input();
        a.duration_s = u32::MAX;
        assert!(generate(a).is_err());
        let mut a = input();
        a.latitude = f64::NAN;
        assert!(generate(a).is_err());
        let mut a = input();
        a.longitude = 180.0;
        assert!(generate(a).is_err());
    }
}
