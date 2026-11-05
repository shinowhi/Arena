// Merges per-photo gap verdicts from a batch exam scan into one verdict.
// weak_skill = most-voted (tie-break: summed confidence, then first seen).
// root_cause = deepest foundation: the candidate that is a prerequisite of
// the most other candidates, repaired to weak_skill when invalid.
import { isValidRootCause, isValidSkill } from "../graph/skills";

export type GapVote = { weak_skill: string; root_cause: string; confidence: number };
export type MergedVerdict = {
  weak_skill: string;
  root_cause: string;
  confidence: number;
  votes: number;
  total: number;
};

export function mergeGaps(votes: GapVote[]): MergedVerdict {
  const valid = votes.filter((v) => isValidSkill(v.weak_skill));
  if (valid.length === 0) throw new Error("No valid gaps to merge.");
  const byWeak = new Map<string, GapVote[]>();
  for (const v of valid) byWeak.set(v.weak_skill, [...(byWeak.get(v.weak_skill) ?? []), v]);
  let weak = "";
  let best = -1;
  for (const [w, vs] of byWeak) {
    const score = vs.length * 10 + vs.reduce((s, v) => s + v.confidence, 0);
    if (score > best) {
      best = score;
      weak = w;
    }
  }
  const mine = byWeak.get(weak) as GapVote[];
  const roots = mine.map((v) => (isValidSkill(v.root_cause) ? v.root_cause : v.weak_skill));
  let root = roots[0];
  let rootScore = -1;
  for (const r of roots) {
    let s = 0;
    for (const o of roots) if (o !== r && isValidRootCause(r, o)) s += 1;
    if (s > rootScore) {
      rootScore = s;
      root = r;
    }
  }
  if (!isValidRootCause(root, weak)) root = weak;
  const confidence = mine.reduce((s, v) => s + v.confidence, 0) / mine.length;
  return { weak_skill: weak, root_cause: root, confidence, votes: mine.length, total: valid.length };
}
