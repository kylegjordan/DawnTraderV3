# Phase A.1 — xStock Directional Bias Score (DBS) Design Ask (rev1)

> **From:** Claude Code
> **To:** Langston
> **Date:** 2026-05-17
> **Batch ID prefix:** B-PHASE-A1 (sub-batch sequence inside the xStock Calibration Plan; final batch ID assigned after design ACK)
> **Plan reference:** `Claude Comms and Packages/Langston Design Asks/XSTOCK_CALIBRATION_PLAN_v2_LANGSTON_REVIEW.md` §A.1 (locked 2026-05-15)
> **Predecessor:** Phase 0 (B-NEW-42 audit + B-NEW-42b structural fix shipped 2026-05-17 via commits `498e85aff` + `d8e0f5885`; all three confirmed TEC gaps closed; Phase A unblocked)
>
> **Format note:** per CLAUDE.md §6.5.0.a, this file embeds the relevant crypto-side code inline so you do not need to navigate the gdrive-mounted repo. **DO NOT `cd /mnt/gdrive/...`** — that mount stalls on the 10GB+ repo. If you want to inspect the staging code, use `ssh staging 'cd /home/deploy/dawntrader && ...'` (your `~/.ssh/config` alias works).

---

## 0. Charter

Design the architecture for xStock-specific Directional Bias Score (DBS) so that Phase A.2 (build the store + scanner integration + backfill) can proceed without further architectural iteration. Phase A.3 (verification gate comparing xStock DBS distributions to crypto) will validate the design produced here.

**Phase A.1 is design-only.** No code ships in A.1. A.2 ships scaffolding + makes the capability functional in a single shippable batch. The 🚨 SCAFFOLDING-VS-FUNCTIONAL disclosure (CLAUDE.md §9.1) does NOT apply to A.2 because the wiring goes live the same batch.

---

## 1. Context — what exists today

### 1.1 Crypto DBS architecture (mirror baseline)

**Per-pair compute** at `server/core/metrics/directional-bias.ts:56`:

```ts
export function computeDirectionalBias(
  ohlcData: OHLCData[],
  atr: number,
  config: DBSConfig = DEFAULT_DBS_CONFIG
): DirectionalBiasResult {
  // Component 1: log-price slope (linear regression over lookbackPeriod=48) normalized by ATR
  // Component 2: normalized return over the window, clipped to [-1, 1]
  // Component 3: EMA fast/slow alignment normalized by ATR
  // Weighted sum, clamped to [-1, 1]
  // Returns { score, category, sentinelZero, components }
}
```

**Default config** at `server/types/directional-bias.types.ts:93`:

```ts
export const DEFAULT_DBS_CONFIG: DBSConfig = {
  weights:   { slopeWeight: 0.40, returnWeight: 0.35, emaWeight: 0.25 },
  thresholds:{ upStrong: 0.60, upModerate: 0.30, upWeak: 0.10,
               downWeak: -0.10, downModerate: -0.30, downStrong: -0.60 },
  lookbackPeriod: 48,
  emaPeriods: { fast: 12, slow: 26 },
};
```

**Per-pair store + atomic snapshot** at `server/core/metrics/directional-bias-store.ts`:

```ts
class DirectionalBiasStore {
  private store = new Map<string, PairStoreEntry>();
  private latestSnapshot: GlobalDbsSnapshot | null = null;
  private history: HistoricalSnapshot[] = [];   // ring buffer 96 entries (~24h @ 15min)
  private transitions: CategoryTransition[] = [];

  updatePair(symbol, score, sentinelZero, volume): void { ... }
  publishSnapshot(): GlobalDbsSnapshot | null {
    // Sweep entries older than PAIR_HARD_EXPIRY_MS (5min)
    // Floor: min_sample_count from module_constants(dbs_calculation, '*')
    // Rows 1-5 behavior spec: coldStart / degradedCoverage / noSnapshot /
    //   invalidCompute / happy-path-publish
    // Compute global score via volume-weighted median of pair scores
  }
}
export const directionalBiasStore = new DirectionalBiasStore();  // singleton
```

