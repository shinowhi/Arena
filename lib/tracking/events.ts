// Tiny local-first event tracking (P1). Events queue in localStorage;
// a server sink ships with billing (P4) so metrics survive reinstalls.
export const EVENTS_KEY = "arena_events_v1";
const MAX_EVENTS = 200;

export type TrackName =
  | "profile_completed"
  | "profile_skipped"
  | "start_nudge_clicked"
  | "thpt_started"
  | "thpt_finished";

export type TrackProps = Record<string, string | number | boolean | string[]>;

export interface TrackedEvent {
  t: string; // ISO timestamp
  name: TrackName;
  props?: TrackProps;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function track(name: TrackName, props?: TrackProps): void {
  if (!canUseStorage()) return;
  try {
    const raw = window.localStorage.getItem(EVENTS_KEY);
    const list: TrackedEvent[] = raw ? (JSON.parse(raw) as TrackedEvent[]) : [];
    list.push({ t: new Date().toISOString(), name, ...(props ? { props } : {}) });
    const trimmed = list.length > MAX_EVENTS ? list.slice(list.length - MAX_EVENTS) : list;
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed));
  } catch {
    // Tracking never breaks the app.
  }
}

export function readEvents(): TrackedEvent[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(EVENTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as TrackedEvent[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}