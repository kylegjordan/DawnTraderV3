# DawnTrader — frozen independent audit and forward design
## 1. Header, authority and independence

Audited ref: **c7f18c5c7291b14a21a654ca3a35625c0533ca38**, read-only clone `C:\DawnTrader-Audit`. Review date: 2026-09-06. Advisor only; Kyle decides, and the crew's review gates remain unchanged.

Initial command:
```powershell
git -c safe.directory=C:/DawnTrader-Audit -C C:\DawnTrader-Audit rev-parse HEAD
```
Exit: 0. stdout:
```text
c7f18c5c7291b14a21a654ca3a35625c0533ca38
```
stderr: empty.

Initial command:
```powershell
git -c safe.directory=C:/DawnTrader-Audit -C C:\DawnTrader-Audit status --porcelain
```
Exit: 0. stdout: empty. stderr, separately:
```text
warning: unable to access 'C:\Users\kyleg/.config/git/ignore': Permission denied
warning: unable to access 'C:\Users\kyleg/.config/git/ignore': Permission denied
```
The required HEAD matched; porcelain reported no changes. The warnings were not interpreted as dirty-file output.

**Protocol disclosures.** The literal requested nested brief path was absent. The available consolidation, [ASTRA_INDEPENDENT_AUDIT_BRIEF.md](C:/DawnTrader-Codex/ASTRA_INDEPENDENT_AUDIT_BRIEF.md), supplied the exact assignment and was used. Section 0 was read first, then the header commands, section 3, and sections 1–5. Required orientation preceded the immutable [independent questions](C:/DawnTrader-Codex/notes/astra-independent/my-questions-before-section-6.md). Sections 6–9 were first read only after that gate; subsequent rereads occurred after the gate. The original alternative briefs and READ_TEST were not used.

No previous output/notes/answers/report comparison, crew mirror, or other source clone was consulted. The mirror deferral is the explicit independent-rerun exception. Required manual, issues, proposal and batch records contain crew conclusions and incidental references to earlier audits; this is independence from prior reports, **not complete blindness to crew-authored conclusions**. Exposure includes the required fee-viability proposal and its amendments, RUNNING_ISSUES calibration/history entries, and completion reports cited below. Broad provenance searches within the three required source corpora also returned audit-attributed history; only source/provenance, not the excluded reports themselves, was consulted. Directory/file-name enumeration was used for orientation. No source edits, patches, deployments, external messages, live trading, backtests or design-validation campaign were performed. Two initial stderr-capture temporary files were written outside the workspace before section 1's workspace-only writing rule was learned; subsequent audit artifacts are confined to the designated new workspace folders.

No runtime export or authenticated account response has been examined. Historical counts and deployment claims quoted from the brief or crew are **supplied history**, not this review's measurements. The arithmetic witness script uses hypothetical numbers to falsify universal source claims; it does not test a strategy on market data or award any design a pass. A precise incidental exposure example is [signal-orchestrator.ts:1052](<C:/DawnTrader-Audit/server/services/signal-orchestrator.ts:1052>), which attributes an older gate assertion to “Active-Trading-Path-Audit H1.” Its attribution is recorded; its stale gate statement was not accepted over the current implementation.

## 2. Positive read coverage and boundaries

This is a traced economic/control-path audit, not a claim that every repository line was reviewed. The append-only [READ_COVERAGE.jsonl](C:/DawnTrader-Codex/notes/astra-independent/READ_COVERAGE.jsonl) records numbered read requests and scoped searches. **A requested range is not proof that a truncated response was fully seen.** The positive coverage below records useful visible/re-read portions; search excerpts are separately identified. Exact implementing lines used for conclusions were inspected. No count or absence below is inferred from truncated output.

