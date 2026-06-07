# B-NEW-53 (crypto enable) — Step-4 Change List (for Langston review BEFORE push)

**Date:** 2026-06-07. Kyle directive: turn decision-provenance capture ON for crypto too (we want the crypto decision data for Phase-25; you called the combined storage "trivial" — ~7.5 GB at 90d). This is an **iteration on the already-deployed B-NEW-53** (xStock provenance is live). Bench-verified: **tsc baseline GREEN (no regressions); 12/12 unit tests pass** (8 prior + 4 new for the shared helper). **NOT pushed** — your review gates the push. Staged in your inbox `/home/langston/inbox/b-new-53/`.

## What changed (DRY — I did NOT duplicate the snapshot logic a third time)
1. **New shared helper `buildBarProvenance(bars, stopPrice?, targetPrice?)`** in `signal-eval-archiver.ts` — snapshots the forming (last) bar BY VALUE + settled-bar-set reference + interval-from-spacing (15m→900, 60m→3600). Single source of truth for the forming-bar snapshot.
2. **`eval-cycle.ts` (xStock) refactored** to call the helper (`const _provBase = buildBarProvenance(ohlc);`) instead of its inline IIFE — behavior-preserving (the just-deployed xStock path produces identical provenance; the 4 hooks are otherwise unchanged).
3. **`vts-runner.ts` (crypto) — 3 hooks threaded:**
   - **Admitted (L1930, inside `generatePhase10Signal`):** `provenance: buildBarProvenance(ohlcData, stopLoss, takeProfit)` — using the **detect-output locals** `stopLoss`/`takeProfit` (`= strategySignal.stopPrice/targetPrice`, lines 1122–1123), which is what a detect-replay re-derives. **Crypto bars are 60-min** → interval derives to 3600 automatically.
   - **Strategy-null reject (L3584):** `buildBarProvenance(ohlcData)` — forming bar only (detect returned null, no stop/target).
   - **Caller-side net-EV reject (L3672):** `buildBarProvenance(ohlcData)` — forming bar only. This is the rare edge case (signal built but not checked inside); the detect-output locals aren't in scope here and the signal's mode-ADJUSTED levels would mismatch a replay, so I capture the forming bar and skip the checksum (honest).
4. **Migration `2026-06-07b-b-new-53-crypto-provenance-enable.sql`** (+rollback) — flips the `crypto_spot` capture flag `false → true`. Deploys with the code (the hooks won't capture until the flag is on).

## ★ THE BIG ONE I CHOSE NOT TO USE — and a pre-existing bug it surfaced
I originally wrote `tradeRecord.stopLoss`/`tradeRecord.takeProfit` (mirroring the existing admitted-features block) — tsc flagged 4 new TS2339. Investigating: **`Phase10TradeRecord` (vts-runner.ts:469) does NOT declare `stopLoss`/`takeProfit`/`entryPrice`/`quantity`/etc., AND the literal at L1598 never sets them** (it sets `entry: entryPrice`, no stop/target). So the **existing B70.2 admitted-`features` block (L1944-1979) has been archiving `undefined`** for `entryPrice`, `target`, `stopLoss`, `quantity`, `expectedEdge`, `atrAtOpen`, `pairIdHash`, and the phase/bias fields — for every crypto admitted row since 2026-05-05. The TS2339 baseline was silently absorbing this. **My provenance avoids it** by using the real detect-output locals. **I did NOT fix the B70.2 features bug here (scope discipline)** — flagging it for a separate decision (it's a real data-quality gap in `signal_eval_archive.features` for crypto admitted rows; provenance now carries the correct stop/target so replay is unaffected). Want it logged to RUNNING_ISSUES, or fixed now as a small follow-up?

## Files in your inbox
`signal-eval-archiver.ts` (helper), `eval-cycle.ts` (refactor), `vts-runner.ts` (3 hooks), `2026-06-07b-b-new-53-crypto-provenance-enable.sql`, `b-new-53-decision-provenance.test.ts` (12 tests).

## Verification plan (bonus: crypto trades 24/7 → live within minutes)
After deploy + the flag flip, crypto provenance rows should land within a few cycles (no waiting for the xStock reopen). I'll verify: crypto rows in `signal_eval_provenance` with non-null forming OHLC + constants_hash + resolved stop/target on admitted rows; coverage% (separate from parity); B-PHASE-A2 cycle timing unchanged (crypto path now also app-allocates ids).

Reply with approve-to-push or required changes (incl. your call on the B70.2 features bug).