**MCE feeds the store** at `server/services/market-context-engine.ts:1078`:

```ts
directionalBiasStore.updatePair(
  symbol,
  directionalBias.score,
  directionalBias.sentinelZero,
  volume24h,
);
```

**End-of-cycle publish** at the FX5 scanner (crypto) — global snapshot computed after the full per-pair loop, consumed by downstream DBS readers and the dashboard.

### 1.2 The xStock gap point — exact line

`server/asset_classes/xstock_spot/eval-cycle.ts:327`:

```ts
// ── 2. MCE context (assetClass-aware; synthesized neutral DBS for xstock) ──
mceContext = mce.computeContext(symbol, ohlc, lastPrice, volume24h, undefined, undefined, ASSET_CLASS);
//                                                                ^^^^^^^^^  ^^^^^^^^^
//                                                                smaPeriod  propagatedDbs
```

MCE's branch at `market-context-engine.ts:889-916`:

```ts
let directionalBias: { score, category, sentinelZero, components };
if (assetClass === 'crypto_spot') {
  if (!propagatedDbs || !Number.isFinite(propagatedDbs.score)) {
    throw new Error(`[B63][MCE] DBS not propagated for ${symbol} (asset_class=crypto_spot) — hard-contract violation.`);
  }
  directionalBias = { score: propagatedDbs.score, category: ..., sentinelZero: false, components: {...zeros} };
} else {
  // Non-crypto: SYNTHESIZE neutral DBS (Layer-1 starter; per-asset-class DBS deferred)
  directionalBias = propagatedDbs ?? { score: 0, category: 'NEUTRAL', sentinelZero: true, components: {...zeros} };
}
```

**Net result:** every xStock pair currently runs the regime classifier with `directionalBias.score=0` and `category='NEUTRAL'`, regardless of actual price trajectory. The Path-B sustainability gate (`b68_5_dbs_sustainability`) is dead-code on xStocks. Confidence modifiers default to 1.0. The regime classifier loses its directional signal.

**Phase A.1 design = how to wire real xStock DBS through that same `propagatedDbs` parameter.** The MCE branch already accepts non-crypto propagatedDbs without throwing — once we supply real values, the synthesized-neutral path is dormant.

### 1.3 Scanner integration point — exact line

`server/asset_classes/xstock_spot/scanner.ts:495`:

```ts
await evaluateXstockPairForVTS(symbol, ohlc, price, volume24hUSD, 'paper',
                                cycleCounters, cycleConfigs, bidAskSpreadPct);
```

Phase A.2 will compute DBS in the scanner BEFORE this call (so the store has all symbols populated for end-of-cycle aggregation) and thread `propagatedDbs` into `evaluateXstockPairForVTS` → `mce.computeContext`. Mirrors crypto's fx5-scanner.ts:1102-1115 pattern where ATR + DBS are pre-computed per pair before the eval loop dispatches.

---

## 2. Mirror invariant — what stays byte-identical to crypto

Per the v2 plan §A.2: **DBS component weights stay byte-identical to crypto.** Calibration-dependency principle applies to its own foundation — we observe 2-3 weeks, retune only on evidence (Langston Q1(c) round-1 sign-off). The following are NOT touched in Phase A.1:

| Item | Source | xStock value |
|---|---|---|
| `slopeWeight` | `DEFAULT_DBS_WEIGHTS` | 0.40 (identical to crypto) |
| `returnWeight` | same | 0.35 (identical) |
| `emaWeight` | same | 0.25 (identical) |
| `lookbackPeriod` | `DEFAULT_DBS_CONFIG` | 48 (identical) |
| `emaPeriods.fast/slow` | same | 12 / 26 (identical) |
| Category thresholds | `DEFAULT_DBS_THRESHOLDS` | 0.60 / 0.30 / 0.10 / -0.10 / -0.30 / -0.60 (identical) |
| Confidence modifier ranges | `DEFAULT_BIAS_CONFIDENCE_MODIFIER` | opposing 0.70-0.85, neutral 1.0, aligning 1.05-1.15 (identical) |
| `pruneExpired` cutoff | `PAIR_HARD_EXPIRY_MS` | 5min (identical) |
| Per-pair compute function | `computeDirectionalBias()` | reused as-is (no fork) |
| Global aggregation function | `computeGlobalDirectionalBias()` | reused as-is (no fork) |

