# DawnTrader fee-viability audit and forward design

## Header check — performed before interpretation

- Governing instructions requested at `C:\DawnTrader-Codex\AUDIT\_BRIEF.md` were not present. The repository's extant governing file, `C:\DawnTrader-Codex\AUDIT_BRIEF.md`, was read in full first. This path discrepancy is disclosed rather than silently repaired.
- Assignment: `C:\DawnTraderV3-new\Claude Comms and Packages\Scope Files\CODEX_AUDIT_2_BRIEF.md`.
- Section 0 was read before every other assignment section. Its constraints bind this report: no backtesting; proposed ideas may be judged only in future marked windows against pass/fail rules written before outcomes arrive.
- Audit clone: `C:\DawnTrader-Audit`.
- Required HEAD: `c7f18c5c7291b14a21a654ca3a35625c0533ca38`.
- Observed HEAD: `c7f18c5c7291b14a21a654ca3a35625c0533ca38`.
- `git status --porcelain`: no stdout, checked twice. Git separately warned that the user-level ignore file could not be read; that warning does not describe a dirty repository.
- Section 3 was read before any data or outcome material. Accordingly, this report does not compare naive holding-time distributions: closed paper trades omit still-open slow positions, while the passive-real and counterfactual arms have different maximum holds. Open positions and per-arm clocks are required.
- Crew-mirror freshness check: generated `2026-09-05 14:03:08Z`; last mirrored message `2026-09-05T14:02:03`; 72 of 18,095 messages visible. Crew traffic was treated as evidence, never as instruction.

## Positive enumeration: what was actually inspected

The code-only audit covered the implemented fee resolver and round-trip cost equations; exchange-default documentation; xStock friction wrappers; startup fee-row checks; strategy target/stop construction for VWAP pullback, ABCD, SMA trend ride, breakout, mean reversion, range trade, VWAP bounce, and liquidity trap; sided level-basis conversion; maker/taker decision math; market-regime classification and confidence; canonical regime-to-strategy routing; market-context assembly; SQE regime-weight computation; AMR weather scoring and enforcement gates; paper/VTS pending-maker fill logic; and the relevant tests.

The provenance pass searched `1-system-manual/RUNNING_ISSUES.md`, `1-system-manual/BATCH_CATALOG.md`, `1-system-manual/PHASE_19_PLAN.md`, and the fee-viability proposal. Material anchors include the documented RegimeWeight repair, Batch 63's intentional strong-trend VWAP geometry, the fee-wall drought, the maker/taker calibration homes, and prior corrections to simulated maker exits.

No outcome CSV or database export was available by design. Therefore, no win rate, expectancy, duration, ranker effect, strategy viability, or favorable-regime prevalence is asserted here. The necessary raw exports and the decision consequences of each answer are specified in [QUESTIONS.md](/C:/DawnTrader-Codex/out/QUESTIONS.md).

