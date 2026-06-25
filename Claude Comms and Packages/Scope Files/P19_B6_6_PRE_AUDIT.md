# P19-B6.6 — price-discovery-liveness fill gate — PRE-AUDIT (Step-2)

**Batch:** P19-B6.6 · **change-class:** architecture · Owner CC-B · Reviewer Langston
**Issue:** #236 · **Placement:** Option B (open seam) — Langston-approved Step-1
**Date:** 2026-06-26

> Method note: every claim below is from a direct read of the named file/line or a live staging query (verify-don't-assume). SIM, System Manual, and the active-trading-path audit were consulted for every component touched.

---

## 0. Headline — OBJ-1 measurement + the separation answer

Langston's Step-1 conditions made OBJ-1 (threshold-from-evidence + the separation question) the deliverable this batch lives or dies on. **Answer: separation is CLEAN, and a single window suffices — no per-symbol tiering needed — because the existing LQ gate removes the only unseparable tail upstream.** The evidence:

**(A) `last` is real and dense.** `xstock_spot_ticker_snap.last` is 100% populated — 7,793,286 snapshots/24h, 476 symbols. (Note: a `last` *change* = a real trade print, far sparser than the snapshot density — calibration is on the change cadence, per Langston.)

**(B) In-RTH per-symbol inter-TRADE (`last`-change) gap** (Wed 2026-06-24 RTH, 13:30–20:00 UTC), 470 names ≥30 changes: median-name p99 gap **102s**, p90-of-p99 **340s (5.7m)**, p99-of-p99 **1809s (30m)**, worst **3540s (59m, HSDT)**. So the *raw* per-symbol tail spans seconds → ~59 min — a >100× spread. A single flat window over the raw population can't serve both ends (Langston's overlap prediction).

**(C) Off-RTH flatness (the holiday analog: feed ON, ARCA closed,** Wed 06:00–10:00 UTC = 02:00–06:00 ET): of 453 names, **153 had ZERO `last`-changes in 4h, 204 ≤1, 247 ≤3** (median 2). BUT the LIQUID names keep trading off-RTH on Kraken (MU 2684 changes/4h, NVDA 1101, QQQ 823, SPY 358) — their token `last` is **not** ARCA-gated. The thin names go flat (HSDT/FUFU/GOTU/POOL/BMBL = 0 changes/4h).

**(D) The overlap is confined to SHALLOW books that the LQ gate already removes.** Splitting the slow names by depth (median in-RTH ask-depth-USD = ask×ask_qty):

| group | examples (LQ at median depth) | reaches open seam? |
|---|---|---|
| shallow + thin | FUFU 22.0/$156 · HSDT 26.7/$468 · LIDR 28.3/$670 · TRON 30.1/$1015 · GOTU 33.8/$2422 · BMBL 34.0/$2484 · EWP 37.7/$5849 | **NO — LQ < 38 (or < $5K min_depth)**, gated out |
| deep but slow | EWN 45.3/$33.6K · TOTL 47.4/$55K · MOO 41.9/$15.4K · ESS 44.5/$28K · POOL 43.1/$20.5K | **YES — passes LQ** |
| liquid | SPY 49.4/$88K · QQQ 47.6/$57K · MU 46.3/$42K · NVDA 43.0/$20K | YES |

**`lq_min=38` is LIVE** (`screener_filters` xstock_spot active_oscillator/pattern/reversal/trend = 38.0; strong_trend = 33.0; quant uses `min_depth_usd=$5000`; all `enabled=t`). `calculateXstockDepthLQ` (`imf-liquidity.ts:52`) gives LQ 38 ⟺ ~$6.3K ask-depth. So the shallow-thin tail (LQ 22–37.7) — exactly the names whose in-RTH quiet is indistinguishable from a holiday — never reaches the fill seam. (Caveat: the LQ gate is non-binding when depth is *uncomputable* that cycle — `imf-evaluator.ts:115,157` — but a missing book then fails the depth gate at the open seam anyway.)

**(E) CONDITIONING CORRECTED (Langston Step-2 catch) — admission floor is wider than LQ≥38; re-measured multi-day.** The gate that actually precedes liveness admits a signal that cleared the LOOSEST upstream xStock depth path: `strong_trend` runs at **`lq_min=33` ⟺ ~$2K ask-depth**. So the admitted population is **depth ≳ $2K**, NOT the ≥$6.3K set originally scanned — which admits a $2K–$6.3K band (EWP at $5,905). Re-measured at the ≥$2K floor across **3 weekday sessions (Tue/Wed/Thu RTH)**, worst-DAY in-RTH p99 inter-trade gap:

