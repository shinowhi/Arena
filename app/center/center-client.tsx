"use client";

import { useCallback, useEffect, useState } from "react";
import { HeroEntity } from "@/components/ui/Hero";
import { CLASS_TIERS, CLASS_TIER_CODES, type ClassTierCode } from "@/lib/center/center";
import { SKILL_IDS, skillName } from "@/lib/graph/skills";

// Center hub client: loads /api/center/me and renders the teacher view (my
// classes, roster with activity counts, assignment composer, join codes), the
// student view (my classes, assignments with Practice links, enrollment
// status), or the none view (create-class + join-by-code forms, tier pricing).
type Assignment = {
  id: string;
  skill_tag: string;
  skill_name: string;
  title: string;
  due_at: string | null;
  created_at: string;
};

type TeachingClass = {
  id: string;
  name: string;
  center: string | null;
  plan_code: string;
  seats: number;
  enrolled: number;
  status: string;
  join_code: string;
  roster: { student: string; enrolled_at: string; attempts: number; scans: number; slain: number }[];
  assignments: Assignment[];
};

type EnrolledClass = {
  class_id: string;
  name: string;
  center: string | null;
  status: string;
  assignments: Assignment[];
};

type Me = {
  player_id: string | null;
  enrollment_vip: boolean;
  teaching: TeachingClass[];
  enrolled: EnrolledClass[];
};

function fmtVnd(n: number): string {
  return n.toLocaleString("vi-VN");
}

function fmtDue(iso: string | null): string {
  if (!iso) return "Không hạn nộp";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Không hạn nộp";
  return `Hạn ${d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" })}`;
}

// Display-only Vietnamese labels (status codes from the API stay unchanged).
const STATUS_LABEL: Record<string, string> = {
  pending: "chờ duyệt",
  active: "đang mở",
  expired: "hết hạn",
  cancelled: "đã hủy",
};

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-emerald-900/60 text-emerald-300"
      : status === "expired"
        ? "bg-amber-900/60 text-amber-300"
        : "bg-zinc-800 text-zinc-400";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{STATUS_LABEL[status] ?? status}</span>
  );
}

function AssignmentRow({ a, practice }: { a: Assignment; practice: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-100">{a.title}</p>
        <p className="text-xs text-zinc-500">
          {a.skill_name} — {fmtDue(a.due_at)}
        </p>
      </div>
      {practice && (
        <a
          href={`/drill?skill=${encodeURIComponent(a.skill_tag)}`}
          className="arena-btn-ghost inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-200"
        >
          Luyện tập
        </a>
      )}
    </li>
  );
}

