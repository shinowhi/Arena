// Timed exam-mode helpers for practice papers. Pure: mirror-tested offline.

export const EXAM_SECONDS = 900;

// Under this much time left the clock turns urgent.
export const URGENT_MS = 60000;

export function examRemainingMs(deadlineMs: number, nowMs: number): number {
  return Math.max(0, deadlineMs - nowMs);
}

export function examExpired(deadlineMs: number, nowMs: number): boolean {
  return nowMs >= deadlineMs;
}

// mm:ss, zero-padded. Negative input clamps to 00:00.
export function formatExamClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
