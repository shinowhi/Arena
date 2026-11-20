"use client";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { HeroStat } from "@/components/ui/Hero";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type KidStats = {
  scans: number;
  drills: number;
  avg_mastery_top5: number | null;
  skills_slain: number;
  vip: boolean;
};

type Member = { kid: string; child_player_id?: string; joined_at?: string; stats: KidStats };

type MeOk =
  | { role: "none" }
  | {
      role: "parent";
      family: {
        family_id: string;
        plan_code: string;
        link_code: string;
        seats_used: number;
        seats_total: number;
      };
      members: Member[];
      consents: Record<string, true>;
    }
  | {
      role: "child";
      family: {
        family_id: string;
        plan_code: string;
        seats_used: number;
        seats_total: number;
      };
      members: Member[];
    };

function planLabel(code: string): string {
  if (code === "family_2") return "Gói Gia đình (2 con)";
  if (code === "family_4") return "Gói Gia đình (4 con)";
  return code;
}

function StatsRow({ stats }: { stats: KidStats }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-300">
      <span>
        <span className="arena-num font-bold text-zinc-100">{stats.scans}</span> lượt quét
      </span>
      <span>
        <span className="arena-num font-bold text-zinc-100">{stats.drills}</span> lượt luyện
      </span>
      <span>
        Thạo top-5{" "}
        <span className="arena-num font-bold text-emerald-300">
          {stats.avg_mastery_top5 === null ? "—" : `${stats.avg_mastery_top5}%`}
        </span>
      </span>
      <span>
        <span className="arena-num font-bold text-zinc-100">{stats.skills_slain}</span> boss đã diệt
      </span>
      {stats.vip ? (
        <span className="font-bold text-amber-300">VIP</span>
      ) : (
        <span className="text-zinc-500">Chưa VIP</span>
      )}
    </div>
  );
}

