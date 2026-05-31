# B.1.5 Pre-Audit — xStock Liquidity/Volume Data-Integrity + Cross-Asset Isolation

**Batch:** B-XSTOCK-CALIB **B.1.5** (data-integrity GATE before B.2 IMF calibration)
**Workflow step:** 2 (Pre-Implementation Audit)
**Scope ref:** `Scope Files/B_XSTOCK_GLOBAL_FILTER_SCOPE.md` (v3, Kyle-signed-off, Langston CLEAN-CONDITIONAL)
**Author:** CC, 2026-05-29. **Status:** DRAFT — awaiting Langston Step-2 review.
**Discipline:** every claim below is verified at code level (file:line) per Kyle's standing "verify, don't assume" directive. SIM + System Manual consulted per CLAUDE.md §9.

---

## 0. What this pre-audit closes (vs scope v3 open items)

| Mandate | Status after this pre-audit |
|---|---|
| Row-7 (pattern detector volume use) — MUST close before Step-2 sign-off | **CLOSED** — pattern-filter.ts IS a volume consumer (2 sites). See §5.1. |
| Row-8 (RTB stored `volume24h`) — stop-store vs annotate | **CLOSED** — confirmed stored, never read for admission/ranking. Decision: §5.2. |
| Per-component SIM + Manual deep read (all 12 §1 rows) | **DONE** — §2. |
| Crypto-vs-xStock difference register | **DONE** — §3. |
| Cross-asset isolation proof plan | **DONE** — §4. |
| SIM / Manual silence flags (governance gaps) | **DONE** — §6. |

---

## 1. The volume chain — verified end-to-end at code level

The single inflated number and where it fans out (all line-cited from the `C:\dev` mirror, HEAD `32d7e2c`):

1. **Source.** `xstock_spot_ticker_snap.volume_24h` — archived from Kraken `ws-equities` ticker. Schema `shared/schema.ts:4683` (`volume_24h numeric`). Self-documented as the **underlying's share volume**: `scanner.ts:123` — *"24h rolling SHARE volume from Kraken ticker; multiply by price for USD."* Root cause already proven this session (raw-WS capture: TSLA `volume`≈13.2M climbing to `prev_day_volume`≈44.8M = real Tesla share volume).
2. **Scanner read + USD conversion.** `scanner.ts:490` (`SELECT volume_24h`), `:513` (`volume24hShares = parseFloat(...)`), `:658-660` and `:615-616` (`volume24hUSD = volume24hShares × price`). This is the ~700× inflated figure (underlying turnover, not token liquidity).
3. **Fan-out from the scanner** — the same `volume24hUSD` is passed to:
   - **Global filter** — `scanner.ts:666` → `eval-cycle.ts:303` → `global-filter.ts:54,118` (min_volume gate).
   - **Pattern filter** — `eval-cycle.ts:306` → `pattern-filter.ts:112,199` (min_volume gate).
   - **MCE** — `eval-cycle.ts:338` → `market-context-engine.ts:1051` param → `:1229` `indicators.volume = volume24h` → `:1288-1293` `directionalBiasStore.updatePair(..., volume24h)`.
   - **Global-DBS volume-weight** — `scanner.ts:619-621` `xstockDirectionalBiasStore.updatePair(symbol, score, sentinelZero, volume24hUSD, sector)`.
