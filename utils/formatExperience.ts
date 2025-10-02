/**
 * Formats a total experience value (in years, possibly fractional) into a human-friendly string.
 * - < 12 months → "X months"
 * - >= 1 year   → "Y yr Z mo" (or "Y years" if exact)
 */
export function formatExperience(years: number | string | null | undefined): string {
  const n = Number(years);
  if (!Number.isFinite(n) || n < 0) return "—";
  const months = Math.round(n * 12);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const y = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${y} year${y === 1 ? "" : "s"}` : `${y} yr ${rem} mo`;
}
