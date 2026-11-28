# B-PLAN-PRICE-BASIS — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

## Previously stated vs now

**PREVIOUSLY STATED:** the October audit reported 12 of 19 strategies in its reviewed population. **NOW:** the Nov 28 source census finds 19 canonical identities at each pinned ref and 18 class-eligible identities in each spot asset class at each ref. **REASON:** the approved Step 1 scope (`eae8a6721f77770a4ef80b518f76722a1cbe08ff`, §3) asks for an inventory of canonical identities, class eligibility and reach. The 12 historical observations remain a separate measurement. Current enabled settings and actual opportunities still require their own evidence.

**Status:** Step 2 source checkpoint, Nov 28 UTC. Audit base `9760514cd138c823a4418538cef10d6710231910`, serving Phase A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016` (staging checkout and `dist/BUILD_SHA` agreed at startup). The shared base then advanced to `3df8bdd4f060bf1a0d90674271efd700d59cdeba`, changing only `.claude/memory/MEMORY_CC_A.md` in that range. Between the serving and audit refs the named strategy, canonical mapping, MCE and xStock source objects match. `signal-orchestrator.ts` and `vts-runner.ts` do differ, so checkpoints below identify the measured ref. This record covers source tracing and offline controls. Replay registration, current runtime evidence and Step 2 review remain open.

## Audit findings

### A1. Strategy identities, class membership and reach

The two independent source lists, `STRATEGIES` in `server/config/canonical-regime-strategy-map.ts` and the keys of `STRATEGY_DISPLAY_NAMES`, enumerate the same 19 unique identities at both refs. The class maps exclude `orb` from crypto spot and `defensive_hedge` from xStock spot. xStock `orb` is in TREND_FRIENDLY_STABLE and IMPULSE_EXPANSION. On each ref all five regimes for each of the two spot classes match their generated bridge favored lists after applying the explicit favored exclusions (20 of 20 class/regime/ref comparisons). `strong_bull_trend` is the positive control for the projection boundary. It exists in both runtime class maps in those two regimes and is intentionally excluded from the favored-list output. The level and availability audit must preserve the KD-76 override and treat actual strategy enablement separately. `range_trading` normalizes to `range_trade` and contributes one identity.

The crypto orchestrator deliberately omits the bearish `liquidity_trap` detector at `server/services/signal-orchestrator.ts:3203` (audit ref). VTS skips it at `server/services/vts-runner.ts:660,5902` and its shared detector dispatch returns `null` at `:1559–1565`. `server/services/strategy-engine.ts:1083–1121` still carries the detector. Batch 70.3 records the earlier deliberate disposition. For `defensive_hedge`, the direct active branch passes an undefined BTC input (`signal-orchestrator.ts:3450`) while the VTS branch can pass a series after its minimum history guard (`vts-runner.ts:1580–1585,5635–5647`). The detector tests the BTC input at `server/strategies/defensive-hedge.ts:134–153`. The separate active confluence path can generate a `defensive_hedge` strategy label from an engulfing pattern (`signal-orchestrator.ts:3596`, `server/services/hybrid-integration.ts:129–225`), carrying geometry from its quant signal. Grade direct detector reach and confluence reach separately.

### A2. Entry points and first consumers

Source line references in this section are from the audit base except where Phase A is named. Source and fixture evidence establish the branches below. Production scheduling overlap and effective settings remain open.

| Entry family | Entry and boundary verified | Price and first consuming leg |
| --- | --- | --- |
| Active orchestrator | `server/services/active-engine-service.ts:814–817,898,1655–1658` and `active-portfolio-manager.ts:226–235` lead to `signal-orchestrator.ts:446–498`, which calls `evaluateMarket` at start and on a recurring interval. The legacy `TradingEngine` also constructs an orchestrator at `trading-engine.ts:58–68` and remains reachable from the active engine route family in `server/routes.ts:3692`. | Active crypto uses smoothed input for quant evaluation and the OHLC close in the pattern path (Phase A `signal-orchestrator.ts:2424–2453,2621–2642`). Crypto 8c selects the entry quote and applies its level-basis rules before grid sizing and SQE (Phase A `:622–676`). An unavailable required quote can refuse birth before sizing. Confirm mutual exclusion across constructors at runtime before any plan changes. |
| Crypto VTS | Boot and fallback in `server/core/boot_orchestrator.ts:110,126`, API in `server/routes/vts.ts:543`, and lifecycle code in `vts-runner.ts:6341,6559` lead into the VTS loop. Cycle and generation evidence at `:1636,5485,5902,6000`. | Independent pool and detector inputs (`vts-runner.ts:1908`), with separate quote and simulated entry handling. Active crypto 8c is a protected regression control. |
| xStock VTS and active paper | Boot in `server/index.ts:966–969` leads to the scanner's central-clock registration (`server/asset_classes/xstock_spot/scanner.ts:249`) and its evaluation call (`:916–953`). The shared evaluation starts at `eval-cycle.ts:329` and selects lanes and detection at `:527,600` and `lane-eligibility.ts:53–69`. | The scanner passes the latest available 15-minute bar close, which may be a forming revision, and a separate quote. The VTS taker loop can stop for missing ask or size at `eval-cycle.ts:1122–1134`, before the VTS persistence path at `:1388` and the active paper dispatch call at `:1428`. Active dispatch then applies its own checks and reads its own quote (`active-dispatch.ts:170–190,206–246,296`). A quote available at that later stage cannot satisfy a missing earlier ask. Preserve #1250 fill-time rebasing separately. |

### A3. Initial geometry inventory

The table names the strategy's first plan geometry producer. Each row inherits the relevant family in A2, including the class exclusions and disconnected branches in A1. Per-strategy effective settings, exact decision-time availability, negative inputs and terminal reach remain to be paired with these rows. ATR is a price distance. A percentage offset applies to its stated price anchor.

| Strategy | Entry, stop and target source anchors | Detector object at audit base |
| --- | --- | --- |
| `abcd_long` | C-high plus ATR offset, C-low minus ATR offset, proportional or AB/risk-bounded target | `strategy-engine.ts:385–424` |
| `adaptive_flow` | Current price with entry premium, structural low or ATR stop, ATR distance target | `adaptive-flow.ts:164–231` |
| `breakout` | Range-break reference with premium, range-low stop, range-height target | `strategy-engine.ts:663–678` |
| `defensive_hedge` | Current price with entry premium, buffered engulfing low, ATR distance target in the direct detector. See A1 for the confluence route. | `defensive-hedge.ts:235–296` |
| `dhma` | Current-price premium and realized-volatility stop and target terms. The volatility calculation operates on fractional returns. | `strategy-engine.ts:1570–1608,1808–1819` |
| `inside_bar_reversal` | Buffered parent high and low, ATR distance target | `inside-bar-reversal.ts:185–226` |
| `liquidity_trap` | Retained bearish geometry, with the disabled paths recorded in A1 | `strategy-engine.ts:1083–1121` |
| `mean_reversion` | Current-price premium, proportional stop, mean-anchored target | `strategy-engine.ts:767–781` |
| `morning_star` | Current price, buffered pattern low, ATR distance target | `morning-star.ts:169–221` |
| `orb` | Current price after the opening-range breakout, range-low stop, entry plus range-height target distance | `orb.ts:284–315` |
| `pivot_shift` | Current price, structural and ATR stop bounds, ATR distance target | `pivot-shift.ts:170–223` |
| `range_trade` | Current price plus ATR offset, range endpoints with ATR offsets for stop and target | `strategy-engine.ts:876–890` |
| `reverse_impulse` | Current price, pinbar low, ATR distance target | `reverse-impulse.ts:174–229` |
| `sma_trend_ride` | Current-price premium, swing-low and SMA stop anchors, proportional or risk-based target | `strategy-engine.ts:530–564` |
| `strong_bull_trend` | Bar close, ATR-based stop and target in the dedicated path | `strong-bull-trend.ts:152–192` |
| `support_bounce` | Current price, support-based stop, ATR distance target | `support-bounce.ts:263–316` |
| `volatility_edge` | Buffered C-high, structural stop, measured-move and ATR target limits | `volatility-edge.ts:192–271` |
| `vwap_bounce` | Current-price premium, VWAP-based stop, risk-based target | `strategy-engine.ts:979–994` |
| `vwap_pullback` | Current price plus ATR, VWAP and low anchors, high and risk target inputs. The Strong Bull Trend case uses its own distance stop and risk target. | `strategy-engine.ts:217–282` |

The MCE `high24h` and `low24h` values use 24 observed bars (`market-context-engine.ts:1253–1254,1786–1798`). Twenty-four contiguous 15-minute xStock bars represent six nominal bar-hours, with elapsed coverage depending on gaps. `strategy-engine.ts:256–257,1275` provides positive consumers for the target/stop and reversal qualification respectively. Audit the intended time contract and consumers using #1223 scope and the System Manual before classifying it. The DHMA distance concern is already recorded in #1221. The evidence here leaves its unit contract open.

### A4. Source controls and coverage limits

- Source and tests. Executed the canonical bridge, active crypto 8c birth, xStock DBS-to-strategy and required-asset-class fixtures together. All 35 cases across four files passed. The class projection was re-derived from both exact objects using both spot classes and their five regimes. The active 8c fixture exercises a no-quote refusal and eligible quote inputs. The xStock DBS cases exercise wiring. A separate run passed all 40 cases in the 8a VTS entry, C2 active dispatch and C3 freshness/watchdog fixture files. The 8a test asserts the earlier `continue` from source text. The C2 and C3 tests start at active dispatch and exercise both genuine-tick reach and replay-only refusal there. The paired test through the encompassing VTS loop and later active-dispatch seam remains due.
- Architecture and intent. System Impact Map S27–S28, §4.1, §5.2.5 and B.4 describe the scheduler and pipeline boundaries. System Manual §§3.1, 3.9 and 5.3 cover VWAP Pullback, DHMA and Defensive Hedge. The archived canonical mapping describes the historical class/regime intent. Current comparisons use the exact runtime maps and the generated projections.
- History and ledger. Approved scope §1 names the original scanner cadence and its 15-minute successor, the active crypto smoothing and 8c price-side history, and the MCE origin. BATCH_CATALOG B.4, B3.1b and Batch 70.3 and the #1221, #1223 and #1250 issue records retain their existing dispositions. The source checkpoint does not open a new issue.
- Staging evidence. The staging build and checkout identify Phase A. Runtime behavior, DB effective settings, term-by-term controls and browser evidence remain unaudited here. This checkpoint did not consume any historical replay population.

### A5. Candidate replay sources and the bar cutover boundary

`eval-cycle.ts:652–667,1108–1117,1303–1317` attempts to archive detector nulls, VTS booking refusals and admitted rows. These are candidate outcome records. `server/services/data-archive/signal-eval-archiver.ts:315–347,405–431` can skip pre-filter and strategy-internal capture or emit a base row without its provenance link. It also records a captured timestamp and forming-bar values. Those fields alone cannot establish every eligible pre-VTS opportunity, the exact earlier bar revision or the later independent active quote.

At both pinned refs, `scanner.ts:595` calls `getOHLCDataBatch`. Its cache-hit and 15-minute snapshot/overlay branches use the legacy path (`server/services/xstock-ohlc-cache.ts:283–297,328–369`). The adjacent availability-aware method explicitly describes the capture-only phase and P8 switch (`xstock-ohlc-cache.ts:377–385`). The xStock Bar Availability Progress Report §2 covers the revision proof capability, and §6 retains the pre-cutover replay limitation. Carry those as separate evidence from what the named scanner call consumed. Seek a contemporaneous join from the actual opportunity to the bar revision and to both quote observations. Use missing or ambiguous links as unassessable cases. Independent reread of this carrier limitation remains due.

REVIEWER: claim-only · identify the objects that distinguish strategy identity, class membership and actual reach · HIT: default-true settings gate, sibling active constructor and separate xStock scanner/active boundary · re-derived y at the pinned source objects. Runtime reach remains NOT RE-READ.

## Implementation plan in preparation

1. **A1 and A3.** Complete the strategy matrix with class, lane, effective settings, units and clock, first consumer, and missing-input disposition. Track each limb of Defensive Hedge and the intentional Liquidity Trap exclusion. `UNAUDITED`: point-in-time effective settings, production mutual exclusion and most dynamic per-strategy controls.
2. **A2, A3 and A5.** Before reading a market sample, register eligible pre-VTS opportunities and replay both bases over the same identities. Pin each price-dependent leg, each retained structural anchor, the decision-visible bar revision and the exact quote side, source, observation time and availability time at each read. Keep the VTS booking and active quote checkpoints distinct. Report VTS outcomes, reasons for pre-dispatch refusals, active dispatch and Entry Gate outcomes, and unassessable rows against the full denominator. `UNAUDITED`: replay source coverage, concrete cohort and dates, per-leg alternative, handling of a missing clock, freshness thresholds and empirical outcomes.
3. **A2 and A4.** Pair the missing VTS taker ask with a later eligible active quote and assert the earlier refusal. Pair that with a VTS ask that reaches active dispatch when other controls pass. Move only the quote, then age it, revise a bar after decision and retain a structural leg in independent controls. Keep the crypto 8c fixture as a regression control. `UNAUDITED`: xStock paired control and observed terminal receipts.
4. **A2–A4.** Before a plan-basis choice, derive and obtain review of the Price Feed Coverage bounds for the exact candidate price quantity and clock, and apply them to changed plan distances. Leave unsupported comparisons unassessable and preserve the corresponding refusals. `UNAUDITED`: derivation, versioning, observed coverage and reviewer acceptance. Kyle's decision follows that evidence.

The source census establishes where to look when a strategy's bar price and executable quote disagree. Some plan levels come from the price and others from the pattern. The next audit pass will test both against the same xStock opportunities and record which checks each opportunity actually reaches.
