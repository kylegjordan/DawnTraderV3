# B-NEW-53 — Decision-provenance capture — PRE-AUDIT (Step 2, for Langston Step-2 gate)

**Date:** 2026-06-07. Follows `B_NEW_53_SCOPE.md` (Step-1, Langston ACK-to-proceed with locks Q1–Q5 + BONUS). This pre-audit consults the SIM, enumerates the affected components, settles the **storage + retention design BEFORE any code** (§8 #11 + Langston Q5 lock), proves the resolved-constant set is **static** (Langston Q2 lock), enumerates the **per-strategy stop/target anchors** (Langston Q4 lock), and reports the **forming-bar mutation read** (Langston Q3 lock). Read-only on the live decision; additive telemetry; active trading OFF.

> **INFRASTRUCTURE NOTE for Langston:** all file paths below are repo-relative and Read-able directly from your FUSE mount, but do **NOT** `cd /mnt/gdrive` + `git status/log` (FUSE hang). Use `ssh staging 'cd /home/deploy/dawntrader && git ...'` for any repo inspection beyond the snippets embedded here. DB facts below were measured live on the Supabase production archive on 2026-06-07.

---

## 0. PREVIOUSLY-STATED-VS-NOW (numeric deltas vs the Step-1 scope)

| Item | Step-1 scope said | Verified now | Reason |
|---|---|---|---|
| Hook site #1 (admitted) | `vts-runner.ts:~1374` | **`vts-runner.ts:1930`** (admitted-archive block 1924–1995) | scope line estimate was stale; verified by grep of `archiveSignalEval` |
| Hook site #2 (reject) | (not separately called out) | **`vts-runner.ts:3584`** (reject-archive block 3574–3605) | there are **two** VTS hooks — admitted + reject — both need provenance |
| Hook site #3 (active path) | `signal-orchestrator.ts:~638` | **`signal-orchestrator.ts:1057`** (block 1054–1086) | dormant until Phase 19/21; zero rows today (verified) |
| Monthly archive volume | "~several M/month; vwap_pullback ~884k/30d" | **13.8M rows/30d total** (xStock 8.04M, crypto 5.77M) | measured live; **rejected rows are 99.96%** |
| Net-new payload | forming bar + constants + ref + anchors | same, but **anchors are recomputable → only the resolved stop/target LEVELS persist as checksum** (Langston Q4) | leaner: anchors re-derived from captured bars+constants |

---

## 1. SIM consultation (Step-2 mandatory — upstream / downstream / shared-state / background / blast-radius)

**Component under change:** `signal_eval_archive` (table + its writer `archiveSignalEval`) — `1-system-manual/SYSTEM_IMPACT_MAP.md` §§ referencing signal-eval-archive (rows ~1576, ~1629, ~2086, ~2135).

### 1.1 Upstream feeders (writers) — all via `archiveSignalEval`
- **`server/services/vts-runner.ts:1930`** — ADMITTED rows. `tradeRecord.{entryPrice,stopLoss,takeProfit,atrAtOpen,...}` in scope; `ohlcData` (the array fed to detection) in scope as the `generatePhase10Signal(symbol, priceData, ohlcData, …)` parameter.
- **`server/services/vts-runner.ts:3584`** — REJECT rows (`net_ev_rejected`→`sqe`, `duplicate_position`/`max_open_trades`→`tcl`, else→`strategy_internal`). `ohlcData` in scope from the outer pair loop (`fetchOHLCForPair`, line ~3275); **no `tradeRecord`** (no signal produced).
- **`server/services/signal-orchestrator.ts:1057`** — ACTIVE-path admitted rows. **Dormant** (active trading OFF); `rawSignal.{entryPrice,stopPrice,targetPrice}` in scope; `ohlcData` only via `rawSignal.ohlcData ?? symbolCtx.ohlcData`.
- (Docstring-declared future: `paper-execution-engine.ts` — Phase-19 paper-sim; not yet wired.)

**Live source split (measured 30d):** `vts-runner` = 100% (crypto 5.77M, xStock 8.04M). `signal-orchestrator` / `paper` = **0 rows** → the only LIVE capture target today is the two VTS hooks. The orchestrator hook is a Phase-19 wire-in stub.

### 1.2 Downstream consumers (readers) — blast radius of adding a sibling table
- **`server/services/drift-dashboard-aggregator.ts` `computeDataArchiveStatus()`** — reads `count(*) / max(captured_at) / pg_total_relation_size()` per archive table for the Drift Dashboard "Data Archive Status" panel. **LOW blast** (monitoring). *Action:* ADD the new provenance table to this status list so its growth is monitored (hygiene; not load-bearing).
- **`server/routes.ts`** — the old `signal_eval_archive` aggregation queries were **DROPPED** in B79.0m.b2 (they referenced 4 nonexistent columns and silently failed); `/api/xstocks/filter-diagnostics` now uses in-memory `scanner.diag` counters. **No live reader is coupled to the archive columns** → adding a sibling table breaks nothing.
- **B70 Trend-Mining Engine** (Phase 17.6/18.5) — future joiner of `pair_scan_archive` + `signal_eval_archive` + `exit_decision_archive`; forward-coupling only, not live.
- **`scripts/b5-w20b-entry-replay.ts`** (the W2.0b harness) — the **future primary consumer** of provenance (Phase-25 study). Today it reconstructs inputs and caps at 80% parity; with provenance it reads the exact inputs → the proof-of-capture re-run (Objective 4).

### 1.3 Shared state / background execution
- **Batch writer:** `archiveSignalEval` → `enqueueArchiveRow(TABLE, row)` → a 5-second-flush batch writer, 2-slot semaphore, **50k bounded queue (drop-OLDEST on overflow)**. The decision path does NOT block on the DB write. A provenance write must use the **same enqueue mechanism** (its own table/queue) so it inherits the non-blocking + drop-oldest backpressure contract.
- **Kill switches (existing pattern):** `b70_signal_eval_capture_enabled` + `b70_signal_eval_pre_filter_capture_enabled` (module-constants). Provenance gets a parallel **per-asset-class** flag (see §3.4).
- **Retention:** archive = 60-day rolling, monthly partitions, 02:00 UTC daily sweep cron. Provenance retention must be **≥ archive retention** and aligned to the Phase-25 study (see §4).

### 1.4 Blast-radius conclusion
Additive sibling table + 6 new optional fields threaded into an existing best-effort writer. No reader is coupled to archive columns; no decision path blocks on the write. Blast radius = **storage growth** (quantified in §2) + one monitoring-panel addition. No behavioral change to any trade. SIM gaps to fill in Step-10 governance: add the provenance table + its writer + its consumer (the Phase-25 harness) to the SIM, and annotate the `signal_eval_archive` rows with the sibling relationship.

---

## 2. STORAGE + RETENTION DESIGN (the #1 Step-2 gate — settled BEFORE code, §8 #11 + Langston Q5)

### 2.1 Live measurements (Supabase prod, 2026-06-07)
- **Total archive:** 14.47M rows; partitions `signal_eval_archive_2026_05` = **6,642 MB**, `_2026_06` (partial month) = **2,626 MB**. (Parent reports 0 bytes — data is in child partitions.)
- **30-day volume by asset_class × reject_stage:**

  | asset_class | reject_stage | rows / 30d | needs provenance? |
  |---|---|---:|---|
  | xstock_spot | strategy_internal | 7,853,151 | **YES** (detect ran, decided no-fire — the sweep population) |
  | xstock_spot | tcl | 186,528 | YES (fired, rejected downstream) |
  | xstock_spot | admitted | 2,607 | YES (fired, taken) |
  | xstock_spot | sqe | 121 | YES (fired, EV-rejected) |
  | crypto_spot | strategy_internal | 5,759,279 | YES (if crypto enabled) |
  | crypto_spot | sqe | 4,161 | YES |
  | crypto_spot | admitted | 3,136 | YES |

  **Key scoping finding:** there are **zero pre-filter/IMF-reject rows** archived (the pre-filter capture flag is effectively off) — **every archived row is already a detect-evaluated decision**, i.e. a valid replay target. So provenance applies to *every row the existing hooks write*; there is no "trim the pre-filter noise" lever. The volume IS the replay population.

### 2.2 Per-row net-new payload (the lean design — settled bars REFERENCED, not duplicated)
Settled 15m bars are already in `xstock_spot_ohlc_15m_snapshot` (the W2.0b snapshot run proved feeding them lifts parity 62→80%). Net-new per provenance row:

| field | type | bytes (est) | purpose |
|---|---|---:|---|
| `captured_at` + `archive_id` | timestamptz + bigint | 16 | 1:1 link to the base row (see §3.1) |
| `forming_open/high/low/close` | numeric ×4 | ~40 | the in-progress bar OHLC — the irreducible 20% gap |
| `forming_volume` | numeric | ~10 | forming-bar volume |
| `forming_bar_ts` | bigint | 8 | the forming bucket epoch (floor/900) |
| `settled_bucket_ts` | timestamptz | 8 | as-of bucket for the settled bar-set reference |
| `settled_bar_count` | smallint | 2 | how many settled bars the engine saw |
| `bar_interval_sec` | smallint | 2 | 900 (15m) / interval, for replay |
| `constants_hash` | bytea(16) or text(32) | 16–32 | references the version store (§3.3) |
| `resolved_stop_price` | numeric | ~10 | RI-a checksum (Langston Q4) |
| `resolved_target_price` | numeric | ~10 | RI-a checksum (Langston Q4) |
| row + index overhead | | ~30–50 | tuple header, PK index |
| **TOTAL** | | **~170–200 bytes/row** | |

### 2.3 Projected growth (grounded, not guessed)
- **xStock-only** (the blocked study): 8.04M rows/30d × ~190 bytes ≈ **1.45 GB/month**, ≈ **2.9 GB at 60-day retention**. That is **~22%** on top of the existing xStock archive footprint (the archive is ~6.6 GB/month already).
- **+ crypto** (if enabled): +5.77M/30d ≈ +1.05 GB/month → **~2.5 GB/month combined**, ~5 GB/60d.
- **Constants version store:** empirically **~6 versions/strategy/month** (see §2.4) → a few KB/month total. Negligible. This is the whole payoff of hash-and-reference: the ~18-number constant set is stored ONCE per version, not on each of 8M rows.

### 2.4 STATIC-CONSTANTS PROOF (Langston Q2 lock — "Step-2 must PROVE the resolved set is static")
Two independent proofs:

**(a) Code proof — the resolver applies zero per-decision arithmetic.** `getCachedNumbersForModule(moduleName, key)` (`server/services/module-constants-service.ts:333–363`) is a **pure cache lookup**: it groups cached DB rows by `constantName`, picks the most-specific-wins row (`scoreRowForKey`: regime 8 > strategy 4 > asset_class 2 > exchange 1), and returns `result[name] = row.value` with **no computation**. All ATR/price/percentage scaling happens DOWNSTREAM in the caller (e.g. `const atr = indicators.atr ?? (high24h-low24h) * c['atr_fallback_daily_range_frac']`). Therefore the **resolved Record<string,number> for a given (module, asset_class, strategy) key is constant given DB state** — it changes only when a `module_constants` row changes. The per-decision variation lives in the live market inputs (captured via the bars), not in the constants.

**(b) Empirical proof — constants change ~monthly, not per-decision.** Live `module_constants` where `module_name LIKE 'strategy.%'`: **241 rows, only 6 distinct `updated_at` timestamps ever** (earliest 2026-05-05, latest 2026-06-05). Change events in the last 60 days: 2026-05-05 (220 rows = the initial seed), 05-09 (6), 05-10 (1), 06-03 (12), 06-05 (2) — i.e. **~21 row-changes across a full month** after the seed. The version store therefore upserts only on those handful of change-days. **Confirmed: hash-and-reference is correct and cheap; a per-decision constant blob would be 8M× redundant.**

Per-strategy resolved cardinality (how many numbers a hash covers): `strategy.dhma` 25, `vwap_pullback` 18, `range_trade` 15, `breakout` 15, `mean_reversion`/`pivot_shift` 13, `vwap_bounce` 13, `sma_trend_ride` 12, `inside_bar_reversal` 10, `morning_star` 9, `orb` 7.

### 2.5 Retention recommendation
- Provenance table **co-partitioned by `captured_at` (monthly)** mirroring the parent, with its **own sweep cron**.
- Retention must outlive the archive's 60 days **only if** the Phase-25 study hasn't consumed it. Recommendation: **default 60-day rolling (match the archive)**, and BEFORE the first Phase-25 study window expires, either (a) run the study, or (b) cold-tier the relevant partitions to object storage via the **B-NEW-47 streamed offload** mechanism (coordinate B75 tiering). The §10.5 "resume the sweep" alert (Objective 5) fires well inside 60 days, so 60-day default is safe for the immediate unblock. *Open decision for Langston: 60-day vs 90-day default — see §6.*

---

## 3. SCHEMA DESIGN

### 3.1 Separate table + the PARTITIONED-FK nuance (refines Langston Q1 lock)
Langston Q1 locked: *separate `signal_eval_provenance` table, key by the archive's existing PK / decision id, strict 1:1 FK.* **Pre-audit finding that refines this:** `signal_eval_archive` is **`PARTITION BY RANGE (captured_at)`** and its PK is the **composite `(captured_at, symbol, strategy, id)`** (the `id` is a globally-unique bigint from one shared sequence `signal_eval_archive_id_seq`; the composite exists because Postgres requires the partition key in any unique constraint).

Consequence: **a real FK referencing `id` alone is not possible** — on a partitioned parent you can only reference a unique constraint that includes the partition column (`captured_at`). So the literal "FK by id" cannot be enforced by the database.

**Resolution (honors the intent of the lock):**
- The provenance table carries **`archive_id bigint` + `captured_at timestamptz`** (the latter for partition-pruning, retention alignment, and joinability).
- Enforce **1:1 by a UNIQUE index on `(captured_at, archive_id)`** on the provenance table itself (its own PK), NOT a cross-table FK.
- **Application-level coupling:** the provenance row is enqueued in the same hook, with the base row's `id` + `captured_at`. No DB-enforced referential action (no cascade); that is acceptable and in fact desirable — Langston's own "best-effort, no rollback of the base row" requirement is *easier* without an enforced FK (a missing base row never blocks a provenance insert and vice-versa).
- The base-row `id` must be available at the hook. **Verify in Step-3:** `enqueueArchiveRow` currently does not return the generated `id` (the sequence default fills it at INSERT). We need the `id` at provenance-write time → either (i) generate the `id` in app code via `nextval('signal_eval_archive_id_seq')` and pass it explicitly to BOTH the base-row enqueue and the provenance enqueue (clean, keeps 1:1), or (ii) use `(captured_at, symbol, strategy, source)` as the natural composite link. **Recommendation: option (i)** — pull the id from the sequence in app code, set it on both rows. This is the single most important Step-3 implementation detail; flagged for Langston.

### 3.2 Fixed fields as COLUMNS, not JSONB
The 6 forming-bar values + 3 settled-ref fields + 2 checksum prices are a **fixed schema** → typed columns (cheaper than repeating JSONB keys like `"open"` 8M× — JSONB key text would roughly double the payload). Only the variable resolved-constant set is JSONB, stored **once per version** in the version table.

### 3.3 `module_constants_version` store (Langston Q2 — upsert-on-novel-hash)
- New tiny table: `constants_hash` (PK), `module_name`, `asset_class`, `strategy`, `resolved_set jsonb`, `first_seen_at`, `key_dims jsonb`.
- At capture: compute `hash(canonical-json(resolved_set))` for the strategy's detect-resolved constants; **upsert-on-novel-hash** (`INSERT … ON CONFLICT (constants_hash) DO NOTHING`); store the hash on the provenance row.
- Empirically grows by a handful of rows/month (§2.4). If it ever grows ~1:1 with decisions, that **loudly surfaces** a non-static assumption violation (the table size IS the alarm) — exactly the guardrail Langston asked for.
- **Scope of the captured set:** the strategy detect resolution — `getCachedNumbersForModule('strategy.<name>', _SE_KEY(name, assetClass))` — is the primary gate input for the entry-trigger replay (ONE resolve per detect). Secondary modules that also gate admission (`position_sizing`, any `sqe`/EV constants) are enumerated in §5 and captured as a second hashed set only if the proof-of-capture parity (Obj-4) requires them; default is the strategy set (that is what the W2.0b detect-replay actually re-invokes).

### 3.4 Capture gating (per-asset-class — §5 corollary "per-asset-class config is the default")
New module-constant flag `b_new_53_provenance_capture_enabled` resolved per `asset_class`. **Default ON for `xstock_spot`** (the blocked study), **OFF for `crypto_spot`** initially (its calibration is not the blocker; enable after the xStock cost is observed in prod). Mirrors the existing `b70_signal_eval_capture_enabled` kill-switch pattern. No silent fallback — if the flag row is missing, capture is OFF (fail-closed for a telemetry add-on).

---

## 4. FORMING-BAR CAPTURE — by value at the detect site (Langston Q3 lock)

**Mutation read (the safety question Langston flagged):** the forming bar is the LAST element of the `ohlcData` array. In `vts-runner.ts` `fetchOHLCForPair` builds `ohlcData` via `.map()` into **fresh literal objects every cycle** (lines ~790–798); `mce.computeContext(...)` and every `strategyEngine.detect*` read the array but contain **zero `ohlcData[…] =` assignments** (grep-confirmed across the engine). The `xstock_spot/ohlc-aggregator.ts` returns a fresh array each call and emits the in-progress bucket (partial-bar semantics). **So a reference would technically be safe today** — but per Langston Q3 we capture **BY VALUE anyway**: destructure `{open,high,low,close,volume,timestamp}` of `ohlcData[ohlcData.length-1]` into 6 scalars at the capture point, removing the entire mutation-risk class and giving a serializable, replay-faithful snapshot. Cheap (6 numbers), robust, future-proof against any later code that might mutate the forming bucket in place.

**Where:** both VTS hooks already have `ohlcData` in scope (admitted: the `generatePhase10Signal` parameter; reject: the outer-loop array). Destructure there and pass the 6 scalars + `settled_bar_count`/`settled_bucket_ts` into the extended `archiveSignalEval` input. The orchestrator hook (dormant) threads them via `rawSignal` at Phase-19 wire-in.

**Step-3 verification:** confirm `ohlcData[last]` IS the in-progress forming bucket the detect function evaluated for the row's asset class and interval (the gate-zero probe established 15m bucketing `floor(epoch/900)*900` includes the forming bucket; confirm the same array identity flows detect→archive within one cycle, and log the forming `bar_ts` vs `captured_at` to assert `bar_ts ≤ captured_at < bar_ts + interval`).

---

## 5. PER-STRATEGY ANCHOR ENUMERATION (Langston Q4 — confirm the field set)

Shared detection return type `StrategySignal` (`server/services/strategy-engine.ts:116–129`) exposes **`stopPrice`** + **`targetPrice`**. The admitted hook already has the resolved levels (`tradeRecord.stopLoss`/`takeProfit`); we persist them as the **RI-a self-verifying checksum**. The anchor INPUTS below are **recomputable** from the captured forming bar + settled bar-set + resolved constants via the (proven-pure) MCE functions, so they are NOT separately persisted unless Obj-4 parity demands it.

| strategy | detect fn (file:line) | stop anchor inputs | target anchor inputs |
|---|---|---|---|
| vwap_pullback | engine:156 | VWAP, low24h, ATR (or override geo) | high24h, ATR, risk-distance |
| breakout | engine:550 | detected rangeLow | rangeHigh−rangeLow (measured move) |
| mean_reversion | engine:649 | currentPrice, stopLossBuffer | meanValue (vwap/sma/midpoint) |
| sma_trend_ride | engine:429 | 5-bar swing-low, SMA | SMA / risk-distance, exitCondition |
| range_trade | engine:738 | rangeLow, ATR | rangeHigh, ATR |
| vwap_bounce | engine:834 | VWAP | VWAP-derived risk-distance |
| morning_star | strategies/morning-star.ts:68 | c1Low, c2Low | ATR |
| inside_bar_reversal | strategies/inside-bar-reversal.ts:65 | parentLow | ATR |
| pivot_shift | strategies/pivot-shift.ts:63 | 3-candle low cluster, ATR | ATR |

All anchor inputs reduce to: **VWAP value, SMA value, high24h/low24h, ATR, detected range hi/lo, pattern candle lows** — every one recomputable from the captured bars + constants by `computeVWAP`/`computeSMA`/`computeATR`/`computeHigh24h`/`computeLow24h` (all confirmed pure, rolling-over-passed-bars) and the pure `detectRange`/`scanPatterns`. **Conclusion:** persisting (forming bar + settled-ref + constants-hash + the 2 resolved levels) is sufficient to re-derive AND verify every strategy's geometry. If the Obj-4 re-run shows any strategy can't hit ≥99% from recompute alone, we add that strategy's specific anchor scalars — but the empirical gate decides, we don't pre-bloat.

---

## 6. OBJECTIVES (mapped from scope §3 + Langston locks) & verification

1. **Schema** — new `signal_eval_provenance` (co-partitioned by `captured_at`, PK `(captured_at, archive_id)`, typed columns per §2.2/§3.2) + `module_constants_version` (hash-PK, upsert-on-novel-hash). *Verify:* migration applies; unique index enforces 1:1; storage design (this doc §2) reviewed.
2. **Writer** — extend `SignalEvalArchiveInput` + `archiveSignalEval` to accept the provenance fields; enqueue a provenance row via the same batch-writer mechanism; thread forming-bar-by-value + constants-hash + settled-ref + resolved stop/target from the two VTS hooks (orchestrator stub for Phase 19). App-side `nextval` for the shared id (§3.1). *Verify:* new decisions write provenance; old rows have none (forward-only).
3. **RI-a unification** — the same row's `resolved_stop_price`/`resolved_target_price` satisfy RI-a's forensic stop-anchor need; RI-a gets no separate mechanism. *Verify:* RUNNING_ISSUES RI-a marked subsumed.
4. **Proof-of-capture (key gate)** — re-run `scripts/b5-w20b-entry-replay.ts` against rows captured BY THIS BATCH (fed the persisted provenance) → **≥99% Tier-1 parity** (vs 80% backward). *Verify:* parity report. **This is a POST-ACCRUAL gate, not a deploy-time check** (Langston BONUS): it needs captured decisions whose forming bars have SETTLED, so it runs as a **2nd scheduled §10.5 alert** after enough rows accrue, NOT in Step-7/8.
5. **Defined exit** — a §10.5 scheduled alert keyed on a concrete accrual condition re-surfaces "entry-trigger now backward-replayable — resume the Phase-25 sweep (roadmap 25-12)." *Verify:* alert registered.
6. **Safety** — additive; per-asset-class kill switch; best-effort try/catch (a provenance-write failure must not block the decision OR the base archive row). *Verify:* forced provenance-write failure leaves decision + base row intact (the existing hooks already wrap `archiveSignalEval` in try/catch — confirm the provenance enqueue is inside the same guard).

---

## 7. RISKS / OPEN DECISIONS for the Step-2 gate
1. **Shared-id sourcing (§3.1)** — confirm option (i): app-side `nextval('signal_eval_archive_id_seq')`, set the same `id` on the base-row enqueue + provenance enqueue. (Alternative: natural composite link.) This is the one change that touches the existing base-row write path — everything else is purely additive. **Langston's call.**
2. **Retention default (§2.5)** — 60-day (match archive, lean) vs 90-day (more Phase-25 runway). Lean recommends 60 + the resume-alert well inside the window; coordinate B75 cold-tier.
3. **Crypto capture (§3.4)** — default OFF for crypto at launch (observe xStock cost first) vs ON from day 1 (full generality). Lean: OFF, enable after one week of observed xStock growth.
4. **Constant-set scope (§3.3)** — strategy-detect set only (default) vs also `position_sizing`/`sqe`. Lean: strategy set; expand only if Obj-4 parity needs it.
5. **One batch vs storage-first split** — Langston Q5 locked ONE batch with storage settled here. This doc settles it → proceed as one batch.

**On your Step-2 gate I proceed to Step-3 (migration + writer threading + version store + kill switch + the two scheduled alerts), chunked, local tsc+vitest in the C:\\dev bench before push.**

---

## 8. STEP-2 GATE DECISION (Langston, 2026-06-07) — APPROVED to Step-3 with C1–C3

**Verdict:** APPROVED to proceed to Step-3. Carried locks Q2 (static-constants proof), Q3 (forming-bar by-value), Q4 (resolved levels = RI-a checksum), constant-set scope (strategy-detect-only), and one-batch — all accepted as resolved. Three binding conditions:

- **C1 — coverage% ≠ parity%.** The base-row enqueue and the provenance enqueue are **independent 50k drop-oldest buffers**, so under burst they can desync in either direction (base row lands with provenance dropped, or vice-versa). `archive_id` is therefore **not guaranteed to resolve, and not every base row gets provenance.** The Obj-4 harness (`b5-w20b-entry-replay.ts`) + the parity report MUST **LEFT-JOIN** and report **provenance-coverage %** (fraction of eval rows that got provenance) as a number **distinct from parity %** (of rows that have provenance, % ≥99 Tier-1). No downstream may collapse the two or assume 100% coverage.
- **C2 — amortize the id-sourcing.** Reject the natural-composite link (`(captured_at,symbol,strategy,source)` is not unique within a cycle — that non-uniqueness is the whole reason `id` exists). Keep app-side `nextval('signal_eval_archive_id_seq')` (option i), BUT amortize it so it does NOT put a synchronous DB round-trip back on the scan/decision hot path: set the sequence to **CACHE** (gaps are fine for a telemetry id) and/or app-side per-cycle block allocation; the id must still draw from `signal_eval_archive_id_seq` so mixed-mode writers (VTS app-supplying; dormant orchestrator/paper on the default) can't collide. **Step-3 verification (before push): confirm B-PHASE-A2 `CYCLE_DBS_TIMING` is unaffected** — the proof no hot-path coupling was reintroduced.
- **C3 — launch posture.** xStock-only at launch + crypto OFF: confirmed. Post-accrual parity re-run (not a deploy-time gate): confirmed — nail the accrual condition concretely (e.g. "≥N xStock provenance rows with `forming_bar_ts + interval < now` across ≥M distinct strategies") and have the alert's report carry the C1 coverage%-vs-parity% split. **Retention OVERRIDDEN to 90 days** (not the 60-day lean): removes the B75-cold-tier dependency + the manual "run-study-or-offload-before-expiry" race from the critical path. ~4.4 GB xStock-only at 90d; ~7.5 GB combined if crypto later — trivial.

**Step-4 focus (Langston):** the base-row write-path change (amortized id-sourcing) + that the provenance enqueue sits **inside** the existing `archiveSignalEval` try/catch (best-effort, never blocks the decision or the base archive row).

