# B-XSTOCK-CALIB Sub-Batch — xStock Liquidity/Volume Data-Integrity + Cross-Asset Isolation

**Provisional ID:** B.1.5 (data-integrity GATE — sequenced BEFORE B.2 IMF calibration)
**Umbrella:** B-XSTOCK-CALIB (`1-system-manual/XSTOCK_CALIBRATION_PLAN.md`)
**Status:** v3 — Langston Step 1 re-review = **CLEAN-CONDITIONAL**, all 6 conditions folded (see below). Awaiting Kyle sign-off BEFORE implementation.

**Langston's 6 conditions (folded into v3):** (1) O0 gets a concrete empirical method (live `book`-channel capture + tiny live-order ping + parallel Kraken support ticket); (2) R3 = a SEPARATE `xstock_spot/imf-liquidity.ts` module, NOT a branch in shared `imf-metrics.ts`; (3) R4 = minimum-viable depth-cap-on-sizing + thin-market exit hook IN-batch, full sophistication deferred; (4) §1 row 7 (pattern detector volume use) closure mandated in pre-audit before Step 2 sign-off; (5) §1 row 8 (RTB stored `volume24h`) — stop storing or annotate as underlying-reference; (6) O6 script committed under `scripts/` as a reusable audit asset. Langston independently confirmed volume=underlying (3 lines: magnitude, bare-symbol convention, documented SPV toggle) and leans our `addOrder` path is a CLOB whose depth is MM-willingness-bounded (behaves RFQ-like off-hours/long-tail) — so depth IS the right gate but is a live moving target; no static precomputed liquidity score is safe.
**Authorized by:** Kyle 2026-05-28 (DM 10:47Z to scope; subsequent directives to confirm root-cause, map all downstream liquidity consumers, run the trade report, prove cross-asset isolation, and consult SIM + System Manual).

---

## §0 — What we now know (verified: code reads + live data + raw Kraken feed + 4-LLM cross-check)

**Root cause (CONFIRMED, multiple independent sources).** The 24h-volume figure our system uses for xStock liquidity is the **underlying equity's** volume, not the tradeable token's. The Kraken `ws-equities` ticker `volume` field for `TSLA/USD` reads ~13.2M climbing toward `prev_day_volume` ~44.8M — which is real Tesla *share* volume. Our scanner does `volume24hUSD = volume_24h × price`, yielding billions (underlying turnover), not token liquidity. Confirmed by: raw-WS capture (`_kraken_probe.cjs`), live archive queries, and 4 external LLMs (Opus 4.8 located the documented Kraken "underlying-equity vs SPV-token" representation toggle on the Own-Trades channel — the documented mechanism).

