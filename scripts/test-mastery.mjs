// Offline tests: mastery engine + today picker. No network.
// Run: node arena/scripts/test-mastery.mjs
// Note: mirrors lib/mastery/compute.ts and lib/mastery/today.ts (plus the
// sm2Next replay from lib/game/adaptive.ts); skill ids/names come from the
// REAL skill-graph.json.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const graph = JSON.parse(readFileSync(path.join(here, "../lib/graph/skill-graph.json"), "utf8"));
const byId = new Map(graph.skills.map((s) => [s.id, s]));
const isValidSkill = (id) => byId.has(id);
const skillName = (id) => byId.get(id)?.name ?? id;
const [SK_A, SK_B, SK_C, SK_D, SK_E, SK_F] = graph.skills.map((s) => s.id);

// --- mirrors of lib/game/adaptive.ts (sm2Next only) ---
function sm2Next(reps, intervalDays, quality) {
  if (quality < 3) return { reps: 0, intervalDays: 1 };
  const r = reps + 1;
  if (r === 1) return { reps: r, intervalDays: 1 };
  if (r === 2) return { reps: r, intervalDays: 6 };
  return { reps: r, intervalDays: Math.round(intervalDays * 2.5) };
}

// --- mirrors of lib/mastery/compute.ts ---
const MASTERY_WINDOW = 20;
const MIN_ATTEMPTS = 3;
const SLAIN_BONUS = 15;
const STALE_SCAN_PENALTY = 10;
function statusFor(mastery) {
  if (mastery === null) return "new";
  if (mastery >= 80) return "solid";
  if (mastery >= 50) return "shaky";
  return "weak";
}
const cmpTime = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
function computeMastery(attempts, scans, slain) {
  const slainSet = new Set(slain);
  const bySkill = new Map();
  for (const a of attempts) {
    if (!a.skill_tag) continue;
    const list = bySkill.get(a.skill_tag) ?? [];
    list.push(a);
    bySkill.set(a.skill_tag, list);
  }
  const lastScanAt = new Map();
  for (const s of scans) {
    if (!s.weak_skill) continue;
    const prev = lastScanAt.get(s.weak_skill);
    if (!prev || cmpTime(prev, s.at) < 0) lastScanAt.set(s.weak_skill, s.at);
  }
  const out = [];
  for (const tag of new Set([...bySkill.keys(), ...lastScanAt.keys()])) {
    const list = (bySkill.get(tag) ?? []).slice().sort((x, y) => cmpTime(x.at, y.at));
    const total = list.length;
    const right = list.filter((a) => a.correct).length;
    const last_at = total > 0 ? list[total - 1].at : null;
    let mastery = null;
    if (total >= MIN_ATTEMPTS) {
      const window = list.slice(-MASTERY_WINDOW);
      const wins = window.filter((a) => a.correct).length;
      let score = Math.round((wins / window.length) * 100);
      if (slainSet.has(tag)) score = Math.min(100, score + SLAIN_BONUS);
      const scanAt = lastScanAt.get(tag);
      if (scanAt && (!last_at || cmpTime(last_at, scanAt) < 0)) {
        score = Math.max(0, score - STALE_SCAN_PENALTY);
      }
      mastery = score;
    }
    let trend = "flat";
    if (total >= 10) {
      const acc = (w) => w.filter((a) => a.correct).length / w.length;
      const d = acc(list.slice(-5)) - acc(list.slice(-10, -5));
      trend = d > 0 ? "up" : d < 0 ? "down" : "flat";
    }
    out.push({ tag, mastery, status: statusFor(mastery), trend, total, right, last_at });
  }
  const rank = (s) => (s === "weak" ? 0 : s === "shaky" ? 1 : s === "solid" ? 2 : 3);
  out.sort((x, y) => rank(x.status) - rank(y.status) || (x.tag < y.tag ? -1 : x.tag > y.tag ? 1 : 0));
  return out;
}

