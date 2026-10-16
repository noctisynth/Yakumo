//! Checks the final WGS84 track against the school's AMap polygon contract.
//! Conversions are comparison-only; neither the track nor the settings are changed.
use geo::orient::{Direction, Orient};
use geo::{Area, Coord, LineString, Polygon, Relate, Validation, algorithm::unary_union};
use serde_json::Value;

use crate::exercise::service::scalar_number;

pub(super) const MAX_TEXT_BYTES: usize = 64 * 1024;
const MAX_POLYGONS: usize = 32;
const MAX_VERTICES: usize = 2048;
const MAX_TRACK_POINTS: usize = 7201;

#[derive(Debug, PartialEq)]
pub(super) enum Error {
    Configuration,
    Track,
    Outside,
}
impl Error {
    pub(super) fn message(&self) -> &'static str {
        match self {
            Self::Configuration => "学校返回的运动区域配置无法读取，请刷新学校配置后重试。",
            Self::Track => "轨迹坐标或点数无效，无法检查学校运动区域。",
            Self::Outside => "轨迹包含学校允许运动区域以外的点或路段，请检查路线。",
        }
    }
}

fn coordinate(latitude: f64, longitude: f64) -> Result<Coord, Error> {
    if !latitude.is_finite()
        || !longitude.is_finite()
        || latitude.abs() > 85.0
        || longitude.abs() > 179.0
    {
        return Err(Error::Track);
    }
    Ok(Coord {
        x: longitude,
        y: latitude,
    })
}

