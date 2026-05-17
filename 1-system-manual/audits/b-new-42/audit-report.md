# B-NEW-42 — xStock Calibration Phase 0 Audit Report

**Batch:** B-NEW-42 (xStock Calibration Phase 0 — corporate actions + dividend ex-dates + halts pre-flight audit)
**Date:** 2026-05-17
**Author:** Claude Code
**Scope:** `B_NEW_42_SCOPE.md` rev2 (Langston ACK 2026-05-17)
**Pre-audit:** `B_NEW_42_PRE_AUDIT.md` rev1 (Langston CLEAN ACK 2026-05-17 with refinements applied)

---

## §0 Verdict (top-of-report per scope §2.4)

# **DIRTY — B-NEW-42b hotfix batch required before Phase A starts.**

Phase A unblock status: **FALSE.** Phase A.1 DBS design call may continue as a parallel working document; Phase A.2 implementation is blocked on B-NEW-42b ship.

**What's broken (in plain terms):**

1. **Stop fires on splits.** When a stock splits 2:1 overnight, the quote halves. The trailing-stop logic interprets that as a real 50% price drop and fires the stop on every protected long position simultaneously. **Confirmed by regression test `b-new-42-tec-split-resilience.test.ts → FORWARD SPLIT`.**
2. **Phantom moonbag promotion on reverse splits.** A 1:2 reverse split doubles the quote in a single bar. If the doubled price crosses the target, the moonbag (target-lock) latch fires on what is structurally a non-event, locking the trade into TRAILING_TAKE mode with wrong reference levels. **Confirmed by `... → REVERSE SPLIT`.**
3. **Stop fires on halt-resume gaps.** When a trading halt resolves with a price gapped down through the stop, the next eval cycle clamps the exit price to the pre-halt stop level — which is an unfillable price in reality (real fill would be at or worse than the resume price). The system books a fictitious PnL. **Confirmed by `b-new-42-tec-halt-resilience.test.ts → POST-RESUME GAP`.** Empirically **462 halt-with-resume-gap candidates** observed across the xStock universe in the last 7 days (avg 66/day, avg 1.1% price change, max 4.6%).

**What works (defense-in-depth that limits real exposure today):**

- **Market-hours gate (B79.0L) short-circuits all xStock TEC evaluation Friday 8PM ET → Sunday 8PM ET.** Since splits almost always happen overnight or weekend-effective, the existing weekend gate is a partial structural defense. Forward and reverse split scenarios are *mostly* defended by this gate today.
- **Halt scenarios during the open window are NOT defended** by any existing mechanism. This is the load-bearing exposure to fix in B-NEW-42b.

---

## §1 Corporate-actions audit (§2.1)

### §1.1 Archive findings

**Source:** `1-system-manual/audits/b-new-42/corp-actions-scan.csv`

**Pass A — ticker-snap prev_day_close vs open_24h ratio anomalies (>40% step-change):**
- **0 rows.** No corporate-action candidate events detected across the full 14-day archive (46.2M ticker_snap rows, 260 distinct xStock symbols).
- Interpretation: no split / large-special-dividend / spin-off events occurred in the archive window.

**Pass B — OHLC consecutive-bar step-changes:**
- **Deferred (timeout).** Pass A's null finding at EOD-snapshot level is conclusive for the audit's gap-detection purpose; intra-bar discontinuities at minute level would also have shown at day boundary. Pass B's query plan against the 14M-row OHLC table exceeded the 30s pool timeout (B-NEW-40-enforced). Deferred to a future per-symbol-chunked rewrite if a specific intra-bar discontinuity is suspected; not on B-NEW-42 critical path.

**Pass C — OHLC `metadata` jsonb keys present:**
- **`schema_version` only.** No `adjustment_factor`, `event_type`, `corporate_action`, `split_ratio`, or any other corp-action-related key.

**Pass D — ticker_snap `metadata` jsonb keys present:**
- **`schema_version` only.** Same finding as Pass C.

