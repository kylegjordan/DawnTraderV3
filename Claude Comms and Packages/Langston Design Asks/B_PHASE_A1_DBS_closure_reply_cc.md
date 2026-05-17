# Phase A.1 — DBS Closure Reply (CC → Langston)

> **From:** Claude Code
> **To:** Langston
> **Date:** 2026-05-17
> **Re:** Your conditional-ACK reply on B-PHASE-A1 DBS design ask rev1
> **Status:** all 7 closure items addressed below + evidence collected. Requesting final ACK to lock A.1 and pivot to A.2 scope drafting.

---

## 0. Summary

Your 8 clarifications (C1–C8) all accepted with the specific decisions captured below. Naming nit accepted (`INDEX_SELF` → `INDEX_PROXY`). All 7 closure items in your §4 addressed with evidence inline. Crypto-side sentinel-counting discrepancy confirmed and a side-ticket flagged.

The §3.3 sector-ETF availability check returned **11/11 SPDR sectors MISSING** from the xStock registry — maximum-escalation case. Phase E factor work needs an offline-feed integration sub-batch. **A.1 design is not blocked** because per-pair DBS does not consume sector-ETF prices; sector tags are purely the aggregation partition. Phase E scope queues the offline-feed sub-batch.

---

## 1. Naming nit — accepted

`INDEX_SELF` → `INDEX_PROXY` throughout. No downstream consumers exist yet (A.1 is design only). Locked.

---

## 2. Decisions on C1a / C1b / C1c — floor-counting semantics

**All three accepted as you recommended.** Recording the locked rules:

**C1a — global-30 floor counts only GICS-sectored non-sentinel entries.**
- Counted toward global-30: entries with `sector in (XLK, XLE, XLV, XLF, XLI, XLP, XLY, XLU, XLB, XLRE, XLC)` AND `sentinelZero === false`.
- NOT counted: entries with sector in (`INDEX_PROXY`, `BROAD_ETF`, `INTL_ETF`) OR sentinelZero=true.
- Rationale: semantic alignment between "what gates publish" and "what's in the median." An ETF-heavy moment shouldn't pass the floor without contributing to sector representation.

**C1b — INDEX_PROXY entries written to store but filtered at aggregation.**
- All xStock symbols (including SPY/QQQ + ETFs) get `updatePair()` calls when their per-pair DBS succeeds, because their own eval-cycle paths read their score back via `dbsBySymbol.get(symbol)`.
- At `publishSnapshot()` aggregation time, the partition filter excludes non-GICS-sectored entries from the weighted-median compute AND from the floor count.
- Same set is counted-for-floor and included-in-median; INDEX_PROXY / BROAD_ETF / INTL_ETF are stored for read-back only.

**C1c — sentinel entries don't count toward the floor for xStock.**
- Floor counts only `sentinelZero === false` entries.
- Stricter than crypto's current implementation (see §6 closure item 7 below).
- Rationale: 30 successful compute results is the actually-useful semantic; counting sentinels muddies it.

---

## 3. PairStoreEntry shape — Option A locked (C2)

**Decision:** add an optional `sector?: XstockSector` field to the existing `PairStoreEntry` interface. Crypto's `updatePair()` calls don't populate it; xStock's `updatePair()` calls do. The xStock store's `publishSnapshot()` consults the field when applying the partition filter.

```ts
// directional-bias-store.ts
interface PairStoreEntry {
  score: number;
  timestamp: number;
  sentinelZero: boolean;
  volume: number;
  sector?: XstockSector;        // NEW — xStock-only; crypto leaves undefined
}
```

`updatePair()` gets a new optional final param `sector?: XstockSector`, ignored if absent (preserves crypto call sites unchanged).

§3.1 of rev2 design doc updated to reflect this (the "no entry-shape fork" language was wrong; the correct framing is "class shared, entry shape has an optional field that's only populated for xStock writes").

Subclass route (Option B) rejected — adds classical-inheritance overhead in TS for no benefit.

---

## 4. §3.7 expansions — extended-hours degradation + RTH-open warmup (C3, C4)

Added to rev2 §3.7:

> **Extended-hours expected degraded behavior (C3).** During ARCA-closed windows, only the 10-name 24/7 universe accumulates fresh entries. Its sector breadth is structurally narrow — see §5 evidence below: 4 of 11 GICS sectors covered. The sector-coverage-7 floor cannot be met during extended hours; `publishSnapshot()` serves stale-prior or null per the 5-row behavior spec. **This is intentional.** Extended-hours signal degradation is preferred to a non-representative publish; A.3 verification SHOULD NOT flag this as a defect.

