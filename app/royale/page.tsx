"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Opts = { exams: Array<{ id: string; name: string; sections: Array<{ id: string; name: string; count: number }> }> };

export default function RoyaleLobbyPage() {
  const router = useRouter();
  const [opts, setOpts] = useState<Opts | null>(null);
  const [exam, setExam] = useState("vact");
  const [section, setSection] = useState("");
  const [joinId, setJoinId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/duel/options")
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Options failed."));
        return readApiJson<Opts>(r, "Options failed.");
      })
      .then((d) => {
        if (!alive) return;
        setOpts(d);
        const first = d.exams.find((e) => e.id === "vact") ?? d.exams[0];
        if (first) {
          setExam(first.id);
          setSection(first.sections[0]?.id ?? "");
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Options failed.");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function create() {
    if (!section || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/royale/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam, section }),
      });
      if (!r.ok) throw new Error(await readApiError(r, "Create failed."));
      const d = await readApiJson<{ id: string }>(r, "Create failed.");
      router.push(`/royale/${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed.");
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    const id = joinId.trim();
    if (!id || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/royale/${encodeURIComponent(id)}/join`, { method: "POST" });
      if (!r.ok) throw new Error(await readApiError(r, "Join failed."));
      router.push(`/royale/${encodeURIComponent(id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Join failed.");
    } finally {
      setBusy(false);
    }
  }

  const cur = opts?.exams.find((e) => e.id === exam);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Battle royale"
        title={<>Last <span className="arena-title">scholar</span></>}
        sub="Up to 8 players, 10 questions, 30 seconds each. Wrong or slowest goes out. One survives."
        right={
          <Link href="/exam" className="arena-btn-ghost shrink-0 rounded-full px-4 py-1.5 text-sm font-bold text-zinc-200">
            All exams
          </Link>
        }
      />
      {error ? (
        <p role="alert" className="arena-card rounded-2xl p-4 text-center text-sm text-red-300">{error}</p>
      ) : null}
      <div className="arena-card flex flex-col gap-3 rounded-2xl p-6">
        <p className="font-display text-lg font-extrabold text-zinc-100">Create a room</p>
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Exam
          <select
            value={exam}
            onChange={(e) => {
              setExam(e.target.value);
              setSection(opts?.exams.find((x) => x.id === e.target.value)?.sections[0]?.id ?? "");
            }}
            aria-label="Royale exam"
            className="arena-input rounded-xl px-4 py-2 text-zinc-100"
          >
            {opts?.exams.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Section
          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            aria-label="Royale section"
            className="arena-input rounded-xl px-4 py-2 text-zinc-100"
          >
            {cur?.sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · 10Q</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy || !section}
          className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40"
        >
          {busy ? "…" : "Create room"}
        </button>
      </div>
      <div className="arena-card flex flex-col gap-3 rounded-2xl p-6">
        <p className="font-display text-lg font-extrabold text-zinc-100">Join with room ID</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="Paste room ID"
            aria-label="Room ID"
            className="arena-input min-w-0 flex-1 rounded-xl px-4 py-2 text-zinc-100 placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={() => void join()}
            disabled={busy || joinId.trim() === ""}
            className="arena-btn-ghost shrink-0 rounded-full px-5 py-2 text-sm font-bold text-zinc-200 disabled:opacity-40"
          >
            Join
          </button>
        </div>
      </div>
    </main>
  );
}
