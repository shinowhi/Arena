"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import katex from "katex";
import { SKILL_IDS, skillName } from "@/lib/graph/skills";

interface Post {
  id: string;
  problem_latex: string;
  skill_tag: string;
  skill_name: string;
  bounty: number;
  poster: string;
  mine: boolean;
  created_at: string;
}

function tex(formula: string): string {
  try {
    return katex.renderToString(formula, { throwOnError: false });
  } catch {
    return "";
  }
}

function Latex({ source }: { source: string }) {
  const html = useMemo(() => tex(source), [source]);
  if (!html) return <span className="text-zinc-200">{source}</span>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function MarketPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [xp, setXp] = useState(0);
  const [bump, setBump] = useState(0);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [msg, setMsg] = useState("");
  // post form
  const [latex, setLatex] = useState("");
  const [answer, setAnswer] = useState("");
  const [skill, setSkill] = useState(SKILL_IDS[0] ?? "");
  const [bounty, setBounty] = useState(10);
  const [posting, setPosting] = useState(false);
  const [assisting, setAssisting] = useState(false);
  // claim inputs per post
  const [tries, setTries] = useState<Record<string, string>>({});
  const [claiming, setClaiming] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/market");
        const data = (await res.json().catch(() => null)) as {
          xp?: number; posts?: Post[]; needsMigration?: boolean;
        } | null;
        if (!alive || !data) return;
        if (data.needsMigration) {
          setNeedsMigration(true);
          return;
        }
        setXp(typeof data.xp === "number" ? data.xp : 0);
        setPosts(Array.isArray(data.posts) ? data.posts : []);
      } catch {
        if (alive) setMsg("Could not load the market. Reload to retry.");
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [bump]);

  async function assist(file: File | undefined) {
    if (!file || assisting) return;
    setAssisting(true);
    setMsg("");
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/market/assist", { method: "POST", body: form });
      const data = (await res.json()) as {
        problem_latex?: string; skill_tag?: string; error?: string; more?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "Photo assist failed.");
      if (data.problem_latex) setLatex(data.problem_latex);
      if (data.skill_tag) setSkill(data.skill_tag);
      setMsg(data.more && data.more > 0 ? `Photo read — ${data.more} more problem(s) on it were skipped.` : "Photo read — check the preview, then set the answer and bounty.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Photo assist failed.");
    } finally {
      setAssisting(false);
    }
  }

  async function postBounty() {
    if (posting) return;
    const num = Number(answer);
    if (!latex.trim()) {
      setMsg("Write the problem first (or use photo assist).");
      return;
    }
    if (!Number.isFinite(num)) {
      setMsg("The answer must be a number.");
      return;
    }
    setPosting(true);
    setMsg("");
    try {
      const res = await fetch("/api/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem_latex: latex.trim(),
          answer_numeric: num,
          skill_tag: skill,
          bounty,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string; needsMigration?: boolean };
      if (data.needsMigration) {
        setNeedsMigration(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not post the bounty.");
      setLatex("");
      setAnswer("");
      setMsg(`Bounty posted — ${bounty} XP escrowed. First correct hunter wins it.`);
      setBump((b) => b + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not post the bounty.");
    } finally {
      setPosting(false);
    }
  }

  async function claim(post: Post) {
    const raw = (tries[post.id] ?? "").trim();
    const num = Number(raw);
    if (!raw || !Number.isFinite(num) || claiming) return;
    setClaiming(post.id);
    setMsg("");
    try {
      const res = await fetch("/api/market/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: post.id, answer: num }),
      });
      const data = (await res.json()) as { ok?: boolean; bounty?: number; error?: string; needsMigration?: boolean };
      if (data.needsMigration) {
        setNeedsMigration(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Claim failed.");
      setMsg(`+${data.bounty ?? post.bounty} XP! You solved ${post.poster}'s bounty. 🎉`);
      setTries((t) => ({ ...t, [post.id]: "" }));
      setBump((b) => b + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Claim failed.");
    } finally {
      setClaiming("");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">← Back</Link>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-100">Night market</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Post a problem with an XP bounty, or solve other hunters&apos; bounties. First correct
            answer wins — your escrow is locked until someone earns it.
          </p>
        </div>
        <p className="shrink-0 rounded-lg border border-amber-700 bg-amber-950/40 px-3 py-1 text-sm font-bold text-amber-300">
          {xp} XP
        </p>
      </div>

      {needsMigration && (
        <div className="mt-4 rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          The market needs a database update (migration 0005) — ask the site owner to run it in
          Supabase.
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Post a bounty</p>
        <label className="mt-3 block text-xs text-zinc-400">
          Photo assist (optional)
          <input
            type="file"
            accept="image/*"
            disabled={assisting || needsMigration}
            onChange={(e) => void assist(e.target.files?.[0])}
            className="mt-1 block w-full text-sm text-zinc-300"
          />
        </label>
        <textarea
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          rows={2}
          placeholder="Problem in LaTeX, e.g. \int_0^1 x^2 \, dx"
          className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
        />
        {latex.trim() && (
          <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-lg text-zinc-100">
            <Latex source={latex.trim()} />
          </div>
        )}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-xs text-zinc-400">
            Correct answer (number, stays secret)
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              inputMode="decimal"
              placeholder="0.333"
              className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Skill
            <select
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              {SKILL_IDS.map((id) => (
                <option key={id} value={id}>{skillName(id)}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-zinc-400">
            Bounty: <strong className="text-amber-300">{bounty} XP</strong>
            <input
              type="range"
              min={5}
              max={50}
              value={bounty}
              onChange={(e) => setBounty(Number(e.target.value))}
              className="mt-2 block w-full"
            />
          </label>
        </div>
        <button
          onClick={postBounty}
          disabled={posting || needsMigration}
          className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
        >
          {posting ? "Posting…" : assisting ? "Reading photo…" : `Post bounty (${bounty} XP)`}
        </button>
      </section>

      {msg && <p className="mt-3 text-sm text-amber-300">{msg}</p>}

      <section className="mt-6 space-y-3">
        <p className="text-sm font-semibold text-zinc-300">
          Open bounties {posts.length > 0 && <span className="text-zinc-500">({posts.length})</span>}
        </p>
        {posts.length === 0 && !needsMigration && (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500">
            No open bounties tonight — post the first one above.
          </p>
        )}
        {posts.map((p) => (
          <article key={p.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300">
                {p.bounty} XP
              </span>
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-300">{p.skill_name}</span>
              <span className="text-zinc-500">{p.poster}{p.mine ? " (you)" : ""}</span>
            </div>
            <div className="mt-2 overflow-x-auto text-lg text-zinc-100">
              <Latex source={p.problem_latex} />
            </div>
            {p.mine ? (
              <p className="mt-2 text-xs text-zinc-500">Waiting for a hunter… your {p.bounty} XP is escrowed.</p>
            ) : (
              <div className="mt-2 flex gap-2">
                <input
                  value={tries[p.id] ?? ""}
                  onChange={(e) => setTries((t) => ({ ...t, [p.id]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="Your answer"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
                <button
                  onClick={() => void claim(p)}
                  disabled={claiming === p.id}
                  className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
                >
                  {claiming === p.id ? "…" : `Win ${p.bounty} XP`}
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
