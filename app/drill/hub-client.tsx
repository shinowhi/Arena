"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SKILL_IDS, skillName } from "@/lib/graph/skills";
import { prepareUploadImage, readApiError, readApiJson } from "@/lib/scan/image-prep";

type MineSet = { id: string; title: string; source: string; created: string; score?: number };

type Source = "weak" | "misses" | "topic" | "upload";

const COUNTS = [5, 10, 15, 20];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => (typeof r.result === "string" ? resolve(r.result) : reject(new Error("read failed")));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

export default function HubClient() {
  const router = useRouter();
  const [vip, setVip] = useState<boolean | null>(null);
  const [sets, setSets] = useState<MineSet[] | null>(null);
  const [setsError, setSetsError] = useState("");
  const [busy, setBusy] = useState<Source | null>(null);
  const [error, setError] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/vip/status")
      .then(async (r) => readApiJson<{ vip: boolean }>(r, "VIP status failed."))
      .then((d) => {
        if (alive) setVip(d.vip);
      })
      .catch(() => {
        if (alive) setVip(false);
      });
    fetch("/api/drill/mine")
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Could not load your drill sets."));
        return readApiJson<{ sets: MineSet[] }>(r, "Could not load your drill sets.");
      })
      .then((d) => {
        if (alive) setSets(d.sets);
      })
      .catch((e) => {
        if (alive) setSetsError(e instanceof Error ? e.message : "Could not load your drill sets.");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function create(source: Source, extra?: { topic?: string; image?: string }) {
    if (busy) return;
    setBusy(source);
    setError("");
    try {
      const r = await fetch("/api/drill/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, count, ...extra }),
      });
      if (r.status === 402) {
        router.push("/vip");
        return;
      }
      if (!r.ok) throw new Error(await readApiError(r, "Drill forge failed."));
      const d = await readApiJson<{ id: string }>(r, "Drill forge failed.");
      router.push(`/drill/${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Drill forge failed.");
      setBusy(null);
    }
  }

  async function upload(file: File) {
    if (busy) return;
    setBusy("upload");
    setError("");
    try {
      const prepared = await prepareUploadImage(file);
      const dataUrl = await readAsDataUrl(prepared.file);
      await create("upload", { image: dataUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo read failed.");
      setBusy(null);
    }
  }

  const busyLabel =
    busy === "weak"
      ? "Forging weak-skills drill…"
      : busy === "misses"
        ? "Gathering your misses…"
        : busy === "topic"
          ? "Forging topic drill…"
          : busy === "upload"
            ? "Reading photo and forging drill…"
            : null;

  return (
    <>
      {error ? (
        <p role="alert" className="arena-enter rounded-2xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {busyLabel ? (
        <p role="status" className="text-center text-sm text-zinc-500">
          {busyLabel}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="drill-count" className="text-sm text-zinc-400">
          Questions per set
        </label>
        <select
          id="drill-count"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          disabled={busy !== null}
          className="arena-input min-h-[48px] rounded-xl px-4 py-2 text-zinc-100 disabled:opacity-50"
        >
          {COUNTS.map((c) => (
            <option key={c} value={c}>
              {c} questions
            </option>
          ))}
        </select>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="arena-card flex flex-col gap-2 rounded-2xl p-5">
          <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Weak skills</p>
          <p className="text-sm text-zinc-400">A mixed set from your most-missed scan skills.</p>
          <button
            type="button"
            onClick={() => void create("weak")}
            disabled={busy !== null}
            className="arena-btn-primary mt-auto min-h-[48px] w-full rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Drill weak skills
          </button>
        </div>
        <div className="arena-card flex flex-col gap-2 rounded-2xl p-5">
          <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">My misses</p>
          <p className="text-sm text-zinc-400">The exact questions you missed, lined up again.</p>
          <button
            type="button"
            onClick={() => void create("misses")}
            disabled={busy !== null}
            className="arena-btn-primary mt-auto min-h-[48px] w-full rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Drill my misses
          </button>
        </div>
        <div className="arena-card flex flex-col gap-2 rounded-2xl p-5">
          <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Topic</p>
          <p className="text-sm text-zinc-400">Ten levels of one skill, rising difficulty.</p>
          <select
            aria-label="Topic skill"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={busy !== null}
            className="arena-input min-h-[48px] w-full rounded-xl px-4 py-2 text-zinc-100 disabled:opacity-50"
          >
            <option value="">Choose a skill…</option>
            {SKILL_IDS.map((id) => (
              <option key={id} value={id}>
                {skillName(id)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (!topic) {
                setError("Choose a skill first.");
                return;
              }
              void create("topic", { topic });
            }}
            disabled={busy !== null}
            className="arena-btn-primary min-h-[48px] w-full rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Drill this topic
          </button>
        </div>
        <div className="arena-card flex flex-col gap-2 rounded-2xl p-5">
          <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-zinc-500 uppercase">
            Upload photo
            {vip === false ? (
              <Link
                href="/vip"
                className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold tracking-widest text-amber-300"
              >
                VIP
              </Link>
            ) : null}
          </p>
          <p className="text-sm text-zinc-400">One photo becomes question 1 of a fresh set.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            aria-label="Photo for upload drill"
            disabled={busy !== null || vip === false}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
            className="hidden"
          />
          {vip === false ? (
            <Link
              href="/vip"
              className="arena-btn-ghost mt-auto inline-block min-h-[48px] w-full rounded-full px-5 py-3 text-center text-sm font-bold text-amber-200"
            >
              Unlock photo drills with VIP
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null || vip === null}
              className="arena-btn-primary mt-auto min-h-[48px] w-full rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {vip === null ? "Checking VIP…" : "Upload and drill"}
            </button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold tracking-widest text-zinc-500 uppercase">My recent sets</h2>
        {sets === null && !setsError ? (
          <div className="arena-shimmer h-16 rounded-2xl" role="status" aria-label="Loading your sets" />
        ) : null}
        {setsError ? (
          <p role="alert" className="text-sm text-zinc-500">
            {setsError}
          </p>
        ) : null}
        {sets && sets.length === 0 ? (
          <p className="text-sm text-zinc-500">No drill sets yet — forge your first one above.</p>
        ) : null}
        {sets?.map((s) => (
          <Link
            key={s.id}
            href={`/drill/${s.id}`}
            className="arena-card flex min-h-[48px] items-center justify-between gap-3 rounded-2xl px-4 py-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-zinc-100">{s.title}</span>
              <span className="block text-xs text-zinc-500">
                {s.source} · {new Date(s.created).toLocaleDateString()}
              </span>
            </span>
            {typeof s.score === "number" ? (
              <span className="arena-num shrink-0 text-sm font-bold text-emerald-300">{s.score}%</span>
            ) : (
              <span className="shrink-0 text-xs text-zinc-500">Unplayed</span>
            )}
          </Link>
        ))}
      </section>
    </>
  );
}
