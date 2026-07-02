# P19-B7.2d Completion Report — xStock VTS lane maker/taker wiring (#434)

**Batch:** P19-B7.2d · change-class: non_architecture · **CC-B, 2026-07-03**
**Commits:** `127c6d845` (implementation, 5 files +516/−47) + `3e74293e5` (Step-4 change list). **CI:** run `28626488749` — all 4 jobs GREEN (TypeScript Check, Test Suite, Build, Docker Build). **Deploy:** staging 22:52Z, NO migration (knobs pre-seeded at B7.2c), HTTP 200, pm2 online.
**Langston:** Step-1 PROCEED · Step-2 PROCEED with a narrow B79.0m.b lock-lift + conditions · Step-4 PROCEED ("no CHANGES-NEEDED"; he independently verified the record-field identity hinge on staging code) · Step-8 below.

## ⚠️ LANE-SCOPED CLAIMS (the B7.2b §16/17 lesson — CHANGES_AND_FIXES FIX-2026-07-03-A)
This report says **"BOTH VTS lanes are now wired"** because THIS batch makes it true: crypto VTS (wired at B7.2b/c, unchanged economics, twin open now via the shared helper) and **xStock VTS (wired HERE)**. The paper-active path was wired at B7.2b/c and is untouched. Live mode = Phase 21.

## Objectives (scope `P19_B7_2d_SCOPE.md`)

**OBJ-1 — Decision at the xStock open seam: YES.** `decideMakerTaker` runs in `eval-cycle.ts` after the kernel, BEFORE the Net-EV floor; the floor gates on best-of-both `chosenNetEV` (crypto B7.2b :1724 parity); canonical key via `normalizeStrategy`; per-class friction + haircut. `chosen_entry_mode` + `entry_fee_rate` stamped (EFFECTIVE mode). *Evidence:* first post-deploy cycle (22:55:45Z) shows 11 xStock signals through `[P19-B7.2b][VTS][MAKER_TAKER]` (e.g. `WDC/USD/sma_trend_ride: chose maker (taker=-6.605939, maker-adj=-2.268172)`) — the decision demonstrably live in the lane. Legacy rows stay dashed (no backfill — dash-by-design).

**OBJ-2 — Pending lifecycle parity: YES.** Maker-chosen opens born `state='pending'` at the limit + `maker_max_pending_ms` deadline; marketable-at-placement → stored-taker fallback (`takerNetEV>0` → taker now) or `maker_marketable_dropped` (counters + per-lane aggregates + archive). **Q1 (Langston-verified in code):** xStock opens land in the SAME `openVirtualTrades` Map + `insertOpenTrade` sink → the ENTIRE B7.2c resolve machinery (fill/drop, never-filled, weekend guard, rehydrate) covers xStock with ZERO new resolve code. *Evidence:* Step-7 grep — the pending pre-pass (`evaluatePendingMaker`, vts-runner :2817) and the close-side twin short-circuit (`mtTwin === true`, :3069) are tag-based/class-agnostic, no class gate anywhere on the resolve side; rehydrate proven live (the crypto ZRO/EUR pending twin survived restart 22:52Z with `maker_deadline` intact).

**OBJ-3 — Twins parity: YES (shared-seam, stronger than transcription).** Crypto's inline twin block EXTRACTED into the shared `maybeOpenTwin` (vts-runner) called by BOTH lanes — **under Langston's NARROW B79.0m.b lock-lift: twin sub-block only; crypto's primary open stays inline; the general retrofit stays B79.0n+ future work.** Decision half = pure `planTwin` (`pending-maker-logic.ts`); `maker_max_pending_ms` resolved via a lazy thunk at the exact inline call point; twins keep the derived-id direct insert (NEVER through `registerOpenVtsTrade`). **Crypto twin regression: BOTH branches pinned** (his reinforcement) — the opens (taker twin state=open / maker twin pending+deadline) AND all skips (kill-knob, marketable-maker at/below limit, degenerate fallback) + precedence. *Evidence:* 9/9 new tests; post-deploy crypto twins keep flowing through the extracted helper (XMR/USD twin opened 22:45Z pre-deploy inline, and post-deploy crypto cycles run the shared path — same log markers, soak monitor uninterrupted).

**OBJ-4 — Tests + governance: YES.** `p19-b7-2d-xstock-lane.test.ts` (9 tests); bench tsc-baseline GREEN, vitest **2147 passed / 0 failed** (9 failed files = known no-DB collection errors). Governance files changed: RUNNING_ISSUES (#434 RESOLVED), SYSTEM_IMPACT_MAP (Cross-Cutting registry B7.2d paragraph — xStock joins the lifecycle + crypto twin routes through the shared helper + the weekend predicates documented load-bearing), SYSTEM_MANUAL (§B7.2c lane-parity callout), CHANGES_AND_FIXES (FIX-2026-07-03-A + the lane-scoped-claims process lesson), BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN §1/§5, this report, MEMORY_CC_B + Langston MEMORY sync.

## Extra verification beyond scope
- **Weekend-suspend pending hazard — verified NON-EXISTENT:** suspend UPDATEs predicate `state='open'` (SQL + in-memory mirror); restore flips only `weekend_suspended` — a pending can never be silently converted to an open position across the boundary. ⚠️ LOAD-BEARING PREDICATE guard comments added to both functions.
- **Live seed rows (Langston Step-7 ask):** all 11 `maker_taker` xstock_spot rows present in Supabase, incl. `maker_max_pending_ms=3600000` and `twin_enabled=1`.

## Honest boundaries (soak riders — the #433 pattern)
- **The first STAMPED xStock VTS open row** (and first xStock pending/twin pair on the VTS screens, §9.3 Chrome check) had not yet occurred at report time — post-deploy cycles evaluated 11+ signals but all floor-rejected (deeply negative EV — normal for the current tape). A one-shot watcher is armed on the open marker; the evidence posts to Discord + appends here when it lands. The decision/stamp CHAIN is already live-proven (OBJ-1 lines + the register passthrough is the same B-NEW-22 seam that already carries 20+ fields).
- The R3 weekend guard's first xStock-pending weekend crossing = next weekend boundary (soak note).
- xStock VTS volume may tick UP (maker-marginal signals now pass the best-of-both floor) and twins add tagged rows — expected effects, called out per scope, kill-knob available.

## Step-8 (Langston second-pass)
*Pending at write time — appended below on receipt.*
