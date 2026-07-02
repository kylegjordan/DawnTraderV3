# P19-B7.2d Pre-Audit (#434 — xStock VTS lane wiring)

**Step-2, CC-B, 2026-07-03.** Scope: `P19_B7_2d_SCOPE.md` (Langston Step-1 PROCEED).

## Q1 (the load-bearing question) — ANSWERED: YES, shared registry

`eval-cycle.ts` opens via `registerOpenVtsTrade(xOpenTrade)` (`vts-runner.ts:3902`), which (a) persists through the SAME `insertOpenTrade` (vts-trade-persistence) and (b) registers into the SAME `openVirtualTrades` Map (`:4013`) the crypto lane uses. **Therefore the entire B7.2c lifecycle — resolve pre-pass (fill/drop), R3 weekend guard (already xStock-aware), never-filled records, twin close short-circuit, rehydrate — covers xStock trades with ZERO new resolve code.** The batch touches ONLY the open seam. (Precedent: this is the same B-NEW-22 / Obj-15a pattern — xStock passes fewer fields into the shared register and gets shared machinery for free.)

## The seam plan (blast radius = 2 files + tests)

1. **`eval-cycle.ts` (~:700-985):** after the kernel result and BEFORE the `:716` Net-EV floor — run the shared `decideMakerTaker` (per-class friction via `getFrictionForAssetClass('xstock_spot')`, costs from the existing `getCachedCostMetrics(symbol, 'xstock_spot')` call at `:695`, canonical strategy via `normalizeStrategy`, urgency family from the strategy key); the floor gates on `chosenNetEV` (B7.2b crypto placement, exact). Marketable-at-placement check for a maker choice (`isMarketableAtPlacement` vs the current price) → stored-taker fallback or skip (`maker_marketable_dropped` counter). Pass onto `xOpenTrade`: `chosenEntryMode`, `entryFeeRate` (per mode), and for pending: `state:'pending'`, `makerLimitPrice`, `makerDeadline` (via `resolveMakerMaxPendingMs('xstock_spot')` — seeded 1h).
2. **`vts-runner.ts registerOpenVtsTrade`:** widen `RegisterOpenVtsTradeInput` + the `openTrade` construction to pass through `chosenEntryMode`/`entryFeeRate`/`state`/`makerLimitPrice`/`makerDeadline` (today they're absent → undefined → the B7.2b/c fields default). **Twin creation: EXTRACT the crypto lane's inline twin block (`:2089-2130`) into a shared `maybeOpenTwin(chosenTrade, decision, class)` helper called by BOTH lanes** — parity by construction, no transcription drift (the B7.2c pure-module lesson applied to the twin block).
3. **SIM reads done:** eval-cycle component (B79.0m.b2 xStock VTS lane; the register seam documented at B-NEW-22/Obj-15a); the Cross-Cutting registry's B7.2c callout (twin predicate discipline — the shared helper preserves it); no singleton added/removed.

## Invariants
- Legacy rows stay dashed (no backfill — dash-by-design for pre-wiring history).
- Economics unchanged for taker-chosen trades (kernel already taker-priced); maker-chosen = the NEW option (expect a volume tick-up as maker-marginal signals pass — the B7.2b crypto effect, called out not regressed).
- `twin_enabled`/`maker_max_pending_ms` already seeded for xstock_spot (B7.2c migration, verified live at its Step-7) — NO new migration.
- The `dispatchXstockActiveSignal` active-path fork (`:955`) is untouched (active path already has its own B7.2b/c wiring).

## Tests
Unit: the seam decision (floor on chosenNetEV; stamp correctness per mode); pending bifurcation fields; the shared `maybeOpenTwin` helper (both-lane parity + degenerate skips + kill-knob) — mirroring the B7.2c test shapes.
