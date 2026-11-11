"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import DiagnosisReveal from "@/components/DiagnosisReveal";
import Onboarding from "@/components/education/Onboarding";
import ScreenCapture from "@/components/ScreenCapture";
import LifeBatch, { type LifeJob } from "@/components/LifeBatch";
import { recordRecentScan, makeThumb } from "@/lib/game/recent-scans";
import { prepareUploadImage, readApiError, readApiJson } from "@/lib/scan/image-prep";

type ScanResult = {
  items: Array<{ cau_hoi: string; dap_an_sinh_vien: string; skill_tag: string[] }>;
  weak_skill: string;
  root_cause: string;
  confidence: number;
  can_summon: boolean;
  sample?: boolean;
  batch?: { votes: number; total: number };
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
  { id: "area-integral", label: "Area integral", path: "/samples/area-integral.png", file: "area-integral.png" },
  { id: "implicit-diff", label: "Implicit diff", path: "/samples/implicit-diff.png", file: "implicit-diff.png" },
];

export default function ScanPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [thumb, setThumb] = useState<string>("");
  const [sampleId, setSampleId] = useState("");
  const [batch, setBatch] = useState<Array<{ file: File; url: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [summoning, setSummoning] = useState(false);
  // Sync ref guard: state/disabled apply only after re-render, so a same-tick
  // double-click would otherwise summon twin bosses.
  const summonRef = useRef(false);
  const sampleRef = useRef(false);
  const [mode, setMode] = useState<"exam" | "life">("exam");
  const [jobs, setJobs] = useState<LifeJob[]>([]);
  const [forging, setForging] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [screenOpen, setScreenOpen] = useState(false);

  function pick(f: File | undefined, sample = "") {
    if (!f) return;
    for (const b of batch) URL.revokeObjectURL(b.url);
    setBatch([]);
    setSampleId(sample);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setThumb("");
    void makeThumb(f).then((t) => setThumb(t));
    setResult(null);
    setError("");
  }

  function addBatch(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/")).slice(0, 3);
    if (imgs.length < 2) {
      pick(files[0]);
      return;
    }
    for (const b of batch) URL.revokeObjectURL(b.url);
    setBatch(imgs.map((f) => ({ file: f, url: URL.createObjectURL(f) })));
    setFile(null);
    setPreview("");
    setThumb("");
    setSampleId("");
    setResult(null);
    setError("");
  }

  function handleFiles(list: FileList | File[] | undefined | null) {
    const fs = Array.from(list ?? []);
    if (fs.length === 0) return;
    if (fs.length > 1) addBatch(fs);
    else pick(fs[0]);
  }

  function switchMode(m: "exam" | "life") {
    setMode(m);
    setResult(null);
    setError("");
    setSampleId("");
    for (const b of batch) URL.revokeObjectURL(b.url);
    setBatch([]);
  }

  function resetAll() {
    for (const j of jobs) URL.revokeObjectURL(j.url);
    for (const b of batch) URL.revokeObjectURL(b.url);
    setBatch([]);
    setFile(null);
    setSampleId("");
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
    // Zero-risk perceived speed: warm the arena JS bundle while the user
    // picks a photo. No data fetch and no LLM cost (an API prefetch here
    // could speculatively spawn a world boss, so we prefetch the route only).
    router.prefetch("/arena");
    queueMicrotask(() => {
      if (!alive) return;
      try {
        const q = new URLSearchParams(window.location.search);
        if (q.get("mode") === "life") setMode("life");
        if (q.get("capture") === "screen") setScreenOpen(true);
        if (q.get("sample") === "1" && q.get("mode") !== "life" && !sampleRef.current) {
          sampleRef.current = true;
          void autoplaySample();
        }
      } catch {
        // Non-browser or malformed query: defaults stand.
      }
    });
    return () => {
      alive = false;
    };
  // autoplaySample intentionally omitted: the sampleRef guard makes it
  // run-once, and listing it would re-trigger deep links every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadSample(id: string, path: string, name: string) {
    setError("");
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error("Sample failed to load.");
      const blob = await res.blob();
      pick(new File([blob], name, { type: blob.type || "image/png" }), id);
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

  async function analyzeBatch() {
    setLoading(true);
    setStage(0);
    setError("");
    setResult(null);
    const uploads: File[] = [];
    try {
      for (const b of batch) uploads.push((await prepareUploadImage(b.file)).file);
    } catch (e) {
      setLoading(false);
      setError(e instanceof Error ? e.message : "Those photos can't be read — try JPG or PNG.");
      return;
    }
    const ticker = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 4000);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ANALYZE_TIMEOUT_MS * 2);
    try {
      const form = new FormData();
      for (const u of uploads) form.append("images", u);
      const res = await fetch("/api/scan/batch", { method: "POST", body: form, signal: ctrl.signal });
      if (!res.ok) throw new Error(await readApiError(res, "Batch analysis failed."));
      const r = await readApiJson<{
        photos: Array<ScanResult>;
        merged: { weak_skill: string; root_cause: string; confidence: number; votes: number; total: number };
        can_summon: boolean;
      }>(res, "Batch analysis failed.");
      setResult({
        items: r.photos.flatMap((p) => p.items),
        weak_skill: r.merged.weak_skill,
        root_cause: r.merged.root_cause,
        confidence: r.merged.confidence,
        can_summon: r.can_summon,
        batch: { votes: r.merged.votes, total: r.merged.total },
      });
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "Batch timed out. Try fewer photos or clearer shots."
          : e instanceof Error
            ? e.message
            : "Batch analysis failed.",
      );
    } finally {
      clearInterval(ticker);
      clearTimeout(timer);
      setLoading(false);
    }
  }

  // ?sample=1 autoplay (B onboarding): load the bundled sample photo and
  // run it exactly like a user upload. Real vision path, no cached id.
  async function autoplaySample() {
    try {
      const res = await fetch("/samples/sample-1.jpg");
      if (!res.ok) throw new Error("Sample failed to load.");
      const blob = await res.blob();
      const f = new File([blob], "sample-1.jpg", { type: blob.type || "image/jpeg" });
      pick(f);
      await analyze(f);
    } catch {
      setError("Sample failed to load. Pick a photo instead.");
    }
  }

  async function analyze(target?: File) {
    if (loading) return;
    if (batch.length >= 2) {
      void analyzeBatch();
      return;
    }
    const src = target ?? file;
    if (!src) return;
    setLoading(true);
    setStage(0);
    setError("");
    setResult(null);
    let upload = src;
    try {
      upload = (await prepareUploadImage(src)).file;
    } catch (e) {
      setLoading(false);
      setError(e instanceof Error ? e.message : "That photo can't be read — try a JPG or PNG.");
      return;
    }
    const ticker = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 4000);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ANALYZE_TIMEOUT_MS);
    try {
      const form = new FormData();
      form.append("image", upload);
      if (sampleId) form.append("sample", sampleId);
      const res = await fetch("/api/scan", { method: "POST", body: form, signal: ctrl.signal });
      if (!res.ok) throw new Error(await readApiError(res, "Analysis failed."));
      setResult(await readApiJson<ScanResult>(res, "Analysis failed."));
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
    let upload = job.file;
    try {
      upload = (await prepareUploadImage(job.file)).file;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "That photo can't be read — try a JPG or PNG.";
      setJobs((prev) => prev.map((j) => (j.key === job.key ? { ...j, status: "failed", error: msg } : j)));
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LIFE_TIMEOUT_MS);
    try {
      const form = new FormData();
      form.append("image", upload);
      const res = await fetch("/api/photo-problem", { method: "POST", body: form, signal: ctrl.signal });
      if (!res.ok) throw new Error(await readApiError(res, "Photo scan failed."));
      const r = await readApiJson<{ boss_id: string; skill_tag: string; problem_latex: string }>(res, "Photo scan failed.");
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
    // Jobs are independent (own file, own fetch, isolated state): forge concurrently.
    await Promise.all(todo.map((job) => forgeOne(job)));
    setForging(false);
  }

  async function summon() {
    if (!result || summonRef.current) return;
    summonRef.current = true;
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
      if (!res.ok) throw new Error(await readApiError(res, "Summon failed."));
      const bossId = (await readApiJson<{ boss_id: string }>(res, "Summon failed.")).boss_id;
      recordRecentScan({ ts: Date.now(), mode: "exam", skill: result.weak_skill, bossId, thumb });
      router.push("/boss/" + encodeURIComponent(bossId) + "?root=" + encodeURIComponent(result.root_cause));
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
      summonRef.current = false;
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Step 01 — Scan"
        title={<>Show us <span className="arena-title">your work</span></>}
        sub="Exam sheets, screenshots, or real life. We find the weak skill and its root cause."
      />
      <Onboarding />
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
          handleFiles(e.dataTransfer.files);
        }}
        className={`arena-enter arena-d1 arena-card flex flex-col items-center gap-4 rounded-2xl border-dashed p-8 text-center transition-all ${dragging ? "scale-[1.01] border-red-500 shadow-[0_0_32px_rgba(239,68,68,0.35)]" : ""}`}
      >
        {batch.length >= 2 ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-2">
              {batch.map((b, i) => (
                <span key={i} className="relative block h-24 w-20 overflow-hidden rounded-xl ring-1 ring-zinc-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.url} alt={`batch photo ${i + 1}`} className="h-full w-full object-cover" />
                  {loading ? <span className="arena-scanline" /> : null}
                </span>
              ))}
            </div>
            <p className="text-xs font-bold tracking-widest text-cyan-300 uppercase">Batch of {batch.length} — merged verdict</p>
          </div>
        ) : preview ? (
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
        <div className="flex w-full flex-wrap justify-center gap-2">
          <label className="arena-btn-ghost inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-full px-5 py-2 text-sm font-medium text-zinc-200 sm:w-auto">
            {preview ? "Choose another" : "Choose photo"}
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </label>
          <button
            type="button"
            onClick={() => setScreenOpen(true)}
            className="arena-btn-ghost inline-flex min-h-[48px] w-full items-center justify-center rounded-full px-5 py-2 text-sm font-medium text-zinc-200 sm:w-auto"
          >
            Capture screen
          </button>
        </div>
        <div className="flex w-full flex-col items-center gap-2">
          <span className="text-xs font-bold tracking-widest text-zinc-500 uppercase">No homework handy? Try a sample — instant result</span>
          <div className="flex w-full flex-wrap justify-center gap-3">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => loadSample(s.id, s.path, s.file)}
                className={`group min-h-[48px] w-full overflow-hidden rounded-xl border-2 text-left transition-all sm:w-36 ${sampleId === s.id ? "border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.3)]" : "border-zinc-800 hover:border-zinc-500"}`}
              >
                <span className="block h-20 w-full overflow-hidden bg-black/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.path} alt={s.label} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                </span>
                <span className="block bg-zinc-900/80 px-2.5 py-1.5">
                  <span className="block text-xs font-bold text-zinc-200">{s.label}</span>
                  <span className="block text-[10px] font-bold tracking-widest text-emerald-400 uppercase">Instant · cached</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {mode === "exam" ? (
        <button
          onClick={() => void analyze()}
          disabled={(!file && batch.length < 2) || loading}
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
      {result?.sample ? (
        <p className="rounded-full border border-emerald-500/50 bg-emerald-950/40 px-4 py-1.5 text-center text-xs font-bold tracking-widest text-emerald-300 uppercase">
          Sample · instant cached diagnosis — summon to fight it
        </p>
      ) : null}
      {result?.batch ? (
        <p className="rounded-full border border-cyan-500/50 bg-cyan-950/40 px-4 py-1.5 text-center text-xs font-bold tracking-widest text-cyan-300 uppercase">
          Batch of {result.batch.total} · {result.batch.votes} agree — merged verdict
        </p>
      ) : null}
      {result ? (
        <DiagnosisReveal result={result} preview={preview} summoning={summoning} onSummon={summon} sample={result.sample} />
      ) : null}
    </main>
  );
}
