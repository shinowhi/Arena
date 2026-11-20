"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { skillName } from "@/lib/graph/skills";
import { prepareUploadImage, readApiError, readApiJson } from "@/lib/scan/image-prep";
import { CheckIcon } from "@/components/ui/icons";
import { SwordsIcon } from "@/components/icons";

// 60-second onboarding (B-owned): fetch the bundled sample photo, scan it
// exactly like a user upload, then summon the first boss from the weak
// skill. Shown on /scan and /boss/[id] until localStorage says done.
const DONE_KEY = "arena_onboard";
const SAMPLE_PATH = "/samples/sample-1.jpg";
const ANALYZE_TIMEOUT_MS = 120000;
const SUMMON_TIMEOUT_MS = 180000;

const STEPS = ["Quét", "Kỹ năng yếu", "Boss đầu tiên"];

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
          ? "Không tải được ảnh mẫu. Hãy chọn một tấm ảnh khác."
          : e instanceof Error
            ? e.message
            : "Không đọc được ảnh này — hãy thử ảnh JPG hoặc PNG.",
      );
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ANALYZE_TIMEOUT_MS);
    try {
      const form = new FormData();
      form.append("image", upload);
      const res = await fetch("/api/scan", { method: "POST", body: form, signal: ctrl.signal });
      if (!res.ok) throw new Error(await readApiError(res, "Chấm bài thất bại."));
      setResult(await readApiJson<SampleScan>(res, "Chấm bài thất bại."));
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "Chấm bài quá lâu. Hãy thử lại."
          : e instanceof Error
            ? e.message
            : "Chấm bài thất bại.",
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
      if (!res.ok) throw new Error(await readApiError(res, "Gọi boss thất bại."));
      const bossId = (await readApiJson<{ boss_id: string }>(res, "Gọi boss thất bại.")).boss_id;
      markOnboardDone();
      setDone(true);
      router.push("/boss/" + bossId + "?root=" + encodeURIComponent(result.root_cause));
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "Gọi boss quá lâu — ghé đấu trường xem, boss có thể đang chờ sẵn."
          : e instanceof Error
            ? e.message
            : "Gọi boss thất bại.",
      );
    } finally {
      clearTimeout(timer);
      setSummoning(false);
    }
  }

  return (
    <section aria-label="Làm quen trong 60 giây" className="arena-enter arena-card w-full rounded-2xl p-5">
      <ol className="flex items-center justify-center gap-1 text-xs font-bold sm:gap-2" aria-label="Các bước làm quen">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1 sm:gap-2">
            {i > 0 ? (
              <span aria-hidden="true" className="h-px w-3 bg-zinc-700 sm:w-4" />
            ) : null}
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                i < active ? "text-emerald-300" : i === active ? "bg-zinc-100 text-zinc-900" : "text-zinc-500"
              }`}
            >
              <span aria-hidden="true" className="inline-flex items-center">
                {i < active ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
              </span>{" "}
              {s}
            </span>
          </li>
        ))}
      </ol>
      {!result ? (
        <div className="mt-3 flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-zinc-400">Mới đến? Chạm một cái để quét thử — tụi mình tìm giúp kỹ năng yếu của bạn.</p>
          <button
            type="button"
            onClick={() => void trySample()}
            disabled={scanning}
            className="arena-btn-primary min-h-[48px] w-full rounded-full px-7 py-3 text-sm font-semibold text-white disabled:opacity-40 sm:w-auto"
          >
            {scanning ? "Đang đọc ảnh mẫu…" : "Thử quét mẫu"}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-2 text-center">
          <p className="text-xs font-semibold text-zinc-500">Kỹ năng yếu của bạn</p>
          <p className="font-display text-xl font-extrabold text-red-100">{skillName(result.weak_skill)}</p>
          {result.can_summon ? (
            <button
              type="button"
              onClick={() => void summonFirst()}
              disabled={summoning}
              className="arena-btn-primary arena-cta-pulse inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-7 py-3 text-sm font-bold text-white disabled:opacity-40 sm:w-auto"
            >
              {summoning ? "Đang rèn boss…" : (<><SwordsIcon className="h-4 w-4" /> Gọi boss đầu tiên</>)}
            </button>
          ) : (
            <p className="text-sm text-zinc-400">
              Ảnh mẫu chưa đủ rõ —{" "}
              <Link href="/scan" className="font-bold text-cyan-300 underline underline-offset-2">
                quét bài của chính bạn
              </Link>{" "}
              nhé.
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
            Thử lại
          </button>
        </p>
      ) : null}
    </section>
  );
}