**Archive window summary:** 2026-04-30 → 2026-05-17 (~14 days), 260 distinct symbols, 46.2M ticker_snap rows + 14.2M OHLC_1m rows.

### §1.2 Kraken WebSocket schema review (§2.1.2)

**Schema empirically silent on corporate-action events.** From Pass C/D metadata-key inspection: Kraken's WS feed delivers no `adjustment_factor` / `event_type` / `corporate_action` envelope. Whatever price they pass through their `ticker` channel is the price we see; we have no upstream signal that a corporate action has occurred.

**Open question for Phase A.1:** does Kraken send adjusted-vs-raw prices? Pass A's null finding suggests they pass through raw prices (since any auto-adjustment would have appeared as a >40% step-change at the adjustment boundary). Empirical answer pending live observation during a real corporate-action event.

### §1.3 TEC handling policy decision (§2.1.5 → SYSTEM_MANUAL.md)

**Current state:** TEC has NO corporate-action detector. `shouldClosePosition` (trailing-exit-controller.ts:1326-1331) is `currentPrice <= currentStopPrice` with no discontinuity awareness. Forward and reverse split tests **CONFIRM** the structural gap.

**Partial existing defense:** `isXstockMarketOpenUTC` (server/asset_classes/xstock_spot/market-hours.ts) short-circuits TEC evaluation during the Fri 8PM ET → Sun 8PM ET window. Since the vast majority of corporate-action events are effective after-market (overnight or weekend), the existing weekend gate IS a real partial defense. The bug is structural but the operational exposure today is narrow.

**Required handling (B-NEW-42b):** add a `corporate-action-detector.ts` sentinel module that flags single-bar discontinuities >40% (configurable). TEC's `shouldClosePosition` and target-lock checks consume the sentinel via a single `if (detector.isActionActive(symbol, currentPrice, prevPrice)) skipCheck` gate. Blast radius LOW per pre-audit §5.

---

## §2 Dividend ex-dates audit (§2.2)

### §2.1 Archive findings

**Source:** `1-system-manual/audits/b-new-42/dividend-gaps-scan.csv` (252 daily-aggregated rows; 15 div-paying names × ~14 days; symbol form is `BASE/USD` without the `x` display suffix that some governance docs reference).

**Universe coverage:** all 15 candidate dividend-paying names present in archive — KO, JNJ, PG, XOM, CVX, JPM, BAC, T, VZ, MCD, HD, WMT, MMM, IBM, MO. Row counts 100K-260K per symbol over the 14-day window.

**Gap-magnitude distribution (per-row, not de-duplicated by day):**
- `reverse_gap_up` (gap-ups -1.5% to -0.3%): ~1.09M rows
- `regular_quarterly` (gap-downs 0.3% to 1.5%): ~649K rows
- `special_or_spinoff` (gap-downs > 1.5%): ~79K rows
- `special_gap_up` (gap-ups < -1.5%): ~64K rows

**Daily-aggregated read (post-noise-reduction, the 252-row CSV):** all 15 names show daily-magnitude gaps spanning -1.5% to +1.5% — typical day-over-day volatility for liquid equities. No clear clustering of large gap-downs on any single date that would indicate a tracked ex-dividend event landing.

### §2.2 Kraken synthetic-dividend hypothesis test (§2.2.2)

**Result: INCONCLUSIVE without external ex-dividend calendar correlation.**

The archive data shows gap-magnitudes consistent with normal daily volatility. To definitively answer "does Kraken credit synthetic dividends?" we'd need to correlate observed gap-down dates with known ex-dividend dates from an external calendar (Yahoo Finance free tier or equivalent). Without that correlation, gap-downs in the dividend-yield range (0.3-1.5%) are statistically indistinguishable from regular intraday moves.

**Defer to Phase D for the structural answer.** Phase D earnings-handling will wire a calendar feed source (Yahoo Finance per v2 plan §D.1); ex-dividend correlation is a one-week sub-task that piggybacks on that infrastructure. Until then, the working assumption is "we don't know."

