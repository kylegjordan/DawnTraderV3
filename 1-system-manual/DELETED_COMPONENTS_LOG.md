# DELETED COMPONENTS LOG

> **Tier-2 governance (Kyle directive 2026-06-13).** When legacy code is removed, it is recorded here — never left stubbed/commented/deprecated/lingering in the live tree. Each entry: what was removed, why, the blast-radius verification that proved it safe, the archive copy path, and the removal commit. Archived copies live under `1-system-manual/_archive/deleted-code/` with a `.removed` suffix (non-compilable). The git history is the authoritative full archive; the `_archive` copy is for quick browsing.
>
> **Why this exists:** lingering legacy code creates confusion and the risk that dead paths accidentally re-enter the live system. See CLAUDE.md §5 rule 18 (legacy-removal policy, 2026-06-13 strengthening).

---

## 2026-06-13 — Legacy live-trading STUB cluster (P19-B2)

**Removed:** the pre-cleave `LiveTradingService` stub and its orphaned surface.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `live-trading-service.ts` | `server/services/live-trading-service.ts` | Phase 22.3 / Phase 41F stub. On "activate" it built a **fake placeholder object** `{ userId, mode:'live', isRunning:true }` — no Kraken, no TEC, no execution. Its own comments: *"Initialize trading engine (placeholder for now)… In production this would initialize the actual TradingEngine."* Also emitted a misleading "live trading active" broadcast off the do-nothing object (operator-integrity hazard). |
| 4 legacy routes | `server/routes.ts` `/live-trading/{start,stop,status,approve}` | Orphaned HTTP endpoints wiring to the stub. **No client/server caller** (verified). |
| Dead approval branch | `server/routes.ts` `if (approval.action === 'start_live_trading')` | Imported the stub's `activateLiveTrading`. The `start_live_trading` approval action is **never emitted anywhere** in the live tree (verified — appears only as a permission-type string and in an old context doc). |
| Test-harness scenario | `server/services/auto_test_harness.ts` | `createLiveTradingScenario()` + its registration + the `./live-trading-service` imports. Exercised the stub only. |

**Why removed:** legacy userId-coupled stub predating the June-10 three-way (VTS/paper/live) cleave; contradicts the mode-based architecture; carried an active false-"live-ON" broadcast bug. Kyle directive 2026-06-13: delete now, do not leave lingering.

**Blast-radius verification (certainty-before-cutting):**
- The **modern** live-start path (the Phase-21-gated engine start, `routes.ts` 409 `LIVE_ENGINE_PHASE21_GATED`) does **NOT** use this file — it is untouched.
- The client UI "Confirm & Start Live Trading" button (`top-bar.tsx` → `useTrading().startTrading({type:'live'})`) routes to the **modern gated path**, NOT the legacy `/live-trading/*` routes — UI unaffected.
- `start_live_trading` approval action has **no emitter** in the live tree — the approval branch was dead.
- `auto_test_harness` keeps its other scenarios (paper-sim start/stop, heartbeat); only the live-trading scenario was removed.
- **Left intentionally (forward-looking Phase-21 permission taxonomy — NOT dead executable code; do not mistake for a missed sweep when grepping `start_live_trading`):** `client/src/hooks/useUserRole.ts` permission-type strings (`start_live_trading`/`stop_live_trading`); `shared/schema.ts:181` (`"startLiveTrading": true` default-permission flag); `server/config/permissions.ts:202` (`'start_live_trading': 'trade_live'` permission→capability mapping — Langston Step-4 catch). All three are the permission MODEL Phase-21 live will use, independent of which file implements live.

**Archive copy:** `1-system-manual/_archive/deleted-code/live-trading-service.ts.20260613-P19B2.removed`
**Removal commit:** _(recorded at P19-B2 close)_
**Reviewed by:** Langston (Step-4 diff review) — _pending_

---

## 2026-06-15 — Hardcoded `enabledStrategies` allowlist + orchestrator Set machinery (P19-B4a C5)

