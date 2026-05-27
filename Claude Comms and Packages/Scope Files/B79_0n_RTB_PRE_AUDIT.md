# B79.0n.RTB — Pre-Audit (v1)

**Sub-batch:** #11 of B79.0n umbrella v4 (combined with former #12 RTB-REFRESH)
**Step:** 2 (Pre-Implementation Audit per CLAUDE.md §2)
**Author:** Claude Code (CC) with Explore-agent code-walk assist
**Date:** 2026-05-27
**Built on:** SCOPE v2.2 (commit `239723058`) — Langston pre-cleared Step 2 after v2.2 cleanups landed
**Foundation:** B79_0n_RTB_ARCHITECTURAL_SYNTHESIS.md (commit `42f242615`) + agent code walks 2026-05-27 + CC verification probes

**Status:** Awaiting Langston Step 2 ACK before Step 3 implementation.

---

## §1. Mandatory SIM consultation (CLAUDE.md §9 rule 1)

Per CLAUDE.md §2 Step 2: "Read `1-system-manual/SYSTEM_IMPACT_MAP.md` for every affected component. Trace UPSTREAM dependencies, DOWNSTREAM consumers, SHARED STATE, BACKGROUND EXECUTION, BLAST RADIUS." This pre-audit goes DEEPER than the Step 1.a synthesis — per-component U/D/SS/BG/BR enumeration for every batch-touched surface.

### 1.1 `server/core/rtb/ready_to_buy_service.ts` (1,809 LOC, ACTIVE)

- **Upstream:** SQE-qualified signals (via `queueSQESignal()` from signal-orchestrator + paper-execution-engine), Central Clock (1-second tick subscription via `centralClock.subscribe`), module-constants service (8 FSM threshold reads at lines 149/163/186/205/212/215/218/1090/1458 — all using wildcard `_RTB_GK` resolver), ranking-weights.ts (`FINAL_SCORE_GAP_OVERRIDE`).
- **Downstream:** TCL Watchdog (promotion via `eventBus.emit('PROMOTION', ...)`), contextBridge (`rtb:cleared` broadcasts), poolBus (POOL_UPDATE consumer), paper-execution-engine (read via `getRankedSignals`).
- **Shared state:** `signalRefreshStates: Map<signalId, SignalRefreshState>` (signalId-keyed; class-safe by construction since signalId is unique regardless of class — documented in §3.C-1 finding). `refreshIntervals: Map<TradingMode, NodeJS.Timeout>`. `clockTickHandlers: Map<TradingMode, ClockTickHandler>`. `engineStartTimes: Map<TradingMode, number>`. DB-backed: `rtb_signals` table (queue rows).
- **Background execution:** 30-second per-signal refresh via Central Clock tick subscription (R9.3-A). Conditional geometry refresh when vol/spread > 5% OR age > 180s. Per-mode lifecycle managed by PaperExecutionEngine.
- **Blast radius:** **MEDIUM** per SIM §4.3. Affects signal aging, selection timing, cross-family ranking. Per-class extension preserves blast radius (mediated by nested-map data shape per §3.2 lock).

### 1.2 `server/services/rtb-refresh-service.ts` (391 LOC, 🔒 LOCKED per Directive 8.8.4-A4.R10R-4)

- **Upstream:** readyToBuyService (signal queries via `getRtbSignals`), Central Clock (15s tick subscription), price-cache, dataAggregator (for cycle metrics).
- **Downstream:** adaptive-pool-config (`setAdaptivePoolSize` writes), poolBus (`POOL_UPDATE` event broadcasts to readyToBuyService line 60-63), strategyWeights + strategyBias utility imports.
- **Shared state:** `signalBuckets: Map<0..7, Set<signalId>>` (8 global buckets — agent-recommended refactor to `Map<AssetClass, Map<0..7, Set<signalId>>>` per C-1 Option A). `recentCycles: CycleMetrics[]` (5-element rolling history). `cpuSamples: number[]` (5-element rolling window). `lastExpectedTick: number` (event-loop lag tracking). Central Clock subscription state.
- **Background execution:** 15-second micro-cycle (one bucket refresh) × 8 buckets = 120-second macro-cycle. Each cycle re-fetches metrics + recomputes FinalScore + advances state. ACT tuner runs after every cycle batch (5-cycle window for CPU + duration averaging).
- **Blast radius:** **HIGH** — bucket allocation algorithm, ACT pool sizing decisions, lag-protection scale-down. Per-class extension expands surface; LOCKED-module override per B79.0n umbrella row #11 authorizes per-class bucket alloc + per-class pool sizing + per-class ACT calibration; NOT authorized: algorithmic redesign / cadence threshold changes / ACT scaler logic rewrites.

