# Phase A.1 — xStock Directional Bias Score (DBS) Design Ask (rev2 — LOCKED)

> **From:** Claude Code
> **To:** Langston (reference) + repo paper trail
> **Date:** 2026-05-17
> **Status:** **LOCKED.** Langston gave conditional ACK on rev1 + closure reply + R1-R4 refinements. R1-R4 absorbed in this rev2. No further design iteration needed; A.2 scope drafting commences immediately upon this file's commit.
> **Predecessor docs:**
> - rev1: `B_PHASE_A1_DBS_design_ask_rev1.md`
> - closure reply (CC): `B_PHASE_A1_DBS_closure_reply_cc.md`
> - Langston conditional-ACK reply: relayed to Telegram topic 21 (2026-05-17)
>
> **Format note:** per CLAUDE.md §6.5.0.a, code snippets embedded inline; do not `cd /mnt/gdrive`.

---

## 0. Delta log — rev1 → rev2

Every change vs rev1, organized by Langston refinement:

| Refinement | Rev2 change |
|---|---|
| Naming nit | `INDEX_SELF` → `INDEX_PROXY` throughout |
| C1a/b/c | §3.6 floor-counting rules pinned (GICS-only + non-sentinel + INDEX_PROXY/BROAD_ETF/INTL_ETF excluded from gate) |
| C2 / R4 | §3.1 entry-shape framing corrected: optional `sector?` field on PairStoreEntry (Option A); pattern (i) constructor option for publishSnapshot differentiation |
| C3 | §3.7 extended-hours expected-degradation language locked with empirical 24/7-universe evidence |
| C4 / R1 | §3.7 RTH-open warmup language CORRECTED: 60-min bars not 1-min, so warmup is structural (sufficient archive history) not session-start-ramp. Telemetry retained for A.2/A.3. |
| C5 | §3.6 history ring sizing identical to crypto confirmed (xStock scan cycle = 30s, same as crypto) |
| C6 | §3.3 SPDR availability check result documented (11/11 missing); R2 path-1 (FRED+Yahoo) locked as recommended Phase-E pre-req |
| C7 | A.3 scope captures volume-weighted median skew inspection |
| C8 | Backfill table schema (A.2 scope) captures DBS components, not just final score |
| R2 | §3.3 + §6 lock placeholder batch ID **B-PHASE-E-PRE-1** + path-1 recommendation in A.2 completion-report draft |
| R3 | §6 RUNNING_ISSUES entry pre-locked verbatim for A.2 Step 10 |
| R4 | §3.1 + §3.6 + §4.3 lock pattern (i) constructor option: `new DirectionalBiasStore({ mode: 'crypto' \| 'xstock', assetClassForKnobs })` |

Sections 1, 2, 3.2, 3.4, 3.5, 3.8, 4, 5, 7 unchanged from rev1 except where R1-R4 touch them.

---

## 1. Charter (unchanged from rev1)

Design the architecture for xStock-specific Directional Bias Score (DBS) so that Phase A.2 (build the store + scanner integration + backfill) can proceed without further architectural iteration. Phase A.3 (verification gate comparing xStock DBS distributions to crypto) validates the design produced here.

Phase A.1 is design-only. A.2 ships scaffolding + makes the capability functional in a single shippable batch; no SCAFFOLDING-VS-FUNCTIONAL disclosure needed.

---

## 2. Mirror invariant — what stays byte-identical to crypto (unchanged from rev1)

Per the v2 plan §A.2: DBS component weights, lookback, EMA periods, thresholds, confidence modifier ranges, and `PAIR_HARD_EXPIRY_MS` all stay byte-identical to crypto's `DEFAULT_DBS_CONFIG`. `computeDirectionalBias()` and `computeGlobalDirectionalBias()` are reused as-is (no fork). Retune is evidence-gated post-A.3.

---

## 3. xStock-specific architecture (LOCKED)

### 3.1 Two store instances of the same class — pattern (i) constructor option

Per Langston R4: the differentiation between crypto and xStock store instances is NOT entry-shape-only; `publishSnapshot()` has behavioral differences (sector partition + sector-coverage floor + GICS-only counting) that need a clear discriminator.

**Locked pattern: constructor option.**

