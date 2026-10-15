use crate::account_error::{AccountError, AccountResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoutePoint {
    pub latitude: f64,
    pub longitude: f64,
}
fn route_distance(a: &RoutePoint, b: &RoutePoint) -> f64 {
    let h = ((b.latitude - a.latitude).to_radians() / 2.0).sin().powi(2)
        + a.latitude.to_radians().cos()
            * b.latitude.to_radians().cos()
            * ((b.longitude - a.longitude).to_radians() / 2.0)
                .sin()
                .powi(2);
    12_742_000.0 * h.clamp(0.0, 1.0).sqrt().asin()
}
pub fn validate_route(route: &[RoutePoint]) -> bool {
    route.is_empty()
        || ((2..=50).contains(&route.len())
            && route.iter().all(|p| {
                p.latitude.is_finite()
                    && p.longitude.is_finite()
                    && p.latitude.abs() <= 85.0
                    && p.longitude.abs() <= 179.0
            })
            && route
                .windows(2)
                .all(|p| route_distance(&p[0], &p[1]) >= 1.0)
            && (50.0..=30000.0).contains(
                &route
                    .windows(2)
                    .map(|p| route_distance(&p[0], &p[1]))
                    .sum::<f64>(),
            ))
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunInput {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub route: Vec<RoutePoint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_pace_seconds_per_km: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub estimated_cadence: Option<f64>,
    pub seed: String,
    pub start_time: u64,
    pub latitude: f64,
    pub longitude: f64,
    pub distance_m: f64,
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
    if !validate_route(&input.route) {
        return Err(AccountError::new(
            "invalid_route",
            "路线需要 2–50 个有效选点，相邻点至少相距 1 米，总长度 50 米至 30 公里。",
        ));
    }
    if input.seed.is_empty()
        || input.seed.len() > 128
        || !input.latitude.is_finite()
        || !input.longitude.is_finite()
        || input.latitude.abs() > 85.0
        || input.longitude.abs() > 179.0
        || (!input.distance_m.is_finite() || !(100.0..=30000.0).contains(&input.distance_m))
        || !(60..=7200).contains(&input.duration_s)
        || !(1..=10).contains(&input.laps)
        || input.steps > 50000
        || input.start_time < 946684800000
        || input.start_time > 4102444800000
    {
        return Err(invalid());
    }
    let speed = input.distance_m / input.duration_s as f64;
    let cadence = input.steps as f64 * 60.0 / input.duration_s as f64;
    let stride = input.distance_m / input.steps.max(1) as f64;
    if !(0.5..=12.0).contains(&speed)
        || !(30.0..=300.0).contains(&cadence)
        || !(0.2..=3.0).contains(&stride)
        || input.duration_s < input.laps * 10
    {
        return Err(invalid());
    }
    match (input.target_pace_seconds_per_km, input.estimated_cadence) {
        (None, None) => {}
        (Some(pace), Some(cadence))
            if pace.is_finite()
                && cadence.is_finite()
                && (120.0..=1200.0).contains(&pace)
                && (30.0..=300.0).contains(&cadence)
                && ((input.distance_m / 1000.0 * pace).round() - input.duration_s as f64).abs()
                    < 0.5
                && ((input.duration_s as f64 / 60.0 * cadence).round() - input.steps as f64)
                    .abs()
                    < 0.5 => {}
        _ => return Err(invalid()),
    }
    let digest = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&input).map_err(|_| invalid())?)
    );
    let seed = Sha256::digest(input.seed.as_bytes());
    let phase = u32::from_le_bytes([seed[0], seed[1], seed[2], seed[3]]) as f64 / u32::MAX as f64
        * std::f64::consts::TAU;
    let mut cumulative = vec![0.0];
    for pair in input.route.windows(2) {
        cumulative
            .push(cumulative.last().copied().unwrap_or(0.0) + route_distance(&pair[0], &pair[1]));
    }
    let path_length = cumulative.last().copied().unwrap_or(0.0);
    let closed = input
        .route
        .first()
        .zip(input.route.last())
        .is_some_and(|(a, b)| route_distance(a, b) < 1.0);
    let along = |travel: f64| -> (f64, f64) {
        // Closed paths repeat in order; open paths return along the same line.
        let position = if closed {
            travel.rem_euclid(path_length)
        } else {
            let cycle = travel.rem_euclid(path_length * 2.0);
            if cycle <= path_length {
                cycle
            } else {
                path_length * 2.0 - cycle
            }
        };
        let index = cumulative
            .partition_point(|d| *d <= position)
            .saturating_sub(1)
            .min(input.route.len() - 2);
        let fraction = (position - cumulative[index]) / (cumulative[index + 1] - cumulative[index]);
        let a = &input.route[index];
        let b = &input.route[index + 1];
        (
            a.latitude + (b.latitude - a.latitude) * fraction,
            a.longitude + (b.longitude - a.longitude) * fraction,
        )
    };
    let route = |radius: f64| -> Vec<Point> {
        (0..=input.duration_s)
            .map(|second| {
                let theta = phase
                    + std::f64::consts::TAU * input.laps as f64 * second as f64
                        / input.duration_s as f64;
                let (a, o) = if input.route.is_empty() {
                    (
                        input.latitude + radius * theta.cos() / 111_195.0,
                        input.longitude
                            + radius * theta.sin()
                                / (111_195.0 * input.latitude.to_radians().cos()),
                    )
                } else {
                    let t = second as f64 / input.duration_s as f64;
                    let frequency = std::f64::consts::TAU * 3.0;
                    let progress =
                        t + 0.05 / frequency * ((frequency * t + phase).sin() - phase.sin());
                    along(radius * progress)
                };
                Point {
                    a,
                    o,
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
    let (mut lo, mut hi) = (
        0.0,
        if input.route.is_empty() {
            10000.0
        } else {
            input.distance_m * 2.0
        },
    );
    for _ in 0..45 {
        let mid = (lo + hi) / 2.0;
        if length(&route(mid)) < input.distance_m {
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
    if (actual - input.distance_m).abs() > 0.001 || points.iter().any(|p| p.s > 12.0) {
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
    let pace_s = (input.duration_s as f64 * 1000.0 / input.distance_m).round() as u32;
    let algorithm = if input.route.is_empty() {
        "circle-v1"
    } else {
        "waypoints-v2"
    };
    Ok(RunPreview {
        end_time: input.start_time + input.duration_s as u64 * 1000,
        pace: format!("{}'{:02}\"", pace_s / 60, pace_s % 60),
        average_kmh: speed * 3.6,
        input,
        digest,
        algorithm,
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
            target_pace_seconds_per_km: None,
            estimated_cadence: None,
            route: vec![],
            seed: "synthetic-seed".into(),
            start_time: 1700000000000,
            latitude: 0.0,
            longitude: 0.0,
            distance_m: 2021.0,
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
    fn fractional_metres_are_reproducible_and_nonfinite_distances_fail() {
        let mut value = input();
        value.distance_m = 2021.7;
        let preview = generate(value.clone()).expect("decimal distance");
        assert!((preview.actual_distance_m - 2021.7).abs() < 0.001);
        assert_eq!(preview.input.steps, 2397);
        assert_eq!(preview.digest, generate(value).expect("repeat").digest);
        for distance in [f64::NAN, f64::INFINITY, -1.0] {
            let mut value = input();
            value.distance_m = distance;
            assert!(generate(value).is_err());
        }
    }
    #[test]
    fn waypoints_follow_selected_line_with_seeded_speed_and_consistent_totals() {
        let mut value = input();
        value.route = vec![
            RoutePoint {
                latitude: 0.0,
                longitude: 0.0,
            },
            RoutePoint {
                latitude: 0.0,
                longitude: 0.002,
            },
            RoutePoint {
                latitude: 0.002,
                longitude: 0.002,
            },
        ];
        for n in 0..32 {
            value.seed = format!("route-{n}");
            let a = generate(value.clone()).expect("waypoint generation");
            assert_eq!(a.algorithm, "waypoints-v2");
            assert_eq!(a.source, "synthetic");
            assert!((a.actual_distance_m - value.distance_m).abs() < 0.001);
            assert_eq!(a.step_buckets.iter().sum::<u32>(), value.steps);
            assert_eq!(a.digest, generate(value.clone()).expect("repeat").digest);
            assert!(
                a.points
                    .iter()
                    .all(|p| p.a.abs() < 1e-10 || (p.o - 0.002).abs() < 1e-10)
            );
            assert!(
                a.points
                    .windows(2)
                    .all(|p| p[1].t - p[0].t == 1000 && p[1].s <= 12.0)
            );
            assert!(a.points.windows(2).any(|p| (p[0].s - p[1].s).abs() > 0.001));
        }
    }
    #[test]
    fn shorter_targets_truncate_and_longer_targets_repeat_without_rescaling() {
        for (target, duration, end_lon) in [(100.0, 60, 0.1), (30000.0, 7200, 0.0005)] {
            let mut value = input();
            value.distance_m = target;
            value.duration_s = duration;
            value.steps = (duration as f64 / 60.0 * 160.0).round() as u32;
            value.route = vec![
                RoutePoint {
                    latitude: 0.0,
                    longitude: 0.0,
                },
                RoutePoint {
                    latitude: 0.0,
                    longitude: end_lon,
                },
            ];
            let preview = generate(value).expect("extreme route ratio");
            assert!((preview.actual_distance_m - target).abs() < 0.001);
            assert!(
                preview
                    .points
                    .iter()
                    .all(|p| p.a.abs() < 1e-10 && p.o >= 0.0 && p.o <= end_lon)
            );
            if target == 100.0 {
                assert!(
                    (preview.points.last().expect("end").o - 100.0 / 111194.92664455874).abs()
                        < 1e-8
                );
            } else {
                assert!(preview.points.windows(2).any(|p| p[1].o < p[0].o));
            }
        }
        let mut closed = input();
        closed.route = vec![
            RoutePoint {
                latitude: 0.0,
                longitude: 0.0,
            },
            RoutePoint {
                latitude: 0.0,
                longitude: 0.002,
            },
            RoutePoint {
                latitude: 0.002,
                longitude: 0.002,
            },
            RoutePoint {
                latitude: 0.0,
                longitude: 0.0,
            },
        ];
        let preview = generate(closed).expect("closed loop");
        assert!((preview.actual_distance_m - 2021.0).abs() < 0.001);
        assert!(
            preview
                .points
                .windows(2)
                .filter(|p| p[0].a < 1e-10 && p[1].a < 1e-10)
                .all(|p| p[1].o >= p[0].o)
        );
    }
    #[test]
    fn estimated_steps_and_pace_must_match_the_recorded_assumptions() {
        let mut value = input();
        value.distance_m = 2000.0;
        value.duration_s = 720;
        value.steps = 1920;
        value.target_pace_seconds_per_km = Some(360.0);
        value.estimated_cadence = Some(160.0);
        assert!(generate(value.clone()).is_ok());
        value.steps += 10;
        assert!(generate(value.clone()).is_err());
        value.steps = 1920;
        value.duration_s += 10;
        assert!(generate(value).is_err());
    }
    #[test]
    fn invalid_routes_fail_and_legacy_inputs_remain_compatible() {
        let legacy = serde_json::to_value(input()).expect("serialize");
        assert!(legacy.get("route").is_none());
        assert_eq!(
            generate(serde_json::from_value(legacy).expect("legacy"))
                .expect("circle")
                .algorithm,
            "circle-v1"
        );
        for route in [
            vec![RoutePoint {
                latitude: 0.0,
                longitude: 0.0,
            }],
            vec![
                RoutePoint {
                    latitude: 0.0,
                    longitude: 0.0,
                },
                RoutePoint {
                    latitude: 0.0,
                    longitude: 0.0,
                },
            ],
            vec![
                RoutePoint {
                    latitude: f64::NAN,
                    longitude: 0.0,
                },
                RoutePoint {
                    latitude: 0.0,
                    longitude: 0.001,
                },
            ],
        ] {
            let mut value = input();
            value.route = route;
            assert!(generate(value).is_err());
        }
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