**Invariant statement** for A.2 scope: the only delta from the crypto implementation is the universe scoping (which pairs the store accepts) and the floor parameters. The math and the per-pair compute function are shared.

---

## 3. xStock-specific architecture (Phase A.1 deliverables)

### 3.1 Two stores, namespaced by asset class

**Recommendation:** add a second store instance, leave the crypto store untouched.

```ts
// server/core/metrics/directional-bias-store.ts (extended)
export const directionalBiasStore = new DirectionalBiasStore();          // unchanged — crypto
export const xstockDirectionalBiasStore = new DirectionalBiasStore();    // NEW — xStock
```

**MCE branches on assetClass to pick the store:**

```ts
const targetStore = assetClass === 'xstock_spot'
  ? xstockDirectionalBiasStore
  : directionalBiasStore;   // crypto_spot, default
targetStore.updatePair(symbol, directionalBias.score, directionalBias.sentinelZero, volume24h);
```

**Why two stores not one with a partition key:**
- Universe membership is structurally disjoint (no symbol belongs to both).
- Snapshot publish cadence is different — crypto every 30s (continuous), xStock only during ARCA + extended-hours windows.
- Floor mechanics differ (sample count + per-sector floor for xStocks; sample count only for crypto).
- Cold-start logs would conflate two distinct asset classes if shared.

The DirectionalBiasStore class is already universe-agnostic — instantiating it twice costs nothing beyond two Maps and two snapshot ptrs.

### 3.2 Sector classification — extend XSTOCK_SPOT_REGISTRY

**Current shape** (`shared/asset-classes.ts:207`):

```ts
export interface XstockSpotEntry {
  name: string;
  is24_7?: boolean;
}
```

**Proposed shape** (Phase A.1 design call):

```ts
export type XstockSector =
  | 'XLK'          // Technology
  | 'XLE'          // Energy
  | 'XLV'          // Healthcare
  | 'XLF'          // Financial Services
  | 'XLI'          // Industrials
  | 'XLP'          // Consumer Staples
  | 'XLY'          // Consumer Discretionary
  | 'XLU'          // Utilities
  | 'XLB'          // Materials
  | 'XLRE'         // Real Estate
  | 'XLC'          // Communication Services
  | 'INDEX_SELF'   // SPY / QQQ / IWM xStocks — excluded from global aggregation
  | 'BROAD_ETF'   // ARKK, ARKG, XBI, GLD, TOTL, IEMG, etc. — fall back to SPY for benchmark
  | 'INTL_ETF';   // Country/region ETFs — EWA, EWC, EWG, EWI, EWL, EWN, EWP, EWQ, EWS, EWU, EWZ

export interface XstockSpotEntry {
  name: string;
  is24_7?: boolean;
  sector: XstockSector;        // NEW — required (TypeScript enforces)
  adr?: boolean;               // NEW — optional flag for foreign-listed names; Phase E factor work consumes
  cryptoAdjacent?: boolean;    // NEW — optional flag for MSTR/COIN/miners; Phase E factor work consumes
}
```

**Why on the registry:** single-source-of-truth principle per B-NEW-30 (the registry pattern that consolidated symbol membership + display name). Sector mapping is per-symbol metadata, same shape as is24_7. Forces every xStock to declare its sector at registration time (TypeScript hard-fail if missing).

**The full ~250-entry sector mapping is OUT OF SCOPE for A.1 design.** I propose: A.1 locks the shape + sample mapping for 20-30 names (one per sector to validate taxonomy coverage); A.2 fills in the remaining ~220 entries as a single typed-data PR.

**Sample mapping** (10 names per sector representative + the 4 special buckets) — provided for taxonomy validation, not as the final list:

| Sector | Sample names |
|---|---|
| XLK (Technology) | AAPL, MSFT, NVDA, AMD, INTC, ORCL, CSCO, IBM, ADBE, CRWD |
| XLE (Energy) | XOM, CVX, COP, SLB, OXY, MPC, PSX, VLO, EQT, SHEL |
| XLV (Healthcare) | JNJ, LLY, MRK, ABBV, PFE, BMY, TMO, DHR, AMGN, GILD |
| XLF (Financial Services) | JPM, BAC, WFC, MS, GS, AXP, BLK, MET, PRU, AIG |
| XLI (Industrials) | UPS, RTX, DE, LMT, EMR, MMM, GEV, ROK, PWR, FAST |
| XLP (Consumer Staples) | KO, PG, PEP, MO, PM, MDLZ, CL, STZ, TAP, WBA |
| XLY (Consumer Discretionary) | AMZN, TSLA, HD, MCD, NKE, LOW, F, GM, TGT, ABNB |
| XLU (Utilities) | NEE, SO, DUK, AEP, D, EXC, SRE, XEL, ED, DTE |
| XLB (Materials) | (less coverage; BCC, …) |
| XLRE (Real Estate) | AMT, PLD, EQIX, CCI, PSA, O, AVB, EQR, DLR, ESS |
| XLC (Communication Services) | GOOGL, META, NFLX, DIS, T, VZ, CMCSA, TMUS, WBD, PARA |
| INDEX_SELF | SPY, QQQ |
| BROAD_ETF | ARKK, ARKG, XBI, GLD, TOTL, IEMG |
| INTL_ETF | EWA, EWC, EWG, EWI, EWL, EWN, EWP, EWQ, EWS, EWU, EWZ |
| ADR flag (orthogonal) | BABA, BIDU, JD, NIO, LI, ASML, BNTX, SAP, SHEL, NVO, DEO, UL, … |
| cryptoAdjacent flag | MSTR, COIN, CIFR, BITF, BTBT, HIVE, HUT, CLSK, GLXY, DFDV |

**Question for Langston:** does this 14-bucket taxonomy work, or should we collapse INTL_ETF + BROAD_ETF into one ETF_BROAD bucket since they functionally behave the same for sector benchmarking (no domestic-sector benchmark, fall back to SPY for any sector-correlation work in Phase E)?

### 3.3 Sector ETF data availability check (procedure)

**Per v2 plan §A.1 — execute as part of A.1 closure** before declaring A.1 ACK'd:

For each of the 11 SPDR sector tickers (XLK, XLE, XLV, XLF, XLI, XLP, XLY, XLU, XLB, XLRE, XLC):

```bash
# Run from staging (where the registry is loaded):
ssh root@188.245.193.8 'cd /home/deploy/dawntrader && node -e "
  const { XSTOCK_SPOT_SYMBOLS } = require(\"./dist/shared/asset-classes.js\");
  for (const t of [\"XLK\",\"XLE\",\"XLV\",\"XLF\",\"XLI\",\"XLP\",\"XLY\",\"XLU\",\"XLB\",\"XLRE\",\"XLC\"]) {
    console.log(t, XSTOCK_SPOT_SYMBOLS.has(t + \"/USD\") ? \"present\" : \"MISSING\");
  }
"'
```

**Decision tree on the result:**
- 0 missing → no action; A.1 design proceeds clean.
- 1-3 missing → document gaps; defer the missing sectors' direct-benchmark factor to Phase E (Phase A DBS does not depend on sector ETFs directly; the sector tag itself is purely a partition for aggregation).
- ≥4 missing → escalate. Sector-benchmark factor work in Phase E needs an offline-feed integration sub-batch (FRED daily-close + Yahoo intraday). I propose A.1 still locks as designed; the offline-feed sub-batch is queued for Phase E start, not blocking A.2.

**Key clarification:** Phase A.1 DBS does NOT consume sector ETF prices. Per-pair DBS uses pair-OHLC + pair-ATR (same math as crypto). The sector tag's role at A.1 is exclusively the AGGREGATION partition for the global xStock DBS snapshot. Sector-ETF prices enter the picture only in Phase E factor work (`b68_3_pair_correlation` repurposed to "correlation with own-sector ETF").

### 3.4 Index-self handling

