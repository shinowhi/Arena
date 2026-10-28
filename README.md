# Arena (working title)

Gamified math gap finder: scan homework, diagnose the weak skill and its root
cause, then slay a boss of 5 machine-verified isomorphic questions.

Built for the Meta Global AI Developer Hackathon (theme: Build for Your World).

## Stack

| Layer | Tech |
|---|---|
| Frontend + API | Next.js App Router (TypeScript) + Tailwind |
| DB + Realtime | Supabase (Postgres, Realtime) |
| Deploy | Vercel |
| LLM | Meta model via Meta Model API (see below) |
| Math verification | mathjs (numeric answers checked by computation, never trusted from the LLM) |
| Formula rendering | KaTeX |

## Meta model usage

| Agent | Model | Where |
|---|---|---|
| Agent 1 Vision Decomposer | `muse-spark-1.3` (multimodal) | `lib/agents/vision-decomposer.ts` (M1) |
| Agent 2 Gap Finder | `muse-spark-1.3` | `lib/agents/gap-finder.ts` (M1) |
| Agent 3 Boss Generator | `muse-spark-1.3` | `lib/agents/boss-generator.ts` (M2) |

All calls go through `lib/llm/meta.ts`. Base URL, model, and key are env-configurable
(`META_MODEL_API_BASE_URL`, `META_MODEL`, `MODEL_API_KEY`, server-side only).

## Sample data

Everything under `fixtures/` is sample data unless stated otherwise.

## Env

Copy `.env.example` to `.env.local` and fill in keys. Never commit `.env.local`.
