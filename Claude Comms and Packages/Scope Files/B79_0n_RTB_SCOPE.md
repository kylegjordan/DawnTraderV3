# B79.0n.RTB — Scope (v2)

**Sub-batch:** #11 of 18 in B79.0n umbrella v4 (COMBINED with former #12 RTB-REFRESH per pre-scope ACK 2026-05-27; slot #12 stays OPEN/RESERVED)
**Batch type:** Phase 24 — asset-class onboarding (active-trading wire-in for xStocks)
**Author:** Claude Code (CC)
**Date drafted:** 2026-05-27 (v1 superseded; v2 rewrite per Kyle directive after comprehensive Step 1.a synthesis)
**Status:** Step 1 draft, awaiting Langston ACK
**Foundation:** `B79_0n_RTB_ARCHITECTURAL_SYNTHESIS.md` (commit `42f242615`) — comprehensive Step 1.a code-level + SIM + System Manual review

**v2 rewrite rationale.** Scope v1 (`commit 1aaa88348`) was rushed and missed 3 of 4 RTB component files, the schema gap on `rtb_signals`, the LOCKED-module status on rtb-refresh-service.ts, and the legacy rtb_queue_refresher.ts file. Kyle directive 2026-05-27: "the scope was hastily put together; consult SIM + System Manual properly; do code-level review during the audit." v2 ships with full architectural surface.

