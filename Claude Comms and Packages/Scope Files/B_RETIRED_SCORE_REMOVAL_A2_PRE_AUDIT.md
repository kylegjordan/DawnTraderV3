# B-RETIRED-SCORE-REMOVAL — A2 STEP-2 PRE-AUDIT (VTS trade-record finalScore retirement)

change-class: non_architecture

> A2 = retire the **VTS-persisted TRADE-RECORD** `finalScore` (the `vts_open_trades` record + its pure copy/aggregate readers), BOTH lanes. **Method = A1 byte-for-byte: make the field OPTIONAL + stop the writers persisting it + coalesce every reader to a deterministic `?? 0`.** NO field removal, NO column drop (Phase B), NO computation removal (A3). Gate role is dead everywhere (`:778`/`vts:1741`; A1→r_multiple; SQE gate #525) → zero decision/admission/ranking/sizing change. Design settled with Langston 2026-07-27 (refs `da9ccfdc`/`ac07d75a`).

## ★ THE FENCE (in words — `finalScore` is OVERLOADED; A2 touches exactly ONE surface)
1. **A2 SURFACE — VTS-persisted TRADE RECORD** (`vts_open_trades`): `OpenVirtualTrade` / `Phase10TradeRecord` / `VirtualSignal` record types + `RegisterOpenVtsTradeInput` + their pure copy/aggregate readers. ← **A2 touches ONLY this.**
2. **#582 — signal_eval ARCHIVE** (`archiveSignalEval` → `signal_eval_archive`): the `would_admit`/`final_score` column, **co-fed by 4 ACTIVE-PATH callers** (`signal-orchestrator.ts:965/:1557` pass `extendedMetrics.finalScore`; `ready_to_buy_service.ts:1651`; `active-execution-engine.ts:3087/:3398`) + the VTS lanes. Nulling it crosses the active fence → **NOT A2, stays #582** (retires only when ALL callers incl. active stop feeding it). ⇒ eval-cycle `:668` archiveCommon is #582, **left untouched** (my earlier edit reverted).
3. **ACTIVE-PATH GATE — do NOT touch:** the SQE `finalScoreMin` gate (`signal_quality_evaluator.ts:345`), `criteria-limiter.ts:90` `orderBy:'finalScore'`, `ready_to_buy_service` sort (already re-pointed to `queuedAt` by A1).
4. **PATTERN-POOL — do NOT touch:** `FINAL_SCORE_FLOOR`/`pattern_final_score_min` (name collision, live gate — excluded since A1's scope).

## FULL SURFACE — per-site disposition (Langston gates on this table)

### Record TYPES → make `finalScore` OPTIONAL (`?: number`)
| Site | Type | Disposition |
|---|---|---|
| `vts-runner.ts:628` | `OpenVirtualTrade.finalScore` | → optional |
| `vts-runner.ts:520` | `Phase10TradeRecord.finalScore` | → optional |
| `vts-runner.ts:3913` | `RegisterOpenVtsTradeInput.finalScore` | → optional |
| `vts-service.ts:57/:98/:869` | `VirtualSignal` + the two Phase-10 record ifaces | → optional (all three) |

### WRITERS → stop persisting (omit the field)
| Site | Lane | Disposition |
|---|---|---|
| `eval-cycle.ts:1000` | xStock (→ registerOpenVtsTrade) | omit `finalScore` from the record (KEEP `:656` compute + `:668` archiveCommon + import — those feed #582, not A2) |
| `vts-runner.ts:2195` | crypto inline `Phase10TradeRecord` literal | omit `finalScore` — ⚠️ **B79.0m.b HOT-PATH-LOCK: twin-lock/both-branches regression discipline (like B7.2d), NOT a free edit** |
| `vts-runner.ts:2227` | crypto inline `VirtualSignal` literal | omit `finalScore` — same twin-lock discipline |
| `vts-runner.ts:4050` | registerOpenVtsTrade builder (`finalScore: input.finalScore`) | input now optional → openTrade optional; leave as-is (optional→optional compiles) |

### READERS → coalesce deterministic `?? 0` (A2-surface) OR leave (other surface)
| Site | Reads | Surface | Disposition |
|---|---|---|---|
| `vts-runner.ts:5023` | `totalFinalScore += tradeRecord.finalScore` | A2 (cycle-avg display) | `?? 0` |
| `vts-runner.ts:5648` | `computeRankingScore(trade.finalScore, …)` | A2 → **A3 bright line** | `?? 0` interim (A3 re-sources; deterministic 0, not NaN) |
| `vts-runner.ts:3191/:3231/:3288/:3407/:5658` | `finalScore: trade.finalScore` (copy into downstream records) | A2 | `?? 0` at each copy site (bounds cascade — downstream types unchanged) |
| `vts-runner.ts:3808` | `finalScore: t.finalScore ?? 0` (open feed) | A2 | already `?? 0` — no change |
| `vts-service.ts:263` | `signal.finalScore ?? 0` | A2 | already `?? 0` — no change |
| `vts-service.ts:294` | `sum + t.finalScore` (session `avgFinalScore`) | A2 (display metric) | `?? 0` |
| `vts-service.ts:457` | `t.finalScore ?? t.signal.finalScore ?? undefined` (ML-calibration feed) | A2 (ML feed) | already null-safe (`?? undefined`) — no change; **its ML consumer is the Phase-B trainer-verify item** |
| `vts-service.ts:955/:994` | `finalScore: tradeData.finalScore` | A2 | `?? 0` |

### NOT touched (proof-of-fence, per Langston "show which surface each sits on")
- `vts-runner.ts:2040` `expectedEdge: finalScore * dynamicTarget − frictionCost` — reads the LOCAL `finalScore` const from `computeFinalScore(:1687)`, NOT the record field → **untouched by A2** (breaks only on A3's computeFinalScore removal).
- `eval-cycle.ts:656/:668/import` + all `archiveSignalEval` calls — #582 surface.
- All active-path + pattern-pool sites (fence §3/§4).

## A3 (separate, homed) — the two coupled bright lines
`computeFinalScore` removal + **re-source `:2040` expectedEdge AND `:5648` rankingScore** off coherent inputs (they are coupled — `:5648` consumes both in one expression) + remove the then-unread optional field. ★ RETIRING `expectedEdge` (incoherent cross-lane field) = separate §13 item, home decided at A3 scope.

## §13 SIBLING-CLUSTER HOME (Langston condition — named NOW)
`hybridScore` / `predictiveConfidence` / `regimeWeight` / `decayPenalty` travel co-located with `finalScore` at every site above but are LEFT (A1 one-metric discipline; hybridScore alone ~110 refs). Home = **RUNNING_ISSUES #584 `B-VTS-CLUSTER-RETIRE`** (filed with this pre-audit).

## VERIFY PLAN
Untruncated tsc on vts-runner + vts-service + eval-cycle (edited lines ZERO errors); `check-tsc-baseline` PASS; `b79-0n-*` green (untouched pattern-pool gate proof); the crypto inline `:2195/:2227` twin-lock regression (both branches) shown; NO migration (Phase B). Deploy carries no schema change. Column drops (`vts_open_trades.final_score`) = Phase B after zero-reader bake + ML-trainer (`scripts/hce`/ML ingest) consumption verified.