**Removed:** the hardcoded strategy allowlist and all of its now-orphaned in-class machinery, replaced by the DB-resolved per-asset-class gate.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| Two 9-element inline literals | `server/services/trading-engine.ts:57-67` + `server/services/paper-portfolio-manager.ts:194-204` | The `enabledStrategies: ['vwap_pullback', … 'dhma']` config arrays passed into `new SignalOrchestrator({…})` at both live constructor sites. Hardcoded which strategies the orchestrator ran — static, not per-asset-class. |
| Config field | `server/services/signal-orchestrator.ts` `SignalOrchestratorConfig.enabledStrategies?: string[]` | Optional config knob the two literals fed. |
| The Set + 17-element default | `server/services/signal-orchestrator.ts` `private readonly enabledStrategies: Set<string>` field + its constructor construction (`new Set(config.enabledStrategies || [ …17 strategies… ])`) | The in-memory allowlist. The 17-element default (the "Directive 12.3.2 all canonical strategies" literal) is gone with it. |
| Dead public methods | `server/services/signal-orchestrator.ts` `isStrategyEnabled(strategyId)` + `getEnabledStrategies()` | Read-only accessors over the Set. **Zero external callers** (sweep-verified). |
| Log / stat sites | `server/services/signal-orchestrator.ts` `start()` banner + telemetry (`this.enabledStrategies.size`); `[8.8.3-B][SELECTION]` log (`Array.from(this.enabledStrategies)`); `strategiesRun += this.enabledStrategies.size`; Site E (`new Set([...this.enabledStrategies].filter(s => regimeStrategies.has(s)))`) | All consumers of the Set. Re-sourced: log/telemetry/stat counters → `Object.keys(STRATEGY_DISPLAY_NAMES)` (canonical universe); Site E → `new Set(regimeStrategies)` (the regime allowlist is the per-symbol selector; the DB gate is now the per-class authority). |

**Why removed:** the hardcoded allowlist was a static, asset-class-blind override that contradicted the per-asset-class-config default (CLAUDE.md §5 rule 15). It is replaced by `isStrategyEnabledForAssetClass` (`strategy_gates` DB) at the `buildSizedSignalForStrategy` chokepoint — the single per-class authority, reachable by BOTH pipes (crypto via `evaluateSymbol`, xStock via `dispatchExternalSignal`) because the stamped asset class lives there. Leaving the literals alongside the new gate would mean two competing authorities; leaving the orphaned Set/methods would be a lingering-legacy stub. Kyle directive 2026-06-13 (rule 18): delete now, do not leave lingering.

**Design decision (approved):** `isStrategyEnabledForAssetClass` stays DEFAULT-OPEN (returns `true` when no `strategy_gates` row matches). "Fail-hard" is satisfied by deleting the hardcoded list (the DB resolver becomes the sole authority and already throws on cold cache via `b72-warmup` prefetch). An explicit crypto allowlist seed is out of C5 scope (it would black out all crypto until a seed migration; crypto_spot has no rows today and stays default-open).

**Blast-radius verification (certainty-before-cutting):**
- **2 live constructor sites** (`trading-engine.ts` + `paper-portfolio-manager.ts`) — both edited; the field is optional, so removing it compiles.
- **0 external callers** of the removed public methods `isStrategyEnabled` / `getEnabledStrategies` (`server/`-wide sweep: only the orchestrator's own former definitions).
- The gate reads the 9-wide `StrategyType` (`'range_trading'`) but the DB rows + `STRATEGY_DISPLAY_NAMES` use the canonical `'range_trade'`; a one-entry reverse-alias (`range_trading → range_trade`) bridges this at the gate (mirror of the C2 forward-alias). `normalizeStrategy()` does NOT bridge it (silent default-open), hence the explicit alias.
- **⚠️ Left intentionally / FLAGGED (NOT a missed sweep):** the `/reb-2-12F/strategy-health` admin diagnostic (`server/routes.ts:10617-10630`) does NOT call the removed methods — it reads `signal-orchestrator.ts` **as source text** and regex-matches the `enabledStrategies = new Set([…])` literal and `this.enabledStrategies.has('dhma')` block. Removing that source machinery breaks the diagnostic's `orchestratorStrategies`/`dhmaWired` outputs (it will report empty + `dhmaWired=false`). This is a source-text coupling, outside the 4 files this chunk edits, and was surfaced to Langston for a follow-up home (re-point the diagnostic at `STRATEGY_DISPLAY_NAMES` / the regime map, or retire it). It does not affect the runtime signal pipeline.

**Archive copy:** none — this is inline literals + in-class machinery (not whole files), so there is no `.removed` archive file; git history is the authoritative archive (per this log's preamble).
**Removal commit:** _(recorded at C5 close)_
**Reviewed by:** Langston (Step-4 diff review) — _pending_
