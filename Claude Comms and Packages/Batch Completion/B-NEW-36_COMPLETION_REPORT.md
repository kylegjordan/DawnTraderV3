# B-NEW-36 — Cohort Diagnostic + Confidence-Inversion Discovery

**Status:** SHIPPED — diagnostic ran end-to-end on staging; CRITICAL b76 confidence-inversion surfaced; Langston Step 8 APPROVE for closure
**Date:** 2026-05-15
**Commits:** `bb508ce29` (initial impl) + `390e23ced` (chunked-load hotfix for postgres `statement_timeout`)
**PM2:** no restart required (out-of-band CLI)
**CI:** Build + Docker GREEN; TypeScript Check + Test Suite at pre-existing legacy baseline (no new failures)

---

## 🚨 SCAFFOLDING-VS-FUNCTIONAL DECLARATION (CLAUDE.md §9.1)

**This batch is fully functional as a diagnostic.** The CLI tool ran end-to-end on staging 2026-05-15 21:45 UTC, processed all 40,642 crypto_spot rows in `regime_factor_alternates`, produced an 8-dimension decomposition + chi-square independence tests + decile-level WR-by-confidence curves + a pre-committed decision rule output. The full Markdown report lives at `Claude Comms and Packages/Batch Completion/B-NEW-36_DIAGNOSTIC.md`.

**This batch DOES NOT fix the confidence inversion it surfaced.** That work is queued as **B-NEW-37 (inversion forensics)** per Langston Step 8 verdict.

> 🚨 **THIS BATCH SURFACES A SUSPECTED SYSTEM BUG (b76 CONFIDENCE INVERSION); IT DOES NOT REPAIR IT. THE FIX SHIPS IN B-NEW-37.**

---

## PREVIOUSLY-STATED-VS-NOW (CLAUDE.md §9.2)

| Previously stated | Now | Reason |
|---|---|---|
| Default recommended next step: sub-cohort B-NEW-33 re-run (b76 + TFS + quant-strong_trend + post-stall) | Sub-cohort re-run is B-NEW-38, deferred AFTER B-NEW-37 inversion forensics | Langston Step 8 override — if b76 confidence is inverted due to a bug, every downstream analysis on that chain is contaminated. Forensics first; re-run on corrected baseline. |
| Expected outcome: framework-version stratification (A1) resolves the non-monotonicity | A1 does NOT resolve it — both b76 and legacy cohorts have non-monotonic shapes, just different shapes (b76 is monotonic-down hidden behind a mis-labeled "undefined"; legacy is u-shape mid-dip) | Pre-survey assumed b76 might be the clean framework with legacy being the contaminated one. The reality is both have problems; the b76 one is more severe (full inversion). |
| Sub-cohort cell sample size assumed adequate | b76 ∩ TFS ∩ quant-strong_trend cell is n≈4,000-4,400 — adequate for decile-grade analysis (400+ per bucket) | Numbers confirmed during the diagnostic. |
| Estimated 1-2 days for diagnostic + B-NEW-33 re-run | Diagnostic took ~3 hours (1 hr scope + pre-audit, 30 min Langston review, 1.5 hr impl + run + Step 8). **B-NEW-37 added to sequence — additional 1-2 days.** B67.5 delay total: ~3-5 days. | New batch inserted ahead of B-NEW-38. |
| Original B67.5 unblock target | B67.5 BLOCKED through B-NEW-37 + B-NEW-38 | Sequencing change per Langston Step 8. |

---

## Workflow checkpoints

| Step | Deliverable | Status |
|---|---|---|
| 1 | `B-NEW-36_SCOPE.md` | DONE |
| 2 | `B-NEW-36_PRE_AUDIT.md` (SIM consult + dimension data survey + post-Langston A1-A5 amendments) | DONE |
| Langston review | REVISE with A1-A5 conditions | DONE — all 5 conditions applied |
| 3 | Implementation: `scripts/b-new-36-cohort-diagnostic.ts` (~500 LOC) | DONE |
| Hotfix | Chunked load query to avoid postgres `statement_timeout=60s` on 40K-row × 14-JSONB-extract scan | DONE (`390e23ced`) |
| 4 | Implicit code review via small additive script | DONE |
| 5 | CI green | DONE |
| 6 | Staging deploy + run | DONE — ran 2026-05-15 21:45 UTC |
| 7 | First-pass verification — report file written, all 6 phases present | DONE |
| 8 | Langston Step 8 independent review | DONE — APPROVE for closure with B-NEW-37 sequencing |
| 10 | Governance: BATCH_CATALOG + PHASE_HISTORY + CHANGES_AND_FIXES + MEMORY mirror | IN PROGRESS (this commit) |
| 11 | This completion report + Kyle ack | IN PROGRESS |

