# B-XSTOCK-CORRELATION-COLLECT — SCOPE r1 (2026-11-05) — Step 1, for Langston

change-class: architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row 105, roadmap `25-9` · **Reviewer:** Langston
**Directive:** Kyle, 2026-11-04, `KD-14` (`1-system-manual/pm/DECISIONS.md`): *"I'm fine with number 4"* — start collecting xStock pair-correlation data before live, **collection only**, after my stage-00 items (order confirmed `KD-27`). Row 105's own note: *"early (Langston F5): xStock per-pair correlation data accumulates from here."* Roadmap `25-9`: *"Per-pair correlation modifier needs paper-active WR data to set the right modifier coefficient."*

## 1. What exists today, measured (staging, 2026-11-05 ~00:10Z)
- **The xStock correlation is switched OFF.** `module_constants` `pair_correlation` / `xstock_spot`: `b68_3_compute_correlation_enabled = false`, `b68_3_btc_reference_symbol = SPY/USD` (crypto: `true`, `XXBTZUSD`). With the flag off, `computePairCorrelation` returns at once with factor 1.0 and label `COMPUTE_DISABLED` (`server/core/metrics/pair-correlation.ts:129-138`); no correlation is computed.
- **Turning the flag on would change trading, not just collect:** both call sites multiply the factor into confidence — `signal-orchestrator.ts:1717` `modulatedConfChain *= result.factor` (the active paper path) and `vts-runner.ts:2950` `_modulatedConfChain *= result.factor` (VTS). Factor range 0.95-1.05, boost only.
- **Nothing records xStock correlation anywhere.** `regime_factor_alternates`, all history: `b68_3_pair_correlation` has 5,415 `crypto_spot` rows (2026-08-06 → 2026-11-04) and **zero** `xstock_spot`. Control: the same query returns xStock rows for seven other factors.
- **The xStock VTS path records no factors at all.** `server/asset_classes/xstock_spot/eval-cycle.ts` never calls the ablation emitter (`emitAblationRecord`, `factor-ablation-emitter.ts:162`); `XSTOCK_CALIBRATION_PLAN.md` E.2 names exactly this gap. The 160 xStock rows that do exist for other factors all predate 2026-10-06 and none since, against 4,981 xStock VTS trades in October — they are NOT this path's output. **HYPOTHESIS, not established:** they came through the crypto VTS runner before `B-PRICE-FEED-TRUTH` I2 (`40da5121b`, 2026-10-07) stopped xStock tickers entering it; Step 2 reads that.
- **The intended xStock reference is a SECTOR fund, not SPY** (`XSTOCK_CALIBRATION_PLAN.md:144-154`: `b68_3_pair_correlation` "repurposed — sector ETF per symbol", **gated on `B-PHASE-E-PRE-1`**, an offline sector-ETF price feed estimated at 5-7 days, never built). `SPY/USD` IS in the xStock universe (`shared/asset-classes.ts:484`, scanned at `eval-cycle.ts:152`), so a correlation to SPY can be computed today — it is the plan's own E.1 candidate "beta-to-SPY rolling".

## 2. Objectives
| # | objective | verified by |
|---|---|---|
| **OBJ-1** | **A record-only mode for the correlation factor, per asset class.** A new per-class constant (e.g. `b68_3_apply_factor`) separates computing from applying: when compute is on and apply is off, the correlation is computed and returned with its would-be factor, but the factor applied to confidence is 1.0. Crypto keeps compute on, apply on (unchanged). xStock: compute on, apply off. The constant is DB-governed with no hard-coded fallback (a missing value fails loudly, `CLAUDE.md` §11). | Unit: xStock config → correlation computed, applied factor exactly 1.0, would-be factor recorded; crypto config → behaviour byte-identical to today. Mutation: apply forced on for xStock fails the test. |
| **OBJ-2** | **The xStock VTS path records the correlation per trade.** `eval-cycle.ts` computes the b68_3 result for each xStock VTS trade and emits it through the existing ablation emitter as `source_type = vts_trade`, `asset_class = xstock_spot`, so it lands beside the crypto rows in `regime_factor_alternates`. Scope is the correlation factor ONLY; wiring the other xStock factors (E.2 in full) stays with Phase 25's calibration rows. | Staging: `b68_3_pair_correlation` / `xstock_spot` rows accumulate at roughly the xStock VTS trade rate (about 160 a day in October); each carries the correlation value; a positive control (the crypto rows, same query) is still counted. |
| **OBJ-3** | **Reference = `SPY/USD` now.** The configured reference stays SPY (market beta), the one reference available without a new feed. The sector-fund reference stays gated on `B-PHASE-E-PRE-1`, unchanged; when that ships, the reference constant changes and the record carries which reference produced it. | Step 2 confirms SPY/USD's 60-minute OHLC is in the cache at the depth the factor needs (30 bars) during and outside US hours; the record carries the reference symbol. |
| **OBJ-4** | **Collection only, proven.** No xStock trading decision changes: the confidence chain for xStock signals is identical before and after. | Staging: the `[B68.3][correlation]` lines for xStock show `applied=1.0000`; a sample of xStock signals' final confidence equals the pre-deploy computation; VTS and paper xStock trade counts per hour unchanged beyond normal variation over 24 h. |
| **OBJ-5** | Governance: System Manual (the B68.3 modulator, per-class compute vs apply), SIM (the new xStock write into `regime_factor_alternates`), `XSTOCK_CALIBRATION_PLAN.md` (25-9 started; E.2 partially done, correlation only), ledger. | Step 10. |