**Rule:** xStocks whose underlying is itself a broad index (SPY, QQQ; possibly IWM if it's an xStock — registry says no, only SPY + QQQ currently are) get `sector: 'INDEX_SELF'` and are:

- **INCLUDED** in per-pair DBS compute — we want to know SPY's direction; that's literally the macro signal.
- **EXCLUDED** from the global xStock DBS aggregation — including SPY in a weighted-median over the xStock universe would make the global DBS effectively SPY's own DBS (since SPY is by construction the universe-aggregate).
- **EXCLUDED** from sector-floor calculations — they don't have a sector.

**Per-pair DBS for INDEX_SELF pairs is still consumed** by the regime classifier for that pair's own eval-cycle path. SPY's regime gets classified using SPY's own DBS; that's correct.

**No sector-blind regime mode flag needed** — the v2 plan language "force-use sector-blind regime mode" was loose phrasing; in implementation the regime classifier doesn't take sector as an input today, only DBS score. Index-self is handled purely at the aggregation layer.

### 3.5 SPY fallback at A.1 — clarification

The v2 plan said "Sector-classification with SPY fallback." I read this as: for pairs with `sector: 'BROAD_ETF'` or `sector: 'INTL_ETF'`, sector-correlation factor work (Phase E) falls back to SPY as the benchmark since no domestic-sector match exists.

**At Phase A.1 level, SPY fallback is registry-only.** No runtime behavior depends on it — the per-pair DBS uses pair-OHLC only, and the global aggregation excludes INDEX_SELF anyway.

The "SPY fallback" runtime behavior actually appears in:
- **Phase C macro modifier** — SPY-relative metrics (beta-to-SPY, etc.) feed the equity macro modifier (analog of crypto's macro-modifier.ts).
- **Phase E factor work** — `b68_3_pair_correlation` repurposed to "correlation to own-sector ETF (or SPY fallback if BROAD_ETF/INTL_ETF)."

So at A.1 we just lock the registry tags; downstream phases consume them.

### 3.6 Floor mechanics — global + per-sector

**Crypto** uses a single floor: `min_sample_count = 20` from `module_constants(module='dbs_calculation', knob='min_sample_count', exchange='*', assetClass='*', strategy='*', regime='*')`.

**xStock proposal** (Phase A.1 design, evidence-free starter; A.3 verification refines):

Two floors gate publish:
- **Global floor:** sample count ≥ 30 fresh entries.
- **Sector coverage floor:** ≥ 7 distinct sectors with ≥ 1 entry each (out of 11 GICS sectors; INDEX_SELF + BROAD_ETF + INTL_ETF do not count toward sector coverage).

Both floors must be satisfied for a fresh publish; otherwise serve stale-prior or null per the existing 5-row behavior spec (`directional-bias-store.ts:156-265`).

**Recommendation A — module_constants seeding:**

| module | knob | exchange | assetClass | strategy | regime | value | rationale |
|---|---|---|---|---|---|---|---|
| `dbs_calculation` | `min_sample_count` | `*` | `xstock_spot` | `*` | `*` | 30 | global floor |
| `dbs_calculation` | `sector_coverage_floor` | `*` | `xstock_spot` | `*` | `*` | 7 | NEW knob — count of distinct sectors required |

Wildcard fallback for asset-class-agnostic readers stays at 20 (crypto's value).

**Why both floors:** evidence from Phase 0 archive showed the xStock universe is 250+ symbols (vs crypto's ~140); a "30 of 250" floor is weaker proportionally than crypto's "20 of 140" (12% vs 14%). Pairing global with sector-coverage stops a publish from going out when all 30 happen to be in a single sector — e.g. a market hour where only tech names were updated.

**Per-sector floor 3-5 from v2 plan** — interpreting: this was a target value for "each sector should have 3-5 pairs in steady state." For the floor mechanic (gating publish), I propose `≥ 7 sectors with ≥ 1 entry each` instead, because requiring 3 per sector × 7 sectors = 21 distinct-sector entries which combined with the 30-global floor is a stronger gate than per-sector 3 × 11 sectors = 33 entries (which is dominated by the global floor anyway). Open to your call on this.

### 3.7 Cold-start parity

Same 5-row spec as crypto (cold-start / degraded-coverage / no-snapshot / invalid-compute / happy-path-publish). No deviation. Re-use the existing `DirectionalBiasStore` class instance — its behavior is universe-agnostic.

ARCA-closed cycles: the xStock scanner already short-circuits before the eval loop runs when no pairs are open (`scanner.ts:307` `cyclesSkippedMarketClosed`). The store does NOT receive `updatePair` calls during closed windows, so entries naturally age past `PAIR_HARD_EXPIRY_MS = 5min` and the next publish after market re-open is a cold-start. The 24/7 extended-hours pairs keep their entries alive during ARCA-closed sessions (60-min OHLC bars still aggregate).

### 3.8 Confidence modifier path

The `computeBiasConfidenceModifier(category)` function at `directional-bias.ts:226` is universe-agnostic — it maps a category (UP_STRONG / UP_MODERATE / … / DOWN_STRONG) to a multiplier. The downstream consumers (RTB, SQE, ranking-weights) already call this function with the per-pair DBS category. No changes needed for xStocks; they get the same multipliers via the same path once `propagatedDbs` is real.

---

## 4. Integration architecture (A.2 scope preview — for design alignment)

The architectural deliverable of A.1 is the design of these wirings. A.2 implements them.

### 4.1 Scanner pre-cycle DBS compute

**Location:** `server/asset_classes/xstock_spot/scanner.ts` — insert a new block before the `for (const symbol of symbolList)` eval loop at line 467.

**Pattern (mirrors fx5-scanner.ts:1098-1118):**

```ts
// Pre-cycle: compute per-pair DBS for every symbol with sufficient OHLC,
// feed xstockDirectionalBiasStore, AND remember per-symbol score for thread-down.
const dbsBySymbol = new Map<string, { score: number; category: string; slope: number }>();
for (const symbol of symbolList) {
  const ohlc = ohlcBatch.get(symbol) ?? [];
  if (ohlc.length < minOhlcHistoryBars) continue;
  const atr = computeATRFromOHLC(ohlc, 14);
  if (atr <= 0) continue;
  const dbsResult = computeDirectionalBias(ohlc, atr);
  let slope = 0;
  const priorOHLC = ohlc.slice(0, -3);
  if (priorOHLC.length >= 20) {
    const priorAtr = computeATRFromOHLC(priorOHLC, 14);
    if (priorAtr > 0) {
      const priorDbs = computeDirectionalBias(priorOHLC, priorAtr);
      slope = dbsResult.score - priorDbs.score;
    }
  }
  // Feed the xstock store (volume from ticker enrichment if available)
  const volume24hShares = tickerEnrichmentBySymbol.get(symbol)?.volume24hShares ?? 0;
  const latestPrice = ohlc[ohlc.length - 1].close;
  const volume24hUSD = volume24hShares * latestPrice;
  xstockDirectionalBiasStore.updatePair(
    symbol,
    dbsResult.score,
    dbsResult.sentinelZero,
    volume24hUSD,
  );
  dbsBySymbol.set(symbol, { score: dbsResult.score, category: dbsResult.category, slope });
}

// Now eval-cycle loop uses dbsBySymbol.get(symbol) to thread propagatedDbs.
```

### 4.2 Eval-cycle threads propagatedDbs

**Location:** `server/asset_classes/xstock_spot/eval-cycle.ts:265` — `evaluateXstockPairForVTS` signature extended.

```ts
export async function evaluateXstockPairForVTS(
  symbol: string,
  ohlc: OHLCData[],
  lastPrice: number,
  volume24h: number,
  mode: 'paper' | 'live',
  counters: XstockEvalCycleCounters,
  configs?: XstockFilterConfigBundle,
  bidAskSpreadPct: number = -1,
  propagatedDbs?: { score: number; category: string; slope?: number },   // NEW
): Promise<void> {
  // ...
  mceContext = mce.computeContext(
    symbol, ohlc, lastPrice, volume24h, undefined, propagatedDbs, ASSET_CLASS,
  );
  // ...
}
```

Scanner call-site at scanner.ts:495 extends to:

```ts
await evaluateXstockPairForVTS(
  symbol, ohlc, price, volume24hUSD, 'paper',
  cycleCounters, cycleConfigs, bidAskSpreadPct,
  dbsBySymbol.get(symbol),  // NEW
);
```

When `dbsBySymbol.get(symbol)` returns `undefined` (pair short of OHLC history; ATR<=0), eval-cycle passes undefined → MCE's existing non-crypto branch synthesizes neutral (the current behavior). So insufficient-data pairs degrade gracefully to today's behavior.

### 4.3 End-of-cycle snapshot publish

**Location:** `scanner.ts:498` (after the eval loop) — add:

```ts
const xstockGlobalSnapshot = xstockDirectionalBiasStore.publishSnapshot();
// Snapshot is consumed by global-DBS readers (Phase A.3 verification queries this).
// Crypto's snapshot is consumed today by ranking-weights, drift-dashboard, market-indicators —
// xStock counterparts wired in Phase A.3 verification or later phases.
```

### 4.4 Backfill (A.2 sub-deliverable)

Per v2 plan §A.2: 2-3 weeks of historical DBS from archived OHLC. Backfill script reads `xstock_spot_ohlc_1m`, replays per-bar DBS, populates a backfill table (Phase A.3 verification reads this for distribution comparison).

**Archive maturity gate (v2 plan §A.2 invariant):** Phase A.2 verifies the actual xStock OHLC archive start date BEFORE shipping. <7 days → A.2 WAITS. 7-14 days → ships with thinness caveat documented in completion report. 14+ days → no caveat. The archive started ~B79.0a-era (mid April 2026) so as of 2026-05-17 we have ~30 days, which clears the gate, but A.2 re-verifies at ship time.

---

## 5. Phase A.1 deliverable scope (final)

A.1 ships **design only** (no code). The artifacts that close A.1:

1. **This document, ACK'd.** Plus reply file capturing any deltas.
2. **Sector taxonomy locked.** Either the 14-bucket proposal in §3.2 or a Langston-modified variant.
3. **Floor mechanic locked.** Either the global-30 + sector-coverage-7 proposal in §3.6 or a Langston-modified variant.
4. **Sector ETF data availability check executed and result documented.** Inline in §3.3 of this doc's reply, or as appendix.
5. **Open questions §7 resolved.**

After A.1 ACK, A.2 scope file gets drafted and follows standard workflow (scope rev → Langston review → implementation → step 4 code review → push → deploy → step 7+8 verify → step 10 governance → step 11 completion).

---

## 6. Out-of-scope (deferred)

| Item | Deferred to |
|---|---|
| Full sector mapping for ~250 names | A.2 (typed-data PR; TypeScript enforces completeness) |
| Backfill table schema | A.2 |
| Phase B threshold calibration for xStock-specific category cutpoints (currently DEFAULT_DBS_THRESHOLDS reused) | Phase B.1 |
| Sector ETF direct-correlation factor (`b68_3_pair_correlation` repurposed) | Phase E |
| SPY fallback runtime behavior beyond registry tagging | Phase C macro + Phase E factor |
| Per-asset-class DBS component-weight retune | Post-Phase-A observation period (≥2-3 weeks; evidence-gated) |
| INDEX_SELF "sector-blind regime mode" as separate code path | Not needed — handled at aggregation layer only (§3.4) |
| Offline ETF feed integration (FRED + Yahoo for missing SPDR ETFs) | Phase E or Phase D sub-batch, if §3.3 surfaces ≥4 missing |
| Dashboard UI surfacing of xStock global DBS | Out-of-scope until A.3 validates distributions |

---

## 7. Open questions for Langston (numbered, with my recommendations)

**Q1. Two stores or one with partition key?** I recommend **two stores** (§3.1) — they are universe-disjoint, cadence-disjoint, and floor-mechanic-disjoint. One store with a partition key would require adding asset-class as a first-class field on PairStoreEntry + every Map keyed by `(assetClass, symbol)` + double the snapshot pointer logic. Marginal complexity not worth saving the second singleton.

**Q2. Sector taxonomy — 14 buckets or collapse INTL_ETF + BROAD_ETF?** I recommend **14 buckets** (§3.2). Keeping INTL_ETF separate from BROAD_ETF preserves the distinction for Phase E factor work (country-ETF regime behavior differs from thematic-ETF; a future "regime sensitivity to USD" factor would need to know which is which). Cost of keeping separate is zero — they aggregate identically at A.1.

**Q3. ADR + cryptoAdjacent as orthogonal flags vs as their own sector tags?** I recommend **orthogonal optional flags** (§3.2). ADRs span sectors (BABA = XLY, ASML = XLK, SHEL = XLE), and cryptoAdjacent spans sectors (MSTR = XLK, COIN = XLF, CIFR = XLE proxy). Forcing them into a single "sector" position collapses information.

**Q4. Global floor of 30 + sector coverage of 7 — calibration?** I recommend **30 + 7 as evidence-free Layer-1 starters** (§3.6) consistent with the workflow invariant — A.3 verification gates retune to evidence-grade values. The starter values are not tuned for empirical xStock distributions; they're tuned for "approximately as strict as crypto's 20-floor in proportional terms while requiring meaningful sector diversity."

**Q5. Snapshot publish cadence — every scan cycle (30s) or fixed time interval (5min like crypto's apparent cadence)?** I recommend **every scan cycle** (mirror crypto's `publishSnapshot()` call at end of each FX5 cycle). Yes, crypto's history ring-buffer says "96 entries × 15min = 24h" — that's the history target, not the publish cadence. The publish itself runs every cycle (~30s), the history ring downsamples by being a ring buffer. xStock should do the same. ARCA-closed cycles short-circuit before publish (no eval loop runs, store empty, cold-start path served).

**Q6. xstockDirectionalBiasStore singleton placement — same module as the crypto store, or split into a second file?** I recommend **same module** (`server/core/metrics/directional-bias-store.ts`). Both stores are instances of the same class. Splitting them is overhead. Just add the export line.

**Q7. `module_constants` seeding for xstock_spot — full set of dbs_calculation rows mirrored at crypto values, or wildcard fallback only?** I recommend **explicit xstock_spot rows for every DBS knob** with values identical to crypto's at A.2 ship time. Two reasons: (a) the calibration-dependency invariant requires retuned values to land in asset-class-keyed rows (otherwise they'd inadvertently affect crypto), so the row scaffolding needs to exist; (b) DB queries that filter on `assetClass='xstock_spot'` need explicit rows rather than wildcard fallback to surface "missing data" clearly. Cost is one migration with ~5-6 rows × idempotent ON CONFLICT.

**Q8. Sector ETF availability check timing — before A.1 ACK or as part of A.2 scope?** I recommend **before A.1 ACK** (§3.3). The check is a single SSH command; running it now lets us close A.1 with the result documented and surfaces any escalation (≥4 missing → offline-feed sub-batch) BEFORE A.2 scope drafting wastes effort. I'll run it as part of post-ACK closure if you concur.

**Q9. Any architectural concerns I haven't surfaced?** Open-ended Langston question; expecting your typical depth scrutiny here.

---

## 8. Sequencing & gate to A.2

After your ACK on this design (or revised version after iteration):

1. I execute the sector ETF data availability check (Q8) and document result in the reply file.
2. A.2 scope file drafted (`Claude Comms and Packages/Scope Files/B_PHASE_A2_DBS_SCOPE.md`).
3. Standard scope review → pre-audit → implementation → step 4 → push → deploy → verify → governance → completion.
4. A.3 verification gate spawns from A.2 closure (separate scope file).

A.2 nominal duration: 3-5 days per v2 plan §2.

---

## 9. What I need from you (final pass)

1. **ACK** on the architecture as designed, OR
2. **Revisions / refinements** — surface anything I missed.
3. **Decisions on Q1-Q8.**
4. **Q9 critique** — anything I haven't thought of.

If clean ACK: I run §3.3 sector ETF availability check, log result, and pivot to A.2 scope file.

— Claude Code, 2026-05-17
