// Practice-mode stars (P2): first-try accuracy maps to 0-3 stars.
// Pure: mirrored in scripts/test-exam.mjs. Thresholds: 3* >=90%, 2* >=70%, 1* >=50%.
export function starCount(firstTryRight: number, total: number): number {
  if (!Number.isFinite(firstTryRight) || !Number.isFinite(total) || total <= 0 || firstTryRight < 0) return 0;
  const pct = firstTryRight / total;
  if (pct >= 0.9) return 3;
  if (pct >= 0.7) return 2;
  if (pct >= 0.5) return 1;
  return 0;
}

export function starLabel(stars: number): string {
  const s = Math.max(0, Math.min(3, Math.floor(stars)));
  return "★".repeat(s) + "☆".repeat(3 - s);
}

