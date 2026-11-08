import graph from "../graph/skill-graph.json" with { type: "json" };

export type SkillNode = { id: string; name: string; description: string; prereqs: string[]; grade: number; gradeLabel: string; subject?: Subject };

export type Subject = "calculus" | "mechanics" | "k12";

export function skillSubject(id: string): Subject {
  const s = byId.get(id)?.subject;
  return s === "mechanics" || s === "k12" ? s : "calculus";
}

const skills = (graph as { skills: SkillNode[] }).skills;
const byId = new Map(skills.map((s) => [s.id, s]));

export const SKILL_IDS: string[] = skills.map((s) => s.id);

export function isValidSkill(id: string): boolean {
  return byId.has(id);
}

export function skillGrade(id: string): number {
  return byId.get(id)?.grade ?? 13;
}

export function skillGradeLabel(id: string): string {
  return byId.get(id)?.gradeLabel ?? "University";
}

export function skillName(id: string): string {
  return byId.get(id)?.name ?? id;
}

export function skillDescription(id: string): string {
  return byId.get(id)?.description ?? "";
}

// Shortest prerequisite chain from weak down to root (inclusive), or null.
export function prereqChain(weak: string, root: string): string[] | null {
  if (weak === root) return [weak];
  const prev = new Map<string, string>();
  const queue = [weak];
  const seen = new Set([weak]);
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const p of byId.get(cur)?.prereqs ?? []) {
      if (seen.has(p)) continue;
      seen.add(p);
      prev.set(p, cur);
      if (p === root) {
        const chain = [root];
        let at = root;
        while (at !== weak) {
          at = prev.get(at) as string;
          chain.unshift(at);
        }
        return chain;
      }
      queue.push(p);
    }
  }
  return null;
}

// True when `root` equals `weak` or is a transitive prerequisite of it.
export function isValidRootCause(root: string, weak: string): boolean {
  if (root === weak) return true;
  const seen = new Set<string>();
  const stack = [...(byId.get(weak)?.prereqs ?? [])];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === root) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(byId.get(cur)?.prereqs ?? []));
  }
  return false;
}

export function skillListForPrompt(): string {
  return skills.map((s) => `- ${s.id}: ${s.name}`).join("\n");
}
