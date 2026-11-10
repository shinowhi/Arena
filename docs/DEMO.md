# 3-minute demo script

Target: judges watch this once. Every shot must show something working live. Narration in English.

## Prep checklist (night before)

- Vercel deployment Ready, protection OFF, open in an incognito window.
- `BOSS_TTL_SECONDS=240`, `WORLD_BOSS_HP=200` set on Vercel.
- `node scripts/seed.mjs` run once (labels: seed-demo).
- Pick 2 sample photos from `fixtures/` that diagnose fast (verified by `probe-scan.mjs`).
- Two browser tabs open on `/arena` for the realtime shot. Phone camera ready for the scan shot.
- Timer visible. Total: under 3:00.

## 0:00-0:30 — The problem

Show: a real page of wrong homework (photo full-screen).
Say: "Students get math wrong every day, but a red X never tells them WHY. They drill random problems while the real hole — maybe algebra from two chapters back — stays open. We built Arena to find the hole and patch it with a game."

## 0:30-1:30 — Scan and diagnose

Show (live, no cuts):
1. `/scan` — click a sample photo (pre-verified, no upload fumble), laser line sweeps, click Analyze. Narrate over the staged progress ("reading handwriting… mapping skills… tracing root cause…").
2. Diagnosis card appears: weak skill + root cause + confidence.
3. Click "View on skill graph" — weak node glows red, root cause amber, foundations trail left.
Say: "Our vision agent reads the handwriting directly — no OCR. A second agent maps the mistake onto an 81-skill graph — calculus, mechanics, K12 math — and traces it back to the root cause. Here the student failed integrals, but the root is algebraic manipulation — that is what we patch."

## 1:30-2:30 — The boss fight

Show (live):
1. Click "Summon boss" — boss appears with 5 verified questions. Point at the "answers recomputed by a math engine" line.
2. Answer 2 questions: one right (HP bar drops, red hit flash), one wrong (no damage) to show grading.
3. Open the second `/arena` tab side by side: attack in one, HP falls in both.
4. Click Invite friends, open the link in a second browser: +50 XP banner for both.
Say: "The boss is five isomorphic questions — same shape, new numbers, rising difficulty. Every answer is recomputed by a math engine before the boss exists; the AI is never trusted with answers. And the world boss is shared: the whole class fights the same HP pool in realtime."

## 2:30-3:00 — Slay and close

Show: answer the last questions fast (jump cuts allowed), boss dies, "Boss slain" screen.
Say: "Boss slain — one skill patched. Already live: national exam mocks, an AI tutor, and ranked duels. Next: teacher dashboards. Students stop drilling blindly; they hunt exactly what is broken. Thank you."
End card: repo URL + "Built with Muse Spark 1.3 via the Meta Model API".

## Fallbacks

- Model slow on stage: say "live AI call" once, keep talking over the spinner; never show a dead silent screen.
- Scan misfires: use the backup photo (pre-verified), say "let me show a second sample".
- Realtime tab lags: narrate the HP numbers instead of waiting for the animation.