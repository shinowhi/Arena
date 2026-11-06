// Boss trash-talk: one short boast line per fight state. Pure flavor —
// never hints at answers. Temperature high for variety; best-effort cached
// by the route (no storage, no migration).
import { z } from "zod";
import { chatJson } from "../llm/meta";

export const TauntOutput = z.object({ taunt: z.string().min(1).max(140) });
export type TauntOutput = z.infer<typeof TauntOutput>;

export type TauntMood = "greet" | "wounded" | "slain";

export async function generateTaunt(input: {
  skill_name: string;
  rarity: string;
  hpPct: number;
  mood: TauntMood;
}): Promise<string> {
  const out = await chatJson(
    TauntOutput,
    [
      {
        role: "system",
        content:
          'You are a dungeon boss boasting at the student hunter. Reply with a single JSON object only: {"taunt": "..."}. One line, max 140 characters, playful menace, plain words, no profanity, no emoji, never reveal or hint at any answer.',
      },
      {
        role: "user",
        content: `Boss of ${input.skill_name} (${input.rarity}), HP ${input.hpPct}%, mood ${input.mood}. Taunt the hunter.`,
      },
    ],
    { temperature: 0.9 },
  );
  return out.taunt;
}
