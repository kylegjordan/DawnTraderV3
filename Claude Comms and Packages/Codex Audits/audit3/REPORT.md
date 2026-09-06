# DawnTrader — Assignment 3 (r3): audit report

**Pinned source sha (export's claim): `d0eda8ae4ab86e5968f08710be8e382a946126fd`.**
**`git rev-parse HEAD`: `fatal: not a git repository (or any of the parent directories): .git`.**
**`git status --porcelain`: `fatal: not a git repository (or any of the parent directories): .git`.**
Both commands were run in `C:\DawnTrader-Codex-Repo`; this is an allowlisted/redacted export, not a clone. **Porcelain is unavailable, not clean.** The sha is read from EXPORT_PROVENANCE.md, not independently verified from git objects. Its referenced export manifest is absent. `source_hashes.json` identifies the inspected text and `data_profile.json` hashes every supplied data file. The data's one claimed deployed sha differs from the source pin; current-source findings are not claims of live deployment.

## Answer to the governing question

**The system's main demonstrated obstacles are a mismatch between some intended mathematical objects and their implementation, incomplete evidence connecting market observations to decisions and executions, and real trading-cost constraints.** The acknowledged xStock fee error contaminated selection; correctly recomputing fees cannot recover untraded counterfactuals. DHMA's raw monetary geometry is dimensionally inconsistent. Price-side and clock work needs fidelity to actual execution and observed timestamps, not a rule that makes every price a bid or ask. Several existing mechanisms already do the right job and should not be “fixed” as though absent.

The export does **not** identify the root cause of the reported strong-trend zero, an honest deployment-stratified holding-time distribution, attainable all-in costs for every instrument, an optimal staleness ceiling, or evidence that the platform can outperform retail and professional competitors. The ambition is the yardstick, not evidence of achievable returns. Market excursions exceeding a fee hurdle do not establish predictive edge, capture, high win rate or high capital productivity.

| Subject | Disposition | Consequence |
|---|---|---|
| Price and clock semantics | FINDING + INSUFFICIENT | Active-paper fills already use sides/limits; source time, receipt time and decision time remain different objects. No optimal threshold identified. |
| DHMA | FINDING, acknowledged defect | Fractional σ is added to price; the proposed $1.50 ceiling is conditional, and a unit fix alone leaves raw RR below 1 with a positive entry premium. |
| Strong-trend lane | INSUFFICIENT; positive design finding | Eligibility and detector calls exist. Output silence cannot locate a failed stage. Favored-list separation is deliberate and sound. |
| Q1 spread/ticks | Bounded FINDING + INSUFFICIENT | Archive spreads are measurable; full native tick resolution, latency and published historical tick metadata are not established. |
| Q2 holding period | INSUFFICIENT / REFUSE | Missing deployment enumeration and complete censor/risk sets forbid the required survival split. |
| Q3 tape/costs | Bounded FINDING + STRUCTURAL CONSTRAINT | Conditional fee hurdles and bar paths are measurable; execution/capture and some instrument fee groups are not. |

## Reading integrity and scope

Assignment 3 supersedes earlier assignments. Implementation and raw measurements come from the new read-only exports; public venue documentation was checked after Stage A for channel/fee-group semantics, never substituted for historical primitives or fee figures. Work products were written under `C:\DawnTrader-Codex\out\audit3`. No source, data, deployment, account or trade was changed. No design annex, implementation proposal or per-strategy net-EV ranking was produced. Historical batch/ledger material was used for provenance and dispositions, not as current runtime truth or fresh economic evidence.

The literal nested brief path was absent. The corresponding exported filename is `Claude Comms and Packages/Scope Files/CODEX_AUDIT_3_BRIEF.md`; its title was read alone first and ends **(r3)**. Sections 1/1.b/2/2.a and the required provenance/manifests were read first. **The strict blind gate was not fully achieved:** line 62 exposed DHMA's proposed answer with its question, and line 73 exposed the price proposal before the standalone questions. This was disclosed immediately and recorded in READING_LOG.md. Separately written derivations and subsequent critiques are preserved below, but they must not be counted as blind independent agreement. Section 2.b has no separate hidden strong-trend conclusion after line 63. A fresh unexposed reader and physically separated question packet are required to restore that standard; this session cannot erase the exposure.

Work sequence: price derivation recorded → remaining §3 reading/history critique → Q1 archive measurements → restored-subject derivation and remaining reading → Q2 inventory/refusal → Q3 tape/fee scenarios → independent measurement checks → freeze. A Stage-A file is never rewritten to assimilate later findings. Post-derivation corrections appear in Stage B/addenda.

Source shorthand below resolves under `C:\DawnTrader-Codex-Repo`. Basenames are paired with implementing line references; the source hash index has full relative paths. Data resolves under `C:\DawnTrader-Codex-Data`. Measurement CSVs/JSONs resolve beside this report. These are snapshot claims with named limitations, not instructions or gates for the crew.

## §3 — price side and freshness, Stage A (verbatim recorded derivation)

# Price and clock derivation, before reading brief lines 74–96

## Independence status
The brief's line 73 proposed rule was inadvertently exposed during staged reading. This is a separately recorded code-derived analysis, **not a blind independent Stage A**. The price premise at line 71 and the mandatory manifest's timestamp interpretation were also supplied inputs. Further brief interpretation remains unread at writing. No historical audit was consulted.

## Derivation
The relevant distinction is **estimating a market state, constructing a strategy-specific level, deciding whether to submit an order, and estimating/observing a fill**. These are different objects even if expressed in the same currency.

1. A midpoint is a defensible valuation/detection input. It removes one source of bid/ask bounce, but has no universal privilege over a trade price, bar close or filtered estimate. Detector calibration must match its input object. A support-derived stop or bar high does not become wrong simply because it is not itself today's executable bid. Replacing every level with an ask/bid shift would change the strategy, sometimes twice because the cost layer already adjusts entry.
2. A long position liquidated immediately sells into bids; its entry as a taker buys asks. For a fixed quantity the relevant number is the attainable depth-weighted price, not necessarily the top of book. A resting maker buy or sell has its own limit, queue, fill risk and possibly partial executions: a BUY is not universally an ask fill. An exchange stop can have an explicitly defined reference price different from its eventual fill; the contract must state which.
3. Current source already separates several objects. `active-execution-engine.ts:2412–2455` books maker exits at the resting limit and taker exits from the close fill result. `execution/order-placer.ts:63–90,98–121` walks asks for paper entries and bids for paper closes; its cold-book/absent-config close branches are explicitly synthetic estimates. `active-execution-engine.ts:1692–1722,1976,2196–2207` still passes the current mark through valuation and exit evaluation. Thus “midpoint for every booked result” is false for this active-paper path. `core/trading/vts-exit-booking.ts:25–28` has a different crypto-mark / noncrypto-clamp policy; lanes must not be conflated.
4. `core/math/cost-model.ts:319–345` sets executionEntry = baseEntry × (1 + slippage + spread/2), while stop and target remain unchanged. A conversion of baseEntry to an ask basis without revisiting the meaning of this adjustment risks duplicate entry friction. This is a conditional mechanism warning, not a measured new defect.
5. At fixed contemporaneous midpoints m0,m1 and spreads s0,s1, crossing each leg changes the gross per-unit result from m1−m0 to (m1−s1/2)−(m0+s0/2). The difference is (s0+s1)/2; it equals one spread only if the two spreads are equal. This is not necessarily the error currently booked, because fills already walk sides, prices change between decision and fill, and some legs are maker. No estimate of actual lost returns follows from that identity.

## What the clock identifies
`equity-spot-archiver.ts:143–188` dates receipt/processing and separately retains the prior mark when the new frame cannot produce a valid mark. Raw-side receipt and mark receipt can therefore differ. A snapshot's captured_at measures a local archive observation, not exchange event age and not the active subscriber's decision-instant observation. `execution/depth-source.ts:49–69` dates the latest qualifying xStock archive row; crypto reads its active mini-book instead. The same “book age” label must not be interpreted identically across these paths.

`kraken-websocket-adapter.ts:175–178,819–838,1092–1098` already parses and carries optional venue timestamps for the active crypto ticker/book events in this pin; invalid timestamps stay null. No such fields exist in either exported quote header. The older claim “the venue has no timestamp” is not established for all channels and is contradicted as a universal implementation statement by this source. Presence on real frames and exact venue semantics are still unmeasured here. An exchange update timestamp does not necessarily date each unchanged quote level.

With only receipt timestamps one can measure observed interarrival intervals and time since the local observation; one cannot decompose network transit, venue inactivity, buffering, process scheduling or subscriber disagreement. Even an exchange timestamp requires clock-offset uncertainty and message semantics before the time difference is called transport latency. No honest optimal staleness threshold in milliseconds follows from this export. The risk-to-stop ceiling is a policy bound, not proof of quote freshness; refusing a quote does not remove an already-open position's market exposure.

## Evidence bundle and history
Object/population: the named implementations at exported commit d0eda8ae4ab86e5968f08710be8e382a946126fd; archive schemas; 706 exported paper/TARGET records, not live venue fills. `data_profile.json` shows 64 records with entry producer and 62 with exit producer; the remaining nulls cannot be read as proof of missing implementation at the current pin. Positive controls are the observed book-walk and mid producer values and the nonempty captured_at fields.

Ledger/catalog searches for components and provenance return B-EXIT-PROVENANCE / #911, B-COST-ACCOUNTING-HONESTY, F-G-2, #951/#961/#962, #943/#949/#959 and their sequenced plan rows. Completion reports for provenance and cost accounting confirm deliberate actual-fill accounting and separate clock objects. These are existing reviewed mechanisms or known work, not newly discovered defects. Search output will be retained with the final audit.

Evidence against a sweeping price defect: the bid/ask walks, explicit maker-limit booking, preserved original observedAt on reserves, and the already-present venue timestamp parsing and shadow level-basis instrument. Confidence: high for static implementation distinctions; insufficient for deployed incidence, quote freshness, a superior threshold or profitability impact. Falsifiers: a complete current deployed path trace plus contemporaneous decision/order/fill records demonstrating a different consumed object; raw channel frames and clock evidence identifying the missing timing components.

Verdicts: **FINDING — existing fill accounting and separation are right; decision/fill/sample parity needs explicit evaluation, already in flight. INSUFFICIENT — optimal freshness and realized impact. STRUCTURAL CONSTRAINT — a midpoint is not a guaranteed crossing price and receipt-only data cannot identify venue age.** The first becomes movable through maker execution or different venue/book conditions, with fill probability and waiting cost; the second through matched channel timestamps, clock uncertainty and decision records. Neither can be removed by renaming a clock or increasing a tolerance.


## §3 — Stage B

# §3 Stage B and Q1 — first completed audit sections

Stage-A-price file was written and SHA-256 recorded before brief lines 74–96 were read: `4CD9F8B3578534651DBC73C504851F2A3FA9A8DF60864A66F87276E83A18B992`. Its independence limitation is part of that file, not a footnote to erase later.

## §3 Stage B

Agree with the intent of matching decision economics to attainable execution and retaining different price objects for different jobs. The separately written derivation already reached this, but cannot count as blind corroboration because line 73 had been exposed. Disagree with a universal ask-entry/bid-level rule: maker limits, structural support/resistance, prior-bar levels, and already side-adjusted cost estimates require distinct treatment. Midpoint-based detection is a defensible reviewed choice, not a defect. For a taker liquidation trigger, a valid current bid/depth basis is the most economically faithful of the available references; a last trade is a useful independent event record, not a guaranteed current liquidation price. For maker executions, a valid resting-order and execution model is needed, not an ask/bid substitution. Booking actual live fills is preferable to any estimated mark; paper fills remain simulations with depth/queue limitations.

The brief's crypto clock claim is stale at this pin: its cited TypeScript type's absence of a field does not prove the raw payload lacks it, and `parseVenueTimestampMs` now consumes it from the raw update. Parsing and side carriage are already in code, not verified deployed in this export. Its quoted “midpoint for all four” claim also misses active-paper bid/ask walks, maker-limit booking and VTS's separate policy. These are scope corrections, not evidence of a better profit rate.

History read: `RUNNING_ISSUES.md:1478–1499` (#952), `5509–5536` and `5642` (#943), `5674–5696` (#941), and `PHASE_19_PLAN.md:72` (B-PRICE-SIDE-BY-JOB). These confirm the same objects already have homes, the market-data distinction is feed-versus-feed rather than clean-print-versus-mid, and F-G-2's disposition is a dependency. The #943 initial comparator can be unvalidated; a fresh or two-sided-looking frame is not conclusive evidence of a trustworthy market. Do not treat that guard as a solved premise.

Best available source by job: active crypto book for size-aware crossing estimates (already available, needs sequence/checksum/clock integrity); raw ticker sides as a separate top-of-book observation (less depth, different subscriber); raw trade channel for actual print/event evidence (cannot substitute for current quotes); xStock current ticker for its demonstrated limited top-of-book coverage, with the book-channel source explicitly an unverified/in-flight capability (#949). Require that channel's raw contract and observations before claiming parity with crypto. No latency, coverage or superiority figure is identifiable for an unobserved replacement feed. The second-best receipt-only policy is explicitly labelled local-observation age plus independent liveness/sequence evidence and a risk budget; it must preserve “unknown source age,” not transform it into zero latency. A timeout is a management policy, not proof that a quote ceased to exist at the venue.



### Subsequent price-path refinement (does not rewrite Stage A)

The brief §4 says `executionEntry` moves the entry level. At the traced active sizing site, `signal-orchestrator.ts:1930–1960` calls `computeNetGeometry` but builds the outgoing object by spreading **rawSignal**, overriding target with the normalized target and copying **netExpectedEdge/netRewardToRisk**. No `netGeometry.executionEntry` assignment appears in that file. Thus the confirmed cost adjustment there is an **economic-geometry input**, not evidence that that value replaces the persisted signal entry. Ask which path consumes a changed level before generalizing. The Stage-A warning about duplicate friction remains a conditional contract issue, not a newly proved double charge.

**The direction of the timestamp error matters.** With aligned clocks, `local_age = decision_time − local_stamp`, while `event_age = decision_time − venue_event_time = local_age + (local_stamp − venue_event_time)`. Contrary to the brief's wording that receipt-based age “includes” network transit, a local receipt/parse age **omits delay accumulated before that stamp**. A just-parsed old message can therefore have near-zero local age. Conversely a quiet, correctly maintained unchanged book can have an old last-update time without a broken connection. This algebra explains why the same numeric threshold cannot distinguish the two. Source evidence is the local stamp at `equity-spot-archiver.ts:162–176,188` and the separate crypto raw timestamp parser at `kraken-websocket-adapter.ts:819–838`. Confidence high in clock arithmetic; missing clock offsets, raw frames and timestamp semantics prevent quantifying either case. Falsifier for an incidence claim would be contemporaneous aligned event/receipt/decision records; none is supplied, so no frequency is asserted.

**Ranking also needs a job distinction.** Ranking a trend or valuation feature may legitimately use a midpoint/filtered price. Ranking deployable trades by expected net return requires feasible entry/exit economics, costs and fill probability. Calling all ranking an “estimate of value” does not establish that midpoint economics are sufficient. That distinction follows from the desired object (money attainable from execution), not from a proposal to replace all indicator inputs. No claim is made about which strategy ranks best on this contaminated selection history.

### Public venue contract check, after Stage A, September 6, 2026

Kraken's current spot-v2 ticker documentation includes a data timestamp and offers `bbo` or `trades` event triggers. This supports checking the subscription mode before equating a quiet ticker with an unchanged order book. It does not prove that DawnTrader received or deployed these fields. [Ticker contract](https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/ticker)

The book contract separately specifies snapshot/update timestamps and a top-of-book checksum. These support a richer crypto observation source, but do not supply this export's missing historical frames or establish xStock channel parity. [Book contract](https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/book)

This was a current documentation check of schema/fee-group semantics, not a replacement historical data source. All fee **figures** in the calculations remain from the assignment's prescribed transcription and supplied ladder. The read-only source pin and Stage-A records are unchanged.


## §2.b — Stage A (verbatim recorded derivation)

# Restored subjects: derivation before brief line 64

Independence: the strong-trend further reading at line 64 has not been read. The DHMA interpretation (~$1.50) at line 62 was exposed with the question; this part is not blind independent corroboration. Earlier supplied fee/timestamp context is known. Batch history is expressly consulted as required, not treated as current measurements.

## DHMA

Object: `detectDHMA` in `server/services/strategy-engine.ts:1378–1623`, `calculateVolatility:1783–1794`; both supported spot classes. Its volatility is the population standard deviation of fractional consecutive close returns. It has units of a fraction per input-bar horizon, not quote currency. The raw long levels at 1547–1549 are E=P×a, S=P−kσ, T=P+kσ. For a>1, k>0, σ≥0:

T>E iff kσ>P(a−1), equivalently P<kσ/(a−1). At the provided/seed values k=1.5 and a=1.001 the boundary is **P<1500σ**. It is $1.50 only at σ=0.001. At σ=0.01 it is $15; at σ=0.0001 it is $0.15. All three are algebraic examples, not measured market populations. A units/rescaling test is stronger than picking a price threshold: multiplying all prices by c preserves fractional returns and σ, but the current absolute offset kσ does not scale by c. The geometry is denomination-dependent.

Dimensionally consistent continuation of the existing return-volatility estimator uses a quote-currency scale Pσ at the **stated input horizon**; if the desired holding horizon differs, its volatility must be estimated/justified rather than multiplying by an unstated square-root factor. ATR is also a monetary volatility object but measures a different feature; substituting it changes the strategy, not just its units. Rank: monetary conversion of the existing estimator first for restoring its specified scale; horizon-specific re-estimation if that contract changes; ATR only with an explicit change of intended object. No profitability improvement is established by dimensional consistency alone, and correcting units need not overcome costs/other gates.

The history does not establish a single coherent “microstructure” contract. `SYSTEM_MANUAL.md:2026–2037` asserts L2, print/flow features and minute horizons; current source `1405–1460` explicitly uses candle approximations for OBI, microprice, signed flow, toxicity and even “spreadTicks” = 100×candle range/mid. `signal-orchestrator.ts:2392–2394` requests 60-minute bars on the named active crypto path. `bridge/canonical/DawnTrader_Regime_Strategy_Mapping.md:75` describes HMA crosses: archive-only original intent, not current mechanism. BATCH_72_2 and B79_0n_STRATEGY completion records document constant migration/class scoping, not validation of the microstructure interpretation. The seed migration `2026-05-06-b72-2-quant-lever-sweep.sql:161,167,172` supplies k=1.5, lookback=10, a=1.001; it cannot independently prove live resolved values or all parameter overrides. The brief asserts a live check; its raw settings evidence is not exported.

Verdict: **FINDING — acknowledged raw dimensional defect confirmed; universal $1.50 threshold not supported. INSUFFICIENT — definitive intended horizon/estimator and present live incidence.** Evidence against broad effect: downstream target normalization/guards can reject or alter geometry; signals need pass other conditions; no detector-input population supplied. High confidence in arithmetic, insufficient in causal trade count or profitability. Falsifier: an implementing monetary conversion before these additions, or runtime parameter dimensionality explicitly compensating for price scale; raw resolved configuration and detector inputs can settle incidence. Ask for the authoritative current DHMA feature/horizon contract, resolved parameters and invocation inputs, not a trade-profit proxy.

## Strong-trend lane

The question to answer is where routed opportunities leave the active pipeline, with matched stage denominators—not whether an empty output table by itself proves a missing strategy. The population statement in the brief (0 active evaluation rows despite prefilter traffic) is supplied, not independently measurable from closed trades and market tape. No invocation/gate/sink primitive is exported. A counter-positive strategy at the same stage/mode/class/window and a traceable routed candidate are required before interpreting a zero.

Static positive controls: `canonical-regime-strategy-map.ts:186,308` registers strong_bull_trend in TFS/IE; `452–475` materializes class eligibility without applying favored-list exclusions. `market-context-engine.ts:1712–1717` reads that materialized tree. `signal-orchestrator.ts:2474–2515` intersects regime and family; `3058–3072` contains a real detector call and null-reason record. The strategy's prior-bar breakout at `strong-bull-trend.ts:129–139` excludes the current bar, so it is not the impossible “current close exceeds current high” test. Code presence does not prove invocation in the observed deployment.

A second distinction can explain active/passive disparity without absent routing: the detector's native stop/target multiples yield R:R = targetMultiple/stopMultiple (documented 6/3=2), then `strong-bull-trend.ts:176–180` applies the global guards. The active caller defaults to `enforce`; VTS passes its gateDisposition (`vts-runner.ts:1379–1380`). If resolved minRR exceeds the native ratio, the same setup can be rejected active and retained/tagged passive. That is a conditional mechanism; without actual class/strategy configuration and stage events it is not a finding that this caused the reported zero. Loosening it to manufacture trades would be unjustified.

History: BATCH_63 establishes a dedicated continuation lane with native geometry; B_4_7 completion report:22 records the reviewed split of class exclusion and favored-list curation that prevents silently deleting this lane. That split is correct and present in the pin. A favored-list omission is not a defect in detector eligibility. Searches for component and symbol find both records (positive controls); no supplied raw per-invocation trace identifies today's first failing stage. `recordActiveStrategyNull` records observability counters, which must be distinguished from persisted evaluation rows.

Verdict: **INSUFFICIENT / REFUSE causal attribution of the observed active zero; FINDING — the eligibility/favored-list separation is sound.** Confidence high in the static paths and conditional guard mechanism, low in any deployment-specific conclusion. Evidence against “unreachable” is the materialized membership and explicit call; evidence against “everything is fine” is the supplied discrepancy and missing stage evidence. Falsifier: a pinned deployed trace proving deterministic pre-call exclusion or recording a successful call/return in the exact claimed zero population. Request routed-candidate lifecycle events plus resolved configuration and sink coverage; do not infer them from successful or closed trades.


## §2.b — Stage B

# §2.b Stage B and Q2

## Stage B: restored subjects

`STAGE_A_RESTORED.md` was written and hashed `61A36AA7BE9D0B3B328659684C9DA523C6E609D9ED2171482A199F318B10ACD9` before reading brief lines 64–66. Those lines are only a blank and a divider: **§2.b does not actually provide a separately withheld second reading.** Its DHMA question and proposed answer are both on line 62; its strong-trend observation and recording caveat are on line 63. This report does not claim that reading blanks discharged a blind gate. A physically separate question-only packet is needed for that experimental standard.

**DHMA:** Agree with the stated dimensional defect. Qualify the proposed $1.50 boundary as σ-dependent, as the recorded derivation shows. An additional consequence from the same equations is that the raw reward/risk `(kσ−P(a−1))/(kσ+P(a−1))` is **less than 1 whenever a>1 and the target clears entry**. Converting σ to Pσ fixes units but leaves that inequality intact. Therefore a minRR≥1 enforcing guard still cannot admit that raw geometry. This is conditional algebra for this detector, not a count of rejected market opportunities. Current seed/history supports minRR defaults ≥1, but present resolved values are not supplied. Source `strategy-engine.ts:1615–1623` guards before the downstream target normalizer in `signal-orchestrator.ts:1904`; the latter cannot rescue a signal already returned as null. The units fix alone is not proof the detector becomes operationally useful.

The newly checked history further limits the strong-trend guard hypothesis: `2026-06-27-p19-reorg-b2-3-per-strategy-minrr.sql:34` seeds a **1.95** crypto strong_bull_trend floor and `:29–30` sets defaults **2.0**, replacing the old **2.5**. The completion report `P19_REORG_B2_3_COMPLETION_REPORT.md:22–24,34` documents that migration. Native 2:1 is thus compatible with this seed, so the old 2.5-global-floor explanation **must not be presented as the current root cause**. Stage A deliberately made that mechanism conditional; Stage B has found positive evidence against treating it as today's explanation. Live overrides/deploy status still need raw confirmation.

**Strong trend:** Agree with the brief's caution that output silence may be observability silence. Code's `active-funnel-tracker.ts:387–403` increments process-local null-reason counters; it is not a guarantee of persisted rejected evaluation rows. The active detector and passive detector paths have different populations and dispositions. A valid answer now is **INSUFFICIENT**, not “the crew forgot the strategy” and not “zero means there were no setups.” Preserve the dedicated lane and the reviewed eligibility-versus-favored-list distinction pending the requested matched-stage evidence. No strategy-profit ranking was computed.

For the additional DHMA consequence, evidence against an incidence claim is absent resolved configuration, upstream rejection, downstream normalization, and unknown deployments; confidence high in the inequality, insufficient in realized impact; falsifier is a different effective geometry or minRR/disposition at the actual call. The exact units-specific symbol search did not establish a separate current ledger entry, while DHMA component history and constant migrations are positive controls; the assignment itself acknowledges the defect. Do not file it as a novel discovery or undo reviewed work.



## Q1 — spread and tick behaviour


Object: archived bid/ask rows from the two supplied quote files, not decision frames or executions. Formula: spread_bps = 10000 × (ask − bid) / ((ask + bid)/2). Require finite positive sides, ask ≥ bid. Locked quotes are retained and counted. No engine spread estimates used. Per-instrument CSVs contain population/window/n; hourly CSVs use UTC to avoid inventing venue-session classifications.

| Population | Rows / symbols | Valid spreads | Median / p90 / p99 spread, bps | Median receipt gap |
|---|---:|---:|---:|---:|
| crypto archive, 2026-09-03 09:13:41.993Z–09-06 09:13:36.725Z | 1,068,352 / 528 | 1,068,352 | 6.670 / 48.226 / 290.723 | 16.245 s |
| xStock archive, 2026-09-04 00:00:00.214Z–23:59:59.998Z | 2,887,660 / 467 | 2,887,221 | 7.689 / 51.672 / 704.293 | 4.618 s |

The spread quantiles above are **archive-event weighted**, not time-weighted or equal-instrument. The median across instrument medians is **25.419 bps (crypto, 528 instruments)** and **7.816 bps (xStock, 467)**: class conclusions are sensitive to weighting. No ranking of the classes' native activity is licensed by these different windows. Per-instrument rates in the CSV are archived rows/hour over that instrument's observed first-to-last span; neither is a native event rate.

Quality controls: crypto has 14,202 locked positive quotes, 0 positive crossed quotes, and all 1,068,352 have positive side sizes. xStock has 194 locked positive quotes, 7 positive crossed rows and 432 rows with nonpositive/nonfinite sides; these last two groups are excluded from spread quantiles. Of xStock's valid spreads, 2,884,223 have both sizes positive: the spread statistic alone is not proof of executable liquidity. Both files have 0 duplicate (symbol,captured_at) keys; positive control is the nonzero per-symbol repeated observations and nonzero price changes, not an assumption that every expected message arrived.

Typical move is explicitly **median 1-minute bar high–low divided by close** for the same instrument within the quote file's calendar window. It is a bar-range statistic, not an achievable forward return. Where that median is positive, the median across instruments of the archived-quote fraction with spread ≥ this typical range is **91.918% for crypto (160 instruments)** and **94.500% for xStock (400 instruments)**. Spread ≥ half this typical range: **99.394% / 99.930%**, same respective eligible instruments. For **368 crypto / 67 xStock** quote instruments the median range is zero, so these ratios are explicitly undefined and excluded. The zero-range and sparse-bar population is a major limit: do not market these ratios as percentages of trades that cannot work. They show why tiny bar movements cannot automatically be called economic opportunities.

**INSUFFICIENT — full-resolution tick behaviour and archive-to-active latency.** `ticker-batch-writer.ts:107–119` explicitly drops frames within its throttle; `equity-spot-archiver.ts:184` invokes it after updating the in-memory mark. `RUNNING_ISSUES.md:377–379` (#440–442) and `5642` already document the sampling/attribution issue; BATCH_74 and P19_B_PERPFEED completion records provide positive history-search controls. This is a deliberate reviewed archive/storage tradeoff, **not a newly filed throttle defect**. The manifest's claim that both files are full tick resolution is not supported by their documented producer. Request raw unthrottled frames and sampling configuration/provenance before answering native update frequencies, short-lived extremes or decision-instant freshness.

**INSUFFICIENT — historical published crypto tick per instrument.** Source correctly retains the venue's `raw.tick_size` (`kraken-asset-pairs-service.ts:386–396`); no corresponding timestamped instrument-master export was supplied. A minimum observed change or decimal precision is not a substitute. The Q1 CSV records an observed price-lattice GCD at the file's 1e-8 precision and minimum observed separation, explicitly not a published tick. For xStock this is a descriptive inferred lattice from valid archived sides; its stability and order-validity need venue validation and raw-frame checks. Do not pool crypto published ticks with xStock inferred increments.

Evidence against overgeneralization: narrow spreads in the lower tail, strong weighting sensitivity, valid locked quotes, heterogeneous and incomplete coverage, archive thinning, zero median bar ranges, and the fact a larger future move can still exceed friction. Confidence high for reproducible archive calculations; insufficient for raw venue-event or live decision claims. Falsifiers: producer-linked raw frames proving an unthrottled different export path; corrected instrument metadata/windows; alternate predeclared observation weighting yielding materially different market conclusions. Moving the structural crossing-spread cost requires different execution, venue/liquidity or holding opportunity, with waiting/fill risk; a code change cannot make both sides of a spread executable at their midpoint.


### Session variation and weighting

`q1_hourly_crypto.csv` and `q1_hourly_xstock.csv` carry per-instrument/hour observations and sample sizes. Among the available **UTC hourly archive-event populations**, crypto's class median spread ranges from **4.991 bps at September 3 17:00Z** to **10.566 bps at September 4 12:00Z**; xStock ranges from **4.544 bps at September 4 19:00Z** to **42.550 bps at September 4 08:00Z**. These are descriptive hour buckets with different instrument/arrival mixes, not a causal session effect or a comparison of equal coverage. Full UTC buckets and n are in the class-hour CSVs; raw session classification and trading-calendar interpretation were not invented.



## Q2 — holding period: insufficient / refuse


Object/population: the supplied `trades_closed.csv`, 706 records, all `mode=paper`, all `trade_mode=TARGET`. Those axes are independently counted, not inferred from the filename. Method: inspect schema, timestamps and reasons, and inventory **strategy × class × close reason**, retaining mode axes. `q2_strata_inventory.csv` contains **47 populated strata** with n and population on each row; no pooled holding median, survival curve, strategy expectancy or reconstructed selection ranking was produced.

Record-quality inventory (counts only, not a pooled holding distribution): **701** records have close timestamps; **5** do not. **90** say `never_filled`, which are order outcomes rather than time in an entered position. **4** say `max_holding_period`; their identities and dates are in `q2_special_records.csv`. They are xStock records opened July 22 and closed July 23. They cannot be silently relabelled as a 7-day or 48-hour passive censor. Source `active-execution-engine.ts:2265–2271` documents the July 24 P19-B8.5j switch-off of active max-hold pending policy; this is positive evidence that the historical rows and today's active policy differ, not proof of a new defect. There are **0** closes earlier than their recorded opening, with 701 non-null pairs as the positive comparison population.

Reasons in the 706-record inventory: stop_hit 339, target_hit 254, trailing_stop_hit 14, max_holding_period 4, never_filled 90, null 5. These are supplied reason labels, **not independently verified causes** or a profit/win-rate calculation. An evaluation clock/price defect can itself affect an exit label.

Three binding blockers:

1. **No complete censor/risk set.** Five records without closed_at do not establish that every still-open filled position at an explicit observation cutoff is included. No complete open-position snapshot, fill-origin time, lane/censor reason and censor cutoff contract is provided. The passive real and shadow populations are absent. `vts-runner.ts:780` has a 48-hour shadow ceiling and `:1149` a seven-day real safety valve, but source constants do not create missing observations. Each lane needs its own risk set and wall labels.
2. **No enumerated deployment boundaries.** `deploys.txt` has one claimed current deployment: sha `4dc231e5714f34405b958975d92c3983e04bfcfc`, deployed_at `2026-09-05T08:12:21Z`. The exit-change file contains **39 file-touch rows representing 32 distinct commits**, not 39 deployments. `q2_commit_inventory.csv` preserves every row with that population warning. The brief's f8870022f is a candidate, not an observed boundary. I did not substitute commit time, a daily cutoff or the current export commit for deployment history. Dated completion reports can provide candidates, but no enumeration/completeness proof. The commit file starts August 25 while records start July 15; even perfect mapping of that list would not cover the whole holding sample.
3. **Chronology needs reconciliation.** That same current-deploy sha is listed with commit_time_utc `2026-09-05T11:28:00Z`, later than its claimed deployment. The export provenance says built `2026-09-06T10:01:02.956Z`, while the exit-touch list includes venue-clock work at `2026-09-06T13:03:23Z` and that mechanism is in the source. Git author/committer clocks, timezone labels or packaging may explain this; none is a safe inferred deploy offset. Request the raw provenance/time definitions rather than inventing a correction.

Even after those are supplied, stratifying a survival estimator by eventual exit cause changes its meaning: a cause-specific analysis must preserve everyone initially at risk and explicitly handle competing exits. Grouping only already-closed stop-hit rows estimates a conditional closed-row duration distribution, not time-to-stop risk for opened positions. The mandated strata are preserved in the inventory; a misleading estimator was not substituted.

Evidence against wholesale refusal: open/close primitives and reason labels do permit record-level checks and the bounded inventory above; current policy mechanisms and some dated batch reports exist. They do not discharge all three required constraints. Confidence high that the requested survival/deploy split is not identified by this package. Falsifier: a complete lane-specific entry/open/exit/censor population with a fixed cutoff and verified deployment intervals spanning the observations. Missing deployment history is an information constraint for this retrospective window; it becomes movable only if independent operational records can recover those boundaries. A new deploy log improves future audits but cannot manufacture the past.


# Q3 — cost hurdles against the tape

## Contract and limits

Object: the account-confirmed ladder transcribed in `1-system-manual/external-references/KRAKEN_FEE_SCHEDULE_REFERENCE.md`, cross-checked against all 19 rows in `fee_ladder.csv`, and forward price paths in the two supplied minute-bar files. **No fee came from engine configuration, trade costs or derived outcomes. No trades were joined to tape for this question. No strategy net-EV ranking was computed, even as an intermediate.**

There are two different questions: a **fee-only hurdle**, identified by the supplied ladder under its applicable fee group; and **all-in realizable cost**, which also needs contemporaneous sides, order size/depth, order type, queue/fill evidence, and timing. Only the former and descriptive quoted spreads are identified here. Do not substitute their sum at a median historical spread for an actual execution cost.

**Instrument fee-group assignment is itself incomplete.** The crypto tape includes **USDC/USD and USDT/USD**; the `crypto_spot` trade labels also include EUR/USD. Kraken's current public contract assigns stablecoins in the base currency and FX pairs a separate schedule. The supplied fee reference also names a selected-pair maker-rebate program whose eligible-pair list was not captured. Class is not a complete venue fee-group key. Thus the per-instrument clearance CSVs are labelled **conditional fee scenarios**, not confirmed charges for every listed symbol. The reference's account confirmation establishes the shown product/rung examples, not every historical pair's special eligibility. Request a timestamped instrument-to-fee-group map before calling this an exact venue hurdle per instrument. This unanswered part is **INSUFFICIENT**, not filled with a proxy. No additional public fee rates were substituted for the supplied ladder. [Kraken fee-group contract](https://www.kraken.com/features/fee-schedule)

## Identified fee arithmetic

For a long position of unchanged base quantity, fees in quote currency, entry price P0 and exit price P1, zero net cashflow requires:

`P1/P0 = (1 + entryFeeRate) / (1 − exitFeeRate)`.

The exact required price return is this ratio minus 1. The common additive `(f_entry + f_exit)` bps is only the equal-notional shorthand. Both are in `q3_fee_hurdles.csv` for **57 combinations: 17 crypto rungs + 2 xStock rungs, each TT/MT/MM**. Future-rung scenarios do not imply the account qualifies. “MT” specifically means maker entry, taker exit; reversed legs have a slightly different exact hurdle.

| Population: current rung-1 fee scenarios, per filled round trip | Taker/taker | Maker/taker | Maker/maker |
|---|---:|---:|---:|
| Standard crypto spot — exact fee-only hurdle | 161.290 bps | 120.968 bps | 80.321 bps |
| Pro xStocks — exact fee-only hurdle | 20.020 bps | 8.008 bps | −3.999 bps |
| Standard crypto spot — equal-notional fee sum | 160 bps | 120 bps | 80 bps |
| Pro xStocks — equal-notional fee sum | 20 bps | 8 bps | −4 bps |

A negative maker/maker hurdle is the rebate on **two actually filled maker orders**. It is not a riskless income stream, an immediate crossing opportunity or evidence the market will fill both orders at these prices. Futures have no tape in this package and are outside these measurements; their cheaper stated fees do not answer a spot-market opportunity question.

## Tape population, method and results

Actual window, independently read rather than borrowed from “7 days” in the manifest:

- Crypto: **814,356 rows / 571 instruments**, September 1 00:00Z–September 6 09:13Z. **420 invalid OHLC rows** excluded; **813,936** valid unique rows remain. 359,043 source rows have high=low; 420 have zero volume.
- xStock: **807,914 rows / 480 instruments**, September 1 00:00Z–September 5 00:00Z. **807,914** valid unique rows remain; 198,531 source rows have high=low; none has zero volume.

Both have zero duplicate (symbol,interval_begin) keys. Positive controls are the nonzero valid rows and nonflat bars in each, plus independent raw-row checks. Quote coverage is smaller: 528/467 observed instruments, so the full tape universe cannot inherit a measured spread indiscriminately. The date ranges and sparse minute coverage do not establish seven complete days per symbol. Nonpositive/invalid OHLC is a quality exclusion, not an invented zero return.

Horizons: **5, 15, 60, 240 minutes**. Origin = an observed minute's close. Require that origin plus **every intervening minute through the horizon** exists exactly once with valid OHLC. Do not forward-fill absent minutes or equate the next h rows to h minutes. Future upside excursion = max high in minutes t+1…t+h divided by origin close, minus one; future downside excursion and signed/absolute endpoint returns are also retained. No current-bar high leaks into the forward excursion. These are retrospective bar-price descriptions with overlapping origins, not independent trials and not an executable entry/exit simulation.

| Population: valid contiguous origins in each supplied class window | Horizon | Origins / instruments | Median absolute endpoint move | Fraction with future upside excursion above rung-1 **TT fee-only** hurdle |
|---|---:|---:|---:|---:|
| Crypto; conditional standard fee scenario | 5 min | 214,070 / 379 | 14.41 bps | 4.845% |
| Crypto; conditional standard fee scenario | 15 min | 120,006 / 200 | 19.69 bps | 9.636% |
| Crypto; conditional standard fee scenario | 60 min | 67,388 / 75 | 24.48 bps | 12.471% |
| Crypto; conditional standard fee scenario | 240 min | 46,022 / 19 | 31.99 bps | 14.630% |
| xStock; conditional Pro fee scenario | 5 min | 483,172 / 476 | 8.71 bps | 19.926% |
| xStock; conditional Pro fee scenario | 15 min | 354,332 / 455 | 16.15 bps | 39.679% |
| xStock; conditional Pro fee scenario | 60 min | 200,790 / 329 | 33.07 bps | 65.886% |
| xStock; conditional Pro fee scenario | 240 min | 57,562 / 154 | 72.46 bps | 83.670% |

Rows are **bar-origin weighted within each class**, not equal-symbol and not cross-class matched windows. The instrument composition shrinks sharply with horizon: for example only 19 crypto instruments support 240-minute origins. These rows must not be read as a causal curve of “hold longer and get this improvement.” Gaps may mean no trades, missing capture or market closure; without a contract they remain gaps. The comparison denominator also conditions on a fully observed future path, favouring continuously observed instruments. The per-instrument files expose every excluded/eligible count, including zero-origin rows.

For the **60-minute** rows only, the same forward-upside fractions under **maker entry/taker exit** are **15.991% (crypto, 67,388 origins/75 instruments)** and **83.628% (xStock, 200,790 origins/329 instruments)**. Under **maker/maker** they are **24.015% / 99.547%**, same respective populations. The very high xStock rebate-scenario fraction illustrates precisely why price paths cannot stand in for maker fill probability. The files also report the fraction whose **signed endpoint return**, rather than a hindsight high, clears each hurdle; an absolute move is never counted as a profitable long merely because it is large.

**STRUCTURAL CONSTRAINT — NOT A DEFECT:** on a market to which the confirmed standard crypto Tier-1 schedule applies, fees alone require about 1.613% price appreciation for an unchanged-quantity taker round trip. That is a substantial economic barrier to frequent small-move trading. The measured tape describes how often price moves exceed that threshold in explicitly bounded windows, not whether the system can predict or capture them. The barrier becomes movable with a genuinely earned/qualified cheaper tier, a different applicable fee group, execution that actually earns maker rates, or different venue/product conditions. Each changes eligibility, capital exposure, fill risk or the traded opportunity; none is a free software improvement. xStock's materially lower correct fee floor is also real, but its spread tails and limited execution evidence remain independent constraints.

**FINDING — market movement is necessary evidence, not alpha.** The package supports conditional price-move distributions and fee arithmetic. **INSUFFICIENT — attainable all-in per-instrument hurdle, capture probability, optimal holding horizon, profitability, and superiority to other trading systems.** Better-looking numbers after correcting fees cannot identify the counterfactual rejected population. The old xStock fee error is acknowledged in-flight work (#1010), not rediscovered here.

Evidence against overclaiming a cost wall: some observed moves do exceed fees; favorable maker schedules and higher tiers materially change the floor; a large move may still have occurred after an adverse stop or without executable depth. Evidence against optimism: prices/highs alone cannot establish fill prices, queue position, adverse selection, stable liquidity, capture timing or a predictive edge; special fee groups are unmapped and windows/symbols are incomplete. Confidence high in the conditional arithmetic and reproducible bar observations, insufficient in strategy or realizable-return implications. Falsifiers: corrected bars/fee-group metadata, executable matched order-book and order-lifecycle evidence, or an independent forward population demonstrating capture after all costs. No fabricated net-EV, no selection ranking and no design proposal is offered.


## Validation and evidence index

Reproducible scripts and outputs accompany this report. Python/pandas/numpy were used locally; no application source was modified or installed. **No application/integration suite was run and no live execution was tested**—the source is a redacted read-only export and these are analytic/static claims.

- Q1 per-instrument row/valid-spread totals reconcile to the two complete CSV populations. Validity exclusions, locks/crosses, observation weighting, receipt gaps and zero-range exclusions are explicit. `q1_summary.json` is the compact index; instrument/hour CSVs hold the full result.
- Q2 is an inventory, not a survival estimate. Every populated strategy/class/reason row carries its population and n. The current deploy record and all 39 exit-touch rows are preserved separately from any inferred deployment boundary.
- Q3 uses strict minute alignment and continuous timestamps. An initial verification exposed a pandas datetime-unit mismatch (microseconds versus an assumed nanosecond conversion); it was corrected **before reporting results**. The final script explicitly normalizes units and asserts its first epoch against a timestamp conversion. No initial erroneous Q3 result is a finding in this report.
- An independent implementation using Python datetime keys and checking **every intervening minute** agrees on origin counts, median signed return and p90 upside excursion for BTC/USD, ETH/USD, NVDA/USD and A/USD at all four horizons (**16 checks**, including A/USD's zero-origin 60/240-minute cases with nonzero 5/15-minute controls). All **57** fee hurdle combinations were checked by substituting the break-even price into exact quote-cashflow settlement. `verification.json` contains the checks.
- `history_searches.json` records literal case-insensitive component/symbol searches across the ledger and batch reports, including NOT-FOUND results and positive controls. Examples: `detectDHMA` is absent by that spelling in the ledger but present in the Batch 32 report; DHMA component references and its constant migration are found. `favoredListExcludes` is found in both corpora. `bufferTickerSnap` is found in both. A zero search is not proof of no prior decision. The `realizedVol` ledger match is #371's different ATR/reachability object, not a units-defect closure.

Snapshot limitations and falsifiers are part of each section. The mandatory manifests themselves supplied assertions; several were narrowed or contradicted by row counts/source inspection. Their words are not treated as independent proof of sample completeness. The missing export content manifest and conflicting timestamp chronology prevent a stronger git/deploy certification. No outputs were matched against previous assignment reports.

### Files to use

- `REPORT.md`: full dispositions, recorded derivations and critique, measured populations and uncertainty.
- `QUESTIONS.md`: prioritized missing evidence, including the strict independence gate and live price decision primitives.
- `SUBMISSION.md`: freeze time, report/question hashes and the artifact manifest.
- `q1_instruments_*.csv`, `q1_hourly_*.csv`: per-symbol spreads, inferred observed lattices, receipt intervals, and UTC variation.
- `q2_strata_inventory.csv`, `q2_special_records.csv`, `q2_commit_inventory.csv`: bounded record and provenance inventories; no invented survival curves.
- `q3_fee_hurdles.csv`, `q3_tape_instruments_*.csv`, `q3_conditional_fee_clearance_*.csv`: all supplied fee-ladder combinations and per-instrument tape scenarios. These explicitly do not assert every instrument belongs to the standard fee group.
- `data_profile.json`, `source_hashes.json`, `history_searches.json`, `verification.json`, and measurement scripts: reproducibility and provenance.

## The four questions, answered directly against the intention

**What are we missing?** Matched decision/order/fill primitives with meaningful clocks, validated per-instrument fee/tick identity, reliable stage denominators for the supposedly silent lane, complete censored risk sets and historical deploy intervals. Also missing is evidence that price movement can be predicted and captured with enough net return and controlled exposure to support the stated competitive ambition. This audit cannot manufacture those observations from closed selected trades.

**What are we doing right?** Distinguishing actual fill accounting from intended-price telemetry; using bid/ask depth and explicit maker-limit booking in the active-paper path; retaining producer and age provenance; separating favored picks from detector eligibility; keeping the two passive censor walls distinct; refusing to score the contaminated selector. The current crypto timestamp/side plumbing is already a step in the right direction. The off-by-policy active time limit is an explicit Kyle decision, not a missed timer to enable silently.

**What needs improvement?** Price-object and timing contracts need to remain true across every consumer, sample and mode; the exported evidence must disclose its real sampling/windows and semantic gaps; effective settings and observer coverage must travel with causal measurements. Treat current documentation as a map to verify, because both the all-midpoint premise and the universal no-venue-timestamp claim overreach the inspected code. Keep existing observation-window dependencies explicit. These are mechanisms and evidence requirements for the next assignment, not designs built here.

**What is wrong?** DHMA adds a dimensionless return statistic to a monetary level; its units correction alone does not cure the raw reward/risk relationship. The acknowledged xStock fee value/sign error is a real, already-homed defect whose contaminated selection history must not be repurposed as market evidence. Some brief/manifest claims about full tick resolution, seven-day coverage and uniform current behaviour are unsupported by the provided objects. Reporting an unproved strong-trend root cause, a proxy deployment boundary, or a hindsight bar excursion as achievable profit would add errors rather than bring the system closer to its intention.

**Structural constraints remain real.** Fees, spread crossing, queue uncertainty and unobserved timing are not defects simply because the ambition is high. Change the applicable conditions and measure again; do not promise that a software correction removes them. The report supplies evidence for the crew's decisions and confers no approval or authority to change production.
