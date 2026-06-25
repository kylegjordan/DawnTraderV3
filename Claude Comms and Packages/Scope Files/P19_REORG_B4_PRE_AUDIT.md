# P19 reorg-B4 — Pre-Audit (Step 2): Shadow-Trade Telemetry Layer

change-class: architecture

**Phase:** 19 · **Owner:** Claude New (CC-B) · **Companion:** `P19_REORG_B4_SCOPE.md` (Step-1 firmed) · **Drafted:** 2026-06-25
**Method:** direct code read + SIM + System Manual + `ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md` + two structured-read sub-agents. **Verify-don't-assume applied — see §0 (a stale header comment was caught + corrected).**

---

## 0. ★ Verify-don't-assume correction (load-bearing)

My Step-1 note assumed the closed-side contamination target was a `paper_sim_trades` INSERT, based on the **header comment** in `vts-trade-persistence.ts` (":12/:22/:31 — 'the close path captures the full state into paper_sim_trades, txn-atomic'"). **Direct code read CONTRADICTS that comment:** `vts-service.ts` has **ZERO** `paper_sim_trades` / `createPaperSimTrade` writes (grep-confirmed). The VTS close cascade writes to `closedTrades[]` (in-memory, vts-service.ts:929) + a JSONL log (:937) + **`outcomeFeedbackStore.updateEma(source,...)` (:988)** + **`telemetry.recordPairTelemetry(symbol,{source})` (vts-runner.ts:2615)** + the exit-decision archive (mode='vts'). `paper_sim_trades` is the **paper-execution (active) store**, written ONLY by `paper-execution-engine` (`storage.ts:3224` INSERT / `:3229` UPDATE). The header comment is stale/aspirational. **⇒ the real closed-side learning sinks a shadow close must avoid are `outcomeFeedbackStore` + the telemetry aggregator + the exit-decision archive — NOT `paper_sim_trades`.** This reshapes §4.

## 1. Docs consulted (SIM / System Manual / active-trading audit)

- **SIM Cross-Cutting Runtime State / Liveness Registry** (top of `SYSTEM_IMPACT_MAP.md`): `OpenVirtualTrade`/`openVirtualTrades` Map listed as shared singleton (`:962`, "many internal helpers + persistence layer"). Per-mode-safe reference singletons at `:91-93` (the design patterns to mirror). **Governance:** any new shared singleton (the planned `openShadowTrades` Map + the shadow sink) MUST be registered here in the same batch.
- **Active-Trading Pipeline Audit:** confirms `getRankedSignals` sorts on `finalScore` (anti-predictive ~−0.14 crypto); `rankingScore` computed only on the VTS path + inert on active (`= finalScore`); `getTopSignal`/`checkForPromotion` DEAD (zero callers). reorg-B4 produces the data that reorg-B5 (the ranking fix) consumes.
- **System Manual:** signal-pipeline + the VTS-vs-active distinction; the close-cascade learning-feedback loop (outcomeFeedbackStore → confidence modulation) is core architecture (System-Manual-scope content update owed).

## 2. Blast radius / affected components

| Component | File | reorg-B4 touch |
|---|---|---|
| RTB promotion picker | `ready_to_buy_service.ts:getRankedSignals` (:1641-1681) | READ the freshly-scored pool (no change to its logic); the shadow hook attaches in its CALLER, post-slice |
| Promotion caller (hook site) | `paper-execution-engine.ts` `checkRtbPromotion`/promotion loop (~:1716/:1801) | NEW: after the winner is sliced, fire-and-forget shadow-open of the pool alternatives |
| VTS sim machinery | `vts-runner.ts` (`registerOpenVtsTrade` :3120, `openVirtualTrades` :656, `resolveOpenVirtualTrades` :2264) | REUSE persistence + exit; ADD `openShadowTrades` Map + parameterize the resolver to drain both |
| VTS persistence | `vts-trade-persistence.ts` (insert :104, rehydrate :243/:685, markClosed :143) | shadow rows persist tagged `context.shadow`; rehydration SPLIT routes them to `openShadowTrades` |
| Close-cascade learning sinks | `vts-service.ts:persistRealPriceTrade` (:988 outcomeFeedbackStore), `vts-runner.ts:2615` (telemetry) | shadow close path must NOT write these under a learning source |
| Schema | `shared/schema.ts` | NEW shadow-outcome/pairing sink (table or partitioned); `vts_open_trades.context` carries the shadow tag (no new column for the tag) |

