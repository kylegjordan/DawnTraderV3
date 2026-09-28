# B-XSTOCK-BID-TRIGGER-RELAND (row `3n.q7`) — SCOPE

change-class: sub_batch

> **Why this file exists (Langston, Step-2 C1, 2026-09-29):** the governance checker reads the change-class only from a file whose name carries `SCOPE` (`checker.mjs:327`). With the marker only in the pre-audit, it defaulted this batch to `architecture` and made the System Manual a REQUIRED row, which the plan judges N/A. Under `sub_batch` that N/A is legitimate (`config.mjs:138`).

**Parent:** `3n` `B-PRICE-SIDE-BY-JOB` (owner CC-C). **Row:** `PHASE_19_PLAN.md` `3n.q7`, which carries the row's objective and Langston's three re-land conditions (2026-09-19).

**Objective of the row:** put the xStock stop/target TRIGGER back on the transactable bid, after `8a-P4b` Step 9 C1 took it off (`#1065`), once the three conditions are met. **The overnight hold policy is Kyle's call**, brought to him with numbers before any verdict ships.

**Increments:**
1. **The instrument (telemetry only, this increment):** one `[3n.q7][XS_FRAME]` line per evaluated xStock exit tick, with its reconciliation fence, the `frame=none` reasons, the write-rate budget and the pre-registered n-floor; plus the `SNAPSHOT proxy`. Plan: `B_XSTOCK_BID_TRIGGER_RELAND_PRE_AUDIT.md` (Step 2 cleared with C1-C3).
2. **The false-HOLLOW instrument and the reseed → `8a-P4a` escape chain** (the row's conditions 2 and 3): scoped when increment 1's window reads.
3. **The re-land itself**, gated on the window's read and on Kyle's hold-policy decision.

**Verification (increment 1):** the frame count reconciles 1:1 to `_exitEvalByClass.xstock.invoked` every cycle (`EVAL_EXIT` prints both); `frame=none` lines carry a reason; the first real line's byte length is recorded in the Step-7 evidence (re-budget above ~375 B); `error.log` stays on daily rotation.
