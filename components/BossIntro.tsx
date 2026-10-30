// A1 entry cinematic: 3s overlay when a boss fight opens. Scoped <style> keeps
// app/globals.css untouched (A's file).
export default function BossIntro({ name, onSkip }: { name: string; onSkip: () => void }) {
  return (
    <div className="bintro-backdrop fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-zinc-950/95 px-6 text-center">
      <style>{`@keyframes bintro-shake { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(-4px, 2px); } 50% { transform: translate(4px, -2px); } 75% { transform: translate(-2px, -2px); } }
.bintro-backdrop { animation: bintro-shake 0.5s ease-in-out 2; }
@keyframes bintro-slam { 0% { transform: scale(2.2); opacity: 0; } 60% { transform: scale(0.95); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
.bintro-slam { animation: bintro-slam 0.6s ease-out; }
@keyframes bintro-fadein { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
.bintro-fadein { animation: bintro-fadein 0.5s ease-out 0.4s both; }
@media (prefers-reduced-motion: reduce) { .bintro-backdrop, .bintro-slam, .bintro-fadein { animation: none; } }`}</style>
      <p className="bintro-fadein text-xs font-bold tracking-widest text-red-400 uppercase">
        Boss battle
      </p>
      <h2 className="bintro-slam text-4xl font-black tracking-tight text-zinc-100 sm:text-5xl">
        {name}
      </h2>
      <p className="bintro-fadein max-w-sm text-sm text-zinc-400">
        Five questions stand between you and glory. Answer them all to slay this boss.
      </p>
      <button
        type="button"
        onClick={onSkip}
        className="bintro-fadein mt-2 rounded-full border border-zinc-700 px-5 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
      >
        Enter the fight
      </button>
    </div>
  );
}
