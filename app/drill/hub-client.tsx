"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SKILL_IDS, isValidSkill, skillName } from "@/lib/graph/skills";
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
    // ?skill= preselect (mastery "Practice" links). Read from window.location
    // instead of useSearchParams so the page stays statically prerenderable
    // with no Suspense boundary.
    try {
      const q = new URLSearchParams(window.location.search).get("skill");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time sync from the URL (external system)
      if (q && isValidSkill(q)) setTopic(q);
    } catch {
      // Non-browser or malformed query: leave the topic chooser untouched.
    }
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
        if (!r.ok) throw new Error(await readApiError(r, "Không tải được các bộ luyện của bạn."));
        return readApiJson<{ sets: MineSet[] }>(r, "Không tải được các bộ luyện của bạn.");
      })
      .then((d) => {
        if (alive) setSets(d.sets);
      })
      .catch((e) => {
        if (alive) setSetsError(e instanceof Error ? e.message : "Không tải được các bộ luyện của bạn.");
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
      if (!r.ok) throw new Error(await readApiError(r, "Tạo bộ luyện thất bại."));
      const d = await readApiJson<{ id: string }>(r, "Tạo bộ luyện thất bại.");
      router.push(`/drill/${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tạo bộ luyện thất bại.");
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
      setError(e instanceof Error ? e.message : "Đọc ảnh thất bại.");
      setBusy(null);
    }
  }

  const busyLabel =
    busy === "weak"
      ? "Đang tạo bộ luyện kỹ năng yếu…"
      : busy === "misses"
        ? "Đang gom các câu bạn làm sai…"
        : busy === "topic"
          ? "Đang tạo bộ luyện theo chủ đề…"
          : busy === "upload"
            ? "Đang đọc ảnh và tạo bộ luyện…"
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
          Số câu mỗi bộ
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
              {c} câu
            </option>
          ))}
        </select>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="arena-card flex flex-col gap-2 rounded-2xl p-5">
          <p className="text-sm font-bold text-zinc-100">Kỹ năng yếu</p>
          <p className="text-sm text-zinc-400">Bộ trộn từ các kỹ năng bạn hay sai khi quét.</p>
          <button
            type="button"
            onClick={() => void create("weak")}
            disabled={busy !== null}
            className="arena-btn-primary mt-auto min-h-[48px] w-full rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Luyện kỹ năng yếu
          </button>
        </div>
        <div className="arena-card flex flex-col gap-2 rounded-2xl p-5">
          <p className="text-sm font-bold text-zinc-100">Câu đã sai</p>
          <p className="text-sm text-zinc-400">Đúng các câu bạn đã làm sai, xếp lại cho bạn.</p>
          <button
            type="button"
            onClick={() => void create("misses")}
            disabled={busy !== null}
            className="arena-btn-primary mt-auto min-h-[48px] w-full rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Luyện câu đã sai
          </button>
        </div>
        <div className="arena-card flex flex-col gap-2 rounded-2xl p-5">
          <p className="text-sm font-bold text-zinc-100">Chủ đề</p>
          <p className="text-sm text-zinc-400">Mười cấp độ của một kỹ năng, khó dần.</p>
          <select
            aria-label="Kỹ năng chủ đề"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={busy !== null}
            className="arena-input min-h-[48px] w-full rounded-xl px-4 py-2 text-zinc-100 disabled:opacity-50"
          >
            <option value="">Chọn kỹ năng…</option>
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
                setError("Chọn kỹ năng trước đã.");
                return;
              }
              void create("topic", { topic });
            }}
            disabled={busy !== null}
            className="arena-btn-primary min-h-[48px] w-full rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Luyện chủ đề này
          </button>
        </div>
        <div className="arena-card flex flex-col gap-2 rounded-2xl p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            Tải ảnh lên
            {vip === false ? (
              <Link
                href="/vip"
                className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold tracking-widest text-amber-300"
              >
                VIP
              </Link>
            ) : null}
          </p>
          <p className="text-sm text-zinc-400">Một tấm ảnh thành câu 1 của bộ mới.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            aria-label="Ảnh để tạo bộ luyện"
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
              Mở luyện bằng ảnh với VIP
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null || vip === null}
              className="arena-btn-primary mt-auto min-h-[48px] w-full rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {vip === null ? "Đang kiểm tra VIP…" : "Tải ảnh và luyện"}
            </button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold tracking-widest text-zinc-500 uppercase">My recent sets</h2>
        {sets === null && !setsError ? (
          <div className="arena-shimmer h-16 rounded-2xl" role="status" aria-label="Đang tải các bộ của bạn" />
        ) : null}
        {setsError ? (
          <p role="alert" className="text-sm text-zinc-500">
            {setsError}
          </p>
        ) : null}
        {sets && sets.length === 0 ? (
          <p className="text-sm text-zinc-500">Chưa có bộ luyện nào — tạo bộ đầu tiên bên trên.</p>
        ) : null}
        {sets?.map((s) => (
          <Link
            key={s.id}
            href={`/drill/${s.id}`}
            className="arena-card flex min-h-[48px] items-center justify-between gap-3 rounded-2xl px-4 py-3 transition-colors hover:border-zinc-600"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-zinc-100">{s.title}</span>
              <span className="block text-xs text-zinc-500">
                {s.source} — {new Date(s.created).toLocaleDateString()}
              </span>
            </span>
            {typeof s.score === "number" ? (
              <span className="arena-num shrink-0 text-sm font-bold text-emerald-300">{s.score}%</span>
            ) : (
              <span className="shrink-0 text-xs text-zinc-500">Chưa làm</span>
            )}
          </Link>
        ))}
      </section>
    </>
  );
}
