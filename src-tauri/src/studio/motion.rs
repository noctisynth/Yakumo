use sha2::{Digest, Sha256};

pub struct Motion {
    pub progress: f64,
    pub north: f64,
    pub east: f64,
}

// Stable, local simulation randomness; never used for credentials or cryptography.
struct Sequence(u64);
impl Sequence {
    fn signed(&mut self) -> f64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        let value = self.0.wrapping_mul(0x2545_f491_4f6c_dd1d);
        (value >> 11) as f64 / (1_u64 << 53) as f64 * 2.0 - 1.0
    }
}

pub fn motion(duration: u32, seed: &str, radius: f64) -> Vec<Motion> {
    let hash = Sha256::digest(format!("waypoints-v3:{seed}"));
    let mut bytes = [0; 8];
    bytes.copy_from_slice(&hash[..8]);
    let mut rng = Sequence(u64::from_le_bytes(bytes).max(1));
    let knots: Vec<[f64; 3]> = (0..duration / 8 + 2)
        .map(|_| [rng.signed(), rng.signed(), rng.signed()])
        .collect();
    let mut cumulative = 0.0;
    let mut samples: Vec<Motion> = (0..=duration)
        .map(|second| {
            let index = (second / 8) as usize;
            let fraction = (second % 8) as f64 / 8.0;
            let mix = (1.0 - (std::f64::consts::PI * fraction).cos()) / 2.0;
            let smooth = |axis| knots[index][axis] * (1.0 - mix) + knots[index + 1][axis] * mix;
            if second != 0 {
                cumulative += 1.0 + smooth(0) * 0.05;
            }
            Motion {
                progress: cumulative,
                north: smooth(1) * radius / std::f64::consts::SQRT_2,
                east: smooth(2) * radius / std::f64::consts::SQRT_2,
            }
        })
        .collect();
    for sample in &mut samples {
        sample.progress /= cumulative;
    }
    samples
}
