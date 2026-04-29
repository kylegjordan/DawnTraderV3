# BATCH 73 — Pre-Implementation Audit + Implementation Plan

**Companion to:** `BATCH_73_SCOPE.md` (commit `a7c48007`)
**Step:** 2 of 11 per CLAUDE.md §2 workflow
**SIM consulted:** YES — see §A.1
**Status:** Drafted, awaiting Langston review (Step 2)

---

## §A. SIM + System Manual Consultation

### §A.1 SIM-mapped components affected

| # | Component | File | Change | Blast |
|---|---|---|---|---|
| 1 | New schema | `exit_strategy_alternates` table | NEW table + indexes | LOW (additive) |
| 2 | New service | `server/services/exit-strategy-replay.ts` | NEW file with 12 variant evaluators + state machine | LOW (isolated) |
| 3 | VTS trade-close hook | `server/services/vts-service.ts:persistRealPriceTrade` | Add async fire-and-forget call | LOW (async, no blocking) |
| 4 | Paper trade-close hook | `server/services/paper-execution-engine.ts` close path | Same pattern as VTS hook | LOW (active trading OFF; forward-compat) |
| 5 | OHLC fetch | Existing `ohlc-cache.ts` | READ only — fetch trade window | NONE |
| 6 | Module constants | `module_constants` table | Add 13 keys in new `exit_strategy_replay` module | LOW (additive) |
| 7 | API endpoint | New `GET /api/analytics/exit-strategy-ablation` | NEW endpoint with filter params | LOW (read-only) |
| 8 | UI panel | New "Exit Strategy Ablation" panel in machine-learning page | NEW component | LOW (new visual; existing panel unaffected) |
| 9 | Tests | New `b73-exit-strategy-replay.test.ts` | NEW file | NONE |

**Upstream feeders unchanged:**
- `paper_sim_trades` schema — no changes
- VTS JSONL trade records — no schema changes
- `originalStopPrice` field — already 100% populated on new trades since 2026-04-29
- TEC `trailing_exit` module_constants — read-only reference for variant baselines

**Downstream consumers unchanged:**
- B67.x ablation framework — separate table, separate dashboard, no overlap
- B67 calibration window — exits are unchanged, no contamination
- Trade-close latency — replay is async fire-and-forget, no blocking

**Shared state:**
- New `exit_strategy_alternates` table — append-only; B73 service writes, dashboard reads
- No persistence files needed (state is per-trade, lives in DB)

**Background execution:**
- One async replay call per trade close (~160/day current VTS rate × 12 variants = ~1920 inserts/day)
- No new timers/intervals
- Replay processing time per trade: estimate <100ms (12 variants × OHLC walk over typical 2-3h trade window = ~120-180 bars per variant)

### §A.2 System Manual sections to update on close

- New section: B73 exit-strategy ablation framework, parallel to B67.0
- Document the simplified trailing state machine (peak + level + ATR multiplier)
- Document the 1-min OHLC convention (low ≤ level → triggered)
- Sharpe-like selection metric formula pre-registered
- Per-regime n=50 minimum for regime-specific recommendations (vs n=200 for headline winner)
- Reference to TEC config values (currently 1×ATR BE trigger, 1.5×ATR target lock, 1×ATR trail distance) — variant params anchor on these

### §A.3 Cascade risk check

| Risk | Verdict | Mitigation |
|---|---|---|
| Replay errors block trade-close | NO — async fire-and-forget with `.catch()` | Replay never throws into close path |
| 12 variants × 1920 rows/day fills DB | Trivial — ~58K rows/month, negligible | 90d retention sweep can be added later if needed |
| Replay state machine bugs produce bad virtual exits | Possible — observation-only, no real impact | Comprehensive unit tests per variant before deploy |
| OHLC cache miss for old trades pre-deploy | Acceptable — variant rows omitted with metadata flag | Forward-only is fine; we don't backfill historic |
| 1-min granularity misses fast wicks | Documented convention (low ≤ level → triggered) | Conservative; matches real-stop semantics |

**Net:** zero impact on actual trading behavior. Pure observational layer with append-only DB writes.