/// `Ok(false)` means an explicitly empty rule; `Ok(true)` means actually checked.
pub(super) fn check(
    settings: &Value,
    track: impl IntoIterator<Item = (f64, f64)>,
) -> Result<bool, Error> {
    let raw = serde_json::to_string(settings).map_err(|_| Error::Configuration)?;
    if settings.as_str().map_or(raw.len(), str::len) > MAX_TEXT_BYTES {
        return Err(Error::Configuration);
    }
    let values = super::school_rules::array(settings).ok_or(Error::Configuration)?;
    if values.is_empty() {
        return Ok(false);
    }
    if values.len() > MAX_POLYGONS {
        return Err(Error::Configuration);
    }
    let mut count = 0;
    let mut polygons = Vec::with_capacity(values.len());
    for value in &values {
        let vertices = value.as_array().ok_or(Error::Configuration)?;
        count += vertices.len();
        if vertices.len() < 3 || count > MAX_VERTICES {
            return Err(Error::Configuration);
        }
        let ring: Vec<Coord> = vertices
            .iter()
            .map(|vertex| {
                let latitude = scalar_number(&vertex["lat"]).ok_or(Error::Configuration)?;
                let longitude = scalar_number(&vertex["lng"]).ok_or(Error::Configuration)?;
                coordinate(latitude, longitude).map_err(|_| Error::Configuration)
            })
            .collect::<Result<_, _>>()?;
        let min_lon = ring.iter().map(|p| p.x).fold(f64::INFINITY, f64::min);
        let max_lon = ring.iter().map(|p| p.x).fold(f64::NEG_INFINITY, f64::max);
        // A planar ring cannot safely represent an antimeridian crossing.
        if max_lon - min_lon >= 180.0 {
            return Err(Error::Configuration);
        }
        let polygon = Polygon::new(LineString::new(ring), vec![]);
        if !polygon.is_valid() || polygon.unsigned_area() <= 0.0 {
            return Err(Error::Configuration);
        }
        polygons.push(polygon.orient(Direction::Default));
    }
    let regions = unary_union(&polygons);
    if regions.0.is_empty() || !regions.is_valid() {
        return Err(Error::Configuration);
    }
    let path: Vec<Coord> = track
        .into_iter()
        .take(MAX_TRACK_POINTS + 1)
        .map(|(lat, lon)| {
            coordinate(lat, lon)?;
            let (longitude, latitude) = coordtransform::wgs84_to_gcj02(lon, lat);
            coordinate(latitude, longitude)
        })
        .collect::<Result<_, _>>()?;
    if !(2..=MAX_TRACK_POINTS).contains(&path.len()) {
        return Err(Error::Track);
    }
    // Covers includes the boundary and checks the connecting segments as well as
    // vertices, so a shortcut through the outside of a concave region is rejected.
    if !regions.relate(&LineString::new(path)).is_covers() {
        return Err(Error::Outside);
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn square(x: f64, y: f64, size: f64) -> Value {
        json!([
            {"lat":y,"lng":x,"kept":"extra"},
            {"lat":y,"lng":x+size},
            {"lat":y+size,"lng":x+size},
            {"lat":y+size,"lng":x}
        ])
    }

    #[test]
    fn actual_region_check_accepts_inside_and_boundary_but_rejects_outside() {
        let settings = json!([square(0.0, 0.0, 1.0)]);
        assert_eq!(check(&settings, [(0.2, 0.2), (0.8, 0.8)]), Ok(true));
        assert_eq!(check(&settings, [(0.0, 0.0), (0.0, 1.0)]), Ok(true));
        assert_eq!(
            check(&settings, [(0.2, 0.2), (1.1, 0.8)]),
            Err(Error::Outside)
        );
        assert_eq!(
            check(&settings, [(10.0, 10.0), (10.1, 10.1)]),
            Err(Error::Outside)
        );
        assert_eq!(check(&json!([]), [(10.0, 10.0), (10.1, 10.1)]), Ok(false));
    }

    #[test]
    fn concave_region_checks_segments_not_just_sampled_points() {
        let settings = json!([[
            {"lat":0,"lng":0},{"lat":0,"lng":3},{"lat":3,"lng":3},
            {"lat":3,"lng":2},{"lat":1,"lng":2},{"lat":1,"lng":1},
            {"lat":3,"lng":1},{"lat":3,"lng":0}
        ]]);
        assert_eq!(
            check(&settings, [(2.0, 0.5), (2.0, 2.5)]),
            Err(Error::Outside)
        );
        assert_eq!(
            check(&settings, [(2.0, 0.5), (0.5, 0.5), (0.5, 2.5), (2.0, 2.5)]),
            Ok(true)
        );
    }

    #[test]
    fn regions_form_a_union_and_gaps_are_not_implicitly_allowed() {
        let overlapping = json!([square(0.0, 0.0, 2.0), square(1.0, 0.0, 2.0)]);
        assert_eq!(check(&overlapping, [(1.0, 0.5), (1.0, 2.5)]), Ok(true));
        let separate = json!([square(0.0, 0.0, 1.0), square(2.0, 0.0, 1.0)]);
        assert_eq!(
            check(&separate, [(0.5, 0.5), (0.5, 2.5)]),
            Err(Error::Outside)
        );
        assert_eq!(check(&separate, [(0.2, 2.2), (0.8, 2.8)]), Ok(true));
    }

    #[test]
    fn mixed_scalars_closed_rings_and_json_text_preserve_the_raw_rule() {
        let original = json!([[{"lat":"0","lng":0,"custom":"preserved"},
            {"lat":0,"lng":"1"},{"lat":"1","lng":1},{"lat":1,"lng":0},{"lat":"0","lng":0}]]);
        let copy = original.clone();
        assert_eq!(check(&original, [(0.2, 0.2), (0.8, 0.8)]), Ok(true));
        assert_eq!(
            check(
                &Value::String(original.to_string()),
                [(0.2, 0.2), (0.8, 0.8)]
            ),
            Ok(true)
        );
        assert_eq!(original, copy);
    }

    #[test]
    fn malformed_and_degenerate_regions_are_not_empty_rules() {
        for value in [
            Value::Null,
            json!({}),
            json!("null"),
            json!([[]]),
            json!([[{"lat":0,"lng":0},{"lat":0,"lng":1}]]),
            json!([[{"lat":0,"lng":0},{"lat":0,"lng":1},{"lat":0,"lng":2}]]),
            json!([[{"lat":0,"lng":0},{"lat":1,"lng":1},{"lat":0,"lng":1},{"lat":1,"lng":0}]]),
            json!([[{"lat":true,"lng":0},{"lat":1,"lng":1},{"lat":0,"lng":1}]]),
            json!([[{"lat":"NaN","lng":0},{"lat":1,"lng":1},{"lat":0,"lng":1}]]),
            json!([[{"lat":91,"lng":0},{"lat":1,"lng":1},{"lat":0,"lng":1}]]),
        ] {
            assert_eq!(
                check(&value, [(0.2, 0.2), (0.8, 0.8)]),
                Err(Error::Configuration)
            );
        }
    }

    #[test]
    fn wgs84_track_is_compared_in_amap_reference_without_mutation() {
        // Public coordinate-transform example, not an account or campus location.
        let longitude = 116.404;
        let latitude = 39.915;
        let (x, y) = coordtransform::wgs84_to_gcj02(longitude, latitude);
        let settings = json!([square(x - 0.0001, y - 0.0001, 0.0002)]);
        let path = [
            (latitude, longitude),
            (latitude + 0.00001, longitude + 0.00001),
        ];
        let original = path;
        assert_eq!(check(&settings, path), Ok(true));
        assert_eq!(path, original);
        let wrong_reference = json!([square(longitude - 0.0001, latitude - 0.0001, 0.0002)]);
        assert_eq!(check(&wrong_reference, path), Err(Error::Outside));
    }

    #[test]
    fn inputs_are_bounded_and_bad_tracks_fail_closed() {
        let settings = json!([square(0.0, 0.0, 1.0)]);
        assert_eq!(
            check(
                &json!([vec![json!({"lat":0,"lng":0}); MAX_VERTICES + 1]]),
                [(0.2, 0.2), (0.8, 0.8)]
            ),
            Err(Error::Configuration)
        );
        let mut oversized = settings.clone();
        oversized[0][0]["extra"] = json!("x".repeat(MAX_TEXT_BYTES));
        assert_eq!(
            check(&oversized, [(0.2, 0.2), (0.8, 0.8)]),
            Err(Error::Configuration)
        );
        assert_eq!(
            check(&settings, [(f64::NAN, 0.0), (0.5, 0.5)]),
            Err(Error::Track)
        );
        assert_eq!(check(&settings, [(0.5, 0.5)]), Err(Error::Track));
        assert_eq!(
            check(
                &settings,
                std::iter::repeat_n((0.5, 0.5), MAX_TRACK_POINTS + 1)
            ),
            Err(Error::Track)
        );
        assert_eq!(
            check(
                &json!(vec![square(0.0, 0.0, 1.0); MAX_POLYGONS + 1]),
                [(0.2, 0.2), (0.8, 0.8)]
            ),
            Err(Error::Configuration)
        );
    }
}
