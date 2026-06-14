# P19-B4a PRE-AUDIT — xStock active-path wire-in (+ feed-safety gate)

> **Phase 19 · Batch 4 · sub-batch A.** Step-2 pre-audit. Author: Claude New (CC-B). For Langston Step-2 review. 2026-06-14. Builds on the Langston-APPROVED P19-B4 scope v2 (`P19_B4_SCOPE.md`). B4b (paper fill fidelity + isolation) gets its own Step-2 later — this covers **B4a only**.
>
> Per CLAUDE.md §2/§9: per-component upstream + downstream + shared-state + background-execution + blast-radius trace, code-level, `file.ts:line`-grounded. Direct reads (FUSE mount; `git grep` + targeted Read).

---

## §1 — B4a objectives recap (from scope v2 §3)

A1 dispatch seam · **A1.5 resolver-backed RTB asset_class write (spine)** · A2 freshness + equity-session + stall gate · A3 classify hardening + hook + #230 tag · A4 RTB Phase-4 SET NOT NULL (ordered after A1.5) · A5 DB-resolved active strategy gate + legacy disposition · A6 #153 0.50-cap validation · A7 B11 calibration-tag. **+ new finding (Langston gap-4): cross-class selection watch (§3.3).**

---

## §2 — PER-COMPONENT BLAST RADIUS

