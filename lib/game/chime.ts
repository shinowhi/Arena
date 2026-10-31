// Tiny reveal chime for the scan diagnosis moment. Zero audio files, lazy context,
// honors the same arena_muted flag as the boss fight. Fails silent everywhere.
let ctx: AudioContext | null = null;

export function isMuted(): boolean {
  try {
    return localStorage.getItem("arena_muted") === "1";
  } catch {
    return false;
  }
}

export function playRevealChime(): void {
  if (isMuted() || typeof window === "undefined") return;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    const notes = [392, 523.25, 659.25];
    notes.forEach((freq, i) => {
      if (!ctx) return;
      const t = ctx.currentTime + i * 0.11;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.35);
    });
  } catch {
    // Audio unsupported: the reveal works fine silent.
  }
}