| Pinned file or group | Relevant ranges actually inspected |
|---|---|
| SYSTEM_MANUAL.md, under 1-system-manual | TOC/orientation plus verified complete excerpts 300–312 (math), 474–491 (fee), 1045–1060 (SQE), 1578–1595 (regime), 1870–1890 (strategy), 2383–2397 (scanning), 3544–3560 (risk), 4492–4510 (execution). Wider chapter reads in the request log were partially truncated; only these bounded excerpts are claimed as exact manual coverage here. |
| SYSTEM_IMPACT_MAP.md | Cross-cutting registry read in stages; positively inspected portions 66–85, 91–103, 104–106 and 155–161. Wider requested 66–196 coverage is not certified. Shared-state conclusions use named entries and implementing code, not a blanket registry census. |
| PHASE_19_PLAN.md; POST_AUDIT_ROADMAP.md | Actual paths are under 1-system-manual. Phase-19 orientation/status 1–35 and verified sequence 217–224; roadmap verified run order 29–40 and Phase-25 rows 306–309. Wider requested intervals are retained in the log, not certified as wholly read. |
| Required STRATEGY_FEE_VIABILITY_TWO_BATCH_PROPOSAL.md | 1–120, including correction/amendment tail; under Claude Comms and Packages/Scope Files. |
| RUNNING_ISSUES.md | Scoped component/symbol searches; complete key entries #399 at 2838, #502/#503 at 344/343; #303 at 2767; #632 within 1908–1925; #634 within 1872–1890; #927 at 5927–5936 and #930 context. Search hits for other issue IDs are not whole-file reading. |
| BATCH_CATALOG.md; Batch Completion directory | Component AND symbol searches in all three mandated corpora. Relevant full passages: B_4_5 1–25; P19_B7_1 13–28 and selection/calibration tail; P19_B7_2a closure/fee resolver objectives; P19_B7_2c 1–42; P19_B8_5a 13–32; P19_B8_5c 1–26; P19_B8_5J 1–34; P19_B6 1–32; BATCH_54 103–114; BATCH_72_2 15–38. B5 and cost-accounting completion excerpts were read for the cited objectives. |
| server/services/fx5-scanner.ts; asset_classes/xstock_spot/active-dispatch.ts | 555–597; 90–241 respectively. Boot/dispatch entry points separately searched in server/index.ts and signal-orchestrator.ts. |
| server/services/signal-orchestrator.ts | 528–595 visible dispatch/generation portion; 782–834; 1040–1130; 1468–1510; 1560–1710; 1778–1828; 2383–2422. Queue-before-confidence ordering, sizing, maker/taker call and input acquisition inspected. |
| server/core/calculations/net-expectancy-kernel.ts; expectancy.ts | 1–129; 602–740. |
| server/core/math/maker-taker-decision.ts; cost-model.ts | Maker/taker mathematical body 205–361, following initial requested 1–362; cost resolver 73–164, cached/live-cost paths 227–277 and execution geometry 308–344. Other booked/sided formula lines separately searched/read. |
| server/startup/b72-warmup.ts; asset_classes/xstock_spot/friction.ts | 211–249; 1–43. |
| server/core/filters/signal_quality_evaluator.ts | 339–371; 398–450. |
| server/core/rtb/ready_to_buy_service.ts | 703–813; 1775–1810; 1830–1901. Capture-writer fields separately searched. |
| server/services/active-execution-engine.ts | 3114–3175; 3630–3706; 3918–3978; 2392–2516. Additional pending/kill hooks were symbol searches. |
| server/services/active-position-sizing.ts | 70–246; diagnostic risk field searched separately. |
| server/services/daily-loss-budget.ts; guardrail-policy.ts | Visible full snapshot/classifier body 75–192 and close trigger 283–299; surrounding state/error passages inspected. Guardrail kill path 480–545. |
| server/services/trade-safety.ts; risk-concentration.ts | Targeted implementing search excerpts for pending/open inventory, checks, exposure arithmetic/catch, per-mode maps and scaling. Not complete-file coverage. |
| server/core/trading/pending-maker-logic.ts; services/execution/order-placer.ts | 1–61 (complete helper); 55–123 (paper open/close implementation). |
| server/services/tec-evaluator.ts | Targeted timeout, stop, trailing and target branch excerpts, including 227–284 and 373–416 implementing sites. Not complete-file coverage. |
| server/services/vts-runner.ts; vts-service.ts | 496–515; 765–789; 910–941; 1140–1160; 3807–3840; 1110–1146 respectively. Max-hold call sites separately searched. |
| server/services/amr-weather-report.ts; core/governance/amr-gates.ts | Weather classification/hysteresis 210–335; producer/state and EV-gap search excerpts. AMR gate branch search excerpts 107–187. |
| server/services/market-context-engine.ts | Targeted producer, per-class cache, pure refresh-input and global-metric reader excerpts; not whole-file review. |
| server/core/metrics/market-regime.ts; asset_classes/*/regime-thresholds.ts | 231–374; complete crypto threshold declarations 16–35 and xStock declarations 39–60. |
| server/config/canonical-regime-strategy-map.ts | 55–375 and 389–494. |
| server/services/strategy-engine.ts | Complete relevant formula blocks: 224–272, 370–407, 510–542, 633–668, 727–763, 840–873, 950–975, 986–1045, 1050–1083; 1305–1334; DHMA 1376–1424, 1445–1463, 1538–1567, 1783–1796. |
| server/strategies/*.ts | adaptive-flow 153–183; morning-star 155–182; reverse-impulse 155–183; inside-bar-reversal 172–195; pivot-shift 159–188; support-bounce 247–270; volatility-edge 156–199; defensive-hedge 90–246; strong-bull-trend 105–178; orb 254–302. |
| server/strategies/strategy-helpers.ts | 309–353, 409–467. |
| server/services/passive-archive/universe-loader.ts | Targeted allowedQuotes construction and exclusion reader excerpts (163, 181); not all universe producers. |
| shared/schema.ts | 520–545, relevant closed/open trade schema passages within 1671–1739 and 1937–1989, complete shadow schemas 2162–2275. |
| Git history, pinned clone only | Read-only targeted history for maker/taker, kernel, sizing and DHMA. DHMA introduction commit 95c9fd79f and its added geometry lines were inspected; intervening short-disable/config migration history checked. |

All paths in this table are relative to the pinned clone, and all source links below resolve there. Search provenance is reproducible in [PROVENANCE.md](C:/DawnTrader-Codex/out/astra-independent/PROVENANCE.md); the full saved match sets are in this audit's own notes. Searching the entire completion corpus is **not** claiming to have read every completion report.

## 3. Numbered structural findings

### 1. The fee contract excludes legitimate fee values; account applicability must be established before diagnosing an hours-versus-days problem

**Provenance: FOUND-AND-CLOSED. Technical disposition: explicit challenge to a decided fee-domain/product assumption, not discovery of an unfixed single-source resolver bug.** B-4.5 deliberately installed per-class 0.008/0.004 and a strictly positive domain; tier automation was deferred. See [Claude Comms and Packages/Batch Completion/B_4_5_COMPLETION_REPORT.md:9](<C:/DawnTrader-Audit/Claude Comms and Packages/Batch Completion/B_4_5_COMPLETION_REPORT.md:9>) and its objective 4 at line 12. Component/symbol search group P1 is recorded in PROVENANCE.

Current public authority checked 2026-09-06: the crypto Spot ladder's maker/taker percentages are below. Pro xStocks is a separate product schedule; stable-base/FX and ordinary app pricing must not be substituted. Account eligibility and jurisdiction still control applicability. [Kraken fee schedule](https://www.kraken.com/features/fee-schedule)

| Qualifying volume threshold | Maker % | Taker % |
|---:|---:|---:|
| $0 | .40 | .80 |
| $2,500 | .30 | .60 |
| $10,000 | .22 | .38 |
| $25,000 | .20 | .35 |
| $50,000 | .15 | .30 |
| $100,000 | .12 | .25 |
| $250,000 | .10 | .22 |
| $500,000 | .08 | .20 |
| $1 million | .06 | .18 |
| $2.5 million | .04 | .15 |
| $5 million | .02 | .12 |
| $10 million | 0 | .10 |
| $50 million | 0 | .09 |
| $100 million | 0 | .08 |
| $250 million | 0 | .07 |
| $400 million | 0 | .06 |
| $500 million | 0 | .05 |

Pro xStocks' published base maker/taker rates are **−.02% / .10%**; institutional taker pricing can differ. This is a maker rebate, not a positive maker charge. [Kraken fee schedule](https://www.kraken.com/features/fee-schedule)

The July 2026 program can qualify using the best applicable spot/futures volume or assets-on-platform tier, subject to eligibility; assuming trading volume alone can misidentify the account tier. [Kraken's program announcement](https://blog.kraken.com/product/pro/new-kraken-pro-fee-tiers) Request the account's pair-specific response, including `fees` and `fees_maker`, proper pair/asset-class identifiers and fee currency. [Official TradeVolume API](https://docs.kraken.com/api-reference/account-data/get-trade-volume)

The code resolves fees centrally by class, through wildcard exchange/strategy/regime scope in [server/core/math/cost-model.ts:114](<C:/DawnTrader-Audit/server/core/math/cost-model.ts:114>). Boot rejects `v <= 0` at [server/startup/b72-warmup.ts:237](<C:/DawnTrader-Audit/server/startup/b72-warmup.ts:237>). Thus a legitimate zero-fee or rebate configuration cannot pass this check. A consistent simulated ledger can still be priced for the wrong product or account. Whether this account presently suffers that divergence is **HYPOTHESIS** until Q1 is answered.

For a filled long, entry price E, exit X, equal quantity q, quote-paid fee fractions fe/fx and no other costs, net = q[X(1−fx)−E(1+fe)]. Fee-only break-even movement is **X/E−1 = (1+fe)/(1−fx)−1**. Illustrative model rates yield 1.6129% taker/taker or 1.2097% maker/taker. The public Pro xStock base maker/taker illustration yields 0.08008%; taker/taker .20020%. These are fee-only movements on a filled trade, **not expected returns, all-in costs or measured opportunity rates**.

Decision friction is another object. The mid-based taker kernel uses 2f+2s+spread, priced into quote units. Maker advantage removes a fee difference and specified spread/slippage terms, before fill-probability and adverse-selection adjustments: [server/core/math/maker-taker-decision.ts:268](<C:/DawnTrader-Audit/server/core/math/maker-taker-decision.ts:268>), [server/core/math/maker-taker-decision.ts:292](<C:/DawnTrader-Audit/server/core/math/maker-taker-decision.ts:292>), [server/core/math/maker-taker-decision.ts:331](<C:/DawnTrader-Audit/server/core/math/maker-taker-decision.ts:331>). With the historical .008/.004 and s=.0005, the unadjusted maker expression can reduce to .0125 per entry notional. It is not an assertion that a venue charged 1.25% or that paper books that exact fraction.

The current generation call explicitly sets `levelGeometry: 'mid'` at [signal-orchestrator.ts:1067](<C:/DawnTrader-Audit/server/services/signal-orchestrator.ts:1067>). The adjacent September price-basis note says sided infrastructure exists but strategy levels are not yet wired to it. A capability in the library is not proof that this lane uses sided prices. Removing spread merely because the new option exists would undercharge this still-mid-derived contract.

**Evidence against overstatement:** DB-governed, per-class, fail-hard resolution is materially sounder than dispersed fee literals. Rate caches reread canonical fees; NaN tombstones discourage static-fee bypasses. The manual calls the account's Tier-1 standing verified at [SYSTEM_MANUAL.md:476](<C:/DawnTrader-Audit/1-system-manual/SYSTEM_MANUAL.md:476>); that is a source assertion, not an authenticated response inspected here, and does not by itself settle separate product applicability. The historical rate may match a crypto base tier, and a different account could lack the xStock product. Rebates also require execution eligibility, not merely a negative row. No live fee has been observed.

**Confidence:** high on the domain exclusion and mathematical distinction; conditional on account-specific mispricing; no empirical profitability confidence. **Falsifier:** Q1 plus the read-only config query; an authenticated schedule matching both classes would refute current divergence, but not the domain limitation. CODE_FALSIFIERS demonstrates that .004 passes while 0 and −.0002 fail the predicate. A wrapper that converts a negative maker fee elsewhere cannot repair this boot guard without changing its inputs/contract.

### 2. DHMA's price geometry mixes units and is not invariant to nominal price scale

**Provenance: NOT FOUND for this exact units defect; weak search outcome, not clearance. Related implementation-versus-name mismatch is FOUND-AND-LIVE. Technical disposition: legacy dimensional defect with unmeasured runtime incidence.** Exact searches `dhma|realizedVol|calculateVolatility|k_tp` covered RUNNING_ISSUES, BATCH_CATALOG and Batch Completion. Positive controls found DHMA history, including [Claude Comms and Packages/Batch Completion/BATCH_54_COMPLETION_REPORT.md:110](<C:/DawnTrader-Audit/Claude Comms and Packages/Batch Completion/BATCH_54_COMPLETION_REPORT.md:110>) (OBI/microprice implementation versus HMA description), [Claude Comms and Packages/Batch Completion/BATCH_72_2_COMPLETION_REPORT.md:36](<C:/DawnTrader-Audit/Claude Comms and Packages/Batch Completion/BATCH_72_2_COMPLETION_REPORT.md:36>) (parameter migration), and the long-only short-branch closure. Those do not establish that this units issue is already cleared.

`calculateVolatility` calculates standard deviation of fractional returns at [server/services/strategy-engine.ts:1788](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:1788>). DHMA assigns it to `realizedVol` and constructs S=P−k·realizedVol and T=P+k·realizedVol while E=P·entryPremium: [server/services/strategy-engine.ts:1546](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:1546>). There is no price multiplication or other unit conversion at these lines. The coefficient is supplied through strategy configuration, not a per-symbol dynamic price scale: [server/services/strategy-engine.ts:1392](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:1392>).

Multiply an otherwise identical price path by 100: its return standard deviation is unchanged, so the absolute target offset remains unchanged and its relative offset falls by 100. In the **hypothetical** fixture sigma=.02, k=1.5, premium=1.001, P=1 yields E=1.001, T=1.03; P=100 yields E=100.1, T=100.03, now below entry. This fixture proves a property of the formula, not a detector admission or a cause of zero trades. Shared geometry guards may reject it, which limits fills but can create price-scale-dependent attrition.

Read-only history traces the expression to DHMA's introduction, commit `95c9fd79f` (2025-10-29); subsequent short disabling and class-parameter migration did not supply this conversion. This is not attributed to the recent fee or order-book changes.

**Evidence against:** a deliberately quote-price-valued k, calibrated by symbol and rescaled with price, could make the expression dimensionally meaningful. Such a contract was not established in the inspected class-level configuration path. A DB override could make offsets large enough for some symbols; that does not establish scale coherence. A strategy can also be ineligible before this calculation. No outcome verdict is made for DHMA or any never-traded strategy.

**Confidence:** high on scale non-invariance of the implemented formula; medium-high that a unit conversion is missing rather than an undocumented price-valued parameter contract. **Falsifier:** Q13 requests k's units, resolved scopes and raw decision geometry; demonstrate a valid price-valued scaling contract at the pinned call site, or reproduce the formula under scaled inputs. The supplied arithmetic script reproduces the defect without running market data. A future correction must choose the intended volatility object before replacing it with ATR or P·sigma.

### 3. The crew's universal target-family argument is false; complete branch geometry matters more than its label

**Provenance: FOUND-AND-LIVE. Technical disposition: refutation of an open design premise; not a declaration that existing strategies are profitable.** The required proposal explicitly makes the challenged family claim at [Claude Comms and Packages/Scope Files/STRATEGY_FEE_VIABILITY_TWO_BATCH_PROPOSAL.md:33](<C:/DawnTrader-Audit/Claude Comms and Packages/Scope Files/STRATEGY_FEE_VIABILITY_TWO_BATCH_PROPOSAL.md:33>). Its later withdrawal of an invalid control and change to NOT-EXCLUDED are appropriate; neither proves the opening formula claim. Search group P2 and that proposal's full correction tail were checked.

VWAP's ordinary branch is:
- E=P+aA;
- S=min(VWAP−bA, L24+cA);
- T=max(H24−dA, E+r(E−S)).

See [server/services/strategy-engine.ts:237](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:237>), [server/services/strategy-engine.ts:254](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:254>) and [server/services/strategy-engine.ts:259](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:259>). In the VWAP-stop sub-branch, target distance on the R arm is r[P−VWAP+(a+b)A], so its ATR derivative is **r(a+b)>0** for positive coefficients. Even when the R arm wins, ATR can extend the target. The override branch S=E−kA, T=E+r·kA also expands. Hypothetical fixed anchors P=100,VWAP=99,L=99,H=101 and a=.1,b=.5,c=.1,d=.25,r=2 give T=103.3 at A=1 and T=104.6 at A=2. This directly refutes “volatility never flows to target” on that branch. It does not establish how frequently a branch wins in production.

The full 19-strategy geometry inventory follows. P=current price; A=the ATR admitted by the strategy/helper; positive letters denote configured buffers/multipliers, **not observed runtime values**. Structural anchors are held fixed only for partial-derivative arguments. In real data they co-move with volatility. Targets are native generator levels before grid, guard, refresh and fill changes.

| Strategy | Implemented geometry and dependence | Source |
|---|---|---|
| vwap_pullback | E=P+aA; ordinary S=min(VWAP−bA,L24+cA), T=max(H24−dA,E+r(E−S)); override S=E−kA,T=E+r(E−S). Piecewise ATR expansion or structural branch. | [server/services/strategy-engine.ts:237](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:237>) |
| abcd_long | E=C-high+aA; S=C-low−bA; fixed-percent exit option or T=min(E+AB,E+r(E−S)). ATR affects the R arm until the measured-move cap binds. | [server/services/strategy-engine.ts:378](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:378>) |
| sma_trend_ride | E=P·premium; S=min(recent-low·m,SMA·m); T either E+(E−S)r or E·(1+k·trendStrength). Trend strength is an adjacent-uptick fraction, not move magnitude. Structural stop anchors can move with volatility. | [server/services/strategy-engine.ts:516](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:516>), [server/services/strategy-engine.ts:1320](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:1320>) |
| breakout | E=range-high·(1+buffer)·premium; S=range-low·m; T=E+range-height. Range expansion can extend distance without an explicit ATR target term. | [server/services/strategy-engine.ts:645](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:645>) |
| mean_reversion | E=P·premium; S=P·(1−buffer); T=selected mean·below-mean factor. Remaining distance to the selected SMA/VWAP/midpoint, not a volatility promise. | [server/services/strategy-engine.ts:748](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:748>) |
| range_trade | Entry zone mixes range/ATR and caps it; E=P+aA; S=range-low−bA; T=range-high−cA. At fixed range/P, target distance shrinks with ATR by (a+c)A. This part of the crew concern survives. | [server/services/strategy-engine.ts:849](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:849>) |
| vwap_bounce | E=P·m; S=VWAP·m; T=E+r(E−S). Geometry changes with P/VWAP; no direct ATR target term. | [server/services/strategy-engine.ts:958](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:958>) |
| liquidity_trap | Short-shaped E at range re-entry, S above breakout, T near range-low. Explicitly disabled in active/VTS long-only routing; not evidence of a live short order or a losing strategy. | [server/services/strategy-engine.ts:1061](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:1061>), [server/services/vts-runner.ts:510](<C:/DawnTrader-Audit/server/services/vts-runner.ts:510>) |
| dhma | E=P·premium; S=P−k·sigma(return); T=P+k·sigma(return). Finding 2 applies; not ordinary ATR geometry. | [server/services/strategy-engine.ts:1546](<C:/DawnTrader-Audit/server/services/strategy-engine.ts:1546>) |
| adaptive_flow | E=P·1.001; S=min(pattern-low·(1−b),E−kA); T=E+kA. | [server/strategies/adaptive-flow.ts:163](<C:/DawnTrader-Audit/server/strategies/adaptive-flow.ts:163>) |
| morning_star | E=P·1.001; S=min(star/first-bar lows)·(1−b); T=E+kA. | [server/strategies/morning-star.ts:168](<C:/DawnTrader-Audit/server/strategies/morning-star.ts:168>) |
| reverse_impulse | E=P·1.001; S=pinbar-low·(1−b); T=E+kA. | [server/strategies/reverse-impulse.ts:173](<C:/DawnTrader-Audit/server/strategies/reverse-impulse.ts:173>) |
| inside_bar_reversal | E=parent-high·(1+b); S=parent-low·(1−b); T=E+kA. | [server/strategies/inside-bar-reversal.ts:188](<C:/DawnTrader-Audit/server/strategies/inside-bar-reversal.ts:188>) |
| pivot_shift | E=P·1.001; S=max(recent-three-low,E−kA); T=E+kA. | [server/strategies/pivot-shift.ts:169](<C:/DawnTrader-Audit/server/strategies/pivot-shift.ts:169>) |
| support_bounce | E=P·1.001; S=support·(1−b); T=E+kA. | [server/strategies/support-bounce.ts:262](<C:/DawnTrader-Audit/server/strategies/support-bounce.ts:262>) |
| volatility_edge | E=C-high·(1+b); S=C-low·(1−b); T=min(C-low+(B-high−A-low)k,E+kA). ATR extension is capped by the measured move. | [server/strategies/volatility-edge.ts:181](<C:/DawnTrader-Audit/server/strategies/volatility-edge.ts:181>) |
| defensive_hedge | Long bullish-pattern entry P·1.001; stop below engulfing low; T=E+kA. Low BTC correlation is an eligibility condition, not a short hedge. | [server/strategies/defensive-hedge.ts:231](<C:/DawnTrader-Audit/server/strategies/defensive-hedge.ts:231>) |
| strong_bull_trend | Positive DBS/directional breakout conditions; E=close; S=E−kA; T=E+kA. Prior Donchian window excludes current bar. | [server/strategies/strong-bull-trend.ts:133](<C:/DawnTrader-Audit/server/strategies/strong-bull-trend.ts:133>) |
| orb | Long breakout only: E=P; S=opening-range low; T=E+k·opening-range height. Downward breakout rejected. | [server/strategies/orb.ts:277](<C:/DawnTrader-Audit/server/strategies/orb.ts:277>) |

ATR itself is bounded by the helper's minimum/cap [server/strategies/strategy-helpers.ts:328](<C:/DawnTrader-Audit/server/strategies/strategy-helpers.ts:328>). Shared guards enforce valid geometry and stop distance, with active/VTS differences in RR/reach handling at [server/strategies/strategy-helpers.ts:409](<C:/DawnTrader-Audit/server/strategies/strategy-helpers.ts:409>). Thus “ATR appears in the formula” does not imply unlimited extension or passing admission.

**Evidence against:** the subtractive range target really can compress headroom; fixed-percent targets can remain small; measured targets can be uneconomic after costs. A positive derivative is not a profitable trade: widening the stop can increase losses and reduce payoff probability, and distant levels may never be reached. The supplied archive's missing targets prevents historical branch/decline attribution. A six-of-nineteen never-traded statement from the assignment is not a reviewed outcome sample.

**Confidence:** high on complete formulas and the universal-claim refutation; no confidence assigned to realized branch frequencies. **Falsifier:** reproduce the stated max/min branches, then use Q6–Q7 for prospective operand/winner capture. A production census could establish the common branch, but cannot rescue a universal mathematical claim contradicted by an implemented branch.

### 4. The kernel is an uncalibrated barrier-payoff proxy; “flat pWin” is not the implemented contract of the inspected callers

**Provenance: FOUND-AND-LIVE** for calibration/DI meaning (#399, #502); **FOUND-AND-CLOSED** for B8.5a's replacement of finalScore in maker signalStrength and B8.5c's former friction-units defect. **Technical disposition: working provisional model requiring calibration and a documentation/contract correction.** This review does not refile the repaired VTS units defect. See [1-system-manual/RUNNING_ISSUES.md:2838](<C:/DawnTrader-Audit/1-system-manual/RUNNING_ISSUES.md:2838>), [1-system-manual/RUNNING_ISSUES.md:344](<C:/DawnTrader-Audit/1-system-manual/RUNNING_ISSUES.md:344>) and [Claude Comms and Packages/Batch Completion/P19_B8_5c_COMPLETION_REPORT.md:11](<C:/DawnTrader-Audit/Claude Comms and Packages/Batch Completion/P19_B8_5c_COMPLETION_REPORT.md:11>).

The kernel computes p=min(maxP,max(minP,minP+DI/factor)) or, on the strong-trend source pool, minP+|DBS|/2 with the same clamp; then EV=p·|T−E|−(1−p)·|E−S|−cost. See [server/core/calculations/net-expectancy-kernel.ts:99](<C:/DawnTrader-Audit/server/core/calculations/net-expectancy-kernel.ts:99>). Defaults .40/.60/200 are code seed parameters, **not current DB values**. There is no target/stop-distance, elapsed-time, fill-state or TEC-policy conditioning in that p calculation. VolNoise is not used by this kernel's formula.

The inspected orchestrator passes per-class `scoring_base.flat_pwin_base` as **signalStrength** to the maker/taker haircut at [server/services/signal-orchestrator.ts:1091](<C:/DawnTrader-Audit/server/services/signal-orchestrator.ts:1091>); it separately supplies the kernel's min/max/factor. The wrapper likewise reads kernel configuration at [server/core/calculations/expectancy.ts:643](<C:/DawnTrader-Audit/server/core/calculations/expectancy.ts:643>). B8.5a correctly describes the signalStrength replacement in objective 1 and separately records actual kernel pWin in objective 2, but its later prose says pWin is flat and ranking discriminates on geometry/friction alone: [Claude Comms and Packages/Batch Completion/P19_B8_5a_COMPLETION_REPORT.md:15](<C:/DawnTrader-Audit/Claude Comms and Packages/Batch Completion/P19_B8_5a_COMPLETION_REPORT.md:15>), [Claude Comms and Packages/Batch Completion/P19_B8_5a_COMPLETION_REPORT.md:26](<C:/DawnTrader-Audit/Claude Comms and Packages/Batch Completion/P19_B8_5a_COMPLETION_REPORT.md:26>). Those are different objects. With seed parameters, DI 0/10/40 produces .40/.45/.60 regardless of a fixed signalStrength. If the actual DB floor equals ceiling, pWin could be flat in practice; the report does **not** assert operational variation without Q8.

This distinction is economically consequential: moving only T farther away increases this EV by p·deltaT while the assigned p is unchanged. It is a valid algebraic proxy, not proof of extra attainable edge. Actual TEC-managed outcomes include trailing, break-even, execution slippage, maker expiry and uncapped open positions; they are not simply the two fixed barrier payoffs assumed by this formula. Calibration against a mismatched closed-only label can reinforce the wrong object.

#502 already records the cross-class DI semantic problem: crypto straightness versus xStock signed movement. A dimensionless output does not establish comparable predictive meaning. Applying |DBS| also removes sign in the kernel; long-direction eligibility must be carried by upstream routing and detector checks.

**Evidence against:** centralizing the kernel and carrying its decomposition fixes a real drift class; friction is correctly converted from rate to price units in [server/core/calculations/expectancy.ts:635](<C:/DawnTrader-Audit/server/core/calculations/expectancy.ts:635>). A provisional prior can be useful without a learned model. The code need not contain a probability estimator to have economic edge, and a DB calibration might already improve these coefficients. The source cannot establish miscalibration frequency or empirical loss.

**Confidence:** high on the separate signalStrength/pWin paths; high on missing geometry/horizon dependence in this kernel; empirical accuracy unknown. **Falsifier:** Q8 must export both resolved parameter sets and actual per-decision pWin; Q11 must connect label, applied calibration and later decision. A later runtime override producing flat pWin would narrow the prose discrepancy but would not turn a barrier prior into a validated TEC-outcome predictor. The supplied arithmetic script tests only the seed-parameter identity.

### 5. R ranking and fixed-notional allocation can optimize different objectives

**Provenance: FOUND-AND-LIVE** (#399 selection/calibration); **FOUND-AND-CLOSED** for R ranking and Kyle's fixed-notional restoration. **Technical disposition: deliberate choices whose combined economic objective needs an explicit decision, plus known geometry fallback debt.** R ranking was deliberately introduced in [Claude Comms and Packages/Batch Completion/P19_B7_1_COMPLETION_REPORT.md:18](<C:/DawnTrader-Audit/Claude Comms and Packages/Batch Completion/P19_B7_1_COMPLETION_REPORT.md:18>). The current sizing implementation explicitly records Kyle's August fixed-notional decision; source history includes `213e162dc`. No Kelly or wider risk allocation is recommended by default.

The R ranker uses chosen net EV divided by absolute stop distance, with a degenerate-risk floor and descending sort: [server/core/rtb/ready_to_buy_service.ts:1795](<C:/DawnTrader-Audit/server/core/rtb/ready_to_buy_service.ts:1795>), [server/core/rtb/ready_to_buy_service.ts:1807](<C:/DawnTrader-Audit/server/core/rtb/ready_to_buy_service.ts:1807>), [server/core/rtb/ready_to_buy_service.ts:1861](<C:/DawnTrader-Audit/server/core/rtb/ready_to_buy_service.ts:1861>), [server/core/rtb/ready_to_buy_service.ts:1884](<C:/DawnTrader-Audit/server/core/rtb/ready_to_buy_service.ts:1884>). Ranking is DB-selectable; the current active ranker is unobserved.

The sizer forms a total exposure budget from portfolio value, a fixed per-position notional fraction and a buffer, then q=notional/E, with a correlation reduction: [server/services/active-position-sizing.ts:225](<C:/DawnTrader-Audit/server/services/active-position-sizing.ts:225>). Stop distance is validated, but no longer determines the base quantity. For fixed N, expected quote P&L is N·EV/E. Ranking EV/|E−S| is equivalent only under additional constraints on stop fraction or a matching risk allocation objective.

Hypothetical equal N=1000: candidate A has net return .5% and stop fraction .5%, so R=1 and expected quote P&L=5; B has .8% and 2%, so R=.4 and expected quote P&L=8. R chooses A. This is an objective counterexample, **not evidence that B is preferable under tail-risk, concentration or duration constraints**. A scarce slot can also be occupied by a pending maker or a long-lived position; neither simple ratio captures calendar opportunity cost.

There is a separate known risk to interpreting comparisons as identical geometry: the target fallback E·1.02 is present in rMultipleCore at [server/core/rtb/ready_to_buy_service.ts:1794](<C:/DawnTrader-Audit/server/core/rtb/ready_to_buy_service.ts:1794>). #927 and its September 5 amendment already reject the “identical candidate basis” defense when only missing-target candidates receive this fabricated level: [1-system-manual/RUNNING_ISSUES.md:5927](<C:/DawnTrader-Audit/1-system-manual/RUNNING_ISSUES.md:5927>). #930 separately addresses string truthiness. The live queue is not a historical incidence instrument; the documented n=1 attempt is not a zero-rate finding.

**Evidence against:** risk efficiency is a defensible objective and the rank floor limits tiny-stop inflation. Correlation, hard exposure and slot checks constrain actual allocation. Runtime may select another ranker. Duration alone is not an edge; choosing rapid losers would worsen the objective.

**Confidence:** high on conditional objective non-equivalence and code geometry fallback; runtime materiality unknown. **Falsifier:** Q5/Q8/Q9 must provide active ranker, same-cycle inputs, applied quantity/clamps, waiting/holding time and actual decisions. If all effective stop fractions were equal, the simple ranking conflict would disappear in that population. Evaluate any alternative only in a future shadow book with the same capital, universe and risk constraints.

### 6. Simulations expose distinct economic objects; several favorable assumptions remain, and caps forbid a closed-only horizon verdict

**Provenance: FOUND-AND-CLOSED** for the simplified maker lifecycle, max-hold arm decisions, order-book/accounting corrections and ranking-shadow contract. **Technical disposition: intentional simulation assumptions and instrument limits; explicit challenge to overinterpreting them as live fidelity.** See [Claude Comms and Packages/Batch Completion/P19_B7_2c_COMPLETION_REPORT.md:1](<C:/DawnTrader-Audit/Claude Comms and Packages/Batch Completion/P19_B7_2c_COMPLETION_REPORT.md:1>), [Claude Comms and Packages/Batch Completion/P19_B8_5J_COMPLETION_REPORT.md:1](<C:/DawnTrader-Audit/Claude Comms and Packages/Batch Completion/P19_B8_5J_COMPLETION_REPORT.md:1>), and shadow schema [shared/schema.ts:2162](<C:/DawnTrader-Audit/shared/schema.ts:2162>). Search group P5 follows the named closure history. This is not a simulation-realism verdict.

The inspected favorable-assumption inventory is:

| Assumption / object | Implementing evidence | Direction, bound and control |
|---|---|---|
| Maker entry fills at its limit on a sampled price at/through it; equality qualifies. | [server/core/trading/pending-maker-logic.ts:22](<C:/DawnTrader-Audit/server/core/trading/pending-maker-logic.ts:22>), [server/core/trading/pending-maker-logic.ts:59](<C:/DawnTrader-Audit/server/core/trading/pending-maker-logic.ts:59>) | No queue-ahead depletion or latency proof. Conditional limit price is exact, but favorable fill inclusion can select the wrong population. Compare independent timestamped trades/depth, retain never-fills. Live fill probability remains unknown. |
| If a sample both crosses and arrives after deadline, fill wins. | [server/core/trading/pending-maker-logic.ts:48](<C:/DawnTrader-Audit/server/core/trading/pending-maker-logic.ts:48>) | Deliberately ratified. A post-deadline observation does not identify when crossing first occurred. Bound with pre/post-deadline event observations; do not call it a newly discovered timeout bug. |
| Taker opens walk asks, reject empty books and can partially fill. | [server/services/execution/order-placer.ts:63](<C:/DawnTrader-Audit/server/services/execution/order-placer.ts:63>) | Important adverse/realistic control, not blanket optimism. A sampled book still assumes usable liquidity and no latency/impact beyond that model. Capture requested/filled size and book age. |
| Paper taker closes always fully fill, including beyond depth. | [server/services/execution/order-placer.ts:98](<C:/DawnTrader-Audit/server/services/execution/order-placer.ts:98>) | Beyond-book penalty is an assumption, not observed supply. Cold-book fallback uses requested price minus penalty; missing config uses requested price with zero modeled close slippage and an error log. Cost bias is unbounded without market constraints; compare fresh quotes and explicit shortfall intervals. |
| Resting maker exits use exact limit and maker fee. | [server/services/active-execution-engine.ts:2417](<C:/DawnTrader-Audit/server/services/active-execution-engine.ts:2417>) | Lower charge is conditional on a simulated fill; queue/adverse selection unknown. Include stale/pending exits, stop overrides and taker fallback, not only successful targets. |
| Static/default slippage and cached spreads in expected/passive costs. | [server/core/math/cost-model.ts:227](<C:/DawnTrader-Audit/server/core/math/cost-model.ts:227>), [server/asset_classes/xstock_spot/friction.ts:37](<C:/DawnTrader-Audit/server/asset_classes/xstock_spot/friction.ts:37>) | A fixed fraction can under- or overstate cost by instrument/size/time. Do not equate static expected friction with active book-walk shortfall. Capture both, preserving units and anchors. |
| Trigger-level pricing in evaluator/passive branches. | [server/services/tec-evaluator.ts:270](<C:/DawnTrader-Audit/server/services/tec-evaluator.ts:270>), [server/services/tec-evaluator.ts:373](<C:/DawnTrader-Audit/server/services/tec-evaluator.ts:373>) | Stop/target clamping can ignore overshoot; timeout precedence and trailing branches differ. Active taker closes subsequently replace trigger quote with execution-model fill at [server/services/active-execution-engine.ts:2438](<C:/DawnTrader-Audit/server/services/active-execution-engine.ts:2438>). Do not project a passive clamp onto every active close. |
| Ranking shadow charges zero friction. | [server/services/vts-runner.ts:929](<C:/DawnTrader-Audit/server/services/vts-runner.ts:929>), [server/services/vts-runner.ts:3827](<C:/DawnTrader-Audit/server/services/vts-runner.ts:3827>) | Stored “net” is fee-free gross in this arm. Its decision rank was fee-aware. Recompute raw ratios; never merge its net label with active net P&L. |
| Idealized exit availability outside normal underlying sessions or through feed stalls. | Close fallback above; xStock tick admission [server/asset_classes/xstock_spot/active-dispatch.ts:181](<C:/DawnTrader-Audit/server/asset_classes/xstock_spot/active-dispatch.ts:181>) | Freshness checks at entry do not guarantee continuous exit liquidity. Session gaps/suspensions need raw price/depth evidence, not an assumption that token and underlying execution are equivalent. |
| Witness independence. | [server/services/active-execution-engine.ts:2474](<C:/DawnTrader-Audit/server/services/active-execution-engine.ts:2474>) | A same-upstream xStock witness tests consistency, not independent truth. Crypto's separate comparator also needs producer/clock provenance. |
| Closed-only success labels omit waiting and unresolved exposure. | Pending schema [shared/schema.ts:1967](<C:/DawnTrader-Audit/shared/schema.ts:1967>); active/passive cap code below | Bias can be large in either direction. Include all admission intents, maker drops, open positions and terminal marks; do not treat nonfill as a winning zero-return trade. |

**Accounting soundness:** current active realized P&L is constructed from actual modeled entry/exit prices and quantity minus explicit fees at [server/services/active-execution-engine.ts:2507](<C:/DawnTrader-Audit/server/services/active-execution-engine.ts:2507>). Slippage already embedded in those fills must not be deducted a second time. The old gross/cost presentation can telescope to the same net; a changed denominator or more honest gross label alone does not prove worsening economics. Q3 requests raw recomputation and anchors, not acceptance of stored labels.

**Arms and censoring.** Real passive VTS has a 7-day maximum constant at [server/services/vts-runner.ts:1149](<C:/DawnTrader-Audit/server/services/vts-runner.ts:1149>); ranking shadows have a 48-hour maximum at [server/services/vts-runner.ts:780](<C:/DawnTrader-Audit/server/services/vts-runner.ts:780>) with a historical 6-hour arm supplied by the assignment. Active paper/live max-hold was deliberately disabled in supplied configuration; the source has the switch, not proof of today's DB values. B8.5j records the decision. Distinguish real VTS, twins, rank shadows, filled active, pending/never-filled and pre-fix sensitivity rows. A cap-triggered exit is a model outcome under that cap; observation end is administrative right-censoring; neither proves the uncapped natural completion time. Competing stop/target/other exits are separate outcomes. An active close-time average is not the survival curve of all admissions.

**Ranking instrument discipline.** Every pairing row is simulated. `promoted` means top-N selected, not executed, and `promoted_trade_id` is unwritten by the reviewed contract. Use membership rank 0 versus ranks 1..N **within the same cycle_key**, after complete-pool checks and restricting each member to a shadow first opened in that cycle. Require an eligible rank 0 and at least one eligible rival. Publish usable distinct cycle/shadow n and all exclusion counts **before outcomes**. Do not drop unresolved rivals to make a complete-case contest. Capacity/warm-up periods have no capture by construction; all inferences are conditional on this captured subset.

Discard derived outcome labels. Recompute long-only (X−E)/E and (X−E)/(E−S) from valid positive long geometry; the second ratio uses the signed positive long risk denominator. The supplied pairing inventory lacks quantity/side/direction/fees/notional, whereas its real-trade positive control has eight relevant fields. Do not back size out of gross P&L or invent a dollar comparison. The executable schema inventory checks rather than presumes this control.

**Prescribed interpretation retained:** a ranker tie/loss is **INCONCLUSIVE**, never ranker failure. A win supports the brief's prescribed one-sided lower-bound instrument, subject to its population restrictions. There is a separate **HYPOTHESIS / mathematical objection** that differential costs can reverse gross ordering: hypothetical returns A=.020,B=.019 and costs A=.018,B=.005 yield net .002 versus .014. Therefore an unconditional claim of *net economic* lower-bound superiority additionally needs evidence that the cost difference cannot overturn the margin. This is an explicit challenge requiring Q1/Q5/Q10 evidence, not a replacement with a naive net/gross contest. No actual shadow outcome has been scored here.

**Evidence against:** asks/bids, partial opens, explicit never-fills, exact fee legs, stale-price controls and cap switches are meaningful improvements. Conservative exit penalties can overstate losses. A fee-aware selector compared using fee-free alternatives may indeed be disadvantaged under verified restrictions. Neither historical red results nor that intuition establishes the needed bound.

**Confidence:** high on model semantics and inference limits; unknown on net bias magnitude, causal performance change or live fidelity. **Falsifier:** raw reconciliation Q3/Q4/Q10, schema/rank controls Q5, exact cap/config eras Q2/Q8. Any observed valid depth/queue evidence that contradicts a particular favorable assumption narrows that row; it cannot certify all simulated execution.

### 7. Market-condition calculations do change reachable decisions; some confidence work is deliberately telemetry, and indirect feedback survives

**Provenance: FOUND-AND-LIVE** for calibration/consumer questions (#399/#502 and AMR work); **FOUND-AND-CLOSED** for score-gate retirement, post-selection confidence ablation and repaired refresh inputs. **Technical disposition: mixed purposeful controls and provisional calibration, not “all indicators are unused.”** The B8.5a closure explicitly retires finalScore gating but retains other controls at [Claude Comms and Packages/Batch Completion/P19_B8_5a_COMPLETION_REPORT.md:19](<C:/DawnTrader-Audit/Claude Comms and Packages/Batch Completion/P19_B8_5a_COMPLETION_REPORT.md:19>). Historical B5 shadow enforcement is not evidence of today's mode.

This inventory names the visible producer, read site and decision consequence. “Can change” means source reachability, not verified runtime enforcement.

| Quantity / scale | Producer → reader | Reachable consequence / limit |
|---|---|---|
| Pair return volatility, momentum, DX, DBS | MCE → [server/core/metrics/market-regime.ts:231](<C:/DawnTrader-Audit/server/core/metrics/market-regime.ts:231>) → canonical regime strategy map | Changes the regime and eligible strategy set. DX is the implemented directional-movement statistic; the name ADX is not proof of Wilder smoothing. |
| Pair regime confidence | Classifier composition [server/core/metrics/market-regime.ts:333](<C:/DawnTrader-Audit/server/core/metrics/market-regime.ts:333>) → AMR confidence floor and emitted regime context | Can change an enforcing AMR verdict. It is not the same as finalScore or the later modulated chain. Effective gates depend on DB settings. |
| Pair DI and source-pool DBS magnitude | MCE/queued signal → kernel [server/core/calculations/net-expectancy-kernel.ts:106](<C:/DawnTrader-Audit/server/core/calculations/net-expectancy-kernel.ts:106>) | Changes pWin/EV and conditional R ranking, even if flat signalStrength is used. Sign is lost on the magnitude path; upstream long checks matter. |
| ATR / structural ranges | OHLC inputs → strategy formulas and helper [server/strategies/strategy-helpers.ts:328](<C:/DawnTrader-Audit/server/strategies/strategy-helpers.ts:328>) | Changes detect/entry/stop/target, shared guards and trailing geometry. ATR caps/floors can erase input variation. |
| Price/spread/depth | Cost resolver; maker/taker [server/core/math/maker-taker-decision.ts:268](<C:/DawnTrader-Audit/server/core/math/maker-taker-decision.ts:268>); order placer | Changes EV, maker choice, open fill/size, exit shortfall. Quote level, smoothed indicator input and executable price are different anchors. |
| Global per-class regime votes / DBS / flip rates | MCE per-class caches → AMR weather | Can alter weather score and mode; needs source timestamps and minimum-N/cold status. Shared market observations are not automatically cross-mode leakage. |
| Friction stability, absolute DBS, regime flips, EV-gap, macro trend | [server/services/amr-weather-report.ts:210](<C:/DawnTrader-Audit/server/services/amr-weather-report.ts:210>) → weighted score, caps and hysteresis | Changes AMR mode; missing macro limits favorable classification, hostile/missing inputs affect caps. DB weights/thresholds/dwell determine magnitude. |
| AMR mode and enforcement flag | [server/core/governance/amr-gates.ts:107](<C:/DawnTrader-Audit/server/core/governance/amr-gates.ts:107>) → SQE [server/core/filters/signal_quality_evaluator.ts:422](<C:/DawnTrader-Audit/server/core/filters/signal_quality_evaluator.ts:422>) | Enforcing mode can block hard pause, family/pool/confidence/slot conditions. Shadow mode records a would-change result. Null context is fail-closed only on the enforcing branch. |
| Regime weight | SQE [server/core/filters/signal_quality_evaluator.ts:367](<C:/DawnTrader-Audit/server/core/filters/signal_quality_evaluator.ts:367>) | Can still reject below its floor; retirement of finalScore does not remove this gate. |
| finalScore / later modulated confidence | SQE shadow logging; post-queue chain [server/services/signal-orchestrator.ts:1476](<C:/DawnTrader-Audit/server/services/signal-orchestrator.ts:1476>), [server/services/signal-orchestrator.ts:1795](<C:/DawnTrader-Audit/server/services/signal-orchestrator.ts:1795>) | The inspected final chain is computed after queueing and emitted as analysis. It cannot retroactively size or admit that already queued signal through these reads. Its presence is not proof of a dead mandatory control. |
| Outcome feedback / EV-gap | VTS close [server/services/vts-service.ts:1136](<C:/DawnTrader-Audit/server/services/vts-service.ts:1136>) → class-level AMR EV-gap tracker | An indirect decision route exists even with source/mode-partitioned outcome feedback. VTS labels can influence weather; source partitioning is not proof of total causal isolation. |

**Exact regime branches.** Define v=standard deviation of returns, d=DX, b=|DBS|, m=lookback return and u=runtime `b68_5PathBMomentumMin`. Precedence is RBS, then IE, then TFS, then HVU, else ST. All strict/non-strict signs below are part of the implementation; equality can move a boundary point to a later branch. Static class constants are separate from DB-controlled lookbacks/confidence scales/u.

| Branch | Crypto constants substituted | xStock constants substituted |
|---|---|---|
| RBS | v<.012 AND d<45 AND b<.10 | v<.0037 AND d<17 AND b<.16 |
| IE | (v>.020 AND d>55) OR (v>.015 AND b>=.50) | (v>.0059 AND d>19) OR (v>.0045 AND b>=.51) |
| TFS | (m>.003 AND d>50) OR (b>=.30 AND m>u) | (m>.0024 AND d>17) OR (b>=.35 AND m>u) |
| HVU | (v>.015 AND m<−.003) OR (d>60 AND m<−.005) | (v>.0045 AND m<−.0010) OR (d>22 AND m<−.0021) |
| ST | Remaining cases | Remaining cases |

Sources: [server/core/metrics/market-regime.ts:296](<C:/DawnTrader-Audit/server/core/metrics/market-regime.ts:296>), [server/asset_classes/crypto_spot/regime-thresholds.ts:16](<C:/DawnTrader-Audit/server/asset_classes/crypto_spot/regime-thresholds.ts:16>), [server/asset_classes/xstock_spot/regime-thresholds.ts:39](<C:/DawnTrader-Audit/server/asset_classes/xstock_spot/regime-thresholds.ts:39>). IE can be strongly downward because its condition uses magnitude and has no positive momentum requirement. That is a category definition, not evidence a long entry fires; the detector still has to accept. TFS's earlier DBS-slope condition was deliberately replaced by momentum (B70.3); do not propose restoring the stale rule based on its old name. TFS confidence multiplies clipped momentum, DBS and inverse-volatility factors, then macro and final clamp apply. Other confidence branches retain numeric scale assumptions; current calibration validity on each class is unmeasured.

**Routing.** The base roster in [server/config/canonical-regime-strategy-map.ts:55](<C:/DawnTrader-Audit/server/config/canonical-regime-strategy-map.ts:55>) is: TFS—VWAP pullback, morning star, pivot shift, strong bull; HVU—mean reversion, reverse impulse, defensive hedge, inside-bar reversal; RBS—range, support bounce, ABCD, adaptive flow; IE—SMA, breakout, VWAP bounce, volatility edge, DHMA, strong bull, ORB; ST—liquidity trap, pivot shift, morning star, ORB. Apply class overrides at [server/config/canonical-regime-strategy-map.ts:398](<C:/DawnTrader-Audit/server/config/canonical-regime-strategy-map.ts:398>): crypto excludes ORB; xStocks excludes defensive hedge, removes ORB from ST and adds it to TFS. Liquidity trap remains disabled separately. Strong bull's exclusion from **favored** lists does not make it ineligible: materialized family eligibility and favored lists differ. Actual per-strategy enablement is another runtime axis.

**Freshness and shared-state qualification.** RTB refresh obtains fresh vol/ADX through a pure regime-input path, but carries queued geometry/DBS while recomputing cost/EV, throttled by allowed refresh timing: [server/core/rtb/ready_to_buy_service.ts:742](<C:/DawnTrader-Audit/server/core/rtb/ready_to_buy_service.ts:742>), [server/core/rtb/ready_to_buy_service.ts:776](<C:/DawnTrader-Audit/server/core/rtb/ready_to_buy_service.ts:776>). Thus “refreshed EV” need not mean “new strategy setup.” The registry's duplicate refresher was closed; the reviewed boot has one active refresh service entry point. Mode/class scoped risk and MCE state must be distinguished from intentionally shared market data. The crypto scan chooses an active mode once in its cycle at [server/services/fx5-scanner.ts:555](<C:/DawnTrader-Audit/server/services/fx5-scanner.ts:555>); this is not proof of full simultaneous paper/live fan-out. xStock active dispatch is explicitly paper/class gated at [server/asset_classes/xstock_spot/active-dispatch.ts:140](<C:/DawnTrader-Audit/server/asset_classes/xstock_spot/active-dispatch.ts:140>). Neither name “active” nor a mode flag alone proves a live order path.

**Evidence against:** market context has multiple concrete consumers and missing-data controls; post-selection computation can be useful ablation instrumentation. Source shows deliberate repairs to side-effectful refresh and mode state. OHLC-derived redundancy is not automatically useless, and independent macro inputs can add information. Runtime benefits require actual would-change/effective decisions and forward outcomes.

**Confidence:** high on the cited producer/consumer links and category inequalities; no empirical lift or enforcement-frequency claim. **Falsifier:** Q8 per-decision input ages, resolved flags and effective actions; Q11 an outcome-to-coefficient-to-decision lineage. A live shadow flag invalidates an enforcement claim for that window, not the existence of the control. A changed timestamp with unchanged structural anchors must not be counted as a newly detected opportunity.

### 8. The hard envelope has real admission controls, but its daily-loss promise is narrower than total economic drawdown

**Provenance: FOUND-AND-LIVE** for unrealized loss (#303), invalid/missing-config concerns (#519), reset semantics (#632) and failure observability (#634); **FOUND-AND-CLOSED** for paper kill workflow, fixed sizing and paper realized-loss SQL aggregation (#618). **Technical disposition: known risk-policy decisions and operational limitations; no default risk relaxation.** Source/history evidence against rediscovering already fixed bounds is included.

The active path sizes before queueing at [server/services/signal-orchestrator.ts:802](<C:/DawnTrader-Audit/server/services/signal-orchestrator.ts:802>) and rechecks promotion constraints. Max-open logic and a promotion latch appear at [server/services/active-execution-engine.ts:3114](<C:/DawnTrader-Audit/server/services/active-execution-engine.ts:3114>). The reviewed safety chain checks kill state, valid long stop, duplicate asset, cooldown, position cap, max trades, total exposure and correlation; paper inventory includes pending/open commitments. See [server/services/trade-safety.ts:97](<C:/DawnTrader-Audit/server/services/trade-safety.ts:97>), [server/services/trade-safety.ts:133](<C:/DawnTrader-Audit/server/services/trade-safety.ts:133>), [server/services/trade-safety.ts:690](<C:/DawnTrader-Audit/server/services/trade-safety.ts:690>). Quantity-times-entry exposure and projected addition are checked at [server/services/trade-safety.ts:653](<C:/DawnTrader-Audit/server/services/trade-safety.ts:653>). Per-mode risk concentration state is intentional isolation, not one global paper/live position map.

Fixed-notional sizing still refuses nonfinite/invalid balance and required parameters. It does **not** make stop-loss dollars constant: a wider stop at the same notional raises planned loss. Longer holding also consumes exposure/slots and increases gap opportunity. All proposals below retain cap/slot/correlation/kill settings and reject opportunities that cannot fit the approved envelope; no invisible wider stop or larger allocation is introduced.

The daily-loss snapshot uses realized closed P&L over max(session start, trailing 24 hours), relative to portfolio value: [server/services/daily-loss-budget.ts:110](<C:/DawnTrader-Audit/server/services/daily-loss-budget.ts:110>). It triggers on closes while active at [server/services/daily-loss-budget.ts:283](<C:/DawnTrader-Audit/server/services/daily-loss-budget.ts:283>). Open mark-to-market losses are outside that numerator. #303 records this limitation at [1-system-manual/RUNNING_ISSUES.md:2767](<C:/DawnTrader-Audit/1-system-manual/RUNNING_ISSUES.md:2767>); #632 records session-reset semantics in the inspected amendment. This is not a continuous total-equity drawdown circuit breaker, and resetting/session anchoring must not be advertised as a continuous rolling-loss guarantee.

The kill routine persists the flag, turns active context off, clears candidates and calls paper stop/flatten. Its live branch logs that live flatten integration is future Phase-21 work rather than implementing it here: [server/services/guardrail-policy.ts:501](<C:/DawnTrader-Audit/server/services/guardrail-policy.ts:501>), [server/services/guardrail-policy.ts:530](<C:/DawnTrader-Audit/server/services/guardrail-policy.ts:530>), [server/services/guardrail-policy.ts:539](<C:/DawnTrader-Audit/server/services/guardrail-policy.ts:539>). This audit does not certify a live kill path from paper tests.

Failure direction varies by operation. Missing cooldown state and the total-exposure catch can allow continuation at [server/services/trade-safety.ts:213](<C:/DawnTrader-Audit/server/services/trade-safety.ts:213>) and [server/services/trade-safety.ts:670](<C:/DawnTrader-Audit/server/services/trade-safety.ts:670>). Earlier sizing/guardrail checks limit some reachability; a caught failure is not proof a forbidden order executed. Daily-loss evaluation catches/logs failures, with known observability follow-up (#634), and nonfinite P&L sanitization can hide a bad input as zero within the helper. Missing/invalid config runtime incidents remain hypotheses. A missing position-cap balance path is not a universal bypass when the upstream sizer has already rejected invalid balance.

**Evidence against:** the old bounded-list realized-loss aggregation was replaced by paper SQL SUM; do not revive #618. The pending slot/exposure logic and per-mode latch are genuine protections. Policy deliberately separates transient failure handling from forced liquidation, and arbitrary auto-flatten on every transient error could harm users. Dormant LPCP logic (#518) is not the active fixed-notional sizer.

**Confidence:** high on the scope of the daily-loss numerator and paper/live branch distinction; conditional on runtime bypass incidence. **Falsifier:** Q9 raw guardrails, applied sizing, pending exposure and kill/reset records, plus existing isolated safety-test artifacts. An approved continuous equity monitor elsewhere could supply the missing total-drawdown promise, but must be positively traced to orders and tested by the crew. Do not infer absence of every possible monitor from this targeted audit.

### 9. Long-only eligibility and capture boundaries hide opportunities; “defensive hedge” is a long diversifier, not demonstrated downside protection

**Provenance: FOUND-AND-CLOSED** for long-only exclusions and the defined detector; **FOUND-AND-LIVE** for deferred defensive-hedge/regime design and unobserved exclusion economics. **Technical disposition: deliberate opportunity boundary and semantic caution, not evidence to loosen it.** BATCH_54's deferred regime decisions include defensive hedge; the long-only closures are in the component/symbol provenance group P8.

Defensive hedge requires negative-market context, a bullish local pattern, a BTC correlation magnitude below threshold and volatility/volume conditions; it buys and targets an ATR rise. See [server/strategies/defensive-hedge.ts:118](<C:/DawnTrader-Audit/server/strategies/defensive-hedge.ts:118>), [server/strategies/defensive-hedge.ts:188](<C:/DawnTrader-Audit/server/strategies/defensive-hedge.ts:188>), [server/strategies/defensive-hedge.ts:231](<C:/DawnTrader-Audit/server/strategies/defensive-hedge.ts:231>). Low measured correlation is not a guarantee of negative beta during the portfolio's losses, and the long has its own downside. Its honest candidate role is a selective long diversifier or rebound trade. No standalone or portfolio hedge payoff has been measured here.

The passive universe loader drops quotes outside its allowedQuotes set at [server/services/passive-archive/universe-loader.ts:163](<C:/DawnTrader-Audit/server/services/passive-archive/universe-loader.ts:163>) and [server/services/passive-archive/universe-loader.ts:181](<C:/DawnTrader-Audit/server/services/passive-archive/universe-loader.ts:181>). This establishes that loader's boundary, not a census of every active symbol source. Class rosters, strategy enablement, history requirements, freshness, ATR/geometry floors and price grids can exclude opportunities before the retained outcome tables. A long-only policy necessarily excludes direct short-downtrend opportunities. Cash/abstention remains an allowed response to a downward regime; no short selling is proposed.

The supplied decline inventory has missing target geometry and no xStock decline recorder on the corresponding lower entry path. Empty capture is not zero declines; detector evaluations are not unique trades; a six-strategy never-traded statement cannot support outcome condemnation. The xStock dispatch below crypto recorder sites and distinct active/passive gates prevent treating passive breadth as the active rejection denominator.

**Evidence against:** restrictions can avoid illiquidity, unsupported products and poor setup quality; absence of coverage does not imply a lost edge. Strong bull has positive directional conditions despite magnitude-based regime inputs, ORB rejects downward breaks, and liquidity trap is disabled. These are counterexamples to an indiscriminate long-downtrend claim.

**Confidence:** high on specified boundaries and long payoff shape; economic opportunity loss unknown. **Falsifier:** Q6 positive controls at each recorder and Q7 prospective native setup operands, plus Q9/Q10 market/risk context. A future marked rejected-opportunity cohort could show beneficial or harmful exclusion. Existing absent geometry cannot be reconstructed from outcomes without inventing the decision.


## 4. Primary answer, empirical boundary and independent-question delta

**The inspected source does not establish that the present system is profitable at hours, that days are required, or that it cannot work at any horizon.** No raw export has been examined. The stronger code-only answer is that the economics cannot be diagnosed reliably until account fees, intended price units, prediction/exit-policy meaning and selection/allocation objectives are reconciled. Those are more fundamental than choosing a larger target multiplier.

A fee threshold is a movement requirement, not a clock. In a simplified two-outcome model with target gain g, stop loss l, probability p and friction c (all return fractions on a declared entry basis), viability requires p·g−(1−p)·l−c>0. Hence g>((1−p)l+c)/p when p>0. A wider target alone changes g in the spreadsheet while leaving its probability and time-to-hit unanswered. The actual TEC-managed payoff distribution, fill probability, unresolved capital and execution costs require a richer object. Crypto and xStocks must be assessed separately under their applicable products and account fees.

The aspiration is **100% right decisions**. Its measured gap is **unknown**, not zero and not any quoted historical win rate. Define the target decision before scoring: maximize feasible expected net wealth, including choosing cash, under the hard envelope. A realized loser can be a sound ex-ante decision; the hindsight best candidate is not necessarily predictable. Report alongside any “right”/win fraction: net payoff, all-in costs, opportunity coverage, abstention, pending/nonfill rate, capital-time occupied, tail loss/drawdown and limit adherence. The largest plausible improvements are first eliminating fee/unit mismeasurement, then learning a correctly defined conditional outcome and testing selection against available alternatives. Their sizes are not measured here.

The brief's dated “red days after reset” observation remains supplied context. The proposition that more honest simulation **caused** the deterioration requires comparable populations and config/deploy boundaries. Repricing selected outcomes does not restore candidates rejected under an old gate, and a reset may have destroyed the necessary comparison.

### Evidence requested and the conclusion each answer changes

[QUESTIONS.md](C:/DawnTrader-Codex/out/astra-independent/QUESTIONS.md) contains the full numbered requests, raw fields, windows, positive controls, alternatives and independent-work boundary. Kyle must relay them; writing a file did not notify the crew. Do not attach previous audit answers.

| Request | Decisive unknown | Consequence |
|---|---|---|
| Q1 | Authenticated product/pair/account fees and applied class configuration | Matching rates retain the fee hypothesis; divergence changes the cost gate and requires a new marked era. Neither proves profit. |
| Q2 | Actual deploy/config/reset boundaries and uncertainty intervals | Exact boundaries permit strata; missing records force ambiguous arms and can prevent causal comparison. |
| Q3 | Full active lifecycle, quantities/fills/fees/anchors and unresolved inventory | Enables simulated charge reconstruction and net wealth/duration; closed-only extracts remain insufficient. |
| Q4 | Passive real/twin/shadow identities and cap eras | Enables arm-specific inference; missing classifiers forbid pooling or learning transfer claims. |
| Q5 | Complete membership by cycle and first appearance | Establishes usable n before outcomes; absent or biased coverage narrows/invalidates rank inference. |
| Q6–Q7 | Unique decisions, exclusions and native geometry operands | Supports branch/admission attribution; missing historical targets cannot support geometry-caused declines. |
| Q8 | Resolved runtime settings and effective decisions | Distinguishes dormant/shadow/active routes, flat/varying pWin and actual ranker from source possibility. |
| Q9 | Risk values, commitment states, kill/reset/failure records | Establishes which source limitations were reachable and whether current behavior matches the approved envelope. |
| Q10 | Independent timestamped execution observations | Can falsify internal fill/price assumptions; cannot substitute for live queue/fill evidence. |
| Q11 | Calibration labels, filters, applications and later decisions | Establishes actual learning influence and compatible populations; benefit remains a prospective question. |
| Q12 | Schema, retention and instrumentation positive controls | Determines which protocols are valid versus insufficient/unvalidatable. |
| Q13 | DHMA coefficient units and scale lineage | Confirms a missing conversion or supplies an intended price-valued contract; does not infer nontrading cause. |

[RAW_EVIDENCE.sql](C:/DawnTrader-Codex/out/astra-independent/RAW_EVIDENCE.sql) provides executable read-only schema/config/rank-population controls for the crew. It is not executed against any database here. Raw lifecycle/account requests that need additional schema or authentication stay explicit requests rather than fabricated executable joins.

Required empirical method after receipt:

1. Authenticate extraction provenance and positive controls before interpreting zeros. Count raw rows, unique signals, cycle memberships and lifecycle entities separately. A failed query is not zero.
2. Preserve all arms and time boundaries: pre/post June-30 sort; June-10 fee adoption; uncertain July-1/2 maker adoption; July-14 EV recording repair; July-28 accounting/anchors; order-book correction and grid/price-side changes; September-2 passive maker charging. These source/brief dates are leads for deploy evidence, not universally assigned row-era facts. Class calibration_epoch integers are not interchangeable.
3. Recompute active model P&L from q, actual fills and explicit fees, preserving unknowns. Reconcile feeQuote to leg-specific notional and rate; keep spread/slippage shortfall as anchored diagnostics when already inside fills. Report quote currencies separately unless a contemporaneous conversion source exists.
4. Report active closed+open+pending and VTS arms separately. For duration use age, entry/fill and event times, survival/cumulative incidence with administrative censoring and competing exits, and marked portfolio equity including unresolved exposure. Do not use cap exits as uncapped duration evidence or average only the fast closes.
5. Apply exact shadow restrictions, publish usable n before opening outcome analysis, and retain unresolved members. Compare only within cycle, ratio currency, split sort/cap eras. Tie/loss stays inconclusive. Capacity and warm-up noncapture remain a qualification on every result.
6. Keep pre-order-book-fix paper as a labelled sensitivity arm. Do not omit or blend it. Primary and sensitivity signs must agree before an unqualified combined conclusion; disagreement is a result, not an excuse to remove an era.

### Independent-question gate: delta in both directions

The 15 independent questions were written before section 6 and remain immutable in this audit's notes. They covered prediction-versus-exit labels; fee/anchor units; geometry through lifecycle; censoring; allocation and capital-time; stale/restart state; actual metric consumers; long-only hedge semantics; pre-signal invisibility; risk/pending exposure; passive transfer; indirect learning; provenance; future falsification; and the 100% aspiration.

**Crew additions that sharpened or added to those questions:** the mandatory attempt to refute the complete four-family/19-strategy proposal; exact regime inequalities/precedence; a positive favorable-assumption inventory; three-corpus component-and-symbol provenance protocol; exact first-appearance/membership restrictions and the one-sided ranking interpretation; historical cap/sort/fee boundaries; explicit empty xStock/missing-target recorder limits; and the prohibition on attributing declines or evaluating never-traded strategies from absent geometry. Several broad themes overlapped, but these precise controls were learned after the gate.

**Independent emphases not explicit in the crew attack list:** the predicted object versus actual TEC-managed label; slot waiting plus holding as an allocation cost; objective mismatch after fixed-notional sizing; restart/cold-state effects on measurement meaning; source-partitioned learning that can still influence global gates indirectly; distinguishing ex-ante correctness from hindsight winners; and treating abstention/cash and coverage as part of the 100% target. The crew's broad “systematic hooks” overlaps some of these; I do not claim exclusive originality.

No old/new report comparison has been made. That is a later task only if Kyle requests it.

## 5. Forward-testable design proposals

These are specifications for independent crew vetting and future testing, **not implemented changes and not evaluated designs**. Every proposal starts with its finding dependencies. If a dependency is rejected, the crew must explicitly retire or re-scope the proposal; this frozen finding text must not be revised to rescue it.

### Common future protocol for the economic concepts P3–P6

The crew declares **T0**, an exact UTC instant after fee/price-basis and capture prerequisites are satisfied, and freezes build, config, universe, cost assumptions, eligibility, treatment and control rules before any outcomes. No historical replay or backtest is allowed. Admissions run T0 through T0+56 days; observation ends T0+84 days. Do not extend a window because the result is disappointing or sample size is low. A fresh follow-up requires a new preregistration.

Each variant runs in a separate observational paper/shadow book with the same starting capital and the **same approved** exposure, slot, duplicate-symbol, correlation, daily-loss/kill and sizing limits as its matched control. These books are future instrumentation to be implemented/audited by the crew, not use of the old zero-cost ranking table as a performance book. Reserve slots and exposure for pending makers. Preserve current long-only policy and active max-hold configuration. The horizon marks below are observations, not secretly re-enabled forced time exits.

Population: every unique eligible decision intent under the frozen common opportunity detector, including blocked/cash, maker waits, nonfills, partial fills, rejected executions, later stop/exit and unresolved positions. Refreshes remain linked to the same intent unless a preregistered setup-expiry rule creates a new one. Emit both arms' intent/verdict/geometry/fee/size/price-source snapshots before execution outcomes. No selective opening only when the variant appears promising.

Primary economic object: **change in net marked portfolio wealth per initial unit of capital over the entire 84-calendar-day window**, after modeled executable entry/exit fees and costs and with all unresolved positions marked to an independently observed executable liquidation quote/depth model. An end-of-window mark is an accounting observation, not a forced production sale. Report paired variant-minus-control wealth and variant absolute wealth. Preserve closed P&L, open mark, idle cash, funding/conversion if applicable, pending reserve and fees separately. No silent carry of a stale mid as an executable mark. Missing terminal liquidity produces an explicit interval; it cannot award a pass.

Required controls: baseline build/config parity; authenticated applicable fees; decision-time raw/forming-bar inputs captured now; common symbol/time opportunity denominator; complete state transitions; independent timestamp/source controls; maker queue uncertainty as a stress arm; conservative beyond-depth/gap cost arm; full execution/fee-era labels; approved risk values stamped at each decision; full recording of cross-class contention. For each claimed exclusion/gate, include a positive control from the same instrument. A variant may abstain more, but must report coverage and missed opportunities.

Before outcomes, the crew publishes the planned inference code. Planning floors are 200 distinct eligible intents and 80 filled lifecycles per compared arm, with all remaining lifecycles retained, and 12 calendar weeks of observation. These are feasibility floors, not proof of statistical power or independent observations. Use paired calendar-block inference that accounts for concurrent symbols and positions spanning blocks; demonstrate effective information is adequate. Unresolved serial dependence, too few effective blocks, missing decision records, or a nonfinite/unbounded terminal mark makes the result **INSUFFICIENT EVIDENCE**. Do not pretend that hundreds of correlated reevaluations satisfy the floor.

Four economic comparisons (P3–P6), each with absolute and incremental wealth, form eight preregistered primary endpoints. Use familywise 95% coverage across these endpoints (for example Bonferroni individual 99.375% two-sided intervals with an appropriate dependence-aware estimator), chosen before outcomes. Report the full result even when intervals are wide.

**PASS within the stated simulation only:** both the absolute and incremental wealth lower bounds are above zero, every risk/integrity condition is met, and the conservative execution-cost sensitivity also remains positive. **FAIL:** an upper bound at/below zero rules out positive absolute or incremental effect at the specified precision, or an attributable hard risk-limit violation occurs. **INSUFFICIENT EVIDENCE:** intervals overlap zero, floor/control/information requirements fail, or execution uncertainty cannot be bounded. Unqualified primary/sensitivity claims require agreeing signs. No simulated pass certifies live fills or authorizes capital.

P3–P6 can be launched separately if the crew cannot implement a valid common capture/control. In that case freeze a new comparison family and multiplicity plan **before** each launch; do not retrospectively drop an unsuccessful concept. Unavailable prerequisites mean “not yet valid to launch,” not permission to run an outcome study with weaker data.

### P1. Account-specific fee contract and economic ledger boundary

**Depends on findings 1 and 6. INFERRED-FROM-CODE.** Preserve all risk limits.

Replace the implicit “strictly positive fee” assumption with an explicit finite signed maker/taker contract whose permitted range is justified by authenticated product/account responses. Keep validation fail-loud; do not broadly accept arbitrary negative rates. Scope product/class/pair exceptions and jurisdiction eligibility explicitly, with effective time and source. Resolve all consumers through one contract, preserve quote-versus-base fee currency, and stamp both decision assumptions and booked leg charges. Distinguish expected cost from realized simulated shortfall; do not double-deduct spread.

Future marked test: the crew freezes a 7-day window after candidate implementation, observes every resolved fee snapshot and every eligible paper fill, and compares against redacted authenticated schedule controls for every admitted product/class. Include signed/zero-rate isolated contract fixtures as positive controls without placing venue orders.

**PASS:** all applicable resolver paths represent verified rates and currency/leg semantics; valid zero/rebate controls pass; malformed values fail loudly; every filled lifecycle reconciles to quote/base conversion and fees to the declared currency precision. **FAIL:** any mismatched applicable rate, invalid value admitted, missing effective-era stamp or reproducible double deduction. **INSUFFICIENT:** unavailable authenticated class/product or no valid fill/control for a claimed path. Primary object is contract/ledger correctness, not profits. A new rate era does not retroactively recreate old admissions.

### P2. DHMA unit contract and scale-coherent geometry experiment

**Depends on findings 2 and 3. INFERRED-FROM-CODE.** Preserve all risk limits; shadow only until current geometry intent is reconciled.

The proposed hypothesis is to express DHMA's return volatility as price volatility **V=P·sigma(return)** before constructing its symmetric volatility offsets. Keep the original return window, entry rule and other detector conditions frozen. Do not also substitute HMA, change order-flow proxies or loosen detection thresholds: those are separate hypotheses. Persist P, sigma, V, k's declared units, E/S/T before/after grid and all shared-guard verdicts. The crew must first resolve whether this is the intended DHMA strategy and whether its proposed levels satisfy the current price-basis rules; if the intended object is ATR/HMA instead, this proposal is superseded, not silently relabelled.

Future marked test: 14 days of new raw setup observations, retaining every DHMA evaluation regardless of eligibility, plus isolated price-scale controls authored/executed by the crew. All checks are recorded before prospective outcome analysis. For the mathematical contract, scaling every price by lambda with unchanged dimensionless parameters must scale E/S/T by lambda before grid; after grid, deviations must be bounded by the declared tick rounding. Invalid geometry must reject, never repair by moving the target farther.

**PASS for units only:** every valid control obeys the scale relation and units, raw provenance is complete, and rejection reasons reconcile. **FAIL:** a reproducible unbounded scale discrepancy, invented missing primitive or execution of invalid geometry. **INSUFFICIENT / unvalidatable until resolved:** no accepted dimensional/price-basis specification or no valid positive-control evaluations. No economic pass is awarded by this protocol; a corrected DHMA trading concept would require its own frozen future economic test.

### P3. Cost-qualified structural VWAP pullback, selective hours horizon

**Depends on findings 1, 3, 4, 6 and 8. INFERRED-FROM-CODE.** Preserve the current hard envelope and do not widen the corresponding baseline stop.

Source of edge, **HYPOTHESIS**: a temporary pullback within an independently positive trend can offer entry below an already observed upper price anchor while trend continuation supplies a return path. This is a modification of the existing VWAP family, not an assertion that higher ATR creates an edge.

Conditions: long-direction confirmation from the frozen detector and fresh pair inputs, acceptable market/risk state, sufficiently liquid executable quotes, native valid stop, and a previously observed, timestamped structural upper level above entry. The candidate target must come from that observed anchor and the approved level-basis rule, not E plus enough multiples to pass EV. Reject when the anchor offers insufficient conservative net headroom. Preserve the baseline stop or a tighter valid structural stop; reject if actual entry increases planned loss beyond the baseline/approved amount.

Classes: crypto or xStocks only after their separate fee/product contracts are verified; report separately. Intended horizon: roughly 2–12 hours, with fixed observations at 2/6/12/24 hours and the common terminal mark. These times are hypotheses, not forced exits or a forecast of duration.

Entry/execution: propose a limit from an observed executable quote when the approved maker policy supports it; otherwise a taker quote/depth price whose costs still fit the observed headroom. Keep expiry and never-fill treatment fixed across arms; do not assume maker rebate or free fill. Exit follows the crew-approved existing structural/TEC rule frozen for both arms, with arm-specific target differences recorded.

Control: existing VWAP logic with the same upstream eligible intents, fees, sizing, risk and execution model. Treatment adds observed-anchor/economic qualification; it may choose cash. Do not use “other strategies” as an admission control. Record excluded intents prospectively so lower frequency is visible.

Forward test: the common P3–P6 protocol applies, with class-stratified results and observed-anchor positive controls. **PASS/FAIL/INSUFFICIENT** follow that protocol. Additionally FAIL a reproducible treatment admission whose target was manufactured to clear costs or whose stop/risk was widened beyond the agreed counterpart. If too few cost-qualified events occur, the result is insufficient evidence for edge and direct evidence of limited coverage, not proof the whole VWAP family cannot work.

### P4. xStock opening-range continuation using verified token-market execution

**Depends on findings 1, 3, 6, 7, 8 and 9. INFERRED-FROM-CODE.** Preserve the hard envelope and baseline ORB stop-risk limit.

Source of edge, **HYPOTHESIS**: a positive underlying-session information move can continue after an opening range is established, while liquid token quotes offer an executable long setup. This is an xStock concept; it does not assume tokenized equities have ordinary share execution or identical hours.

Freeze the exact session calendar/time-zone rule and observed opening-range bars from authoritative inputs before T0. Require a positive range break and fresh two-sided token-market depth, consistent underlying-session context, no stale/halted market state, and an observed upper structural anchor with enough fee-adjusted distance. Do not infer a session from a fixed UTC constant or trade a missing quote. Target uses the selected observed level, not an arbitrary larger range multiplier merely to pass cost. Stop remains the baseline approved opening-range stop or a tighter valid level; skip if that would exceed allowed risk at the executable entry.

Intended horizon: .5–6 hours, with .5/2/6/24-hour marks; no default change to active max-hold. All gaps, session transitions and unresolved positions remain in the denominator. Fees must be the verified applicable Pro/product schedule; favorable public rebate pricing is not assumed without Q1.

Control: frozen existing ORB on the same raw opening-range candidate stream, with identical session inputs, sizing, fees, depth and risk rules. Treatment is the token-liquidity/observed-headroom qualification. Capture both intent sets and reason differences at decision time.

Forward test: common protocol, restricted to eligible xStock sessions with positive controls for a valid range, downward-break reject, stale-depth reject and known session transition. **PASS/FAIL/INSUFFICIENT** follow the common rules; also FAIL use of unobserved session data or a synthetic quote represented as executable. Sparse sessions/candidates cannot be repaired with a crypto sample or historical replay.

### P5. Selective multi-session long continuation, without buying a longer horizon by widening risk

**Depends on findings 1, 3, 4, 5, 6, 7 and 8. INFERRED-FROM-CODE.** Preserve the hard envelope and corresponding baseline stop-loss amount.

Source of edge, **HYPOTHESIS**: persistent positive directional information can continue across sessions after an observed range breakout, offering greater reachable headroom than a short intraday mean-reversion excursion. More volatility is not the proposed edge.

Use the existing strong_bull_trend detector's positive DBS, prior-window breakout and body/ATR constraints, but qualify against fresh independent directional context and a previously observed higher-timeframe structural upper level. Freeze the higher-timeframe window definition before T0 (proposed: prior completed 20 daily bars, excluding the forming daily bar). Only admit when a valid observed upper level lies above executable entry and conservative costs; otherwise abstain. A new high with no eligible upper anchor is outside this proposal, even if an unbounded-trend narrative sounds attractive.

Classes: initially crypto, with xStocks a separately preregistered extension because session gaps/token execution differ. Intended observation horizon 12–72 hours, marks 12/24/48/72 hours, all still-open exposure retained through the common terminal mark. The hypothesis does not enable shorting, leverage or an unbounded hold claim. Exit/invalidation and existing TEC settings are fixed before T0; no new global time cap or wider stop is introduced.

Use the baseline stop or a tighter valid stop. At the executable entry and existing fixed-notional size, reject if planned stop loss exceeds the baseline or approved risk amount. Reserve exposure and pending slots for the full lifecycle. If conservative cost qualification and this unchanged risk envelope exclude most setups, report that constraint.

Control: existing strong_bull_trend with the same common raw opportunity stream and risk/execution model. Treatment adds higher-timeframe observed-headroom/directional qualification. The test evaluates whether selective longer-lived opportunities improve **calendar wealth**, not just trade win rate or gross target size.

Forward test: common protocol. **PASS/FAIL/INSUFFICIENT** follow its simultaneous economic and safety criteria. Add the predeclared diagnostic: fraction of selected intents attaining positive executable net liquidation value at each mark, including nonfill/open status separately. That diagnostic does not replace the primary portfolio test. An uncapped tail beyond the study end is marked and reported, not treated as a win because its target is farther away.

### P6. Align prediction, selection and scarce capital in a shadow decision layer

**Depends on findings 4, 5, 6, 7 and 8. INFERRED-FROM-CODE.** Preserve all limits and current fixed-notional sizing; do not introduce Kelly allocation.

Define the prediction object as future net marked payoff under the **specified execution and TEC policy**, with fill/never-fill, terminal mark and unresolved state explicit, at frozen observation horizons. Keep separate models or hierarchical calibration for class, strategy/condition and execution arm when data permits. Use a frozen, honest prior where it does not. A scalar DI-derived pWin is a comparator, not a label definition.

Proposed rank objective: predicted incremental **net portfolio wealth** of admitting a candidate versus keeping its capital/slot available, under the actual fixed-notional allocation and correlation/exposure constraints. Start with a transparent expected quote payoff and a preregistered capacity/holding-cost term; do not deploy an unconstrained optimizer. For this first experiment, use a fixed, declared opportunity-cost coefficient per unit of capital-hour selected by the crew before T0, report its value and units, and freeze it. If no defensible coefficient or future-training protocol can be specified, the capital-time variant is **unvalidatable**; test simple expected net payoff versus R as a separately named frozen variant instead.

All learning occurs only on future capture: days 1–28 collect labels while both books follow the frozen baseline; at day 28 the crew trains/calibrates using only then-observable outcomes and honest censoring, freezes model and parameters, and evaluates decisions admitted days 29–56 through day 84. No using a later close to label a day-28 training record. Common economic denominators include the full 84 days; label the shorter treatment exposure honestly. Insufficient eligible future training data means no launch of the learned treatment, not borrowing old contaminated labels.

Control: current DB-selected ranker, verified at T0, on the same feasible pool in an independent book with matched constraints. Capture complete decision-cycle membership and new decision-time anchors for **every** candidate now; do not reuse old first-appearance shadow entries as fresh alternatives. Outcomes are newly costed paper books, not the legacy one-sided table.

Forward test: the common protocol applies, with prediction calibration/coverage and actual changed-decision counts as secondary diagnostics. **PASS/FAIL/INSUFFICIENT** follow the economic/integrity rules, plus FAIL on look-ahead training leakage or unequal risk/capital assumptions. If no calibrated model launches or few selections change, the selection-benefit question is insufficiently tested. A better probability score alone does not earn an economic pass.

## 6. Separate note to Kyle on risk relaxation

**No risk-relaxation proposal is requested or included.** All default concepts remain long-only, use the existing approved sizing/exposure/slot/correlation/kill envelope, and reject trades that cannot fit it. Longer observation horizons do not authorize wider stops, larger notional, leverage, disabled controls or automatic extensions of a test window.

If the future evidence shows that no sufficiently frequent cost-qualified opportunity fits those boundaries, the honest result may be that this implementation is not viable under the current conditions. That would be evidence for Kyle to consider in a separate decision, not a reason to quietly relax the audit's constraints.

---

Supporting artifacts: [questions](C:/DawnTrader-Codex/out/astra-independent/QUESTIONS.md), [read-only raw controls](C:/DawnTrader-Codex/out/astra-independent/RAW_EVIDENCE.sql), [arithmetic witnesses](C:/DawnTrader-Codex/out/astra-independent/CODE_FALSIFIERS.ps1), [witness output](C:/DawnTrader-Codex/out/astra-independent/CODE_FALSIFIER_RESULTS.json), [provenance search record](C:/DawnTrader-Codex/out/astra-independent/PROVENANCE.md). The separate SUBMISSION.md records the frozen report's SHA256 and completion time. This submission completes the independent code-only audit and design specification; the empirical audit awaits raw evidence.
