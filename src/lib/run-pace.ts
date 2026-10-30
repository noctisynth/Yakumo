export const MIN_PACE = 180;
export const MAX_PACE = 900;
export const FAST_PACE_WARNING = 300;

export function validPace(pace: number): boolean {
  return Number.isFinite(pace) && pace >= MIN_PACE && pace <= MAX_PACE;
}

export function validDerivedPace(
  distanceM: number,
  durationS: number,
): boolean {
  const pace = (durationS * 1000) / distanceM;
  const rounding = 501 / distanceM;
  return (
    Number.isFinite(distanceM) &&
    distanceM > 0 &&
    Number.isFinite(pace) &&
    pace + rounding >= MIN_PACE &&
    pace - rounding <= MAX_PACE
  );
}

export function hasFastPaceRisk(distanceM: number, durationS: number): boolean {
  // Compare after the same whole-second rounding used by generation.
  return durationS < Math.round((distanceM / 1000) * FAST_PACE_WARNING);
}
