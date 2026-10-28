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
      </div>
      <button
        onClick={analyze}
        disabled={!file || loading}
        className="rounded-full bg-zinc-900 px-5 py-2.5 font-medium text-white disabled:opacity-40"
      >
        {loading ? "Analyzing..." : "Analyze"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {result ? (
        <section className="flex flex-col gap-3">
          <div className="rounded-lg border p-4">
            <h2 className="font-semibold">Diagnosis</h2>
            <p>
              Weak skill: <code>{result.weak_skill}</code>
            </p>
            <p>
              Root cause: <code>{result.root_cause}</code>
            </p>
            <p>Confidence: {Math.round(result.confidence * 100)}%</p>
            {result.can_summon ? (
              <button
                onClick={summon}
                disabled={summoning}
                className="mt-2 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                {summoning ? "Summoning..." : "Summon boss"}
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




