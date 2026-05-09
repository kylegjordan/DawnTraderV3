# B79.0d Scope Review — pre-implementation ask (rev 1)

**Batch:** B79.0d — ORB strategy real implementation for xstock_spot.
**Time-pressure:** ARCA reopens Sunday 2026-05-10 22:00 UTC. Target: ORB live before reopen so Monday 14:30 UTC opening sees ORB online.
**Prerequisite:** Kyle directive 2026-05-09 — B79.0d is the next sub-batch after B79.0c CLOSED.

---

## What I need from you

1. Read full scope at `Claude Comms and Packages/Scope Files/BATCH_79_0d_SCOPE.md` (rev 1).

2. Reply with your architectural call on the **7 questions in §3** (Q1-Q7 covering open-range definition, breakout buffer, active window, confidence formula, regime mapping, asset-class guard placement, B73 ablation register-now-vs-later) plus any concerns about the file list, risks, or approach.

3. Out-of-scope items called out in §6 (US holiday calendar, Q-D probe, 24/7 ORB exclusion, etc.) — confirm they're correctly deferred.

---

## My recommended decisions

- **Q1:** calendar-fixed 14:30-15:00 UTC range. Avoids per-symbol first-tick state.
- **Q2:** ATR-mult 0.15 buffer (mirrors SBT pattern).
- **Q3:** active window 15:00-17:00 UTC (2 hours). Filters late-day reversal-bait.
- **Q4:** confidence = clamp(0.65 + 0.20·range/atr + 0.10·(volMult-1), [0.55, 0.90]).
- **Q5:** regime mapping IE+ST only (not TFS — already strategy-dense).
- **Q6:** triple-defense asset-class guard (detect+dispatch+SQE).
- **Q7:** register in B73 ablation now (n=0 OK; cleaner audit trail than retrofit).

---

## Reply protocol

Use `/tmp/langston_b79_0d_review_reply.txt`. Plain markdown ≤4KB. Will relay verbatim to Telegram per CLAUDE.md §6.5 Step 3.
