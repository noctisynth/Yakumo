use crate::accounts::error::{AccountError, AccountResult};
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
        || ((2..=51).contains(&route.len())
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
pub fn effective_route(route: &[RoutePoint], close_loop: bool) -> AccountResult<Vec<RoutePoint>> {
    let invalid = || {
        AccountError::new(
            "invalid_route",
            "路线需要 2–50 个有效选点；首尾相连至少需要 3 个点，总长 50 米至 30 公里。",
        )
    };
    if route.len() > 50 || (close_loop && route.len() < 3) {
        return Err(invalid());
    }
    let mut geometry = route.to_vec();
    if close_loop
        && let (Some(first), Some(last)) = (route.first(), route.last())
        && route_distance(first, last) >= 1.0
    {
        geometry.push(first.clone());
    }
    if !validate_route(&geometry) {
        return Err(invalid());
    }
    Ok(geometry)
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunInput {
    #[serde(default)]
    pub close_loop: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub route: Vec<RoutePoint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_pace_seconds_per_km: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub estimated_cadence: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coordinate_noise_m: Option<f64>,
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
    pub coordinate_noise_m: f64,
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
    let geometry = effective_route(&input.route, input.close_loop)?;
    if input
        .coordinate_noise_m
        .is_some_and(|v| !v.is_finite() || !(0.0..=3.0).contains(&v))
        || input.seed.is_empty()
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
    if !super::pace::valid_derived(input.distance_m, u64::from(input.duration_s)) {
        return Err(AccountError::new(
            "invalid_run",
            "配速须在每公里 3 至 15 分钟内。",
        ));
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
                && super::pace::valid(pace)
                && (30.0..=300.0).contains(&cadence)
                && ((input.distance_m / 1000.0 * pace).round() - input.duration_s as f64).abs()
                    < 0.5
                && ((input.duration_s as f64 / 60.0 * cadence).round() - input.steps as f64)
                    .abs()
                    < 0.5 => {}
        _ => return Err(invalid()),
    }
    let algorithm = if input.route.is_empty() {
        "circle-v1"
    } else {
        "waypoints-v4"
    };
    let digest = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&(algorithm, &input)).map_err(|_| invalid())?)
    );
    let coordinate_noise_m = if input.route.is_empty() {
        0.0
    } else {
        input.coordinate_noise_m.unwrap_or(0.8).min(speed * 0.6)
    };
    let motion = crate::studio::motion::motion(input.duration_s, &input.seed, coordinate_noise_m);
    let seed = Sha256::digest(input.seed.as_bytes());
    let phase = u32::from_le_bytes([seed[0], seed[1], seed[2], seed[3]]) as f64 / u32::MAX as f64
        * std::f64::consts::TAU;
    let mut cumulative = vec![0.0];
    for pair in geometry.windows(2) {
        cumulative
            .push(cumulative.last().copied().unwrap_or(0.0) + route_distance(&pair[0], &pair[1]));
    }
    let path_length = cumulative.last().copied().unwrap_or(0.0);
    let closed = geometry
        .first()
        .zip(geometry.last())
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
            .min(geometry.len() - 2);
        let fraction = (position - cumulative[index]) / (cumulative[index + 1] - cumulative[index]);
        let a = &geometry[index];
        let b = &geometry[index + 1];
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
                    let movement = &motion[second as usize];
                    let (latitude, longitude) = along(radius * movement.progress);
                    (
                        latitude + movement.north / 111_195.0,
                        longitude + movement.east / (111_195.0 * latitude.to_radians().cos()),
                    )
                };
                Point {
                    a,
                    o,
                    t: input.start_time + second as u64 * 1000,
                    s: 0.0,
                    i: false,
                    c: second,
                    e: if input.route.is_empty() {
                        (input.steps as u64 * second as u64 / input.duration_s as u64) as u32
                    } else {
                        (input.steps as f64 * motion[second as usize].progress).round() as u32
                    },
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
        let total = points[second as usize].e;
        buckets.push(total - previous);
        previous = total;
    }
    let pace_s = (input.duration_s as f64 * 1000.0 / input.distance_m).round() as u32;
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
        coordinate_noise_m,
        checks: vec![
            "路线里程检查通过",
            "时间与速度检查通过",
            "步数检查通过",
            "数据来源：合成",
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
            coordinate_noise_m: None,
            close_loop: false,
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
    fn pace_limits_apply_even_without_explicit_pace_metadata() {
        for explicit in [false, true] {
            for pace in [180.0, 900.0, 120.0, 179.0, 901.0, 1200.0] {
                let mut value = input();
                value.distance_m = 2000.0;
                value.duration_s = (pace * 2.0) as u32;
                value.steps = value.duration_s * 3;
                if explicit {
                    value.target_pace_seconds_per_km = Some(pace);
                    value.estimated_cadence = Some(180.0);
                }
                assert_eq!(generate(value).is_ok(), (180.0..=900.0).contains(&pace));
            }
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
            value.coordinate_noise_m = Some(0.0);
            let a = generate(value.clone()).expect("waypoint generation");
            assert_eq!(a.algorithm, "waypoints-v4");
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
            value.coordinate_noise_m = Some(0.0);
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
        closed.coordinate_noise_m = Some(0.0);
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
    fn random_coordinates_are_bounded_smooth_reproducible_and_reconciled() {
        let mut value = input();
        value.coordinate_noise_m = Some(0.8);
        value.route = vec![
            RoutePoint {
                latitude: 0.0,
                longitude: 0.0,
            },
            RoutePoint {
                latitude: 0.0,
                longitude: 0.01,
            },
        ];
        for n in 0..24 {
            value.seed = format!("coordinates-{n}");
            let preview = generate(value.clone()).expect("noisy route");
            let repeat = generate(value.clone()).expect("repeat");
            assert_eq!(
                serde_json::to_string(&preview).expect("preview"),
                serde_json::to_string(&repeat).expect("repeat")
            );
            assert!((preview.actual_distance_m - value.distance_m).abs() < 0.001);
            assert!(preview.points.iter().any(|p| p.a.abs() > 1e-7));
            assert!(preview.points.iter().all(|p| p.a.abs() * 111195.0 <= 0.8
                && p.o >= -0.8 / 111195.0
                && p.o <= 0.01 + 0.8 / 111195.0));
            assert!(
                preview
                    .points
                    .windows(2)
                    .all(|p| (p[1].a - p[0].a).abs() * 111195.0 < 0.3
                        && p[1].e >= p[0].e
                        && p[1].s <= 12.0)
            );
            let mut previous = 0;
            for (index, bucket) in preview.step_buckets.iter().enumerate() {
                let second = ((index + 1) * 60).min(value.duration_s as usize);
                assert_eq!(*bucket, preview.points[second].e - previous);
                previous = preview.points[second].e;
            }
            assert_eq!(previous, value.steps);
        }
        let a = generate(value.clone()).expect("a");
        value.seed.push('b');
        let b = generate(value.clone()).expect("b");
        assert_ne!(a.points[100].a, b.points[100].a);
        value.coordinate_noise_m = Some(0.0);
        let zero = generate(value.clone()).expect("zero");
        assert!(zero.points.iter().all(|p| p.a == 0.0));
        value.coordinate_noise_m = Some(4.0);
        assert!(generate(value.clone()).is_err());
        value.coordinate_noise_m = Some(f64::NAN);
        assert!(generate(value).is_err());
    }
    #[test]
    fn noisy_extreme_ratios_keep_time_distance_and_speed_constraints() {
        for (target, duration, noise) in
            [(100.0, 60, 0.8), (30000.0, 7200, 3.0), (8000.0, 7200, 3.0)]
        {
            let mut value = input();
            value.distance_m = target;
            value.duration_s = duration;
            value.steps = (duration as f64 / 60.0 * 120.0).round() as u32;
            value.coordinate_noise_m = Some(noise);
            value.route = vec![
                RoutePoint {
                    latitude: 0.0,
                    longitude: 0.0,
                },
                RoutePoint {
                    latitude: 0.0,
                    longitude: 0.0005,
                },
            ];
            let preview = generate(value).expect("noisy bounded route");
            assert!((preview.actual_distance_m - target).abs() < 0.001);
            assert!(preview.coordinate_noise_m <= noise);
            assert!(preview.points.iter().all(|p| p.s <= 12.0));
        }
    }
    #[test]
    fn explicit_loop_closes_geometry_without_modifying_saved_waypoints() {
        let mut value = input();
        value.close_loop = true;
        value.coordinate_noise_m = Some(0.0);
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
        let route = effective_route(&value.route, true).expect("closed");
        assert_eq!(route.len(), 4);
        assert_eq!(route[3].latitude, 0.0);
        assert_eq!(route[3].longitude, 0.0);
        let preview = generate(value.clone()).expect("loop");
        assert_eq!(preview.input.route.len(), 3);
        assert!((preview.actual_distance_m - value.distance_m).abs() < 0.001);
        value.route.pop();
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
