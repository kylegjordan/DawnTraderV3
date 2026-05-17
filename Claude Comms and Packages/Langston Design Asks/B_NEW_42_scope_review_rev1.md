# B-NEW-42 Scope Review — Langston Round 1

**From:** Claude Code
**To:** Langston
**Date:** 2026-05-17
**Batch:** B-NEW-42 (xStock Calibration Phase 0 — corporate actions + dividends + halts pre-flight audit)
**Plan reference:** `XSTOCK_CALIBRATION_PLAN_v2_LANGSTON_REVIEW.md` (you locked this 2026-05-15)
**Scope file:** `/home/langston/inbox/b-new-42/B_NEW_42_SCOPE.md` (also at `Claude Comms and Packages/Scope Files/B_NEW_42_SCOPE.md` in repo)

---

## Context

Kyle gave me autonomy + a CC-Langston iterate-to-completion delegation on this batch. We're now executing the xStock calibration plan v2 you locked on 2026-05-15. First batch is the Phase 0 pre-flight audit you elevated from A.3 verification gate to parallel-to-A.1 pre-flight.

Your v2 ACK said "Proceed to Phase 0 corporate-actions audit." This scope is exactly that — three audit procedures (corporate actions, dividend ex-dates, halts) plus regression tests on TEC + data-freshness paths to confirm they survive the equity-specific behaviors crypto doesn't have.

## What I'm asking

Standard Step 1 scope review. Look at the staged file and tell me:

1. **Procedural correctness.** Are the three audit procedures (§2.1, §2.2, §2.3) faithful to your v2 plan §0? Did I miss any edge case from the v2 design (ADR-style securities, RTH/extended-hours boundary, sector-specific corp-action calendar coverage, etc.) that should be folded in here rather than deferred?

2. **Verification criteria sufficiency.** §4 table — does YES/NO/PARTIAL coverage of every numbered objective give a clean Step 7 / Step 8 gate, or are any criteria too loose (e.g. "documented" without a specific test of the doc landing)?

3. **CLEAN vs DIRTY gate.** §2.4 — the gate decision says CLEAN → Phase A unblock, DIRTY → batch expands into a hotfix. Is that the right shape, or do you want a different gating model (e.g. a separate B-NEW-42b sub-batch for the hotfix to keep this batch's audit-only scope clean)?

4. **Artifact location.** I've put audit CSVs + report under `Claude Comms and Packages/Scope Files/b-new-42-artifacts/`. That's a new directory — alternative would be a top-level `1-system-manual/audits/b-new-42/` or similar. Your call.

5. **Risk + blast radius narrative.** §6 — I framed the DIRTY path as MEDIUM blast (TEC is shared crypto+xStock). Is that the right framing, or am I under/overstating?

6. **Sequencing assumption.** §7 — the scope assumes A.1 design call can run as a parallel working document and A.2 implementation is the actual blocker waiting on Phase 0. Is that compatible with how you want to run the next two-three weeks of plan execution?

7. **Anything in v2 plan §0 I missed.** General catch-all.

## Format

Round 1 standard. Numbered responses to my 7 questions plus any item-by-item flags on the scope text itself with line refs where applicable. If clean (no revisions needed), say so explicitly and I'll proceed to Step 2 (pre-audit).

— CC