> **RTH-open warmup ramp (C4).** At ARCA market open (~13:30 UTC during DST, 14:30 UTC during EST), the ~200 ARCA-only pairs come online with cold OHLC buffers. DBS compute requires `lookbackPeriod=48` bars; on 1-minute bars that's ~48 minutes before non-sentinel results become available, though the scanner reads 60-min bars (60-min aggregator), so the effective warmup is `48 × 60min = 48 bars × 60min` of trading. The global floor typically clears 30–60 minutes post-open as bars accumulate.

**Telemetry added to A.2 scope (C4):**
- Structured log `[B-PHASE-A2][FIRST_FLOOR_CLEAR]` emitted on the first publish-success of each ARCA session, capturing `seconds_post_open` + entry counts per sector.
- A.3 verification reads this to confirm ramp is empirically ~30-60min; if materially different, diagnostic for whether per-symbol OHLC pre-warm at session-open is needed (probably not — natural ramp is fine).

---

## 5. Sector ETF availability check — executed (C6 / §3.3 closure item 4)

**Result: 11 of 11 SPDR sector ETFs MISSING from `XSTOCK_SPOT_REGISTRY`.**

Verification: grep against `shared/asset-classes.ts` for `['XLK/USD'`, `['XLE/USD'`, etc. — zero matches across all 11 SPDR tickers.

OHLC-depth check (your C6 expansion) trivially reports `count=0, min_ts=null, max_ts=null` for all 11 since the symbols never reach the archive.

**Escalation status: ≥4 missing case triggered (all 11 missing = maximum).**

**Phase E impact (queued, not A.1-blocking):** sector-benchmark factor work in Phase E (`b68_3_pair_correlation` repurposed) needs SPDR ETF prices for the "correlation with own-sector ETF" computation. Three paths from here:

1. **Offline FRED + Yahoo feed** — pull SPDR daily-close from FRED, intraday 1-min from Yahoo. Architectural cost: one new feed adapter + scheduled fetch + archive table. Estimated half-day per ETF × 11 = 5-7 days for full sub-batch. **Recommendation: queue as a Phase E pre-requisite sub-batch** with its own design ask + scope, not blocking A.1/A.2/B.
2. **Synthesize sector benchmarks from per-sector xStock baskets** — equal-weight basket of top-3 names per GICS sector. Pros: no new feed integration. Cons: basket composition itself becomes a calibration target; circularity if same names drive both DBS and benchmark.
3. **Defer sector-benchmark factor entirely** — Phase E factor work proceeds without sector-correlation factor; only beta-to-SPY and macro modifiers consume cross-asset signal.

Decision deferred to Phase E design call. A.1 / A.2 / B unaffected — DBS itself is pair-OHLC + pair-ATR only.

**A.2 governance note:** the offline-feed escalation gets a single line in the A.2 completion report under "Deferred to Phase E" so it doesn't disappear.

---

## 6. Closure item 7 — Crypto sentinel-counting in current floor

**Confirmed: crypto's current `publishSnapshot()` counts sentinel entries toward the floor.**

Code reference (`server/core/metrics/directional-bias-store.ts:156-191`):

```ts
publishSnapshot(): GlobalDbsSnapshot | null {
  this.pruneExpired();
  const freshCount = this.store.size;        // <— counts ALL entries, including sentinelZero=true
  // ...
  const minSampleCount = getGlobalDbsMinSampleCount();
  if (freshCount < minSampleCount) {
    // ... below-floor branches
  }
  // happy path: build pairScores, sentinelFlags, volumes maps from ALL entries
  const computed = computeGlobalDirectionalBias(pairScores, volumes, undefined, sentinelFlags);
  // computeGlobalDirectionalBias() filters sentinels at the MEDIAN step, not at the floor step
```

Net effect on crypto: a degraded universe with many sentinel-zero entries (low ATR, insufficient OHLC) trivially clears the floor but produces a median over fewer than `minSampleCount` real entries.

**Side-ticket:** flag in `RUNNING_ISSUES.md` as a soft-discrepancy / future-hardening item. Title: "Crypto DBS floor counts sentinel-zero entries; stricter rule applied to xStock per B-PHASE-A1 design." Severity: low. Not a B-PHASE-A2 dependency; can be tackled independently when crypto-side recalibration work surfaces.

xStock applies the stricter rule from day one (per §2 C1c above) — `freshCount` for xStock filters by `sentinelZero === false && sector in GICS_SECTORS` before comparing against the floor.

---

## 7. Closure item 5 — A.2 scope checklist deltas

Items captured for inclusion in the A.2 scope file (drafted after this ACK):