---

## §B. Implementation Plan

### §B.1 File-by-file edit map

#### **File 1 (NEW):** `drizzle/migrations/2026-04-30-b73-exit-strategy-alternates.sql`

```sql
BEGIN;

CREATE TABLE exit_strategy_alternates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id VARCHAR NOT NULL,
  trade_source VARCHAR NOT NULL CHECK (trade_source IN ('paper', 'vts')),
  variant_id VARCHAR NOT NULL,
  variant_name VARCHAR NOT NULL,
  virtual_exit_price NUMERIC(20, 8),
  virtual_exit_reason VARCHAR NOT NULL,  -- 'TP_target_hit', 'SL_hit', 'BE_stop', 'TRAIL_hit', 'TIMEOUT', 'INSUFFICIENT_DATA'
  virtual_exit_time TIMESTAMPTZ,
  virtual_pnl_pct NUMERIC(10, 4),
  virtual_duration_min INT,
  baseline_pnl_pct NUMERIC(10, 4),
  regime TEXT,
  strategy TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exit_strategy_alternates_unique UNIQUE (trade_id, variant_id)
);

CREATE INDEX idx_exit_strategy_alternates_variant_created
  ON exit_strategy_alternates (variant_id, created_at);

CREATE INDEX idx_exit_strategy_alternates_regime_variant
  ON exit_strategy_alternates (regime, variant_id);

-- B73: 13 module_constants for variant params + global config
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_baseline_be_trigger_r',          '1.0'::jsonb, 'b73-cheap-tier'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_baseline_trail_distance_atr',    '1.0'::jsonb, 'b73-cheap-tier'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_variant_b_be_atr_pad',           '0.5'::jsonb, 'b73-cheap-tier'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_variant_c_be_trigger_r',         '1.5'::jsonb, 'b73-cheap-tier'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_variant_h_trail_distance_atr',   '0.5'::jsonb, 'b73-cheap-tier'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_variant_i_trail_distance_atr',   '2.0'::jsonb, 'b73-cheap-tier'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_variant_e_vol_p75_threshold',    '0.020'::jsonb, 'b73-cheap-tier'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_max_hold_ms',                    '604800000'::jsonb, 'b73-cheap-tier'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_ohlc_buffer_ms',                 '3600000'::jsonb, 'b73-cheap-tier'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_min_n_total',                    '200'::jsonb, 'b73-cheap-tier'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_min_n_per_regime',               '50'::jsonb, 'b73-cheap-tier'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_replay_enabled',                 'true'::jsonb, 'b73-cheap-tier'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_replay_async_timeout_ms',        '5000'::jsonb, 'b73-cheap-tier');

COMMIT;
```

Plus rollback file deleting these.