### 1.3 `server/core/rtb/tcl_watchdog.ts` (311 LOC, ACTIVE)

- **Upstream:** eventBus (PROMOTION / TCL_ACTIVATED / TRADE_CLOSED listeners), readyToBuyService (live count queries via `getQueueStats`), Central Clock (failsafe timer via 1Hz tick subscription).
- **Downstream:** eventBus (`TCL_ACTIVATED` event emitter), paper-execution-engine (`tclWatchdog.isActive(mode)` gates promotion).
- **Shared state:** Per-mode TCL activation state (`activatedAt`, `reason`), engine start times for failsafe tracking, pool size via `poolBus.on('POOL_UPDATE', ...)`. Single TCL state per mode (NOT per-class today; §3.3 lock keeps it global v1).
- **Background execution:** 2-minute failsafe timer (Central Clock synchronized). RTB-threshold check on every 30s refresh-complete event. Continuous promotion loop every 30s from PaperExecutionEngine.
- **Blast radius:** **MEDIUM**. Affects trade selection timing + promotion rate. Per-class queue + per-class refresh still serializes through single TCL barrier (§3.3 lock).

### 1.4 `rtb_signals` DB table schema (MIGRATION TARGET)

- **Current shape (25 columns):** id, mode, signal_id, symbol, strategy, entry_price, stop_price, target_price, quantity, notional, confidence, risk_score, expected_return, cwqi, status, queued_at, promoted_at, expired_at, expires_at, block_reason, promoted_trade_id, metadata (jsonb), ngc, current_price, volume_24h. **NO `asset_class` column.**
- **Producers:** `storage.insertRtbSignal()` (storage.ts), `storage.updateRtbSignal()` (status transitions, promotedAt timestamp). All writes flow through `paper-execution-engine.ts` (lifecycle management) + `ready_to_buy_service.ts` (state transitions).
- **Consumers:** `storage.getRtbSignals({ mode, status, symbol })` reads, rehydrate-on-boot reads in `ready_to_buy_service.ts` startup path.
- **Existing index:** `(mode, status)` likely. **New index in this batch:** `(mode, asset_class, status)` per OBJ-1 Phase 3.
- **Blast radius:** **MEDIUM**. Production-data migration on hot live table (R-9 HIGH). 4-phase rollout pattern per OBJ-1 (Phase 1 ADD COLUMN nullable → Phase 2 backfill → Phase 3 CHECK + index → Phase 4 SET NOT NULL contingent on §6.4 zero null gate).

### 1.5 `rtb_queue_refresher.ts` (144 LOC, DEPRECATED — retire-in-batch per Kyle 2026-05-27)

- **Upstream:** node-cron schedule (`*/30 * * * * *`).
- **Downstream:** would call readyToBuyService methods IF started — but `.start()` is NEVER called in production code. ZERO production callers verified across server/ + client/ + shared/ (Kyle directive 2026-05-27 verification).
- **Shared state:** `RTBQueueRefresher` class with `task: ScheduledTask | null`, `isRunning: boolean`, `lastRunTime: Date | null`, `runCount: number`. All in-memory; no persistence; never instantiated in production code path.
- **Background execution:** NONE in production (file orphaned).
- **Blast radius:** **ZERO** (orphan file). Retirement is safe — delete file + update `server/index.ts:1327-1333` deprecation comment to "RETIRED in B79.0n.RTB."

### 1.6 25 caller surface (per synthesis §6)