```ts
// directional-bias-store.ts
export interface DirectionalBiasStoreOptions {
  mode: 'crypto' | 'xstock';
  assetClassForKnobs: 'crypto_spot' | 'xstock_spot';
}

class DirectionalBiasStore {
  constructor(private readonly opts: DirectionalBiasStoreOptions) {}
  // ...
  publishSnapshot(): GlobalDbsSnapshot | null {
    // mode-dispatch on this.opts.mode
    // - crypto: existing 5-row behavior
    // - xstock: + sector partition filter + sector_coverage_floor
  }
}

export const directionalBiasStore = new DirectionalBiasStore({
  mode: 'crypto', assetClassForKnobs: 'crypto_spot',
});
export const xstockDirectionalBiasStore = new DirectionalBiasStore({
  mode: 'xstock', assetClassForKnobs: 'xstock_spot',
});
```

**PairStoreEntry shape (Option A locked):**

```ts
interface PairStoreEntry {
  score: number;
  timestamp: number;
  sentinelZero: boolean;
  volume: number;
  sector?: XstockSector;    // NEW — populated by xStock writes only; undefined for crypto writes
}
```

**`updatePair()` signature:**

```ts
updatePair(symbol: string, score: number, sentinelZero: boolean, volume: number,
           sector?: XstockSector): void;
```

Crypto call sites pass 4 args (unchanged); xStock call sites pass 5 args (sector from registry lookup).

**Rationale for pattern (i) over pattern (ii) "always-applied filter that no-ops for crypto":** pattern (ii) silently couples crypto's runtime behavior to xStock-driven knob plumbing (e.g. a `sector_coverage_floor=0` row in module_constants). When someone later wants to tune xStock's coverage floor, they touch a row that crypto's compute path also reads. Pattern (i) keeps the two paths visibly disjoint at the class level; future asset class 3 (FX/futures) adds a third `mode` constant + branch.

**Future-proofing note (Langston-flagged):** a registry-of-stores keyed by asset class is a 15-min refactor when asset class 3 lands; don't bake it now.

### 3.2 Sector classification — extend XSTOCK_SPOT_REGISTRY (with INDEX_PROXY rename)

```ts
export type XstockSector =
  | 'XLK' | 'XLE' | 'XLV' | 'XLF' | 'XLI' | 'XLP' | 'XLY' | 'XLU' | 'XLB' | 'XLRE' | 'XLC'
  | 'INDEX_PROXY'   // SPY / QQQ — excluded from global aggregation
  | 'BROAD_ETF'     // ARKK, ARKG, XBI, GLD, TOTL, IEMG — SPY fallback for benchmark factor
  | 'INTL_ETF';     // EWA-EWZ — country/region ETFs

export interface XstockSpotEntry {
  name: string;
  is24_7?: boolean;
  sector: XstockSector;          // REQUIRED — TypeScript-enforced
  adr?: boolean;                 // optional — Phase E factor work
  cryptoAdjacent?: boolean;      // optional — Phase E factor work
}
```

The full ~250-entry mapping is OUT OF SCOPE for A.1; A.2 ships it as a typed-data PR.

Informational notes (Langston-flagged, not A.1 changes):
- INTL_ETF + BROAD_ETF kept separate (Phase E factor distinction preserved).
- `cryptoAdjacent` is a single flag spanning structurally distinct sub-groups (balance-sheet BTC proxies, exchange equities, BTC-leveraged miners). Phase E factor work may sub-segment if data demands; A.1 uses single flag.

### 3.3 Sector ETF availability check — EXECUTED, all 11 missing

**Result (executed 2026-05-17 against `shared/asset-classes.ts:XSTOCK_SPOT_REGISTRY`):**

| Ticker | In registry? | Bar count |
|---|---|---|
| XLK/USD | MISSING | 0 |
| XLE/USD | MISSING | 0 |
| XLV/USD | MISSING | 0 |
| XLF/USD | MISSING | 0 |
| XLI/USD | MISSING | 0 |
| XLP/USD | MISSING | 0 |
| XLY/USD | MISSING | 0 |
| XLU/USD | MISSING | 0 |
| XLB/USD | MISSING | 0 |
| XLRE/USD | MISSING | 0 |
| XLC/USD | MISSING | 0 |
| **Total missing** | **11 of 11** | — |

**Escalation triggered: ≥4 missing case (maximum).**

**A.1/A.2 impact: NONE.** Per-pair DBS uses pair-OHLC + pair-ATR only. Sector tags are the aggregation partition (no sector-ETF prices consumed at A.1/A.2 level).