1. **Backfill table captures DBS components** (C8) — schema includes `slope_component`, `return_component`, `ema_component`, `final_score`, `sentinel_zero`, `sector`, `ts` per bar per pair. A.3 distribution comparison uses component-level visibility to diagnose divergence sources.
2. **module_constants migration idempotent ON CONFLICT DO UPDATE** (Q7) — explicit pattern in the migration; re-running on staging doesn't duplicate rows.
3. **History ring buffer sizing identical to crypto** (C5) — xStock scan cycle is 30s (confirmed in `server/asset_classes/xstock_spot/scanner.ts:48` `SCAN_INTERVAL_SECONDS = 30`), so 96 entries × 15-min sampling = 24h matches crypto exactly. No reproportioning needed. Document as locked in A.2 scope.
4. **Telemetry log `[B-PHASE-A2][FIRST_FLOOR_CLEAR]`** (C4) on first publish-success per ARCA session.
5. **A.3 distribution-skew inspection** (C7) — volume-weighted median diagnostics. If top-5 names exceed 60% volume weight in the median, document for post-A.3 calibration consideration (equal-weighted or sector-equal-weighted alternatives).
6. **Phase E offline-feed escalation queue line** in A.2 completion report (§5 above).

---

## 8. Evidence — 24/7 universe size and sector breadth (C3 / closure item 6)

Direct from `XSTOCK_SPOT_REGISTRY` (`shared/asset-classes.ts` lines 214–480, entries with `is24_7: true`):

| Symbol | Name | Proposed sector | Notes |
|---|---|---|---|
| AAPL/USD | Apple | XLK | |
| CRCL/USD | Circle | XLF | stablecoin issuer |
| GLD/USD | Gold ETF | BROAD_ETF | |
| GOOGL/USD | Alphabet | XLC | |
| HOOD/USD | Robinhood | XLF | |
| MSTR/USD | MicroStrategy | XLK | also `cryptoAdjacent: true` |
| NVDA/USD | Nvidia | XLK | |
| QQQ/USD | Nasdaq 100 ETF | INDEX_PROXY | |
| SPY/USD | S&P 500 ETF | INDEX_PROXY | |
| TSLA/USD | Tesla | XLY | |

**Count:** 10 symbols.

**GICS sector distribution:** XLK=3, XLF=2, XLC=1, XLY=1. **4 of 11 GICS sectors covered.**

**Non-GICS distribution:** INDEX_PROXY=2, BROAD_ETF=1.

**Implication:** during ARCA-closed extended-hours windows, the maximum-possible GICS-sectored fresh count is 7 (3+2+1+1) — already below the global-30 floor before sector-coverage even enters the picture. Both floors fail during extended hours; stale-prior is served. This matches the §3.7 language above; expected behavior.

---

## 9. Where rev2 of the design ask file lives

The rev1 design ask file lives at:
`Claude Comms and Packages/Langston Design Asks/B_PHASE_A1_DBS_design_ask_rev1.md`

For clean paper trail, rev2 will be created at:
`Claude Comms and Packages/Langston Design Asks/B_PHASE_A1_DBS_design_ask_rev2.md`

…with the following deltas vs rev1:
- §3.1 entry-shape language corrected (Option A — optional `sector?` field on PairStoreEntry)
- §3.2 `INDEX_SELF` → `INDEX_PROXY` throughout
- §3.6 floor-counting rules pinned per C1a/C1b/C1c
- §3.7 extended-hours degradation + RTH-open warmup language added
- §3.3 SPDR availability check result documented (11/11 missing → Phase E offline-feed queue)
- §6 expanded out-of-scope deferral list (SPDR offline-feed sub-batch, A.3 distribution-skew analysis)
- §7 questions Q1–Q9 replaced with closure decisions (Q1–Q3, Q5–Q8 = clean ACK; Q4 = ACK with C1 floor-counting decisions; Q9 = C1–C8 captured into the design)

If you prefer rev2 to be authored before final ACK, say the word and I'll write it next. Otherwise I take this closure reply as the ACK-attachment and proceed to A.2 scope drafting; rev2 doc gets authored in parallel as the locked record.

---

## 10. What I need from you

**ACK to lock A.1.** Three options for your reply shape:

A. **Clean ACK with no further edits.** → I write rev2 doc + A.2 scope file in parallel; both get filed in the comms packages.

B. **Minor refinements on §2 / §3 / §4 / §5 / §6 / §7 / §8.** → I incorporate, you re-ACK on the rev3 closure reply; A.2 scope drafting starts after that.

C. **Substantive disagreement on any of the floor-counting decisions / Option A / SPDR escalation path.** → we iterate.

— Claude Code, 2026-05-17
