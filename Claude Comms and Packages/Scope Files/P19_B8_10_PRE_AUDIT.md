# P19-B8.10 — Step-2 Pre-Implementation Audit

Owner: CC-B · 2026-07-18 · Companion to `P19_B8_10_SCOPE.md` (bc0ad5951).
SIM sections read: signal-orchestrator, RTB service, active-execution-engine,
MCE/DBS cross-cutting registry, VTS runner, Discord/display shared components
(the ★ Step-9 banner). System Manual: Ch5 (cost model), the new "Active
Pattern-Pool Lane: DBS Transit Contract" section (Step-9), Ch on signal pipeline.

## A. OBJ-4 per-field source map — where each captured value comes from at genesis

The capture point is the orchestrator's queue metadata literal
(`signal-orchestrator.ts:978-989`, inside `buildSizedSignalForStrategy`). The rule:
mirror the VTS field SEMANTICS (vts-runner.ts:2040-2058 is the reference) using the
SAME shared helpers wherever they exist; a field with no honest in-scope source is
threaded from the dispatch pipe or stays absent. NO fabrication; NO behavior change
(these keys are read by nothing on the decision path — verified: the engine reads
only `sigMeta.patternType` (:2925) and spreads the rest opaquely (:2278-2289)).

| Field | VTS source (reference) | Active-path source at genesis | Availability |
|---|---|---|---|
| regime | `trade.regime` | NOT in scope inside buildSizedSignalForStrategy (maker/taker context already passes `regime: null` — :~700). THREAD from the dispatch pipes via `SizingContext.regime` (crypto pipe = MCE per-symbol regime; pattern loop :1816 = pool entry's regime if stamped, else absent; xstock pipe = its eval-cycle regime) | Thread (typed, optional) |
| globalRegime | `getTelemetryAggregator().getDominantRegimeForClass(class)?.regime` (vts-runner:2043-2045) | SAME helper, callable in-function with `sizingContext.assetClass` | Direct |
| pairFriction | `getCachedCostMetrics(symbol, class)` → `min(((fee*2+slip*2+spread)*10000)/3, 100)` (vts-runner:2046-2052) | SAME helper + same formula (extract the tiny formula into a shared fn so the two paths cannot drift) | Direct |
| globalFriction | `getGlobalFriction(class)` (vts-runner:2053) | SAME helper | Direct |
| pairDirectionalBias (+score) | `mceContext.directionalBias` category+score (vts-runner:2054,2057) | `fx5Data.dbsCategory` / `fx5Data.dbsScore` — ALREADY read in-function (the reorg-B3 carry; also feeds di_at_queue/dbs_score_at_queue). Pattern-lane rows carry the propagated pool DBS (the #530 restore) through the same fx5Data read | Direct |
| globalDirectionalBias (+score) | `getLastGlobalDBSCategory/Score(class)` (vts-runner:2055,2058) | SAME helpers | Direct |
| expectedEdge | ⚠️ VTS formula = `finalScore * dynamicTarget - frictionCost` (vts-runner:2019) — a RETIRED-metric (finalScore) formula, Batch-45 era | DO NOT mirror. Active-path Edge column reads the HONEST values already present: `metadata.netExpectedEdge` (refresh-stamped, DB-verified live) with `netEvAtAdmit` as the at-genesis fallback — adapter-side mapping only, NO new capture. Header tooltip states it is net expected edge (post-friction), a deliberately different (more honest) number than the VTS cell | Adapter mapping |
| patternType | first-class VirtualTrade field | `rawSignal.patternType` / `rawSignal.metadata.patternType` — set at pattern-signal genesis (:1811, :1829; hybrid :1693/:2394); dropped today at the queue transit. Add to the metadata literal; engine read at :2925 then finds it (zero engine change) | Direct (transit fix, #530 shape) |
| entryLiquidityValue/Kind | `trade.entryLiquidityValue/Kind` (vts-runner:5560-5561) | `fx5Data.volume24h` (already read; open-row API already serves volume24h) → stamp into metadata as `{entryLiquidityValue, entryLiquidityKind:'volume_qty'}` so CLOSED rows retain it after the open row is deleted (closed_trades gets metadata verbatim, engine :3044) | Direct |
| pool (I/R) | VTS-only ideal/rotational pair-pool axis (vts-runner:530/639) | NO active-path equivalent (its pool axis = quant/pattern SOURCE pool, already displayed). Stays an honest em-dash; header tooltip "VTS pair-pool axis — n/a on active rows" | N/A — no capture |

DB ground truth (Supabase read 2026-07-18, two open rows): metadata carries NONE of
the capture keys today; `pattern_type` NULL on signalType=PATTERN rows; `rankingScore`
0.688/0.651 with `originalFinalScore` 0.666/0.6514 (the finalScore-family value);
`regimeWeight: 0.5` + `strategyWeight: 0.2` constants (→ #529 rider);
`netExpectedEdge` present from refresh (the honest Edge feed).

## B. OBJ-5 Rank honesty — exact edits

1. `ready_to_buy_service.ts:2360` — `rankingScore: input.rankingScore ?? parseFloat(String(input.finalScore || '0'))`
   → `rankingScore: input.rankingScore` (absent stays absent; orchestrator passes
   nothing today — TRUTH: queue-time rows will show no rankingScore, correct).
2. Promote-time stamp: `active-execution-engine.ts` promotion site (getRankedSignals
   consumer, :2114 → the open write :3140-3156): stamp `rankAtPromote` = the B7.1
   R-multiple the ranker computed for the winning signal. The ranker already surfaces
   the per-signal `r` (`ready_to_buy_service.ts:1960`); expose the winner's value on
   the returned signal (typed field or paired map — NOT a behavior change; the sort
   itself is untouched).
3. Adapter Rank read: `rankAtPromote` (fallback: none). Open-table header:
   **"Promote R"** (reconciled to §F.2 per Langston Step-2 — RTB's header is
   literally "RankingScore", so reusing it here would be the same-label/two-numbers
   lie; distinct label + promotion tooltip).
   Shadow-null posture CONFIRMED (Langston Step-2): the fence removal sends the
   three residual metadata.rankingScore readers (dead getTopSignal, the :1891
   control arm, the shadow-pool capture beside predictedRMultiple) to null —
   retired-metric telemetry going honestly absent is the intended outcome.
4. Rule-18 deletion: `getTopSignal` (:1424-1466) + `checkForPromotion` (:1829-1866
   region) — zero live callers (engine :2114 is getRankedSignals; verified via
   repo-wide grep excluding tests/_archive). Also delete `FINAL_SCORE_GAP_OVERRIDE`
   import if it becomes unreferenced. Archive per rule 18 + DELETED_COMPONENTS_LOG.

## C. OBJ-2 purge blast radius (ExecutionMetricsPanel + SLAL)

- UI: `execution-metrics.tsx` imported ONLY by paper-trading.tsx:15 + live-trading.tsx:16
  (repo-wide grep). `ExecutionMetricsCompact` (same file) mounted NOWHERE. Full file
  deletion + the two mount removals.
- `/api/diagnostics/rtb-metrics` (routes.ts:8975) — KEPT: rtb-metrics-service is the
  reorg-B3 EV-reject telemetry (server-side value independent of this panel).
- `/api/diagnostics/signal-lifecycle` (routes.ts:9305) + SLAL service
  (`server/core/audit/signal_lifecycle_audit.ts`): the panel is the SOLE reader.
  Writers are telemetry-only call sites: signal-orchestrator (6), RTB service (3),
  active-execution-engine (3), trade-safety (2 recordValidation), routes (endpoint +
  admin hits). Full rule-18 purge = endpoint + service + all record* call sites.
  ⚠️ LOAD-BEARING EXCEPTION: `signalLifecycleAudit.generateSignalId(...)` MINTS the
  active-path signalId (orchestrator :513) — NOT telemetry. Relocate to a small pure
  util (`server/utils/signal-id.ts`, same format string) BEFORE deleting the service;
  a signalId format change would break downstream joins, so the format is preserved
  byte-identical and pinned by a test.

## D. OBJ-1/3/6/7 display mechanics

- OBJ-1 RTB freeze: same recipe as Step-9 tables — `thead sticky top-0 z-20`; Rank
  + Symbol cells `sticky left-0 / left-[rank-width] z-30 (header) / z-10 (body)` with
  matching backgrounds (the B-NEW-31 pattern). Fixed rank-col width so the second
  sticky offset is stable.
- OBJ-3 Slot-to-position-2: shared open table gains `afterSymbolHeaders` /
  `renderAfterSymbolCells` optional props (default OFF — VTS mount byte-identical);
  paper shell moves Slot there, drops it from the trailing extras.
- OBJ-6: replace the two `|| "pending"` fallbacks (vts-open :419, vts-closed :426)
  with the shared em-dash convention.
- OBJ-7: remove the Regime Wt column from vts-closed-trades-table (header + cell +
  sort field). NOTE: this removes it from the VTS closed tab as well — flagged to
  Kyle in the report (his directive came from the paper tab; the shared component is
  the deliberate architecture). Open-table Regime Wt column stays (not in the
  directive).

## E. Risks + invariants

- The metadata literal widening adds ~10 keys to every queued signal row. The engine
  spread (:2278-2289) and closed_trades write (:3044) are passthroughs — no schema
  change, no migration. jsonb size stays trivially small.
- NO decision-path consumer reads any new key (verified: engine reads only
  patternType; SQE/gates read typed columns). Behavior-neutral by construction;
  the promote-time rankAtPromote stamp happens AFTER selection.
- Threading `SizingContext.regime` touches the three dispatch pipes — typed optional
  field; a pipe that lacks a regime passes undefined (honest absence), never a
  default string.
- The SLAL purge removes in-memory telemetry only (no DB tables involved — service
  is memory-backed; endpoint reads that memory). No data loss beyond the panel being
  deleted per Kyle's directive.
- Old rows: no backfill (ratified posture); em-dashes remain on rows opened before
  deploy. Kyle's verification must use a NEWLY-opened position.

## F. Langston Step-1 pin-down resolutions (2026-07-18)

1. **RTB RankingScore after the fence fix — NOT blanked (verified).** The RTB
   display column does NOT read `metadata.rankingScore`: the `/trading-signals`
   endpoint attaches `rankScore` at READ time via
   `readyToBuyService.getDisplayRankKey(...)` (routes.ts, the Step-9 formula-blind
   attach; client reads `signal.rankScore`, `ready-to-buy-table.tsx:27/84`). Removing
   the `?? finalScore` fallback only stops writing the legacy value into the queue
   jsonb; the RTB column keeps showing the live R-multiple. Consciously decided:
   correct as-is, no queue-row stamp needed for RTB display.
2. **Open-table header = "Promote R", not "RankingScore".** The open column carries
   the promote-frozen R-multiple (`rankAtPromote`, stamped via the SAME
   `getDisplayRankKey` helper at the engine's promote site — one formula, two
   surfaces, no drift); RTB's column is the LIVE R-multiple. Distinct label + tooltip
   ("R-multiple at promotion — the score that won the slot") so the same-label/two-
   numbers lie cannot happen.
3. **June park citation.** The completion report will record: "2026-06-18 dead-ranker
   coupling RESOLVED — getRankedSignals/R-multiple won; rankingScore-ordering never
   adopted; P25 verdict delete" — the park is discharged, not overridden.
