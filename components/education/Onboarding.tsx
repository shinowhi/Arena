"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { skillName } from "@/lib/graph/skills";
import { prepareUploadImage, readApiError, readApiJson } from "@/lib/scan/image-prep";

// 60-second onboarding (B-owned): fetch the bundled sample photo, scan it
// exactly like a user upload, then summon the first boss from the weak
// skill. Shown on /scan and /boss/[id] until localStorage says done.
const DONE_KEY = "arena_onboard";
const SAMPLE_PATH = "/samples/sample-1.jpg";
const ANALYZE_TIMEOUT_MS = 120000;
const SUMMON_TIMEOUT_MS = 180000;

const STEPS = ["Scan", "Weak skill", "First boss"];

type SampleScan = {
  items: Array<{ cau_hoi: string; dap_an_sinh_vien: string; skill_tag: string[] }>;
  weak_skill: string;
  root_cause: string;
  confidence: number;
  can_summon: boolean;
};

function onboardDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "done";
  } catch {
    return false;
  }
}

function markOnboardDone() {
  try {
    localStorage.setItem(DONE_KEY, "done");
  } catch {
    // Private mode: the banner simply shows again next visit.
  }
}

export default function Onboarding() {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [summoning, setSummoning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SampleScan | null>(null);

  // localStorage is client-only: read it in an effect so the server render
  // matches the first client render (no hydration mismatch). Microtask keeps
  // the no-sync-setState lint rule happy.
  useEffect(() => {
    queueMicrotask(() => {
      setDone(onboardDone());
      setMounted(true);
    });
  }, []);

  if (!mounted || done) return null;

  const active = summoning ? 2 : result ? 1 : 0;

  async function trySample() {
    if (scanning) return;
    setScanning(true);
    setError("");
    setResult(null);
    let upload: File;
    try {
      const res = await fetch(SAMPLE_PATH);
      if (!res.ok) throw new Error("Sample failed to load.");
      const blob = await res.blob();
      upload = (
        await prepareUploadImage(new File([blob], "sample-1.jpg", { type: blob.type || "image/jpeg" }))
      ).file;
    } catch (e) {
      setScanning(false);
      setError(
        e instanceof Error && e.message === "Sample failed to load."
          ? "Sample failed to load. Pick a photo instead."
          : e instanceof Error
            ? e.message
            : "That photo can't be read — try a JPG or PNG.",
      );
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ANALYZE_TIMEOUT_MS);
    try {
      const form = new FormData();
      form.append("image", upload);
      const res = await fetch("/api/scan", { method: "POST", body: form, signal: ctrl.signal });
      if (!res.ok) throw new Error(await readApiError(res, "Analysis failed."));
      setResult(await readApiJson<SampleScan>(res, "Analysis failed."));
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "Analysis timed out. Try again."
          : e instanceof Error
            ? e.message
            : "Analysis failed.",
      );
    } finally {
      clearTimeout(timer);
      setScanning(false);
    }
  }

  async function summonFirst() {
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
      if (!res.ok) throw new Error(await readApiError(res, "Summon failed."));
      const bossId = (await readApiJson<{ boss_id: string }>(res, "Summon failed.")).boss_id;
      markOnboardDone();
      setDone(true);
      router.push("/boss/" + bossId + "?root=" + encodeURIComponent(result.root_cause));
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
    <section aria-label="60-second onboarding" className="arena-enter arena-card w-full rounded-2xl p-5">
      <ol className="flex items-center justify-center gap-1 text-xs font-bold sm:gap-2" aria-label="Onboarding steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1 sm:gap-2">
            {i > 0 ? (
              <span aria-hidden="true" className="text-zinc-600">
                →
              </span>
            ) : null}
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                i < active ? "text-emerald-300" : i === active ? "bg-zinc-100 text-zinc-900" : "text-zinc-500"
              }`}
            >
              <span aria-hidden="true">{i < active ? "✓" : i + 1}</span> {s}
            </span>
          </li>
        ))}
      </ol>
      {!result ? (
        <div className="mt-3 flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-zinc-400">New here? Scan a sample in one tap — we find your weak skill.</p>
          <button
            type="button"
            onClick={() => void trySample()}
            disabled={scanning}
            className="arena-btn-primary min-h-[48px] w-full rounded-full px-7 py-3 text-sm font-semibold text-white disabled:opacity-40 sm:w-auto"
          >
            {scanning ? "Reading the sample…" : "Try a sample scan"}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-2 text-center">
          <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Your weak skill</p>
          <p className="font-display text-xl font-extrabold text-red-100">{skillName(result.weak_skill)}</p>
          {result.can_summon ? (
            <button
              type="button"
              onClick={() => void summonFirst()}
              disabled={summoning}
              className="arena-btn-primary arena-cta-pulse min-h-[48px] w-full rounded-full px-7 py-3 text-sm font-bold text-white disabled:opacity-40 sm:w-auto"
            >
              {summoning ? "Forging your boss…" : "⚔ Summon my first boss"}
            </button>
          ) : (
            <p className="text-sm text-zinc-400">
              Low confidence on the sample —{" "}
              <Link href="/scan" className="font-bold text-cyan-300 underline underline-offset-2">
                scan your own homework
              </Link>{" "}
              instead.
            </p>
          )}
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-center text-sm text-red-400">
          {error}{" "}
          <button
            type="button"
            onClick={() => void (result ? summonFirst() : trySample())}
            className="font-bold underline underline-offset-2"
          >
            Retry
          </button>
        </p>
      ) : null}
    </section>
  );
}
