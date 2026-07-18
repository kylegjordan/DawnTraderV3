# P19-B8.10 — TRADE-TABLE TRUTHFULNESS: capture the blank columns at genesis, freeze the RTB panes, purge the Phase-8 metrics tables

change-class: architecture

Owner: CC-B (NEW Claude) · Date: 2026-07-18 · Kyle directive round (Desktop, 2026-07-18
evening, after his hard-refresh confirmed the P19-B8.7 Step-9 shared tables render):
RTB freeze panes; delete the pre-Phase-19 tables below the RTB table; fix the blank
Regime / Pool / Edge / Glbl-context columns on the paper Open+Closed tabs; confirm the
pattern sub-label; answer whether Rank is the ranking score; move Slot next to Symbol;
remove the Regime Wt column (closed); explain the perpetual "pending" under Glbl DBS.
Entry-slip correctness is EXCLUDED — Kyle handed that investigation to OLD Claude
(Discord dispatch id 1528114437041426653).

## Step-2-grade findings already in hand (code + DB verified, rule 24 discipline)

- **Capture gaps, not display bugs.** The shared VTS tables + `paper-trade-adapter.ts`
  are correctly wired; the active path simply never captures: `regime`, pool (I/R),
  `expectedEdge`, `globalRegime`, `pairFriction`, `globalFriction`, pair DBS, global
  DBS, closed-row entry-liquidity. Verified against a live `active_open_positions`
  metadata row (Supabase, 2026-07-18): none of those keys exist in the jsonb.
- **Rank cell shows a legacy score.** `queueSQESignal` enrich
  (`ready_to_buy_service.ts:2360`) stamps `rankingScore: input.rankingScore ??
  finalScore` — and the orchestrator NEVER passes `rankingScore`
  (`signal-orchestrator.ts:930-989` literal), so every row's "Rank" is the RETIRED
  finalScore via a silent fallback (DB rows: rankingScore 0.688/0.651 ≈ finalScore
  family; the LIVE promote ranker `getRankedSignals` ranks by the B7.1 R-multiple,
  which is a DIFFERENT number never persisted).
- **Dead legacy ranker.** `getTopSignal` + `checkForPromotion`
  (`ready_to_buy_service.ts:1424-1866`) have ZERO live callers (engine promotes via
  `getRankedSignals`, `active-execution-engine.ts:2114`). They carry the
  finalScore-fallback + FINAL_SCORE_GAP_OVERRIDE logic. Rule-18 deletion candidates.
- **patternType dropped in transit — the #530 shape again.** Pattern signals carry
  their pattern name at genesis (`signal-orchestrator.ts:1811/1829`); the engine reads
  `sigMeta.patternType` at open (`active-execution-engine.ts:2925`) — but the
  orchestrator metadata literal + queue enrich never include it, so `pattern_type` is
  NULL on every position (DB-verified, including signalType=PATTERN rows).
- **"pending" is a hardcoded placeholder string**, not a state:
  `vts-open-trades-table.tsx:419` + `vts-closed-trades-table.tsx:426` render
  `globalDirectionalBias || "pending"`.
- **regimeWeight 0.5 + strategyWeight 0.2 are constants on every row** (DB-verified) —
  the #529 B-STRATEGY-WEIGHT-INVESTIGATION family; NOT fixed here (Kyle sequenced #529
  immediately before the #522 runtime audit).
- **Pool (I/R)** = the VTS-only ideal-vs-rotational pair-pool marker
  (`vts-runner.ts:530/639`). The active path has no such axis (its pool notion is the
  quant/pattern SOURCE pool, already shown in Source Pool).

## Objectives

1. **OBJ-1 — RTB freeze panes.** Ready-to-Buy table: sticky header row + sticky
   leftmost Rank and Symbol columns (same treatment as the VTS/paper trade tables).

2. **OBJ-2 — Rule-18 purge of the Phase-8 metrics tables under the RTB table.**
   `ExecutionMetricsPanel` (Phase 8.8.3-I4, plus the Phase 8.8.4-A SLAL section) and
   the never-mounted `ExecutionMetricsCompact` are removed from BOTH Ready tabs
   (paper + live) and the component deleted per rule 18 (archive + `.removed` +
   DELETED_COMPONENTS_LOG). Server side: delete the `/api/diagnostics/signal-lifecycle`
   endpoint + SLAL service chain IF the panel is the sole consumer (pre-audit
   enumerates); the `/api/diagnostics/rtb-metrics` endpoint + rtb-metrics-service are
   KEPT (reorg-B3 EV-reject telemetry has non-UI consumers) unless the pre-audit proves
   otherwise.

3. **OBJ-3 — Slot column to position 2 on the paper Open Trades table.** Shared open
   table gains an after-symbol insertion affordance (default OFF — VTS mount
   unchanged); the paper shell moves its Slot cell there.

4. **OBJ-4 — Signal-genesis capture of the blank columns (the heart of the batch).**
   Widen the orchestrator's queue metadata literal (KEEP-AS-DATA transit, #405/#530
   pattern) with values verified AVAILABLE at that point in the pipeline: `regime`,
   `globalRegime`, `pairFriction`, `globalFriction`, pair DBS (score + category),
   global DBS (score + category), `expectedEdge`, `patternType`, and entry-liquidity
   (value + kind, so closed rows keep it after the open row is gone). Per-field source
   verification in the pre-audit; a field with NO honest source at genesis stays
   ABSENT (em-dash), never fabricated. Engine + queue enrich pass the keys through
   untouched; the adapter already reads them. NO gate/ranking behavior change — these
   are capture-and-display stamps.

5. **OBJ-5 — Rank column honesty.** (a) Stamp the promote-time B7.1 R-multiple onto
   the position at open (`rankAtPromote` — the number that actually won the slot);
   the open-table Rank column reads it (header renamed to match RTB's "RankingScore").
   (b) Remove the `?? finalScore` fallback in the queue enrich — absent stays absent
   (#525 retired-metric fence). (c) Rule-18 delete the dead `getTopSignal` +
   `checkForPromotion` pair.

6. **OBJ-6 — Kill the "pending" placeholder.** Both VTS tables render an honest
   em-dash when global DBS is absent, same as every other absent cell.

7. **OBJ-7 — Remove the Regime Wt column from the closed-trades table** (Kyle). The
   0.5-constant finding is recorded as a #529 rider, not fixed here.

## Non-goals
No ranking/gate/sizing behavior changes (OBJ-5a stamps a value already computed at
promote). No strategy/regime weight fixes (#529). No entry-slip work (OLD Claude
owns it). No backfill of historical rows — new opens carry the new stamps; old rows
keep honest em-dashes (the Langston-ratified no-backfill posture).

## Verification (§9.3)
Staging UI navigated: RTB tab (frozen header + Rank/Symbol while h-scrolling; no
metrics tables below), paper Open Trades (Slot second; on a NEWLY-opened position:
regime badge populated, pattern name under PATTERN, Rank = the promote R-multiple,
Edge/Glbl columns populated or honestly absent), paper Closed Trades (no Regime Wt
column; no "pending"; entry-liquidity on newly-closed rows). CI 4-green; Langston
Step-4 pre-push + Step-8 second pass.
