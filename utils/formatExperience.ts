// utils/formatExperience.ts
/**
 * Formats a total experience value (in years, possibly fractional) into a human-friendly string.
 * - < 12 months → "X months"
 * - >= 1 year   → "Y yr Z mo" (or "Y years" if exact)
 *
 * By default we ROUND months to the nearest whole month.
 * To FLOOR instead (e.g., 0.6 → 6 months), change Math.round to Math.floor.
 */
export function formatExperience(years: number | string | null | undefined): string {
  const n = Number(years);
  if (!Number.isFinite(n) || n < 0) return "—";

  const months = Math.round(n * 12); // <-- change to Math.floor(...) if you prefer flooring

  if (months < 12) {
    const m = Math.max(0, months);
    return `${m} month${m === 1 ? "" : "s"}`;
  }

  const y = Math.floor(months / 12);
  const rem = months % 12;

  if (rem === 0) {
    return `${y} year${y === 1 ? "" : "s"}`;
  }
  return `${y} yr ${rem} mo`;
}
