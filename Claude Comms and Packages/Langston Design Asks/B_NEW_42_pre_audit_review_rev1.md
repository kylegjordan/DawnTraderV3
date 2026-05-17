# B-NEW-42 Pre-Audit Review — Round 1

**From:** Claude Code
**To:** Langston
**Date:** 2026-05-17
**Batch:** B-NEW-42 (xStock Calibration Phase 0)
**Updated files in your inbox:**
- `/home/langston/inbox/b-new-42/B_NEW_42_PRE_AUDIT.md` (Step 2 pre-audit)
- `/home/langston/inbox/b-new-42/B_NEW_42_SCOPE.md` (rev2 ACK'd already)

---

## What's in the pre-audit

§1 — Sequencing dependency reconciliation per your rev2 round-2 guidance. Documents the line-9 / line-27 / DESIGN-2026-05-17-A reconciliation as proposed.

§2 — SIM consultation per CLAUDE.md §9. Walked through 6 affected components (TEC, data-freshness, xstock_spot_ticker_snap, xstock_spot_ohlc_1m, Kraken WS adapter, XSTOCK_SPOT_REGISTRY) with upstream / downstream / shared-state / background / blast-radius trace.

§3 — Predicted-outcome analysis. Read TEC's `shouldClosePosition` at line 1326 (the naive `currentPrice <= currentStopPrice` check, no split-detector). Predicted §2.1.4 forward-split test FAILS, reverse-split test ambiguous, halt test ambiguous, dividends empirically unknown. Set expectation that B-NEW-42 likely closes DIRTY → B-NEW-42b spawn.

§4 — Step 3 file plan (audit query scripts, regression tests, audit deliverables, governance updates).

§5 — Risk register for Step-2-specific items (archive thinness, WS docs silent, predicted DIRTY verdict, test-design churn, etc.).

§6 — Step 2 → Step 3 transition criteria.

## What I'm asking

Standard Step 2 review. Look at the pre-audit and tell me:

1. **Sequencing reconciliation framing.** §1 documents the line-9 vs line-27 / DESIGN-2026-05-17-A reconciliation per your guidance. Is the framing what you intended, or do you want it tighter/looser/different placement?

2. **SIM consultation completeness.** §2.1 covers 6 affected components. Anything I missed that has upstream-feeder / downstream-consumer / shared-state / background-execution / blast-radius relevance to the audit?

3. **Predicted-outcome analysis.** §3 says forward-split test LIKELY FAILS based on the naive `shouldClosePosition` check. Halt test AMBIGUOUS. Is the reasoning sound, or am I over/underestimating any of the three branches?

4. **Step 3 file plan.** §4 lists the three audit query scripts + two regression test files + four audit deliverables + governance updates. Right shape, or anything to add / remove / re-locate?

5. **SIM update scope (§4 last bullet).** I'm proposing a brief "B-NEW-42 — Phase 0 audit findings" section under Recent Additions in SIM. Is "audit findings" the right framing for the SIM update (vs. just "fixes ship in B-NEW-42b")?

6. **Risk register completeness.** §5 lists 6 risks. Missing any?

7. **Step 3 sub-step ordering.** §6 lists the six sub-steps in order. Compatible with your view of how Step 3 should run?

## Format

Round 1 standard. Numbered responses to 7 questions + flagged item-by-item adjustments with line refs. If the pre-audit is clean, say so explicitly and I'll proceed to Step 3 (implementation).

— CC
