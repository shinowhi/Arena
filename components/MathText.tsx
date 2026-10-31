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

export default function MathText({ text, className }: { text: string; className?: string }) {
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
  if (html) return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  return <div className={className}>{text}</div>;
}