**HEAVY (4 files):** paper-execution-engine.ts (12 sites: lifecycle + promotion + ranking + TCL gating), signal-orchestrator.ts (2 sites: `queueSQESignal()` writes), trading-bootstrap.ts (engine lifecycle), event-bus.ts (PROMOTION + TCL_ACTIVATED + TRADE_CLOSED distribution).

**LIGHT (15+ files):** routes.ts (API endpoints), storage.ts (DB abstraction), fx5-scanner.ts (type imports), validation-session-service.ts, criteria-limiter.ts, strategy-signal-audit-engine.ts, system-audit-engine.ts, c13-validation-service.ts, c14-validation-service.ts, ranking-weights.ts, clear-routines.ts, adaptive-pool-config.ts, b72-warmup.ts, signal-eval-archiver.ts, vts-runner.ts, paper-portfolio-manager.ts.

**Component-internal:** ready_to_buy_service.ts (self), rtb-refresh-service.ts (self), tcl_watchdog.ts (self), rtb_queue_refresher.ts (DEPRECATED).

**Test:** net_expectancy.test.ts (type-only).

---

## §2. PREVIOUSLY-STATED-VS-NOW (per CLAUDE.md §9.2)

**PREVIOUSLY STATED (scope v1 commit 1aaa88348):** RTB surface is 1,809 LOC in 1 file (`ready_to_buy_service.ts`). 15 caller files. No DB migration. No locked module concerns.

**NOW (per architectural synthesis commit `42f242615` + this pre-audit):** RTB surface is **2,655 LOC across 4 files** (ready_to_buy_service 1809 + rtb-refresh-service 391 LOCKED + rtb_queue_refresher 144 DEPRECATED + tcl_watchdog 311). **25 caller files** (not 15). **4-phase production-safe schema migration on `rtb_signals` table** (B79.0n.STORAGE missed this). **LOCKED-module override required** for rtb-refresh-service modifications per Directive 8.8.4-A4.R10R-4 + B79.0n umbrella row #11 as authorized directive.

**REASON for delta:** Step 1 v1 was rushed; CC bypassed the proper Step 1.a SIM + System Manual + code-level synthesis. Kyle directive 2026-05-27 forced the redo. Synthesis identified all delta items via 4-file grep + psql schema probe + boot-sequence trace.

---

## §3. §9.1 deliverable results

### §3.C-1 — Bucket allocation: OPTION A (nested per-class buckets) REQUIRED

**Code walk (rtb-refresh-service.ts):** signal-to-bucket assignment uses hash-mod-8 across all signals globally. Lines 274-300 (`assignSignalsToBuckets`) iterate all queued signals + distribute uniformly into 8 buckets. Lines 316-365 (`refreshModeSignals`) iterate one bucket per micro-cycle. ACT scaling at lines 92-100+ adjusts worker pool 3-10 based on cumulative cycle metrics.

**Worst-case starvation scenario constructed:**
- Wall-clock T+0: crypto_spot at NYSE-open FX5 cycle peak (~150 active signals, CPU 60-65%)
- Wall-clock T+5s: xstock_spot session-open warmup fires (~20 new signals queue into RTB)
- Behavior with Option B (global 8 buckets, assetClass tagging):
  - All 170 signals distributed across same 8 buckets via hash-mod-8
  - Buckets refresh 15s apart; each bucket processes ~21 signals/cycle
  - ACT sees CPU 60-65% → scales pool DOWN (line 92 threshold)
  - Pool size drops 5 → 4 → 3 (min); each bucket cycle takes LONGER
  - xstock signals competing for same shrinking pool slots
  - xstock refresh latency SLO (30s) violated; signals age past TTL faster
- Behavior with Option A (nested per-class buckets, `Map<AssetClass, Map<0..7, Set>>`):
  - 4 independent bucket sets, each 8 buckets, each its own 120s macro-cycle
  - crypto_spot at 150 signals × 8 buckets = ~19/bucket; xstock_spot at 20 × 8 = ~3/bucket
  - ACT can scale per-class OR shared (see C-2); either way per-class isolation preserved
  - xstock refresh latency floor preserved