function Composer({ classId, onPosted }: { classId: string; onPosted: () => void }) {
  const [skill, setSkill] = useState(SKILL_IDS[0] ?? "");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !title.trim() || !skill) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/center/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: classId,
          skill_tag: skill,
          title: title.trim(),
          due_at: due ? new Date(`${due}T23:59:59`).toISOString() : null,
        }),
      });
      const d = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !d?.id) {
        setMsg({ ok: false, text: d?.error ?? "Không đăng được bài tập." });
      } else {
        setTitle("");
        setDue("");
        setMsg({ ok: true, text: "Đã đăng." });
        onPosted();
      }
    } catch {
      setMsg({ ok: false, text: "Không đăng được bài tập." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
      <h2 className="text-xs font-bold tracking-widest text-zinc-500">Bài tập mới</h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`skill-${classId}`} className="sr-only">
          Kỹ năng
        </label>
        <select
          id={`skill-${classId}`}
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 sm:max-w-52"
        >
          {SKILL_IDS.map((id) => (
            <option key={id} value={id}>
              {skillName(id)}
            </option>
          ))}
        </select>
        <label htmlFor={`title-${classId}`} className="sr-only">
          Tên bài tập
        </label>
        <input
          id={`title-${classId}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tên bài tập"
          maxLength={120}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`due-${classId}`} className="sr-only">
          Hạn nộp (không bắt buộc)
        </label>
        <input
          id={`due-${classId}`}
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 sm:max-w-52"
        />
        <button
          type="submit"
          disabled={busy}
          className="arena-btn-primary inline-flex min-h-[44px] items-center justify-center rounded-lg px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "Đang đăng…" : "Đăng bài"}
        </button>
      </div>
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

function JoinForm({ compact, onJoined }: { compact?: boolean; onJoined: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/center/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = (await res.json().catch(() => null)) as {
        class_name?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        setMsg({ ok: false, text: d?.error ?? "Không vào lớp được." });
      } else {
        setCode("");
        setMsg({ ok: true, text: `Đã vào ${d?.class_name ?? "lớp"} — mở full VIP.` });
        onJoined();
      }
    } catch {
      setMsg({ ok: false, text: "Không vào lớp được." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {!compact && (
        <h2 className="text-sm font-semibold text-zinc-200">Vào lớp bằng mã</h2>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={compact ? "join-code-again" : "join-code"} className="sr-only">
          Mã vào lớp
        </label>
        <input
          id={compact ? "join-code-again" : "join-code"}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CENTER-ABCDEF"
          autoComplete="off"
          maxLength={16}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <button
          type="submit"
          disabled={busy}
          className="arena-btn-primary inline-flex min-h-[44px] items-center justify-center rounded-lg px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "Đang vào…" : "Vào lớp"}
        </button>
      </div>
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [centerName, setCenterName] = useState("");
  const [tier, setTier] = useState<ClassTierCode>("class_30");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/center/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          center_name: centerName.trim() || undefined,
          plan_code: tier,
        }),
      });
      const d = (await res.json().catch(() => null)) as {
        join_code?: string;
        error?: string;
      } | null;
      if (!res.ok || !d?.join_code) {
        setMsg({ ok: false, text: d?.error ?? "Không tạo được lớp." });
      } else {
        setName("");
        setCenterName("");
        setMsg({ ok: true, text: `Đã tạo — gửi mã ${d.join_code} cho học sinh.` });
        onCreated();
      }
    } catch {
      setMsg({ ok: false, text: "Không tạo được lớp." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-zinc-200">Mở lớp mới</h2>
      <label htmlFor="class-name" className="sr-only">
        Tên lớp
      </label>
      <input
        id="class-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên lớp (vd. Toán 12 — Nhóm A)"
        maxLength={80}
        className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="center-name" className="sr-only">
          Tên trung tâm (không bắt buộc)
        </label>
        <input
          id="center-name"
          value={centerName}
          onChange={(e) => setCenterName(e.target.value)}
          placeholder="Tên trung tâm (không bắt buộc)"
          maxLength={80}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <label htmlFor="tier" className="sr-only">
          Gói lớp
        </label>
        <select
          id="tier"
          value={tier}
          onChange={(e) => setTier(e.target.value as ClassTierCode)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        >
          {CLASS_TIER_CODES.map((c) => (
            <option key={c} value={c}>
              {CLASS_TIERS[c].seats} chỗ — {fmtVnd(CLASS_TIERS[c].price_vnd)} đ
              {CLASS_TIERS[c].hero ? " (phổ biến)" : ""}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="arena-btn-primary inline-flex min-h-[44px] items-center justify-center rounded-lg px-5 py-2 text-sm font-bold text-white disabled:opacity-50 sm:self-start"
      >
        {busy ? "Đang tạo…" : "Tạo lớp"}
      </button>
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

function PricingTable() {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <h2 className="text-sm font-semibold text-zinc-200">Các gói lớp</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Giá theo lớp, trung tâm trả — học sinh vào miễn phí và được full VIP.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CLASS_TIER_CODES.map((c) => {
          const t = CLASS_TIERS[c];
          return (
            <div
              key={c}
              className={`rounded-xl border px-4 py-3 ${
                t.hero ? "border-amber-600 bg-amber-950/20" : "border-zinc-800 bg-zinc-950"
              }`}
            >
              <p className="text-sm font-bold text-zinc-100">
                {t.seats} chỗ
                {t.hero && (
                  <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-black">
                    Phổ biến
                  </span>
                )}
              </p>
              <p className="mt-1 text-lg font-extrabold tabular-nums text-zinc-100">
                {fmtVnd(t.price_vnd)} <span className="text-xs font-normal text-zinc-500">đ / 30 ngày</span>
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function CenterClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/center/me");
      const d = (await res.json().catch(() => null)) as Me & { error?: string };
      if (!res.ok) {
        setError(d?.error ?? "Không tải được lớp của bạn.");
        return;
      }
      setError("");
      setMe({ player_id: d.player_id, enrollment_vip: d.enrollment_vip, teaching: d.teaching ?? [], enrolled: d.enrolled ?? [] });
    } catch {
      setError("Không tải được lớp của bạn.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch from the API (external system)
    load();
  }, [load]);

  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
        {error}
      </p>
    );
  }
  if (!me) {
    return <p className="text-sm text-zinc-500">Đang tải lớp của bạn…</p>;
  }

  const hasRoles = me.teaching.length > 0 || me.enrolled.length > 0;
  const firstTeach = me.teaching[0];
  const firstEnroll = me.enrolled[0];

  return (
    <>
      <HeroEntity
        eyebrow={firstTeach ? `Đang dạy${firstTeach.center ? ` — ${firstTeach.center}` : ""}` : firstEnroll ? `Đang học${firstEnroll.center ? ` — ${firstEnroll.center}` : ""}` : "Trung tâm học tập"}
        name={firstTeach ? firstTeach.name : firstEnroll ? firstEnroll.name : "Chưa vào lớp nào"}
        meta={
          firstTeach
            ? `${firstTeach.enrolled}/${firstTeach.seats} chỗ — mã vào ${firstTeach.join_code}`
            : firstEnroll
              ? `${firstEnroll.assignments.length} bài tập đang giao`
              : "Mở lớp mới hoặc nhập mã vào lớp ở dưới"
        }
      />
      {me.enrollment_vip && (
        <p className="rounded-xl border border-emerald-700 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          VIP trung tâm đang bật — bạn được full VIP khi lớp còn mở.
        </p>
      )}

      {me.teaching.map((klass) => (
        <section key={klass.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold tracking-widest text-emerald-400">
                Đang dạy{klass.center ? ` — ${klass.center}` : ""}
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-zinc-100">{klass.name}</h2>
            </div>
            <StatusBadge status={klass.status} />
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            Mã vào: <span className="rounded bg-zinc-950 px-2 py-0.5 font-mono text-amber-300">{klass.join_code}</span>
            <span className="ml-3 tabular-nums">
              {klass.enrolled} / {klass.seats} chỗ
            </span>
          </p>
          <div className="mt-4">
            <p className="text-xs font-bold tracking-widest text-zinc-500">
              Sĩ số ({klass.roster.length})
            </p>
            {klass.roster.length === 0 ? (
              <p className="mt-1 text-sm text-zinc-500">Chưa có học sinh — gửi mã vào lớp nhé.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {klass.roster.map((r) => (
                  <li
                    key={r.student}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs text-zinc-300">{r.student.slice(0, 8)}…</span>
                    <span className="text-xs tabular-nums text-zinc-500">
                      {r.attempts} lượt làm — {r.scans} lượt quét — hạ {r.slain} boss
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Composer classId={klass.id} onPosted={load} />
          {klass.assignments.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold tracking-widest text-zinc-500">
                Bài tập ({klass.assignments.length})
              </p>
              <ul className="mt-2 space-y-1.5">
                {klass.assignments.map((a) => (
                  <AssignmentRow key={a.id} a={a} practice={false} />
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}

      {me.enrolled.map((enr) => (
        <section key={enr.class_id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold tracking-widest text-amber-400">
                Đang học{enr.center ? ` — ${enr.center}` : ""}
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-zinc-100">{enr.name}</h2>
            </div>
            <StatusBadge status={enr.status} />
          </div>
          {enr.status !== "active" ? (
            <p className="mt-2 text-sm text-zinc-500">
              Lớp đang {STATUS_LABEL[enr.status] ?? enr.status} — tạm dừng cho đến khi thầy cô mở lại.
            </p>
          ) : enr.assignments.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Chưa có bài tập — quay lại sau nhé.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {enr.assignments.map((a) => (
                <AssignmentRow key={a.id} a={a} practice={true} />
              ))}
            </ul>
          )}
        </section>
      ))}

      {!hasRoles && (
        <>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <CreateForm onCreated={load} />
          </section>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <JoinForm onJoined={load} />
          </section>
          <PricingTable />
        </>
      )}

      {hasRoles && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="mb-2 text-sm font-semibold text-zinc-200">Vào thêm lớp khác</h2>
          <JoinForm compact onJoined={load} />
        </section>
      )}
    </>
  );
}
