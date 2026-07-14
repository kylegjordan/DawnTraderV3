# P19-B8.5c — Step-2 PRE-AUDIT (#503)

**Owner:** CC-B · **Date:** 2026-07-14 · **Scope:** `P19_B8_5c_SCOPE.md` (Langston Step-1 PROCEED, with one design question + two conditions — all answered below)

## 1. THE DESIGN ANSWER (Langston's question: why keep two computation sites?) — WE DON'T. DELETE BOTH STANDALONE CALLS.
Your instinct is the right cut, and the enabling fact is verified: `decideMakerTaker` RETURNS the full taker-leg kernel result — `taker: NetExpectancyKernelResult` (`maker-taker-decision.ts:144/:282`) carrying `netEV, rawEV, netRewardToRisk, totalCost, pWin, distTarget, distStop`. That is the COMPLETE decomposition every enumerated consumer needs — there is no friction breakdown the standalone call exposes that the decision doesn't. So OBJ-1/OBJ-3 collapse into one move: **DELETE both standalone `computeNetExpectancyKernel` calls (rule 18, inline code-path removal, DELETED_COMPONENTS_LOG entry) and re-point every consumer to `decision.taker.*`.** One computation site; the drift class dies structurally (nothing to keep in lockstep, no comment to keep true, no parity invariant to babysit). Ordering verified: in BOTH lanes the decision precedes every consumer (crypto: decision `:1712` before `:1759/:2187`; xstock: decision `:763` before `:825/:1039/:1073/:1074/:1139`), and the decision does not consume `kernelResult` — clean deletion.

## 2. OBJ-2 ENUMERATION — grep-proven exhaustive (`grep -n kernelResult` both lanes, full token set shown; nothing else in the repo constructs from these call sites)

**crypto `server/services/vts-runner.ts`:**
| Line | Read | Disposition |
|---|---|---|
| :1682 | the standalone call | **DELETE** |
| :1707 | comment claiming `decision.takerNetEV == kernelResult.netEV` (false today) | **DELETE with the call** (nothing left to assert) |
| :1759 | `[18L]` skip log — `taker=`, `rawEV=`, `friction=` | re-point → `decision.taker.netEV / .rawEV / .totalCost` (friction now printed in DOLLARS — honest; log-only) |
| :2187 | `netEV: kernelResult.netEV` attached to the returned signal (feeds the caller-side Batch-26 floor guard ~`:3746`) | re-point → **`_vtsMtDecision.chosenNetEV`** — the SAME number the lane's own floor gated (single-consistent-number); the caller-side guard becomes a consistent re-check of the identical value, never a second opinion |

**xstock `server/asset_classes/xstock_spot/eval-cycle.ts`:**
| Line | Read | Disposition |
|---|---|---|
| :731/:733 | the standalone call (+ its try/catch) | **DELETE** (the decision call gets the equivalent try/catch → reject-on-throw parity) |
| :756 | comment claiming input identity | **DELETE with the call** |
| :825 | reject-row `takerNetEv` | re-point → `_xMtDecision.taker.netEV` (honest dollars; field name unchanged) |
| :1039 | admit gateDecision `takerNetEv` | same re-point |
| :1073 | archived `expectedEdge` | re-point → `_xMtDecision.taker.netEV` |
| :1074 | archived `netRewardToRisk` | re-point → `_xMtDecision.taker.netRewardToRisk` |
| :1139 | open log `netEV=` | re-point → `_xMtDecision.chosenNetEV` (log the number the gate used) |

**Deliberately NOT converted (fraction is CORRECT there — the two legitimate fraction consumers):**
- `checkPreOpenGates` (`vts-runner.ts:3805`, xstock call `eval-cycle.ts:840`): expects a RATE — `:3829 minViableDistance = frictionCost * currentPrice * 2` multiplies by price itself. Untouched.
- Payload RATE fields (`frictionCost: totalFriction` `eval-cycle.ts:980`, `totalFriction` `:847` pass-through, crypto `:1665 frictionCost`): rates by semantics, honestly labeled. Untouched. The local fraction variable SURVIVES for exactly these consumers.

## 3. Langston condition 2 — parity fixture at BOTH price regimes
The unit test pins the decision's taker leg against hand-computed dollar expectations at **entryPrice $0.50** (the sub-$1 over-penalty case that raised crypto admits) AND **entryPrice $900** (the >$1 under-penalty case that collapsed xstock admits), same fraction inputs — asserting friction lands as `fraction × entryPrice` in the kernel and `netEV` responds with the right sign/magnitude in each regime. (With the standalone calls deleted there is no two-site parity left to test — this tests the ONE site's units at both regimes.)

## 4. Langston point 1 — the exceptions row lands proactively
At Step-3 push, `GOVERNANCE_EXCEPTIONS.md` gains: `class-override | declared:non_architecture heuristic:architecture | langston` for `P19-B8.5c`, citing his Step-1 pre-blessing verbatim ("bringing the standalone call TO the already-documented price-unit contract, not changing the contract") — the vts-runner/eval-cycle paths will trip the core-engine heuristic exactly as B8.4c did. SysManual N/A (no contract change); SIM gets the archiver/consumer note (Step-10 list, unchanged).

## 5. Blast radius (SIM read)
Both files are SIM-mapped VTS-lane components; the deleted calls have zero external callers (lane-local `const`s); the decision object is already constructed on both lanes (B7.2b/d) — no new dependency, no new state, no schema change, NO migration. Gates behaviorally unchanged (they already read `chosenNetEV`): the admit-rate invariance check in the scope proves it post-deploy. Active path untouched. Rollback = revert one commit.

## 6. Cohort boundary (OBJ-4, unchanged from scope)
Three regimes stamped in CHANGES_AND_FIXES + MULTI_ASSET working list + #206/#501 notes: (a) pre-2026-07-01/03 mis-scaled SELECTED+RECORDED; (b) →this deploy honest-gate/mis-scaled-telemetry; (c) post-deploy honest both. Affected recorded fields: xstock `expectedEdge`, `netRewardToRisk`, `takerNetEv`; crypto attached `signal.netEV`. No rewrite.
