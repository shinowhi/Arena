"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { readApiError } from "@/lib/scan/image-prep";

// Phase-2a account actions (client island): export-my-data download, logout,
// and the two-step delete-my-account confirm (type DELETE, then confirm).
export default function MeActions() {
  const params = useSearchParams();
  const router = useRouter();
  const first = params.get("first") === "1";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"export" | "logout" | "delete" | null>(null);
  const [arming, setArming] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [partial, setPartial] = useState<string[]>([]);

  async function exportData() {
    setBusy("export");
    setError("");
    try {
      const r = await fetch("/api/me/export", { cache: "no-store" });
      if (!r.ok) throw new Error(await readApiError(r, "Không tải được dữ liệu của bạn."));
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `arena-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu của bạn.");
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    setBusy("logout");
    setError("");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Navigate home even when the call fails (cookies may already be gone).
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  async function deleteAccount() {
    setBusy("delete");
    setError("");
    try {
      const r = await fetch("/api/me/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      if (!r.ok) throw new Error(await readApiError(r, "Không xóa được tài khoản."));
      const data = (await r.json().catch(() => null)) as { partial?: unknown } | null;
      setPartial(
        Array.isArray(data?.partial)
          ? data.partial.filter((t): t is string => typeof t === "string")
          : [],
      );
      setDeleted(true);
      setArming(false);
      setConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xóa được tài khoản.");
    } finally {
      setBusy(null);
    }
  }

  if (deleted) {
    return (
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-100">Đã xóa tài khoản</p>
        <p className="mt-1 text-sm text-zinc-400">
          Dữ liệu học tập, liên kết gia đình và đăng nhập của bạn đã bị xóa. Cảm ơn bạn đã chơi —
          hẹn gặp lại bất cứ lúc nào.
        </p>
        {partial.length > 0 ? (
          <div className="mt-3 rounded-xl border border-amber-800/60 bg-amber-950/30 p-4">
            <p className="text-sm font-semibold text-amber-200">
              Đang dọn nốt: {partial.join(", ")}.
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Các mục còn lại sẽ được dọn thủ công trong vòng 72 giờ.
            </p>
          </div>
        ) : null}
        <Link
          href="/"
          className="arena-btn-primary mt-4 inline-block rounded-full px-6 py-2.5 font-bold text-white"
        >
          Về trang chủ
        </Link>
      </section>
    );
  }

  return (
    <>
      {first ? (
        <p className="mt-6 rounded-2xl border border-emerald-700/60 bg-emerald-950/20 p-4 text-sm text-emerald-200">
          Đã liên kết — tiến độ của thiết bị này giờ gắn với tài khoản của bạn.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-6 rounded-2xl bg-red-950/40 p-4 text-sm text-zinc-200">
          {error}
        </p>
      ) : null}
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Dữ liệu và phiên đăng nhập</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void exportData()}
            disabled={busy !== null}
            className="arena-btn-ghost cursor-pointer rounded-full px-6 py-2.5 font-bold text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "export" ? "Đang tải…" : "Tải dữ liệu của tôi"}
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={busy !== null}
            className="arena-btn-ghost cursor-pointer rounded-full px-6 py-2.5 font-bold text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "logout" ? "Đang đăng xuất…" : "Đăng xuất"}
          </button>
        </div>
      </section>
      <section className="mt-6 rounded-2xl border border-red-900/60 bg-red-950/20 p-5">
        <p className="text-sm font-semibold text-red-200">Xóa tài khoản</p>
        <p className="mt-1 text-sm text-zinc-400">
          Xóa vĩnh viễn tiến độ, gói mua, liên kết gia đình và đăng nhập của bạn. Không thể hoàn
          tác.
        </p>
        {arming ? (
          <div className="mt-3">
            <label htmlFor="me-delete-confirm" className="text-sm text-zinc-300">
              Gõ <span className="font-mono font-bold">DELETE</span> để xác nhận
            </label>
            <input
              id="me-delete-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              spellCheck={false}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder:text-zinc-600"
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void deleteAccount()}
                disabled={busy !== null || confirm !== "DELETE"}
                className="rounded-full bg-red-700 px-6 py-2.5 font-bold text-white disabled:opacity-40"
              >
                {busy === "delete" ? "Đang xóa…" : "Xóa tất cả"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setArming(false);
                  setConfirm("");
                }}
                disabled={busy !== null}
                className="rounded-full border border-zinc-700 px-6 py-2.5 font-bold text-zinc-200 disabled:opacity-40"
              >
                Giữ tài khoản
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setArming(true)}
            disabled={busy !== null}
            className="mt-3 rounded-full border border-red-800 px-6 py-2.5 font-bold text-red-200 disabled:opacity-40"
          >
            Xóa tài khoản
          </button>
        )}
      </section>
    </>
  );
}
