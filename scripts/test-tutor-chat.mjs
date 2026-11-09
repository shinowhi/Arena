// Offline tests: chat-tutor leak guard + input rules. No network.
// Run: node arena/scripts/test-tutor-chat.mjs
// Note: mirrors lib/agents/chat-tutor.ts.
import assert from "node:assert/strict";

// Mirror of norm + containsForbiddenText + replyLeaks in chat-tutor.ts.
function norm(s) {
  return s.replace(/\$/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
function containsAnswer(text, answer, tolerance) {
  if (typeof text !== "string" || !Number.isFinite(answer)) return false;
  const tol = Math.max(tolerance, 1e-9);
  const tokens = text.match(/-?\d+(?:\.\d+)?/g) ?? [];
  return tokens.some((t) => Math.abs(Number(t) - answer) <= tol);
}
function containsForbiddenText(reply, texts) {
  if (typeof reply !== "string") return false;
  const r = norm(reply);
  if (!r) return false;
  return texts.some((t) => {
    const n = norm(t);
    return n.length >= 2 && r.includes(n);
  });
}
function replyLeaks(reply, fb) {
  if (fb.numbers.some((f) => containsAnswer(reply, f.value, f.tolerance))) return true;
  if (containsForbiddenText(reply, fb.texts)) return true;
  return false;
}

// Mirror of boundary rules in app/api/tutor/chat/route.ts.
function validBody(b) {
  if (!b || !Array.isArray(b.messages) || b.messages.length < 1 || b.messages.length > 20) return false;
  if (!b.messages.every((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length >= 1 && m.content.length <= 2000)) return false;
  if (b.messages[b.messages.length - 1].role !== "user") return false;
  const c = b.context;
  if (!c || typeof c.kind !== "string") return false;
  if (c.kind === "none") return true;
  if (c.kind === "miss") return typeof c.boss_id === "string" && c.boss_id.length >= 1 && Number.isInteger(c.question_index) && c.question_index >= 0;
  if (c.kind === "exam") return typeof c.section === "string" && c.section.length >= 1 && Number.isInteger(c.index) && c.index >= 0 && typeof c.as_of === "string" && c.as_of.length >= 1;
  return false;
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// Text guard: quotes of the correct option are caught, case/space-insensitive.
ok(containsForbiddenText("I think photosynthesis is the key", ["Photosynthesis"]) === true, "option quote caught");
ok(containsForbiddenText("Think about $x^2$ here", ["x^2"]) === true, "math quote caught");
ok(containsForbiddenText("Let's solve step by step", ["Photosynthesis"]) === false, "clean reply passes");
ok(containsForbiddenText("Nice try", ["x"]) === false, "short texts ignored");
ok(containsForbiddenText("", ["anything"]) === false, "empty reply safe");
// Combined leak check: numbers AND texts.
const fb = { numbers: [{ value: 12.5, tolerance: 0.01 }], texts: ["mitochondria"] };
ok(replyLeaks("The answer is 12.5, well done", fb) === true, "numeric leak caught");
ok(replyLeaks("It happens in the Mitochondria", fb) === true, "text leak caught");
ok(replyLeaks("Check your signs and try again", fb) === false, "socratic reply passes");
ok(replyLeaks("Close: 12.9 is not it", fb) === false, "near-miss number passes");
ok(replyLeaks("Anything goes here", { numbers: [], texts: [] }) === false, "free mode no forbiddens");
// Boundary rules.
const msg = (role) => ({ role, content: "hi" });
ok(validBody({ messages: [msg("user")], context: { kind: "none" } }) === true, "minimal free chat valid");
ok(validBody({ messages: [msg("user"), msg("assistant"), msg("user")], context: { kind: "miss", boss_id: "b1", question_index: 2 } }) === true, "miss ctx valid");
ok(validBody({ messages: [msg("user")], context: { kind: "exam", section: "s", index: 0, as_of: "t" } }) === true, "exam ctx valid");
ok(validBody({ messages: [], context: { kind: "none" } }) === false, "empty history rejected");
ok(validBody({ messages: Array.from({ length: 21 }, () => msg("user")), context: { kind: "none" } }) === false, "21 turns rejected");
ok(validBody({ messages: [{ role: "user", content: "x".repeat(2001) }], context: { kind: "none" } }) === false, "long message rejected");
ok(validBody({ messages: [{ role: "system", content: "hi" }], context: { kind: "none" } }) === false, "system role rejected");
ok(validBody({ messages: [msg("user")], context: { kind: "miss" } }) === false, "short miss ctx rejected");
ok(validBody({ messages: [msg("assistant")], context: { kind: "none" } }) === false, "assistant-last rejected");

console.log(`TUTOR CHAT TESTS OK: ${n} assertions`);
