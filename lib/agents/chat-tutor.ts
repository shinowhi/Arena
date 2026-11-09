import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatJson } from "../llm/meta";
import { recompute } from "../verify/math-verifier";
import { CheckSpecSchema } from "./boss-generator";
import { containsAnswer } from "./mistake-tutor";
import { ExamQuestion, EXAM_SET_VERSION } from "./exam";

// Free-chat AI tutor. Students ask anything; when the chat attaches to a live
// question (a miss or an exam item), the tutor guides WITHOUT ever revealing
// the answer. Trust design:
// - The client sends REFERENCES (boss+index, section+index), never answers.
// - The server resolves the answer key itself and scans every reply in code.
//   The system prompt is not the boundary; the scan is.
// - Miss context requires a real attempt (attacks row) by this player, so one
//   player cannot mine keys for bosses they never fought.

export const TutorContext = z.union([
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("miss"), boss_id: z.string().min(1).max(64), question_index: z.number().int().min(0).max(20) }),
  z.object({
    kind: z.literal("exam"),
    section: z.string().min(1).max(64),
    index: z.number().int().min(0),
    as_of: z.string().min(1),
  }),
]);
export type TutorContext = z.infer<typeof TutorContext>;

export const TutorMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});
export const TutorHistory = z.array(TutorMessage).min(1).max(20);

const TutorReply = z.object({ reply: z.string().min(1).max(2000) });

export type Forbidden = {
  question: string | null;
  numbers: Array<{ value: number; tolerance: number }>;
  texts: string[];
};

export class TutorNotFound extends Error {}
export class TutorStale extends Error {}

type Supa = SupabaseClient;

function norm(s: string): string {
  return s.replace(/\$/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// True when the reply quotes a forbidden option text (normalized contains).
export function containsForbiddenText(reply: string, texts: string[]): boolean {
  if (typeof reply !== "string") return false;
  const r = norm(reply);
  if (!r) return false;
  return texts.some((t) => {
    const n = norm(t);
    return n.length >= 2 && r.includes(n);
  });
}

export function replyLeaks(reply: string, fb: Forbidden): boolean {
  if (fb.numbers.some((f) => containsAnswer(reply, f.value, f.tolerance))) return true;
  if (containsForbiddenText(reply, fb.texts)) return true;
  return false;
}

const BossQ = z.object({
  prompt_latex: z.string().min(1),
  tolerance: z.number().positive(),
  check: CheckSpecSchema,
});

// Resolves the answer key server-side. Throws TutorNotFound (no attempt, no
// row, bad index) or TutorStale (exam paper refreshed mid-chat).
export async function resolveForbidden(supa: Supa, playerId: string, ctx: TutorContext): Promise<Forbidden> {
  if (ctx.kind === "none") return { question: null, numbers: [], texts: [] };
  if (ctx.kind === "miss") {
    const att = await supa.from("attacks").select("id").eq("player_id", playerId).eq("boss_id", ctx.boss_id).limit(1);
    if (att.error || !att.data || att.data.length === 0) throw new TutorNotFound();
    const boss = await supa.from("bosses").select("questions").eq("id", ctx.boss_id).maybeSingle();
    if (boss.error || !boss.data) throw new TutorNotFound();
    const q = BossQ.safeParse((boss.data as { questions: unknown[] }).questions?.[ctx.question_index]);
    if (!q.success) throw new TutorNotFound();
    let value: number;
    try {
      value = recompute(q.data.check);
    } catch {
      throw new TutorNotFound();
    }
    return { question: q.data.prompt_latex, numbers: [{ value, tolerance: q.data.tolerance }], texts: [] };
  }
  const row = await supa
    .from("boss_question_cache")
    .select("questions, fetched_at")
    .eq("set_version", EXAM_SET_VERSION)
    .eq("skill_tag", ctx.section)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (row.error) throw new TutorNotFound();
  if (!row.data) throw new TutorNotFound();
  const data = row.data as { questions: unknown; fetched_at: string };
  if (data.fetched_at !== ctx.as_of) throw new TutorStale();
  const q = ExamQuestion.safeParse((data.questions as unknown[])?.[ctx.index]);
  if (!q.success) throw new TutorNotFound();
  const fb: Forbidden = { question: q.data.prompt_latex, numbers: [], texts: [q.data.options[q.data.answer_index]] };
  if (q.data.check && q.data.tolerance) {
    try {
      fb.numbers.push({ value: recompute(q.data.check), tolerance: q.data.tolerance });
    } catch {
      // Draft question without machine check: text guard still applies.
    }
  }
  return fb;
}

const FALLBACK =
  "Let's take it one step at a time — tell me which part of the question confuses you most, and we'll work from there.";

function systemFor(fb: Forbidden): string {
  const base =
    "You are a friendly Socratic tutor for Vietnamese students. Match the student's language (English or Vietnamese). Explain ideas, work through similar EXAMPLES, and ask guiding questions. Use $...$ for math. Keep replies under 150 words.";
  if (!fb.question) return `${base} Reply JSON only: {"reply": "..."}`;
  return `${base}
The student is stuck on THIS live question: ${fb.question}
HARD RULES: NEVER state the answer, the correct option text, or the option letter. NEVER solve this exact question. Teach the method with a DIFFERENT small example, then ask the student to apply it.
Reply JSON only: {"reply": "..."}`;
}

const STRICT_SUFFIX =
  "STRICT RETRY: describe ONLY the method in words. Do not write the answer, any option text, or any number from the question's solution.";

export async function chatTutor(history: z.infer<typeof TutorHistory>, fb: Forbidden): Promise<{ reply: string; question: string | null }> {
  const base = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  for (const [i, system] of [systemFor(fb), `${systemFor(fb)}\n${STRICT_SUFFIX}`].entries()) {
    try {
      const out = await chatJson(
        TutorReply,
        [{ role: "system", content: system }, ...base],
        { temperature: i === 0 ? 0.7 : 0 },
      );
      if (!replyLeaks(out.reply, fb)) return { reply: out.reply, question: fb.question };
    } catch {
      // Schema/transport failure: the strict retry or fallback covers it.
    }
  }
  return { reply: FALLBACK, question: fb.question };
}
