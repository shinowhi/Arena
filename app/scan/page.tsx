"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import katex from "katex";
import { skillName } from "@/lib/graph/skills";
import TimePortalCard from "@/components/TimePortalCard";

type ScanResult = {
  items: Array<{ cau_hoi: string; dap_an_sinh_vien: string; skill_tag: string[] }>;
  weak_skill: string;
  root_cause: string;
  confidence: number;
  can_summon: boolean;
};

const STAGES = [
  "Reading handwriting…",
  "Mapping mistakes to skills…",
  "Tracing the root cause…",
];
const ANALYZE_TIMEOUT_MS = 120000;
const SUMMON_TIMEOUT_MS = 180000;

const SAMPLES = [
  { label: "Sample: area integral", path: "/samples/area-integral.png", file: "area-integral.png" },
  { label: "Sample: implicit diff", path: "/samples/implicit-diff.png", file: "implicit-diff.png" },
];

// Agent 1 returns LaTeX "when it contains math", plain text otherwise.
// Only KaTeX-render strings that actually contain a LaTeX command.
const LATEX_HINT =
  /\\(frac|int|sum|sqrt|lim|sin|cos|tan|log|ln|exp|vec|times|div|pm|infty|alpha|beta|gamma|theta|pi|partial|left|right|begin|text)\b/;

function ProblemText({ text }: { text: string }) {
  let html: string | null = null;
  if (LATEX_HINT.test(text)) {
    try {
      html = katex.renderToString(text, { throwOnError: false });
    } catch {
      html = null;
    }
  }
  if (html) return <div className="text-sm text-zinc-200" dangerouslySetInnerHTML={{ __html: html }} />;
  return <pre className="whitespace-pre-wrap text-sm text-zinc-200">{text}</pre>;
}

export default function ScanPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [summoning, setSummoning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError("");
  }

  async function loadSample(path: string, name: string) {
    setError("");
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error("Sample failed to load.");
      const blob = await res.blob();
      pick(new File([blob], name, { type: blob.type || "image/png" }));
    } catch {
      setError("Sample failed to load. Pick a photo instead.");
    }
  }

  async function analyze() {
    if (!file || loading) return;
    setLoading(true);
    setStage(0);
    setError("");
    setResult(null);
    const ticker = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 4000);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ANALYZE_TIMEOUT_MS);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/scan", { method: "POST", body: form, signal: ctrl.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed.");
      setResult(data as ScanResult);
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "Analysis timed out. Try again with a clearer photo."
          : e instanceof Error
            ? e.message
            : "Analysis failed.",
      );
    } finally {
      clearInterval(ticker);
      clearTimeout(timer);
      setLoading(false);
    }
  }

  async function summon() {
    if (!result || summoning) return;
    setSummoning(true);
    setError("");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SUMMON_TIMEOUT_MS);
    try {
      const res = await fetch("/api/boss/summon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_tag: result.weak_skill }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Summon failed.");
      router.push("/boss/" + data.boss_id + "?root=" + result.root_cause);
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "Summon timed out — check the arena, your boss may already be waiting."
          : e instanceof Error
            ? e.message
            : "Summon failed.",
      );
    } finally {
      clearTimeout(timer);
      setSummoning(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <div className="arena-enter">
        <p className="text-xs font-bold tracking-widest text-red-400 uppercase">Step 01 — Scan</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">
          Show us <span className="arena-title">your work</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-400">One photo. We find the weak skill and its root cause.</p>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={`arena-enter arena-d1 arena-card flex flex-col items-center gap-3 rounded-2xl border-dashed p-6 text-center transition-all ${dragging ? "scale-[1.01] border-red-500 shadow-[0_0_32px_rgba(239,68,68,0.35)]" : ""}`}
      >
        {preview ? (
          <div className="relative overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="upload preview" className="max-h-64 rounded-xl" />
            {loading ? <div className="arena-scanline" /> : null}
          </div>
        ) : (
          <p className="py-6 text-zinc-500">Drag and drop a photo here, or pick a file.</p>
        )}
        <label className="arena-btn-ghost cursor-pointer rounded-full px-5 py-2 text-sm font-medium text-zinc-200">
          Choose photo
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <div className="flex flex-wrap justify-center gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.path}
              type="button"
              onClick={() => loadSample(s.path, s.file)}
              className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={analyze}
        disabled={!file || loading}
        className={`arena-enter arena-d2 arena-btn-primary rounded-full px-5 py-3 font-semibold text-white disabled:opacity-40 disabled:shadow-none ${loading ? "animate-pulse" : ""}`}
      >
        {loading ? STAGES[stage] : "Analyze"}
      </button>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {result ? (
        <section className="flex flex-col gap-3">
          <div className="arena-pop arena-card rounded-2xl p-5">
            <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Diagnosis</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                title={result.weak_skill}
                className="rounded-full border border-red-500/60 bg-red-950/60 px-3 py-1 text-sm font-semibold text-red-200"
              >
                Weak: {skillName(result.weak_skill)}
              </span>
              <span className="text-zinc-500">← rooted in</span>
              <span
                title={result.root_cause}
                className="rounded-full border border-amber-500/60 bg-amber-950/60 px-3 py-1 text-sm font-semibold text-amber-200"
              >
                {skillName(result.root_cause)}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">Confidence: {Math.round(result.confidence * 100)}%</p>
            <div className="mt-3 border-t border-zinc-800 pt-3">
              <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Your patch plan</p>
              <ol className="mt-2 flex flex-col gap-2">
              <li className="flex items-start gap-2 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-300">
                  1
                </span>
                <span className="text-zinc-300">
                  Rebuild the root: {skillName(result.root_cause)} — 10 minutes of basics unlocks
                  everything above it.
                </span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold text-red-300">
                  2
                </span>
                <span className="text-zinc-300">
                  Attack the weakness: {skillName(result.weak_skill)} — summon the boss below and slay
                  5 questions to close it.
                </span>
              </li>
              </ol>
            </div>
            <TimePortalCard weak={result.weak_skill} root={result.root_cause} />
            <div className="mt-3 flex flex-wrap gap-2">
              {result.can_summon ? (
                <button
                  onClick={summon}
                  disabled={summoning}
                  className="arena-btn-primary rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-40 disabled:shadow-none"
                >
                  {summoning ? "Forging 5 questions, verifying answers…" : "Summon boss"}
                </button>
              ) : (
                <p className="text-sm text-zinc-500">Low confidence — retake a clearer photo.</p>
              )}
              <a
                href={"/graph?weak=" + result.weak_skill + "&root=" + result.root_cause}
                className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
              >
                View on skill graph
              </a>
            </div>
          </div>
          {result.items.map((it, i) => (
            <div key={i} className="arena-card rounded-2xl p-4">
              <p className="text-sm font-bold text-zinc-300">Problem {i + 1}</p>
              <ProblemText text={it.cau_hoi} />
              <p className="mt-1 text-sm text-zinc-400">Student: {it.dap_an_sinh_vien || "?"}</p>
              <p className="mt-1 flex flex-wrap gap-1">
                {it.skill_tag.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-zinc-700 bg-zinc-900/70 px-2 py-0.5 text-xs text-zinc-400"
                  >
                    {skillName(t)}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}