**Variant param sourcing (per Langston cc-inbox #861 Q1):**
- Live TEC values queried from `module_constants` `trailing_exit` module: `break_even_trigger_r=1.0`, `target_lock_r=1.5`, `trail_distance_atr_multiplier=1.0`
- Variant A (baseline) = use these directly (NOT separate constants)
- Variant B BE pad = 0.5×ATR (new exploration param)
- Variant C BE trigger = 1.5×ATR (vs baseline 1.0)
- Variant H tighter trail = 0.5×ATR (vs baseline 1.0)
- Variant I looser trail = 2.0×ATR (vs baseline 1.0; NOT 3.0 — anchors on actual baseline of 1.0)

**`b73_variant_e_vol_p75_threshold` seed = 0.020** (placeholder; recompute from live VTS pair-universe vol distribution post-deploy via psql, then UPDATE the constant — methodology documented in System Manual update on close).

#### **File 2 (NEW):** `server/services/exit-strategy-replay.ts`

```typescript
import type { OHLCData } from '../types/market-regime.types';

export type VariantId = 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'|'K'|'L';

export interface VirtualExit {
  variantId: VariantId;
  variantName: string;
  exitPrice: number | null;
  exitReason: 'TP_target_hit' | 'SL_hit' | 'BE_stop' | 'TRAIL_hit' | 'TIMEOUT' | 'INSUFFICIENT_DATA';
  exitTime: number | null;  // epoch ms
  pnlPct: number | null;
  durationMin: number | null;
  metadata: Record<string, unknown>;
}

export interface ReplayInputs {
  side: 'BUY' | 'SELL';
  entryPrice: number;
  entryTime: number;        // epoch ms
  target: number;
  originalStopPrice: number;
  atr: number;
  volatility: number;        // pair vol at entry (for variant E)
  ohlcBars: OHLCData[];      // 1-min, sorted ascending, covering entry → exit + buffer
  config: ReplayConfig;
}

export interface ReplayConfig {
  baselineBeTriggerR: number;
  baselineTrailDistanceAtr: number;
  variantBBePadAtr: number;
  variantCBeTriggerR: number;
  variantHTrailAtr: number;
  variantITrailAtr: number;
  variantEVolThreshold: number;
  maxHoldMs: number;
}

// 12 variant evaluators + helpers
export function replayAllVariants(inputs: ReplayInputs): VirtualExit[] { ... }
function replayVariantA(...): VirtualExit  // current BE-stop
function replayVariantB(...): VirtualExit  // ATR-padded BE+
function replayVariantC(...): VirtualExit  // higher BE trigger
function replayVariantD(...): VirtualExit  // trailing instead of BE
function replayVariantE(...): VirtualExit  // vol-conditional skip
function replayVariantF(...): VirtualExit  // NO BE-stop
function replayVariantG(...): VirtualExit  // current trailing
function replayVariantH(...): VirtualExit  // tighter trail
function replayVariantI(...): VirtualExit  // looser trail
function replayVariantJ(...): VirtualExit  // NO trailing
function replayVariantK(...): VirtualExit  // NO BE + NO trail
function replayVariantL(...): VirtualExit  // ATR-padded BE+ AND looser trail
```

**Replay state machine (shared across G/H/I/L):**
```typescript
interface TrailState {
  active: boolean;
  peakPrice: number;
  trailLevel: number;
  atrMultiplier: number;
}
function updateTrailState(state, bar, side, atr): { newState: TrailState; triggered: boolean }
```

**BE-stop replay (A/B/C):** stateless level-crossing. State: `{ beLatched: bool, beLevel: number }`.

#### **File 3:** `server/services/vts-service.ts` — `persistRealPriceTrade`

Add after the JSONL write, fire-and-forget:
```typescript
import { exitStrategyReplay } from './exit-strategy-replay';

// ... existing close logic ...

// B73: async exit-strategy ablation (observation only, fire-and-forget)
exitStrategyReplay.replayAndPersist({
  tradeId: trade.id,
  tradeSource: 'vts',
  side: trade.signal.direction === 'long' ? 'BUY' : 'SELL',
  entryPrice: trade.entryPrice,
  entryTime: new Date(trade.entryTime).getTime(),
  target: trade.signal.target,
  originalStopPrice: trade.originalStopPrice,
  atr: trade.atr ?? trade.signal.atr ?? 0,
  volatility: trade.volatility ?? 0,
  regime: trade.regime,
  strategy: trade.strategy,
  baselinePnlPct: trade.netProfitPercent,
}).catch(err => console.warn('[B73][exit-replay] failed:', err.message));
```

#### **File 4:** `server/services/paper-execution-engine.ts` — close path

Same async fire-and-forget pattern at the trade-close persistence site. Uses `tradeSource: 'paper'`.

#### **File 5 (NEW):** `server/services/exit-strategy-replay-service.ts` (the orchestrator)

```typescript
async replayAndPersist(ctx: ReplayContext): Promise<void> {
  // 1. Fetch OHLC bars from cache for window: [entryTime, min(actualExit + buffer, entryTime + maxHold)]
  // 2. Run replayAllVariants(inputs)
  // 3. Bulk-insert 12 rows into exit_strategy_alternates
  // 4. Log success [B73][exit-replay] tradeId=X regime=Y winners=[...]
}
```

OHLC window per Langston Q6: `min(actualExitTime + buffer, entryTime + maxHoldMs)` — captures variants that would have held longer than actual.

#### **File 6:** `server/routes.ts` (or wherever analytics endpoints live)

```typescript
GET /api/analytics/exit-strategy-ablation?regime=<filter>&days=<int>
→ aggregates per-variant stats: n, mean_pnl, std, sharpe_score, win_rate
```

#### **File 7:** `client/src/pages/machine-learning.tsx` — new panel component

Reuses existing ablation panel patterns (sortable table, filter dropdown).

#### **File 8 (NEW):** `server/tests/unit/b73-exit-strategy-replay.test.ts`

- Per-variant tests with synthetic OHLC scenarios (price hits TP / SL / BE level / chops sideways)
- Trailing state machine tests (peak update, level computation, exit trigger)
- Edge cases: insufficient OHLC, all variants timeout, identical variants converge
- Sharpe calculation correctness on small synthetic dataset

### §B.2 Order of operations (Step 3 — TONIGHT per Kyle directive)

1. Migration SQL (table + indexes + 13 module_constants seeds)
2. New `exit-strategy-replay.ts` (12 variant evaluators + state machine)
3. New `exit-strategy-replay-service.ts` (orchestrator + DB persist)
4. Hook `vts-service.ts:persistRealPriceTrade` (current production)
5. Hook `paper-execution-engine.ts` close path (forward-compat)
6. Unit tests
7. API endpoint + UI panel (can be a follow-up commit if time-pressed; analysis works via psql until UI lands)
8. `npm run check` clean
9. Bring diff to Langston (Step 4) BEFORE push

### §B.3 Risks I'm explicitly accepting

- **No backfill** — historic trades won't have variant rows; only forward from deploy. Acceptable; we have plenty of trade volume going forward.
- **Single-process replay store** — same constraint as B67.4. Trade-close path runs in one process; replay also runs in same process.
- **API endpoint + UI may slip to follow-up commit** if pre-push time pressure is real. The TABLE will be populated regardless; analysis works via psql.
- **`b73_variant_e_vol_p75_threshold`** seeded at 0.020 placeholder. Recompute from live data post-deploy via DB UPDATE — no code redeploy.

### §B.4 Rollback plan

- DB-only kill switch: `UPDATE module_constants SET value='false' WHERE constant_name='b73_replay_enabled'` — replay service short-circuits, no rows written
- Full rollback: `git revert <commit>` + drop migration with rollback SQL
- Table data retained across rollback (harmless — just unused)

---

## §C. Open questions for Langston (Step 2 review)

1. **Variant A baseline source** — read at runtime from `trailing_exit` module_constants (so variant A always reflects current production), OR snapshot to `b73_baseline_*` constants? I leaned snapshot (separate b73_baseline_* keys) so variant A is stable across TEC tuning changes — otherwise comparisons over a multi-week window become non-stationary if TEC config drifts. Agree?
2. **`b73_variant_e_vol_p75_threshold` placeholder=0.020** — recompute from VTS pair-universe vol on deploy day, then UPDATE the constant. Methodology: `SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY indicators->>'volatility') FROM ... WHERE opened_at > now() - interval '7 days'`. Acceptable, or want the threshold re-derived periodically (e.g., per calibration window end)?
3. **OHLC cache scope** — current `ohlc-cache.ts` has a 60-min interval cache. For 1-min replay we need 1-min bars. Existing `replay-ablation.ts` already uses 1-min bars. Is the 1-min OHLC fetch path proven stable, or do we need to verify capacity for ~160 trades/day × ~120-180 bars each?
4. **Schema decision: `virtual_pnl_pct` granularity** — using `numeric(10, 4)`. Sufficient for percentages (4 decimals = 0.0001%)? Or want higher precision?
5. **API endpoint + UI deferral** — if time-pressed I might ship the table+service+hooks tonight and follow-up the API+UI tomorrow. Acceptable, or block on UI?
6. **Anything missing or wrongly scoped?**

---

*End of B73 pre-audit. On Langston approval, proceed to Step 3 implementation per §B.2 order.*
