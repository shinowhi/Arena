# Video shoot checklist (3-minute judging cut)

Script: `docs/DEMO.md`. Shoot order below follows the script beats.

## Day before
- [ ] Production Vercel deploy Ready, protection OFF, incognito window.
- [ ] World boss fresh: open `/api/arena/active-bosses` — need 1 ALIVE boss with
      HP 200/200 and `despawn_at` in the future. Re-check right before rolling
      (demo TTL is 240s). If missing/expired, GET `/api/arena/active-bosses`
      once to lazy-spawn it — do NOT use `/api/boss/summon` (that makes a
      private 100-HP boss, not the shared world boss).
- [ ] Exam papers fresh (only if shooting the teaser): V-ACT/HSA mocks load 200.
- [ ] 2 sample photos picked from `fixtures/` (fast diagnose, pre-verified).
- [ ] Two tabs on `/arena` side by side. Timer app visible. Phone camera ready.

## Shots (timestamps = DEMO.md)
- 0:00 homework close-up (any wrong page, full-screen photo).
- 0:30 `/scan` sample → laser → Analyze → diagnosis card (one take, no cut).
- 1:00 "View on skill graph" → red weak node + amber root.
- 1:30 "Summon boss" → 5 questions → answer 1 right (HP drops) + 1 wrong.
- 2:00 arena 2-tab sync: attack left, HP falls right.
- 2:30 boss dies → victory screen → closing line → end card.

## Optional 15s teaser (only if under 2:45)
- `/vact` paper loads 120Q + timer, or `/transparency` numbers. One shot max.

## Publishing
- Title: "Arena — scan your work, slay the boss (Meta Hackathon)".
- Description first line: what it does + production URL.
- Repo About: "Scan homework → AI finds the weak skill + root cause → fight a
  verified-question boss. K12 + THPTQG + V-ACT + HSA mocks, AI tutor, duels."
- End card: repo URL + "Built with Muse Spark 1.3 via the Meta Model API".
