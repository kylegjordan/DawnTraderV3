# B-XSTOCK-CORRELATION-COLLECT — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2 r2, 2026-11-05)

change-class: architecture · Scope r3 at `27988c8c0`, Langston PROCEED (Discord `1567749887875874878`, with C-2..C-5). Read at `58dc939c8`; staging runs `93cead7f2`. Board card `PVTI_lAHODmulEM4BfQP4zhGINY4`.

> **r1 → r2 (Langston CHANGES at `8636040`, Discord `1567776471974551654`):** C-A P-5 now names the `strategy` and the real decision it stamps (a null strategy can never be replayed); C-B the replay-STATUS query (`:532`) is left alone, the filter goes on `computeFactorCalibration` only; C-C the key's path is named; C-D `confidence_with_factor` gets an honest meaning in record-only mode; C-E the crypto half of positional pairing gets a home (P-11, folded as a measurement). A-2's 60-minute column is marked not decision-grade (his independent read: 15m reproduced — 39 / 464 / median 109 vs mine 38 / 465 / 112; 60m materially lower, 10 / 174 / 24). `registerOpenVtsTrade` re-pinned to `:1343` at `8636040`.

## PREVIOUSLY STATED vs NOW (read this first)
- **PREVIOUSLY STATED:** the xStock correlation uses **60-minute** bars (scope §1, OBJ-0; C-4 "type-constrained to the 60-minute interval"; C-5 "the per-symbol 60-minute bucket count"). **NOW: 15-minute, from the same xStock cache path the scanner uses.** **REASON:** the xStock scanner has fetched **15-minute** bars since B.4 (`scanner.ts:595`, `getOHLCDataBatch(symbolList, 15)`, 2026-06-04), so the pair series `eval-cycle.ts` holds is 15-minute; a 60-minute reference against it would compare different intervals. **The reason is entailment, not coverage** (Langston): the pair series IS 15-minute, so a 60-minute reference compares different intervals whatever coverage says. A-2's numbers are corroboration only.
- **PREVIOUSLY STATED (implicitly, by the scope's verification):** a computed row means a real correlation. **NOW: only after matching bars by timestamp.** **REASON:** `computePairCorrelation` pairs the two series by POSITION (`pair-correlation.ts:183-197`, `N` at `:188`, loop `:191`), and for xStocks the positions do not line up in time (A-2).
- **PREVIOUSLY STATED:** `xstockOhlcCache.getOHLCData` returns `OHLCData[]` (C-4). **NOW:** it returns `{ bars, cacheHit }` (`xstock-ohlc-cache.ts:216-232`) — Langston's correction, adopted.

## A. AUDIT

**Sources read:** (1) code at the ref — `pair-correlation.ts` (whole), `signal-orchestrator.ts:1688-1735`, `vts-runner.ts:2930-2960`, `eval-cycle.ts` (entry `:319-395`, trade `:1167-1338`), `scanner.ts:580-640`, `xstock-ohlc-cache.ts:200-420/693/777`, `market-context-engine.ts:795-872/1201`, `factor-ablation-emitter.ts:150-200`, `factor-replay-core.ts:165-249`, `replay-ablation.ts:262-370`, `drift-dashboard-aggregator.ts:505-560/1145-1185`, `routes.ts:8141-8160/9005-9042`; (2) staging database + the nightly replay log; (3) System Impact Map (`:454` crypto bar cache consumers, `:1337-1352` per-class modulator seed, `:1439-1465` xStock bar cache, `:1917-1940` replay + retention); (4) System Manual (`:11868-11998` the confidence chain and B68.3, `:12708` xStock bar intervals); (5) ledger — `BATCH_CATALOG`, `RUNNING_ISSUES`, completion reports, by file and symbol; (6) `bridge/canonical/` — no coverage of pair correlation (B68.3 postdates it), as recorded at Step 1.

**A-1 — Bar interval.** xStock pair series: 15-minute, up to 240 bars (`MAX_BARS_15M`), from `xstockOhlcCache.getOHLCDataBatch(…, 15)` (snapshot `xstock_spot_ohlc_15m_snapshot` + a 6-hour live overlay, merged by timestamp, `:340-350`, `:777-788`). Crypto pair and reference: Kraken 60-minute (`vts-runner.ts:1439`, `:2940`; `signal-orchestrator.ts:1701`). The xStock per-class constants already exist (`b68_3_lookback_bars = 30`, `b68_3_min_samples = 30`, per Langston).

**A-2 — Positional pairing does not line up xStock bars in time.** Measured on staging 2026-11-05 04:01-04:02Z, with the app's own code run read-only (universe loaded by `xstockUniverseService.initializeFromDB()`, 473 symbols; bars built by the cache's own snapshot read + live overlay + merge, no write-back). Population: the 472 non-SPY symbols. **Single-moment snapshot, overnight US time — not decision-grade; a US-hours repeat is plan item P-9.**

