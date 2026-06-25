# B-DIAG-387 — Completion Report (#387)

**xStock filter-diagnostics Net-EV-floor reject counter fix**
change-class: non_architecture (observability/display) · Phase 19 · CC-B + Langston
**Closed 2026-06-25** · Staging `1c451f5b5` restart#416 · CI 4-green `28161070581` · no migration

---

## Scope objectives

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | xStock `rejectedReasons.netEvBelowFloor` reports the true count (the reorg-B7 baseline instrument) | ✅ YES | Endpoint now sources from `lt.nullReasonAggregate['net_ev_rejected']`, written at the single reject site `eval-cycle.ts:716`. **EXACT cross-check: live endpoint `netEvBelowFloor` == `signal_eval_archive` `net_ev_below_floor` (xstock_spot, reject_stage='sqe') over the matched since-restart window = 25 == 25.** Per-pool columns populate (`quantNullReasonDetail.net_ev_rejected` live). Was hard-0 before. |
| OBJ-2 | Surface the 3 previously-invisible pre-open/TCL gate reasons (no-hidden-gates) | ✅ YES | `reentry_cooldown`/`price_past_stop`/`price_past_target` now in the endpoint's structured `nullReasons` (`reentryCooldown`/`pricePastStop`/`pricePastTarget`) + 3 new panel rows in Section 2; per-lane write added at the pre-open reject site so Quant/Pattern columns are accurate. Keys present + 0 in the live smoke check (low-frequency; will populate as those conditions occur). |
| §18 | Remove the dead "reference shape" scaffolding that caused #386 | ✅ YES | Excised `byStrategy`/`totalEvaluated`/`totalNulls`/`totalSignals`/`totalRejected`/`totalTrades`/`byReason`/`byRegime` locals + the always-empty `signalRejections` response field; all consumption now from `lt`/`ec`/`live`. Client type relaxed to optional. DELETED_COMPONENTS_LOG entry landed. Live smoke check: `signalRejections field present? False`. |

## Langston's 4 Step-4 conditions — all met
1. **Dead-scaffold fully excised** (not left as always-empty fallbacks) — done; DELETED_COMPONENTS_LOG B-DIAG-387.
2. **Single in-memory key** `net_ev_rejected` across combined + both per-lane aggregates; cross-layer mapping to the archive's `net_ev_below_floor` guard-commented at producer + consumer. The test's `does NOT read the archive key` case is the regression guard.
3. **Single reject site** confirmed (`netEV <= VTS_NET_EV_FLOOR` at `eval-cycle.ts:716`, `continue` on reject) → 1:1 with the archive insert in the same branch → makes the exact cross-check valid.
4. **15% band replaced with an EXACT check** (lifetime-accumulator count vs archive count since the same process-start) → 25 == 25.

## Verification
- **Bench (§7.1):** tsc baseline gate OK (no regressions above baseline); vitest new test 5/5 + 30 adjacent xStock/reorg tests green.
- **CI:** all 4 jobs green on `1c451f5b5` (run `28161070581`).
- **Staging:** deployed restart#416; endpoint smoke check confirms `rejectedReasons.netEvBelowFloor` non-zero + the 3 pre-open keys present + `signalRejections` field gone.
- **Decisive proof:** endpoint == `signal_eval_archive` = 25 == 25 (exact, matched window).
- **Langston Step-1/2 + Step-4 APPROVED** (Discord). Step-8 = independent second-pass (his assigned panel eyeball: Net-EV row renders the real number + Section-1 Setup-Nulls total not inflated by `net_ev_rejected`).
- **UI (§9.3):** staging ML page navigated via Claude-in-Chrome (logged-in, renders cleanly). The specific per-row visual confirmation is Langston's Step-8 item; the exact endpoint↔archive data match is the decisive proof of correctness.

## Files changed (code)
- `server/asset_classes/xstock_spot/eval-cycle.ts` — counter writes at the net-EV reject site (OBJ-1) + per-lane at the pre-open reject site (OBJ-2). No control-flow change.
- `server/routes.ts` — endpoint surfacing (OBJ-1 + OBJ-2) + dead-scaffold removal (§18). xStock endpoint only.
- `client/src/pages/machine-learning.tsx` — 3 pre-open panel rows (OBJ-2) + `signalRejections` type relaxed to optional.
- `server/tests/unit/b-diag-387-xstock-reject-counters.test.ts` — NEW (5 tests, key-contract regression guard).

## Governance files changed
- `1-system-manual/RUNNING_ISSUES.md` — #387 RESOLVED (#386 already retracted referencing this fix).
- `1-system-manual/DELETED_COMPONENTS_LOG.md` — B-DIAG-387 dead-scaffold entry (§18).
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — `/api/xstocks/filter-diagnostics` content update + "If I Change X" regression-guard line.
- `1-system-manual/BATCH_CATALOG.md` — B-DIAG-387 row.
- `1-system-manual/PHASE_HISTORY.md` — plain-language entry.
- `1-system-manual/PHASE_19_PLAN.md` — §1 status-board row + §5 decision-log entry.
- `Claude Comms and Packages/Scope Files/B_DIAG_387_SCOPE.md` + `Change Lists/B_DIAG_387_CHANGE_LIST.md`.
- MEMORY_CC_B.md (truth + repo mirror) + Langston `/home/langston/MEMORY.md` (§10.b).
- **System Manual: N/A** — no architecture/strategy/regime/filter/signal-pipeline/math change (counter/display fix). Applicability judged explicitly per §9.

## Notes
- 🚨 **NOT a behavioral change.** No gate decision, strategy, regime, signal-pipeline, or EV math changed — only telemetry counters, their endpoint surfacing, and panel rendering. The trade-selection behavior is byte-identical.
- The fix discharges the instrument #385 relies on: the reorg-B7 maker/taker baseline is now readable + trustworthy on the dashboard (matches the durable archive).
