"use client";
import { useState } from "react";
import CharRig from "@/components/CharRig";
import { XIcon } from "@/components/ui/icons";
import { SPECIES, type AvatarSpec, type Species } from "@/lib/game/avatar";

export default function AvatarBuilder({
  spec,
  onSave,
  onClose,
}: {
  spec: AvatarSpec;
  onSave: (s: AvatarSpec) => void;
  onClose: () => void;
}) {
  const [species, setSpecies] = useState<Species>(spec.species);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="arena-pop arena-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-widest text-red-400">Tạo anh hùng</p>
            <h2 className="text-xl font-black">Chọn chiến binh của bạn</h2>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="arena-btn-ghost inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-3 py-1 text-sm">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {SPECIES.map((s) => {
            const active = species === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSpecies(s.id)}
                className={`overflow-hidden rounded-2xl border-2 text-left transition ${
                  active ? "border-red-400 shadow-[0_0_24px_rgba(239,68,68,0.35)]" : "border-zinc-800 hover:border-zinc-600"
                }`}
              >
                <span className="flex aspect-square w-full items-center justify-center bg-black/60">
                  <CharRig spec={{ species: s.id }} size={168} />
                </span>
                <span className="block bg-zinc-900/80 px-3 py-2">
                  <span className="block font-bold">{s.name}</span>
                  <span className="block text-xs text-zinc-400">{s.skill}</span>
                </span>
              </button>
            );
          })}
        </div>
        <button onClick={() => onSave({ species })} className="arena-btn-primary mt-4 w-full rounded-full py-2.5 font-bold text-white">
          Lưu anh hùng
        </button>
      </div>
    </div>
  );
}
