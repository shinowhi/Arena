// Offline tests: P4.4 VIP TUTOR+ memory + nudges. No network.
// Run: node arena/scripts/test-tutor-threads.mjs
// Note: mirrors lib/tutor/threads.ts (sliceContext, threadOwnedBy,
// resolveThreadMode, sanitizeTitle, previewOf) and lib/tutor/nudges.ts.
import assert from "node:assert/strict";

// ---- Mirrors of lib/tutor/threads.ts ----
const CONTEXT_WINDOW = 12;
const TITLE_MAX = 80;
const PREVIEW_MAX = 80;
const DEFAULT_TITLE = "Chat";
function sliceContext(messages, n = CONTEXT_WINDOW) {
  if (!Number.isInteger(n) || n <= 0) return [];
  return messages.slice(-n);
}
function threadOwnedBy(threadPlayerId, callerPlayerId) {
  return typeof threadPlayerId === "string" && threadPlayerId === callerPlayerId;
}
function resolveThreadMode(vip, threadId, threadPlayerId, callerPlayerId) {
  if (!threadId) return "stateless";
  if (!vip) return "stateless";
  return threadOwnedBy(threadPlayerId, callerPlayerId) ? "context" : "forbidden";
}
function sanitizeTitle(raw) {
  if (typeof raw !== "string") return DEFAULT_TITLE;
  const t = raw.trim().slice(0, TITLE_MAX);
  return t.length > 0 ? t : DEFAULT_TITLE;
}
function previewOf(content) {
  if (typeof content !== "string") return "";
  return content.replace(/\s+/g, " ").trim().slice(0, PREVIEW_MAX);
}

// ---- Mirror of lib/tutor/nudges.ts ----
const NUDGE_MAX = 2;
function pickNudges(items) {
  const priority = items.filter((i) => i.reason === "due" || i.reason === "weak");
  const rest = items.filter((i) => i.reason !== "due" && i.reason !== "weak");
  return [...priority, ...rest].slice(0, NUDGE_MAX);
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// Context-window slicing: last 12, order preserved.
const turns = (k) => Array.from({ length: k }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
ok(sliceContext(turns(5)).length === 5, "short history kept whole");
ok(sliceContext(turns(12)).length === 12, "exactly 12 kept whole");
ok(sliceContext(turns(30)).length === 12, "long history cut to 12");
ok(sliceContext(turns(30))[0].content === "m18", "window is the LAST 12 in order");
ok(sliceContext(turns(30))[11].content === "m29", "window ends at newest turn");
ok(sliceContext(turns(30), 20).length === 20, "combined window takes 20");
ok(sliceContext(turns(5), 0).length === 0, "non-positive window is empty");

// Thread ownership check (pure).
ok(threadOwnedBy("p1", "p1") === true, "owner matches");
ok(threadOwnedBy("p2", "p1") === false, "foreign thread rejected");
ok(threadOwnedBy(null, "p1") === false, "missing thread rejected");

// VIP gate matrix.
ok(resolveThreadMode(false, undefined, null, "p1") === "stateless", "free no-thread stateless");
ok(resolveThreadMode(true, undefined, null, "p1") === "stateless", "vip no-thread stateless");
ok(resolveThreadMode(false, "t1", "p1", "p1") === "stateless", "free+thread ignored (stateless)");
ok(resolveThreadMode(false, "t1", "p2", "p1") === "stateless", "free+foreign-thread ignored, not 403");
ok(resolveThreadMode(false, "t1", null, "p1") === "stateless", "free+missing-thread ignored, not 403");
ok(resolveThreadMode(true, "t1", "p1", "p1") === "context", "vip+own-thread loads context");
ok(resolveThreadMode(true, "t1", "p2", "p1") === "forbidden", "vip+foreign-thread forbidden");
ok(resolveThreadMode(true, "t1", null, "p1") === "forbidden", "vip+missing-thread forbidden (no oracle)");

// Title + preview rules.
ok(sanitizeTitle("  Algebra  ") === "Algebra", "title trimmed");
ok(sanitizeTitle("   ") === "Chat", "blank title defaults");
ok(sanitizeTitle(undefined) === "Chat", "missing title defaults");
ok(sanitizeTitle("x".repeat(200)).length === 80, "long title capped");
ok(previewOf("hello\nworld") === "hello world", "preview single-lines");
ok(previewOf(null) === "", "missing preview empty");

// Nudge mapping: due/weak first, cap 2, shape preserved.
const item = (reason, tag) => ({ label: `${reason} ${tag}`, href: `/drill?skill=${tag}`, reason });
const mixed = [item("new", "n1"), item("due", "d1"), item("weak", "w1"), item("due", "d2"), item("shaky", "s1")];
const nudges = pickNudges(mixed);
ok(nudges.length === 2, "nudges capped at 2");
ok(nudges[0].reason === "due" && nudges[0].href === "/drill?skill=d1", "first nudge is top due with drill href");
ok(nudges[1].reason === "weak" && nudges[1].href === "/drill?skill=w1", "second nudge is top weak with drill href");
ok(typeof nudges[0].label === "string" && nudges[0].label.length > 0, "nudge keeps label/href shape");
ok(pickNudges([item("shaky", "s1")])[0].reason === "shaky", "fills from rest when nothing due/weak");
ok(pickNudges([{ label: "Start a fresh drill on any topic", href: "/drill", reason: "new" }]).length === 1, "generic fallback passes through");
ok(pickNudges([]).length === 0, "empty today list stays empty");

console.log(`TUTOR THREADS TESTS OK: ${n} assertions`);
