# B79.0n.RTB — Scope (v1)

**Sub-batch:** #11 of 18 in B79.0n umbrella v4 (COMBINED with former #12 RTB-REFRESH per Langston pre-scope ACK 2026-05-27)
**Batch type:** Phase 24 — asset-class onboarding (active-trading wire-in for xStocks)
**Author:** Claude Code (CC)
**Date drafted:** 2026-05-27
**Status:** Step 1 draft, awaiting Langston ACK
**Parallel-eligibility:** SOLO. POOL (#13) blocked on RTB close; verify-gate clock for SCORING/TEC/TELEMETRY still running.

**Pre-scope decisions locked (Langston AGREE 2026-05-27):**
- Combine RTB (#11) + RTB-REFRESH (#12) into single B79.0n.RTB. Slot #12 stays OPEN/RESERVED (no manufactured scope; future per-class capacity-guard candidate pending Kyle directive).
- 5 architectural concerns from Langston pre-scope review folded into §2/§3 of this scope.

---

## §0. Existing RTB inventory (per Kyle standing directive — don't re-scope shipped work)

### 0.1 — UI surfaces

- **Trading page (`/active-trades`) → "Ready to Buy" tab** displays queued signals (current state, FinalScore, time-to-expiry). Component reads `/api/rtb` endpoint family.
- **Analytics & Diagnostics → none directly** (RTB metrics surface indirectly via Top Pairs / Drift Dashboard via the underlying telemetry signals).

### 0.2 — Backend RTB surface

**Main file:** `server/core/rtb/ready_to_buy_service.ts` (1809 lines)

**Per file header (lines 11-23):** 11 features. Mixed queue and refresh concerns within the single `ReadyToBuyService` class instance:
1. SQE-qualified signal admission (no capacity gating; capacity gates downstream at TCL)
2. FinalScore-descending ranking
3. (symbol, strategy, mode) uniqueness
4. 30-second per-signal rolling TTL
5. Promotion to TCL on capacity-available signal
6. FinalScore decay penalty per `decayPenalty`
7. Per-signal rolling refresh with staggered start (R9.3-A)
8. State machine: active → reconfirmed → promoted → expired
9. TCL synchronization barrier (atomic ops)
10. (symbol, strategy, createdAt) dedup
11. Central Clock synchronized refresh (every ~30 ticks at 1Hz tick rate)

**Internal data shapes (CC code-read 2026-05-27):**
- `refreshIntervals: Map<TradingMode, NodeJS.Timeout>` (line 344) — per-mode (paper/live) tick interval references
- `clockTickHandlers: Map<TradingMode, (tick: ClockTick) => void>` (line 345) — per-mode central-clock tick handlers
- `signalRefreshStates: Map<string, SignalRefreshState>` (line 347) — keyed by `signalId` (unique per signal regardless of class; safe across classes already)
- `engineStartTimes: Map<TradingMode, number>` (line 348)
- `tclFailsafeTriggered: Map<TradingMode, boolean>` (line 349)
- DB-backed queue rows via `storage.getRtbSignals({ mode, status, symbol })` — `rtb_signals` table is the durable queue

**Upstream consumers (per SIM §4.3 + CC grep 2026-05-27):**
- SQE qualified signals via `signalQualityEvaluator` (`server/core/filters/signal_quality_evaluator.ts`)
- Central Clock (`server/services/central-clock.ts`) tick subscription
- Cost model + metrics (`server/core/math/cost-model.ts`, `server/core/metrics/cost-metrics.ts`) for refresh re-fetch
- Module-constants service (`MIN_QUEUE_CONFIDENCE`)
- Ranking weights (`server/config/ranking-weights.ts`) for cross-family score comparison
- Score weights (`server/config/score-weights.config.ts`) — class-invariant per scope §8 NOT-IN-SCOPE list
- Adaptive pool config (`getAdaptivePoolSize`)

**Downstream consumers:**
- TCL Watchdog (`server/core/rtb/tcl_watchdog.ts`) via PROMOTION event on `eventBus`
- contextBridge broadcasts (`rtb:cleared`, `rtb:tick` events to UI)
- `poolBus` (POOL_UPDATE listener — already wired pre-batch)

**ARM seam (Langston Q3.4 verification — CC grep 2026-05-27):**
- **Zero** `adaptiveRatioManager`, `AdaptiveRatioManager`, `adaptiveRatio`, `adaptiveScanManager`, `getAssetClassInstances`, `getTelemetryAggregator` references inside `ready_to_buy_service.ts`. RTB does NOT directly consume ARM. ARM seam verification result: **NO ARM interaction points exist in RTB to verify** — the ARM is upstream of RTB (FX5 scanner + AdaptiveScanManager consume ARM, those produce the signal stream that reaches SQE then RTB). The pre-batch concern that "ARM consumption stays as-is via B79.0a factory injection" is a TELEMETRY-batch claim about ARM itself; RTB doesn't touch the seam.

### 0.3 — Refresh cadence (current state)

Per file header + module_constants probe: **30 seconds per-signal rolling refresh**, staggered uniformly across a 30-second window via signal-ID hash. Central Clock ticks at 1Hz; RTB subscribes every tick to check which signals are due for refresh. Kyle's prior recall of "60 seconds or 2-3 minutes" was off — the actual cadence is 30s.

### 0.4 — Caller-site enumeration (Langston Chunk-C pattern from TELEMETRY)

```bash
rg "readyToBuy|ready_to_buy|getRtbSignals|rtbService" server/ --type ts -l
rg "PromotionEvent" server/ --type ts                  # Rev-3 add: R-8 mitigation consumer grep
```

(Both to be re-run at Step 2 pre-audit + at end-of-Step-3 as a completeness check. Pre-audit will populate the full table including the PromotionEvent consumer list per Langston Step 1 ACK Rev-3 — additive `assetClass` field on the event interface must surface a clean consumer list before Chunk F ships.)

**Note on `MIN_QUEUE_CONFIDENCE` (§0.2 upstream consumers):** This is the SQE-side admission floor (upstream of RTB queue), NOT an RTB state-transition threshold. Per Langston Step 1 ACK structural note, this stays OUT of OBJ-3 scope. The Step 2 pre-audit must not rope it in.

---

## §1. Motivation + scope statement

Per umbrella v4: **RTB is sub-batch #11**, the next required completion after TELEMETRY (#10). RTB-REFRESH (#12) per Langston pre-scope ACK is **folded into #11** because the queue and refresh-loop are two aspects of one finite-state-machine in the same 1809-line file. Splitting an FSM across two batches creates a class-aware-queue + class-blind-refresh failure window where the refresh loop wrong-routes per-class state advances.

**The work is structural per-class wiring.** No new ranking math, no new state-machine transitions, no new UI tabs. The scope is to (1) shape the queue data structure to be per-class so signals from different classes don't compete in the same FinalScore-descending ordering, (2) thread per-class refresh cadence through `module_constants` (xstock cadence is an explicit open Q for Kyle at Step 1 ACK), and (3) verify the seams (ARM, TCL, ranking-weights) per Langston's pre-scope concerns.

**Why this hard-pins now:** POOL (#13), ORCHESTRATOR (#14), EXECUTION (#15), WIRE-IN (#16) all consume RTB's output. WIRE-IN flips live xStock active trading; if RTB ranks xstock signals against crypto signals in one global FinalScore ordering, the higher-volatility crypto signals will consistently out-rank xstock signals on raw FinalScore, starving xstock execution. Per-class queues prevent that.

---

## §2. Numbered objectives

**OBJ-1.** Extend the queue data structure to per-class nesting per §3.2 nested-map lock. Change `Map<TradingMode, ...>` access pattern to `Map<TradingMode, Map<AssetClass, ...>>`. For the durable `rtb_signals` DB row, the existing `assetClass` field — already present per B79.0n.STORAGE — is the partitioning key. The in-memory data shapes that this batch must update:
- `signalRefreshStates: Map<string, SignalRefreshState>` (signal-ID-keyed; ALREADY safe across classes — no change needed because signalId is unique regardless of class; document this finding in §2 of the change list)
- The per-cycle ordering computation in `getTopSignal()` must operate on a per-class projection, returning N candidates per asset-class rather than a single global top-N
- The `getRtbSignals({ mode, ... })` storage layer call must accept an optional `assetClass` filter; current calls remain backwards-compatible when assetClass is undefined

**OBJ-2.** Per-class refresh cadence via `module_constants`. **Kyle directive 2026-05-27: lock all 4 active classes at 30000ms** matching the current crypto cadence. No empirical basis today for a different xstock cadence; uniform 30s is the safe default. The module_constants infrastructure stays per-class anyway so any future Phase-E calibration evidence can change the xstock value via DB-only update (no code change required). New row family `rtb.refresh_interval_ms` with per-class values:
- `crypto_spot` = 30000 (current behavior — no change)
- `xstock_spot` = 30000 (Kyle directive 2026-05-27)
- `xstock_perp` = 30000 (Kyle directive 2026-05-27)
- `crypto_perp` = 30000 (Kyle directive 2026-05-27)

Stagger window = refresh cadence (30s → 30s stagger).

**OBJ-3.** Per-class state-transition quality bar (Langston Q3.2). Default-uniform across classes (active → reconfirmed uses same metric-quality threshold as crypto today). Scope explicitly addresses this rather than implicitly inheriting:
- v1 ships with class-invariant transition thresholds (uniform)
- Per-class differentiation deferred to a follow-up batch IF Phase E xstock-calibration evidence shows different bar is needed

**OBJ-4.** TCL barrier confirmation (Langston Q3.3). Per-class queue + per-class refresh still serializes through one global TCL lock. TCL is a correctness barrier (atomic promotion), not a throughput throttle. v1 keeps TCL global. Per-class TCL would be a separate architectural conversation, not implicit in RTB.

**OBJ-5.** ARM seam verification (Langston Q3.4). Result already in §0.2 — RTB has **zero** ARM imports / interaction points. The seam check is "no seam exists" — surface this finding explicitly in the completion report so future readers know RTB doesn't need to be revisited when ARM changes.

**OBJ-6.** New observability: per-class `getQueueDepth(): Record<AssetClass, Record<TradingMode, number>>` accessor exported from the RTB service. Serves the 48h verify-gate signal — pre-WIRE-IN-#16, xstock queue depth must stay at 0 because xstock_spot signals don't currently reach RTB via the orchestrator path (deferred to WIRE-IN). Any non-zero xstock depth signals an early routing leak that needs investigation.

**OBJ-7.** Exhaustive-switch enforcement on the new class-aware code paths. Same `assertNever` pattern as TELEMETRY for the per-class iteration (active classes get class-specific paths; reserved-future classes throw `[CLASS_NOT_WIRED]`).

**OBJ-8.** Test coverage: 6-8 new unit tests covering (a) per-class queue isolation (signals from crypto don't appear in xstock ordering), (b) per-class refresh cadence honored (xstock signal refreshed at its own cadence, not crypto's), (c) state-transition uniformity (transitions still work the same across classes given default-uniform bar), (d) TCL barrier still serializes correctly across classes (no race condition with two classes promoting simultaneously), (e) `getQueueDepth` accessor accuracy, (f) cold-boot semantic (empty queue stays empty until SQE feeds), (g) reserved-future class throws, (h) FSM integrity across class-routing (state transitions don't cross classes).

**OBJ-9.** Governance — ALL 8 Tier 1 + Tier 2 docs ACTUALLY edited per Kyle PATTERN-DETECT directive (matching TELEMETRY close pattern):
- `BATCH_CATALOG.md` — add B79.0n.RTB row (Tier 1)
- `PHASE_HISTORY.md` — add closure entry (Tier 1)
- `SYSTEM_IMPACT_MAP.md` §4.3 — update RTB entry with per-class data shape
- `SYSTEM_MANUAL.md` — add subsection to RTB chapter documenting `getQueueDepth` accessor + per-class FSM
- `ASSET_CLASS_ONBOARDING_WORKFLOW.md` — add §4.20 documenting (a) FSM-don't-split pattern + (b) per-class-cadence-via-module_constants pattern as reusable shapes for future asset-class onboarding work
- `MULTI_ASSET_VTS_EXPANSION_PLAN.md` — 2026-05-XX update entry recording RTB close + slot #12 disposition + POOL (#13) unblock
- `CHANGES_AND_FIXES.md` — CLOSURE-2026-05-XX entry citing the 9 chunks + key structural findings
- `RUNNING_ISSUES.md` — add any RTB.b follow-up + Tier-3 findings surfaced during implementation
- (`MEMORY.md` 3-way sync at Step 11 close per CLAUDE.md §3.1 + §2 step 10.b — truth + in-repo mirror + Langston Helsinki)

---

## §3. Architectural decisions + open questions

### 3.1 — LOCKED by Kyle directive 2026-05-27: uniform 30s cadence across all 4 active classes

**Decision.** All 4 active asset classes use the same 30s refresh cadence as crypto today. Kyle directive 2026-05-27 verbatim: "for X stocks, yes, model it the same way as crypto is currently set up... unless as a part of your scope, it appears that it should be on some other cadence, which I doubt that's gonna happen, then just put it on the same cadence as currently set." This batch ships uniform 30s; Phase E xstock-calibration evidence may revisit the value via DB-only `module_constants` update (no code change).

Stagger window stays equal to cadence (30s). All math is class-invariant at v1.

### 3.2 — Locked Langston nudge: nested-map data shape (Q3.5)

CC accepts Langston's lean toward `Map<TradingMode, Map<AssetClass, ...>>` nested-map over per-row `assetClass` field with inline filter. Per-class iteration is explicit at every access site; filter-inline is easier to forget. For an FSM-mutating queue, explicit-iteration-shape is the safer pick.

Implementation: the in-memory `Map<TradingMode, ...>` access sites in the service class extend to a nested `Map<TradingMode, Map<AssetClass, ...>>`. The DB-backed `rtb_signals` table is already class-aware via the `asset_class` column (B79.0n.STORAGE shipped this).

### 3.3 — Locked: TCL stays global (Q3.3)

v1 keeps the TCL barrier global. Per-class TCL is out of scope for this batch. If a future architectural conversation determines per-class TCL is needed (e.g., for parallel promotion across classes), it lands in its own dedicated batch.

### 3.4 — Locked: State-transition quality bar default-uniform (Q3.2)

v1 ships class-invariant transition thresholds. Per-class differentiation deferred to follow-up batch IF Phase E xstock-calibration evidence requires it. The transition thresholds live in `module_constants` per-key but are currently single-row (wildcard `asset_class='*'`); v1 keeps them as wildcards. If a future per-class bar is needed, the threshold rows migrate per the standard onboarding pattern.

### 3.5 — Locked: ARM seam verified ZERO (Q3.4)

`rg` confirms no ARM imports in `ready_to_buy_service.ts`. No work required at the RTB↔ARM seam — the seam doesn't exist in this file.

---

## §4. Test plan

| Test ID | What | File | LOC est |
|---|---|---|---|
| T1 | Per-class queue isolation: write crypto + xstock signals at the same time; `getTopSignal('paper', 'crypto_spot')` returns only crypto; `getTopSignal('paper', 'xstock_spot')` returns only xstock | `b79-0n-rtb-isolation.test.ts` | ~80 |
| T2 | Per-class refresh cadence: register xstock signal with custom cadence; verify it's refreshed on its own timer (not crypto's) | `b79-0n-rtb-cadence.test.ts` | ~60 |
| T3 | State-transition uniformity: active→reconfirmed→promoted flow works the same on crypto and xstock signals with default-uniform thresholds | `b79-0n-rtb-fsm.test.ts` | ~60 |
| T4 | TCL barrier integrity: two concurrent promotions (one crypto + one xstock) serialize through the global TCL lock without race | `b79-0n-rtb-tcl-barrier.test.ts` | ~70 |
| T5 | getQueueDepth accessor: empty queue → all zeros; after writing N crypto + M xstock signals → correct per-class counts | `b79-0n-rtb-queue-depth.test.ts` | ~50 |
| T6 | Reserved-future class throws on `getTopSignal` / `getQueueDepth` per-class call paths | `b79-0n-rtb-class-not-wired.test.ts` | ~30 |
| T7 | FSM integrity across class-routing: state transitions don't cross classes (crypto signal advancing to reconfirmed doesn't accidentally advance an xstock signal in the same tick) | `b79-0n-rtb-fsm-isolation.test.ts` | ~80 |
| T8 (optional) | Cold-boot semantic: empty `_rtbInstances` cache + first SQE call doesn't throw; queue stays empty for non-fed classes | `b79-0n-rtb-cold-boot.test.ts` | ~40 |

**Total new test LOC:** ~470 across 7-8 new test files. Existing RTB-touching tests should continue to pass unchanged (file structure changes are additive at the in-memory data-shape level + the storage-layer optional filter is backwards-compatible when omitted).

---

## §5. Risks

**R-1 (MEDIUM)** — Migration of in-memory queue shape from flat `Map<TradingMode, ...>` to nested `Map<TradingMode, Map<AssetClass, ...>>` touches the queue at every access site. Risk of missed-site → stale read of empty bucket → signal disappears from one class's view. Mitigation: Chunk C-style `rg` completeness probe pre-Step-3 + at end-of-Step-3.

**R-2 (MEDIUM)** — TCL barrier serialization assumes the existing lock semantics still work with per-class queue iteration. If TCL holds the lock for crypto promotion while xstock signal is waiting, no class-crossing should occur — but the lock-acquisition order in the promotion path needs explicit verification. Mitigation: T4 test specifically exercises concurrent crypto + xstock promotion.

**R-3 (LOW)** — Per-class cadence config row missing for a class would cause refresh-cycle skip on that class. Mitigation: HARD-FAIL boot if `rtb.refresh_interval_ms` row missing for any active class (same pattern as TELEMETRY's HARD-FAIL pre-warm).

**R-4 (LOW)** — Stagger window calculation assumes cadence is finite. If a class's cadence row is set to 0 or negative by mis-configuration, stagger math could divide-by-zero. Mitigation: input validation at boot + HARD-FAIL on invalid cadence.

**R-5 (LOW)** — DB-backed queue rehydration on boot reads from `rtb_signals` table. If asset_class column is null on legacy rows (pre-B79.0n.STORAGE), the per-class bucket assignment must handle the null. Mitigation: rehydrate path treats `assetClass=null` rows as crypto_spot (matches B79.0n.STORAGE migration semantics) + emits one-time deprecation WARN.

**R-6 (LOW)** — The B79.0n.STORAGE batch already populated `rtb_signals.asset_class`; per-class queue depth in production should match the DB state. If they diverge, it indicates an in-memory hydrate bug. Mitigation: Step 7 first-pass verification queries the DB + compares to in-memory `getQueueDepth()` output.

**R-7 (LOW)** — Per Q3.1 open Q, the xstock cadence value is set at Step 1 ACK by Kyle. If the chosen value materially differs from 30s, the stagger-window math + the per-class refresh-loop scheduler need to handle wide cadence variance. Mitigation: design supports arbitrary positive ms; cadence test (T2) parameterized to exercise crypto + xstock cadences explicitly.

**R-8 (LOW — NEW)** — The promotion event handler (line 369) currently uses `event.symbol + event.mode` for matching. With per-class queues, the matching needs to include `assetClass` to disambiguate two same-symbol signals across classes (e.g. if xstock and crypto both had a `BTC/USD` signal somehow). Today this is impossible in practice but the data-shape change makes it possible structurally. Mitigation: extend `PromotionEvent` to include `assetClass` field + use it in the matcher.

---

## §6. Verification criteria

### 6.1 Pre-deploy snapshot (CC, before Step 6)
- Local `npx tsc --noEmit` shows zero new errors in touched files
- Local `npx vitest run b79-0n-rtb` all PASS (7-8 new test files)
- Local `npx vitest run server/tests/unit/ready_to_buy server/tests/integration/rtb` (existing tests) PASS unchanged
- DB probe: `SELECT asset_class, COUNT(*) FROM rtb_signals WHERE status='queued' GROUP BY asset_class` → returns 1 row per active class with crypto_spot dominant (today)

### 6.2 Step 7 first-pass (CC, post-deploy)
- 1 `[B79.0n.RTB][BOOT]` log line at PM2 restart **enumerating the 4 active classes + their loaded `rtb.refresh_interval_ms` values** (HARD-FAIL R-3 visibility per Langston Step 1 ACK structural note — visible evidence the boot read all 4 module_constants rows, not just that it didn't throw)
- `getQueueDepth()` returns 4 active-class rows × 2 mode rows = 8 cells
- Crypto VTS path continues writing to crypto_spot queue (verified via existing telemetry write log lines)
- xstock queue depth stays at 0 (deferred to WIRE-IN #16 per scope §8 NOT-IN-SCOPE)
- TCL promotion of any queued crypto signal still works (no regression on the crypto path)
- HTTP 200 on `/api/rtb/queue` endpoint

### 6.3 Step 8 second-pass (Langston, independent via `ssh staging`)
- Same checks per §6.2
- Spot-check: VTS records crypto telemetry into the global singleton (still working as before per the TELEMETRY no-touch fence)

### 6.4 48h verify-gate
- xstock_spot + xstock_perp + crypto_perp queue depth = 0 over full 48h window (no live VTS path writes to them; M70 writer threading deferred to WIRE-IN #16). Any non-zero count signals an early mis-routing leak → investigate.
- crypto_spot queue depth increments normally (whatever the active VTS/orchestrator path produces).

**Schedule alert:** `npm run system-alerts -- add` at Step 10 governance time, triggers at `<deploy_ts + 48h>`, body cites the `getQueueDepth()` probe + the per-class invariant.

---

## §7. Sequencing — Step 3 chunk plan

| Chunk | What | Files | LOC est | Risk |
|---|---|---|---|---|
| A | Migration: 4 module_constants rows for `rtb.refresh_interval_ms` per active class — uniform 30000 per Kyle directive 2026-05-27 (crypto_spot=30000, xstock_spot=30000, xstock_perp=30000, crypto_perp=30000) | `drizzle/migrations/2026-05-27-b79-0n-rtb-per-class-cadence.sql` | ~30 | LOW |
| B | In-memory data-shape extension: `Map<TradingMode, Map<AssetClass, ...>>` nested-map at queue access sites; private helper `getPerClassBucket(mode, assetClass)` for read/write | `server/core/rtb/ready_to_buy_service.ts` | ~150 | MEDIUM |
| C | Per-class refresh cycle: `startRefreshCycle(mode)` extended to per-class iteration; per-class cadence reads from `module_constants` | `server/core/rtb/ready_to_buy_service.ts` | ~100 | MEDIUM |
| D | `getTopSignal(mode, assetClass?)` signature extended; default-undefined preserves backwards-compatible global-top-N behavior; per-class call returns per-class top-N | `server/core/rtb/ready_to_buy_service.ts` | ~60 | LOW |
| E | `getQueueDepth(): Record<AssetClass, Record<TradingMode, number>>` accessor export | `server/core/rtb/ready_to_buy_service.ts` | ~40 | LOW |
| F | `PromotionEvent` extended with `assetClass` field (R-8 mitigation); promotion handler matcher uses it | `server/core/rtb/ready_to_buy_service.ts` + `server/lib/event-bus.ts` | ~30 | LOW |
| G | Storage layer: `storage.getRtbSignals({ mode, assetClass?, status, symbol })` optional filter; rehydrate path treats null `asset_class` as `crypto_spot` with one-time WARN | `server/storage.ts` + `server/core/rtb/ready_to_buy_service.ts` | ~50 | LOW |
| H | 7-8 new unit tests per §4 | `server/tests/unit/b79-0n-rtb-*.test.ts` | ~470 | LOW |
| I | Local `npx tsc --noEmit` + `npx vitest run` verification per CLAUDE.md §7.1 | local | — | — |

**Total LOC:** ~930 (most is tests). 1 DB migration. No SQL schema changes (asset_class column already exists from B79.0n.STORAGE). No new dependencies.

---

## §8. What this batch is NOT

- NOT changing the FinalScore math (SCORE_WEIGHTS stays global class-invariant; per-class score-weight F-1 hooks deferred to SCORING.b → sub-batch 18 per Kyle's earlier re-scoping note)
- NOT changing the ranking math (RANKING_WEIGHTS stays global; same deferral)
- NOT changing the state-transition quality thresholds (default-uniform per §3.4)
- NOT changing TCL to per-class (TCL stays global per §3.3)
- NOT touching ARM (zero seam per §3.5)
- NOT adding new UI tabs (per umbrella v4 deferred to OBSERVABILITY #18)
- NOT changing the rtb_signals DB schema (asset_class column already present)
- NOT changing the centralClock cadence (1Hz tick rate unchanged)
- NOT changing the eventBus / contextBridge surfaces (additive `assetClass` field only on PromotionEvent)

---

## §9. Open questions for Langston (Step 1 ACK gate)

**Q1 — xstock refresh cadence — LOCKED by Kyle directive 2026-05-27.** All 4 active classes carry `rtb.refresh_interval_ms = 30000`. Closed.

**Q2 — Nested-map vs assetClass-field data shape — locked toward nested-map.** Confirm this is the right shape per Langston Q3.5 lean.

**Q3 — TCL stays global — locked.** Confirm no objection.

**Q4 — State-transition quality bar default-uniform — locked.** Confirm no objection.

**Q5 — ARM seam = no seam — verified.** Confirm the §3.5 finding is sufficient and no further ARM-related work needed in this batch.

**Q6 — R-8 PromotionEvent extension.** Locking `assetClass` field on the event interface seems straightforward, but confirm there's no downstream consumer that would break on the additive field.

**Q7 — Anything else** from Langston's pre-scope memo Q3.1-Q3.5 follow-ups not captured.

---

## §10. v1.1 — Langston Step 1 ACK Rev-1/2/3 + Kyle cadence lock (2026-05-27)

**Rev-1 (xstock cadence open-Q) — RESOLVED by Kyle directive 2026-05-27.** All 4 active classes locked at 30000ms uniform. §3.1 + §9 Q1 updated to "LOCKED" framing. The "default lean: inherit crypto's" wording Langston flagged is gone — Kyle's call superseded the open-Q.

**Rev-2 (OBJ-1 "(or equivalent)" wording) — APPLIED.** Dropped per Langston ACK; OBJ-1 now references §3.2 nested-map lock directly.

**Rev-3 (PromotionEvent consumer grep) — APPLIED.** §0.4 now lists `rg "PromotionEvent" server/ --type ts` as a Step 2 pre-audit deliverable per Langston ACK Rev-3.

**Governance set fix (OBJ-9) — APPLIED.** OBJ-9 now enumerates all 8 Tier 1 + Tier 2 docs per Kyle PATTERN-DETECT directive matching the TELEMETRY close pattern.

**Structural notes (non-blocking) — APPLIED.**
- §0.4 explicitly excludes `MIN_QUEUE_CONFIDENCE` from OBJ-3 transition-threshold scope (it's SQE-side admission floor)
- §6.2 boot log line now requires explicit 4-class enumeration + cadence values for HARD-FAIL R-3 visibility

Awaiting Langston ACK on v1.1 before Step 2 pre-audit drafting.