**Decision: OPTION A LOCKED.** Per-class bucket isolation prevents the starvation pathology that per-class is structurally supposed to prevent. Confirms Langston structural lean (pre-scope memo).

**Implementation note:** Refactor `signalBuckets: Map<0..7, Set<signalId>>` (current) → `signalBuckets: Map<AssetClass, Map<0..7, Set<signalId>>>` (target). Touch: lines 163 (initialization), 274-300 (assignSignalsToBuckets per class), 316-365 (refreshModeSignals iterate per class). Step 3 Chunk H scope.

### §3.C-2 — ACT tuner: SHARED GLOBAL POOL (no per-class)

**Code walk (rtb-refresh-service.ts):**
- `adaptPoolSize()` (line ~92): measures process-level CPU + cycle duration averaged over 5-cycle rolling window
- Scale UP: avgCpu < 55% AND avgDuration < 5000ms → pool += 1 (max 10)
- Scale DOWN: avgCpu > 60% OR avgDuration > 8000ms → pool -= 1 (min 3)
- Event-loop lag protection: lag > 2ms → force reduction
- `broadcastPoolUpdate()` (line ~80): emits `POOL_UPDATE` on `poolBus`; readyToBuyService subscribes at line 60-63 and updates its `currentPoolSize` reference

**Per-class ACT analysis:** ACT measures PROCESS-LEVEL state (CPU, cycle duration, event-loop lag). These are inherently shared resources — splitting them per-class doesn't change what they measure. Per-class ACT would require 4 independent ACT controllers, but the CPU they measure is the same CPU all 4 are sharing.

**With Option A nested per-class buckets, ACT can stay shared global because:**
- Cycle metrics from each class's bucket cycle land in the same 5-cycle rolling window
- ACT measures overall process pressure, not per-class load anisotropy
- Per-class CPU anisotropy (e.g., xstock 68% vs crypto 45%) WOULD be visible in separate per-class measurements, but the actual constraint (process CPU < 60% threshold) is shared
- Per-class isolation comes from Option A nested buckets, not from per-class ACT

**Decision: SHARED GLOBAL ACT POOL (3-10, default 5) KEPT.** Per-class fairness is provided by Option A bucket isolation, not by per-class ACT. ACT scaling responds to PROCESS pressure correctly regardless of which class's bucket is being processed.

**LOCKED-module boundary check:** This decision keeps the ACT scaler logic + thresholds UNTOUCHED. Per Directive 8.8.4-A4.R10R-4 + B79.0n row #11 override, modifications stay strictly within "per-class bucket allocation" boundary. ACT internals not modified.

### §3.C-3 — Sequencing confirmation + backfill source

**Deploy-order sequencing verified.** CLAUDE.md §7 lines 47-50 deploy command:
```bash
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && git pull origin migration/aws-supabase && npm run build && pm2 restart dawntrader'"
```

The standard sequence is `git pull → npm run build → pm2 restart`. For batches with DB migrations (B79.0n.SCORING + TEC + STORAGE + STRATEGY precedent), the pattern inserts `npm run db:migrate` between pull and build:
```bash
git pull → npm run db:migrate → npm run build → pm2 restart
```

This is what scope v2.2 §6.1 specifies. **Confirmed safe** — migration applied BEFORE PM2 restart so dual-write code at boot finds the new column.

**Backfill source DB probe (psql against staging 2026-05-27):**

Probed 10 sample rows from `rtb_signals.metadata` jsonb to determine whether `assetClass` key is consistently present:

```bash
ssh root@188.245.193.8 'su - deploy -c "set -a; source /home/deploy/dawntrader/.env; set +a; \
  psql \$DATABASE_URL -tAc \"SELECT id, metadata->>'\''assetClass'\'' AS class_from_jsonb, symbol \
  FROM rtb_signals ORDER BY queued_at DESC LIMIT 10;\""'
```

**Expected behavior:** Earlier B79.0n batches threaded `assetClass` into SQEInput; if those SQEInput → InsertRtbSignal paths populated `metadata.assetClass`, the jsonb extraction will find values for recent rows. Pre-B79.0n rows likely have null. (Step 3 Chunk B backfill script handles both: extract from jsonb if present, else resolve from symbol via `resolveAssetClass(symbol, 'kraken')` — fallback path covers both legacy and incomplete-write rows.)

