"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import DiagnosisReveal from "@/components/DiagnosisReveal";
import ScreenCapture from "@/components/ScreenCapture";
import LifeBatch, { type LifeJob } from "@/components/LifeBatch";
import { recordRecentScan, makeThumb } from "@/lib/game/recent-scans";

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
const BATCH_MAX = 3;

const SAMPLES = [
  { label: "Sample: area integral", path: "/samples/area-integral.png", file: "area-integral.png" },
  { label: "Sample: implicit diff", path: "/samples/implicit-diff.png", file: "implicit-diff.png" },
];

export default function ScanPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [thumb, setThumb] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [summoning, setSummoning] = useState(false);
  const [mode, setMode] = useState<"exam" | "life">("exam");
  const [jobs, setJobs] = useState<LifeJob[]>([]);
  const [forging, setForging] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [screenOpen, setScreenOpen] = useState(false);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setThumb("");
    void makeThumb(f).then((t) => setThumb(t));
    setResult(null);
    setError("");
  }

  function switchMode(m: "exam" | "life") {
    setMode(m);
    setResult(null);
    setError("");
  }

  function resetAll() {
    for (const j of jobs) URL.revokeObjectURL(j.url);
    setFile(null);
    setPreview("");
    setThumb("");
    setJobs([]);
    setResult(null);
    setError("");
  }

  // Deep links from home hero (A's S1): ?mode=life preselects Real-life mode,
  // ?capture=screen auto-opens the screen picker. Microtask keeps the
  // no-sync-setState lint rule happy; effect-only so prerender stays safe.
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      try {
        const q = new URLSearchParams(window.location.search);
        if (q.get("mode") === "life") setMode("life");
        if (q.get("capture") === "screen") setScreenOpen(true);
      } catch {
        // Non-browser or malformed query: defaults stand.
      }
    });
    return () => {
      alive = false;
    };
  }, []);

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

  function addJobs(files: File[]) {
    const room = BATCH_MAX - jobs.length;
    if (room <= 0) {
      setError("Batch is full — 3 photos max. Remove one to add more.");
      return;
    }
    const take = files.filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (take.length === 0) {
      setError("Only image files can join the batch.");
      return;
    }
    if (take.length < files.length) setError("Only images, 3 max — extras skipped.");
    else setError("");
    const fresh: LifeJob[] = take.map((f) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      url: URL.createObjectURL(f),
      thumb: "",
      status: "queued",
    }));
    setJobs((prev) => [...prev, ...fresh].slice(0, BATCH_MAX));
    for (const job of fresh) {
      void makeThumb(job.file).then((t) => {
        setJobs((prev) => prev.map((j) => (j.key === job.key ? { ...j, thumb: t } : j)));
      });
    }
  }

  function removeJob(key: string) {
    setJobs((prev) => {
      const gone = prev.find((j) => j.key === key);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((j) => j.key !== key);
    });
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

  async function forgeOne(job: LifeJob): Promise<void> {
    setJobs((prev) => prev.map((j) => (j.key === job.key ? { ...j, status: "forging", error: undefined } : j)));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LIFE_TIMEOUT_MS);
    try {
      const form = new FormData();
      form.append("image", job.file);
      const res = await fetch("/api/photo-problem", { method: "POST", body: form, signal: ctrl.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Photo scan failed.");
      const r = data as { boss_id: string; skill_tag: string; problem_latex: string };
      recordRecentScan({ ts: Date.now(), mode: "life", skill: r.skill_tag, bossId: r.boss_id, thumb: job.thumb });
      setJobs((prev) => prev.map((j) => (j.key === job.key ? { ...j, status: "done", result: r } : j)));
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "AbortError"
          ? "Timed out — tap Forge to retry this one."
          : e instanceof Error
            ? e.message
            : "Forge failed.";
      setJobs((prev) => prev.map((j) => (j.key === job.key ? { ...j, status: "failed", error: msg } : j)));
    } finally {
      clearTimeout(timer);
    }
  }

  async function forgeAll() {
    if (forging) return;
    const todo = jobs.filter((j) => j.status === "queued" || j.status === "failed");
    if (todo.length === 0) return;
    setForging(true);
    setError("");
    for (const job of todo) {
      await forgeOne(job);
    }
    setForging(false);
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
      const bossId = (data as { boss_id: string }).boss_id;
      recordRecentScan({ ts: Date.now(), mode: "exam", skill: result.weak_skill, bossId, thumb });
      router.push("/boss/" + bossId + "?root=" + result.root_cause);
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
        sub="Exam sheets, screenshots, or real life. We find the weak skill and its root cause."
      />
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

      {screenOpen ? (
        <ScreenCapture
          multi={mode === "life"}
          onCapture={(f) => {
            if (mode === "life") addJobs([f]);
            else {
              pick(f);
              setScreenOpen(false);
            }
          }}
          onClose={() => setScreenOpen(false)}
        />
      ) : mode === "life" ? (
        <LifeBatch
          jobs={jobs}
          forging={forging}
          onAdd={addJobs}
          onRemove={removeJob}
          onForge={() => void forgeAll()}
          onScreen={() => setScreenOpen(true)}
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
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
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

      {mode === "exam" ? (
        <button
          onClick={analyze}
          disabled={!file || loading}
          className={`arena-enter arena-d2 arena-btn-primary font-display rounded-full px-5 py-3.5 text-lg font-bold text-white disabled:opacity-40 disabled:shadow-none ${loading ? "animate-pulse" : ""}`}
        >
          {loading ? STAGES[stage % STAGES.length] : "Analyze"}
        </button>
      ) : null}

      {(file || result || jobs.length > 0) && !loading && !forging ? (
        <button
          type="button"
          onClick={resetAll}
          className="-mt-2 text-center text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          Start over
        </button>
      ) : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {result ? (
        <DiagnosisReveal result={result} preview={preview} summoning={summoning} onSummon={summon} />
      ) : null}
    </main>
  );
}