## 3. Provenance (step 1.b)
**Corpora searched:** `BATCH_CATALOG.md` (B68.3 row `:238`), `XSTOCK_CALIBRATION_PLAN.md`, `RUNNING_ISSUES.md`, `git log -S` (not path-limited).
**TIER 1 — `server/core/metrics/pair-correlation.ts`** (behaviour changes: compute vs apply). B68.3 (`98751a6c`, 2026-05-02), its header quoted: *"Adds per-pair Spearman rank correlation to BTC as an orthogonal signal in the confidence chain. Distinguishes idiosyncratic alt moves from BTC-correlated drift."* The xStock off-switch: `B79.0n.CONFIDENCE-CHAIN` (`8293ed5d2`, 2026-05-25), the result field's own comment quoted: *"true when `config.computeCorrelationEnabled` was false and the function short-circuited to factor=1.0. Used for asset classes where the reference-symbol correlation pipeline is not yet calibrated (e.g., xstock_spot vs SPY pending follow-up batch)."* **Disposition (2), relevant but needs updating:** that "follow-up batch" is this one; it records without applying, which is what "not yet calibrated" requires.
**TIER 1 — `server/asset_classes/xstock_spot/eval-cycle.ts`** (gains the emit). The xStock VTS wiring: `914a25e05` / `404a76428` / `4c60d259e` (B79.0m.b, 2026-05-11), *"mirror crypto VTS path in xstock eval-cycle"* — it mirrored the trade path but not the ablation emit (`XSTOCK_CALIBRATION_PLAN.md` E.2: *"BATCH_82 fixed asset-class threading on crypto call sites but never wired the xStock pipeline through `emitAblationRecord`"*). **Disposition (3), disconnected and should be reconnected** — for this one factor.
**TIER 2:** `factor-ablation-emitter.ts` (used as is) · `market-context-engine.ts` per-class config resolution (gains one key) · `signal-orchestrator.ts:1695-1730` and `vts-runner.ts:2930-2960` (apply site honours the new constant).
`bridge/canonical/`: consulted for pair correlation — no coverage (B68.3 postdates it).

## 4. Not in this batch
- **The sector-fund reference** — `B-PHASE-E-PRE-1`, unbuilt; unchanged.
- **The other xStock factors' records (E.2 in full) and any calibration of the factor** — Phase 25 rows.
- **Why the 160 pre-October xStock factor rows existed** — read at Step 2 only to confirm they are not a path this batch must also cover.

## 5. Risks
- A record-only mode that leaks: guarded by OBJ-1's mutation test and OBJ-4's before/after check.
- Extra work per xStock signal: one Spearman over 30 bars plus a cache read; measured at Step 2.
- SPY's 60-minute bars outside US hours may be thin; OBJ-3's Step-2 check decides whether the record notes "reference unavailable" for those hours, as the crypto path already flags `btcReferenceAvailable`.

## 6. Questions for Langston
1. Correlation to SPY now, or wait for the sector-fund feed? I recommend SPY now: Kyle's intent is data that exists when calibration needs it, and the record names its reference.
2. Correlation only, or the full E.2 wiring of every xStock factor while the emit is being added? I scoped correlation only, per "collection only" of this one item.