**NOT touched:** the active/real fill path (`executePromotedSignal` → `paper_sim_trades`) — structurally separate; shadow never reaches it. Crypto vts.ts endpoint untouched.

## 3. OPEN side — by-construction isolation (FORK A) + write-side exhaustiveness (W1)

- **Separate `openShadowTrades` Map** (NOT the shared `openVirtualTrades`). Verified WHY: `resolveOpenVirtualTrades` ITERATES the in-memory Map (`:2288` `for (const t of openVirtualTrades.values())`, `:2381`) — it does NOT table-drain — so shadow needs its own Map the resolver also drains.
- **Reader-enumeration of `openVirtualTrades` (the cap-contamination proof):** cap gates `:1544`/`:3032`/`:3455`; dup/lane guards `:1489`/`:1503`/`:3017`/`:3715`; getStats `:2961`/`:2981`; cycle logs `:2907`/`:2909`; rehydrate `:685/:687`; ranking iterate `:4503`/`:4536`. ALL read the live `openVirtualTrades` only ⇒ with a separate `openShadowTrades` Map, **every one is shadow-free by construction** (no predicate to forget). The proof is "shadow is not in that Map."
- **W1 write-side exhaustiveness:** shadows open at **exactly ONE site** — the post-slice hook in the promotion caller — which stamps `context.shadow=true`. Single stamp site ⇒ exhaustiveness is provable by inspection, not an N-caller audit. Predicate is strict `=== true` so a missing/NULL key fails SAFE into the non-shadow pool (belt-and-suspenders on top of the proven-single-writer).

## 4. ★ CLOSED side — by-construction segregation (CORRECTED per §0)

The contamination targets are the **shared learning stores**, reached by the VTS close cascade (`resolveOpenVirtualTrades` → `persistRealPriceTrade`), NOT `paper_sim_trades`:
1. **`outcomeFeedbackStore.updateEma(source,…)`** (vts-service.ts:988) — per-(source,assetClass,regime,strategy) realized-PnL EMA. **READ by** `signal-orchestrator.ts:945` (`peek(mode,…)`) + `vts-runner.ts:1860` (`peek('vts',…)`) to modulate confidence. **THE primary feedback-loop contamination vector.**
2. **`telemetry.recordPairTelemetry(symbol,{source})`** (vts-runner.ts:2615) — telemetry aggregator (shared singleton); read by adaptive pair-selection / ranker. Source stamped at write but readers may not filter — HIGH risk.
3. **exit-decision archive** (mode='vts', B73 ablation replay) + **`closedTrades[]`/JSONL** (vts-service.ts:929/:937).

**By-construction segregation (mirrors the open-side Map):** the shadow close path writes ONLY the dedicated shadow pairing-record sink and **NEVER** calls `outcomeFeedbackStore.updateEma` / `telemetry.recordPairTelemetry` / the exit-archive under a learning source. Cleanest = a **separate shadow close routine** the resolver dispatches to for `openShadowTrades` entries (vs `persistRealPriceTrade` for `openVirtualTrades`), so no learning sink is reachable from a shadow close — not a `source==='shadow'` predicate sprinkled into the shared cascade. **W2 mutation-exhaustive:** the proof is the enumeration above (every learning-store WRITE in the cascade), and that the shadow routine calls none of them.

## 5. RESTART side — rehydration split (verified feasible)

