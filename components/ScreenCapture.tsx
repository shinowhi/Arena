"use client";

import { useEffect, useRef, useState } from "react";

// Screen -> crop -> File. Flow: pick a screen/window/tab (OS picker) -> live
// preview -> freeze a frame -> drag to select a region -> cropped File out.
// The File feeds the normal scan pipeline, so both exam and life modes work.
type Stage = "live" | "crop";

type Rect = { x: number; y: number; w: number; h: number }; // normalized 0..1

export default function ScreenCapture({
  onCapture,
  onClose,
  multi,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  multi?: boolean;
}) {
  const [stage, setStage] = useState<Stage | null>(null);
  const [frame, setFrame] = useState("");
  const [rect, setRect] = useState<Rect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  // Unmount safety: never leave the OS screen-share indicator running.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function close() {
    stopStream();
    onClose();
  }

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen capture needs a desktop browser (Chrome or Edge).");
      return;
    }
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      streamRef.current = stream;
      setStage("live");
      attach(stream);
    } catch {
      setError("Screen permission was denied. Allow it and try again.");
    } finally {
      setBusy(false);
    }
  }

  function attach(stream: MediaStream) {
    // Attach after paint so the video element exists.
    requestAnimationFrame(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => {});
      }
    });
  }

  function retake() {
    const stream = streamRef.current;
    if (!stream) {
      setStage(null);
      return;
    }
    setError("");
    setFrame("");
    setStage("live");
    attach(stream);
  }

  function freeze() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setError("Video not ready yet — wait a second and retry.");
      return;
    }
    const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Could not grab the frame.");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Keep the stream alive through crop so Retake needs no re-pick; stopped on crop/close/unmount.
    setFrame(canvas.toDataURL("image/png"));
    setRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    setStage("crop");
  }

  function pos(e: React.PointerEvent): { x: number; y: number } {
    const box = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    };
  }

  function crop() {
    const img = imgRef.current;
    if (!img || img.naturalWidth === 0) return;
    setBusy(true);
    try {
      const sx = Math.round(rect.x * img.naturalWidth);
      const sy = Math.round(rect.y * img.naturalHeight);
      const sw = Math.max(1, Math.round(rect.w * img.naturalWidth));
      const sh = Math.max(1, Math.round(rect.h * img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("crop failed");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      stopStream();
      canvas.toBlob((blob) => {
        setBusy(false);
        if (!blob) {
          setError("Could not crop the image.");
          return;
        }
        onCapture(new File([blob], `screen-crop-${Date.now()}.png`, { type: "image/png" }));
        if (multi) {
          // Region loop: stay on the same frame for the next region.
          setAdded((a) => a + 1);
          setRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
        }
      }, "image/png");
    } catch {
      setBusy(false);
      setError("Could not crop the image.");
    }
  }

  return (
    <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
      <p className="text-sm font-semibold text-zinc-200">Capture your screen</p>

      {stage === null ? (
        <>
          <p className="max-w-sm text-sm text-zinc-400">
            Pick a window or tab, freeze a frame, then drag to select the exact region with the
            problem.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={start}
              disabled={busy}
              className="arena-btn-primary rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Opening picker…" : "Choose screen"}
            </button>
            <button
              type="button"
              onClick={close}
              className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </>
      ) : null}

      {stage === "live" ? (
        <>
          <video ref={videoRef} muted playsInline aria-label="Screen preview" className="max-h-64 w-full rounded-xl ring-1 ring-zinc-700" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={freeze}
              className="arena-btn-primary rounded-full px-5 py-2 text-sm font-semibold text-white"
            >
              Freeze this frame
            </button>
            <button
              type="button"
              onClick={close}
              className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </>
      ) : null}

      {stage === "crop" && frame ? (
        <>
          <div
            className="relative w-fit max-w-full cursor-crosshair touch-none overflow-hidden rounded-xl ring-1 ring-zinc-700 select-none"
            onPointerDown={(e) => {
              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
              startRef.current = pos(e);
              setDragging(true);
            }}
            onPointerMove={(e) => {
              if (!dragging || !startRef.current) return;
              const p = pos(e);
              const s = startRef.current;
              setRect({
                x: Math.min(s.x, p.x),
                y: Math.min(s.y, p.y),
                w: Math.abs(p.x - s.x),
                h: Math.abs(p.y - s.y),
              });
            }}
            onPointerUp={() => {
              startRef.current = null;
              setDragging(false);
            }}
            onPointerCancel={() => {
              startRef.current = null;
              setDragging(false);
            }}
            role="group"
            aria-label="Drag to select the scan region"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={imgRef} src={frame} alt="captured frame" className="block max-h-80 max-w-full" draggable={false} />
            <div
              className="pointer-events-none absolute border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.55),0_0_16px_rgba(52,211,153,0.6)]"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${Math.max(rect.w * 100, 1)}%`,
                height: `${Math.max(rect.h * 100, 1)}%`,
              }}
            />
          </div>
          <p className="text-xs text-zinc-500">Drag to adjust — the green box is what gets scanned.</p>
          {multi && added > 0 ? (
            <p className="text-xs font-semibold text-emerald-300">
              {added} region{added === 1 ? "" : "s"} added — select another or press Done.
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={crop}
              disabled={busy || rect.w < 0.02 || rect.h < 0.02}
              className="arena-btn-primary rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Cropping…" : "Scan this region"}
            </button>
            <button
              type="button"
              onClick={retake}
              disabled={busy}
              className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-medium text-zinc-200 disabled:opacity-40"
            >
              Retake
            </button>
            {multi ? (
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="arena-btn-primary rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Done{added > 0 ? ` (${added})` : ""}
              </button>
            ) : null}
            <button
              type="button"
              onClick={close}
              className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </>
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
