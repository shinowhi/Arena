import { LearnerProfile } from "./types";
import type { LearnerProfile as SavedProfile } from "./types";

// Local-first profile. Server sync arrives with accounts (P5/P6).
// Key is versioned so a future schema can migrate cleanly.
export const PROFILE_KEY = "arena_profile_v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadProfile(): SavedProfile | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = LearnerProfile.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: SavedProfile): void {
  if (!canUseStorage()) return;
  const parsed = LearnerProfile.safeParse(profile);
  if (!parsed.success) throw new Error("Invalid learner profile");
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(parsed.data));
  } catch {
    // Private mode: profile simply will not persist.
  }
}

export function clearProfile(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(PROFILE_KEY);
  } catch {
    // Ignore.
  }
}