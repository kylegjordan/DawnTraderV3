# Finding provenance and exact searches

All searches were case-insensitive regex searches at pinned HEAD `c7f18c5c7291b14a21a654ca3a35625c0533ca38`. Every group was applied separately to **all three** corpora:

- `C:\DawnTrader-Audit\1-system-manual\RUNNING_ISSUES.md`
- `C:\DawnTrader-Audit\1-system-manual\BATCH_CATALOG.md`
- `C:\DawnTrader-Audit\Claude Comms and Packages\Batch Completion\` (recursive file search)

Commands were of the form `rg -n -i -- PATTERN CORPUS`, using the exact patterns below. These are search corpora, not declarations of full-file reading. Long matching ledger rows were inspected selectively and reread for decisive closures/amendments; the full saved hit files are evidence of what was searched, not proof that every hit was read. No previous output/notes/crew mirror was a search corpus.

Working search IDs F1–F10 predate final finding order. The mapping below prevents conflating them with report finding numbers. The exact-dimension DHMA NOT FOUND claim is weak: synonyms or an unlinked issue can defeat this search. Positive controls returned DHMA history; this is not a failed instrument producing a false absence.

## P1 — report finding(s) 1

Exact regex:
```text
fee_model|spot_maker_fee|spot_taker_fee|resolveFeeRates|rebate|negative fee|zero.fee
```

B-4.5 deliberate positive-domain closure; B7.2a centralized resolver. Challenge published valid zero/rebate domain explicitly.

[Full saved search matches](C:/DawnTrader-Codex/notes/astra-independent/F1-provenance-search.md).

## P2 — report finding(s) 3

Exact regex:
```text
strategy-engine|vwap_pullback|targetFromR|STRATEGY_FEE_VIABILITY|FEEVIABILITY|applyGlobalGuards
```

Required proposal read completely including amendments; shared guard/normalizer history considered. Open premise refuted algebraically.

[Full saved search matches](C:/DawnTrader-Codex/notes/astra-independent/F2-provenance-search.md).

## P3 — report finding(s) 4

Exact regex:
```text
net-expectancy-kernel|computeNetExpectancyKernel|flat_pwin_base|pwin_floor|pWin|#502|#399
```

Issues #399 and #502 live; #503 and B8.5c closed; B8.5a signalStrength objectives versus flat-pWin prose read.

[Full saved search matches](C:/DawnTrader-Codex/notes/astra-independent/F3-provenance-search.md).

## P4 — report finding(s) 5

Exact regex:
```text
ready_to_buy_service|rMultipleCore|sizeActivePositionForSignal|fixed.notional|B-SIZING-DEC-RESTORE|selection.IC|#399
```

R ranker deliberate B7.1; fixed-notional restoration source/history; #399 selection question remains live. #927/930 amendments additionally followed under P8.

[Full saved search matches](C:/DawnTrader-Codex/notes/astra-independent/F4-provenance-search.md).

## P5 — report finding(s) 6

Exact regex:
```text
pending-maker-logic|evaluatePendingMaker|order-placer|closeFillFull|computeShadowOutcomeMath|SHADOW_MAX_HOLD_MS|max_hold_switch|P19-B7.2c|P19-B4b.1|P19-B8.5j
```

B7.2c fill-wins closure, B8.5j max-hold decision, depth/accounting and shadow capture contract. Purposeful model rules are not newly discovered bugs.

[Full saved search matches](C:/DawnTrader-Codex/notes/astra-independent/F5-provenance-search.md).

## P6 — report finding(s) 7

Exact regex:
```text
calculatePairRegime|market-context-engine|amr-weather-report|evaluateAmrGates|modulatedConfChain|regimeConfidence|AMR|#94|#514
```

AMR/B5 history, confidence telemetry and B8.5a retirement; runtime enforcement remains unknown. Classifier comments follow B68.5/B70.3 replacement.

[Full saved search matches](C:/DawnTrader-Codex/notes/astra-independent/F6-provenance-search.md).

## P7 — report finding(s) 8

Exact regex:
```text
daily-loss-budget|compute24hSnapshot|checkMaxTotalExposure|trade-safety|risk-concentration|killInProgress|#518|#519|#618
```

B6 closure; #303 unrealized loss, #519 config, #632 session semantics, #634 failure observability; #618 SQL aggregation closed, dormant LPCP distinguished.

[Full saved search matches](C:/DawnTrader-Codex/notes/astra-independent/F7-provenance-search.md).

## P8 — report finding(s) 5, 9

Exact regex:
```text
defensive_hedge|strong_bull_trend|universe-loader|allowedQuotes|liquidity_trap|long.only|#927|#930
```

B54 deferred detector/regime decisions and long-only closures. #927 September-5 amendment read; n=1 queue not a rate.

[Full saved search matches](C:/DawnTrader-Codex/notes/astra-independent/F8-provenance-search.md).

## P9 — report finding(s) 7

Exact regex:
```text
rtb-refresh-service|acquireRefreshedInputs|adaptiveEMA|outcomeFeedbackStore|feedEvGapObservation|#532|#558
```

Shared-state registry read before source conclusions; duplicate refresh repaired, fresh-regime input path distinguished from carried setup geometry and indirect learning.

[Full saved search matches](C:/DawnTrader-Codex/notes/astra-independent/F9-provenance-search.md).

## P10 — report finding(s) 2

Exact regex:
```text
dhma|realizedVol|calculateVolatility|k_tp
```

NOT FOUND exact dimension defect is a weak result. Positive controls: B54 HMA/OBI mismatch, B72.2 config migration, Batch45 long-only closure. DHMA introduction git diff inspected.

[Full saved search matches](C:/DawnTrader-Codex/notes/astra-independent/F10-provenance-search.md).

## Review boundary

The report cites implementing source and the relevant closure/live issue directly where decisive. FOUND-AND-CLOSED does not mean the design is beyond challenge; such findings explicitly challenge a decided assumption. FOUND-AND-LIVE means this review adds a scoped mathematical or consumer interpretation to known work. No NOT FOUND result is approval clearance. Historical staging counts and tests in completion reports were not rerun or represented as this auditor's measurements.