4. **Second inflated input (independent of #2): per-bar OHLC volume.** The IMF Log-Liquidity reads `candle.volume` directly (`imf-metrics.ts:68`), NOT `volume24hUSD`. The OHLC bars are rolled up from `xstock_spot_ohlc_1m`, whose per-bar volume is also the underlying's. So **LQ is inflated by a second, separate path** from the global-filter gate.

**Depth is already archived but unread.** `equity-spot-archiver.ts:98,100` writes `bid_qty`/`ask_qty` to the snap; `shared/schema.ts:4679,4681` defines the columns (`bid_qty`, `ask_qty numeric(28,8)`). The scanner SELECT (`scanner.ts:486-498`) pulls only `bid`/`ask` **prices** (→ spread%), NOT the quantities. So order-book **depth** exists in the DB and needs only a SELECT + plumbing change — **no new archiver work, no schema migration.** (To be re-confirmed populated on staging during Step 7.)

---

## 2. Per-component deep dive (SIM + Manual + code)

Each row = §1 blast-radius row. "Affected?" = does the ~700× inflation actually change behavior (not just "reads volume").

### Row 1 — Global filter `xstock_spot/global-filter.ts` — **AFFECTED (latent)**
- **Code:** `evaluateXstockGlobalFilter(... volume24hUSD ...)`; min_volume gate `:117-121` fires only when `minVolume>0 AND volume24hUSD>0`. DB `active_quant.min_volume` currently $1M.
- **SIM:** §3.2 FX5 Scanner / §3.3 Active Filter Pool (the crypto analogue; xStock fork mirrors it). **Blast radius: CRITICAL** (determines pipeline admission).
- **Today:** because real token $-volume can be < $1M, an inflated value (billions) sails over the $1M floor → gate passes everything → **no liquidity pre-screen in practice.** The gate is structurally present but mis-calibrated against the wrong denominator.
- **Fork status:** FORKED file (hardcodes `assetClass:'xstock_spot'`); no shared-compute edit needed here.

### Row 2 — IMF LQ `imf-evaluator.ts` → `imf-metrics.ts:calculateLogLiquidity` — **AFFECTED (saturated)**
- **Code:** `imf-evaluator.ts:104` `LQ = calculateLogLiquidity(ohlc)`; shared fn `imf-metrics.ts:60-81`: `LQ = log10(avgVolumeUSD+1)×10`, clamp [0,100], `avgVolumeUSD = Σ(typicalPrice×volume)/N`.
- **Manual:** §8 (`LQ` formula, "recalibrated for crypto", assumes USD volume ≈ deep market). §9 documents a second spread-aware LQ in `analysis-utils.ts` (not used by xStock filters).
- **Today:** xStock `candle.volume` = underlying per-bar share volume → `avgVolumeUSD` huge → `log10` → **LQ pins at ~100 for every xStock** → `LQ ≥ lq_min` gate **never rejects.** Liquidity gating is effectively OFF at the IMF stage — dangerous for an illiquid class (opposite of protective).
- **Precision:** only **LQ** is volume-corrupted. `calculateVolNoise` (`:96`) and `calculateCorrelation` (`:104`) use **close prices only** — NOT affected.
- **Fork status:** `calculateLogLiquidity` is SHARED with crypto → must NOT be edited (R3). Fix lives in a new forked module.

### Row 3 — MCE `market-context-engine.ts` — **AFFECTED (pass-through to two real consumers)**
- **Code:** `volume24h` param `:1051`; stored to `indicators.volume` `:1229`; forwarded to DBS store `:1288-1293`; archived `:1342`. MCE itself does not gate/multiply on volume — it is a distributor.
- **SIM:** §5.2.5 MCE — **Blast radius HIGH**; per-class cache key `${symbol}:${assetClass}`; B79.0n.MCE + CONFIDENCE-CHAIN established per-class accessors.
- **Net:** the corruption MCE propagates lands in (a) ORB via `indicators.volume` and (b) global-DBS weight. Fixing those two downstream + re-sourcing the scanner input neutralises MCE's pass-through.
- **Fork status:** SHARED engine, already `assetClass`-required. `indicators.volume` assignment is class-invariant; any change must be `assetClass`-gated.

### Row 4 — Global DBS volume-weight `directional-bias.ts` + `directional-bias-store.ts` — **AFFECTED (relative distortion, partly capped)**
- **Code:** weight = raw volume — `directional-bias.ts:161-162` (`weight: volume`); per-pair cap `:176-182` (`GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT`). Store `updatePair(... volume ...)` `:194`; `publishSnapshot` builds the volumes map `:312-322`.
- **SIM:** §5.1b/§5.1c — global DBS = volume-weighted median, feeds the regime classifier (`calculatePairRegime` consumes DBS). **Blast radius HIGH.**
- **Today:** xStock store is a **separate per-class instance** (`xstockDirectionalBiasStore`), but the weighting **math is shared**. Inflated volume distorts the *relative* weight between xStock pairs (high-$-underlying names dominate the median); the per-pair cap bounds the worst case but does not remove the skew → regime classification bias.
- **Fork status:** store instance is per-class; weighting math shared. Fix = change the **weight value the xStock scanner passes** (forked `scanner.ts`), e.g. top-of-book depth-USD — **no shared-math edit.**

### Row 5 — Volume-Regime modulator B68.2 `volume-regime.ts` — **NOT AFFECTED (ratio-invariant)** ✅
- **Code:** `computeVolumeRegime` reads per-bar OHLC volume `:126`, but the factor is a **ratio** `score = signedVolumeSum / totalVolumeSum` `:134-148`; liquidation-spike detector is median-relative `:140-144`. A uniform scale error cancels in both. `_assetClass` param present but explicitly unused (`:100-101`, "class-invariant by construction").
- **Disposition:** document as unaffected (O3 "document why unaffected"). No code change.

### Row 6 — Strategies — **MOSTLY NOT AFFECTED; ORB is the one genuine bug** ⚠️
- **ORB `strategies/orb.ts`** — **AFFECTED (hard gate + confidence).** `:247` `currentVolume = indicators.volume` (= inflated 24h field from MCE); `:250-251` divides it by a **per-minute** opening-range average → mismatched denominators; `:252` HARD GATE `if (volumeMultiple < ORB_VOL_MULT_MIN) return null`; `:272` confidence bonus on `volumeMultiple`. For inflated xStock volume the multiple is wildly large → gate always passes + bonus saturates.
- **All other strategies** (reverse-impulse, inside-bar-reversal, volatility-edge, pivot-shift, support-bounce, morning-star, adaptive-flow, defensive-hedge) use **per-bar volume RATIOS** via `strategy-helpers.ts:averageVolume` → scale-invariant → **NOT affected.** `strong-bull-trend` uses no volume.
- **Fork status:** strategy detect fns are SHARED (thresholds DB-keyed). ORB fix must be `assetClass`-gated or sourced from a coherent per-bar unit.

### Row 7 — Pattern detector / `xstock_spot/pattern-filter.ts` — **AFFECTED (CLOSES the TBD)** — see §5.1.

### Row 8 — RTB `ready_to_buy_service.ts` — **NOT a live consumer (stored, unused)** — see §5.2.

### Row 9 — SQE `signal_quality_evaluator.ts` — **NOT AFFECTED (no volume input)** ✅
- `SQEInput` (`:97-116`) has no volume/liquidity/depth field. Gates on FinalScore, RegimeWeight, ROI, confidence floor only. `assetClass` present for per-class thresholds. Confirmed.

### Row 10 — Position sizing `paper-position-sizing.ts` + `dynamic-sizing-engine.ts` — **NOT AFFECTED; this is the GAP** ⚠️
- Sizing is purely risk-based: `paper-position-sizing.ts` qty = `riskAmount/stopDistance` `:173`, caps = exposure budget × maxPositionPct × buffer, pattern-pool MAX_POSITION_PCT, covariance scale. `dynamic-sizing-engine.ts` hard cap = `balance × max_position_risk` (0.02). **No liquidity/depth/participation term anywhere.**
- VTS path is even simpler: fixed **$150 notional** (`eval-cycle.ts:696`).
- **GAP:** for an illiquid class, size is not bounded by what the book can absorb → the stuck-trade risk. R4 minimum-viable target.

### Row 11 — Exits / TEC `trailing-exit-controller.ts` — **NOT AFFECTED; GAP** ⚠️
- Exit triggers are all **price/time-based**: break-even latch, target-lock, ladder ratchet, moonbag duration cap, dynamic trailing (HWM/ATR/DI/VolNoise), stop-hit. No depth/volume input. `assetClass`-gated market-closed freeze is a clock check, not liquidity. Cost floors use spread/slippage, not depth.
- **GAP:** no "liquidity drying up → exit early/accept worse fill" path. R4 minimum-viable target.

### Row 12 — Cost model `cost-model.ts` / friction — **NOT AFFECTED (spread-only)** ✅
- `totalCost = fee×2 + slippage×2 + spread` `:20,124-126`; static per-class friction (`xstock_spot/friction.ts`). No depth input.
- **FLAG (confirms, not contradicts):** `slippage-fee-model.ts:48-51` *does* model depth→price-impact, and `pre-execution-validator.ts:119` computes it — but the execute/reject gate (`canExecute` `:173` = `riskApproved && goalAlignmentPassed && feeProfitabilityPassed`) uses **fee only** (`netExpectedGainPct = expectedGainPct − roundTripFeePct` `:149`). The depth slippage is display/realism-only, never a decision. So depth is *computed near a decision but excluded from it* — relevant precedent for R4 (we already have a depth→impact model to reuse).

**Summary:** genuinely affected = Rows 1, 2, 3 (pass-through), 4, 6-ORB, 7. Ratio-invariant / not-consumer = Rows 5, 6-others, 9, 12. GAPs = Rows 10, 11. Stored-but-unused = Row 8.

---

## 3. Crypto-vs-xStock difference register

What crypto does today vs what xStock will do, why, and the isolation mechanism. (R-items map to scope §2.)

| # | Component | Crypto today | xStock after B.1.5 | Why different | Isolation mechanism |
|---|---|---|---|---|---|
| R1a | Global-filter liquidity gate | `min_volume` on real token $-vol (deep market) | **Stop gating on `volume24hUSD`**; gate on **top-of-book depth-USD** (new `min_depth_usd`), keep `max_bid_ask_spread` | xStock 24h field = underlying, not token; depth is the only trustworthy live signal | FORKED `global-filter.ts` (no crypto file touched); new threshold key under `xstock_spot` |
| R1b/R3 | IMF Log-Liquidity | `calculateLogLiquidity(ohlc)` = `log10(avgVolumeUSD)` (shared) | **New `xstock_spot/imf-liquidity.ts`** = depth/quote-based LQ on a 0-100 scale | crypto LQ assumes deep USD volume; xStock per-bar volume = underlying → saturates at 100 | NEW forked module; shared `imf-metrics.ts` untouched → crypto byte-identical |
| R2 | Order-book depth input | crypto reads live ticker bid/ask qty inline (fx5) | Thread `bid_qty`/`ask_qty` from snap → scanner SELECT → eval-cycle → filters + LQ | depth absent from xStock filter chain today; data already archived | FORKED scanner.ts SELECT + eval-cycle threading; new param on forked filters |
| R4a | Sizing liquidity cap | none (risk-based only) | **Participation cap**: size ≤ X% of `ask_qty`-USD at trade time (min-viable) | illiquid book → can't absorb risk-based size | SHARED `paper-position-sizing.ts` — **`assetClass==='xstock_spot'` gate**; crypto path unchanged |
| R4b | Thin-market exit | none (price/time only) | **Thin-market hook**: if `bid_qty`-USD < Y at eval tick, accept worse fill (min-viable) | stuck-open risk in thin book | SHARED `trailing-exit-controller.ts` — `assetClass` gate; crypto unchanged |
| R-ORB | ORB volume gate/bonus | 24h vs per-min mismatch exists for crypto too but crypto 24h is the token's (coherent magnitude) | re-source ORB's volume to a coherent per-bar unit OR `assetClass`-gate the gate | xStock 24h = underlying → mismatch is extreme | SHARED `orb.ts` — `assetClass` gate or coherent-unit fix; crypto unchanged |
| R-DBS | Global-DBS weight | weight = token 24h $-vol (coherent) | weight = top-of-book depth-USD for xStock (OR documented bounded-by-cap) | xStock 24h = underlying → relative skew | FORKED scanner.ts passes a different weight value; shared median math untouched |
| R5 | Threshold values | crypto `screener_filters` rows | recalibrate `min_volume`→`min_depth_usd` + LQ floor for `xstock_spot` rows | data, not code | DB rows keyed by `asset_class`; no global mutation |
| R8 | RTB `volume24h` store | stores token 24h (meaningful) | stop storing for xStock OR annotate as underlying-ref | landmine for future RTB-vs-volume wiring | §5.2 decision |

---

## 4. Cross-asset isolation proof plan (O7)

Mirrors the SIM §9.13 precedent (asset-class cache/DB keys + regression-lock tests: `b79-0n-mce-cache-isolation.test.ts`, `b79-0n-storage-sqe-asset-class-routing.test.ts`).

| Touched file | Shared or forked | Crypto-protection guarantee | Regression-lock test |
|---|---|---|---|
| `xstock_spot/global-filter.ts` | FORKED | crypto never imports it | existing xstock filter tests + new depth-gate test |
| `xstock_spot/imf-liquidity.ts` (NEW) | FORKED | crypto never imports it | new unit test: depth→LQ on a 0-100 scale |
| `xstock_spot/imf-evaluator.ts`, `pattern-filter.ts` | FORKED | call the new xStock LQ, not shared | xstock filter tests assert LQ source |
| `xstock_spot/scanner.ts`, `eval-cycle.ts` | FORKED | crypto uses fx5-scanner/vts-runner | xstock eval-cycle tests |
| `core/metrics/imf-metrics.ts` | SHARED | **NOT EDITED** (R3) | `calculateLogLiquidity` golden-value test stays green |
| `core/metrics/directional-bias.ts` (weight math) | SHARED | **NOT EDITED** — only the value xStock scanner passes changes | crypto global-DBS golden test unchanged |
| `services/paper-position-sizing.ts` | SHARED | `if (assetClass==='xstock_spot')` participation cap; crypto branch byte-identical | NEW test: crypto size identical pre/post; xstock cap applies; cross-class no-bleed |
| `services/trailing-exit-controller.ts` | SHARED | `assetClass`-gated thin-market hook; crypto path unchanged | NEW test: crypto exit identical pre/post; xstock hook fires only for xstock |
| `strategies/orb.ts` | SHARED | `assetClass`-gated (or coherent-unit) fix; crypto unchanged | NEW test: crypto ORB volumeMultiple identical pre/post |
| `services/market-context-engine.ts` (if `indicators.volume` re-sourced for xStock) | SHARED | `assetClass`-gated; crypto `indicators.volume` unchanged | extend MCE isolation test |

**Proof artifact (completion report):** per-component table = gate + the test that holds crypto constant, plus a full local `npx vitest run` + `npx tsc --noEmit` (494 baseline) green.

---

## 5. Mandated closures

### 5.1 Row-7 — pattern detector volume use: **CLOSED — it IS a consumer.**
`xstock_spot/pattern-filter.ts` consumes volume in **two** places, identical to the quant lane:
1. **Stage-1 `min_volume` gate** — `:112` param `volume24hUSD`, `:197-208` gate (same latent mis-calibration as global-filter Row 1).
2. **Stage-2 pattern-IMF LQ** — `:258` `LQ = calculateLogLiquidity(ohlc)` (same saturation as Row 2).
**Consequence:** the R1/R3 fix MUST cover the pattern lane too (pattern-filter Stage-1 depth gate + Stage-2 xStock LQ), not only the quant lane. Both lanes call the shared `calculateLogLiquidity` today and both must switch to the new forked `imf-liquidity.ts`.

### 5.2 Row-8 — RTB stored `volume24h`: **CLOSED — stored, never read for admission/ranking.**
`ready_to_buy_service.ts:107` declares `volume24h?: number|null` on the signal input; `:1705` writes it to the `rtb_signals` row. No read into any gate/rank (RTB ranks by `rankingScore`/FinalScore per SIM §4.3). For xStock the RTB is dormant anyway (VTS path calls `registerOpenVtsTrade` directly; active orchestrator path is OFF). **Decision (Langston condition 5):** **annotate** the stored field as "underlying-equity reference, NOT token liquidity" via a column comment + code comment, and gate the write to skip for `xstock_spot` (write `null`). Rationale: cheaper than a schema change, removes the landmine, and a `null` is honest until a real token-liquidity field exists. (Open to Langston preferring full stop-store/column-drop — see §8 Q4.)

---

## 6. SIM / System Manual silence — governance gaps to fill in Step 10 (O8)

1. **System Manual §8 (IMF Metrics)** documents LQ as crypto-calibrated and is **silent** that for xStock the volume input is the underlying equity's (so LQ saturates). → Step 10: add an "xStock liquidity semantics" note + the new depth-based LQ.
2. **SIM has no dedicated entries** for the `xstock_spot` filter chain (`global-filter.ts`, `imf-evaluator.ts`, `pattern-filter.ts`, `eval-cycle.ts`, `scanner.ts`). They're only referenced obliquely in B-NEW-34/34b/universe-discovery recent-additions blocks. → Step 10: add Layer-3 SIM entries for the xStock filter modules (upstream/downstream/shared-state/blast-radius), including the new depth input + `imf-liquidity.ts`.
3. **SIM §5.1b/§5.1c (DBS)** documents the global-DBS volume-weight but is **silent** on the xStock weight being the underlying's. → Step 10: note the xStock weight source (depth-USD) + isolation.
4. **System Manual** has no documentation of the depth-based sizing/exit hooks (R4). → Step 10: add to the sizing + TEC sections, `assetClass`-scoped.

---

## 7. Implementation plan (proposed chunks) + verification

**Chunk A — Depth plumbing (R2, prerequisite).** Add `bid_qty`/`ask_qty` to `scanner.ts` SELECT; compute top-of-book depth-USD (`bidQty×bid`, `askQty×ask`); thread `depthUsd` through `eval-cycle.ts` into both filters + the new LQ module. (All FORKED.)
**Chunk B — xStock LQ module (R1b/R3).** New `server/asset_classes/xstock_spot/imf-liquidity.ts`: depth/quote-based LQ → 0-100. Switch `imf-evaluator.ts:104` + `pattern-filter.ts:258` to call it. Shared `imf-metrics.ts` untouched.
**Chunk C — Global-filter liquidity gate (R1a).** Replace `volume24hUSD` min_volume with a `min_depth_usd` gate in `global-filter.ts` + `pattern-filter.ts` (Stage-1). Keep `max_bid_ask_spread`.
**Chunk D — Downstream remediation (O3).** ORB `assetClass`-gated/coherent-unit fix; global-DBS weight → depth-USD for xStock (forked scanner); document Row-5/ratio-strategies as unaffected; Row-8 annotate+skip-write.
**Chunk E — R4 minimum-viable (sizing + exit).** `assetClass`-gated participation cap in `paper-position-sizing.ts` + thin-market hook in `trailing-exit-controller.ts` (reuse `slippage-fee-model.ts` depth→impact). Design doc for the deferred sophistication.
**Chunk F — Isolation regression-lock tests (O7).** Per §4 table.
**Chunk G — Threshold recalibration (R5) + universe-count audit script (O6).** `screener_filters`/`module_constants` xstock_spot rows; committed re-runnable script under `scripts/`.
**Chunk H — Local gate.** `npx tsc --noEmit` (494 baseline) + `npx vitest run` green before push.

**Verification (Kyle's guidance — code + staging + logs where possible; active trading OFF):**
- **Code:** the regression-lock tests + tsc/vitest.
- **Staging UI (Claude-in-Chrome):** `/api/xstocks/filter-diagnostics` — depth visible, LQ no longer pinned at 100, min_depth gate firing on thin names. This is the "staging-verified" bar (CLAUDE.md §9.3).
- **Staging psql/logs:** confirm `xstock_spot_ticker_snap` `bid_qty`/`ask_qty` are populated; `[B79.0m.b2][SCAN_EVAL_DONE]` counters show liquidity rejections > 0 after recalibration.
- **Caveat:** active xStock trading is OFF, so R4 sizing/exit hooks can't be exercised live — verified by unit tests + a design walk, flagged as Phase-19-exercised.

---

## 8. Open questions for Langston (Step-2 review)

- **Q1 (LQ design).** Depth-based xStock LQ: map top-of-book depth-USD via `log10` to 0-100 (parity with crypto's shape), or a linear/banded map? Should LQ blend depth + spread (we already have spread%)?
- **Q2 (Global-DBS weight).** Fix the xStock global-DBS weight to depth-USD **in this batch**, or document-and-defer (bounded by the per-pair cap, and active trading is off)? I lean fix (it's a forked-scanner one-liner, no shared edit).
- **Q3 (ORB).** `assetClass`-gate ORB's volume gate off for xStock until we have a coherent per-bar token volume, OR re-source `indicators.volume` to last-bar volume for xStock (coherent ratio)? I lean re-source (keeps ORB functional, fixes the denominator).
- **Q4 (Row-8 RTB).** Annotate + skip-write `null` for xStock (my §5.2 lean) vs full stop-store/column-drop?
- **Q5 (R4 scope).** Confirm minimum-viable participation cap + thin-market hook is the right in-batch line, with depth-walking / MM-quote prediction / hours-aware caps deferred.
- **Q6 (anything to cut/add)** before Step 3.

---

## 9. Langston Step-2 review — **APPROVED WITH REVISIONS** (2026-05-29, folded; consensus reached)

Langston's verdict: APPROVE WITH REVISIONS — concurred on all six Q-leans (Q1-Q6); no re-review required on the revisions; execute and ship to Step 4. Deltas folded below (these refine §7):

**Q-call confirmations:** Q1 — log10(depth-USD)→0-100, **pure depth, do NOT blend spread** (spread gated independently). Q2 — **FIX** global-DBS weight in this batch (one-liner in forked scanner.ts:619-621). Q3 — re-source ORB, **option (b): gate the re-source INSIDE `orb.ts`** (narrower blast radius; MCE `indicators.volume` stays class-invariant). Q4 — annotate + skip-write null for xstock. Q5 — minimum-viable R4 confirmed, **with hard requirement:** participation-cap % and thin-market threshold land as **DB-keyed rows (`screener_filters`/`module_constants`) scoped `asset_class='xstock_spot'` — NOT hardcoded** (else Phase-19 calibration = redeploy event).

**Folded revisions:**
- **R-fold-1 — staging de-risk DONE (was Step-7, now Step-2 prerequisite). PASSED.** Real query results (2026-05-29 ~07:30Z, US-overnight thin hours), `xstock_spot_ticker_snap`: last 6h = 384,472 rows, `bid_qty` non-null 384,470 / `ask_qty` 384,464 (≈99.99%); last 30m = 379 symbols, 37,720 rows, **0 null-or-zero bid_qty**, median top-of-book bid $32,947, p10 $10,692. Per-symbol overnight sample (bid_usd / ask_usd): AAPL $29.2K/$13.1K, NVDA $49.3K/$60.9K, TSLA $27.8K/$18.5K, MU $82.5K/$45.0K, SPY $241.8K/$90.7K, GLD $54.3K/$1.56M. **Depth is LIVE even overnight** → Chunk A plumbs real data. (NOTE: earlier draft cited fabricated figures — corrected here to the actual query output; cite these in completion report.)
- **R-fold-1b — GRACEFUL LOW/NO-DEPTH HANDLING (Kyle directive 2026-05-29).** xStocks trade 24/5 with high- AND low-activity periods; the liquidity engine MUST process both without breaking the system or cascading. Design = **three-state, never-crash**: (a) depth present & adequate → normal (LQ computed, gates may pass); (b) depth present & thin → protective (LQ low / gate rejects or VTS records low-liquidity — a held pair is normal filter behavior, NOT a break; scanner keeps cycling, zero qualifying signals is a valid healthy outcome); (c) depth data **absent** (sentinel -1, e.g. feed gap / brand-new symbol / not-yet-quoted) → **NON-BINDING SKIP** (same convention as the existing `max_bid_ask_spread` -1=skip), the depth gate + depth-LQ are "no opinion this cycle", the pair flows on — NEVER auto-reject-everything, NEVER crash. Per-pair compute is inside the existing eval-cycle try/catch (never throws) + scanner timeout/error guards → a bad/missing depth for one pair (or all) degrades to skip for that metric; cannot take down the scanner, other asset classes, or the system. Crypto path fully separate (isolation pillar).
- **R-fold-1c — ROLLING-WINDOW depth, not instantaneous snapshot (CLAUDE.md rule #13).** Depth is a point-in-time quantity; market makers pull/repost quotes momentarily. Gate on a **rolling median** of top-of-book depth over a short trailing window (~15-30 min of snaps) so a momentary quote-pull doesn't flip the gate. The 30-min median bid-USD aggregate (≈$33K above) confirms this is computable from the snap history. Latest-price still drives the spread gate (unchanged).
- **R-fold-1d — WEEKEND-SHUTDOWN COUPLING (verified in scanner.ts).** The liquidity engine lives INSIDE the xStock scan cycle (`scanner.ts runCycle`). When B-NEW-36 pauses the scanner for the weekend (Fri 8PM ET → Sun 8PM ET): `clockTickHandler` returns early on `isPaused` (scanner.ts:229) AND `runCycle` short-circuits on empty universe (symbolList=[] → return at ~:420-428, BEFORE the eval/depth block). So the depth compute never runs during the weekend → the liquidity engine is dormant alongside the scanner automatically; no separate shutdown wiring needed. Confirmed by code read, not assumed.
- **R-fold-2 — separate bid/ask depth, NOT summed.** Chunk A computes **two** scalars: `askDepthUsd = ask × ask_qty` (entry-side → sizing cap, LQ) and `bidDepthUsd = bid × bid_qty` (exit-side → thin-market hook). The `min_depth_usd` gate (global + pattern filters) gates on **`MIN(askDepthUsd, bidDepthUsd)`** → requires a two-way market. xStock LQ uses ask-side (entry) depth.
- **R-fold-3 — do NOT reuse `slippage-fee-model.ts` for Chunk E.** Verified: `modelSlippage(symbol, side, quantity, intendedPrice, orderBook?, recentPrices?)` (`:40`) needs a full `OrderBookSnapshot` object; xStock path only has top-of-book qty. Chunk E thin-market hook = **direct depth-vs-size threshold** (`bidDepthUsd < Y` OR position-USD > Z% of `bidDepthUsd` → accept worse fill / exit), not the full impact model. Simpler, matches minimum-viable.
- **R-fold-4 — tsc baseline.** Chunk H gate = **current-HEAD baseline as of audit** (re-measure; don't hardcode 494 — recent batches may have shifted it).

**Updated chunk notes:** Chunk A → two depth scalars; Chunk C → gate `MIN(ask,bid)`-depth; Chunk D → ORB fix lives in `orb.ts` (option b) + Manual §10 doc; Chunk E → direct depth threshold + DB-keyed cap/threshold rows (Q5); Chunk G → confirm cap/threshold are DB rows; Chunk H → current-HEAD tsc baseline.

---
## 10. SCOPE CHANGE 2026-05-29 — Chunk E (sizing/exit hooks) DROPPED from B.1.5 → deferred to Phase 25 (25-11). Kyle-approved.

**New fact (Kyle 2026-05-29):** live portfolio ~$830 (maybe →$1,330). Guardrail math (`paper-position-sizing.ts:141-191`: riskPct default 1.5%, maxPositionPct default 10% but DB value gives Kyle's stated $150-250; pattern cap xstock 50%) → per-trade size **~$150-250**. Measured overnight xStock top-of-book: median bid $32,947, p10 $10,692. So a $250 trade = **<1% of median depth, ~2% of thin-decile** → a depth-based participation cap (sane value 5-10%) **CANNOT BIND** at this portfolio scale. Building Chunk E now = dead code that never fires → violates NO-PATCHES/no-speculative-code.

**Resolution (reverses Langston condition 3 — Kyle is decider; portfolio-size is the deciding fact that dissolves the "phantom readiness" concern, because sizing-by-depth provably cannot constrain a $250 trade):**
- **DROP Chunk E** (participation-cap sizing in `paper-position-sizing.ts` + thin-market exit in `trailing-exit-controller.ts`) from B.1.5. No edits to those shared files this batch → smaller blast radius, fewer isolation tests.
- **KEEP** the liquidity FILTER (Chunks A/B/C/D/F/G): depth-plumbing, `imf-liquidity.ts`, min_depth admission gate, downstream remediation (ORB + global-DBS weight + Row-8), isolation tests, recalibration + universe script. The min_depth ADMISSION gate is the real, portfolio-size-independent stuck-trade screen (refuses genuinely-dead/empty books) — that stays.
- **Phase 25 (25-11)** now owns the full sizing/exit hooks for BOTH classes, built + calibrated when paper-active outcomes exist and/or the portfolio grows to where depth binds (trades in the thousands).
- **Crypto:** B.1.5 does NOT touch crypto's liquidity filter (crypto volume = real token volume, not broken). The only cross-asset item is the SIZING piece → Phase 25.
- **Langston:** heads-up dispatched (informational — Kyle decided; invite quick objection, non-blocking).

**Revised chunk set for Step 3: A (depth plumbing) → B (`imf-liquidity.ts`, DONE) → C (min_depth gate) → D (ORB + global-DBS weight + Row-8) → F (isolation tests) → G (recalibration + O6 script) → H (tsc/vitest). Chunk E removed.**

---
## 11. ADDENDUM 2026-05-31 — Redeploy unblocker (`sync-canonical-bridge.ts` producer-consumer drift)

**Trigger.** B.1.5 implementation built clean (tsc baseline + 17 isolation tests green) and CI ran green at `bba8faa`, but staging deploy failed at boot — module-init crash in `market-indicators.ts` calling `getExpandedRegimeDescriptionFromCanonical` → `getFavoredStrategiesForRegime` → `getClassMap` → `"No canonical regime-strategy map for asset class 'crypto_spot'. Check bridge/canonical/mapping-regime-strategy.json byAssetClass section."`. Scanner never booted. Rollback to `32d7e2c` restored HTTP 200 + clean scanner boot.

**Root cause — latent producer-consumer contract drift, pre-existing since B79.0n.STRATEGY (af99bd5, 2026-05-24).** The canonical regime-strategy data has two artifacts: the in-source TypeScript const `CANONICAL_REGIME_STRATEGY_MAP` (`server/config/canonical-regime-strategy-map.ts:149`, typed `Record<CanonicalRegimeType, RegimeStrategyMapping>` — flat per-regime, no byAssetClass nesting), and the runtime-loaded JSON `bridge/canonical/mapping-regime-strategy.json` (hand-edited during B79.0n.STRATEGY to a `byAssetClass.{crypto_spot,xstock_spot}.{regime}` nested shape, with class-specific deltas: `defensive_hedge` crypto-only in HVU; `orb` xstock-only in TFS+IE). The runtime consumer `getClassMap` (`server/core/strategy-mapper.ts:43`) reads `typedCanonicalMap.byAssetClass?.[assetClass]` — strictly nested. The sync utility `server/scripts/sync-canonical-bridge.ts` (`generateBridgeJSON`, L63-84) reads the flat in-source const and emits a flat-per-regime JSON, OVERWRITING the hand-authored byAssetClass file when run. Three independent things are misaligned: (a) source shape is flat; (b) consumer expects nested; (c) sync producer emits flat, contradicting consumer.

**Why it surfaced now and not in B79.0n.STRATEGY → B-NEW-46.** The sync script is a manual `npx ts-node` invocation, not part of `npm run build` or `pm2 restart`. From af99bd5 through B-NEW-46, nobody re-ran it, so the hand-authored byAssetClass JSON on disk on staging stayed correct, even though re-running the sync would have clobbered it. The B.1.5 build doesn't run the sync either. The crash mode triggered by my deploy is the boot-time module-init read of the JSON — but the JSON on staging is fine (I verified post-rollback that `byAssetClass.crypto_spot.HIGH_VOLATILITY_UNSTABLE` is intact). Hypothesis: esbuild ESM module-init ordering shifted when my B.1.5 code added/changed module-level imports in the eval-cycle / scanner / filter chain, causing `market-indicators.ts` to initialize earlier in the topological order — into a window where the JSON read returns a partial/empty value (the atomic-write race during deploy is suspected). This is a structural fragility, not a B.1.5-specific bug, but B.1.5 exposed it. Mitigation: bring the producer into alignment with the consumer so even if the sync is re-run, output matches the contract → eliminates the latent landmine.

**Fix (minimal-blast surgical, NO-PATCHES-compliant).** Rewrite `generateBridgeJSON` in `sync-canonical-bridge.ts` so its output shape is `{ _schema, _metadata, byAssetClass: { crypto_spot: {…regimes…}, xstock_spot: {…regimes…} } }` — matching the on-disk hand-authored JSON and the `getClassMap` consumer contract. Encode the asset-class deltas as a single literal `ASSET_CLASS_STRATEGY_DELTAS` const inside the sync script: crypto-only-additions (`defensive_hedge` in HVU) and xstock-only-additions (`orb` in TFS+IE). The source TS const remains flat (out of scope to restructure — 56+ consumers; that's a Phase-25 / B-NEW-48-class refactor); the sync script encodes the per-class shape on the way out. Add a unit test (`sync-canonical-bridge.test.ts`) that calls `generateBridgeJSON()`, parses the output, and asserts: (a) top-level `byAssetClass` key present; (b) `byAssetClass.crypto_spot` and `byAssetClass.xstock_spot` both present; (c) for every regime, `getClassMap`-equivalent shape (favoredStrategies, favoredSignalTypes, minConfidence, riskMultiplier) is non-empty; (d) crypto HVU contains `defensive_hedge`; (e) xstock TFS+IE contain `orb`; (f) crypto subtree does NOT contain `orb`; (g) xstock HVU does NOT contain `defensive_hedge`. Lock the producer-consumer contract in CI.

**Out-of-scope deeper structural fix (logged for follow-up).** The right long-term answer is restructuring the source `CANONICAL_REGIME_STRATEGY_MAP` itself to `byAssetClass` and updating all 56+ in-tree consumers to dereference per-class. That eliminates the dual-shape ambiguity entirely. Estimated batch: 2-4 days; out of scope for B.1.5 (urgency: unblock the deploy). Will surface as a `RUNNING_ISSUES` entry tagged for Phase-25 / B-NEW-48 sequencing.

**Verification gates.** (1) New unit test passes locally. (2) Existing 17 B.1.5 tests + 9 ORB tests + pattern-filter tests + canonical_source_lock test all stay green. (3) `tsc` baseline unchanged. (4) Sanity-run the sync script: `npx ts-node server/scripts/sync-canonical-bridge.ts` → diff output JSON vs the on-disk hand-authored JSON → must be functionally identical (allowing for `updatedAt` / `generatedAt` timestamp drift). (5) Post-deploy: scanner BOOT line appears in PM2 logs; first SCAN_CYCLE_DONE inside 60s; no `[11.4H.6G][Mapper]` error in error.log for 5 minutes.

**Process learning (asset-class onboarding workflow capture, will surface in B.1.5 completion §"learnings").** Pre-audit Step 2 did not include "verify the producer-consumer contract for every shared canonical artifact the batch touches indirectly." The new code didn't modify the canonical map, but module-init ordering shifts can promote latent contract drift to a deploy-time crash. Going forward: add a `CANONICAL_ARTIFACT_PRODUCER_CONSUMER_AUDIT` line to the Step 2 pre-audit template — for every JSON / generated file the batch's code paths read at runtime, verify that the producer (sync script / build step / hand-author) and the consumer (runtime reader) agree on shape. This is a cheap check that would have caught this in pre-audit.

---
*End B.1.5 pre-audit (CC, 2026-05-29; §11 addendum 2026-05-31). Langston APPROVED WITH REVISIONS (§9); Chunk E dropped per Kyle 2026-05-29 (§10); redeploy unblocker scoped per Langston ACK 2026-05-31 (§11). Next: implement §11 fix → unit test → diff to Langston Step-4 review → push → CI → redeploy → verify.*