| | 15-minute | 60-minute |
|---|---|---|
| served ≥ 30 bars | 469 (99.4%) | 469 (99.4%) |
| last 30 bars line up with SPY's last 30, all 30 positions same time | **38 (8.1%)** | **60 (12.8%)** |
| median positions out of 30 that line up | 0 | 1 |
| **≥ 30 bars sharing a timestamp with SPY, whole served series** | **465 (98.5%)**, median 112 | 309 (65.5%), median 34 — **NOT decision-grade** |
| closes non-finite or ≤ 0 in the last 30 | 0 | 0 |
| median span of the last 30 bars | 10.8 h (SPY 7.3 h) | 118 h (SPY 29 h) |

**Independent reproduction (Langston, raw `xstock_spot_ohlc_15m_snapshot`, 2,590,305 rows / 495 symbols, snapshot only, no live overlay):** 15m — 39 of 494 fully aligned, median 0, 464 with ≥ 30 shared, median 109. The 15m leg stands on two instruments that fail differently. His 60m read is materially lower (10 / 174 / median 24) and the 60m snapshot is no longer written back by the scanner, so **the 60m column claims only the ordering (15m > 60m), which both instruments agree on.**

⇒ With positional pairing, more than 90% of xStock rows would correlate returns from different hours and still report `sample_count = 29`, `cold_start = false` — a confident wrong number that passes every field in the scope's pre-registered check. **Matching by timestamp first** gives 465 of 472 symbols a full 30-bar window at 15 minutes. Crypto is not measured here and is not changed by the code of this batch; **but the crypto path APPLIES the factor today with the same positional pairing, so its alignment is measured in this batch (P-11)** — see C-E.