// --- mirrors of lib/mastery/today.ts ---
const DAY_MS = 86_400_000;
const RECENT_MS = 14 * DAY_MS;
function dueSkillsForReview(attempts, nowMs = Date.now()) {
  const bySkill = new Map();
  for (const a of attempts) {
    if (!a.skill_tag || !isValidSkill(a.skill_tag)) continue;
    if (Number.isNaN(new Date(a.at).getTime())) continue;
    const list = bySkill.get(a.skill_tag) ?? [];
    list.push(a);
    bySkill.set(a.skill_tag, list);
  }
  const due = [];
  for (const [tag, list] of bySkill) {
    list.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
    let reps = 0;
    let intervalDays = 1;
    for (const a of list) {
      const next = sm2Next(reps, intervalDays, a.correct ? 5 : 0);
      reps = next.reps;
      intervalDays = next.intervalDays;
    }
    const lastAt = new Date(list[list.length - 1].at).getTime();
    const overdueMs = nowMs - (lastAt + intervalDays * DAY_MS);
    if (overdueMs >= 0) due.push({ tag, overdueMs });
  }
  due.sort((x, y) => y.overdueMs - x.overdueMs || (x.tag < y.tag ? -1 : 1));
  return due.map((d) => d.tag);
}
function pickToday(mastery, dueSkills, nowMs = Date.now()) {
  const items = [];
  const seen = new Set();
  const push = (tag, label, reason) => {
    if (seen.has(tag) || items.length >= 5 || !isValidSkill(tag)) return;
    seen.add(tag);
    items.push({ label, href: `/drill?skill=${encodeURIComponent(tag)}`, reason });
  };
  for (const tag of dueSkills) push(tag, `Review ${skillName(tag)} — due for recall`, "due");
  const recentWeak = mastery
    .filter(
      (m) =>
        m.status === "weak" &&
        m.last_at !== null &&
        !Number.isNaN(new Date(m.last_at).getTime()) &&
        nowMs - new Date(m.last_at).getTime() <= RECENT_MS,
    )
    .sort((x, y) => (x.mastery ?? 0) - (y.mastery ?? 0));
  for (const m of recentWeak) push(m.tag, `Rebuild ${skillName(m.tag)} — your weakest link`, "weak");
  const shaky = mastery.filter((m) => m.status === "shaky").sort((x, y) => (y.mastery ?? 0) - (x.mastery ?? 0))[0];
  if (shaky) push(shaky.tag, `Consolidate ${skillName(shaky.tag)} — almost solid`, "shaky");
  if (items.length === 0) items.push({ label: "Start a fresh drill on any topic", href: "/drill", reason: "new" });
  return items.slice(0, 5);
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
// n attempts oldest-first: first `wrong` wrong, rest right.
function seq(tag, count, wrong, startMs, stepMs = 1000) {
  return Array.from({ length: count }, (_, i) => ({
    skill_tag: tag,
    correct: i >= wrong,
    at: iso(startMs + i * stepMs),
  }));
}
const T0 = NOW - 30 * DAY_MS;

// Accuracy math: 15/20 right → 75, shaky.
let r = computeMastery(seq(SK_A, 20, 5, T0), [], [])[0];
ok(r.mastery === 75 && r.status === "shaky" && r.total === 20 && r.right === 15, "accuracy 15/20 = 75 shaky");
// Last-20 window: 10 old wrong + 20 recent right → 100.
r = computeMastery(seq(SK_A, 30, 10, T0), [], [])[0];
ok(r.mastery === 100 && r.total === 30 && r.right === 20, "window ignores attempts past 20");
// Min-attempts gate: 2 attempts → null/new.
r = computeMastery(seq(SK_A, 2, 0, T0), [], [])[0];
ok(r.mastery === null && r.status === "new", "under 3 attempts is new");
// Exactly 3 attempts → computed: 2/3 rounds to 67.
r = computeMastery(seq(SK_A, 3, 1, T0), [], [])[0];
ok(r.mastery === 67 && r.status === "shaky", "3 attempts computed, 2/3 = 67");
// Slain bonus: 10/20 = 50 → 65.
r = computeMastery(seq(SK_A, 20, 10, T0), [], [SK_A])[0];
ok(r.mastery === 65, "slain bonus +15, got " + r.mastery);
// Slain bonus caps at 100: 19/20 = 95 → 100.
r = computeMastery(seq(SK_A, 20, 1, T0), [], [SK_A])[0];
ok(r.mastery === 100, "slain bonus caps at 100");
// Stale scan penalty: 14/20 = 70, scan newer than last attempt → 60.
const att = seq(SK_A, 20, 6, T0);
const lastMs = new Date(att[att.length - 1].at).getTime();
r = computeMastery(att, [{ weak_skill: SK_A, at: iso(lastMs + 1) }], [])[0];
ok(r.mastery === 60, "stale scan penalty -10, got " + r.mastery);
// Penalty floors at 0: 1/20 = 5 → 0.
const att2 = seq(SK_A, 20, 19, T0);
const last2 = new Date(att2[att2.length - 1].at).getTime();
r = computeMastery(att2, [{ weak_skill: SK_A, at: iso(last2 + 1) }], [])[0];
ok(r.mastery === 0 && r.status === "weak", "penalty floors at 0");
// No penalty when the scan predates practice.
r = computeMastery(att, [{ weak_skill: SK_A, at: iso(T0 - 1000) }], [])[0];
ok(r.mastery === 70, "old scan keeps 70, got " + r.mastery);
// Another skill's scan changes nothing for this skill.
r = computeMastery(att, [{ weak_skill: SK_B, at: iso(lastMs + 1) }], []).find((x) => x.tag === SK_A);
ok(r.mastery === 70, "other-skill scan ignored");
// Trend up: first 5 wrong, last 5 right.
r = computeMastery(seq(SK_A, 10, 5, T0), [], [])[0];
ok(r.trend === "up", "trend up");
// Trend down: first 5 right, last 5 wrong.
r = computeMastery(seq(SK_A, 10, 0, T0).map((a, i) => ({ ...a, correct: i < 5 })), [], [])[0];
ok(r.trend === "down", "trend down");
// Trend flat on equal halves: 3/5 vs 3/5.
const halves = [true, true, true, false, false, true, true, true, false, false].map((c, i) => ({
  skill_tag: SK_A,
  correct: c,
  at: iso(T0 + i * 1000),
}));
r = computeMastery(halves, [], [])[0];
ok(r.trend === "flat" && r.mastery === 60, "trend flat on tie");
// Trend flat with insufficient data (9 attempts).
r = computeMastery(seq(SK_A, 9, 9, T0), [], [])[0];
ok(r.trend === "flat", "trend flat under 10 attempts");
// Status thresholds exact.
ok(statusFor(80) === "solid" && statusFor(100) === "solid", "solid at 80+");
ok(statusFor(79) === "shaky" && statusFor(50) === "shaky", "shaky 50..79");
ok(statusFor(49) === "weak" && statusFor(0) === "weak", "weak under 50");
ok(statusFor(null) === "new", "null is new");
// Scan-only skill: null/new, zero totals, no last_at.
r = computeMastery([], [{ weak_skill: SK_B, at: iso(NOW - 1000) }], []).find((x) => x.tag === SK_B);
ok(r.mastery === null && r.status === "new" && r.total === 0 && r.right === 0 && r.last_at === null, "scan-only is new");
// Weak-first ordering: weak skill sorts before solid.
const both = computeMastery([...seq(SK_A, 20, 0, T0), ...seq(SK_B, 3, 3, T0)], [], []);
ok(both[0].tag === SK_B && both[0].status === "weak" && both[1].status === "solid", "weak sorts first");
// Empty inputs → empty output.
ok(computeMastery([], [], []).length === 0, "empty in, empty out");

// --- pickToday: hand-built mastery rows ---
const mk = (tag, mastery, status, last_at) => ({ tag, mastery, status, trend: "flat", total: 10, right: 5, last_at });
const recentIso = iso(NOW - 3600_000);
const staleIso = iso(NOW - 20 * DAY_MS);
// Due first, weak second, with reasons.
let items = pickToday([mk(SK_B, 20, "weak", recentIso)], [SK_A], NOW);
ok(items.length === 2 && items[0].reason === "due" && items[0].href.includes(SK_A), "due first");
ok(items[1].reason === "weak" && items[1].href.includes(encodeURIComponent(SK_B)), "weak second");
// Max 5: 3 due + 3 weak → 5 items.
items = pickToday(
  [mk(SK_D, 10, "weak", recentIso), mk(SK_E, 20, "weak", recentIso), mk(SK_F, 30, "weak", recentIso)],
  [SK_A, SK_B, SK_C],
  NOW,
);
ok(items.length === 5 && items.filter((i) => i.reason === "due").length === 3, "max 5 keeps due first");
// Fallback when empty: plain /drill, reason new.
items = pickToday([], [], NOW);
ok(items.length === 1 && items[0].href === "/drill" && items[0].reason === "new", "empty falls back");
// One shaky: highest mastery wins.
items = pickToday([mk(SK_C, 60, "shaky", recentIso), mk(SK_D, 70, "shaky", recentIso)], [], NOW);
ok(items.length === 1 && items[0].href.includes(encodeURIComponent(SK_D)) && items[0].reason === "shaky", "one shaky, highest first");
// Stale weak (no recent activity) is skipped → fallback.
items = pickToday([mk(SK_B, 20, "weak", staleIso)], [], NOW);
ok(items.length === 1 && items[0].reason === "new", "stale weak skipped");
// Dedupe: due + weak on one skill → single due item.
items = pickToday([mk(SK_B, 20, "weak", recentIso)], [SK_B], NOW);
ok(items.length === 1 && items[0].reason === "due", "dedupe keeps first");
// Invalid tags never surface.
items = pickToday([mk("nope", 10, "weak", recentIso)], ["nope"], NOW);
ok(items.length === 1 && items[0].reason === "new", "invalid tags ignored");

// --- dueSkillsForReview ---
// One correct attempt 3 days ago: interval 1d → due.
ok(dueSkillsForReview([{ skill_tag: SK_A, correct: true, at: iso(NOW - 3 * DAY_MS) }], NOW).includes(SK_A), "old review due");
// Practiced an hour ago: interval 1d → not due.
ok(dueSkillsForReview([{ skill_tag: SK_A, correct: true, at: iso(NOW - 3600_000) }], NOW).length === 0, "fresh review not due");
// No attempts → no schedule → never due.
ok(dueSkillsForReview([], NOW).length === 0, "no attempts never due");
// A fail resets the interval: 3 old correct then a wrong 2 days ago → due …
const mixed = [
  ...seq(SK_A, 3, 0, NOW - 30 * DAY_MS),
  { skill_tag: SK_A, correct: false, at: iso(NOW - 2 * DAY_MS) },
];
ok(dueSkillsForReview(mixed, NOW).includes(SK_A), "fail resets interval to due");
// … while 3 old correct alone (interval 15d) would still be fresh.
ok(dueSkillsForReview(seq(SK_A, 3, 0, NOW - 3 * DAY_MS), NOW).length === 0, "long interval stays fresh");
// Most overdue first.
const twoDue = dueSkillsForReview(
  [
    { skill_tag: SK_A, correct: true, at: iso(NOW - 10 * DAY_MS) },
    { skill_tag: SK_B, correct: true, at: iso(NOW - 3 * DAY_MS) },
  ],
  NOW,
);
ok(twoDue[0] === SK_A && twoDue[1] === SK_B, "most overdue first");

console.log(`MASTERY TESTS OK: ${n} assertions`);
