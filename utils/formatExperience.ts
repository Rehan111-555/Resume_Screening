// utils/formatExperience.ts
export function formatExperience(years: number | string | null | undefined): string {
  const n = Number(years);
  if (!Number.isFinite(n) || n < 0) return "—";
  const months = Math.round(n * 12);
  if (months < 12) {
    const m = Math.max(0, months);
    return `${m} month${m === 1 ? "" : "s"}`;
    }
  const y = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${y} year${y === 1 ? "" : "s"}`;
  return `${y} yr ${rem} mo`;
}