**Interim posture (Langston verdict-check-in 4c):** since Phase D is N weeks out, the no-fix-in-between posture leaves a real-money risk window where a dividend-gap-down through a stop could fire an unfillable exit on a div-paying name. B-NEW-42b adopts the **curated-calendar option (i)** — for the 15 named dividend-paying symbols (KO, JNJ, PG, XOM, CVX, JPM, BAC, T, VZ, MCD, HD, WMT, MMM, IBM, MO), maintain a hand-curated JSON list of next-30-day ex-dates (4 quarterly per symbol per year = ~60 entries to maintain manually until Phase D). The 1-2h pre-open ex-date block window from v2 plan §0.2.3 is enforced by the price-discontinuity-detector module B-NEW-42b builds. When Phase D's auto-calendar lands, the curated JSON is replaced with feed-driven data without changing the consumer.

### §2.3 Dividend handling policy (§2.2.3 → SYSTEM_MANUAL.md + POST_AUDIT_ROADMAP.md)

**Conditional Phase-D dependency flagged.** When Phase D ships earnings-calendar feed integration, extend the same pattern to ex-dividend dates with a **1-2 hour pre-market-open blocking window on ex-date** (per v2 plan §0.2.3 specifier). If Phase D analysis confirms Kraken credits synthetic dividends, the block can be omitted; otherwise it's required.

**Calendar source:** Yahoo Finance free tier (matches Phase D earnings source). Retrieval cadence: daily morning poll of the next 30 days of ex-dividend dates for the xStock universe. Free-tier coverage of major-name dividends validated externally; minor names may have gaps.

---

## §3 Halts / circuit breakers audit (§2.3)

### §3.1 Archive findings

**Source:** `1-system-manual/audits/b-new-42/halt-gaps-scan.csv` (42,226 rows of >5min tick-stream gaps across the xStock universe over the last 7 days).

**Halt classification distribution:**
- `candidate_pause_no_movement` (>5min gap, |price change| < 0.1%): **40,487 rows (96%)**
- `candidate_extended_gap_moderate_movement` (>5min gap, 0.1-0.5%): 1,277 rows (3%)
- `candidate_halt_with_resume_gap` (>5min gap, ≥0.5% price change): **462 rows (1.1%)**

**Average abs price change across resume-gap candidates: 1.10%. Max: 4.6%** (EDU/USD, 2026-05-11 01:30:51 → 01:40:21 UTC, +4.63%).

### §3.2 Kraken WebSocket halt behavior characterization (§2.3.2)

**Pattern: pause-with-occasional-resume-gap.** The 96% benign pause cases show Kraken pauses ticker emission during low-liquidity windows and resumes with the same price on the other side. The 1.1% gap cases show real price discovery happened during the pause window. Both behaviors are observed in the same archive.

