# B-NEW-42 Step 3 Verdict Check-In

**From:** Claude Code
**To:** Langston
**Date:** 2026-05-17
**Purpose:** Pre-audit §6 sub-step 5b verdict check-in (your optional refinement). Surface test results + draft verdict so B-NEW-42b scope-drafting can start in parallel with B-NEW-42 closure docs, saving ~½ day round-trip.

---

## Verdict: DIRTY

Full audit report at `/home/langston/inbox/b-new-42/audit-report.md` — also `1-system-manual/audits/b-new-42/audit-report.md` in repo.

## Summary of what landed

**Corp-actions (§2.1):**
- Archive Pass A (ticker-snap >40% step-change): **0 rows** across 46.2M rows / 260 symbols / 14 days. No corp-action events in window.
- Pass B (OHLC consec-bar) deferred — Pass A's EOD-level null is conclusive.
- Pass C/D metadata: only `schema_version` key. Kraken sends no `adjustment_factor` / `event_type` / `corporate_action` envelope.
- **Forward-split regression test (50% drop): CONFIRMS the gap.** Stop fires at clamped exit = pre-split stop.
- **Reverse-split regression test (2× jump entry $50 / target $80 / jump $100, parameter-locked per your rev1 §3.2): CONFIRMS the gap.** Target-lock latches → phantom-promote to TRAILING_TAKE.

**Dividends (§2.2):**
- All 15 candidate names present in archive with healthy row counts.
- Daily-aggregated gaps span -1.5% to +1.5% — typical day-over-day volatility.
- Cannot distinguish dividends from noise without external ex-dividend calendar correlation.
- **Verdict: INCONCLUSIVE without external calendar.** Defers to Phase D when calendar feed lands; flag the 1-2h pre-open ex-date block window in POST_AUDIT_ROADMAP Phase D entry.

**Halts (§2.3):**
- 7-day archive scan surfaced 42,226 gaps over 5 min.
- Distribution: 96% pause-no-movement (benign), 3% extended-moderate-movement, **1.1% halt-with-resume-gap** (462 rows, avg 1.10% gap, max 4.6% on EDU/USD).
- The 462 resume-gap events are mostly off-hours pauses on 24/5 names, not true intraday halts — but the structural Kraken behavior (resume with price change) IS confirmed.
- **3-scenario test pattern (your rev1 §3.3 add): PAUSE + STALE-STREAM both pass (benign cases work). POST-RESUME GAP confirms the gap** (stop fires at clamped exit = pre-halt stop, unfillable price).

**Sentinel-directive reinterpretation (your rev2 Q1 Delta B):** test FAILS desired behavior → sentinel REQUIRED. Note: I'm proposing the sentinel lives in `server/services/halt-detector.ts` (NEW) rather than the data-freshness layer, because B-NEW-34 removed the xstock_spot freshness window and the layer is a no-op gate now. Sentinel consumed at TEC's stop-check site directly.

## Important nuance — existing partial defense

`isXstockMarketOpenUTC` (B79.0L weekend gate) short-circuits TEC eval Fri 8PM ET → Sun 8PM ET. Splits are almost always effective overnight → the weekend gate IS a real partial defense against the corp-action scenarios. The intra-RTH halt scenario is the load-bearing exposure that has NO existing defense.

This nuances B-NEW-42b's priority ordering: halt-detector is more urgent than corp-action-detector because the weekend gate covers most corp-action exposure today. Worth a one-paragraph priority discussion in your read of the report.

## Test-mock note (your rev1 §5 add — test-mock-fidelity)

Tests use the actual exported `evaluateTECExit` API (not a re-implementation of the state machine). Mocks only:
- `db.js` (rowset)
- `cost-model.js` (zero costs)
- `storage.js` (no-op)
- `trade-safety.js` (no-op)
- `asset_classes/xstock_spot/market-hours.js` (force-open) — REQUIRED to bypass the B79.0L weekend gate since the host runs on a Sunday today; without this mock all xstock tests short-circuit via the gate and document nothing. The mock is isolated to the audit; production path retains the gate.

This mock-decision is the kind of fidelity concern your risk-register addition flagged. Calling it out explicitly.

## B-NEW-42b scope draft starts NOW (parallelization)

Per your pre-audit §6 substep 5b, I'm starting B-NEW-42b scope drafting in parallel while B-NEW-42 closure runs. Will send the B-NEW-42b Step 1 scope for your round-1 review once it's drafted (~30 min from this message).

## What I need from you

1. **Verdict confirmation.** DIRTY agrees with what the evidence supports? Or is there a different read on any of the three branches?
2. **B-NEW-42b priority ordering view.** Halt-detector before corp-action-detector (intra-RTH halt is undefended) or treat both as same urgency?
3. **Sentinel architecture preference.** Single `corporate-action-detector.ts` covering both discontinuity classes, OR two separate detectors (`corporate-action-detector.ts` + `halt-detector.ts`) consumed by TEC via the same gate site? My lean: single module with two flag types, reduces TEC integration surface to one consumer call.
4. **Anything in the audit report that's unclear or insufficient.**

Numbered responses standard. If clean (proceed with verdict + start B-NEW-42b scope) say so explicitly.

— CC
