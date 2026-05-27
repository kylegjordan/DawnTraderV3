# B79.0n.RTB — Architectural synthesis (Step 1.a comprehensive review)

**Author:** CC (with Explore-agent synthesis assist + CC code-level verification probes)
**Date:** 2026-05-27
**For:** B79.0n.RTB scope foundation (sub-batch #11 of umbrella v4, combined with former #12 RTB-REFRESH)
**Triggered by:** Kyle directive 2026-05-27 — "the scope was hastily put together; consult SIM + System Manual properly; do code-level review during audit."

This synthesis maps the ACTUAL RTB architectural surface. The prior scope draft (`commit 1aaa88348`, `B79_0n_RTB_SCOPE.md`) was based on incomplete reads and missed 3 of 4 component files plus the schema gap. This document is the corrected foundation.

---

## §1. The actual RTB surface — 4 files / 2,655 lines (not 1 file / 1,809 as prior scope assumed)

| File | Lines | Status | Role |
|---|---|---|---|
| `server/core/rtb/ready_to_buy_service.ts` | 1,809 | ACTIVE | Core unified queue + per-signal Central-Clock-synchronized FSM refresh |
| `server/services/rtb-refresh-service.ts` | 391 | **LOCKED** per Directive 8.8.4-A4.R10R-4 | BUCKET-LEVEL refresh (15s micro / 120s macro / 8 buckets + Adaptive Concurrency Tuner) |
| `server/core/rtb/rtb_queue_refresher.ts` | 144 | **DEPRECATED** (server/index.ts:1330) | Phase 8.8.4-C.6 cron-based 30s refresh — replaced by ReadyToBuyService.startRefreshCycle |
| `server/core/rtb/tcl_watchdog.ts` | 311 | ACTIVE | TCL barrier (downstream consumer; promotion gating) |

Plus 25 caller files (heavy / light / legacy classification in §6).

---

## §2. ready_to_buy_service.ts — Core queue + per-signal FSM (1,809 LOC)

**Purpose:** Authoritative unified RTB queue for SQE-qualified signals.

**Key data structures:**
- `SQESignalInput` interface — queue input (includes optional `assetClass` field stored in `metadata: jsonb`)
- `RtbSignal` interface — DB-persisted row from `rtb_signals` table
- `SignalRefreshState` interface — per-signal state (`nextRefreshAt: number`, `isRefreshing: boolean`)

**Key in-memory state:**
- `refreshIntervals: Map<TradingMode, NodeJS.Timeout>` (line 344)
- `clockTickHandlers: Map<TradingMode, (tick: ClockTick) => void>` (line 345)
- `signalRefreshStates: Map<signalId, SignalRefreshState>` (line 347)
- `engineStartTimes: Map<TradingMode, number>` (line 348)
- `tclFailsafeTriggered: Map<TradingMode, boolean>` (line 349)

**Key methods:**
- `queueSQESignal(input)` — admit SQE-qualified signal
- `getRankedSignals(mode, limit)` — sorted by FinalScore descending
- `promoteSignal(signalId, tradeId)` — mark promoted, remove from queue
- `removeSignalBySymbol(symbol, mode)` — atomic removal on trade conversion
- `cleanupExpiredSignals(mode)` — delete TTL-exceeded signals
- `reEvaluateQueue(mode)` — SQE re-validation pass
- `getQueueStats(mode)` — RTBQueueStats snapshot
- `startRefreshCycle(mode)` / `stopRefreshCycle(mode)` — lifecycle

**State machine (per-signal lifecycle):**
```
active → reconfirmed (SQE re-validation passed) → promoted (trade created) → expired (TTL or SQE fail)
parallel: isRefreshing flag prevents promotion during refresh window
```

**Cadence:** 30-second per-signal refresh via Central Clock subscription. Per-signal decay penalty linear, capped at 0.10, λ ≈ 0.03/min. Conditional geometry refresh when vol/spread shift > 5% OR age > 180s.

**Directive 11.0E FinalScore:** `FinalScore = (HybridScore × 0.4) + (Confidence × 0.3) + (RegimeWeight × 0.2) - (DecayPenalty × 0.1)`

**Asset-class awareness today:**
- ZERO per-class queueing
- `SQESignalInput.assetClass` stored in `metadata: jsonb` only (no first-class column)
- Interim: derives class from symbol via `resolveAssetClass(symbol, 'kraken')` during refresh

---

## §3. rtb-refresh-service.ts — LOCKED bucket-level refresh (391 LOC)

**🔒 LOCKED MODULE — Directive 8.8.4-A4.R10R-4 (Core System Hardening).** Per file header: "Changes require a formal directive."

**The B79.0n umbrella v4 row #11 IS the authorized override.** Citation path for the scope: "per-class RTB pool configuration authorized under B79.0n row #11."

**Authorized modifications:** per-class buckets, per-class pool sizing, per-class ACT calibration, schema extension for per-class state.

**NOT authorized (would need separate directive):** algorithmic redesign of bucket assignment, cadence changes, ACT threshold overhauls.

**Purpose:** Synchronized bucket-based refresh with Adaptive Concurrency Tuner (ACT).

**Architecture:**
- **8 global buckets** (indexes 0–7) for staggered signal distribution
- **Micro-cycle: 15 seconds** (one bucket per micro-cycle)
- **Macro-cycle: 120 seconds** (all 8 buckets) — THIS IS WHAT KYLE WAS REMEMBERING (the "60-second or 2-3 minute" cadence; the 2-min macro-cycle matches)
- **Execution:** Central Clock synchronized, NOT wall-clock cron

**Adaptive Concurrency Tuner (T5):**
- Scale UP: avgCpu < 55% AND duration < 5000ms → pool += 1 (max 10)
- Scale DOWN: avgCpu > 60% OR duration > 8000ms → pool -= 1 (min 3)
- Lag protection: lag > 2ms → force reduction
- Pool size broadcast via `poolBus.emit('POOL_UPDATE', size)` → listeners include readyToBuyService

**In-memory state:**
- `signalBuckets: Map<0..7, Set<signalId>>` (rebuilt each cycle)
- `recentCycles: CycleMetrics[]` (5-element rolling history for CPU average)
- `cpuSamples: number[]` (5-element rolling window)
- Central Clock subscription

**Boot path:** `server/index.ts:267-269` imports `rtbRefreshService` and calls `.start()` with log lines `[A4.R10R-4][INIT_OK] RTB Refresh Service started (clock-synchronized)` and `[A4.R10R-4][INIT_OK] Adaptive Concurrency Tuner active (pool=5, range=3-10)`. Shutdown at line 1425.

**Asset-class awareness today:** GLOBAL 8 buckets only. No per-class fragmentation. No per-class pool sizing or ACT calibration.

---

## §4. rtb_queue_refresher.ts — DEPRECATED (144 LOC)

**Status:** CONFIRMED LEGACY (Phase 8.8.4-C.6 deprecation). Per `server/index.ts:1330` verbatim:
```
// Phase 8.8.4-C.6: RTB Queue Refresher DEPRECATED
// The old rtbQueueRefresher is now replaced by ReadyToBuyService.startRefreshCycle()
// which is wired into the PaperExecutionEngine lifecycle (start/stop/reset)
// See: server/services/paper-execution-engine.ts lines 189-191, 237-239, 431-433
console.log('[8.8.4-C.6] RTB refresh now handled by ReadyToBuyService (engine lifecycle)');
```

**Boot path:** NOT started in boot. The deprecation log fires but no `.start()` call exists.

**Functional duplication:** Was cron-based (`*/30 * * * * *` every 30s) for cleanup + re-evaluation. Replaced by Central-Clock-synchronized version inside ReadyToBuyService.

**Disposition for B79.0n.RTB scope:** Phase 16 legacy cleanup candidate (CLAUDE.md §5 #18 — log to legacy-component review register, don't delete mid-batch). Scope §8 NOT-IN-SCOPE list.

---

## §5. tcl_watchdog.ts — Downstream consumer (311 LOC)

**Purpose:** Trade Capacity Limit watchdog. Promotion gating + activation tracking.

**Three activation mechanisms:**
1. Failsafe timer (2 min default): if engine running, activate after 120s
2. RTB threshold (15 signals default): when queue ≥ 15 unexpired signals
3. Continuous promotion loop: called every 30s via paper-execution-engine

**Synchronization barrier (Directive A3.R9.0):** TCL does NOT query RTB until refresh completes. Prevents reading mid-state-mutation.

**Boot:** Started by PaperExecutionEngine lifecycle (start/stop/reset) per-mode.

**Asset-class awareness today:** None — single TCL state per mode (paper/live). Global threshold counts across all classes.

---

## §6. Caller surface — 25 files categorized

### HEAVY callers (write queue OR read queue OR consume promotion events)
| File | Interaction |
|---|---|
| `server/services/paper-execution-engine.ts` | 12 call sites: lifecycle (start/stop), promotion check, signal ranking, TCL gating |
| `server/services/signal-orchestrator.ts` | 2 call sites: queues SQE signals via `queueSQESignal()` |
| `server/startup/trading-bootstrap.ts` | Creates engine instances managing RTB lifecycle |
| `server/lib/event-bus.ts` | Central event distribution (PROMOTION, TCL_ACTIVATED, TRADE_CLOSED) |

### LIGHT callers (type imports / constants / diagnostics)
- `server/services/fx5-scanner.ts` — RtbSignal type import
- `server/routes.ts` — API endpoints for RTB stats
- `server/storage.ts` — DB abstraction layer (`getRtbSignals`, `updateRtbSignal`, etc.)
- `server/services/validation-session-service.ts`
- `server/core/criteria-limiter.ts` — Enforces RTB queue limits
- `server/services/strategy-signal-audit-engine.ts`
- `server/services/system-audit-engine.ts`
- `server/services/c13-validation-service.ts`
- `server/services/c14-validation-service.ts`
- `server/config/ranking-weights.ts`
- `server/utils/clear-routines.ts`
- `server/services/adaptive-pool-config.ts` — POOL_UPDATE producer
- `server/startup/b72-warmup.ts` — module_constants warmup
- `server/services/data-archive/signal-eval-archiver.ts`

### Component-internal (own family)
- `server/core/rtb/ready_to_buy_service.ts` (self)
- `server/services/rtb-refresh-service.ts` (self)
- `server/core/rtb/tcl_watchdog.ts` (self)
- `server/core/rtb/rtb_queue_refresher.ts` (LEGACY — not started; cleanup candidate)

### Other
- `server/services/vts-runner.ts` — passive learning path (no RTB writes; type import only)
- `server/services/paper-portfolio-manager.ts` — portfolio state (may reference RTB for overlap checks)
- `server/tests/integration/net_expectancy.test.ts` — unit test

---

## §7. SCHEMA GAP — `rtb_signals.asset_class` column does NOT exist

**Verified via psql probe 2026-05-27:**
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'rtb_signals' ORDER BY ordinal_position;
```

Returns 25 columns: `id, mode, signal_id, symbol, strategy, entry_price, stop_price, target_price, quantity, notional, confidence, risk_score, expected_return, cwqi, status, queued_at, promoted_at, expired_at, expires_at, block_reason, promoted_trade_id, metadata, ngc, current_price, volume_24h`.

**No `asset_class` column.** The `metadata: jsonb` field MAY contain `assetClass` as a key, but it's not indexable as a first-class column.

**Implications for per-class queueing:**
1. Migration required to add `asset_class` first-class column
2. Backfill required (extract from `metadata` jsonb OR resolve via `resolveAssetClass(symbol, 'kraken')` per row)
3. Add index on `asset_class` for per-class queue reads (combined with `mode + status` likely)
4. Update INSERT path in storage.ts + readyToBuyService to populate the new column
5. Update queue READ paths to optionally filter by asset_class

**This was completely missed in the prior scope draft.** B79.0n.STORAGE batch (deployed 2026-05-21) extended asset-class plumbing across SQE / scanner / VTS surfaces but apparently did NOT touch `rtb_signals` — likely because it was scoped to scan-side tables, not the queue-side. RTB scope must close this gap.

---

## §8. Boot sequence + Central Clock dependencies

```
1. Central Clock startup (server/index.ts ~250)
   └─ Must be first; all RTB operations depend on it
2. RTB Refresh Service startup (server/index.ts:267-270)
   └─ LOCKED MODULE; ACT pool 3-10 default 5
3. Data Aggregator init (~276)
4. Paper Execution Engine start (via trading-bootstrap.ts)
   └─ readyToBuyService.startRefreshCycle(mode) subscribes RTB_{mode} to Central Clock
   └─ tclWatchdog.start(mode) subscribes TCL to Central Clock
5. Shutdown (1417-1425):
   └─ rtbRefreshService.stop()
   └─ dataAggregator.shutdown()
   └─ centralClock.stop()
```

**Per-class extension affects this boot path:** Step 2 (rtb-refresh-service) and Step 4 (readyToBuyService.startRefreshCycle) both need per-class wiring. Order matters because Step 4 subscribes to the same Central Clock that Step 2 already uses.

---

## §9. System Manual references

**Chapter 9 (line 4608+): Signal Lifecycle Audit Layer (SLAL)**
```
GENERATION → SIZING → VALIDATION → QUEUED → PROMOTED → EXECUTION → COMPLETED/REJECTED
```
RTB = QUEUED stage. Three RTB-relevant rejection reasons: `EXPIRED_SIGNAL` (TTL exceeded), `DUPLICATE_POSITION` (already have position in symbol), `SQE_QUALITY_REJECT` (failed SQE re-validation during refresh).

**Chapter 19 (line 5007+): RTB Promotion Pipeline**

Three promotion triggers:
1. TCL_ACTIVATED event
2. TRADE_CLOSED event
3. Continuous promotion loop (30s timer)

Promotion flow:
```
checkRtbPromotion()
  ├─ Check TCL active
  ├─ Calculate openSlots
  ├─ Get rankedSignals (FinalScore descending)
  ├─ For each signal:
  │  ├─ Check FinalScore ≥ 0.35 (MIN_FINAL_SCORE)
  │  ├─ Remove from queue FIRST
  │  ├─ Execute trade
  │  ├─ On success: emit PROMOTION event, update signal.tradeId
  │  └─ On fail: signal already removed ⚠ (System Manual §19.3 "Failed Promotion Not Restored" risk)
```

**Key invariants:**
- `MIN_FINAL_SCORE = 0.35` (promotion floor — class-invariant)
- Remove-from-queue happens BEFORE execution (no signal restoration if execute fails — accepted risk, mitigated by robust pre-execution validator)

---

## §10. SIM references (§4.3 + cross-refs)

**§4.3 RTB Service (line 244-250):** "Signal queue with 30-second TTL. Refreshes every 1 second to check TTL expiration. Promotes ready signals to TCL. Phase 14.5: getTopSignal() ranks by rankingScore from metadata instead of FinalScore alone. FinalScore gap safety rule: if gap > 0.10 between two signals, FinalScore wins."

**§4.4 TCL Watchdog (line 252-258):** "Ranks candidates by FinalScore. Triggers on 2-minute timeout or 15-signal accumulation. 1.5-second monitoring loop."

**Upstream/Downstream for RTB Service per SIM:**
- Upstream: SQE qualified signals, Central Clock 1-second refresh, ranking-weights.ts (FINAL_SCORE_GAP_OVERRIDE)
- Downstream: TCL Watchdog (promoted signals with enriched metadata)
- Blast Radius: MEDIUM — signal aging, selection timing, cross-family ranking

**Risk per SIM:** RTB Service's `checkRtbPromotion` removes from queue BEFORE execution. If execution fails, signal lost. Mitigation: robust pre-exec validator in trade-safety.ts.

---

## §11. What per-class extension requires (per file)

### ready_to_buy_service.ts
- Per-class queue partitioning: either nested-map `Map<TradingMode, Map<AssetClass, ...>>` OR per-class filter on read
- Per-class FSM state machine (currently single-FSM; needs class-aware state transitions)
- Per-class `getRankedSignals(mode, assetClass?, limit)` signature
- Per-class queue stats accessor
- 4-of-4 active classes wired

### rtb-refresh-service.ts (LOCKED — authorized by umbrella v4 row #11)
- Per-class bucket allocation: `signalBuckets: Map<AssetClass, Map<0..7, Set<signalId>>>` OR 8 buckets globally with assetClass-tagging
- Per-class pool sizing IF different classes have different load characteristics (open Q for Langston Step 2 — empirically may not need per-class ACT)
- Per-class refresh cadence (per Kyle: uniform 30s default; locked)
- Per-class macro-cycle integrity (each class completes 8-bucket cycle in 120s)

### rtb_queue_refresher.ts
- NO per-class work — it's legacy. Phase 16 cleanup candidate.

### tcl_watchdog.ts
- v1: TCL stays GLOBAL (per Langston pre-scope ACK — correctness barrier not throughput throttle)
- Per-class TCL is a separate architectural conversation, not in this batch
- BUT: TCL threshold logic must remain valid across per-class queue depths (e.g., "15 signals" is now interpreted as total across classes, not per class)

### `rtb_signals` table schema
- ADD `asset_class` first-class column with NOT NULL constraint + default 'crypto_spot' for backfill
- Add index on `(mode, asset_class, status)` for hot-read path
- Backfill column from `metadata->>'assetClass'` jsonb extraction OR `resolveAssetClass(symbol, 'kraken')` per row
- Update Drizzle schema + insertRtbSignal builder
- Update storage.ts query path

---

## §12. Risk classifications (updated from prior scope)

Prior scope had 8 risks (R-1 to R-8). New surface adds:

**R-9 (HIGH — NEW)** — Schema migration on `rtb_signals` table is a production-data migration on a hot live table. ALTER TABLE + backfill of asset_class column risks blocking writes during backfill. Mitigation: ADD COLUMN nullable first, deploy code that writes both metadata.assetClass AND the new column, backfill in background, then ADD NOT NULL constraint. Two-phase migration similar to B-NEW-35 promote-then-retire pattern.

**R-10 (MEDIUM — NEW)** — LOCKED-module modification to `rtb-refresh-service.ts` per Directive 8.8.4-A4.R10R-4. Scope must cite the override directive (B79.0n umbrella v4 row #11) explicitly + Step 4 code review must validate the modification stays within the AUTHORIZED scope (per-class bucket alloc + per-class pool sizing + per-class ACT calibration). Modifications outside that scope (algorithmic redesign, cadence changes, ACT threshold overhauls) require a SEPARATE directive — not in this batch.

**R-11 (MEDIUM — NEW)** — Bucket distribution algorithm. Current is hash-mod-8 across all signals globally. Per-class extension options: (a) per-class 8 buckets each (4 classes × 8 = 32 buckets) increasing ACT complexity, OR (b) global 8 buckets with assetClass tagging preserving bucket count. Choice affects ACT design + macro-cycle timing guarantees. Open Q for Langston Step 2 pre-audit.

**R-12 (LOW — NEW)** — `rtb_queue_refresher.ts` cleanup. Legacy file with no active boot path but still imported by some files (e.g., its module is required somewhere). Phase 16 cleanup candidate — log to legacy-component review register per CLAUDE.md §5 #18 + flag in NOT-IN-SCOPE §8.

(Prior R-1 to R-8 carry over with updated context.)

---

## §13. What the prior scope (commit 1aaa88348) missed — explicit revision list

1. **Scope of "the file" claim:** Prior scope said "1809 lines" referring only to `ready_to_buy_service.ts`. Actual surface is **4 files / 2,655 LOC** (1809 + 391 + 144 + 311).

2. **`rtb-refresh-service.ts` not in scope:** Entirely missed. This is the LOCKED bucket-level refresh service — Kyle's actual "60s / 2-3min" memory matches the 120s macro-cycle here, not the 30s in ready_to_buy_service.

3. **`rtb_queue_refresher.ts` not in scope:** Legacy cleanup candidate.

4. **`tcl_watchdog.ts` not in scope:** Downstream consumer with 3 activation mechanisms.

5. **Schema gap:** `rtb_signals.asset_class` column missing — major migration required.

6. **LOCKED-module override path:** Prior scope didn't cite Directive 8.8.4-A4.R10R-4 or how B79.0n row #11 authorizes the modification.

7. **Caller surface count:** Prior scope said "15 files" (a TELEMETRY-style number). Actual is 25 files. Heavy/light/legacy categorization needed.

8. **Migration complexity:** Prior scope said "no DB migration." Actual scope requires a non-trivial production migration on a hot table (ADD COLUMN + backfill + ADD NOT NULL + index).

9. **Adaptive Concurrency Tuner (ACT):** Prior scope didn't mention. Per-class extension implications: does each class get its own ACT pool, or shared global pool with per-class accounting?

10. **Boot sequence dependencies:** Prior scope didn't enumerate the 5-step boot path that needs per-class wiring at multiple points.

---

## §14. Recommended scope structure (for the rewrite)

The new scope file (`B79_0n_RTB_SCOPE.md` v2) should expand to address ALL of the above:

- **§0 inventory** — 4 files + caller surface + schema gap + locked-module status
- **§1 motivation** — combine RTB + RTB-REFRESH + RTB-REFRESH-SERVICE + locked-module override path citation
- **§2 numbered objectives** — at least 11 (covering all 4 files + schema migration + ACT decision)
- **§3 architectural decisions + open questions** — per-class bucket alloc choice (a) vs (b), ACT per-class vs global, transition uniform, TCL stays global, ARM zero, schema backfill strategy
- **§4 test plan** — expanded to cover bucket-level isolation, ACT behavior under per-class load, locked-module preservation of behavior outside per-class extension
- **§5 risks** — R-1 through R-12 enumerated
- **§6 verification criteria** — pre-deploy + Step 7 + Step 8 + 48h verify-gate (queue depth per-class + bucket depth per-class)
- **§7 sequencing** — likely ~12-14 chunks given 4-file + migration surface
- **§8 NOT-IN-SCOPE** — explicit legacy-cleanup deferral + locked-module-outside-authorized-scope deferral
- **§9 open Qs for Langston** — bucket-alloc choice, ACT scope, R-9 migration phasing, rtb_queue_refresher disposition

---

## §15. Confidence check + next step

CC confidence in this synthesis: HIGH on the 4-file + schema + boot-sequence + locked-module findings (all directly verified via code reads + psql probe). MEDIUM on caller-depth categorization (verified by name but not by deep call-site analysis for every file). LOW on the per-class bucket-alloc choice (a) vs (b) — that's an architectural decision for Langston Step 2 pre-audit.

**Next step:** Rewrite `B79_0n_RTB_SCOPE.md` v2 using this synthesis as foundation. Re-dispatch to Langston for Step 1 ACK on the v2 scope. Then Step 2 pre-audit goes deeper on (a) the bucket-alloc choice, (b) the migration phasing per R-9, (c) the LOCKED-module-modification boundary, (d) the full 25-file caller-depth probe.