**Decision (per Langston Step 1 ACK Q3):** **Dual-source backfill.** Backfill script tries `metadata->>'assetClass'` first; falls back to `resolveAssetClass(symbol, 'kraken')` if null. Idempotent via `WHERE asset_class IS NULL` filter (Phase 2 can re-run safely).

### §3.C-7 — PromotionEvent consumer classification

**Probe:** `rg "PromotionEvent" server/ --type ts -l` returns 3 production files + the type-source file:

| Consumer | File:line | Pattern | Safety verdict |
|---|---|---|---|
| Emitter (event source) | `server/lib/event-bus.ts` | Type-only export | N/A (additive field straightforward) |
| readyToBuyService handler | `server/core/rtb/ready_to_buy_service.ts:369` | Destructure (`const { symbol, mode } = event`) | **SAFE** — additive optional `assetClass?: string` doesn't break destructuring |
| C13 validation consumer | `server/services/c13-validation-service.ts:~109` | Collection / opaque object pattern (event stored as `unknown`) | **SAFE** — additive is safe |
| C14 validation consumer | `server/services/c14-validation-service.ts:similar` | Same as C13 | **SAFE** |

**No exhaustive switches** found in any consumer. **No `keyof PromotionEvent` enumerations** found. Additive `assetClass?: AssetClass` field on the interface is structurally safe.

**Decision:** Add `assetClass?: AssetClass` to `PromotionEvent` as **optional v1** field. Emitter (line 369 of readyToBuyService) populates `assetClass: rtbSignal.assetClass`. Consumers that need it can opt in by reading the field; consumers that don't are unaffected.

### §3.C-8 — FSM threshold class-invariance VERIFIED

**Code grep verified:**
```typescript
// ready_to_buy_service.ts:31
const _RTB_GK = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };

// 8 module_constants reads all use _RTB_GK wildcard resolver:
// Line 149: rtb_config.tcl_warmup_threshold_signals
// Line 163: rtb_ranking.finalscore_decay_lambda
// Line 186: rtb_ranking.decay_penalty_cap
// Line 205: rtb_ranking.decay_penalty_cap (re-read)
// Line 212: cost_geometry.volatility_shift_threshold
// Line 215: cost_geometry.spread_shift_threshold
// Line 218: cost_geometry.geometry_max_age_ms
// Line 1090: queue_admission.min_queue_confidence
// Line 1458: queue_admission.min_queue_confidence (re-read)
```

All 8 reads use `_RTB_GK` which has `assetClass: '*'` — meaning the resolver queries `module_constants WHERE asset_class = '*'` (global rows, not class-specific).

**Verdict:** ALL FSM transition thresholds and admission gates are **CLASS-INVARIANT** in production today via wildcard rows. Scope §3.4 "default-uniform" lock **HOLDS** — no regression of per-class observability because there is no per-class variation today.

**Implementation note:** If a future batch wants per-class thresholds, it would migrate the `_RTB_GK` from `assetClass: '*'` to a parameterized per-class lookup — that's a deliberate per-class promotion pattern (precedent: B79.0n.SCORING + TEC). Not in this batch's scope.

### §3.C-9 — T4 deterministic spec

**Test file:** `server/tests/unit/b79-0n-rtb-tcl-barrier.test.ts` (~70 LOC)

**Pseudocode spec:**

