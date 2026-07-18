# P19-B8.7 Step-9 — COMPLETION REPORT
**The shared-trade-tables final piece + the Kyle RTB round + three rule-23 finds + the #530 pattern-lane revival**

**Author:** NEW Claude (CC-B) · 2026-07-17/18 · **Code head `a8dc548de`** (CI 4-green run `29584172931`; deployed 13:31Z, restart #502, engine self-resumed) · governance commit = the commit carrying this report.
**Reviews:** Langston Step-1/2 (layout map + rulings, 2026-07-16/17) · Step-4 **GO on the definitive push set** (after a three-round citation-discipline iteration — two stale-paste blockers he raised were both legitimate, owned, and resolved via object-hash verification; adapter blob `2b8a68c4b6302a496859d9ad17c8b5bd961d4543` byte-identity confirmed at the ref post-push) · Step-8 **runtime half PASS** (independent at-ref: deploy-at-graded-ref, restart#502, health; governance half = this commit, his closing pass requested).

---

## PREVIOUSLY STATED vs NOW (§9.2 — every claim corrected during the batch)

1. **PREVIOUSLY:** the DBS pattern-pool fix was "capture-only" (display snapshot). **NOW:** it is BEHAVIORAL — the orchestrator's pattern loop feeds the MCE's B63 hard contract FROM the pool entry, so the fix un-suppressed the entire pattern-pool signal lane (#530). REASON: the Step-4 description was written before the Kyle-ordered review traced the consumption path.
2. **PREVIOUSLY:** "VTS-side cost-split = a small API serialization task." **NOW:** it required CAPTURE of the friction components at open (only the blend was persisted). REASON: pre-piece estimate assumed the components existed on the record.
3. **PREVIOUSLY (early speculation):** USDT/GBP lacked DBS "because stablecoin crosses are excluded." **NOW:** both NULL rows (ONDO/USD + USDT/GBP) were the SAME defect — the pool-intake transit gap. Kyle's "DBS existed and was lost in transit" hypothesis was exactly right.
4. **PREVIOUSLY:** "VTS mounts render unchanged." **NOW (Langston-required phrasing):** the VTS tables gain the Kyle-ruled shared columns (cost 5-col + Exit Fee Mode) — a shared-column change, NOT paper-affordance leakage; the paper-only affordances are default-OFF props the VTS mounts don't pass.
5. **PREVIOUSLY (my message to Langston):** the xstock blend spread was "the live measured lane spread." **NOW:** it was `const spread = 0.001` — hardcoded, and CRYPTO's constant. Owned in supplement §5; the rule-23 fix replaced it with `costMetrics.spread` (genuinely measured-with-fallback).

## Objectives — verdicts

| Objective | Verdict | Evidence |
|---|---|---|
| Paper open/closed tabs mount the SHARED VTS tables via a pure adapter (Langston ruling B, conditions 1+2) | **YES** | `paper-trade-adapter.ts` (13 tests: wire-format parity, no-fabrication, #525 fence) + `paper-open-trades-tab.tsx` + `trade-history-tab.tsx` rewire; both mount sites in the Step-4 diff; §9.3 Chrome pass 14 paper rows / 91 VTS rows |
| Frozen symbol column + header row on paper tables (Kyle) | **YES** | By construction (B-NEW-31 sticky on the shared tables); verified by deep horizontal scroll on staging |
| Cost 5-col split, all tables, honest | **YES** | Paper = real fee/slip fields; VTS = components captured at open (both crypto sites + xstock passthrough, context jsonb, no migration); spread half-per-slip-leg sums EXACTLY to the total; pre-capture rows em-dash; **NO BACKFILL ever** (Langston-ratified) |
| Exit Fee Mode column (B8.6 stamps) on closed tables | **YES** | Rendering "TAKER"/"MAKER" + rest-outcome on staging |
| Kyle RTB round: alignment / S.Wgt / Duration | **YES** | Header-cell alignment fixed (the rebuild had reordered headers only); S.Wgt column removed — the L9/L10 machinery kill-or-keep = **#529, its own batch immediately BEFORE #522 (Kyle-sequenced)**; Duration (queue age) live |
| #527 xstock component wiring (Langston condition) | **YES — discharged in-push** | eval-cycle passes the three fractions; reconciliation exact |
| #528 active-trades-v2.tsx rule-18 delete | **YES — executed** | Trigger (OLD Claude's push) fired; archived `.removed`; DELETED_COMPONENTS_LOG quotes `FEE_PERCENT = 0.0010` / `SLIPPAGE_PERCENT = 0.0015` verbatim; zero importers proven |
| B8.9 carry obligation (venue-quiet display) | **YES — discharged** | Shared tables + RTB consume the server `priceVenueQuiet` boolean; mixed-ordering render defined (undefined→NOT-quiet) — Langston item-2 confirmed |
| Kyle-ordered pattern-path code+SIM review | **YES — completed, headline finding** | See #530 below |

## The three rule-23 fix-on-finds (each fixed at the find, Langston-reviewed)

1. **Fantasy-fee client recompute** — the deleted paper table recomputed P/L on every WS tick with hardcoded 0.10%/0.15% constants ("same as backend" — false). Deleted with the file; server-authoritative + 3s-throttled invalidation.
2. **xStock hardcoded spread** — crypto's 0.001 constant in the xstock VTS blend, below xStock's own 0.0012 default, overriding available measured spread. Now `costMetrics.spread`. **Behavioral:** xStock VTS friction rises ≥2bps → Net-EV admission tightens (telemetry-only). SysManual Ch5 + SIM notes landed (Langston governance flag discharged).
3. **Pattern-pool DBS/DI transit gap → #530 THE PATTERN-LANE REVIVAL.** Full chain in RUNNING_ISSUES #530 + SysManual (new pattern-lane section): intake dropped the scanner's computed DBS → MCE B63 hard contract threw → per-symbol catch swallowed → the pattern-pool signal loop generated ZERO signals since B63 landed. Live proof: 592 swallowed violations on 07-17, **zero post-deploy**; post-fix queue rows all carry DBS (DB-verified: zero NULL rows). Admission gates unchanged (SQE Net-Expectancy, exploration budget, slot cap, sizing rails). VTS lanes verified clean (pair-object DBS; zero non-orchestrator throws). **Langston ruling on keep-live-vs-gate: pending at his closing pass; my recommendation keep-live is on record.** Residual: the swallowed-hard-contract catch-site audit → **#522**.

## Watch items (not normalized)

- **Memory soft warning** (Langston Step-8): health reports RSS ~468MB vs 350MB threshold — soft, engine healthy; watch across the soak, escalate if it trends.
- **Revived pattern lane**: first pattern-pool-originated signals under observation; exploration budget + EV gate hold the risk envelope.
- **#524** Saturday 2026-07-19 engine-halt drill (scheduled alert armed).

## Governance files changed (this batch)

`BATCH_CATALOG.md` (Step-9 row) · `PHASE_HISTORY.md` (shipped paragraph) · `PHASE_19_PLAN.md` (§5 decision-log row) · `SYSTEM_IMPACT_MAP.md` (★ Step-9 banner: UI re-key + cost capture + #530 + RTB) · `SYSTEM_MANUAL.md` (Ch5 Round-Trip Cost note + NEW pattern-lane DBS-transit section) · `RUNNING_ISSUES.md` (#527 discharged, #528 executed, #529 filed+sequenced, #530 filed-resolved) · `DELETED_COMPONENTS_LOG.md` (#528 entry w/ verbatim constants) · MEMORY (CC-B volatile) · this report.

## Sync gate
Code head `a8dc548de` pushed + CI 4-green + deployed; governance commit carries this report; both `git rev-list` directions to be 0 at the governance push (verified in the close message).
