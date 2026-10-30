pub const MIN: f64 = 180.0;
pub const MAX: f64 = 900.0;

pub fn valid(value: f64) -> bool {
    value.is_finite() && (MIN..=MAX).contains(&value)
}

pub fn valid_derived(distance_m: f64, duration_s: u64) -> bool {
    let pace = duration_s as f64 * 1000.0 / distance_m;
    // Half a second of duration rounding, plus geometry precision tolerance.
    let rounding = 501.0 / distance_m;
    distance_m.is_finite() && distance_m > 0.0 && pace + rounding >= MIN && pace - rounding <= MAX
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hard_pace_boundaries_and_duration_rounding() {
        for pace in [180.0, 900.0] {
            assert!(valid(pace));
        }
        for pace in [120.0, 179.0, 901.0, 1200.0, f64::NAN] {
            assert!(!valid(pace));
        }
        assert!(valid_derived(100.1, 90));
        assert!(!valid_derived(1000.0, 179));
        assert!(!valid_derived(1000.0, 901));
    }
}