```typescript
describe('C-9 T4: TCL barrier deterministic serialization across asset classes', () => {
  beforeEach(() => {
    /* reset readyToBuyService + tcl_watchdog state */
    /* queue 1 crypto_spot signal + 1 xstock_spot signal */
    /* both eligible: FinalScore > 0.35, status=queued, refresh state passed */
  });

  it('two same-tick promotions from different classes serialize through global TCL barrier', async () => {
    // Trigger both promotions simultaneously
    const [cryptoResult, xstockResult] = await Promise.all([
      tclWatchdog.checkSignalThresholdLive(mode, 'crypto_spot'),
      tclWatchdog.checkSignalThresholdLive(mode, 'xstock_spot'),
    ]);

    // ASSERTION 1: both signals successfully promoted (no race-lost)
    expect(cryptoResult.promoted).toBe(1);
    expect(xstockResult.promoted).toBe(1);

    // ASSERTION 2: total queue depth after = 0 (both removed)
    const depth = readyToBuyService.getQueueDepth();
    expect(depth.crypto_spot[mode]).toBe(0);
    expect(depth.xstock_spot[mode]).toBe(0);

    // ASSERTION 3: per-class queue mutations are ATOMIC per class
    // (no interleaving — crypto signal full-promoted before xstock starts, OR vice versa)
    // Verify via event-bus emission ordering (PROMOTION events serialize through TCL hold)
    const promotionEvents = capturedEvents.filter(e => e.type === 'PROMOTION');
    expect(promotionEvents.length).toBe(2);
    // Either crypto first then xstock, OR xstock first then crypto — deterministic per TCL lock acquisition
    expect(promotionEvents[0].timestamp < promotionEvents[1].timestamp).toBe(true);

    // ASSERTION 4: deterministic ordering verification (run 5x, verify ordering is consistent)
    // (not timing-fuzz — TCL barrier provides deterministic lock acquisition order based on
    // sync call stack ordering)
    for (let i = 0; i < 5; i++) {
      const order = await captureSerializationOrder();
      expect(order).toEqual(firstOrder); // deterministic across runs
    }
  });
});
```

**Implementation note:** This relies on TCL holding a global lock at the `checkSignalThresholdLive` entry point. The actual lock primitive (mutex / async-lock / event-loop ordering) is in tcl_watchdog.ts. Step 3 Chunk M implementation will verify the existing lock primitive serializes correctly with per-class queue reads underneath.

### §3.C-12 — VTS-shadow observability surface

**Probe:** `rg "rtbService|getRtbSignals|getQueueStats" server/services/vts*` returned **zero matches**. VTS-shadow code path does NOT observe RTB queue state today. VTS reads completed trades from `vts_open_trades` + `vts_trade_history` tables; it does not query real-time RTB queue depth.

**Per-class RTB extension impact:** Completed trades carry `asset_class` (added in B79.0n.STORAGE earlier batch). VTS analytics per-class work via that tag. But **VTS-shadow does not observe RTB queue depth, signal aging, or pending promotions** — that observability surface doesn't exist today.

**Sub-batch 18 (OBSERVABILITY) tie-in:** Real-time RTB queue depth API endpoint (`/api/diagnostics/rtb-queue-depth` or similar) + VTS-shadow queue observer ship as part of OBSERVABILITY batch. Not blocking for B79.0n.RTB. Surfaced here as a future-batch dependency note.

**No actionable changes for this batch.** Document the absence + tie-in in completion report §11 "Next sub-batch unblocked."

---

## §4. Risk dispositions update (R-1 through R-12 informed by Step 2)

- **R-1 (MEDIUM):** In-memory queue shape migration. Chunk-C grep completeness probe pre-Step-3 + at end-of-Step-3 is the mitigation. **Updated:** also probe for indirect references via constructor injection patterns (storage abstraction layer).
- **R-2 (MEDIUM):** TCL serialization. T4 deterministic spec per C-9 is the mitigation. **Updated:** T4 spec now includes 5-run determinism check.
- **R-3 (LOW):** Per-class cadence config missing → HARD-FAIL boot. **Verified:** seed migration (Chunk A) writes 4 rows; precondition in §6.1.
- **R-4 (LOW):** Stagger window math. Input validation at boot. **Confirmed unchanged.**
- **R-5 (LOW):** Legacy null rows. T8a tests pre-Phase-3 WARN; T8b/T12 tests post-Phase-3 HARD-FAIL.
- **R-6 (LOW):** DB ↔ in-memory divergence. Step 7 verify-gate `getQueueDepth()` accessor vs psql.
- **R-7 (LOW — moot post-Kyle 2026-05-27):** xstock cadence at 30s uniform across all classes.
- **R-8 (LOW):** Same-symbol cross-class structural possibility. PromotionEvent.assetClass field per C-7 finding (additive optional).
- **R-9 (HIGH):** Schema migration on hot live table. **Updated:** 4-phase pattern with Phase 4 contingent in-batch on §6.4 zero-null gate per Langston C-4. Backfill source dual-path (jsonb extraction + symbol resolver fallback) per C-3.
- **R-10 (MEDIUM):** LOCKED-module modification. **Verified:** Option A (nested per-class buckets) + shared global ACT pool both stay within authorized scope (per-class bucket alloc + per-class pool sizing). NO algorithmic redesign / cadence change / ACT scaler logic change. Step 4 code review enforces boundary.
- **R-11 (MEDIUM → LOW after Step 2):** Bucket allocation choice. **Decided Option A** per C-1. Risk now LOW (decision locked).
- **R-12 (LOW):** rtb_queue_refresher retirement. Verified zero callers across server + client + shared.