| name | med depth | worst-day p99 | class |
|---|---|---|---|
| EWN | $33.8K | **4095s (68m)** (avg 51m) | deep-but-slow ETF token |
| EWP | $5.9K (band) | 3010s (50m) | deep-but-slow ETF token |
| TOTL | $43.5K | 2513s (42m) | deep-but-slow ETF token |
| GOTU | $2.3K (band) | 2009s (33m) | borderline (strong_trend only) |
| EVGO/MOO/ESS | $9.7K–$28K | **≤1228s (≤20m)** | genuinely-active |
| BMBL/POOL/DEO/MOH | $3.3K–$21K | ≤1005s (≤17m) | genuinely-active |

Broad admitted population p95-of-p99 ~5.7m; only a handful of **deep ETF / foreign-equity tokens** (EWN/EWP/TOTL, 42–68m) sit in the slow tail. (Langston's single-day-sample concern was right — EWN's true p99 is ~51–68m, not the 41m single-day figure.) **Gate SEMANTICS (Langston #4 — state precisely):** liveness gates on **THIS TOKEN's Kraken-book price-discovery cadence**, NOT "is ARCA open." A liquid token trading 24/7 on Kraken (MU/NVDA) **passes during a US holiday — correctly**, because the paper fill executes on Kraken's live book. "Holiday" is the motivating case, not the mechanism; the gate blocks whenever the token's own book stops price-discovering (holiday, LULD halt, glitch, feed death).

### OBJ-1 conclusion — window PINNED at 45 min (`min_moves ≥ 1`), single, NOT tiered
**The 45-vs-60 question (Langston's two Step-2 replies diverged — reply-1 ↓45 for fast type-II detection, reply-2 ↑60 for sample-margin) is reconciled by the multi-day evidence → 45 min:**
- **45 passes every genuinely-active admitted name with ≥2× margin** (worst-day p99 ≤ 20m; broad population p95-of-p99 ~5.7m) — stable across all 3 sessions (answers the single-day concern).
- **45 correctly EXCLUDES the deep-but-slow ETF tokens** (EWN/EWP/TOTL, 42–68m): a ~50-min price-discovery cadence means any fill references a stale price — exactly what liveness exists to block. Blocking them is the gate working, not a false-block to engineer away (reply-1's near-zero block cost + the gate's purpose).
- **60 does NOT achieve reply-2's goal:** it still wouldn't reliably pass EWN (68m quiet-day p99 > 60), so it buys little, while being **strictly worse for the type-II case** — a frozen-but-quoted book (LULD halt/glitch: feed ON, `captured_at` fresh, depth green) where liveness is the ONLY gate that catches it. Under fail-safe asymmetry (false-block = miss one slow-ETF fill, near-zero; stale fill into a frozen book = real loss), tighter dominates.
- **Open-edge (Langston #3, documented):** at RTH open the trailing window is flat pre-market for the SLOW names (liquid tokens trade pre-market on Kraken, unaffected), so a slow ETF token is no-fill until its first in-RTH print — expected/conservative; on the B7b live-observation list.
- **NOT tiered:** conditioned on the admitted population (≳$2K), active names (≤20m) vs any dead state (hours) separate cleanly under one window; the only ambiguous names (slow ETF tokens) are ones we correctly decline to fill. A per-symbol tier classifier = redundant mechanism (§5).
- **Config tier-extensible** (more-specific `module_constants` rows) if post-B7b data shows a genuinely-active name slower than 45m. **Tuning loop + null-config/spike alert homed → #391; holiday-calendar defense-in-depth → #392.** Fail-safe holds even if wrong: a shallow name slipping LQ gets over-blocked (conservative), never the reverse.

---

## 1. Component blast-radius (SIM + System Manual + active-trading-audit consulted)

| Component | file:line | role for B6.6 | upstream / downstream / shared-state | change |
|---|---|---|---|---|
| **Open seam / depth gate** | `paper-execution-engine.ts` `_evaluateOpenDepthGate` (def ~:180, call ~:2207) | the seam where the liveness gate is ADDED (Option B), right beside depth | upstream: TCL/TEC promotion → open. downstream: position opens. shared: `recordDepthGateBlock` counter, `rtbMetricsService.recordOpenFailed` | **MODIFY** (call liveness after depth passes; xStock-only) |
| **Depth source** | `execution/depth-source.ts:38` `getDepthSnapshot` + `recordDepthGateBlock:107` | reads latest `xstock_spot_ticker_snap` top-of-book (single row); the block-counter the liveness gate reuses (reason-bucketed by `reason.split(' ')[0]`) | shared telemetry | **REUSE** (liveness adds new reason codes into the same counter) |
| **NEW liveness module** | `xstock_spot/price-liveness.ts` (new) | pure assessor + bounded windowed read + config resolver | reads `xstock_spot_ticker_snap.last` over a window (index-bounded) | **NEW** |
| **Config** | `module_constants` + `module-constants-service.ts`; pattern = `fill-safety-config.ts` / `execution/depth-gate-config.ts` | new module `price_discovery_liveness`, per-class, fail-closed `null`→block | DB-resolved, 60s cache | **NEW rows + resolver** |
| **Snapshot table** | `xstock_spot_ticker_snap` (+ monthly partitions), idx `..._symbol_captured_at_idx` | the `last`-window read source | written by `ticker-batch-writer`; index confirmed | **READ-ONLY** |
| **Upstream LQ gate** | `imf-liquidity.ts:52`, `imf-evaluator.ts:117/157`, `pattern-filter.ts:289/300`, `screener_filters.lq_min` | removes the shallow-thin tail → why no tiering | upstream of dispatch+seam | **UNCHANGED** (depended upon, documented) |
| **Dispatch freshness gate** | `xstock_spot/active-dispatch.ts:168` `getLatestTickAgeMs` | stays as the cheap early reject (unchanged) | — | **UNCHANGED** |
| **Clock window + stall watchdog** | `market-hours.ts:122`, `equity-spot-archiver.ts:316` + `liquid_fill_window_*` keys | untouched; the retained keys feed only the watchdog | — | **UNCHANGED** |

**SIM reads:** §"Cross-Cutting … Liveness Registry" trading-liveness model (the `isEngineActive` gate at `active-dispatch.ts:124` — the dormancy authority); line 3181 documents the fill-safety/freshness/window/stall gate pattern this batch extends; line 3164 confirms the xStock active-dispatch path is BUILT-but-DORMANT until B7b. The liveness gate adds **no new shared in-memory singleton** (it's a stateless read + the existing block counter) → no §17 liveness-registry entry needed beyond the gate/config note.
**System Manual:** the fill-safety chapter (freshness/depth gates) gets the new gate's CONTENT (a new architecture member). 
**Active-trading-path audit (AS_OF_2026-06-18):** §16 V4 notes the depth gate is "never reached while friction rejects" — relevant because the liveness gate sits at the SAME open seam and is likewise downstream of the EV/friction reject; it is forward-instrumentation that bites only once friction is addressed and fills actually occur (post-B7b). No contradiction with the placement.

---

## 2. The "does this belong in / duplicate an existing component?" check (load-bearing FEEDBACK rule)
- **Liveness vs freshness gate:** distinct — freshness = "is the latest tick recent" (`captured_at` age); liveness = "has the traded price MOVED" (`last`-change cadence). No overlap; freshness stays at dispatch, liveness at the seam.
- **Liveness vs depth gate:** distinct — depth = "is there enough on the book"; liveness = "is the book a live, price-discovering market." #295 explicitly frames them as the two halves of one "is the book real" guard. Co-located, not merged (separate fns/configs), evaluated depth-first.
- **Liveness vs the LQ gate:** the LQ gate is a per-cycle *depth* classifier upstream; it is what makes tiering unnecessary, but it does NOT itself check movement → liveness is genuinely new and not a duplicate.
- **Tier mechanism vs existing classifiers:** checked `market-data/volume-classifier.ts` (crypto-only WS-health tiers — not xStock) and `imf-liquidity.ts` (instantaneous depth LQ, not a stored tier). Neither is a reusable per-symbol liveness tier — but the conclusion is we DON'T tier, so no new classifier is built. ✔ no duplication.

---

## 3. Langston's four Step-2 conditions — disposition
1. **Distribution separation / tiering contingency** → ANSWERED in §0: clean separation among LQ-passing names; single window; tiering not needed (with the LQ-gate evidence). Config left tier-extensible.
2. **Index-backed + bounded + timeout-fail-closed window query** → index `xstock_spot_ticker_snap_<part>_symbol_captured_at_idx` confirmed; `EXPLAIN` shows Index Scan Backward, `Index Cond: symbol=… AND captured_at>…`, total cost ~124 (cheap). The read helper sets a per-statement timeout; **timeout → block (`liveness_timeout` reason), never pass.** (Minor: the planner probes all monthly partitions since `NOW()-INTERVAL` isn't plan-time prunable, but each non-current partition is a 1-row index probe — negligible.)
3. **Block-reason granularity** → the gate emits distinct reason codes into `recordDepthGateBlock`: **`flat_last`** (snapshots present, < min_moves changes in window = holiday/dead book), **`no_data`** (0 snapshots in window = feed outage), **`sparse_snapshots`** (snapshots present but too few to evaluate = insufficient evidence), **`liveness_timeout`** (query timed out). A feed outage (`no_data`) is thus distinguishable from a holiday (`flat_last`) in telemetry.
4. **Gate ordering (cheap depth first)** → at the open seam: depth read/assess (single top-of-book row) runs FIRST; only on depth-pass does the windowed liveness query run. Stated explicitly in code + the diff.

---

## 4. Implementation plan (file-level)
1. **NEW `server/asset_classes/xstock_spot/price-liveness.ts`:** `getRecentLastMoveStats(symbol, windowMs, minSnaps)` → `{ moveCount, msSinceLastMove, snapCount }` via ONE index-bounded query with a hard statement timeout (timeout/throw → caller blocks); pure `assessPriceLiveness(stats, config)` → `{ live: boolean, reason }` (reasons per §3); `resolvePriceLivenessConfig()` (module `price_discovery_liveness`, fail-closed `null`, 60s cache — mirrors `fill-safety-config.ts`). xStock-only by call-site (crypto skips).
2. **NEW migration `drizzle/migrations/2026-06-26-p19-b6-6-price-liveness-seed.sql` (+ rollback OUT of git, + MANIFEST):** `module_constants` `price_discovery_liveness` for `xstock_spot`: `window_ms` = **2,700,000 (45 min, PINNED per OBJ-1 §0E)**, `min_moves` (1), `min_snaps` (5 — enough to trust a "flat" verdict), `query_timeout_ms` (2000), `enabled` (true).
3. **MODIFY `paper-execution-engine.ts` open seam (~:2207):** after `_evaluateOpenDepthGate` PASSES, for `xstock_spot` call the liveness gate; on not-live → `recordDepthGateBlock('xstock_spot', '<reason> …')` + `rtbMetricsService.recordOpenFailed(symbol, strategy, 'liveness', reason)` + do not open; never throws into the path (try/catch → fail-closed block).
4. **NEW test `server/tests/unit/p19-b6-6-price-liveness.test.ts`:** pure-fn — move-in-window→live; flat→`flat_last`; <min_snaps→`sparse_snapshots`; 0 snaps→`no_data`; config-missing→fail-closed block; crypto→skip; timeout→`liveness_timeout`/block; ordering — depth evaluated before liveness (depth-fail short-circuits, no liveness query).

---

## 5. Dormancy / §9.1
The xStock active fill path is DORMANT (`isEngineActive=false`) until B7b. **🚨 THIS BATCH DOES NOT TURN xStock ACTIVE TRADING ON.** Step-7 = forward-instrumentation proof (gate wired at the seam, unit-tested, config seeded + resolvable on staging, §9.1 disclaimer). No live fill exists to UI-verify; the gate governs the first real fill only after B7b. B7b pre-flight **gate-#13** requires BOTH the depth gate AND this liveness gate green per class (PHASE_19_PLAN §6).

---

## 6. Governance plan
Tier-1: BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN §1/§5/§6, MEMORY_CC_B, scope, this pre-audit, change-list, completion report, #236→RESOLVED. Tier-2: SYSTEM_MANUAL (fill-safety chapter — new gate CONTENT, incl. the precise SEMANTICS per §0E + the open-edge note), SIM (active-dispatch/open-seam fill-safety section + new config module; dormant-until-B7b note), Langston §10.b MEMORY sync. **System Manual + SIM CONTENT updates (not just state docs) are Langston Step-4 verification items.**

### §13 homes created at Step-2 (Langston conditions; §9.4 named-home-now)
- **#391 (HOME = B7b activation):** post-B7b, monitor the in-RTH `flat_last` liveness block-rate as the signal for whether 45 min is too tight (EWN/EWP/TOTL false-blocks) → the evidence to ever move the (tier-extensible) config; AND alert when the liveness block-rate spikes or the config resolves `null` (fail-closed silently blocks ALL xStock fills — right direction, but must be observable).
- **#392 (HOME = Phase-19 fill-safety follow-up, post-B6.6):** a deterministic US-equity exchange-holiday/half-day calendar as defense-in-depth — block a KNOWN ARCA holiday *before* the first stale-fill attempt rather than reactively after 45 min of `flat_last`. Complements (does not replace) behavioral liveness, which is what catches UNSCHEDULED halts a calendar can't.
