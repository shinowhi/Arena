"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import katex from "katex";
import { skillName } from "@/lib/graph/skills";
import PageHeader from "@/components/ui/PageHeader";
import DiagnosisReveal from "@/components/DiagnosisReveal";
import ScreenCapture from "@/components/ScreenCapture";

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
const LIFE_TIMEOUT_MS = 180000;

const LIFE_STAGES = [
  "Spotting math in your photo…",
  "Writing the problem…",
  "Verifying the answer…",
  "Forging your boss…",
];

type LifeResult = { boss_id: string; skill_tag: string; problem_latex: string };

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
  const [mode, setMode] = useState<"exam" | "life">("exam");
  const [lifeResult, setLifeResult] = useState<LifeResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [screenOpen, setScreenOpen] = useState(false);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setLifeResult(null);
    setError("");
  }

  function switchMode(m: "exam" | "life") {
    setMode(m);
    setResult(null);
    setLifeResult(null);
    setError("");
  }

  function resetAll() {
    setFile(null);
    setPreview("");
    setResult(null);
    setLifeResult(null);
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

  async function analyzeLife() {
    if (!file || loading) return;
    setLoading(true);
    setStage(0);
    setError("");
    setLifeResult(null);
    const ticker = setInterval(() => setStage((s) => (s + 1) % LIFE_STAGES.length), 4000);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LIFE_TIMEOUT_MS);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/photo-problem", { method: "POST", body: form, signal: ctrl.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Photo scan failed.");
      setLifeResult(data as LifeResult);
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "Photo scan timed out. Try again with a clearer photo."
          : e instanceof Error
            ? e.message
            : "Photo scan failed.",
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
      <PageHeader
        kicker="Step 01 — Scan"
        title={<>Show us <span className="arena-title">your work</span></>}
        sub="One photo. We find the weak skill and its root cause."
      />
      {screenOpen ? (
        <ScreenCapture
          onCapture={(f) => {
            pick(f);
            setScreenOpen(false);
          }}
          onClose={() => setScreenOpen(false)}
        />
      ) : (
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
        className={`arena-enter arena-d1 arena-card flex flex-col items-center gap-4 rounded-2xl border-dashed p-8 text-center transition-all ${dragging ? "scale-[1.01] border-red-500 shadow-[0_0_32px_rgba(239,68,68,0.35)]" : ""}`}
      >
        {preview ? (
          <div className="relative overflow-hidden rounded-xl ring-1 ring-zinc-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="upload preview" className="max-h-64 rounded-xl" />
            {loading ? <div className="arena-scanline" /> : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="9" cy="9" r="1.6" />
              <path d="M21 15.5c-1.5-1.5-3.5-1.5-5 0L7 20.5" />
              <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
            </svg>
            <p className="text-sm text-zinc-500">Drag a photo here, or choose one below.</p>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <label className="arena-btn-ghost cursor-pointer rounded-full px-5 py-2 text-sm font-medium text-zinc-200">
            {preview ? "Choose another" : "Choose photo"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <button
            type="button"
            onClick={() => setScreenOpen(true)}
            className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
          >
            Capture screen
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-zinc-600">No homework handy?</span>
          {SAMPLES.map((s) => (
            <button
              key={s.path}
              type="button"
              onClick={() => loadSample(s.path, s.file)}
              className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      )}
      <div className="mx-auto flex gap-1 rounded-full border border-zinc-800 bg-zinc-900/60 p-1" role="tablist" aria-label="Scan mode">
        {(["exam", "life"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
              mode === m ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {m === "exam" ? "Exam work" : "Real life"}
          </button>
        ))}
      </div>
      <button
        onClick={mode === "exam" ? analyze : analyzeLife}
        disabled={!file || loading}
        className={`arena-enter arena-d2 arena-btn-primary font-display rounded-full px-5 py-3.5 text-lg font-bold text-white disabled:opacity-40 disabled:shadow-none ${loading ? "animate-pulse" : ""}`}
      >
        {loading ? (mode === "exam" ? STAGES[stage % STAGES.length] : LIFE_STAGES[stage]) : mode === "exam" ? "Analyze" : "Find math in this"}
      </button>
      {mode === "exam" ? null : (
        <p className="-mt-2 text-center text-xs text-zinc-500">
          Snap anything — pizza, stairs, bills — AI turns it into a boss fight.
        </p>
      )}
      {(file || result || lifeResult) && !loading ? (
        <button
          type="button"
          onClick={resetAll}
          className="-mt-2 text-center text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          Start over with a new photo
        </button>
      ) : null}
      {lifeResult ? (
        <section className="arena-enter arena-card flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="font-semibold text-zinc-100">Found it in your photo</h2>
          <ProblemText text={lifeResult.problem_latex} />
          <p>
            <span className="rounded-full border border-zinc-700 bg-zinc-900/70 px-2 py-0.5 text-xs text-zinc-400">
              {skillName(lifeResult.skill_tag)}
            </span>
          </p>
          <div>
            <button
              type="button"
              onClick={() => router.push("/boss/" + lifeResult.boss_id)}
              className="arena-btn-primary mt-1 rounded-full px-5 py-2 text-sm font-semibold text-white"
            >
              Fight this boss
            </button>
          </div>
        </section>
      ) : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {result ? (
        <DiagnosisReveal result={result} preview={preview} summoning={summoning} onSummon={summon} />
      ) : null}
    </main>
  );
}