**Phase E impact: placeholder batch ID `B-PHASE-E-PRE-1` queued** for offline SPDR feed integration (FRED daily-close + Yahoo intraday). Path-1 (FRED+Yahoo) locked as recommended; paths 2 (basket-synthesize) + 3 (defer factor) rejected per Langston R2 — circularity and silent factor-drop respectively. Estimated 5-7 days when triggered at Phase E kickoff design ask. Kyle can override at that point.

### 3.4 Index-self / INDEX_PROXY handling (unchanged from rev1, post-rename)

INDEX_PROXY pairs (SPY, QQQ; IWM not currently in registry):
- INCLUDED in per-pair DBS compute (own eval-cycle reads its score back via `dbsBySymbol.get(symbol)`).
- EXCLUDED from global xStock DBS aggregation (would degenerate weighted-median to "SPY's own DBS").
- EXCLUDED from sector-coverage floor counting.

Stored in the xStock store with `sector: 'INDEX_PROXY'`; partition filter in `publishSnapshot()` excludes them at aggregation time.

### 3.5 SPY fallback at A.1 — registry-only (unchanged)

`sector: 'BROAD_ETF'` and `sector: 'INTL_ETF'` entries indicate "no domestic-GICS-sector benchmark; fall back to SPY when sector-correlation factor work runs in Phase E." At A.1, this is purely a registry tag. Runtime behavior lives in Phase C (macro modifier) and Phase E (factor work).

### 3.6 Floor mechanics — LOCKED (C1a/C1b/C1c + R4 constructor option)

**Two floors gate publish for the xStock store (mode='xstock'):**

1. **Global floor:** `freshCount ≥ min_sample_count` where `freshCount` counts only:
   - Entries with `sector in (XLK, XLE, XLV, XLF, XLI, XLP, XLY, XLU, XLB, XLRE, XLC)` — INDEX_PROXY / BROAD_ETF / INTL_ETF excluded.
   - Entries with `sentinelZero === false`.
2. **Sector coverage floor:** `≥ sector_coverage_floor` distinct GICS sectors with `≥ 1` non-sentinel entry each.

