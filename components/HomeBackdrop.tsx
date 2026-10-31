"use client";

import { useEffect, useRef } from "react";

// z-index -1 = same layer as .arena-bg in layout, but later in DOM so it paints above it.
// Interactive home backdrop: scroll shifts the base hue (red -> violet -> cyan),
// the mouse carries a soft glow whose hue follows the cursor x. Static when
// the user prefers reduced motion. Zero libs, CSS vars only (no re-renders).
export default function HomeBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      el.style.setProperty("--shue", String(Math.round(355 - p * 155)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onMouse = (e: MouseEvent) => {
      el.style.setProperty("--mx", `${((e.clientX / window.innerWidth) * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${((e.clientY / window.innerHeight) * 100).toFixed(1)}%`);
      el.style.setProperty("--mhue", String(Math.round(355 - (e.clientX / window.innerWidth) * 155)));
    };
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouse, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMouse);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-1"
      style={{
        ["--shue" as string]: 355,
        ["--mx" as string]: "50%",
        ["--my" as string]: "30%",
        ["--mhue" as string]: 280,
        background:
          "radial-gradient(2560px circle at var(--mx) var(--my), hsl(var(--mhue) 85% 50% / 0.3), transparent 70%), radial-gradient(900px circle at 85% 12%, hsl(calc(var(--shue) + 70) 80% 50% / 0.18), transparent 70%), radial-gradient(1000px circle at 8% 88%, hsl(calc(var(--shue) - 70) 80% 45% / 0.16), transparent 70%), linear-gradient(180deg, hsl(var(--shue) 65% 14%), #08080f 75%)",
      }}
    />
  );
}