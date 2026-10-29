"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { skillName } from "@/lib/graph/skills";

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

export default function ScanPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [summoning, setSummoning] = useState(false);
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
      router.push("/boss/" + data.boss_id);
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "Summon timed out. The forge is busy — try again."
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Scan your work</h1>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files[0]);
        }}
        className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 p-6 text-center"
      >
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="upload preview" className="max-h-64 rounded" />
            {loading ? <div className="arena-scanline" /> : null}
          </div>
        ) : (
          <p className="text-zinc-500">Drag and drop a photo here, or pick a file.</p>
        )}
        <label className="cursor-pointer rounded-full bg-zinc-900 px-4 py-2 text-sm text-white">
          Choose photo
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <div className="flex flex-wrap justify-center gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.path}
              type="button"
              onClick={() => loadSample(s.path, s.file)}
              className="rounded-full border px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={analyze}
        disabled={!file || loading}
        className={`rounded-full bg-zinc-900 px-5 py-2.5 font-medium text-white disabled:opacity-40 ${loading ? "animate-pulse" : ""}`}
      >
        {loading ? STAGES[stage] : "Analyze"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {result ? (
        <section className="flex flex-col gap-3">
          <div className="arena-enter rounded-lg border p-4">
            <h2 className="font-semibold">Diagnosis</h2>
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                WEAK
              </span>
              {skillName(result.weak_skill)} <code className="text-xs">({result.weak_skill})</code>
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                ROOT
              </span>
              {skillName(result.root_cause)} <code className="text-xs">({result.root_cause})</code>
            </p>
            <p>Confidence: {Math.round(result.confidence * 100)}%</p>
            <p className="mt-1 text-sm">
              <a className="underline" href={"/graph?weak=" + result.weak_skill + "&root=" + result.root_cause}>
                View on skill graph
              </a>
            </p>
            {result.can_summon ? (
              <button
                onClick={summon}
                disabled={summoning}
                className="mt-2 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                {summoning ? "Forging 5 questions, verifying answers…" : "Summon boss"}
              </button>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">Low confidence — retake a clearer photo.</p>
            )}
          </div>
          {result.items.map((it, i) => (
            <div key={i} className="rounded-lg border p-4">
              <p className="font-medium">Problem {i + 1}</p>
              <pre className="whitespace-pre-wrap text-sm">{it.cau_hoi}</pre>
              <p className="text-sm text-zinc-600">Student: {it.dap_an_sinh_vien || "?"}</p>
              <p className="text-xs text-zinc-500">{it.skill_tag.join(", ")}</p>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