export default function FamilyClient() {
  const [me, setMe] = useState<MeOk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [copied, setCopied] = useState(false);
  const [consentBusy, setConsentBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/family/me", { cache: "no-store" });
      if (!r.ok) throw new Error(await readApiError(r, "Không tải được trang Gia đình."));
      setMe(await readApiJson<MeOk>(r, "Không tải được trang Gia đình."));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được trang Gia đình.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred like the vact page: no synchronous setState in the effect body.
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function create() {
    setBusy("create");
    setError("");
    try {
      const r = await fetch("/api/family/create", { method: "POST" });
      if (!r.ok) throw new Error(await readApiError(r, "Không tạo được gia đình."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được gia đình.");
    } finally {
      setBusy(null);
    }
  }

  async function join() {
    setBusy("join");
    setError("");
    try {
      const r = await fetch("/api/family/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!r.ok) throw new Error(await readApiError(r, "Không tham gia được gia đình."));
      setCode("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tham gia được gia đình.");
    } finally {
      setBusy(null);
    }
  }

  // Phase-2a: record parental consent for one kid (parent view only).
  // Reads the JSON error body directly so the route's friendly 401/403 copy
  // ("Log in as a parent…") survives instead of a generic status message.
  async function consent(childId: string) {
    setConsentBusy(childId);
    setError("");
    try {
      const r = await fetch("/api/family/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ child_player_id: childId }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(
          typeof data?.error === "string" && data.error.trim().length > 0
            ? data.error.trim()
            : "Không ghi nhận được xác nhận.",
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không ghi nhận được xác nhận.");
    } finally {
      setConsentBusy(null);
    }
  }

  async function copyCode(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <HeroStat
        value={me && me.role !== "none" ? `${me.family.seats_used}/${me.family.seats_total}` : "…"}
        label="chỗ đã dùng trong gói"
        hint={me && me.role !== "none" ? planLabel(me.family.plan_code) : loading ? "Đang tải trang Gia đình…" : "Tạo gói hoặc nhập mã để tham gia"}
      />
      <PageHeader
        kicker="Gói Gia đình"
        title={
          <>
            Một gói, <span className="arena-title">cho mọi con</span>
          </>
        }
        sub="Chia sẻ VIP cho các con và báo cáo tiến độ đơn giản từng con."
      />
      {loading ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Đang tải trang Gia đình">
          <div className="arena-shimmer h-24 rounded-2xl" />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-2xl bg-red-950/40 p-4 text-sm text-zinc-200">
          {error} Tải lại trang — nếu vẫn lỗi, đăng xuất rồi đăng nhập lại.
        </p>
      ) : null}
      {!loading && me?.role === "parent" ? (
        <>
          <div className="arena-card rounded-2xl p-5 text-center">
            <p className="text-xs font-medium text-zinc-400">
              {planLabel(me.family.plan_code)} — đã dùng {me.family.seats_used} trên{" "}
              {me.family.seats_total} chỗ
            </p>
            <p
              aria-label="Mã liên kết gia đình"
              className="arena-num mt-2 text-4xl font-extrabold tracking-[0.2em] text-zinc-50"
            >
              {me.family.link_code}
            </p>
            <button
              type="button"
              onClick={() => void copyCode(me.family.link_code)}
              className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-bold text-zinc-200"
            >
              {copied ? "Đã chép" : "Chép mã"}
            </button>
            <p className="mt-3 text-sm text-zinc-400">
              Trên máy của con: mở trang Gia đình, nhập mã này là xong. Không cần đăng nhập.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {me.members.length === 0 ? (
              <div className="arena-card rounded-2xl p-5 text-center">
                <p className="text-sm text-zinc-300">
                  Chưa có con nào tham gia — chia sẻ mã bên trên để lấp chỗ.
                </p>
              </div>
            ) : null}
            {me.members.map((m) => {
              const childId = m.child_player_id;
              const consented = !!childId && me.consents[childId] === true;
              return (
                <div key={m.child_player_id ?? m.kid} className="arena-card rounded-2xl p-5">
                  <p className="font-display text-lg font-extrabold text-zinc-100">{m.kid}</p>
                  <StatsRow stats={m.stats} />
                  {childId ? (
                    consented ? (
                      <p className="mt-2 text-sm font-bold text-emerald-300">
                        Đã ghi nhận xác nhận của phụ huynh
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void consent(childId)}
                        disabled={consentBusy !== null}
                        className="arena-btn-ghost mt-2 rounded-full px-5 py-2 text-sm font-bold text-zinc-200 disabled:opacity-40"
                      >
                        {consentBusy === childId ? "Đang ghi nhận…" : "Xác nhận cho con"}
                      </button>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      {!loading && me?.role === "child" ? (
        <>
          <div className="arena-card rounded-2xl p-5 text-center">
            <p className="text-xs font-medium text-zinc-400">
              {planLabel(me.family.plan_code)}
            </p>
            <p className="font-display mt-1 text-xl font-extrabold text-zinc-100">
              Bạn đã vào gia đình
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Đã dùng {me.family.seats_used}/{me.family.seats_total} chỗ — VIP được chia sẻ khi gói
              của phụ huynh còn hiệu lực.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {me.members.map((m) => (
              <div key={m.kid} className="arena-card rounded-2xl p-5">
                <p className="font-display text-lg font-extrabold text-zinc-100">{m.kid}</p>
                <StatsRow stats={m.stats} />
              </div>
            ))}
          </div>
        </>
      ) : null}
      {!loading && (!me || me.role === "none") ? (
        <>
          <div className="arena-card rounded-2xl p-5">
            <p className="font-display text-lg font-extrabold text-zinc-100">Dành cho phụ huynh</p>
            <p className="mt-1 text-sm text-zinc-400">
              Mua gói Gia đình trước (Gia đình 2 con hoặc 4 con), rồi tạo gia đình tại đây để lấy mã
              8 ký tự.
            </p>
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy !== null}
              className="arena-btn-primary mt-3 rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40"
            >
              {busy === "create" ? "Đang tạo…" : "Tạo gia đình"}
            </button>
          </div>
          <div className="arena-card rounded-2xl p-5">
            <p className="font-display text-lg font-extrabold text-zinc-100">Dành cho các con</p>
            <p className="mt-1 text-sm text-zinc-400">
              Có mã từ phụ huynh? Nhập vào đây để tham gia — VIP mở ngay.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Mã 8 ký tự"
                maxLength={8}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-label="Mã gia đình"
                className="arena-num min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-center text-lg tracking-[0.2em] text-zinc-100 uppercase placeholder:text-zinc-600"
              />
              <button
                type="button"
                onClick={() => void join()}
                disabled={busy !== null || code.trim().length === 0}
                className="arena-btn-primary shrink-0 rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40"
              >
                {busy === "join" ? "Đang tham gia…" : "Tham gia"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
