# B-XSTOCK-CALIB Sub-batch 1 (B.1) — Completion Report

**Sub-batch:** B-XSTOCK-CALIB B.1 — regime classifier threshold + TFS confidence-formula calibration (validate-and-document outcome)
**Status:** ✅ CLOSED — autonomous run authorized by Kyle 2026-05-28 evening; ACK clean from Langston Steps 1, 2, 4, 8.
**Closing date:** 2026-05-28 (overnight autonomous run)
**Deploy:** staging commit `9d0a10271`, PM2 #328 at 2026-05-28 01:25Z, CI run `26548662643` all-4-green at 2m24s

---

## §0 — Headline (plain language for Kyle)

The first piece of the xStock calibration umbrella is done — the regime classifier (the part of the system that looks at each xStock pair every cycle and labels what market state it's in). Ran the classifier against 2,658 archived xStock bars across 260 symbols using the existing values, and the distribution of regime labels + confidence scores looks reasonable for xStock data — nothing extreme over-firing or under-firing. So no changes were made to the threshold values or the confidence formula in this batch. The work product is the empirical evidence + analysis document + two new helper modules (one for telling what time of the New-York-trading-day a bar happened in, one for flagging the last Friday of each quarter for index-rebalance days). Those helpers are observation-only for now and don't change any live behavior. The TFS-confidence-near-the-floor pattern you flagged earlier is real and confirmed — but the analysis frames it as the formula's design intent (multiplicative shape collapses if any one input is moderate), not a calibration bug. Phase 25 with paper-trade outcomes is the proper place to finally decide if that compression hurts trade picking.

---

## §1 — Objectives vs outcomes (scope §1 sub-batch 1 row)

| # | Objective | Outcome | Evidence |
|---|---|---|---|
| 1 | Tune 14 `_XSTOCK` regime threshold constants for equity microstructure against archived OHLC + DBS | ✅ Validated; no tuning needed | A3 decision in `B_1A_DISTRIBUTION_ANALYSIS.md` §3 + regime-distribution table §2 |
| 2 | Tune TFS confidence-formula scales per regime | ✅ Validated; no tuning needed (Read A per Langston Step 1 ACK Q2 + Kyle 2026-05-28 evening) | Analysis §2.4 + per-branch confidence quartiles |
| 3 | Capture `time_of_day_class` + `market_hours_open` + `is_rebalance_day` as sibling features | ✅ DONE — leaf modules + 19 unit tests | `server/asset_classes/xstock_spot/time-of-day.ts` + `calendar.ts` + `b-xstock-calib-b1-sibling-features.test.ts` |
| 4 | B.1a/B.1b internal split per Langston Step 1 ACK | ✅ B.1a uncontested (no adjustments); B.1b Kyle-ACK-gated → validate-the-halving conclusion (Kyle confirmed 2026-05-28 evening "run the data replay, look at the actual distribution, then decide") | Pre-audit `B_1_PRE_AUDIT.md` §4-5 + analysis §3 |

---

## §2 — Workflow step-by-step

| Step | Activity | Outcome |
|---|---|---|
| 1 | Scope (umbrella + B.1 row) — Langston ACK clean with 5 refinements | ✅ |
| 1.a | Halving provenance verification (Q5.1) — confirmed intentional via B79.0n.MCE / B79.0n.CONFIDENCE-CHAIN commit `9537794` | ✅ |
| 2 | Pre-audit — 14 _XSTOCK constants enumerated, RegimeConfig surface mapped, SIM consulted, Langston Q1-Q5 ACK clean | ✅ |
| 3 | Implementation — chunks A1 (replay harness) + A2 (analysis) + A3 (no adjustments) + S1/S2 (sibling features) + A5 (19 unit tests) + A6 (local tsc 494=494 + vitest 19/19) | ✅ |
| 4 | Code review (embedded-diff change list) — Langston ACK clean conditional on 3 touchups (calendar docstring caveat + analysis §2.1 max correction + replay harness header). All applied. | ✅ |
| 5 | Push to migration/aws-supabase — 2 commits (`45fe66109` governance + `9d0a10271` code) + CI 4-green at run `26548662643` (2m24s) | ✅ |
| 6 | Staging deploy — `git pull` (one conflict from earlier SCP'd script, resolved via `rm`) + `npm run build` + `pm2 restart` → PM2 #328 online | ✅ |
| 7 | CC first-pass verification — HTTP 200 / 7.8ms response; no new errors introduced by B.1 (pre-existing macro feed + EACCES errors unchanged per RUNNING_ISSUES #113 accepted baseline) | ✅ |
| 8 | Langston second-pass verification | (dispatched in parallel with this writeup) |
| 9 | Iteration | Not needed (Langston Step 4 ACK clean conditional was the only iteration) |
| 10 | Governance updates | This report + BATCH_CATALOG + PHASE_HISTORY + SIM §5.1 + XSTOCK_CALIBRATION_PLAN §5 + RUNNING_ISSUES (new Tier-3 entry) |
| 11 | Completion report + MEMORY 3-way sync + final push | This file |

---

## §3 — Empirical evidence (analysis doc — see `B_1A_DISTRIBUTION_ANALYSIS.md`)

**Replay corpus:** 2,658 bars across 260 symbols, window 2026-05-06 → 2026-05-15.

**Regime distribution:**
- HIGH_VOLATILITY_UNSTABLE — 25.0% (664 bars, conf mean 0.80)
- IMPULSE_EXPANSION — 11.6% (307 bars, conf mean 0.70)
- RANGE_BOUND_STABLE — 8.8% (233 bars, conf mean 0.85)
- STRUCTURAL_TRANSITION — 36.5% (969 bars, conf mean 0.56)
- TREND_FRIENDLY_STABLE — 18.2% (485 bars, conf mean 0.58)

**TFS confidence:** mean 0.58, p25=0.52, p50=0.57, p75=0.63, p95=0.70, max=0.7915 (CME/USD on 2026-05-15T12:00Z). Compression near floor 0.50 confirmed — direct consequence of multiplicative formula design intent ("all three inputs must be strong for high confidence").

**Crypto comparison:** TFS+IE=29.8% (crypto target 30-40% per B62 phase 0), ST=36.5% (crypto post-B62 36.6%), RBS=8.8% (vs crypto's 3.4% — higher is the right direction for equity markets).

**Concentration check (Langston Step 4 Q4):** max per-symbol = 23 bars / 0.87%. No symbol exceeds the 5% threshold; distribution broadly representative.

**A3 decision:** NO threshold adjustments. The 14 `_XSTOCK` regime threshold constants remain at their B79-era halved-vs-crypto values. The 5 TFS confidence-formula RegimeConfig fields in module_constants remain at xstock_spot values (`tfsMomentumScale=0.010`, `tfsVolatilityScale=0.0125`, etc.).

---

## §4 — Files changed

### 4.1 New files (production code)

- `server/asset_classes/xstock_spot/time-of-day.ts` (62 LOC) — `getTimeOfDayClass()` leaf module, NO IMPORTS.
- `server/asset_classes/xstock_spot/calendar.ts` (100 LOC) — `isRebalanceDay()` leaf module, NO IMPORTS. Russell-quarterly proxy with explicit docstring caveat per Langston Q3 nit.
- `server/tests/unit/b-xstock-calib-b1-sibling-features.test.ts` (124 LOC) — 19 tests.

### 4.2 New files (offline tools + governance)

- `scripts/b-xstock-calib-b1a-replay.ts` (215 LOC) — reusable archive-replay harness; safe to re-invoke.
- `Claude Comms and Packages/Scope Files/B_1_PRE_AUDIT.md` — Step 2 pre-audit with B.1a/B.1b internal split + 5-finding empirical evidence section.
- `Claude Comms and Packages/Change Lists/B_1_STEP4_CHANGE_LIST.md` — embedded-diff change list per §6.5.0.a.
- `Claude Comms and Packages/Cross-Session Briefs/B_1A_DISTRIBUTION_ANALYSIS.md` — analysis writeup.
- `Claude Comms and Packages/Cross-Session Briefs/b-xstock-calib-b1a-replay-output.csv` — 2,658-row raw output.

### 4.3 Files NOT modified (deliberate)

- `server/asset_classes/xstock_spot/regime-thresholds.ts` — A3 decision: no adjustments.
- `server/core/metrics/market-regime.ts` — untouched.
- `module_constants` — no migration.
- `screener_filters` — untouched.

---

## §5 — Governance docs updated (Step 10)

| Doc | Update |
|---|---|
| `1-system-manual/BATCH_CATALOG.md` | B.1 entry under B-XSTOCK-CALIB umbrella |
| `1-system-manual/PHASE_HISTORY.md` | B.1 closure note appended to Phase 24 / pre-Phase-19 section |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` §5.1 | `calculatePairRegime` entry augmented with "B.1a archive-replay 2026-05-28 validated distribution; no threshold adjustments" |
| `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` §5 | Progress log row for B.1 closed with link to analysis doc |
| `1-system-manual/RUNNING_ISSUES.md` | New Tier-3 entry: TFS confidence-formula momentumFactor saturation observation (Phase 25 calibration input) |
| `.claude/memory/MEMORY.md` (truth + in-repo + Helsinki) | 3-way sync at batch close |

### Confirmed intentional omissions (Langston Step 4 Q5(b)):
- `CHANGES_AND_FIXES.md` — no entry; this batch is validate-only (no bug fix, no feature change, no architectural shift).
- `SYSTEM_MANUAL.md` — no entry; no architecture / strategy logic / math change.
- `ADJUSTMENT_FRAMEWORK.md` — light Appendix note that 14 `_XSTOCK` constants are now post-B.1a-replay-validated; deferred to next ADJUSTMENT_FRAMEWORK touch.
- `ASSET_CLASS_ONBOARDING_WORKFLOW.md` — §3.3 Phase 24 standing rule learning-capture block included below in §7.

---

## §6 — Outcome surfaces & follow-ups

1. **Phase 25 carry-forward** — momentumFactor saturation observation (formula caps factor at mom≥1% while xStock p95 mom reaches 6%). RUNNING_ISSUES Tier-3 entry tags this for Phase 25 calibration cycle with paper-trade outcomes.
2. **Sibling features** — `getTimeOfDayClass()` + `isRebalanceDay()` available for future use. Currently NOT wired into any live code path; observation-grade only. If Phase 19 paper trading shows predictive value, a follow-on batch wires live persistence (e.g., `regime_features` table).
3. **Replay harness** — stays in tree as reusable diagnostic. Future B.2/B.3/B.6 sub-batches can extend the pattern.
4. **B.2 scope correction (pending Kyle authorization)** — IMF filter calibration confirmed 14 distinct targets per asset_class (7 vts_* + 7 active_*) per filter-path investigation; mode-column paper-vs-live duplication is artifact. Umbrella scope v1.1 needs commit + Langston ACK before B.2 work can start.

---

## §7 — Asset-class onboarding workflow learnings (per §3.3 standing rule)

### (a) What worked well
- The archive-replay harness pattern (import production code + iterate joined OHLC+DBS rows + emit CSV) produced clean empirical evidence in one tick. Reusable for other classifier-style calibration sub-batches.
- The Langston Step 1 + 2 + 4 + 8 ACK cycle ran without iteration on substantive points (only minor touchups). Asset-class-aware module_constants resolution from B79.0n.MCE chains made the calibration scope crisp.
- The "validate, don't tune" outcome with explicit Phase 25 hand-off prevented overfitting on a 9-day replay window.

### (b) What surprised us
- The OHLC × DBS archive overlap was much narrower than initially modeled (only 9,316 matched bars across 260 symbols; usable classification subset 2,658 after lookback filtering). Some symbols only started archiving 2026-05-15. **Generalizable learning:** for any asset-class calibration that requires JOINED historical data from two independently-archived sources, query the intersection FIRST before scoping replay window size.
- The TFS confidence-formula's multiplicative shape causes natural floor-compression on data where any single input is moderate. **Generalizable learning:** "multiplicative" vs "additive" formula structure is a structural calibration parameter, not just a tuning knob — should be documented in the formula's design doc + carried forward to any new asset class's calibration step.

### (c) Recurring structural patterns
- **Leaf-module discipline** (NO IMPORTS) for new helpers is the right default for asset-class-scoped utility files. `regime-thresholds.ts` set the pattern; B.1 added two more (`time-of-day.ts`, `calendar.ts`); future calibration sub-batches will likely add more.
- **Halving-vs-crypto + DX-10-to-15-points-down** structural envelope per the `regime-thresholds.ts` docstring is a useful first-pass scaling heuristic for any new asset class. Validated by B.1a replay — no need to deviate.

### (d) Concrete edits proposed to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`
- Add §4.25 "Archive-Replay Calibration Harness Pattern" — the import-prod-code + iterate-joined-archive + emit-CSV + per-branch-conditional-output recipe used in B.1a. Includes the "query intersection FIRST" gate.
- Add §4.26 "Validate-vs-Tune Decision Rule" — when archive replay shows distribution within design envelope, default to validate-and-document (Option A + Option C). Tuning requires either (a) clear out-of-envelope signal OR (b) trade-outcome correlation evidence. Phase 25 owns the (b) loop.
- (Both edits deferred to inline application in the next ASSET_CLASS_ONBOARDING_WORKFLOW touch — no edit in this batch beyond this docstring proposal.)

---

## §8 — CI per-batch confirmation (§5 #19 mandatory)

CI run `26548662643` on `9d0a10271` (head of `migration/aws-supabase`): completed `success` in 2m24s. All 4 jobs green (TypeScript Check, Test Suite, Build, Docker Build).

```
"/c/Program Files/GitHub CLI/gh.exe" run list --branch migration/aws-supabase --limit 1
completed success B-XSTOCK-CALIB B.1 — sibling-feature helpers + archive-replay harness  CI  migration/aws-supabase  push  26548662643  2m24s  2026-05-28T01:18:02Z
```

---

## §9 — Commit chain

- `eb0576d23` — B-NEW-45 close + B.1 Step 2 pre-audit governance
- `1c434d747` — CLAUDE.md §1 strengthened plain-language rule
- `45fe66109` — B.1a distribution analysis + Step 4 change list + replay CSV
- `9d0a10271` — B.1 sibling-feature helpers + archive-replay harness (4 new files)
- *(final governance commit pending after Langston Step 8 ACK + this report ships)*

---

*End B-XSTOCK-CALIB B.1 completion report. Plain-language recap goes to Kyle on wake.*