**A-3 — Every reader and mutator of `regime_factor_alternates`** (C-3; repo-wide, tests excluded; Langston's census plus two additions marked ★):
| reader / mutator | runs | what it does with a record-only xStock row | disposition |
|---|---|---|---|
| `factor-ablation-emitter.ts:259` | every emit | the only writer | used as is |
| `server/scripts/replay-ablation.ts` | **nightly, root cron 04:00Z** (last run: 1,438 VTS rows replayed, 258 deleted) | matches the row to its closed VTS trade and stores the outcome — **this is what makes the record usable for calibration**; also the 90-day retention delete (`:360-367`) | **kept**; match key fixed (A-4) |
| `drift-dashboard-aggregator.ts:532`, inside `computeAblationComparison(window)` (`:489`, no class parameter) | Analytics page | counts replay STATUS (pending / replayed / unreplayable), computes no lift, and its own comment says inclusive forensic rows are expected | **unchanged** — it is the one view that shows whether the new rows are being replayed. It already pools classes for the 160 xStock rows of seven other factors (its discriminator would be `asset_class`, which it has never had); pre-existing, **proposed to Kyle as its own item via PM Claude, no work in this batch** |
| `drift-dashboard-aggregator.ts:1159` (`computeFactorCalibration`) | ★ **two routes**: `routes.ts:9036` (Analytics) and `routes.ts:8147` `/api/xstocks/factor-calibration` with `asset_class = 'xstock_spot'` | the xStock route would show b68_3 with confidence-with = confidence-without, i.e. a factor with "no effect" | same filter |
| `routes.ts:9005` | — | a comment; the route reads through the aggregator | none |
| `scripts/b-new-33-factor-backtest.ts` (UPDATE `:158`; reads `:76/:198/:219`) | manual (`npm run b-new-33:factor-backtest`) | uses the same `factor-replay-core` matcher, so A-4's fix reaches it | none beyond A-4 |
| `scripts/b-new-33-parity-check.ts:90/:127`, `b-new-36-cohort-diagnostic.ts:108/:132`, `b-new-37-inversion-forensics.ts:122` | manual, historical one-offs | read-only | none; Step 10 notes the filter for any re-run |
| ★ `scripts/b79-0f-collision-audit.sql:62` | manual one-off | read-only | none |
| `index.ts:1142`, `analytics.tsx:1815`, `b79-0f-collision-backfill.sql:20` | — | comments | none |
| `B82_asset_class_indexes.sql` + rollback | — | index DDL only | struck |

**A-4 — The replay matches a row to a trade by symbol and strategy, not asset class.** `factor-replay-core.ts:230` keys on `` `${symbol}|${strategy}` ``. The trade source (`vts_open_trades WHERE closed = true`, `:165-168`) holds both classes (14 days: crypto 4,018, xStock 7,895) and carries `asset_class`. The five xStock/crypto ticker collisions (CVX, DASH, MET, OPEN, SUI — `xstock-ohlc-cache.ts` header) can therefore attach a crypto trade's outcome to an xStock row, and the reverse. Today almost no xStock rows exist, so it has not mattered; this batch creates them. **Fix on find (rule 23): fold** — the key gains the asset class.

**A-5 — `factor_applied` absence is the applied population** (C-2). No existing row carries the key. Decision: **JSONB key at `alternate_decision->'metadata'->>'factor_applied'`** (built in `buildB68_3Alternate`, `pair-correlation.ts:262-279`) — not a column and not on `real_decision` — and every reader filter is written `alternate_decision->'metadata'->>'factor_applied' IS DISTINCT FROM 'false'`. Not a new column, because a column would need a migration and a backfill for a field one factor uses.

**A-6 — The per-class config loader already refuses a missing key** (`market-context-engine.ts:816-830` collects missing keys and throws). A new `b68_3_apply_factor` key gets the same treatment. Both classes are always in the map once loaded, so the `?? getCurrentPairCorrelationConfig()` fallback (`signal-orchestrator.ts:1695`, `vts-runner.ts:2937`) is reachable only for a class outside `crypto_spot`/`xstock_spot` or a partially loaded map — removed for this factor as scoped (B-4).

**A-7 — The xStock VTS path applies no confidence chain at all** (`eval-cycle.ts:1332` at `8636040`, `chain_modulated_confidence: null`). So the chain-final confidence on that path IS the raw regime confidence, `mceContext.regime.confidence`, which the trade already records as both `regimeConfidenceModulated` and `regimeConfidenceRaw` (crypto's real decision records its chain-final value, `vts-runner.ts:3083-3092`). So on that path record-only is automatic; the apply flag matters at the two older call sites, which xStock reaches only through the active path (VTS xStock no longer enters `vts-runner`, B-PRICE-FEED-TRUTH I2). The trade id exists at `eval-cycle.ts:1343` (`registerOpenVtsTrade`, at `8636040`); the emit goes after it.

**A-8 — 90-day hard delete** (`b67_0_alternates_retention_days = 90`, live value 90; oldest row 2026-08-07; no archiver for this table; `STORAGE_POLICY.md` silent — control: it names `closed_trades` 3 times). **Deliberate** (B67.0, 2026-04-28, SIM `:1917-1940`). **Consequence for this batch: every xStock correlation row collected is deleted 90 days later.** Whether calibration data should outlive 90 days is Kyle's call, not this batch's.

**A-10 — A record with no strategy can never be replayed** (Langston C-A). `emitAblationRecord(…, strategy = null)` (`factor-ablation-emitter.ts:162-169`); the replay passes `row.strategy` to `findMatchingTrade`, which returns null for a null strategy (`factor-replay-core.ts:229`, and `:342` in the sibling); such a row never gets `replay_completed_at`, and `computeFactorCalibration` reads only replayed rows (`drift-dashboard-aggregator.ts:1161`) with a non-null `real_decision->>'confidence'`. So the xStock emit must pass the trade's `strategyKey` and a real decision with a confidence, or every record is invisible to the one calibration reader.

**A-9 — Governance gaps found.** System Manual `:11885` still says the reference is "XBT/USD universal" (per-class since B79.0n); neither map says the correlation pairs bars by position. Both fixed at Step 10.

## B. PLAN (each item points at its finding)
| # | item | from |
|---|---|---|
| **P-1** | `resolveCorrelationInputs(assetClass, pairOhlc, config)` in `pair-correlation.ts` (one function, used at all three sites): crypto → Kraken 60-minute reference + the existing mapper, pair untouched (byte-identical); xStock → `xstockOhlcCache.getOHLCData(ref, 15)` `.bars`, then **both series reduced to the timestamps they share**, ascending. Typed to the class's interval (15 for xStock; 240 refused by the cache). | A-1, A-2, C-4 |
| **P-2** | `b68_3_apply_factor` per class: seed `*` = true, `xstock_spot` = false; xStock `b68_3_compute_correlation_enabled` → true. Loader refuses a missing key. Migration + rollback in git, MANIFEST entry. | A-6 |
| **P-3** | Both older call sites: drop the `??` fallback for this factor (class missing ⇒ skip, one log line); multiply the factor only when `applyFactor`. | A-6, A-7 |
| **P-4** | `buildB68_3Alternate`: when not applied, `confidence_without_factor` = the real confidence (the factor never entered it), **`confidence_with_factor` = real confidence × factor — what the confidence WOULD have been had the factor applied** (never the real confidence, which would make with = without and the label false), `factor_applied = false`; plus `interval_minutes` and `aligned_by_timestamp` on every row. The applied (crypto) branch is byte-identical. | A-5 |
| **P-5** | `eval-cycle.ts`: after `registerOpenVtsTrade` (`:1343`), compute via P-1 and emit one `vts_trade` row: `vtsTradeId` = the returned trade id, **`strategy` = `strategyKey`** (never null), `asset_class = xstock_spot`, **real decision `{ regimeLabel: regime ?? 'UNKNOWN', confidence: mceContext.regime.confidence, admissionPossible: true }`** (chain-final = raw on this path, A-7). Failure is logged and never blocks the trade. | A-7, A-10 |
| **P-6** | Replay match key adds asset class (`factor-replay-core.ts:230` and the index builders). | A-4 |
| **P-7** | `computeFactorCalibration` (`drift-dashboard-aggregator.ts:1159`) ONLY filters `alternate_decision->'metadata'->>'factor_applied' IS DISTINCT FROM 'false'`. The status query (`:532`) is unchanged. | A-3, A-5 |
| **P-8** | Tests: crypto byte-identical (golden), xStock routed to the xStock cache, timestamp alignment (shuffled gaps), bar-shape assertion (finite closes), apply-off (factor exactly 1.0, real confidence unchanged), missing-class skip, replay key with a DASH/USD collision, aggregator filter. Mutations: apply forced on; positional pairing restored; class dropped from the replay key. | P-1..P-7 |
| **P-9** | Repeat A-2 during US hours before Step 3 closes, and as the Step-7 rolling check: share of xStock rows with `sample_count = 29` over 24 h. | A-2 |
| **P-11** | **Crypto alignment, measured (C-E, folded as a read-only measurement on agreed work):** the same A-2 instrument on the crypto path — Kraken 60-minute bars for the pair and `XXBTZUSD` as served by `ohlcCache` — share of crypto pairs whose last 30 bars line up in time with BTC's, with a control. If they do not line up, the crypto path is applying a mis-paired factor today: that becomes a fix proposal to Kyle via PM Claude (the 10-19 rule), not code in this batch. Owner CC-A, before Step 3 closes. | A-2 |
| **P-10** | Step 10: System Manual (`:11885` reference, positional vs timestamp pairing, compute vs apply), SIM (new xStock write, its readers, the replay key), `XSTOCK_CALIBRATION_PLAN.md` (25-9 started, E.2 correlation only). | A-9 |

**Step-7 verification, revised from the scope:** on sampled xStock rows `strategy IS NOT NULL`, `real_decision->>'confidence' IS NOT NULL`, `is_btc_self_reference = false`, `btc_reference_available = true`, `cold_start = false`, **`sample_count = 29`** (kept as an equality, per Langston), `reference_symbol = 'SPY/USD'`, `interval_minutes = 15`, `aligned_by_timestamp = true`, `factor_applied = false`, and a non-zero spread of `correlation_to_btc` across ≥ 10 symbols; plus the replay attaching outcomes to them the next night (`replay_completed_at` set, `replay_outcome` not `unreplayable_*` for most), and `/api/xstocks/factor-calibration` still excluding them.

## C. Settled with Langston at r1
1. 15-minute bars — yes, on entailment (the pair series is 15m), coverage as corroboration only.
2. A-4 folded under rule 23; all four key sites pinned (`factor-replay-core.ts:113`, `:199`, `:230`, `:343`).
3. A-8 to Kyle via PM Claude, not a blocker, with a named home.

## D. For Kyle, via PM Claude (decisions, not blocking this batch)
**D-2 (C-B):** the Analytics replay-status counts pool every asset class together (pre-existing; affects seven other factors already). Proposed as its own item; no work until Kyle slots it.

**D-1:**
A-8: factor records, including the new xStock correlation records, are deleted after 90 days by design. If calibration (Phase 25) starts later than about 90 days from the first xStock record, the oldest data will be gone. Options: leave it, lengthen the window, or archive before deleting. Recommendation: decide when Phase 25's start is placed; nothing is lost before February.

## Plain-language summary
The audit found two things the scope missed. xStocks run on 15-minute price bars, not hourly. And the correlation code lines the two price series up by position rather than by time — for most xStocks that would compare different hours and still look valid. The plan matches bars by time, uses 15-minute bars, records without touching trading, and fixes a related mix-up where the nightly job could attach a crypto trade's result to an xStock record with the same ticker.

## P-11 result (measured 2026-11-05 ~06:55Z, read-only, after r2 was dispatched)
Crypto 60-minute bars through the app's own `ohlcCache` (Kraken public OHLC), paced 1.5 s apart. Population: 12 crypto VTS symbols of the 250 traded in the last 14 days — the 6 most traded (RUNE/USD 874 trades … TEL/USD 100) and 6 traded once (STBL/EUR, DASH/EUR, KAS/EUR, ALGO/USD, POL/EUR, CRV/EUR). Reference `XXBTZUSD`: 721 bars to 05:00Z.
**All 12: 721 bars, last 30 positionally aligned with the reference 30/30, all 721 timestamps shared, no gap over an hour.** Kraken returns one continuous hourly series per pair, so positional pairing IS time pairing on the crypto path. The instrument is the A-2 logic, which on the xStock side reported misalignment for 431 of 469, so it can speak.
⇒ **C-E disposition: no work — withdrawn, citing this measurement.** Limit: 12 of 250 symbols, one moment; the thinnest pairs were included deliberately.