**Layer-1 starter values:**
- `min_sample_count = 30` (vs crypto's 20)
- `sector_coverage_floor = 7` (out of 11 GICS sectors)

Both floors must be satisfied for a fresh publish. Failure → 5-row behavior spec applies (stale-prior or null) just as for crypto.

**Crypto store (mode='crypto') is unchanged from current behavior.** Floor mechanic stays at single `min_sample_count` against `this.store.size` (including sentinels). The sentinel-counting discrepancy is documented as RUNNING_ISSUES (see §6 below); not a B-PHASE-A2 dependency.

**History ring buffer sizing (C5 locked):** xStock scan cycle is 30s (`xstock_spot/scanner.ts:48 SCAN_INTERVAL_SECONDS = 30`), same as crypto. 96 entries × 15-min sampling = 24h history identical to crypto. No reproportioning.

### 3.7 Cold-start + extended-hours + RTH-open framing — CORRECTED (R1)

**RTH-open warmup ramp — CORRECTED.** Both crypto AND xStock DBS compute on **60-minute bars** (`xstockOhlcCache.getOHLCDataBatch(symbolList, 60)` at `scanner.ts:356`; crypto's `ohlcCache.getOHLCData(symbol, interval=60)`). DBS requires `lookbackPeriod = 48` bars → 48 × 60min = 48 trading hours of archive history.

Implication: pairs with **≥ 48 hours of archived 60-min bars** produce non-sentinel DBS results from the first minute of any session. Cold-start is NOT a session-start ramp; it's a structural condition that applies only to:

- Genuinely new symbols added to the universe with `<48` archived 60-min bars.
- PM2 restart while the xStock archive itself is `<48-72` trading-hours deep (no longer applicable; archive depth is ~30 days = ~720 hours as of 2026-05-17).

For LIVE operation: weekends do not reset the archive; Monday RTH open does NOT trigger cold-start for any pair with prior-week history.

The "30–60 minute floor-clear post-open" claim from rev1 was WRONG. Removed.

**Extended-hours expected degradation (C3 LOCKED — backed by empirical evidence):**

During ARCA-closed windows, only the 10-pair 24/7 universe accumulates fresh writes. Empirical breakdown (from `XSTOCK_SPOT_REGISTRY` `is24_7: true` entries, 2026-05-17):

| Symbol | Sector |
|---|---|
| AAPL/USD | XLK |
| CRCL/USD | XLF |
| GLD/USD | BROAD_ETF |
| GOOGL/USD | XLC |
| HOOD/USD | XLF |
| MSTR/USD | XLK |
| NVDA/USD | XLK |
| QQQ/USD | INDEX_PROXY |
| SPY/USD | INDEX_PROXY |
| TSLA/USD | XLY |

GICS-sectored entries: 7 (3 XLK + 2 XLF + 1 XLC + 1 XLY). Coverage: 4 of 11 sectors (36%).

**Both floors fail during extended hours:**
- Global floor `30` vs max-possible-GICS-sectored `7` — fails by construction.
- Sector coverage floor `7` vs covered-sectors `4` — fails by construction.

`publishSnapshot()` serves stale-prior or null per the 5-row behavior spec. **This is intentional.** A.3 verification SHOULD NOT flag "global xStock DBS unavailable 18 hours per day" as a defect.

**Optional telemetry (retained from rev1, useful for A.3):**

A.2 emits structured log `[B-PHASE-A2][FIRST_FLOOR_CLEAR]` on the first publish-success per ARCA session, capturing `seconds_post_open` + per-sector entry counts. Given the corrected R1 framing (no genuine ramp expected), this log mostly records "floor clears at session start." But it catches the cold-start case if PM2 restarts during/just-before an open OR if a new symbol with thin archive enters the universe.

### 3.8 Confidence modifier path (unchanged from rev1)

`computeBiasConfidenceModifier(category)` is universe-agnostic; downstream consumers (RTB, SQE, ranking-weights) pick up real DBS automatically once `propagatedDbs` is real.

---

## 4. Integration architecture — A.2 implementation preview

### 4.1 Scanner pre-cycle DBS compute (mirrors fx5-scanner.ts:1098-1118)

```ts
// xstock_spot/scanner.ts — insert before eval loop at line 467
import { computeDirectionalBias } from '../../core/metrics/directional-bias.js';
import { xstockDirectionalBiasStore } from '../../core/metrics/directional-bias-store.js';
import { XSTOCK_SPOT_REGISTRY } from '../../../shared/asset-classes.js';

const dbsBySymbol = new Map<string, { score: number; category: string; slope: number }>();
for (const symbol of symbolList) {
  const ohlc = ohlcBatch.get(symbol) ?? [];
  if (ohlc.length < minOhlcHistoryBars) continue;     // pass-through to MCE neutral
  const atr = computeATRFromOHLC(ohlc, 14);
  if (atr <= 0) continue;

  const dbsResult = computeDirectionalBias(ohlc, atr);
  let slope = 0;
  const priorOHLC = ohlc.slice(0, -3);
  if (priorOHLC.length >= 20) {
    const priorAtr = computeATRFromOHLC(priorOHLC, 14);
    if (priorAtr > 0) {
      slope = dbsResult.score - computeDirectionalBias(priorOHLC, priorAtr).score;
    }
  }

  const registryEntry = XSTOCK_SPOT_REGISTRY.get(symbol);
  const sector = registryEntry?.sector;   // undefined → write fails out below
  if (!sector) {
    console.warn(`[B-PHASE-A2][SECTOR_MISSING] ${symbol} not in registry; skipping DBS write`);
    continue;
  }

  const volume24hUSD = (tickerEnrichmentBySymbol.get(symbol)?.volume24hShares ?? 0)
                       * ohlc[ohlc.length - 1].close;

  xstockDirectionalBiasStore.updatePair(
    symbol, dbsResult.score, dbsResult.sentinelZero, volume24hUSD, sector,
  );
  dbsBySymbol.set(symbol, { score: dbsResult.score, category: dbsResult.category, slope });
}
```

### 4.2 Eval-cycle threads propagatedDbs (unchanged from rev1)

`evaluateXstockPairForVTS` signature extended with `propagatedDbs?` parameter; scanner call-site passes `dbsBySymbol.get(symbol)`. MCE consumes via existing non-crypto branch.

### 4.3 End-of-cycle publish

```ts
// xstock_spot/scanner.ts — after eval loop
const xstockGlobalSnapshot = xstockDirectionalBiasStore.publishSnapshot();
// mode='xstock' branch in publishSnapshot applies GICS-only counting +
// sector_coverage floor check before producing the snapshot.
```

### 4.4 Backfill (A.2 sub-deliverable) — COMPONENT-AWARE (C8)

Backfill table schema MUST capture per-bar DBS components, not just final score:

```sql
CREATE TABLE xstock_dbs_backfill (
  symbol TEXT NOT NULL,
  sector TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  final_score DOUBLE PRECISION NOT NULL,
  slope_component DOUBLE PRECISION NOT NULL,
  return_component DOUBLE PRECISION NOT NULL,
  ema_component DOUBLE PRECISION NOT NULL,
  sentinel_zero BOOLEAN NOT NULL,
  atr DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (symbol, ts)
);
CREATE INDEX idx_xstock_dbs_backfill_sector_ts ON xstock_dbs_backfill (sector, ts);
```

A.3 distribution comparison reads this to diagnose where xStock and crypto DBS distributions diverge at the component level (slope vs return vs EMA).

Archive maturity gate (v2 plan §A.2 invariant): A.2 re-verifies at ship time. Current depth ~30 days clears the 7-day floor handily.

---

## 5. Phase A.1 deliverable scope (final) — LOCKED

1. ✅ rev1 design ask + rev2 (this doc) committed.
2. ✅ Sector taxonomy locked (§3.2): 14 buckets + 2 orthogonal flags.
3. ✅ Floor mechanic locked (§3.6): global-30 GICS-only non-sentinel + sector-coverage-7.
4. ✅ Sector ETF data availability check executed and result documented (§3.3: 11/11 missing → B-PHASE-E-PRE-1 queued, path-1 recommended).
5. ✅ All Langston Q + C + R items resolved.
6. ✅ Closure reply ACK from Langston pre-greenlit on R1-R4 absorption (this rev2 absorbs them).

A.1 CLOSED.

---

## 6. Out-of-scope (deferred) — UPDATED

| Item | Deferred to |
|---|---|
| Full sector mapping for ~250 names | A.2 (typed-data PR) |
| Backfill table data fill | A.2 |
| Phase B threshold calibration (xstock-specific category cutpoints) | Phase B.1 |
| Sector ETF direct-correlation factor (`b68_3_pair_correlation` repurposed) | Phase E (gated on B-PHASE-E-PRE-1) |
| **SPDR offline feed integration (FRED daily-close + Yahoo intraday)** | **B-PHASE-E-PRE-1 — placeholder ID, path-1 (FRED+Yahoo) recommended, 5-7 days estimated** |
| Per-asset-class DBS component-weight retune | Post-A.3 (evidence-gated) |
| Volume-weighted-median skew analysis (C7) | A.3 verification scope |
| Crypto-side sentinel-counting hardening | RUNNING_ISSUES entry filed in A.2 Step 10 (verbatim below) |

**RUNNING_ISSUES entry — PRE-LOCKED VERBATIM (R3) for A.2 Step 10:**

```
### #N — Crypto DBS floor counts sentinel-zero entries; stricter rule applied to xStock per B-PHASE-A1

- **Severity:** low
- **Status:** OPEN (future hardening, not blocking)
- **Description:** `directional-bias-store.ts:156-191` `publishSnapshot()` uses
  `this.store.size` as `freshCount`, which includes `sentinelZero === true`
  entries. `computeGlobalDirectionalBias()` filters sentinels at the median step
  but not at the floor step. Net effect: degraded universe can clear floor while
  producing a median over fewer than `min_sample_count` real entries. xStock
  instance applies stricter rule from day one (B-PHASE-A2); crypto instance
  retained as-is pending dedicated recalibration batch.
- **Owner:** unassigned (future crypto recalibration work)
- **Filed:** B-PHASE-A2 Step 10 governance
- **First surfaced:** B-PHASE-A1 design call, Langston review (2026-05-17)
```

A.2 completion-report lists `RUNNING_ISSUES.md` under governance-files-changed.

---

## 7. What's next

**A.1 LOCKED.** A.2 scope drafting commences:

- A.2 scope file: `Claude Comms and Packages/Scope Files/B_PHASE_A2_DBS_SCOPE.md` (parallel to this doc commit).
- Standard workflow: scope → pre-audit (SIM review of MCE + xstock_spot + directional-bias-store) → implementation → Step 4 code review → push → deploy → verify → Step 10 governance (including RUNNING_ISSUES entry per §6) → Step 11 completion report.

A.2 nominal duration: 3-5 days per v2 plan §2.

— Claude Code, 2026-05-17