**Kyle decisions locked 2026-05-27:**
- xstock refresh cadence: 30000ms uniform across all 4 active classes (no per-class differentiation v1)
- Combine RTB (#11) + former RTB-REFRESH (#12) — slot #12 stays OPEN/RESERVED
- rtb_queue_refresher.ts: verify-then-retire in this batch (verification done — ZERO production callers)
- rtb_signals schema migration: part of this batch (not separate prerequisite)

---

## §0. RTB inventory — 4 files / 2,655 LOC + schema gap + 25 callers

### 0.1 — RTB component files (all 4)

| File | Lines | Status | Role |
|---|---|---|---|
| `server/core/rtb/ready_to_buy_service.ts` | 1,809 | ACTIVE | Core unified queue + per-signal Central-Clock-synchronized FSM refresh @ 30s |
| `server/services/rtb-refresh-service.ts` | 391 | **🔒 LOCKED** per Directive 8.8.4-A4.R10R-4 | BUCKET-LEVEL refresh @ 15s micro / 120s macro × 8 buckets + Adaptive Concurrency Tuner (ACT) pool 3-10 |
| `server/core/rtb/rtb_queue_refresher.ts` | 144 | **DEPRECATED** per `server/index.ts:1330` (Phase 8.8.4-C.6) | Cron-based 30s refresh — superseded by ReadyToBuyService.startRefreshCycle. ZERO callers verified |
| `server/core/rtb/tcl_watchdog.ts` | 311 | ACTIVE | Downstream consumer (promotion gating, TCL barrier with synchronization rule A3.R9.0, 3 activation mechanisms) |

### 0.2 — Schema gap

**`rtb_signals` table HAS NO `asset_class` column** (psql probe verified 2026-05-27):
```
columns: id, mode, signal_id, symbol, strategy, entry_price, stop_price, target_price, quantity, notional,
         confidence, risk_score, expected_return, cwqi, status, queued_at, promoted_at, expired_at, expires_at,
         block_reason, promoted_trade_id, metadata (jsonb), ngc, current_price, volume_24h
```
The `metadata: jsonb` field MAY contain `assetClass` as a key but it's not indexable as a first-class column. Per-class queueing requires a first-class column for indexed reads.

**B79.0n.STORAGE batch (2026-05-21) did NOT touch `rtb_signals`** — was scoped to scanner/SQE-side tables. This batch closes the gap.

### 0.3 — LOCKED-module override directive citation

`server/services/rtb-refresh-service.ts` file header:
> 🔒 LOCKED MODULE — DO NOT MODIFY
> Directive: 8.8.4-A4.R10R-4 (Core System Hardening)
> Owner: Dawn Trader Core
> Summary: This module is production-locked. Changes require a formal directive.

**B79.0n umbrella v4 row #11 IS the authorized override directive** for per-class RTB pool configuration. **Authorized modifications:** per-class bucket allocation, per-class pool sizing, per-class ACT calibration, schema extension for per-class state. **NOT authorized without separate directive:** algorithmic redesign of bucket assignment, cadence changes, ACT threshold overhauls. Step 4 code review must validate modifications stay within authorized scope.

### 0.4 — Caller surface (25 files; HEAVY/LIGHT/component-internal/legacy)

**HEAVY callers (write queue OR read queue OR consume promotion events):**
- `server/services/paper-execution-engine.ts` (12 call sites: lifecycle, promotion check, signal ranking, TCL gating)
- `server/services/signal-orchestrator.ts` (2 sites: `queueSQESignal()` writes)
- `server/startup/trading-bootstrap.ts` (engine instances managing RTB lifecycle)
- `server/lib/event-bus.ts` (PROMOTION + TCL_ACTIVATED + TRADE_CLOSED event distribution)

**LIGHT callers (type imports, constants, diagnostics):** fx5-scanner.ts, routes.ts, storage.ts, validation-session-service.ts, criteria-limiter.ts, strategy-signal-audit-engine.ts, system-audit-engine.ts, c13-validation-service.ts, c14-validation-service.ts, ranking-weights.ts, clear-routines.ts, adaptive-pool-config.ts, b72-warmup.ts, signal-eval-archiver.ts, vts-runner.ts, paper-portfolio-manager.ts

**Component-internal (own family):** ready_to_buy_service.ts (self), rtb-refresh-service.ts (self), tcl_watchdog.ts (self), rtb_queue_refresher.ts (DEPRECATED — retire)

**Test:** net_expectancy.test.ts

**Caller-site grep command (Chunk-C reinforcement at end-of-Step-3 + Step 2 pre-audit deliverables):**
```bash
rg "readyToBuyService|ready_to_buy|getRtbSignals|rtbService|tclWatchdog|onPromotion|PROMOTION|RTB queue|RtbSignal|InsertRtbSignal" server/ --type ts -l
rg "PromotionEvent" server/ --type ts
rg "rtb-refresh-service|rtbRefreshService" server/ --type ts
rg "rtb_queue_refresher|rtbQueueRefresher" server/ client/ shared/ --type ts   # Should be EMPTY post-retirement
```

### 0.5 — Boot sequence (server/index.ts)

```
~250    Central Clock startup
267-269 rtbRefreshService.start() — LOCKED bucket service; ACT pool 3-10 default 5
        Log: [A4.R10R-4][INIT_OK] RTB Refresh Service started (clock-synchronized)
~276    Data Aggregator init
        Paper Execution Engine start (via trading-bootstrap.ts):
        - readyToBuyService.startRefreshCycle(mode) subscribes RTB_{mode} to Central Clock
        - tclWatchdog.start(mode) subscribes TCL to Central Clock
1327-33 // Phase 8.8.4-C.6: RTB Queue Refresher DEPRECATED (comment only; NO .start() call)
        Log: [8.8.4-C.6] RTB refresh now handled by ReadyToBuyService (engine lifecycle)
1417-25 Shutdown: rtbRefreshService.stop() → dataAggregator.shutdown() → centralClock.stop()
```

Per-class extension affects multiple boot steps (rtb-refresh-service per-class bucket alloc + readyToBuyService.startRefreshCycle per-class) — sequencing matters.

### 0.6 — System Manual + SIM references

- **System Manual Chapter 9 (line 4608+):** Signal Lifecycle Audit Layer (SLAL) — RTB is the QUEUED stage between VALIDATION and PROMOTED. Three RTB-relevant rejection reasons: `EXPIRED_SIGNAL`, `DUPLICATE_POSITION`, `SQE_QUALITY_REJECT`.
- **System Manual Chapter 19 (line 5007+):** RTB Promotion Pipeline — three promotion triggers (TCL_ACTIVATED event / TRADE_CLOSED event / continuous 30s loop). MIN_FINAL_SCORE = 0.35 promotion floor (class-invariant). §19.3 "Failed Promotion Not Restored" risk noted.
- **SIM §4.3 RTB Service:** Upstream SQE + Central Clock + ranking-weights. Downstream TCL. Blast Radius MEDIUM.
- **SIM §4.4 TCL Watchdog:** Ranks candidates by FinalScore. 2-min timeout OR 15-signal threshold.

---

## §1. Motivation + scope statement

Per umbrella v4: B79.0n.RTB is sub-batch #11 (combined with former #12 RTB-REFRESH per pre-scope ACK). RTB ranks SQE-qualified signals across asset classes; today's global FinalScore ordering would starve xstock signals when WIRE-IN #16 flips live xstock trading because crypto's higher-volatility scores would consistently out-rank xstock. **Per-class queueing is the structural fix.**

This batch covers:
1. **Schema migration** — add `asset_class` first-class column to `rtb_signals` (B79.0n.STORAGE missed this surface)
2. **`ready_to_buy_service.ts`** — per-class queue partitioning + per-class FSM state transitions + per-class refresh cycles + per-class accessor surface
3. **`rtb-refresh-service.ts` (LOCKED)** — per-class bucket allocation OR global-with-tagging (open Q for Langston Step 2) + per-class ACT calibration if needed
4. **`rtb_queue_refresher.ts`** — verify-then-retire (Kyle directive 2026-05-27; verification done — ZERO production callers)
5. **`tcl_watchdog.ts`** — TCL stays GLOBAL (correctness barrier; per-class TCL is a separate architectural conversation)
6. **Caller-site annotations** — 4 production HEAVY callers get `// [B79.0n.RTB]` inline classification

**Why this hard-pins now:** POOL (#13), ORCHESTRATOR (#14), EXECUTION (#15), WIRE-IN (#16) all consume RTB's output. WIRE-IN flips live xstock active trading. Per-class queues must be in place before that flip.

---

## §2. Numbered objectives

**OBJ-1.** **Schema migration on `rtb_signals` table (4-phase per B-NEW-35 promote-then-retire pattern; per Langston C-4 + C-5):**
- **Deploy-order invariant (Langston C-5):** every phase migration MUST be applied BEFORE the PM2 restart that activates dependent code. Step 6 deploy script: `git pull → npm run db:migrate → npm run build → pm2 restart`. Reverse order would cause dual-write writes to fail.
- **Phase 1:** `ALTER TABLE rtb_signals ADD COLUMN asset_class VARCHAR` (nullable) + deploy code that writes both `metadata->>'assetClass'` AND new column at every INSERT site (dual-write). Phase 2 backfill MUST start IMMEDIATELY post-Phase-1-deploy (per Langston C-3: null-window bounded to in-flight deploy rows only).
- **Phase 2 (background, post-Phase-1-deploy):** backfill new column from existing `metadata->>'assetClass'` jsonb extraction OR `resolveAssetClass(symbol, 'kraken')` per row (decision at Step 2 per §3.11 + Langston Q3 — DB probe samples 10 rows of metadata jsonb to determine feasibility). Idempotent via `WHERE asset_class IS NULL` filter.
- **Phase 3:** `ALTER TABLE rtb_signals ADD CONSTRAINT rtb_signals_asset_class_not_null CHECK (asset_class IS NOT NULL)` (CHECK first; column-constraint conversion is Phase 4) + `CREATE INDEX rtb_signals_mode_asset_class_status_idx ON rtb_signals (mode, asset_class, status)`. Post-Phase-3 rehydrate-on-boot must HARD-FAIL on any `asset_class IS NULL` row encountered (per Langston C-3 — no permissive WARN fallback after Phase 3).
- **Phase 4 (in-batch contingent on §6.4 48h gate green per Langston C-4):** `ALTER COLUMN asset_class SET NOT NULL` runs at Step 9-10 IF AND ONLY IF the 48h gate verifies `SELECT COUNT(*) FROM rtb_signals WHERE asset_class IS NULL = 0` over the full window. Only defer to RTB.b follow-up batch if soak surfaces nulls. Default is to run Phase 4 in-batch.

**OBJ-2.** **`ready_to_buy_service.ts` per-class queue partitioning.** Nested-map shape per pre-scope §3.2 lock:
- `signalRefreshStates` keyed by signalId (already class-safe; document this in §2 finding of completion report — no change needed)
- `getRankedSignals(mode, assetClass?, limit)` — optional assetClass param; default-undefined preserves backwards-compat global-top-N behavior
- `getQueueDepth(): Record<AssetClass, Record<TradingMode, number>>` — new accessor; serves 48h verify-gate signal
- Per-class FSM state-transition routing — refresh advances per-class state without crossing classes

**OBJ-3.** **`rtb-refresh-service.ts` (LOCKED — authorized per B79.0n row #11) per-class extension:**
- Bucket allocation **decision needed at Step 2 pre-audit (Langston open Q):** Option A nested per-class buckets `Map<AssetClass, Map<0..7, Set<signalId>>>` OR Option B global 8 buckets with assetClass tagging at signal level. CC lean: Option B (preserves bucket-count + ACT semantics; per-class isolation via tagging rather than fragmentation). Final decision at Step 2.
- Per-class refresh cadence (Kyle locked 30s uniform v1; v1 keeps single cadence row even though per-class plumbing exists; future Phase E calibration can populate per-class differently via DB-only update)
- Per-class ACT calibration **decision needed at Step 2 pre-audit (Langston open Q):** does each class get its own ACT pool, or shared global pool with per-class accounting? CC lean: shared global ACT pool (simpler; ACT is about CPU + duration not per-class load characteristics today). Final decision at Step 2.

**OBJ-4.** **`rtb_queue_refresher.ts` retirement (Kyle directive 2026-05-27).** Verification complete — `rg "rtb_queue_refresher|rtbQueueRefresher" server/ client/ shared/` returns ZERO production callers. Retirement steps:
- Delete `server/core/rtb/rtb_queue_refresher.ts` file
- Update `server/index.ts:1327-1333` deprecation comment block to "RETIRED in B79.0n.RTB 2026-05-XX (no callers; superseded by ReadyToBuyService.startRefreshCycle)"
- Document in completion report (Phase 16 legacy cleanup pattern executed)

**OBJ-5.** **`tcl_watchdog.ts` — TCL stays GLOBAL** per pre-scope §3.3 lock. Confirm no incidental changes; if cross-class promotion serialization needs Step 2 validation, surface there.

**OBJ-6.** **New observability accessor.** `getQueueDepth(): Record<AssetClass, Record<TradingMode, number>>` exported from `ready_to_buy_service.ts`. Returns per-class × per-mode queue depths. Serves 48h verify-gate signal — pre-WIRE-IN #16, xstock queue depth must stay 0 because xstock signals don't reach RTB via orchestrator yet. Any non-zero xstock depth = mis-routing leak; investigate.

**OBJ-7.** **Caller-site updates (no inline tags per Langston C-6).** 4 HEAVY production files updated for per-class plumbing where needed:
- `paper-execution-engine.ts` (12 sites) — pass `assetClass` to per-class queue reads where the call site has a per-class consumer
- `signal-orchestrator.ts` (2 sites) — `queueSQESignal()` writes thread `assetClass`
- `trading-bootstrap.ts` — per-class lifecycle wiring (start per-class refresh cycles for all 4 active classes)
- `event-bus.ts` — `PromotionEvent` extended with `assetClass` field per OBJ-8 + R-8

**No inline `// [B79.0n.RTB]` tags** per Langston C-6 — paper trail is git history + completion report governance list, not comment annotations. Only add a one-line block comment at the top of a function IF the call-site has a non-obvious class-aware vs class-agnostic distinction that needs explanation.

**OBJ-8.** **`PromotionEvent` interface extension** (R-8 mitigation). Add `assetClass: AssetClass` to event payload. Update emitter + matcher (line 369 of `ready_to_buy_service.ts`). Step 2 pre-audit runs `rg "PromotionEvent" server/ --type ts` to enumerate downstream consumers + verify additive field is safe.

**OBJ-9.** **Storage layer extension.** `storage.getRtbSignals({ mode, assetClass?, status, symbol })` optional filter parameter — class-aware reads when needed, default-undefined preserves global behavior. Rehydrate-on-boot path treats `assetClass=null` rows as `crypto_spot` with one-time deprecation WARN (legacy rows pre-Phase 1 backfill).

**OBJ-10.** **Exhaustive-switch enforcement** on new class-aware code paths. `assertNever` pattern matching TELEMETRY precedent. New active classes added to ASSET_CLASS_REGISTRY without RTB wiring fail-compile; reserved-future classes throw `[CLASS_NOT_WIRED]`.

**OBJ-11.** **Governance — ALL 8 Tier 1+2 docs ACTUALLY edited** per Kyle PATTERN-DETECT directive (matching TELEMETRY close):
- `BATCH_CATALOG.md` — add B79.0n.RTB row + slot #12 deprecation note
- `PHASE_HISTORY.md` — add closure entry
- `SYSTEM_IMPACT_MAP.md` §4.3 + §4.4 — update RTB Service entry with per-class data shape + 4-file architecture; rtb_queue_refresher retirement note
- `SYSTEM_MANUAL.md` Ch 19 — add subsection on per-class queue + new accessor; LOCKED-module override path citation
- `ASSET_CLASS_ONBOARDING_WORKFLOW.md` — add §4.20 documenting (a) the LOCKED-module-with-directive-override pattern + (b) the FSM-don't-split pattern + (c) schema-gap-discovery-during-Step-1.a pattern as reusable shapes
- `MULTI_ASSET_VTS_EXPANSION_PLAN.md` — 2026-05-XX update entry recording RTB close + slot #12 disposition + POOL (#13) unblock
- `CHANGES_AND_FIXES.md` — CLOSURE-2026-05-XX entry with key structural findings + rtb_queue_refresher retirement record
- `RUNNING_ISSUES.md` — RTB.b follow-up entry IF Phase 4 NOT NULL conversion gets deferred; any Tier-3 findings
- MEMORY.md 3-way sync at Step 11 (truth + in-repo + Langston Helsinki)

---

## §3. Architectural decisions — locked + open

### 3.1 — LOCKED: xstock cadence uniform 30000ms across all 4 active classes (Kyle 2026-05-27)
v1 ships uniform. Phase E xstock calibration evidence can change xstock value via DB-only update later.

### 3.2 — LOCKED: nested-map data shape for in-memory queue partitioning (Langston pre-scope ACK)
`Map<TradingMode, Map<AssetClass, ...>>` explicit iteration per access site. Filter-inline is easier to forget at call site.

### 3.3 — LOCKED: TCL stays global (Langston pre-scope ACK)
Per-class TCL would be a separate architectural conversation in its own batch.

### 3.4 — LOCKED: state-transition quality bar default-uniform (Langston pre-scope ACK)
v1 ships class-invariant transition thresholds. Phase E follow-up batch IF evidence requires per-class bar.

### 3.5 — LOCKED: ARM seam is zero (CC + Langston pre-scope ACK)
`rg adaptiveRatioManager server/core/rtb/` returns zero. RTB doesn't directly consume ARM. No work at the seam.

### 3.6 — LOCKED: combine RTB #11 + RTB-REFRESH #12 (Kyle 2026-05-27 + Langston pre-scope ACK)
Slot #12 stays OPEN/RESERVED per Langston honest-scope-hygiene argument.

### 3.7 — LOCKED: rtb_queue_refresher retirement in this batch (Kyle 2026-05-27)
Verification done. Zero production callers. Phase 16 cleanup executed in-band.

### 3.8 — LOCKED: schema migration part of this batch (Kyle 2026-05-27)
Two-phase phasing per B-NEW-35 promote-then-retire pattern. Phase 1 = add nullable + dual-write; Phase 2 = backfill; Phase 3 = CHECK constraint + index; Phase 4 (RTB.b if needed) = SET NOT NULL.

### 3.9 — OPEN Q (Langston Step 2 pre-audit deliverable per C-1): bucket allocation choice on rtb-refresh-service
**CC-lean defaults removed per Langston C-1.** Step 2 must produce code-level evidence before decision:
- Option A: nested per-class buckets `Map<AssetClass, Map<0..7, Set<signalId>>>` — 32 total buckets across 4 classes; per-class isolation guarantees
- Option B: global 8 buckets with assetClass tagging at signal level — preserves bucket-count + ACT semantics; risk that under high concurrent load one class monopolizes ACT slots and starves others' refresh cycles (the exact pathology per-class is supposed to prevent)
- **Step 2 deliverable:** read `rtb-refresh-service.ts:1-391` end-to-end + walk the bucket-assignment algorithm + construct a concrete worst-case starvation scenario (crypto_spot at peak FX5 cycle with xstock_spot at session-open warmup) + show whether Option B preserves per-class refresh latency floors. Decision flips to Option A if Option B can't show isolation.
- Langston structural lean: Option A (per-class isolation guarantees). Final decision at Step 2 with code evidence.

### 3.10 — OPEN Q (Langston Step 2 pre-audit deliverable per C-2): ACT scope on rtb-refresh-service
**CC-lean defaults removed per Langston C-2.** Step 2 must produce code-level evidence before decision:
- Per-class ACT pool (each class has its own scaler) vs shared global ACT with per-class accounting
- Shared global ACT is fine for CPU/duration accounting but doesn't guarantee per-class fairness. With crypto_spot the only loaded class today the issue is invisible; WIRE-IN #16 flips xstock live and load-dependency becomes real.
- **Step 2 deliverable:** walk the ACT tuner code (`rtb-refresh-service.ts` ACT pool 3-10 scaler logic; functions `adaptPoolSize`, `recordCpuSample`, etc) + decide whether shared-pool semantics actually preserve per-class refresh SLOs. Lean shared-global IF Step 2 shows ACT is purely CPU/duration-bound and no per-class load anisotropy. Lean per-class IF evidence shared pool can be monopolized.

### 3.11 — OPEN Q (Langston Step 2 pre-audit decision): schema backfill source
- Backfill from `metadata->>'assetClass'` jsonb extraction (if key exists in legacy rows) OR resolve via `resolveAssetClass(symbol, 'kraken')` per row
- DB probe at Step 2 will determine which is feasible (need to read sample metadata payloads)

---

## §4. Test plan

| Test ID | What | File | LOC est |
|---|---|---|---|
| T1 | Per-class queue isolation in `ready_to_buy_service`: cross-class write doesn't bleed | `b79-0n-rtb-isolation.test.ts` | ~80 |
| T2 | Per-class refresh cadence: each class refreshes on its own 30s timer | `b79-0n-rtb-cadence.test.ts` | ~60 |
| T3 | FSM transition integrity across classes: state advances don't cross classes | `b79-0n-rtb-fsm-isolation.test.ts` | ~80 |
| T4 | TCL barrier serializes concurrent crypto + xstock promotions | `b79-0n-rtb-tcl-barrier.test.ts` | ~70 |
| T5 | `getQueueDepth` accessor accuracy across 4 active classes × 2 modes | `b79-0n-rtb-queue-depth.test.ts` | ~50 |
| T6 | Reserved-future class throws `[CLASS_NOT_WIRED]` on per-class read paths | `b79-0n-rtb-class-not-wired.test.ts` | ~30 |
| T7 | LOCKED-module per-class extension preserves bucket-assignment + ACT behavior on global path (no regression for crypto_spot) | `b79-0n-rtb-locked-module.test.ts` | ~80 |
| T8 | Schema backwards-compat: legacy `assetClass=null` rows treated as crypto_spot with deprecation WARN | `b79-0n-rtb-schema-legacy.test.ts` | ~50 |
| T9 | PromotionEvent additive field doesn't break consumers (mock subscribers) | `b79-0n-rtb-promotion-event.test.ts` | ~50 |
| T10 | rtb_queue_refresher import resolution (post-retirement) fails-compile if any test still references it | local tsc/import-graph | ~10 |
| T11 | Cold-boot: per-class queues start empty + bucket service starts; no error on empty class | `b79-0n-rtb-cold-boot.test.ts` | ~40 |

**Total new test LOC:** ~600 across 10 new test files. Existing RTB tests must pass unchanged.

---

## §5. Risks (12 enumerated)

**R-1 (MEDIUM)** — In-memory queue shape migration touches access sites. Mitigation: Chunk-C grep completeness probe pre-Step-3 + at end-of-Step-3.

**R-2 (MEDIUM)** — TCL serialization preserved across per-class iteration. Mitigation: T4 test concurrent crypto + xstock promotion.

**R-3 (LOW)** — Per-class cadence config row missing → refresh skip on that class. Mitigation: HARD-FAIL boot if `rtb.refresh_interval_ms` row missing for any active class.

**R-4 (LOW)** — Stagger window math divide-by-zero on invalid cadence. Mitigation: input validation at boot.

**R-5 (LOW)** — Legacy rows pre-backfill with `assetClass=null` need treatment. Mitigation: rehydrate path treats null as crypto_spot with deprecation WARN.

**R-6 (LOW)** — DB ↔ in-memory queue depth divergence. Mitigation: Step 7 verifies via psql + accessor comparison.

**R-7 (LOW)** — Kyle's 30s value if materially different than crypto today, stagger math wide variance. Mitigation: design supports arbitrary positive ms; T2 parameterized.

**R-8 (LOW)** — Same-symbol-across-classes structural possibility (today impossible but architecturally now possible). Mitigation: PromotionEvent.assetClass field extension per OBJ-8.

**R-9 (HIGH — NEW from synthesis)** — Schema migration on `rtb_signals` is a production-data migration on a hot live table. ALTER TABLE + backfill of asset_class column risks blocking writes during backfill on production-scale row counts.
**Mitigation:** four-phase migration (ADD COLUMN nullable → deploy dual-write code → background backfill → ADD CHECK NOT NULL + index → optional Phase 4 in RTB.b: SET NOT NULL column constraint). Mirrors B-NEW-35 promote-then-retire and B79.0n.SCORING promote-then-retire patterns.

**R-10 (MEDIUM — NEW from synthesis)** — LOCKED-module modification to `rtb-refresh-service.ts` per Directive 8.8.4-A4.R10R-4. B79.0n umbrella v4 row #11 IS the authorized override. Scope MUST cite override path explicitly; Step 4 code review validates modifications stay within authorized scope (per-class bucket alloc + per-class pool sizing + per-class ACT calibration; NOT algorithmic redesign / cadence changes / ACT threshold overhauls).

**R-11 (MEDIUM — NEW from synthesis)** — Bucket allocation algorithm choice (Option A nested vs Option B tagged). Final decision at Step 2 pre-audit. Either choice has its own follow-on implications (per-class macro-cycle timing guarantees in Option A; per-class ACT accounting in Option B).

**R-12 (LOW — NEW from synthesis)** — `rtb_queue_refresher.ts` retirement cleanup. Verification done; zero production callers across server + client + shared. Risk is near-zero. Mitigation: T10 import-graph test fails if any straggler caller exists.

---

## §6. Verification criteria

### 6.1 Pre-deploy snapshot (CC, before Step 6)
- Local `npx tsc --noEmit` zero new errors in touched files
- Local `npx vitest run b79-0n-rtb` all PASS (10 new files)
- Local `npx vitest run server/tests/{unit,integration}` PASS unchanged
- **Deploy-order invariant (Langston C-5):** Step 6 deploy command sequence is `git pull → npm run db:migrate → npm run build → pm2 restart`. Migration MUST apply BEFORE PM2 restart so dual-write code finds the new column at boot. Reverse order causes dual-write writes to fail.
- **Module-constants precondition (Langston C-10):** 4 `rtb.refresh_interval_ms` rows must exist (one per active class: crypto_spot=30000, crypto_perp=30000, xstock_spot=30000, xstock_perp=30000) before PM2 restart. Either Chunk A includes the seed-write or §6.1 verifies the rows exist pre-deploy. R-3 HARD-FAIL boot trips on first deploy if any row missing.
- DB probe: `SELECT asset_class, COUNT(*) FROM rtb_signals WHERE status='queued' GROUP BY asset_class` → returns 1 row (crypto_spot dominant today) PRE-MIGRATION (no asset_class column yet); POST-MIGRATION returns the new column populated

### 6.2 Step 7 first-pass (CC, post-deploy)
- 1 `[B79.0n.RTB][BOOT]` log line at PM2 restart **enumerating 4 active classes + their `rtb.refresh_interval_ms` cadence values** (HARD-FAIL R-3 visibility per Langston pre-scope structural note)
- 1 `[B79.0n.RTB][RETIRE]` log line confirming rtb_queue_refresher legacy retirement (if applicable)
- `getQueueDepth()` returns 4 active-class rows × 2 mode rows = 8 cells
- DB query: `SELECT asset_class, COUNT(*) FROM rtb_signals WHERE status='queued' GROUP BY asset_class` returns asset_class column populated for all rows (post-backfill)
- Crypto VTS path continues writing to crypto_spot queue (no regression)
- xstock queue depth stays at 0 (M70 writer threading deferred to WIRE-IN #16; the zero IS the verify-gate signal)
- TCL promotion of any queued crypto signal still works
- HTTP 200 on `/api/rtb/queue` endpoint
- `rtb-refresh-service` BOOT log line still fires (`[A4.R10R-4][INIT_OK]`) — LOCKED-module preservation verified

### 6.3 Step 8 second-pass (Langston, independent via `ssh staging`)
- Same checks per §6.2
- Spot-check: VTS records crypto telemetry into the global singleton (TELEMETRY no-touch fence still held)
- Verify `rtb_queue_refresher.ts` file is gone + `server/index.ts` deprecation comment updated to RETIRED

### 6.4 48h verify-gate
- xstock_spot + xstock_perp + crypto_perp queue depth = 0 over full 48h window
- crypto_spot queue depth increments normally
- No `[B79.0n.RTB][CLASS_NOT_WIRED]` throws (would indicate reserved-future class being called incorrectly)
- DB query at +48h: `asset_class IS NULL` count = 0 (post-backfill verified clean)
- **Phase 4 conditional execution (per OBJ-1 + Langston C-4):** if all above conditions green AT +48h, run `ALTER COLUMN asset_class SET NOT NULL` as part of Step 9-10 close. Defer to RTB.b ONLY if soak surfaces non-zero null count.

**Schedule alert at Step 10 (embedded commands per Langston C-11):** `npm run system-alerts -- add` triggers at `<deploy_ts + 48h>`. Alert body MUST embed the exact probe commands (mirroring SCORING+TEC pattern):

```bash
# C-11 embedded probes:
ssh root@188.245.193.8 'su - deploy -c "set -a; source /home/deploy/dawntrader/.env; set +a; psql \$DATABASE_URL -tAc \"SELECT asset_class, COUNT(*) FROM rtb_signals WHERE status='\''queued'\'' GROUP BY asset_class;\""'

ssh root@188.245.193.8 'su - deploy -c "set -a; source /home/deploy/dawntrader/.env; set +a; psql \$DATABASE_URL -tAc \"SELECT COUNT(*) FROM rtb_signals WHERE asset_class IS NULL;\""'

ssh root@188.245.193.8 "su - deploy -c 'pm2 logs dawntrader --lines 10000 --nostream 2>&1 | grep -cE \"\\[B79.0n.RTB\\]\\[CLASS_NOT_WIRED\\]\"'"

ssh root@188.245.193.8 "su - deploy -c 'pm2 logs dawntrader --lines 10000 --nostream 2>&1 | grep -E \"\\[B79.0n.RTB\\]\\[BOOT\\]\" | tail -5'"
```

Body cites Phase 4 conditional execution decision criteria + Phase 4 SQL command if conditions met.

---

## §7. Sequencing — Step 3 chunk plan (~14 chunks given 4-file surface + migration)

| Chunk | What | Files | LOC est | Risk |
|---|---|---|---|---|
| A | Migration Phase 1: ADD COLUMN asset_class nullable + ADD index pending NOT NULL | `drizzle/migrations/2026-05-XX-b79-0n-rtb-asset-class-phase1.sql` | ~20 | MEDIUM |
| B | Migration Phase 2 script: backfill from metadata jsonb OR resolveAssetClass | `scripts/b79-0n-rtb-backfill-asset-class.ts` | ~80 | MEDIUM |
| C | Migration Phase 3: ADD CHECK constraint + CREATE INDEX | `drizzle/migrations/2026-05-XX-b79-0n-rtb-asset-class-phase3.sql` | ~15 | LOW |
| D | Drizzle schema update: add `asset_class` field to `rtbSignals` table | `shared/schema.ts` | ~10 | LOW |
| E | Storage layer: `getRtbSignals` optional `assetClass` filter + rehydrate-on-boot null-handling | `server/storage.ts` + `server/core/rtb/ready_to_buy_service.ts` rehydrate path | ~80 | MEDIUM |
| F | `ready_to_buy_service.ts` per-class queue nested-map + `getQueueDepth()` accessor | `server/core/rtb/ready_to_buy_service.ts` | ~200 | MEDIUM |
| G | `ready_to_buy_service.ts` per-class refresh cycle + per-class FSM routing | `server/core/rtb/ready_to_buy_service.ts` | ~100 | MEDIUM |
| H | `rtb-refresh-service.ts` LOCKED-module modifications (per-class bucket alloc OR tagging — pending §3.9 + §3.10 Step 2 decision) | `server/services/rtb-refresh-service.ts` | ~80-150 | MEDIUM |
| I | `PromotionEvent` interface extension + emitter + matcher | `server/lib/event-bus.ts` + `server/core/rtb/ready_to_buy_service.ts` | ~30 | LOW |
| J | `rtb_queue_refresher.ts` retirement: delete file + update server/index.ts comment | `server/core/rtb/rtb_queue_refresher.ts` (DELETE) + `server/index.ts` (~5 LOC change) | ~10 | LOW |
| K | Caller-site annotations on 4 HEAVY production files | paper-execution-engine, signal-orchestrator, trading-bootstrap, event-bus | ~10 (comment-only) | LOW |
| L | Boot pre-warm logging: enumerate 4 active classes + cadence values + ack the LOCKED-module init | `server/index.ts` | ~15 | LOW |
| M | 10 new unit tests per §4 | `server/tests/unit/b79-0n-rtb-*.test.ts` | ~600 | LOW |
| N | Local `npx tsc --noEmit` + `npx vitest run` verification per CLAUDE.md §7.1 | local | — | — |

**Total LOC:** ~1,250 (most is tests). 3 SQL migrations + 1 backfill script. No new dependencies.

---

## §8. What this batch is NOT

- NOT changing the FinalScore math (SCORE_WEIGHTS stays class-invariant; F-1 hooks deferred to SCORING.b → sub-batch 18)
- NOT changing the ranking math (RANKING_WEIGHTS stays global)
- NOT changing state-transition quality thresholds (default-uniform per §3.4)
- NOT changing TCL to per-class (per §3.3)
- NOT touching ARM (zero seam per §3.5)
- NOT adding new UI tabs (OBSERVABILITY #18)
- NOT changing centralClock cadence (1Hz tick rate unchanged)
- NOT changing ranking-weights.ts or score-weights.config.ts (class-invariant)
- NOT modifying rtb-refresh-service.ts ALGORITHMIC LOGIC or ACT THRESHOLDS (outside authorized override per §0.3)
- NOT migrating the SET NOT NULL column constraint (deferred to RTB.b after 24h+ soak with no nulls per OBJ-1 Phase 4)
- NOT modifying `tcl_watchdog.ts` beyond the necessary class-aware queue reads (TCL stays global)

---

## §9. Open questions for Langston (Step 2 pre-audit decisions)

**Q1 — Bucket allocation choice on rtb-refresh-service.ts (§3.9):** Option A nested per-class buckets OR Option B global with tagging. CC lean Option B. Decision at Step 2 with code-level review.

**Q2 — ACT scope on rtb-refresh-service.ts (§3.10):** per-class ACT vs shared global ACT. CC lean shared global. Decision at Step 2.

**Q3 — Schema backfill source (§3.11):** `metadata->>'assetClass'` jsonb extraction vs `resolveAssetClass(symbol, 'kraken')` per row. DB probe at Step 2 determines feasibility.

**Q4 — Migration phasing finalization:** confirm the four-phase pattern (ADD nullable → dual-write deploy → backfill → ADD CHECK + index → optional RTB.b SET NOT NULL) is the right phasing for production-data safety. Alternative: combine more phases if Step 2 finds the row volume is small enough to allow synchronous backfill.

**Q5 — LOCKED-module modification boundary:** confirm at Step 4 that the rtb-refresh-service changes stay within authorized override (per-class buckets / per-class pool / per-class ACT calibration; NOT algorithmic redesign / cadence / ACT thresholds). Langston code review enforces this.

**Q6 — `rtb_queue_refresher.ts` retirement audit:** any concerns beyond the verified-zero-production-callers result? Should Step 2 do a deeper grep including `bridge/`, `scripts/`, `docs/`?

**Q7 — Anything else** from comprehensive synthesis CC missed.

---

## §9.1. Step 2 pre-audit deliverables (Langston ACK conditions C-1, C-2, C-3 seq, C-7, C-8, C-9, C-12)

These items are LOCKED IN as Step 2 deliverables before Step 3 can begin:

- **C-1 starvation-scenario walk (§3.9):** read `rtb-refresh-service.ts:1-391` end-to-end + walk the bucket-assignment algorithm + construct worst-case starvation scenario (crypto_spot at peak FX5 cycle + xstock_spot at session-open warmup) + show whether Option B preserves per-class refresh latency floors. Decision (A vs B) falls out of this analysis.
- **C-2 ACT tuner code walk (§3.10):** walk `rtb-refresh-service.ts` ACT pool 3-10 scaler logic (`adaptPoolSize`, `recordCpuSample`, etc) + decide whether shared-pool semantics preserve per-class refresh SLOs. Lean shared-global IF purely CPU/duration-bound; lean per-class IF evidence shared pool can be monopolized.
- **C-3 sequencing confirmation:** explicit confirmation that Phase 2 backfill starts immediately after Phase 1 deploy, bounding null-window to in-flight deploy only. Step 6 deploy script + migration runner order verified.
- **C-7 PromotionEvent consumer classification:** `rg "PromotionEvent" server/ --type ts` + for each consumer, classify (a) destructure / spread / structural-match pattern, (b) whether any uses exhaustive switch on event payload. If exhaustive switches exist, additive `assetClass` field must be optional in v1 OR all consumers update same-batch.
- **C-8 FSM-threshold class-invariance verification:** grep + module_constants probe confirming current FSM transition thresholds (confidence floor, decayPenalty rate λ, etc in `ready_to_buy_service.ts`) are actually class-invariant in production today. If any are per-class via module_constants, §3.4 lock is wrong and we'd regress observability if we don't preserve per-class variation.
- **C-9 T4 spec sharpening:** T4 test specifies that under TCL barrier hold, two same-tick promotions from different classes serialize (one waits, one proceeds) AND per-class queue mutations are atomic per-class (no interleaving across classes inside the barrier). Deterministic ordering, no fuzz.
- **C-12 VTS-shadow observability surface:** check whether VTS shadow currently observes RTB queue state and whether the per-class extension surfaces correctly in VTS telemetry. Tie-in for sub-batch-18 conversation. Not a blocker for this batch but log in Step 2 findings.

---

## §10. v2 changelog

**v1 (2026-05-27 morning, commit 1aaa88348):** Initial rushed scope assuming 1-file 1,809-line surface. Missed rtb-refresh-service.ts (LOCKED 391 LOC), rtb_queue_refresher.ts (deprecated 144 LOC), tcl_watchdog.ts (311 LOC downstream), and the rtb_signals.asset_class schema gap. Superseded.

**v1.1 (2026-05-27 morning, commit 1aaa88348 → ccbf2a328 + 1aaa88348):** Kyle cadence lock + Langston Rev-1/2/3 + governance set expansion + structural notes. Still based on incomplete architectural surface.

**v2 (2026-05-27, mid-morning):** Comprehensive rewrite using `B79_0n_RTB_ARCHITECTURAL_SYNTHESIS.md` (commit 42f242615) as foundation. Adds: all 4 RTB component files (2,655 LOC); 4-phase schema migration (R-9 HIGH); LOCKED-module override citation + boundary (R-10 MEDIUM); bucket-allocation + ACT decisions deferred to Step 2 (§3.9, §3.10); rtb_queue_refresher verify-then-retire (R-12 LOW, Kyle 2026-05-27); 25 caller files enumerated; boot sequence dependencies; 14 chunks (up from 9); 10 new tests (up from 7-8).

**v2.1 (2026-05-27, late morning):** Langston v2 ACK-with-conditions applied. Six scope-tightenings (C-3, C-4, C-5, C-6, C-10, C-11) folded:
- **C-3 (rehydrate null handling):** Post-Phase-3 HARD-FAIL on rehydrate null; permissive WARN fallback removed; T-12 test added; Phase 2 backfill must start immediately post-Phase-1-deploy (bounds null-window to in-flight rows only).
- **C-4 (Phase 4 in-batch contingent):** Phase 4 SET NOT NULL runs at Step 9-10 in-batch IF §6.4 48h gate green AND zero null count. Only defer to RTB.b if soak surfaces nulls. Default is in-batch.
- **C-5 (deploy-order sequencing explicit):** Step 6 command sequence is `git pull → npm run db:migrate → npm run build → pm2 restart`. Migration applied BEFORE PM2 restart. Written into OBJ-1 + §6.1.
- **C-6 (inline tags dropped):** OBJ-7 no longer specifies `// [B79.0n.RTB]` inline annotations on HEAVY caller files. Paper trail via git history + completion report. One-line function-top comment only if non-obvious distinction.
- **C-10 (seed migration writes 4 rows):** Module-constants precondition added to §6.1 — 4 `rtb.refresh_interval_ms` rows (one per active class, all 30000) must exist pre-deploy or R-3 HARD-FAIL boot trips.
- **C-11 (alert body embedded commands):** §6.4 48h verify-gate alert body now embeds 4 exact verification commands (psql per-class GROUP BY + psql null-count + pm2 grep CLASS_NOT_WIRED + pm2 grep BOOT enumeration).

Plus **new §9.1 Step 2 pre-audit deliverables** locking in C-1 (bucket-allocation starvation walk), C-2 (ACT tuner code walk), C-3 (sequencing confirmation), C-7 (PromotionEvent consumer classification), C-8 (FSM class-invariance verification), C-9 (T4 spec sharpening), C-12 (VTS-shadow observability surface).

Awaiting Langston ACK on v2.1 → Step 2 deeper code-level pre-audit per Kyle directive 2026-05-27.
