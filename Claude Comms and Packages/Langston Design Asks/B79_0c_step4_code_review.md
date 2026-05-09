# B79.0c Step 4 — Code Review

**Status:** awaiting Langston review of git diff. Implementation per scope rev 2 + your 5 revisions (verbatim reply at `Langston Design Asks/B79_0c_scope_review_rev1_reply.md`).

---

## What's in the diff

Diff file: `Claude Comms and Packages/Change Lists/B79_0c_diff.txt` (274 lines, 6 production files + 3 test files).

**6 production files modified:**

1. **`shared/asset-classes.ts`** — added `XSTOCK_SPOT_24_7_SYMBOLS` set with the 10 Kraken Phase-1 names (canonical `BASE/USD` form, matches master set shape).

2. **`server/asset_classes/xstock_spot/market-hours.ts`** — signature changed to REQUIRED-symbol per your Q4 push-back. Now `isXstockMarketOpenUTC(symbol: string, now?: Date): boolean`. Added `normalizeXstockSymbol()` helper to handle Kraken-pair forms (`TSLAxUSD`) and bare-with-x (`TSLAx`) — your Q2 belt-and-suspenders. ARCA fall-through unchanged when symbol not in 24/7 set.

3. **`server/asset_classes/xstock_spot/scanner.ts`** — your Q3 (option A): inside `runCycle()`, branch the universe before the batched DB query. ARCA-open → full 275 names; ARCA-closed → restricted to `XSTOCK_SPOT_24_7_SYMBOLS` (10 names). Added 2 diag fields (`lastUniverseSize`, `lastArcaOpen`) so the `/api/diagnostics/xstock-scanner` endpoint surfaces the universe split per your add'l #2. Hostile-sim still bypasses entirely.

4. **`server/core/filters/signal_quality_evaluator.ts:182`** — passes `canonicalSymbol` (post-normalize) to predicate.

5. **`server/utils/data-freshness.ts:97`** — `_symbol` un-prefixed → `symbol`, wired to predicate. 24/7 names now subject to normal staleness gating during weekends (correct: don't auto-mark stale data fresh).

6. **`server/services/trailing-exit-controller.ts:650`** — passes `update.symbol` to predicate. 24/7 names get normal stop-eval through weekends; ARCA-aligned names still freeze.

**3 test files modified/added:**

- `b79-0a-data-freshness.test.ts:29` — mock signature updated (accepts symbol arg, ignores it; per-symbol logic covered separately).
- `b79-0b-market-hours.test.ts` — REWRITTEN to pass non-24/7 sample symbol (`AMZN/USD`) to all boundary calls. ARCA schedule semantics unchanged.
- `b79-0c-market-hours-per-symbol.test.ts` — NEW. 6 describe blocks: membership integrity (size=10, all in master), 24/7 always-open, non-24/7 ARCA, normalization (Kraken-pair / bare-x / canonical-with-x), unknown-symbol fallback.

---

## Pre-ship verification I've done

- Grep confirms ZERO no-arg `isXstockMarketOpenUTC()` calls remain in `server/`.
- Implementation ran through TS compile (no new errors in B79.0c surface; legacy baseline failures unchanged from B79.0b).
- Live WS probe to `ws-equities.kraken.com` for the 10 24/7 names is RUNNING NOW (60s timer); result captured before I push so the change list documents whether 24/7 names actually flow during the current ARCA-closed window — or confirms the upstream Kraken-WS-silent hypothesis.

---

## What I want from you

Read `Claude Comms and Packages/Change Lists/B79_0c_diff.txt` and:

1. Verify each of the 5 rev-2 revisions you required is faithfully applied (Q4 required-arg, scope §7 #2 WS probe, §7 #3 diagnostics surface, §7 #4 baseline, §7 #5 honest-completion-report — last 3 are runtime / report concerns and won't be visible in the diff but should be confirmed by Step 7+8).
2. Spot-check the normalization regex in `market-hours.ts` (Kraken-pair `TSLAxUSD` → `TSLA/USD`; canonical `TSLAx/USD` → `TSLA/USD`).
3. Spot-check the scanner universe-branch — are ALL 24/7 names guaranteed to be in `XSTOCK_SPOT_SYMBOLS`? (test `b79-0c-market-hours-per-symbol.test.ts` asserts this).
4. Any callsites I missed beyond the 4? (My grep returned 4 production-code hits; you confirmed in your review reply.)
5. Verdict: approved | approved-with-revisions | needs-rework.

Reply via `/tmp/langston_b79_0c_code_review_reply.txt` plain markdown ≤3KB.
