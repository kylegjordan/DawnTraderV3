# P19 reorg-B4 — Completion Report

**Batch:** P19 reorg-B4 — shadow-trade telemetry layer (selection-quality data engine)
**change-class:** architecture
**Owner:** NEW Claude (CC-B) · reviewed by Langston
**Date closed:** 2026-06-25
**Deploy:** staging `f3cbe2d14` restart#418 · CI 4-green run `28201765444` · migration `2026-06-25-p19-reorg-b4-shadow-pairings.sql` applied

---

> 🚨 **THIS BATCH DOES NOT PRODUCE ANY LIVE SHADOW DATA YET. The shadow-trade layer is WIRED, PROVEN CORRECT, AND DORMANT until paper-mode active trading is turned back on (~B9).** `rtb_total=0` today (the RTB pool is empty because active trading is OFF), so the promotion boundary that opens shadows never fires → `rtb_shadow_pairings` stays at 0 rows. This is the §9.1 forward-instrumentation state by design — the layer "lights up" at paper-active turn-on. The behavioral proof for this batch is the 22/22 unit suite (there are legitimately no live rows to inspect). Two hardening items (#388/#389) are scheduled to that B9 turn-on moment.

---

## What it is

The system's edge is **selection** (CLAUDE.md §0): each promotion cycle the ranker promotes the top-`openSlots` of the ready-to-buy pool by FinalScore — but we have never measured whether the promoted picks actually outperformed the alternatives passed over. reorg-B4 builds the telemetry to answer that (it feeds the reorg-B5 ranking fix). For EVERY RTB-pool member each cycle (the promoted picks AND the non-promoted alternatives) it opens a counterfactual "shadow" trade, prices it through the SAME exit engine real trades use, and records the decision-time ranking inputs + the realized outcome into a new isolated sink. It produces NO trade and NO learning signal.

## Objectives (scope checklist)

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Open a shadow per RTB-pool member each cycle into a **separate** `openShadowTrades` Map (segregated from `openVirtualTrades`), drained by a sibling resolver that reuses the exit math | ✅ YES | `registerOpenShadowTrade` + `resolveOpenShadowTrades` in `vts-runner.ts`; capture hook in `getRankedSignals` (`ready_to_buy_service.ts`); SIM registry **S19**; resolver calls the SAME `evaluateTECExit` (drift-guard test). |
| OBJ-2 | Persist the decision-time scored-pool snapshot + realized outcome to ONE table no learning consumer reads | ✅ YES | NEW `rtb_shadow_pairings` (`shared/schema.ts` + migration + 3 indexes); decision-time ranking inputs at open, outcome at close; writer `rtb-shadow-store.ts`. Live: table exists, row_count=0 (dormant). |
| OBJ-3 | Prove isolation — active path byte-identical + VTS-learning byte-identical (open + closed side) | ✅ YES | Separate Map (open side); allowlist `shadowClose` (closed side); shared `VTS_OPEN_TRADES_EXCLUDE_SHADOW` predicate on every non-shadow `vts_open_trades` read; rehydration split. 22/22 tests incl. 2 behavioral (shadow absent from the ablation feed; dedupe round-trip) + the exit-math drift guard. |

## Exit-math reuse (Kyle's drift question)

The shadow resolver calls the **same `evaluateTECExit` service** the real VTS resolver uses — not a copy. A change to the exit math is auto-applied to shadows. The only shadow-specific differences are parameters/actions: `maxHoldMs = SHADOW_MAX_HOLD_MS` (6h vs 7d) and the close action (`shadowClose` vs the real cascade). A unit test pins that the shadow resolver calls `evaluateTECExit` with `maxHoldMs: SHADOW_MAX_HOLD_MS` and does not re-implement stop/target locally — it fails if anyone forks the math.

## Isolation (by-construction, 4 layers)

1. **Open side:** shadows live in a SEPARATE `openShadowTrades` Map (S19) — no cap / dedupe / lane / getStats / ranking reader of the live `openVirtualTrades` sees them.
2. **Closed side:** `shadowClose` is an ALLOWLIST — writes ONLY `rtb_shadow_pairings` + the shadow's own `vts_open_trades` backing row + `clearTrailingState`; NEVER `outcomeFeedbackStore.updateEma` / `telemetry.recordPairTelemetry` / `updateRollingAverages` / `persistRealPriceTrade` / the exit-decision archive / `paper_sim_trades`.
3. **Shared-table reads:** shadow rows also persist into the shared `vts_open_trades` (`context.shadow=true`); every non-shadow read excludes them via the single shared `VTS_OPEN_TRADES_EXCLUDE_SHADOW` predicate (`vts-trade-persistence.ts`), applied at the factor-replay/ablation learning feed (`factor-replay-core.ts`), the xStock 24h count (`routes.ts`), and the bootstrap boot-gate count.
4. **Restart:** boot rehydration routes `context.shadow===true` rows back into `openShadowTrades` (strict `===true` → fail-safe to live for legacy rows).

**Population bound:** `(mode,signalId)` dedupe via one `shadowDedupeKey` helper at open/rehydrate/close (~pool-size), `SHADOW_CAP=10000` (reject-new + drop-counter + alert), 6h TTL.

## Langston review trail

- **Step-1/2:** scope + pre-audit APPROVED to Step-3 (separate-Map design, allowlist close, ONE no-reader table; the 3 cap/TTL firmings + the closed-side-segregation hard-check).
- **Step-4 (the substantive round):** Langston byte-verified the full 1413-line diff and found one **LOAD-BEARING** gap the original isolation proof missed — **persisted-table reader contamination**: shadow rows are real rows in the shared `vts_open_trades` table, and three table-scan readers (the factor-replay/ablation learning feed foremost, the xStock 24h count, the bootstrap gate) didn't exclude them. **Closed this batch** with the single shared `VTS_OPEN_TRADES_EXCLUDE_SHADOW` predicate + 2 BEHAVIORAL tests (a seeded shadow is ABSENT from the ablation feed output via an emitted-SQL-keyed mock; the dedupe key survives a persist→rehydrate round-trip). Also landed this batch: the `shadowDedupeKey` extraction (byte-identical keys at all 3 sites) + the `promoted` column-comment. Two items scheduled to B9 (#388 rehydration fail-direction, #389 capture-path guard).
- **Step-8:** independently verified on staging via two SSH paths — table shape (36 cols) + 3 indexes + pkey, `count(*)=0` (dormant, correct), HEAD `f3cbe2d14`, restart#418, no shadow/boot errors. PASS.

## Bench / CI / deploy

- tsc baseline: **OK, no regressions** (one introduced TS2352 fixed via `as unknown as OpenVirtualTrade`).
- vitest: reorg-b4 suite **22/22**; `b79-0g-vts-trade-persistence` 12/12 + `b-new-33-factor-replay-core` / `b73-exit-strategy-replay` 35/35 unaffected; full unit suite 1856 pass (3 files ECONNREFUSED-no-Postgres, environmental).
- CI run `28201765444` = **4-green** (TypeScript Check, Test Suite, Build, Docker Build).
- Deploy: staging restart#418, `db:migrate` applied `2026-06-25-p19-reorg-b4-shadow-pairings.sql` ("1 pending → ✓ applied"); HTTP 200; psql confirms `rtb_shadow_pairings` live + 3 indexes + pkey, row_count=0.

## Files changed

`shared/schema.ts` (rtbShadowPairings table+types), NEW `server/services/rtb-shadow-store.ts`, `server/services/vts-runner.ts`, `server/services/vts-trade-persistence.ts`, `server/services/factor-replay-core.ts`, `server/routes.ts`, `server/core/rtb/ready_to_buy_service.ts`, NEW `server/tests/unit/reorg-b4-shadow-isolation.test.ts`, NEW `server/tests/unit/reorg-b4-shadow-table-isolation.test.ts`, `drizzle/migrations/2026-06-25-p19-reorg-b4-shadow-pairings.sql` (+ `-rollback.sql` OUT of git) + `MANIFEST.txt`.

## Governance files changed

- `1-system-manual/RUNNING_ISSUES.md` — reorg-B4 §13 homes: **#388** (rehydration fail-direction) + **#389** (capture-path guard) + cycleKey-per-class + GC-DELETE intentional-reap notes.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — reorg-B4 SHADOW-TRADE TELEMETRY LAYER callout + registry **S19** (`openShadowTrades`) + the GC-DELETE intentional-reap call-out.
- `1-system-manual/SYSTEM_MANUAL.md` — **§19.8** (shadow-trade telemetry layer at the promotion boundary).
- `1-system-manual/BATCH_CATALOG.md` — reorg-B4 entry.
- `1-system-manual/PHASE_HISTORY.md` — plain-language reorg-B4 paragraph.
- `1-system-manual/PHASE_19_PLAN.md` — §1 status row + §5 decision-log entry.
- `Claude Comms and Packages/Change Lists/P19_REORG_B4_CHANGE_LIST.md` (+ scope + pre-audit) · `.claude/memory/MEMORY_CC_B.md` mirror · Langston `/home/langston/MEMORY.md` (10.b).

## Open follow-ups (scheduled, not deferred-vague)

- **#388 (B9):** make `rtb_shadow_pairings` the authoritative shadow identifier on rehydration; quarantine ambiguous rows (never default-into-live); also exclude shadows from the weekend bulk-suspend UPDATE.
- **#389 (B9):** gate `captureShadowPool` behind an explicit `captureShadows:true` arg from `checkRtbPromotion`.
- Backlog (non-blocking, noted in the SIM/change-list): a shared price-fetch helper for `resolveOpenShadowTrades` (or a SIM lockstep note); a dedicated `ShadowTrade` type instead of the shell cast.
- Unrelated (flagged by Langston during Step-8, NOT a reorg-B4 item): the pre-existing `[ML_SERVICE][L8][CALIB_FETCH]` 403 retry loop in error.log wants its own home.

**Status: CLOSED pending Kyle's acknowledgment.**