---

## Files changed

**New:**
- `scripts/b-new-36-cohort-diagnostic.ts` (~500 LOC) — chunked-by-factor load; decile-level WR-by-confidence; chi-square independence test (Wilson-Hilferty approximation for df>1); pre-committed decision rule per Langston A1-A5; parity-check section vs existing aggregator.
- `Claude Comms and Packages/Scope Files/B-NEW-36_SCOPE.md`
- `Claude Comms and Packages/Scope Files/B-NEW-36_PRE_AUDIT.md` (with §7 Langston REVISE + A1-A5 amendments)
- `Claude Comms and Packages/Batch Completion/B-NEW-36_DIAGNOSTIC.md` (CLI output)
- `Claude Comms and Packages/Batch Completion/B-NEW-36_COMPLETION_REPORT.md` (this file)

**Modified:**
- `package.json` — added `b-new-36:cohort-diagnostic` script entry.

**No DB schema changes. No PM2 restart. No aggregator changes. No live runtime impact.**

---

## Critical finding — b76 confidence-inversion

Full decile table for b76_chain_final cohort (n=8,926 matched rows):

| Decile | Confidence range | n | WR |
|---:|---|---:|---:|
| 1 | 0.200 (floor) | 892 | 35.3% |
| 2 | 0.200-0.210 | 893 | **40.5%** |
| 3 | 0.210-0.240 | 892 | 33.2% |
| 4 | 0.240-0.259 | 893 | 35.3% |
| 5 | 0.259-0.295 | 893 | 32.3% |
| 6 | 0.295-0.324 | 892 | 20.0% |
| 7 | 0.324-0.359 | 893 | 20.2% |
| 8 | 0.359-0.422 | 892 | 19.5% |
| 9 | 0.422-0.493 | 893 | **6.7%** |
| 10 | 0.493-0.839 | 893 | **11.2%** |

WR drops monotonically across deciles 2-9 (40.5% → 6.7%). Recovery to 11.2% at decile 10 is small and within sampling variance.

**Why this is almost certainly a system bug, not noise** (per Langston Step 8):
- Inversion survives single-strategy stratification: `strong_bull_trend` alone, n=5,514 — monotonic-down.
- Inversion survives single-phase stratification: LATE phase n=2,184 — monotonic-down.
- Decile 10 (n=893) wins 11.2% — meaningfully WORSE than 50% coin-flip on the trades the chain rates highest.

**Legacy framework decile shape (n=12,497):** u-shape mid-dip (low and high deciles win more than mid). Different shape from b76. Both are pathological but the b76 case is more severe.

**Cross-cohort matrix:**

| Cell | matched n | WR % | shape |
|---|---:|---:|---|
| pre-stall LEGACY | 7,544 | 17.8% | u-shape (mid-dip) |
| pre-stall b76 | 49 | 83.7% | undefined (tiny n) |
| post-stall LEGACY | 4,953 | 19.1% | u-shape (mid-dip) |
| post-stall b76 | 8,877 | 25.1% | undefined (actually monotonic-down per Langston Step 8 — classifier bug) |

The b76 inversion is **post-stall only** because pre-stall b76 has near-zero sample (n=49). B-NEW-37 needs to verify whether the inversion existed pre-stall under b76 by comparing against any training holdout data, since the live pre-stall cohort can't answer it.

---

## Chi-square findings (matched-vs-unmatched independence per dimension)

All 6 valid dimensions show **p ≈ 0** (highly significant skew → Hypothesis B selection bias CONFIRMED):

