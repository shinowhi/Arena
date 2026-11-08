"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { SKILL_IDS, skillName } from "@/lib/graph/skills";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Room = { room_id: string; skill_tag: string; skill_name: string; despawn_at: string };

export default function PvpLobby() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [skill, setSkill] = useState("chain_rule");
  const [joinId, setJoinId] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const createRef = useRef(false);

  useEffect(() => {
    let alive = true;
    // Microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => {
      if (!alive) return;
      setError("");
      setRooms(null);
    });
    fetch("/api/pvp/rooms")
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Rooms failed."));
        return readApiJson<{ rooms: Room[] }>(r, "Rooms failed.");
      })
      .then((d) => {
        if (alive) setRooms(d.rooms);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Rooms failed.");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function create() {
    if (createRef.current) return;
    createRef.current = true;
    setCreating(true);
    setError("");
    try {
      const r = await fetch("/api/pvp/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_tag: skill }),
      });
      if (!r.ok) throw new Error(await readApiError(r, "Room creation failed."));
      const d = await readApiJson<{ room_id: string }>(r, "Room creation failed.");
      router.push(`/pvp/${d.room_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Room creation failed.");
      setCreating(false);
      createRef.current = false;
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Player vs player"
        title={<>Duel <span className="arena-title">lobby</span></>}
        sub="Same 5 questions, both sides at once. Correct hits hurt the enemy side, misses hurt you. Last side standing wins."
      />
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
      <div className="arena-card flex flex-col gap-3 rounded-2xl p-5">
        <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Create a room</p>
        <div className="flex gap-2">
          <select
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            aria-label="Room skill"
            className="arena-input min-w-0 flex-1 rounded-xl px-4 py-2.5 text-sm text-zinc-100"
          >
            {SKILL_IDS.map((id) => (
              <option key={id} value={id}>
                {skillName(id)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="arena-btn-primary shrink-0 rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40 disabled:shadow-none"
          >
            {creating ? "…" : "Create"}
          </button>
        </div>
      </div>
      <div className="arena-card flex flex-col gap-3 rounded-2xl p-5">
        <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Join with a link</p>
        <div className="flex gap-2">
          <input
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="Paste room link or id"
            aria-label="Room link or id"
            className="arena-input min-w-0 flex-1 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={() => {
              const m = joinId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
              if (m) router.push(`/pvp/${m[0]}`);
              else setError("That doesn't look like a room link.");
            }}
            className="arena-btn-ghost shrink-0 rounded-full px-6 py-2.5 text-sm font-bold text-zinc-200"
          >
            Join
          </button>
        </div>
      </div>
      <div className="arena-card flex flex-col gap-3 rounded-2xl p-5">
        <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Your open rooms</p>
        {!rooms && !error ? <div className="arena-shimmer h-12 rounded-xl" role="status" aria-label="Loading rooms" /> : null}
        {rooms && rooms.length === 0 ? <p className="text-sm text-zinc-500">No open rooms — create one above.</p> : null}
        {rooms?.map((r) => (
          <Link key={r.room_id} href={`/pvp/${r.room_id}`} className="flex items-center justify-between rounded-xl bg-zinc-900/70 px-4 py-2.5 text-sm">
            <span className="font-bold text-zinc-100">{r.skill_name}</span>
            <span className="text-xs text-zinc-500">Enter →</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