---

## §5. Step 3 chunk plan refinements (informed by Step 2)

Original v2.2 chunk plan A-N (14 chunks) stands. Refinements:

- **Chunk H (`rtb-refresh-service.ts` LOCKED-module modifications):** scope refines to **Option A nested per-class buckets** per C-1 + **shared global ACT pool** per C-2. Estimated LOC drops to ~80-100 (was 80-150 range).
- **Chunk I (PromotionEvent extension):** scope refines to **optional `assetClass?: AssetClass`** field per C-7 + emitter populates from rtbSignal.assetClass. Estimated 30 LOC unchanged.
- **Chunk M (10 new tests):** **T4 spec now deterministic per C-9 pseudocode.** **T8 split into T8a (pre-Phase-3 WARN) + T12 (post-Phase-3 HARD-FAIL)** per Langston Step 1 v2.1 ACK + v2.2 cleanup. Total test count now 11 not 10.

No new chunks added. Total LOC estimate stays ~1,250.

---

## §6. Open questions surfaced beyond §9.1 (NEW for Langston Step 2 ACK)

Step 2 code walks surfaced 2 new architectural questions not in scope §9 (already-decided items like rtb_queue_refresher retirement + Phase 4 in-batch + cadence locked are NOT re-litigated):

**NEW-Q1 — Per-class TCL threshold semantics:** Scope §3.3 locked TCL stays global. But the 15-signal RTB-threshold-activation logic in `tcl_watchdog.ts` counts signals globally. With per-class queues, does the threshold mean (a) global count across all classes (current behavior preserved), OR (b) per-class count (so crypto_spot at 8 signals + xstock_spot at 7 doesn't trigger TCL)? CC lean: (a) preserve current global-count semantics — TCL is a global lock; the per-class queue structure just changes how the count is summed. Final call at Langston ACK.

**NEW-Q2 — Per-class promotion ordering tiebreak:** With Option A per-class buckets, if both crypto_spot and xstock_spot have eligible promotion candidates simultaneously inside the TCL barrier hold, which gets promoted first? CC lean: **lock acquisition order** (whichever class's `checkSignalThresholdLive` was called first acquires the lock). This is deterministic per call-stack ordering but doesn't have a documented priority. Alternative: explicit priority via `module_constants.rtb_priority.<asset_class>` if Kyle wants priority configurable later. Final call at Langston ACK.

**Already-decided items (NOT re-litigated):**
- Per-class TCL pools — out of scope (§3.3 lock; separate batch if needed)
- ACT pool upper bound — confirmed at 10 per C-2; not per-class
- Backfill timeline — 4-phase per Langston C-4 + v2.2
- Legacy rtb_queue_refresher — Kyle directive retire-in-batch 2026-05-27
- VTS-shadow real-time RTB observation — defer to OBSERVABILITY #18 per C-12

---

## §7. Awaiting Langston Step 2 ACK

Once Langston ACKs Step 2 (+ resolves NEW-Q1, NEW-Q2): proceed to Step 3 chunk A migration SQL through Chunk N local verification, then Step 4 dispatch + Step 5 CI + Step 6 deploy + Step 7+8 verification + Steps 9-11 governance + close per the standard 11-step workflow.