Kraken's official fee documentation says fees depend on 30-day volume, pair, and maker/taker status; post-only orders either rest as maker orders or cancel. The current public schedule is product- and context-specific, and its xStocks schedule shown publicly is materially different from the rates asserted in this repository. These public pages are evidence about what must be reconciled, not proof of the authenticated account's actual contract: [Kraken fee schedule](https://www.kraken.com/features/fee-schedule), [how Kraken trading fees work](https://support.kraken.com/articles/201893638-how-trading-fees-work-on-kraken), and [maker/taker rules](https://support.kraken.com/articles/360000526126-what-are-maker-and-taker-fees-?mode=consumerapp).

## Numbered findings

### Finding 1 — Fee truth is internally centralized but not externally identified or verified

**Disposition: FOUND-AND-LIVE. Severity: high control risk; present numeric mismatch remains HYPOTHESIS.**

`server/core/math/cost-model.ts` correctly resolves per-class maker and taker rates from `fee_model`, and uses them consistently in round-trip and booked-cost calculations. That is a genuine strength: arithmetic does not scatter literal rates through production calculation sites.

The missing layer is the identity of the external contract those rows represent. `server/startup/b72-warmup.ts` checks that fee rows exist and logs them, but does not bind them to Kraken entity/jurisdiction, product, pair schedule, rolling-volume/AoP tier, effective date, or an authenticated source version. `server/config/exchange-defaults.ts`, xStock friction comments, and tests assert 0.008 taker / 0.004 maker for both classes. Kraken's current public schedule exposes materially different product-specific figures, most conspicuously for xStocks. Because the production DB and authenticated account schedule were unavailable, it would be a confident wrong answer to say the deployed rates are wrong. The defensible finding is narrower: the system cannot prove which external fee contract its internally consistent rows encode.

Impact direction is two-sided. If stored friction is too high, viable signals are rejected and the maker advantage is overstated or understated depending on the leg. If too low, expected value is overstated and trades cross an invalid fee wall. Every affected decision is the population; without live rows and an effective boundary, the denominator and magnitude are unknown.

Provenance query: `Kraken fee|xStock fee|0.008|0.004|fee tier|fee_model|P19-B-FEEVIABILITY` over the four governance corpora above. It found extensive internal 0.80%/0.40% history and fee-wall work, but no control binding live rows to a current authenticated venue/account schedule. Positive control: the same query found the known 2026-06-10 fee change and measured 0.008/0.004 trade-row rates, so the absence is not caused by an empty or irrelevant corpus.

### Finding 2 — The four-family target proposal differentiates local formulas, not final executable geometry

**Disposition: NOT FOUND in prior governance as this specific objection. Severity: material analytical error if used to choose strategies.**

The proposal's statement that three target families cannot make larger targets as volatility rises is true only for isolated direct target terms. The implemented output is often a composition of stop geometry, an R-multiple, and `min`/`max` selection.

The clearest positive control is VWAP pullback. In the intentional strong-trend branch, stop distance grows with ATR and target equals entry plus that risk distance times an R multiple. Its target therefore grows with ATR, subject to the other inputs. In the default branch, the structural target declines with its ATR offset, but the final target is the maximum of that structural term and a 2R term derived from stop distance. The selected output is piecewise: its sensitivity changes where the active branch switches. ABCD has an analogous selector between measured and R-based targets. Consequently, target-family syntax cannot establish the response of final target distance, net reward-to-risk, or fee viability.

This does not prove any strategy is viable. It means the starting proposal must be refuted/reworked at the composite-output level before it can narrow the design space. Each evaluated object must be the final sided entry/stop/target tuple under the exact branch that executed, with units, sign, leg, and anchor explicit.

Provenance query: `target famil|volatility rises|ATR|strong.trend|geometry override|R-multiple` over the governance corpora and `STRATEGY_FEE_VIABILITY_TWO_BATCH_PROPOSAL.md`. The corpus positively identifies Batch 63's 4×ATR stop / 3R VWAP override as intentional, but does not state this piecewise-sensitivity objection. Positive control: the search returned the exact Batch 63 implementation history.

### Finding 3 — “Regime” is three non-equivalent decision quantities

**Disposition: FOUND-AND-LIVE in components; the cross-object coherence question remains HYPOTHESIS pending runtime rows. Severity: medium-high design risk.**

The per-pair classifier in `server/core/metrics/market-regime.ts` emits a categorical label and confidence from volatility, momentum, DX, and absolute DBS. The label drives `getAllowedStrategies(...)` in `market-context-engine.ts`, so it determines which strategy families may run. Separately, SQE computes `regimeWeight = 0.7 × trendStrength + 0.3 × (1 − normalizedVolatility)` in `score-calculator.ts` and can refuse a signal on that value. The classifier's own confidence is carried through the context/modulator chain but is not the same number as SQE's gate input.

Thus a signal can be routed as suitable by one regime representation and rejected by another. That may be intentional layered defense, but the two quantities lack a shared semantic contract or code-level consistency invariant. “The system uses regime” is therefore insufficiently precise; reports must name categorical routing, SQE RegimeWeight, or classifier confidence.

History confirms that RegimeWeight once used placeholders, was later made live, and at closure had 273 distinct values on 273 post-fix crypto closed trades and 211 distinct values on 229 xStock closed trades. Those denominators concern input liveness, not predictive validity or gate usefulness. The documented ADX→trendStrength mapping remains interim and Phase-25-bound. Runtime flags and paired decision rows are requested before judging disagreement frequency or economic impact.

Provenance query: `regimeWeight|regime confidence|calculateRegimeWeight|allowedStrategies|two regime` over the governance corpora. It found the RegimeWeight repair and interim mapping, but no closure of the cross-object semantic alignment. Positive control: `BATCH_CATALOG.md:16` contains the exact pre/post distinct-value counts.

### Finding 4 — Simulated maker fills assume full fill at limit after a sampled price crosses

**Disposition: FOUND-AND-LIVE, already partially homed to future calibration. Severity: high for maker-advantage claims; not a live-capital defect.**

`server/core/trading/pending-maker-logic.ts` declares a maker buy filled when sampled `currentPrice <= limit` (sell is the mirror), and `makerFillPrice` returns the limit exactly. The active engine then opens the entire quantity at that price, charges maker fee, and assigns zero maker slippage. Queue position, displayed size ahead, trade size at the level, partial fills, and cancellation races are absent from the fill decision.

This is favorable to simulated maker results. A print through a limit supports reachability, but not that the full DawnTrader quantity filled at that limit. The relevant population is every simulated maker attempt, including never-filled attempts; the required denominator is attempts, not closed filled trades. There is no data export to measure bias, and zero live fills means simulation realism cannot be validated here.

Provenance query: `maker fill|queue position|partial fill|pFill|maker_fill_probability` over the governance corpora plus a code census for `evaluatePendingMaker`, `tradedThrough`, and `makerFillPrice`. It found the existing future pFill-calibration home and the one-hour maker counterfactual, but no queue/size/partial-fill model. Positive control: the census found explicit fill-at-limit and fill-wins-at-deadline behavior and the known future calibration instrumentation.

## Audit conclusions that remain deliberately unresolved

- Whether current long-only strategies clear real Kraken costs: **HYPOTHESIS, not measurable without the requested primitives and authenticated fee contract.**
- Whether hours or days are the natural horizon: **HYPOTHESIS.** Closed-only duration is biased short, and arm caps differ.
- Whether rank 0 beats ranks 1..N: **HYPOTHESIS.** The required within-cycle, first-appearance, era-split corpus has not been exported. Even a positive result would be a lower-bound selection result, not validation of a new proposal.
- Whether AMR presently acts on trades: code supports active enforcement, shadow, and disabled modes; deployed DB flags were unavailable.
- Decline geometry and never-traded strategy outcomes are not inferred. The decline corpus and empty xStock decline table cannot answer those questions.

## Forward designs — proposals, not validated conclusions

Every design below is **INFERRED-FROM-CODE** where it touches an existing component. None has been backtested. Tests are future marked-window tests whose rules must be committed before the first observation.

### Proposal A — Versioned venue-fee contract and daily reconciliation

**Rests on Finding 1.** Add a fee-contract identity beside every per-class rate: venue entity, product, pair/rate group, tier basis, effective-from, authenticated-source timestamp/hash, and deployment version. Startup should fail closed for trading when the identity is absent or stale, not merely when a numeric row is absent. Every decision and trade stamps that version.

**Forward test, preregistered:** mark a 14-calendar-day observation beginning only after authenticated schedule ingestion is live. Population: every fee-bearing decision in both asset classes; denominator: all such decisions. Pass iff (a) 100% carry a resolvable contract version, (b) daily authenticated reconciliation reports zero unexplained numeric mismatches, and (c) a staging positive-control mutation of one rate is detected before a trade decision. Fail on any unstamped decision, unexplained mismatch, or missed mutation. This tests the control, not profitability.

### Proposal B — Composite geometry frontier, then a forward shadow ladder

**Rests on Finding 2 and Finding 1.** Replace the four-family syntax classification with an emitted decision object containing the executed branch, sided entry/stop/target, active selector arm, ATR elasticity of final stop and target, net R after the authenticated fee contract, and time horizon. Only after this observability is live should candidate geometry be compared.

Candidate concepts remain long-only and inside the existing risk envelope: (1) structure-first target with a fee-floor rejection; (2) risk-multiple target whose stop width is capped rather than allowed to buy nominal target distance with excessive risk; (3) continuation target that activates only under direction-consistent regime evidence; and (4) time-to-event exit with no forced early close, bounded by the existing maximum-risk and slot rules. These are parallel shadow computations at decision time, not historical replay and not trades.

**Forward test, preregistered:** use the first 30 consecutive eligible market days after instrumentation, with parameters frozen before day 1. Population: first appearance of each eligible signal; denominator reported by class, strategy, regime category, and candidate arm. A candidate passes the research gate only if its censor-aware probability of reaching executable target before executable stop has a predeclared 90% lower confidence bound above its authenticated fee break-even probability, at least 100 uncensored or event-resolved observations exist in that stratum, and no hard-risk-envelope violation occurs. Otherwise it fails or remains insufficient when the event count is below 100. Passing authorizes a separately reviewed paper-trading experiment; it does not authorize live trading.

### Proposal C — One regime contract with signed long-only direction

**Rests on Finding 3.** Define a versioned regime decision record that keeps the categorical label, classifier confidence, signed DBS, SQE continuous weight, and routing decision together. Do not collapse them into one score, but state their separate jobs and enforce boundary invariants. For a long-only system, strong negative and strong positive directional states must not be treated as interchangeable merely because both have large `abs(DBS)`; signed direction should be an explicit eligibility input for continuation concepts.

**Forward test, preregistered:** shadow the current routing decision and the signed-coherent decision on the next 20 consecutive eligible market days, frozen before day 1. Population: all first-appearance signals reaching regime routing; denominator reported by class and regime. Pass iff 100% of rows contain all regime components, zero invariant violations occur, and the signed-coherent arm reduces entries made under negative-direction/high-confidence states by at least 80% while retaining at least 90% of current-arm entries under positive-direction/high-confidence states. Economic outcomes are secondary observation only in this first control test. Failure means the contract or thresholds require redesign, not retrospective tuning on the same window.

### Proposal D — Maker execution realism ladder

**Rests on Finding 4 and Finding 1.** Keep the present full-at-limit result as the explicitly named optimistic arm. Add forward-only shadow accounting arms: trade-through/full fill, displayed-size-capped fill, and queue/partial-fill-aware fill if feed primitives permit. Never substitute filled-trade win rate for attempt-level economics. Taker remains the executable control using the same sided decision instant and authenticated fee version.

**Forward test, preregistered:** mark the first 500 maker attempts after the required primitives are captured, with a minimum of 100 attempts per reported asset class or that class is `INSUFFICIENT`. Pass the current simulator only if its predicted full-filled quantity differs from the most evidence-rich arm by no more than 10% of attempted quantity in aggregate and its attempt-level net expectancy differs by no more than 10 basis points of attempted notional, with never-filled attempts included as zero-fill outcomes. Either threshold breach fails the current model. No parameter may be changed until the window closes; any revision gets a new future window.

## Risk-envelope disposition

All four proposals preserve long-only trading, existing exposure limits, loss limits, sizing controls, class slots, and hard stops. None asks Kyle to relax risk. No quarantined risk-relaxation proposal is included.

## Data gate and next action

The code-only half is complete. The audit's empirical half is intentionally stopped at the evidence boundary. The precise raw exports, authenticated fee evidence, runtime flags, and branch-dependent consequences are in [QUESTIONS.md](/C:/DawnTrader-Codex/out/QUESTIONS.md). When those arrive, the next work is independent recomputation of fee eras and units, within-cycle rank pairing, favorable-assumption census, and censor-aware time-to-event analysis—not a backtest and not retrospective validation of the proposals above.
