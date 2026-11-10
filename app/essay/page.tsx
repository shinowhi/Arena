"use client";
import { useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import MathText from "@/components/MathText";
import { prepareUploadImage, readApiError, readApiJson, UPLOAD_TOO_LARGE } from "@/lib/scan/image-prep";

type Step = {
  label: string;
  verdict: "correct" | "partial" | "wrong";
  points_earned: number;
  points_max: number;
  feedback: string;
};
type Result = { transcription: string; steps: Step[]; total: number; max: number; flags: string[] };

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => (typeof fr.result === "string" ? resolve(fr.result) : reject(new Error("Could not read that photo.")));
    fr.onerror = () => reject(new Error("Could not read that photo."));
    fr.readAsDataURL(file);
  });
}

export default function EssayPage() {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError("");
    try {
      const prepped = await prepareUploadImage(f);
      const url = await fileToDataUrl(prepped.file);
      if (url.length > 650000) {
        setError(UPLOAD_TOO_LARGE);
        return;
      }
      setPhoto(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that photo.");
    }
  }

  async function grade() {
    if (busy || (!photo && text.trim() === "")) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/essay/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: photo ?? undefined, text: text.trim() || undefined }),
      });
      if (!r.ok) throw new Error(await readApiError(r, "Grading failed."));
      setResult(await readApiJson<Result>(r, "Grading failed."));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grading failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Essay grading"
        title={<>Free <span className="arena-title">response</span></>}
        sub="Snap your written solution or paste it. Rubric steps, strict points, machine-audited numbers."
      />
      {error ? (
        <p role="alert" className="arena-card rounded-2xl p-4 text-center text-sm text-red-300">{error}</p>
      ) : null}
      <div className="arena-card flex flex-col gap-3 rounded-2xl p-6">
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            aria-label="Solution photo"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <button type="button" onClick={() => fileRef.current?.click()} className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-bold text-zinc-200">
            {photo ? "Photo attached ✓" : "Attach photo"}
          </button>
          {photo ? (
            <button type="button" onClick={() => setPhoto(null)} className="rounded-full px-4 py-2 text-sm text-zinc-400">
              Remove
            </button>
          ) : null}
        </div>
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Or paste your solution
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="x^2 - 5x + 6 = 0 → x = 2 or x = 3…"
            aria-label="Pasted solution"
            className="arena-input rounded-xl px-4 py-2 text-zinc-100 placeholder:text-zinc-600"
          />
        </label>
        <button
          type="button"
          onClick={() => void grade()}
          disabled={busy || (!photo && text.trim() === "")}
          className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40"
        >
          {busy ? "Grading…" : "Grade it"}
        </button>
      </div>
      {result ? (
        <div role="status" className="arena-enter arena-card rounded-2xl p-6 text-center">
          <p className="text-xs font-bold tracking-widest text-zinc-400 uppercase">Rubric total</p>
          <p className="mt-1 text-2xl text-zinc-100">
            <span className="arena-num font-bold text-emerald-300">{result.total}</span>
            <span className="text-zinc-400">/{result.max}</span>
            {result.max > 0 ? (
              <span className="text-zinc-400"> · <span className="arena-num font-bold text-emerald-300">{((result.total / result.max) * 10).toFixed(1)}</span>/10</span>
            ) : null}
          </p>
          {result.flags.length > 0 ? (
            <p className="mt-2 text-xs text-amber-300">{result.flags.join(" ")}</p>
          ) : null}
        </div>
      ) : null}
      {result?.steps.map((s, i) => (
        <div key={i} className={`arena-card rounded-2xl p-5 ${s.verdict === "correct" ? "border-emerald-700" : s.verdict === "wrong" ? "border-red-800" : "border-amber-700"}`}>
          <p className="text-xs text-zinc-500">
            Step {i + 1} · {s.label} ·{" "}
            {s.verdict === "correct" ? <span className="font-bold text-emerald-300">Correct</span> : s.verdict === "wrong" ? <span className="font-bold text-red-300">Wrong</span> : <span className="font-bold text-amber-300">Partial</span>}{" "}
            · <span className="arena-num font-bold text-zinc-200">{s.points_earned}/{s.points_max}</span>
          </p>
          <MathText text={s.feedback} className="mt-1 text-[15px] text-zinc-100" />
        </div>
      ))}
    </main>
  );
}