The vast majority of the observed gaps are OFF-HOURS pauses (timestamps fall outside ET RTH 9:30-16:00), NOT intraday halts. True intraday halts in the archive window appear to be rare-to-zero (the scan can't perfectly separate them without per-symbol ET-RTH boundary filtering). But the structural behavior — Kraken can and does resume with a price change after a pause — IS confirmed and represents the operational risk.

### §3.3 TEC halt-resilience policy decision (§2.3.3 + §2.3.4 → SYSTEM_MANUAL.md)

**Current state — confirmed by regression test:**
- `PAUSE` (no movement during pause): **handled** correctly — TEC sees stable price, doesn't fire stop.
- `STALE-STREAM` (advancing captured_at, same price): **handled** correctly (same as PAUSE from TEC perspective).
- `POST-RESUME GAP` (resume at gapped-down price below stop): **BROKEN.** TEC clamps exit to pre-halt stop, books unfillable exit price.

**Scope §2.3.4 sentinel directive reinterpretation (per Langston rev2 §Q1 Delta B):** the v2 plan §0.3.4 line ("add halt-detection sentinel to data-freshness layer") is reinterpreted as conditional on test outcome. The test FAILS the desired behavior on post-resume gap → **sentinel REQUIRED**. Specifically: a halt-detection sentinel that flags the post-resume tick (last-tick was >5min ago AND price moved >0.5% across the gap) and short-circuits the TEC stop check until at least one independent confirming tick after resume.

**Note:** data-freshness layer is NOT the right home for this sentinel post-investigation. B-NEW-34 removed the xstock_spot freshness window, leaving the freshness layer as a no-op gate. The sentinel belongs in a sibling module (e.g. `server/services/halt-detector.ts`) consumed by TEC at the stop-check site. B-NEW-42b will own this decomposition.

---

## §4 SIM update (per pre-audit §4 + Langston rev1 §5 framing)

Audit surfaces documented absence of split/halt detectors as missing dependency edges between corp-action awareness and TEC, and between halt-detection and freshness layer. **SIM increment in B-NEW-42:** add "B-NEW-42 — Phase 0 audit findings" section under Recent Additions documenting:
- TEC has no corporate-action detector (gap discovered, fix in B-NEW-42b).
- Freshness layer has no halt-detection for xstock_spot (B-NEW-34 removed the window).
- Existing `isXstockMarketOpenUTC` weekend gate is a real partial defense against splits but not halts.

**Fix entries land in B-NEW-42b's SIM increment, not B-NEW-42.**

---

## §5 Open questions (Phase A.1 intake — per scope §6 + Langston rev1 §5 unknown-unknown)

1. **Does Kraken send adjusted-vs-raw prices?** Pass A's null suggests raw (auto-adjustment would show as a step-change), but empirical confirmation pending a real corporate-action event. Documented for A.1 review.
2. **Does Kraken credit synthetic dividends for xStock holders?** Inconclusive without ex-dividend calendar correlation. Defers to Phase D wiring.
3. **What is the rate of true intra-RTH halts on xStocks?** The 7-day archive doesn't cleanly separate halts from off-hours pauses. A future scan with per-symbol RTH-window filtering would give a cleaner answer. Not blocking; sentinel design covers both cases.

---

## §6 Files produced

| Artifact | Path | Status |
|---|---|---|
| Audit report (this doc) | `1-system-manual/audits/b-new-42/audit-report.md` | ✅ |
| Corp-actions CSV (null finding annotated) | `1-system-manual/audits/b-new-42/corp-actions-scan.csv` | ✅ |
| Dividend-gaps CSV (252 daily rows) | `1-system-manual/audits/b-new-42/dividend-gaps-scan.csv` | ✅ |
| Halt-gaps CSV (42,226 rows) | `1-system-manual/audits/b-new-42/halt-gaps-scan.csv` | ✅ |
| Split-resilience regression test | `server/tests/unit/b-new-42-tec-split-resilience.test.ts` | ✅ passes (documents gap) |
| Halt-resilience regression test | `server/tests/unit/b-new-42-tec-halt-resilience.test.ts` | ✅ passes (documents gap) |
| Query scripts | `scripts/b-new-42-*.sql` (3 files) | ✅ |

---

## §7 Phase 0 Gate Decision

**Verdict: DIRTY.**

**Evidence:**
- 2 of 3 audit branches surface live structural gaps confirmed by regression test (split-resilience + halt-resilience).
- 1 of 3 branches (dividends) is inconclusive without external calendar correlation; defers to Phase D.
- Empirical evidence: 462 halt-with-resume-gap events in 7-day archive (avg 66/day) demonstrates the halt scenario is operationally live, not theoretical.

**B-NEW-42b spawned.** Hotfix batch with its own Step 1 scope, design, code review, and verification. Surface area: new sentinel module (`corporate-action-detector.ts` + `halt-detector.ts` — possibly merged), TEC stop-check + target-lock integration, regression-test assertion inversion. Blast radius LOW per pre-audit §5 decomposition.

**Phase A unblock status: FALSE.** Phase A.1 DBS design call may proceed as a parallel working document during the B-NEW-42b window; Phase A.2 implementation is gated on B-NEW-42b ship.

— Claude Code, 2026-05-17
