"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LEVEL_LABEL,
  SEGMENT_LABEL,
  SUBJECT_LABEL,
  TARGET_EXAM_LABEL,
  type LearnerProfile,
  type LevelSelf,
  type Segment,
  type SubjectId,
  type TargetExam,
} from "@/lib/profile/types";
import { loadProfile, saveProfile } from "@/lib/profile/storage";
import { track } from "@/lib/tracking/events";

const STEPS = ["Bạn là ai?", "Mục tiêu", "Môn học"];

const SEGMENTS: Segment[] = ["grade12", "uni1"];
const EXAMS_GRADE12: TargetExam[] = ["vact", "hsa", "thpt", "none"];
const SUBJECTS: SubjectId[] = ["toan", "ly", "hoa", "anh"];
const LEVELS: LevelSelf[] = ["lost", "shaky", "solid"];

function OptionButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        selected
          ? "rounded-2xl border border-cyan-400/70 bg-cyan-400/10 px-5 py-4 text-left font-semibold text-white shadow-[0_0_24px_rgba(34,211,238,0.25)]"
          : "rounded-2xl border border-zinc-800 bg-zinc-900/70 px-5 py-4 text-left font-semibold text-zinc-200 transition-colors hover:border-zinc-600"
      }
    >
      {children}
    </button>
  );
}

export default function StartPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [segment, setSegment] = useState<Segment | null>(null);
  const [targetExam, setTargetExam] = useState<TargetExam | null>(null);
  const [subjects, setSubjects] = useState<SubjectId[]>(["toan"]);
  const [levelSelf, setLevelSelf] = useState<LevelSelf | null>(null);

  // Prefill when revisiting /start with an existing profile.
  // Runs in a microtask (repo lint: no sync setState in effect).
  useEffect(() => {
    queueMicrotask(() => {
      const existing = loadProfile();
      if (!existing) return;
      setSegment(existing.segment);
      setTargetExam(existing.targetExam);
      setSubjects(existing.subjects);
      setLevelSelf(existing.levelSelf);
    });
  }, []);

  // Uni students have no entrance exam to pick; knowledge goal only.
  const exams = segment === "uni1" ? (["none"] as TargetExam[]) : EXAMS_GRADE12;

  function toggleSubject(s: SubjectId) {
    setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function canNext(): boolean {
    if (step === 0) return segment !== null;
    if (step === 1) return targetExam !== null;
    return subjects.length > 0 && levelSelf !== null;
  }

  function finish() {
    if (!segment || !targetExam || subjects.length === 0 || !levelSelf) return;
    const now = new Date().toISOString();
    const existing = loadProfile();
    const profile: LearnerProfile = {
      version: 1,
      segment,
      targetExam,
      subjects,
      levelSelf,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    saveProfile(profile);
    track("profile_completed", { segment, targetExam, subjects: subjects.join(","), levelSelf });
    router.push("/scan");
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <p className="text-xs font-medium tracking-widest text-zinc-500 uppercase">
          Bước {step + 1}/{STEPS.length} — {STEPS[step]}
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
          Cho Arena biết bạn là ai
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          30 giây thôi — để vá đúng chỗ bạn yếu, không vá lung tung.
        </p>
      </div>

      {step === 0 && (
        <div className="grid gap-3" role="group" aria-label="Bạn là ai?">
          {SEGMENTS.map((s) => (
            <OptionButton key={s} selected={segment === s} onClick={() => setSegment(s)}>
              {SEGMENT_LABEL[s]}
            </OptionButton>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-3" role="group" aria-label="Mục tiêu">
          {exams.map((e) => (
            <OptionButton key={e} selected={targetExam === e} onClick={() => setTargetExam(e)}>
              {TARGET_EXAM_LABEL[e]}
            </OptionButton>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Môn học">
            {SUBJECTS.map((s) => (
              <OptionButton key={s} selected={subjects.includes(s)} onClick={() => toggleSubject(s)}>
                {SUBJECT_LABEL[s]}
              </OptionButton>
            ))}
          </div>
          <div className="grid gap-3" role="group" aria-label="Tự đánh giá trình độ">
            <p className="text-sm font-semibold text-zinc-300">Trình độ hiện tại của bạn?</p>
            {LEVELS.map((l) => (
              <OptionButton key={l} selected={levelSelf === l} onClick={() => setLevelSelf(l)}>
                {LEVEL_LABEL[l]}
              </OptionButton>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto flex items-center gap-3 pt-4">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="arena-btn-ghost rounded-full px-6 py-3 text-sm font-semibold text-zinc-200"
          >
            Quay lại
          </button>
        ) : (
          <Link
            href="/scan"
            onClick={() => track("profile_skipped", { step })}
            className="rounded-full px-6 py-3 text-sm font-semibold text-zinc-400 transition-colors hover:text-white"
          >
            Bỏ qua, vào luôn
          </Link>
        )}
        <div className="ml-auto">
          {step < 2 ? (
            <button
              type="button"
              disabled={!canNext()}
              onClick={() => setStep((s) => s + 1)}
              className="arena-btn-primary rounded-full px-7 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Tiếp tục
            </button>
          ) : (
            <button
              type="button"
              disabled={!canNext()}
              onClick={finish}
              className="arena-btn-primary rounded-full px-7 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Xong, vào quét bài
            </button>
          )}
        </div>
      </div>
    </main>
  );
}