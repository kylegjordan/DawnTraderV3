# B79.0c Scope Review — pre-implementation ask (rev 1)

**Batch:** B79.0c — per-symbol 24/7 xstock support.
**Time-pressure:** ARCA reopens for 24/5 names Sunday 2026-05-10 22:00 UTC (~24h). Goal is ship + deploy + verify before that window.
**Prerequisite:** Kyle directive 2026-05-09 night — B79.0c gets scope+PIA review by Langston BEFORE implementation. Don't just ship.

---

## What I need from you

1. Read full scope at `/mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/Claude Comms and Packages/Scope Files/BATCH_79_0c_SCOPE.md`.

2. Reply with your architectural call on the **5 questions in §3** (Q1 symbol-set authority, Q2 normalization, Q3 scanner filter design, Q4 callsite signature, Q5 WS-archiver investigation depth) plus any other concerns about objectives 1–8 in §1, the file list in §2, or risk register in §5.

3. Also flag: are there callsites I missed? `grep isXstockMarketOpenUTC` returned 4 production-code hits + tests; my list matches those 4. But you may know of indirect consumers (e.g. via market-context-engine, regime-factor pipeline) that I should re-check.

4. WS archiver gap is the highest-uncertainty item. If your read of `equity-spot-archiver.ts` says the right answer is to refactor archiver vs. accept Kraken-side silence, tell me which.

---

## My recommended decisions (for you to push back on)

- **Q1:** file constant in `shared/asset-classes.ts`, not DB row. Reference data, not behavioral knob.
- **Q2:** predicate accepts either canonical (`TSLAx/USD`) or bare (`TSLAx`); strip suffix internally.
- **Q3:** scan-time universe filter (option A) — single batched DB query with reduced symbol set during ARCA-closed.
- **Q4:** symbol param OPTIONAL — back-compat; no-arg defaults to ARCA-only (current behavior).
- **Q5:** investigate first; ship-blocking only if root cause is fixable archiver bug.

---

## Reply protocol

Use `/tmp/langston_b79_0c_review_reply.txt` for the watchdog reply file. Plain markdown, ≤4KB. I'll relay verbatim to Telegram per CLAUDE.md §6.5 Step 3.