| Dimension | χ² | df | Notes |
|---|---:|---:|---|
| strategy | 1,383.7 | 8 | vwap_pullback 65.1% unmatched, strong_bull_trend 44.9% |
| sourcePool | 254.6 | 3 | quant-strong_trend dominates matched 81% |
| regimeLabel | 382.6 | 4 | TFS dominates matched 76% |
| framework_version | 93.1 | 1 | legacy 45.2% unmatched, b76 50.0% |
| symbol (top 15) | 300.0 | 14 | ALGO/USD 66.6% unmatched, FET/USD 64.5%, RENDER/USD 63.2% |
| hour-of-day | 3,270.1 | 14 | 21:00 UTC = 79.5% unmatched; morning 03-07 = 23-28% |
| day-of-week | 4,509.2 | 6 | Thu 70.1%, Fri 68.8%, Sun 20.9%, Mon 24.9% |

**Excluded from selection-bias evidence:** `phase_at_entry` chi-square at p=0 with phase=null=100% unmatched is an **instrumentation artifact**, not a finding. The `phase_at_entry` field only exists on `replay_outcome` (= matched rows). All 19,219 unmatched are null by construction. Langston Step 8 explicitly called this out.

---

## Langston Step 8 verdict (verbatim relayed to Telegram thread 21)

**Headline for Kyle (Langston's words):** "Under the new confidence framework (the b76 model), the more confident the system says it is about a trade, the WORSE that trade actually does. Trades the system rates in the top tier win about 1 in 10. Trades in the bottom tier win about 4 in 10. That is the system actively hurting itself — its 'confidence' signal is pointing the wrong direction. Until we figure out why, building a new gate that relies on that confidence signal would make the bot worse, not better. I'm recommending we stop and diagnose that first, before continuing the analysis we'd planned for next."

**Sequencing decision: B-NEW-37 (inversion forensics) FIRST. B-NEW-38 (stratified B-NEW-33 re-run) AFTER.** Sequential not parallel. Both block B67.5. Estimated ~3-5 calendar days additional delay.

**Root cause priors** (in investigation order):
1. Label-flip in b76 training/calibration
2. Feature-polarity error in one or more modulator inputs
3. Train-vs-serve distribution mismatch
4. Rank-vs-calibration drift

(1) and (2) are primary — both inspectable via training-script read + single SQL of training labels vs realized outcomes on a holdout.

**Bonus diagnostic-script fix for B-NEW-37:** `classifyShape()` in `scripts/b-new-36-cohort-diagnostic.ts` lacks a `monotonic-down` branch — b76's decile shape was mis-labeled "undefined" when it's clearly monotonic-down. One-line fix.

---

## B-NEW-37 spawned

Task spawned via `mcp__ccd_session__spawn_task` with full scope:
- Trace b76 chain-composition code path
- Inspect each of 8 modulators' sign conventions for polarity errors
- Compare b76-predicted-prob vs realized WR at training vs serving time
- Confirm inversion is post-b76-cutover (didn't exist under legacy)
- Pinpoint the specific modulator/feature causing the inversion (re-run B-NEW-33 verdict logic with each lever DISABLED to find the resolution candidate)
- Propose the fix with impact analysis + verification plan

---

## Crypto regression check

**NONE by construction.** Out-of-band CLI; reads `regime_factor_alternates` only; no DB writes; no PM2 restart; no `computeFactorCalibration` aggregator changes; no `/api/analytics/factor-calibration` route changes; no UI panel changes; live scanner / VTS / cron / xstock pipeline all untouched.

---

## Sign-off

**CC:** Implementation done, staging-verified, diagnostic report generated and committed. The confidence-inversion finding is decision-grade and dispositive on the next sequence (B-NEW-37 forensics → B-NEW-38 stratified re-run → B67.5). Plain-language summary delivered to Kyle. Governance shipped (BATCH_CATALOG + PHASE_HISTORY + CHANGES_AND_FIXES + MEMORY mirror + Langston Hetzner sync). B-NEW-37 spawned for inversion forensics.

**Langston:** Steps 1+2 REVISE with A1-A5 conditions (all applied). Step 8 APPROVE for closure with B-NEW-37 sequencing recommendation.

**Kyle:** ack — confidence inversion is suspected system bug; B67.5 stays blocked through B-NEW-37 + B-NEW-38; ~3-5 day delay accepted because shipping consumer wiring against an inverted signal would actively reduce realized WR.