**Prices are CORRECT (no dislocation).** xStocks are 1:1 with the underlying and priced to it. MU $927 is real (Micron ~$905, $1T mcap 2026-05-28). → DROP the price-dislocation objective; spot-confirm only. **`max_price` stays DISABLED** (Kyle directive — don't cap legitimately high-priced names, same logic as BTC).

**True tradeable liquidity is small (authoritative).** CoinGecko `xstocks-ecosystem` cross-venue 24h volume: GOOGLx ~$23M, AAPLx ~$11.3M, TSLAx ~$10.3M, NVDAx ~$8.75M … GLDx ~$306K. Kraken's own consumer-page slice is smaller (TSLAx ~$926K page figure). These three numbers (feed-field = underlying; CoinGecko = cross-venue token; Kraken page = single-venue token) are **different denominators** — never compare as equal (4-LLM consensus).

**Multi-venue + execution model (Kyle's key question).** xStocks trade across Kraken + Solana/Ethereum DEXs (+ formerly Bybit, now delisted — Opus catch). Our code's only order path is `addOrder → makePrivateRequest('AddOrder')`; xStock pairs are NOT on Kraken's main REST (`TSLAxUSD` → "Unknown asset pair") — they live on the separate equities system. **OPEN, UNRESOLVED divergence among the 4 LLMs:** is our execution a visible-depth order book (Gemini, prior-CC: thin book = stuck risk) or an RFQ/atomic-swap where market-makers quote size on demand (Opus: depth doesn't bind)? This decides whether thin depth = stuck. **MUST be settled empirically** (read the live `book` channel on ws-equities + confirm the order venue) before liquidity-gate design is finalized.

**Convergent actionable conclusion (all 4 LLMs + our analysis):** stop using ANY 24h-volume field for liquidity; gate on **live order-book depth / executable quote per symbol at trade time**. We already receive top-of-book `bid_qty`/`ask_qty` (TSLA ~40/120 tokens ≈ $18K-$53K) but no filter reads it today.

---

## §1 — Full blast radius: every consumer of liquidity/volume (agent-mapped + spot-verified; pre-audit re-verifies each at code level)

| # | Component | Consumes vol/liq? | Source today | Shared or forked | Impact of bad volume |
|---|---|---|---|---|---|
| 1 | **Global filter** (`xstock_spot/global-filter.ts`) | YES — `min_volume` gate | `volume24hUSD` (underlying×price) | FORKED (xstock module) | Liquidity pre-screen wrong |
| 2 | **IMF evaluator / LQ factor** (`imf-evaluator.ts` → `imf-metrics.ts:calculateLogLiquidity`) | YES — LQ from per-bar OHLC `volume` | OHLC bar volume (also inflated) | **LQ fn SHARED w/ crypto** | Liquidity factor wrong at IMF stage |
| 3 | **MCE** (`market-context-engine.ts`) | YES — `volume24h` param → `indicators.volume` + archive | scanner volume24h | SHARED (per-class cache key `${symbol}:${assetClass}`) | Feeds indicators + DBS |
| 4 | **Directional Bias Store** (global DBS) | YES — global DBS = **volume-weighted median** | MCE `updatePair(…, volume)` | Per-class INSTANCE (`xstockDirectionalBiasStore`) | Distorts market-wide bias → regime classifier |
| 5 | **Volume-Regime modulator (B68.2)** (`volume-regime.ts`) | YES — per-bar OHLC volume → multiplicative confidence factor [0.92-1.05] | ohlcCache volume | SHARED (config DB-keyed by class) | Skews EVERY signal's confidence |
| 6 | **Strategies** (ORB + several: volume gates / confidence bonuses) | YES — `indicators.volume` | MCE indicators | SHARED detect fns (thresholds DB-keyed) | Volume gates/bonuses mis-fire |
| 7 | **Pattern detector / pattern-filter** | TBD — re-verify volume use in pre-audit | — | FORKED (xstock pattern-filter.ts) | TBD |
| 8 | **RTB scoring** (`ready_to_buy_service.ts`) | STORES `volume24h` only (archival; not used for admission) | signal input | SHARED | None today (but stored value is wrong) |
| 9 | **SQE** (`signal_quality_evaluator.ts`) | NO (FinalScore + RegimeWeight only) | — | SHARED (thresholds cache-keyed `${mode}:${assetClass}`) | None |
| 10 | **Position sizing** (`dynamic-sizing-engine.ts`, `paper-position-sizing.ts`) | NO — risk-based only | — | SHARED | **GAP**: no liquidity-aware sizing |
| 11 | **Exits / TEC** (`trailing-exit-controller.ts`) | NO — price-based only | — | SHARED + per-class config | **GAP**: no thin-market exit |
| 12 | **Cost model / friction** (`cost-model.ts`, friction) | NO (spread only; slippage model reads depth but diagnostic-only) | — | per-class friction modules | None today |

**Headline:** bad volume is NOT just a filter problem — it propagates into the IMF liquidity factor, the market-wide directional bias (volume-weighted → regime classification), the per-signal confidence multiplier, and strategy volume-gates. Sizing + exits use NO liquidity at all = the gap behind the stuck-trade risk.

**Row-7 mandate (Langston condition 4):** the pattern detector / `pattern-filter.ts` volume usage is "TBD" — pre-audit MUST close it with a code-level read BEFORE Step 2 sign-off; if it reads volume and we don't fix it, we miss a consumer.
**Row-8 mandate (Langston condition 5):** RTB stores `volume24h` (archival, unused) — it's a data-quality landmine for anyone later wiring RTB scoring against it. Either STOP storing it or schema-annotate it as "underlying-equity reference, NOT token liquidity." Lean stop-storing.

---

## §2 — Required changes vs the crypto build (clearly documented + surfaced)

The filter *structure* is identical crypto/xStock and does NOT change. What changes for xStock (because its volume source is different and its liquidity is thin/multi-venue):

- **R1 — Re-source the liquidity input at the two filter stages.** Stop using the ws-equities `volume` field for `volume24hUSD` (global filter) and stop trusting OHLC-bar volume for the IMF LQ factor on xStock. Replace with a verified token-liquidity measure (order-book depth and/or an authoritative Kraken-specific token volume — pending §0 execution-model resolution).
- **R2 — New plumbing: order-book depth.** Thread `bid_qty`/`ask_qty` (and, if the venue is a real CLOB, the `book` ladder) from the ticker snap into the scanner enrichment → global filter and/or IMF. This input does not exist in any filter today.
- **R3 — xStock-specific LQ in a SEPARATE module (Langston condition 2).** Crypto's `calculateLogLiquidity` = `log10(avg USD volume)` assumes a deep market; xStock LQ will be depth/quote-based (a different math object). Implement as a NEW `server/asset_classes/xstock_spot/imf-liquidity.ts` module — NOT a branch in shared `imf-metrics.ts`. Rationale: trivially satisfies §3 rule #1 (no edits to shared compute), avoids the shared file accreting `if (assetClass===...)` tangles, and follows the existing fork precedent (`global-filter.ts`, `pattern-filter.ts`).
- **R4 — Liquidity-aware sizing + exit, minimum-viable IN-batch (Langston condition 3).** Design now + ship minimum-viable: (a) participation-rate cap on sizing (size ≤ X% of current `ask_qty` at trade time), (b) thin-market exit hook (if `bid_qty` drops below Y at an evaluation tick, accept a worse fill rather than wait). Deferring R4 entirely creates phantom-readiness (all gates green but active trading still can't safely flip — the stuck-trade risk is exactly why xStock active trading is off). DEFER to a later batch: depth-walking, MM-quote prediction, hours-aware models, regime-conditional caps. R2 (depth plumbing) is the prerequisite; once it ships, these hooks are cheap incremental adds in the same batch.
- **R5 — Recalibrate thresholds AFTER the input is real.** `min_volume` (currently $1M, meaningless vs real ~$100K-$10M) and any new depth thresholds, set in `screener_filters`/`module_constants` keyed by `asset_class`. Threshold tuning is data, not code.

Each R-item's exact crypto-vs-xStock delta will be enumerated in a **"crypto-vs-xStock difference register"** table in the Step 2 pre-audit (one row per touched component: what crypto does, what xStock will do, why, and the isolation mechanism).

---

## §3 — CROSS-ASSET ISOLATION (mandatory pillar — Kyle directive 2026-05-28)

**Requirement:** every change must be PROVEN not to bleed between xStock and crypto in either direction, for every component in §1. This follows the system's existing, SIM-documented isolation pattern (SIM §9.13 Asset-Class Registry; MCE cache key `${symbol}:${assetClass}`; SQE thresholds `${mode}:${assetClass}`), which already ships **regression-lock tests** (`b79-0n-mce-cache-isolation.test.ts`, `b79-0n-storage-sqe-asset-class-routing.test.ts`).

**Rules:**
1. **No edits to shared compute functions that change crypto's result.** Any liquidity/volume logic change in shared code (`imf-metrics.ts`, `market-context-engine.ts`, `volume-regime.ts`, strategy detect fns, sizing, exits) MUST be gated on `assetClass` (or moved to a per-class module), leaving the crypto path byte-identical.
2. **All new thresholds/knobs keyed by `asset_class`** in `screener_filters` / `module_constants` — no global mutation.
3. **Regression-lock tests are MANDATORY**, mirroring the existing isolation tests: for each touched shared component, a test that exercises the crypto path before/after and asserts identical output, plus a test that an xStock change does not alter crypto (and vice versa).
4. **Proof artifact:** the completion report must include an "isolation proof" section enumerating, per component, the asset_class gate + the regression-lock test that protects crypto.

---

## §4 — Objectives + verification criteria

- **O0 — Resolve the execution model** (CLOB vs RFQ). **Concrete method (Langston condition 1):** (a) subscribe to the `book` channel on ws-equities for TSLAx + 2-3 long-tail names — multi-level ladder w/ quantities ⇒ CLOB; best-bid/ask only ⇒ RFQ; (b) send a tiny live test `addOrder` (smallest valid qty) in TradFi hours AND off-hours — observe fill latency, partial-vs-all-or-nothing, and whether fill price matches the pre-trade quote (RFQ tell) or walks book levels (CLOB tell); (c) post-fill, check the fee invoice (maker/taker billing ⇒ CLOB; single quoted spread ⇒ RFQ); (d) file a parallel Kraken support ticket as paper trail — but do NOT gate the scope on support latency ((a)+(b) settle it in ~1 day). *Verify:* written determination of what bounds our fills, with evidence. Gates O5 design.
  - **O0 PRELIMINARY FINDING (2026-05-28, read-only `book`-channel capture, no order placed):** the ws-equities `book` channel returns a FULL 20-level depth ladder (price+qty) for both TSLA/USD AND thin GLD/USD → **execution venue is a CLOB, not RFQ.** Depth IS the binding gate (live moving target). MM depth is real even on thin names (TSLA 787@-few-cents; GLD 1,100-3,300/level). Resolves the 4-LLM CLOB-vs-RFQ divergence in favor of CLOB. REMAINING (deferred to pre-active-trading gate, out of this batch): a tiny live `addOrder` to confirm fill behavior + confirm our `addOrder` (main-API) path actually reaches this equities CLOB (xStock pairs absent from main REST → wiring unverified). Live order needs Kyle; NOT required to complete this data-integrity batch.
- **O1 — Re-source liquidity inputs** (R1) so both filter stages read a verified token-liquidity measure. *Verify:* replay/live cycle shows liquidity values now match the authoritative scale (CoinGecko/Kraken token, not billions).
- **O2 — Order-book depth plumbing** (R2). *Verify:* depth visible in Filter Diagnostics; gate fires on thin depth.
- **O3 — Full blast-radius remediation:** for each §1 consumer that reads bad volume, either fix the input or document why unaffected. *Verify:* per-component sign-off table.
- **O4 — Liquidity-aware sizing + exit design** (R4). *Verify:* design doc + decision (implement-now vs phase).
- **O5 — Threshold recalibration** (R5) once inputs are real. *Verify:* before/after `screener_filters`; intended universe admitted, thin/illiquid rejected.
- **O6 — Tradeable-universe count** from corrected liquidity + multi-week consistency. **Delivered as a committed, re-runnable audit asset under `scripts/` (Langston condition 6)** — not a one-off. *Verify:* floors→surviving-count table + consistency classification, reproducible from a documented invocation.
- **O7 — CROSS-ASSET ISOLATION PROOF** (§3). *Verify:* regression-lock tests green; crypto path proven unchanged; isolation table in completion report.
- **O8 — Governance:** SIM + System Manual updated for every changed component (per §10 workflow).

---

## §5 — Out of scope
- IMF family threshold calibration (B.2, after this gate). Per-strategy gates (B.3). Friction/spread (B.4/B.5).
- Building a standing live cross-venue/DEX liquidity feed (Phase C/E). Active-trading flip.

## §6 — Risks
- **R-exec:** if O0 finds RFQ (depth doesn't bind), the whole liquidity-gate premise shifts — escalate to Kyle before O1/O5.
- **R-bleed:** shared-function edits are the bleed risk; mitigated by §3 rules + regression-lock tests.
- **R-data:** authoritative Kraken-specific token volume may not be exposed; fall back to order-book depth as the primary signal.
- **R-seq:** GATE delays B.2; accepted (tuning against bad data is worse).

## §7 — Decisions / open questions for Langston
- Q1: Confirm GATE-before-B.2 still holds given expanded scope.
- Q2: O0 method — is the live `book` channel sufficient to settle CLOB-vs-RFQ, or do we need Kraken support confirmation before designing?
- Q3: R3 — xStock-specific LQ as a per-class branch in `imf-metrics.ts` vs a separate `xstock_spot` liquidity module? (Isolation favors separate module.)
- Q4: R4 liquidity-aware sizing/exit — implement in-batch or design-and-defer (given active xStock trading is off)?
- Q5: Independent investigation — your own read of the volume/liquidity question + the execution model (see dispatch).
- Q6: Anything to cut/add before Step 2 pre-audit.

## §8 — SIM + System Manual consultation (this scope) + MANDATE for Step 2 pre-audit
- **Consulted for this scope:** SIM §3.1-3.4 (scanning/IMF), §4.1-4.2 (orchestrator/SQE), §9.13 (asset-class registry + isolation precedent), §5.1 (regime); System Manual Ch3 (scanning/filtering), §8 (IMF metrics). Confirmed: filters forked per-class; IMF metric fns + MCE + volume-regime + strategies shared (asset_class-parameterized); DBS per-class instance; isolation enforced via asset_class cache/DB keys + regression-lock tests.
- **MANDATE (Step 2 pre-audit):** per-component deep SIM + System Manual read for every §1 consumer (upstream/downstream/shared-state/blast-radius), producing the crypto-vs-xStock difference register (§2) + the isolation proof plan (§3). Any SIM/Manual silence on a touched component = governance gap to flag.

---
*End B.1.5 scope v2 — awaiting Langston re-review + Kyle sign-off.*