`rehydrateOpenTrades` (vts-trade-persistence.ts:243) `SELECT … context … WHERE closed=false` (:262) and spreads `...(r.context ?? {})` (:293); `splitTradeForPersist` (:76/:83/:87) bundles "everything else into `context`" at write ⇒ **`context.shadow` round-trips intact (verified).** The current rehydrate sets ALL rows into `openVirtualTrades` (:685). **reorg-B4 change:** at the :685 set-loop, route `context.shadow===true` rows into `openShadowTrades`. One legitimate boot-split predicate (single site), not a sprawl.

## 6. OBJ-2 — the decision-time pairing record (forward-complete vs B5/B6)

Per the ranker read: B5 will re-weight the `finalScore` inputs, so the pairing record must snapshot, **per pool member at the promotion-decision moment** (NOT recomputed at close): `signal_id`, `final_score` (the sort key, `ready_to_buy_service.ts:1672`), its components `hybrid_score`/`confidence`/`regime_weight`/`decay_penalty` (score-calculator.ts), `rankingScore` (+ its `ranking-weights.ts` inputs), `source_pool` + `di_at_queue` + `dbs_score_at_queue` (the EV-path inputs — note #233/#384: these may be NULL on the active path today; capture what's present), `regime`-at-decision, `asset_class`, `promotion_rank`, `promoted` bool, and a `cycle` key (no explicit cycle_id exists → use the `getRankedSignals` invocation timestamp + mode). On close, attach realized outcome: `gross_pnl`/`net_pnl`, `close_reason`, `holding_duration`, R-multiple. **Hard gate (Langston): forward-complete vs B5's ranker inputs + B6's Filter-Diag — so B4's sink schema never re-opens.** Full field list: the OBJ-2 sub-agent report (this turn).

## 7. Hot-path placement

The shadow-open fires **AFTER** the winner is sliced (`getRankedSignals` returns → winner promoted), **fire-and-forget / post-decision**, using the same pool snapshot. A shadow-open failure or slowness must NEVER delay or alter the live promotion (wrap in its own try/catch, off the promotion critical path). State in OBJ-1.

## 8. OBJ-3 — two separate invariant tests
(a) **active path byte-identical** shadow-on/off (shadow never reaches `executePromotedSignal`/`paper_sim_trades` — fail-loud assert); (b) **VTS learning portfolio byte-identical** shadow-on/off — the `openVirtualTrades` count + cap + the learning sinks (`outcomeFeedbackStore`/telemetry EMAs) are unchanged with shadow on.

## 9. Governance owed + §13 homes
- **SIM:** register `openShadowTrades` Map + the shadow sink in the Cross-Cutting Liveness Registry; document the new promotion-boundary touch + the shadow close routine.
- **System Manual:** the shadow-trade telemetry layer + the decision-time selection-quality capture (signal-pipeline chapter).
- **§13 RUNNING_ISSUES homes to land:** C2-trigger (shadow-sink index decision at the OBJ-2 query step) + E-trigger (SQE-rejected shadow inclusion, gated on B5 finding RTB-pool data insufficient).

## 10. Open questions for Langston (Step-2 review)
1. **The §0 correction reshapes the closed-side:** with the contamination being `outcomeFeedbackStore`+telemetry (not `paper_sim_trades`), do you concur the by-construction answer is a **dedicated shadow close routine** the resolver dispatches to (never calling the learning-store writes), + the shadow pairing-record sink? (vs a `source==='shadow'` skip inside `persistRealPriceTrade`.)
2. **OBJ-2 sink shape:** the shadow pairing record IS the shadow-outcome sink (one table), or two (open-time pairing + close-time outcome)? My lean: one table per pool-member-per-cycle, decision-time scores written at open, outcome fields filled at close.
3. Confirm the hot-path placement (post-slice fire-and-forget) is acceptable given the shadow-open count = full pool size each cycle.
