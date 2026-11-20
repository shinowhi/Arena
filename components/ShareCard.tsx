"use client";

import { useRef, useState } from "react";

// L3: victory share card. Hand-rolled canvas export, zero new libs.
// B wires: drop <ShareCard kicker title stats /> on the victory screen.
type Props = { kicker: string; title: string; stats: string[]; filename?: string };

const W = 1080;
const H = 1350;

type ShareNav = Navigator & {
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files: File[]; title: string }) => Promise<void>;
};

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

// Minimal vector trophy in amber: cup + handles + stem + base. No emoji.
function drawTrophy(ctx: CanvasRenderingContext2D, cx: number, top: number, s: number): void {
  ctx.save();
  ctx.translate(cx, top);
  ctx.scale(s, s);
  ctx.strokeStyle = "#fbbf24";
  ctx.fillStyle = "#fbbf24";
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Cup body.
  ctx.beginPath();
  ctx.moveTo(-80, 0);
  ctx.lineTo(80, 0);
  ctx.lineTo(64, 90);
  ctx.quadraticCurveTo(56, 130, 20, 140);
  ctx.lineTo(-20, 140);
  ctx.quadraticCurveTo(-56, 130, -64, 90);
  ctx.closePath();
  ctx.stroke();
  // Handles.
  ctx.beginPath();
  ctx.moveTo(-80, 10);
  ctx.quadraticCurveTo(-140, 10, -132, 60);
  ctx.quadraticCurveTo(-126, 100, -70, 104);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(80, 10);
  ctx.quadraticCurveTo(140, 10, 132, 60);
  ctx.quadraticCurveTo(126, 100, 70, 104);
  ctx.stroke();
  // Stem.
  ctx.beginPath();
  ctx.moveTo(-14, 140);
  ctx.lineTo(14, 140);
  ctx.lineTo(20, 180);
  ctx.lineTo(-20, 180);
  ctx.closePath();
  ctx.fill();
  // Base.
  ctx.beginPath();
  ctx.moveTo(-70, 180);
  ctx.lineTo(70, 180);
  ctx.lineTo(80, 208);
  ctx.lineTo(-80, 208);
  ctx.closePath();
  ctx.fill();
  // Star inlay.
  ctx.fillStyle = "#0b0f1a";
  ctx.beginPath();
  const sx = 0;
  const sy = 62;
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? 26 : 11;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = sx + r * Math.cos(a);
    const y = sy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, kicker: string, title: string, stats: string[]): void {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b0f1a");
  bg.addColorStop(0.55, "#101528");
  bg.addColorStop(1, "#1a1030");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 480, 50, W / 2, 480, 620);
  glow.addColorStop(0, "rgba(34,211,238,0.22)");
  glow.addColorStop(1, "rgba(34,211,238,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 40;
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 6;
  ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(56, 56, W - 112, H - 112);
  ctx.textAlign = "center";
  drawTrophy(ctx, W / 2, 130, 1);
  ctx.fillStyle = "#67e8f9";
  ctx.font = "700 44px system-ui, sans-serif";
  ctx.fillText(kicker.toUpperCase().slice(0, 40), W / 2, 420);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 84px system-ui, sans-serif";
  const lines = wrap(ctx, title, W - 240);
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 540 + i * 100));
  const dy = 540 + lines.length * 100 + 50;
  ctx.strokeStyle = "#f43f5e";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 160, dy);
  ctx.lineTo(W / 2 + 160, dy);
  ctx.stroke();
  ctx.font = "700 54px system-ui, sans-serif";
  ctx.fillStyle = "#fbbf24";
  stats.slice(0, 4).forEach((s, i) => ctx.fillText(s.slice(0, 42), W / 2, dy + 90 + i * 80));
  ctx.fillStyle = "#f43f5e";
  ctx.font = "900 60px system-ui, sans-serif";
  ctx.fillText("ARENA", W / 2, H - 140);
  ctx.fillStyle = "#71717a";
  ctx.font = "500 34px system-ui, sans-serif";
  ctx.fillText("Quét bài. Hạ boss.", W / 2, H - 80);
}

export default function ShareCard({ kicker, title, stats, filename }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  async function share() {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    draw(ctx, kicker, title, stats);
    const name = filename || "arena-victory.png";
    try {
      const blob: Blob | null = await new Promise((res) => cv.toBlob(res, "image/png"));
      const nav = navigator as ShareNav;
      if (blob && typeof nav.canShare === "function" && typeof nav.share === "function") {
        const file = new File([blob], name, { type: "image/png" });
        if (nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], title: "Chiến thắng đấu trường" });
          setDone(true);
          return;
        }
      }
    } catch {
      // Share sheet unavailable or dismissed: fall through to download.
    }
    const a = document.createElement("a");
    a.download = name;
    a.href = cv.toDataURL("image/png");
    a.click();
    setDone(true);
  }
  return (
    <span className="inline-flex items-center gap-2">
      <canvas ref={ref} width={W} height={H} className="hidden" aria-hidden="true" />
      <button type="button" onClick={share} className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-semibold text-zinc-200">
        {done ? "Đã chia sẻ — GG!" : "Chia sẻ chiến thắng"}
      </button>
    </span>
  );
}