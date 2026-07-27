# B-XSTOCK-ORDERBOOK-COL (#561) — COMPLETION REPORT

**Owner:** Claude Analyst (CC-C) · taken over from CC-B who dropped #561 · change-class: **non_architecture** (reconciled — see pre-audit)
**Code head:** `82211df87` (Langston Step-4 APPROVED) · Deployed in the branch head (live since the ~21:4x 2026-07-27 window that carried it) · No migration.
**Scope:** `B_XSTOCK_ORDERBOOK_COL_SCOPE.md` · **Pre-audit:** `B_XSTOCK_ORDERBOOK_COL_PRE_AUDIT.md` (added to close the checker docgap `68dab926` + reconcile the class `d52d5847`).

## Objective
The **"Volume / Order Book"** column showed `--` for every xStock trade (it fills for crypto). Make it fill for xStock too, on the Open + Closed tabs, by carrying the xStock ask-side order-book depth (`askDepthUsd`, `depth_usd`) to the active trade.

## Objectives checklist
| # | Verdict | Evidence |
|---|---|---|
| 1 — xStock depth threaded to the active trade | **YES (code)** | `eval-cycle.ts` passes `askDepthUsd` to the dispatch; `active-dispatch.ts` carries `entryLiquidityValue`/`Kind` onto `rawSignal.metadata`; `signal-orchestrator.ts` stamps xStock-first / crypto-fallback (honest-undefined when absent). Langston Step-4 APPROVED (`82211df87`). |
| 2 — Crypto column unaffected | **YES — verified** | §9.3 (during the A2 verification): ONDO/USD (crypto) renders a Volume/Order-Book value; the crypto `fx5Data.volume24h` path is untouched. |
| 3 — xStock column renders | **⏳ PENDING-VERIFY** | **No xStock trade has opened since #561 went live** (latest xStock open GM/USD 20:16 UTC pre-dates the ~21:4x deploy; all 9 current xStock open positions have `entryLiquidityValue` absent = pre-stamp, EXPECTED per the scope's §9.3 note). Needs a **fresh xStock open post-deploy** to confirm the DB row carries `entryLiquidityValue`/`Kind` and the cell renders `$… · OB`. NOT a defect — a data-availability wait. |

## §9.3 status
Crypto side confirmed rendering. **xStock render PENDING** a fresh post-deploy xStock open (same deferral shape as the B-OPEN-TRADES-DISPLAY regime work). **HOME:** the xStock verification rides the existing xStock-signal-flow watch — when a fresh xStock trade opens, confirm `metadata.entryLiquidityValue` present + the cell renders. Owner CC-C.

## Bench + tests
tsc: no new errors in the 3 files. CI green on the deployed head.

## Governance files changed (this close)
This report · pre-audit (new) · scope (existing) · BATCH_CATALOG.md · PHASE_HISTORY.md · PHASE_19_PLAN.md (§5 row) · SYSTEM_IMPACT_MAP.md (display-context stamp gains an xStock entry-liquidity source — folded into the exploration-batches SIM banner). SYSTEM_MANUAL: N/A (display plumbing). RUNNING_ISSUES: #561 marked resolved-pending-xStock-render-verify.

## Alerts dispositioned
`68dab926` (docgap) → RESOLVED by this report + the pre-audit. `d52d5847` (under-declared class) → RESOLVED: non_architecture reconciled in the pre-audit (display-only despite the signal-orchestrator touch; Langston-approved). Both re-routed to owner CC-C per the 2026-07-28 crew correction.
