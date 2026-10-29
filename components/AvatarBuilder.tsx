"use client";
import { useState } from "react";
import HeroAvatar from "@/components/HeroAvatar";
import { ACCESSORIES, COLORS, SPECIES, type AvatarSpec } from "@/lib/game/avatar";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-bold tracking-wider text-zinc-400 uppercase">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export default function AvatarBuilder({
  spec,
  onSave,
  onClose,
}: {
  spec: AvatarSpec;
  onSave: (s: AvatarSpec) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<AvatarSpec>(spec);
  const pick = "rounded-full border border-red-400/70 bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-100";
  const idle = "rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-sm text-zinc-400 hover:border-zinc-600";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="arena-pop arena-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-widest text-red-400 uppercase">Create your hero</p>
            <h2 className="text-xl font-black">Species & gear</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="arena-btn-ghost rounded-full px-3 py-1 text-sm">
            ✕
          </button>
        </div>
        <div className="mt-2 flex justify-center">
          <HeroAvatar spec={draft} size={128} />
        </div>
        <Section label="Species">
          {SPECIES.map((s) => (
            <button key={s.id} onClick={() => setDraft({ ...draft, species: s.id })} title={s.skill} className={draft.species === s.id ? pick : idle}>
              {s.name}
            </button>
          ))}
        </Section>
        <Section label="Accessory">
          {ACCESSORIES.map((a) => (
            <button key={a.id} onClick={() => setDraft({ ...draft, accessory: a.id })} className={draft.accessory === a.id ? pick : idle}>
              {a.name}
            </button>
          ))}
        </Section>
        <Section label="Color">
          {COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => setDraft({ ...draft, color: c.id })}
              title={c.name}
              aria-label={c.name}
              style={{ background: `linear-gradient(135deg, ${c.c1}, ${c.c2})` }}
              className={`h-9 w-9 rounded-full border-2 ${draft.color === c.id ? "border-red-400" : "border-zinc-800"}`}
            />
          ))}
        </Section>
        <button onClick={() => onSave(draft)} className="arena-btn-primary mt-4 w-full rounded-full py-2.5 font-bold text-white">
          Save hero
        </button>
      </div>
    </div>
  );
}