### 2.1 `signal-orchestrator.ts` (the wire-in target)
- **Cycle entry** `evaluateMarket()` :1178 — self-driving 30s timer; hard-bound crypto: `DEFAULT_ASSET_CLASS='crypto_spot'` (:1199 screener filters), `activeFilterPool.getActivePool(mode)` → `fx5Survivors` (:1213), `eligibleSymbols = fx5Survivors.map` (:1245). Loop :1292 → `evaluateSymbol(symbol, settings, filters, sizingContext, fx5Survivors, symbolFamilies, STRATEGY_FAMILY_MAP, HYBRID_FAMILY_ELIGIBILITY, vnMaxVeto)` :1303.
- **Per-symbol** `evaluateSymbol(...)` :1303 — **crypto-context-coupled** (takes `fx5Survivors` + `symbolFamilies`). Returns `StrategySignal[]` → validated (`validateStrategySignal` :1309) → routed.
- **Per-signal** `buildSizedSignalForStrategy(rawSignal, strategyId, sizingContext, marketContext)` :399-404 — **already class-aware**: sizing input `assetClass: resolveAssetClass(symbol,'kraken')` :464 (resolver-backed, "no silent crypto_spot fallback" comment :461-463); SQE assetClass :601-602; **RTB queue input `assetClass: rawSignal.metadata?.assetClass || DEFAULT_ASSET_CLASS` :693 (the A1.5 hinge — inconsistent with :464)**; queues via `readyToBuyService.queueSQESignal(sqeSignalInput).catch(recordQueueFailure)` :708-710.
- **Upstream:** activeFilterPool (crypto FX5), MCE (regime context), strategy detect.
- **Downstream:** ready_to_buy_service (queue), factor-ablation-emitter (:1051, #231 dormant), outcomeFeedbackStore (:840-856 read, per-class), canary.
- **Shared state:** one orchestrator instance per engine/mode (`trading-engine.ts:54`; legacy `paper-portfolio-manager.ts:191` #136). `enabledStrategies` set (:1294, hardcoded list).
- **Blast radius of A1:** the seam. `evaluateSymbol` cannot be reused for xStock as-is (crypto pool args). Two shapes — §3.2.

### 2.2 `ready_to_buy_service.ts` (RTB queue)
- **Write** `queueSQESignal(input)` — row build :1768-1803, `storage.upsertRtbSignal(insertData)` :1809. `assetClass: input.assetClass || 'crypto_spot'` :1802 (+ metadata mirror :1761; warn-if-missing :1752). **xstock volume24h skip-write null :1791** (input volume is the underlying equity share volume, a known landmine — B.1.5).
- **Select** `getTopSignal(mode)` :1218 — `storage.getRtbSignals({ mode, status:'queued' })` :1219 (**mode-filtered, NOT class-filtered**) → picks single max `rankingScore ?? finalScore` :1230/:1243 across ALL classes; `FINAL_SCORE_GAP_OVERRIDE` (gap>0.10 → finalScore wins) :1237. **Cross-class selection — §3.3.**
- **Schema:** `rtb_signals.asset_class` nullable `schema.ts:1885`; Phase 1 (ADD NULL) + Phase 3 (CHECK + index) shipped/manifested; **Phase 4 = SET NOT NULL (A4).**
- **Shared state (split-brain, → B4b):** RTB singleton holds cooldown/dedup/portfolio-heat across modes — the worst co-run leak (#214 family). **B4a must NOT add xStock-specific shared state here (scope §2 isolation-aware).**
- **Blast radius of A1.5 + A4:** A1.5 fixes :693 (source) + hardens :1761/:1802 (row write). A4 flips :1885 NOT NULL — **must land after A1.5** (else a silently-wrong `crypto_spot`-on-xstock row passes the constraint, corrupting rather than blocking).

### 2.3 `xstock_spot/scanner.ts` + `eval-cycle.ts` (the source)
- **Terminus** `eval-cycle.ts:831` `registerOpenVtsTrade(xOpenTrade)` — VTS-only, NO SQE/RTB (header :28-30). Scanner `scanner.ts:924-928` calls `evaluateXstockPairForVTS` only; never imports orchestrator/RTB.
- **Cadence:** xStock centralClock 30-tick + rotation + weekend lifecycle — **different from the orchestrator 30s self-timer.** Has its own DBS pre-compute, 15m bar cache, regime.
- **Price read** `scanner.ts:628-640` — DB `SELECT DISTINCT ON (symbol) FROM xstock_spot_ticker_snap` with a **30-min ceiling** (:637); 90s tick gate RETIRED (:557-561, bar-history SSOT).
- **Blast radius of A1:** the xStock-side dispatch (option a) attaches here — after the survivor set, build a `StrategySignal` with `metadata.assetClass='xstock_spot'` and feed the orchestrator per-signal pipeline. Must NOT disturb the existing VTS dispatch (both run).

### 2.4 `equity-spot-archiver.ts` (WS price feed — A2)
- Passive archiver: WS `wss://ws-equities.kraken.com` → buffer → 5s batch flush to `xstock_spot_ohlc_1m` + `xstock_spot_ticker_snap`. **No in-memory price getter; active path reads DB.**
- **Staleness:** only a 60s console log of `last_msg_age_ms` (:236-246); `state.lastMsgAt` (:37) is connection-level, not per-symbol, not gated. **No silent-stall watchdog** (open-but-quiet socket never reconnects; `ws.on('error')` only logs :223-225; reconnect only on `close`).
- **Blast radius of A2:** add (a) a tight recency gate on the active-path price read (seconds-scale, evidence-set), (b) a stall watchdog (reconnect/alert on tick-silence with open socket), (c) **equity-session (ARCA-hours) hard gate** on active xStock fills. Consumers of the freshness gate: the new xStock dispatch (A1) + any sizing that reads current price.

### 2.5 `shared/asset-classes.ts` (classify — A3)
- `safeResolveAssetClass` + the EXISTING hook `setClassifyFallthroughHook(hook)` :545-549 (fired :574, try/catch-guarded), counter `getClassifyFallthroughCount()` :532. **The B4a registration surface — no new plumbing.**
- ~26 throwing `resolveAssetClass` sites confirmed (orchestrator 13, paper-exec 5, RTB 3, others). A3 triages active-path-reachable ones → safe+skip; registers the hook to system-alert when active ON; #230 tags fallback samples.
- **Blast radius:** `shared/` cannot make the active-vs-passive cut itself (by design) → the hook is registered server-side at boot where the active-mode flag is known.

### 2.6 `trading-engine.ts` + `paper-position-sizing.ts` (gates — A5, A6)
- **Active strategy gate:** hardcoded 9-list `trading-engine.ts:57-67` (NO `orb`) intersected with code-SSOT `CANONICAL_REGIME_STRATEGY_MAP[assetClass][regime]` (`signal-orchestrator.ts:2118-2126`). **No DB-resolved per-class active gate** (the VTS B3.1 equivalent is unbuilt). A5 builds it (fail-hard on empty) + disposes the hardcoded list (rule-18).
- **0.50 cap (A6):** `paper-position-sizing.ts:163` `getPatternPoolGuardrailsForAssetClass('xstock_spot').MAX_POSITION_PCT` → DB-resolved `getCachedNumberRequired('pattern_pool_gates','pattern_max_position_pct','xstock_spot')` (`pattern-pool-filters.ts:74`, fails hard if empty — good). Deprecated `0.50` literal shim `pattern-pool-filters.ts:92` (zero importers, Phase-16 removal).

### 2.7 `paper_sim_*` tables (B11 tag — A7)
- `paper_sim_trades` `schema.ts:1671`, `paper_sim_open_positions` `schema.ts:1756` — both carry `assetClass` (default `crypto_spot`), **NO `calibration_state`**. F-NOW added it VTS-only (`2026-06-01-f-now-calibration-state.sql`). A7 adds `calibration_state` to both with default `pre_calibration_xstock_2026_05` + backfill (no stranded nulls).

### 2.8 `score-calculator.ts` (finalScore — gap-4 basis)
- `finalScore` :52, **clamped [0,1]** :64, from hybridScore/confidence/regimeWeight/decayPenalty (all [0,1] quality components). **No return-magnitude scaling, no crypto-scale ceiling.** Per-class cache isolation (:111 `${assetClass}:${regime}:${strategy}`).

---

## §3 — CONFIRMED FINDINGS

### 3.1 A1.5 spine — it's a CONSISTENCY fix, not new logic
The orchestrator ALREADY resolves correctly for sizing (`:464`, explicit no-fallback) but INCONSISTENTLY defaults for the RTB queue input (`:693` `metadata?.assetClass || DEFAULT_ASSET_CLASS`), and the row-write carries that through (`ready_to_buy_service.ts:1761/:1802` `input.assetClass || 'crypto_spot'`). **Fix:** (a) `:693` → `resolveAssetClass(rawSignal.symbol,'kraken')` matching `:464`; (b) harden the row-write at `:1761/:1802` to resolve-from-`normalizedSymbol` (or assert-non-null) as defense-in-depth for any other `queueSQESignal` caller. **Open:** enumerate `queueSQESignal` callers (Step-2 residual) to confirm whether the row-write defense is load-bearing or just belt-and-suspenders.

### 3.2 A1 seam — the core design decision (Langston input wanted)
`buildSizedSignalForStrategy` (:399) is class-aware and is the right injection point. But the per-symbol entry `evaluateSymbol` (:1303) is **crypto-context-coupled** (`fx5Survivors`, `symbolFamilies` args). **Recommended (option a refined):** add an xStock-side dispatch in/after the xStock scanner that constructs a `StrategySignal` (with `metadata.assetClass='xstock_spot'`) from the xStock detect output and calls the orchestrator's per-signal pipeline directly — bypassing the crypto-coupled `evaluateSymbol` pool logic. This keeps xStock's centralClock cadence and avoids forcing xStock symbols through the FX5 survivor machinery. **The implementation question for Langston:** expose a minimal class-agnostic per-signal entry on the orchestrator (e.g. a thin public method wrapping `buildSizedSignalForStrategy` + `validateStrategySignal` + the routing at :1308-1324), or have the xStock dispatch call `buildSizedSignalForStrategy` via an injected orchestrator handle. Either avoids duplicating sizing/SQE/RTB. **Risk:** two dispatch paths (crypto via evaluateSymbol, xStock via the new entry) must not drift — share the per-signal routing block.

### 3.3 gap-4 / #221 reachability — ANSWER (deferral holds, with a watch)
`getTopSignal` (:1218) IS a cross-class comparative sort (mode-filtered, picks one global best). BUT the active ranking key is **`finalScore`** (orchestrator sets no `rankingScore` on the active path → `:1762` defaults `rankingScore` to `finalScore`), and `finalScore` is a **unit-consistent [0,1] quality score with no return-magnitude ceiling** (§2.8). So #221's structural under-ranking (NET_RETURN_CEILING=0.05, which lives in the dormant ranking-weights path) does **NOT** bite the active path. **Conclusion: #221 full leveling stays deferred to Phase 25 (safe), but add a B9-run WATCH on cross-class selection share** (confirm xStock isn't empirically starved on finalScore once active). No structural B4a fix needed — there is no unit mismatch to repair. **Langston: confirm this reading vs requiring a per-class fairness floor in B4a.**

---

## §4 — OPEN ITEMS / DECISIONS (Step-2, for Langston)

1. **A1 seam shape** (§3.2) — minimal class-agnostic per-signal entry on the orchestrator vs injected-handle call to `buildSizedSignalForStrategy`. CC leans: a thin public per-signal entry that wraps the existing validate+route block so both paths share it.
2. **gap-4 reading** (§3.3) — confirm defer-#221-with-B9-watch vs per-class fairness floor in B4a.
3. **A4 soak generator** — what writes real per-class `asset_class` rows during the 48h zero-null window without flipping active trading? CC proposal: a shadow dispatch that runs A1's path through `queueSQESignal` write but stops before execution (writes the row, no fill), OR confirm VTS already writes the column. Confirm in Step-2.
4. **A2 equity-session source** — reuse `xstock_spot/market-hours.ts` / `calendar.ts` (weekend + US-holiday aware) for the ARCA-hours gate, or a tighter ARCA session calendar? CC leans: reuse market-hours (already the cadence authority) + verify it encodes ARCA RTH, not just weekend.
5. **queueSQESignal caller enumeration** (§3.1) — confirm whether the row-write defense is load-bearing.

---

## §5 — RISK REGISTER

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Stale/stalled xStock price → active fill on a dead price | **HIGH** (audit-4 top) | A2 recency + stall-watchdog + equity-session gate, all HARD before A1 dispatch enabled |
| R2 | Silent `crypto_spot` mislabel on an xStock row | **HIGH** | A1.5 resolver-backed write (source + row-write); A4 NOT NULL only after A1.5 |
| R3 | xStock starved in cross-class selection on finalScore | MED | gap-4 watch (B9); per-class fairness floor only if evidence shows starvation |
| R4 | Two dispatch paths (crypto/xStock) drift | MED | share the per-signal validate+route block (§3.2) |
| R5 | A4 soak vacuous (no rows written in 48h) | MED | define a real generator (§4.3) |
| R6 | xStock-specific shared singleton state leaks into B4b's isolation problem | MED | B4a isolation-aware: no new cross-mode RTB state |
| R7 | The B3b queueSQESignal drop-class (riskScore/profitRate) was crypto-validated only | MED | watch `[RTB_QUEUE_DROP][CRITICAL]` for xStock post-wire-in |

---

## §6 — PROPOSED IMPLEMENTATION CHUNKS (B4a)

C1 A1.5 resolver-backed write (orchestrator :693 + RTB :1761/:1802) + tests · C2 A1 xStock-side dispatch + shared per-signal entry · C3 A2 freshness/session/stall gate (after measuring inter-tick) · C4 A3 classify triage + hook registration + #230 tag · C5 A5 DB active strategy gate + hardcoded-list disposal · C6 A7 calibration_state migration + backfill · C7 A4 RTB Phase-4 migration (apply SET NOT NULL after the soak) · C8 A6 #153 0.50 validation (evidence) · tests + bench + CI throughout. **Ordering within B4a: C1 (spine) → C2 (dispatch) → C3 (safety gate) before any active xStock dispatch is enabled; C7 SET NOT NULL last (after soak).**

---

*Step-2 deliverable. On Langston Step-2 PROCEED → implement C1→C8. Residuals to close in Step-2 exchange: §4 items 1-5.*
