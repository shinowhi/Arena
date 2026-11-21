import { memo, useMemo } from "react";
import katex from "katex";

// Boss prompts mix words with $...$ math, e.g. "Evaluate $\int_{0}^{3} (4x+2) \ dx$."
// KaTeX only parses pure math, so render each $...$ part and escape the words.
const LATEX_HINT =
  /\\(frac|int|sum|sqrt|lim|sin|cos|tan|log|ln|exp|vec|times|div|pm|infty|alpha|beta|gamma|theta|pi|partial|left|right|begin|text)\b/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMixed(text: string): string {
  const parts = text.split("$");
  let html = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    if (i % 2 === 1 && part.trim()) {
      try {
        html += katex.renderToString(part, { throwOnError: false });
      } catch {
        html += escapeHtml(part);
      }
    } else {
      html += escapeHtml(part);
    }
  }
  return html;
}

// Module-level cache keyed by prompt text: exam pages re-render every
// second on the clock ticker, and katex.renderToString is pure, so reuse
// the output per distinct prompt instead of re-rendering each tick.
const htmlCache = new Map<string, string | null>();
const CACHE_MAX = 500;

function cachedHtml(text: string): string | null {
  const hit = htmlCache.get(text);
  if (hit !== undefined) return hit;
  let html: string | null = null;
  if (text.includes("$")) {
    html = renderMixed(text);
  } else if (LATEX_HINT.test(text)) {
    try {
      html = katex.renderToString(text, { throwOnError: false });
    } catch {
      html = null;
    }
  }
  // Bound the cache: papers hold ~120 distinct prompts; clear on overflow.
  if (htmlCache.size >= CACHE_MAX) htmlCache.clear();
  htmlCache.set(text, html);
  return html;
}

function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => cachedHtml(text), [text]);
  if (html) return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  return <div className={className}>{text}</div>;
}

export default memo(MathText);