# P19-B8.5k (B-ATR-RESTORE) — Completion Report

**Owner:** CC-B (NEW Claude) · **Phase:** 19 · **Closed:** 2026-07-25 · **change-class:** architecture

> 🚨 **THIS BATCH DOES NOT RESTORE THE ATR VALUE. The ATR carry was implemented, deployed, found to carry a WRONG (shared, per-symbol-incorrect) value, and ROLLED BACK. The volatility (ATR) value remains ABSENT (`atr_at_open = 0`) on positions — exactly the pre-batch state. Restoration is BLOCKED behind #581 (`B-ATR-SOURCE-FIX`).**

## Outcome in one line
The batch did what a batch is for: it flushed out a real hidden defect. Restoring the ATR carry made the value visible for the first time and the §9.3 live-data check proved it was a **single shared value per scan cycle, not per-symbol** — a genuine bucket-1 defect (#581) that `tsc`, the full test suite, and Langston's Step-4 code review all passed clean. Carry reverted, contaminated data cleaned, defect filed with a fix plan.

## Objectives
- **OBJ-1 — carry `atr` forward at the sized-signal rebuild:** IMPLEMENTED (`atr: sizingContext.atr`, deployed at `43616e4a0`) → **REVERTED** (`4dc65b8f2`). The carry is correct *as a carry*; the SOURCE (`sizingContext.atr`) is a shared value. **NET: NO.**
- **OBJ-2 — re-prove exit-neutrality under `atr>0`:** YES. Live DB confirmed BE/moonbag/trailing all off (4 classes); tests T1 (below-target write-back no-op) + T2 (at-target closes, no TRAILING_TAKE flip) pass. This finding stands and is reusable for the eventual correct re-carry. Langston Step-4 approved the neutrality proof.
- **OBJ-3 — active-only, VTS untouched:** YES (VTS stamps atr independently at `vts-runner.ts:2093`; no VTS diff).

## What actually shipped (the deliverable)
1. **#581 filed** — `sizingContext.atr` shared-value defect, with evidence (0.0075 identical across ZEC/XRP/ONDO/LTC/LINK/SOL/ETH/AAVE; atr/price 0.000004→0.0196), Langston's root-cause discriminator, the closed_trades cleanup scope, and the fence-test re-carry gate. #556 re-homed OPEN behind #581.
2. **Neutrality tests** (`p19-b8-5k-atr-neutrality.test.ts`, 4/4) — T1/T2 exit-neutrality + T4 write-back guard retained; T3 flipped to assert the revert.
3. **Data quarantine** — 7 positions opened during the carry window (00:02:43→00:15:11Z) had wrong `atr_at_open` reset to 0 (honest-absent, exit-neutral), 0 remaining wrong. Verified.
4. **Rollback deployed + verified** — post-boot signals carry no `atr` key; RTB rank risk floor (`ready_to_buy_service.ts:1691`) back on the safe null path; app HTTP 200, one clean restart.

## Verification
- CI 4/4 green on the rollback (`4dc65b8f2`, contained in the deployed head).
- §9.3 live-data check (the one that caught the defect): staging DB confirmed the wrong shared value pre-revert and its absence post-revert.
- tsc baseline gate green; full vitest 2441+ pass.

## Governance files changed
RUNNING_ISSUES.md (#581 filed; #556 blocked behind it), BATCH_CATALOG.md, PHASE_HISTORY.md, PHASE_19_PLAN.md, this report, scope + pre-audit (`P19_B8_5K_SCOPE.md`, `P19_B8_5K_PRE_AUDIT.md`), MEMORY_CC_B.md. **SIM / SYSTEM_MANUAL: N/A** — net code change is zero (carry reverted); no architecture landed. The discovery is homed in RUNNING_ISSUES, not the architecture docs.

## Lessons
1. **The §9.3 live-DATA verification is load-bearing, not a formality.** tsc + full vitest + Langston Step-4 all passed a change that shipped a wrong value into a live filter. Only inspecting the actual values on staging caught it. Verify values, not just field population.
2. **A carrier test is not a source test.** T1–T4 proved the carry works and is exit-neutral; nothing asserted the source *varies per symbol*. The re-carry gate (#581) is exactly that fence test.
3. **Provenance belongs inside the verification scope** (Langston's own note): clearing the *shape* of a source (`sizingContext.atr` is the single-point carrier) is not clearing *where its number comes from*.
