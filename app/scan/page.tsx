"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type ScanResult = {
  items: Array<{ cau_hoi: string; dap_an_sinh_vien: string; skill_tag: string[] }>;
  weak_skill: string;
  root_cause: string;
  confidence: number;
  can_summon: boolean;
};

export default function ScanPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [loading, setLoading] = useState(false);
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

  async function analyze() {
    if (!file || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/scan", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed.");
      setResult(data as ScanResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  async function summon() {
    if (!result || summoning) return;
    setSummoning(true);
    setError("");
    try {
      const res = await fetch("/api/boss/summon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_tag: result.weak_skill }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Summon failed.");
      router.push("/boss/" + data.boss_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Summon failed.");
    } finally {
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
      </div>
      <button
        onClick={analyze}
        disabled={!file || loading}
        className="arena-enter arena-d2 arena-btn-primary rounded-full px-5 py-3 font-semibold text-white disabled:opacity-40 disabled:shadow-none"
      >
        {loading ? "Reading your work…" : "Analyze"}
      </button>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {result ? (
        <section className="flex flex-col gap-3">
          <div className="arena-pop arena-card rounded-2xl p-5">
            <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Diagnosis</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-red-500/60 bg-red-950/60 px-3 py-1 text-sm font-semibold text-red-200">
                Weak: {result.weak_skill}
              </span>
              <span className="text-zinc-500">← rooted in</span>
              <span className="rounded-full border border-amber-500/60 bg-amber-950/60 px-3 py-1 text-sm font-semibold text-amber-200">
                {result.root_cause}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">Confidence: {Math.round(result.confidence * 100)}%</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.can_summon ? (
                <button
                  onClick={summon}
                  disabled={summoning}
                  className="arena-btn-primary rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-40 disabled:shadow-none"
                >
                  {summoning ? "Summoning…" : "Summon boss"}
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
              <pre className="whitespace-pre-wrap text-sm text-zinc-200">{it.cau_hoi}</pre>
              <p className="mt-1 text-sm text-zinc-400">Student: {it.dap_an_sinh_vien || "?"}</p>
              <p className="mt-1 text-xs text-zinc-500">{it.skill_tag.join(", ")}</p>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}