# Raw evidence needed to resolve the runtime questions

Review pin: `9c2b50e7391758ef7fd2df0a48f0368fbcef13e0`.

These requests do not block the completed code/document review. They block conclusions about prevalence, simulation accuracy, comparative feed quality and profitability. Please provide raw exports and the query or collection method, rather than a prior reviewer's interpretation. Redact credentials and personal identifiers; retain stable anonymized IDs where joins are needed.

## 1. Deployment and configuration identity

Provide deployed SHA, relevant process identities/start times, and effective configuration for the exact measurement window: selected execution engine, live gate, mock-pricing flags, per-class execution/fee settings, depth age/sufficiency settings, MCE TTL, scanner intervals, universe selection and archive enablement. Include process-specific subscription configuration. Do not provide secrets or API keys.

**Resolves:** whether pinned-code branches are active; whether reported measurements can be joined to this review; whether “off” applies to the actual process. A repository default is not a substitute for effective runtime configuration.

## 2. The original feed-agreement observations and subscription lifecycle

Provide the individual observations behind 3,427 evaluations / 232 both-present / 231 exact matches, with instrument, asset class, evaluation ID, timestamp, cache/book sides and whatever producer/age fields were actually captured. Supply the aggregation query and its eligibility rules. If producer/event identity was not captured, say so; it cannot be reconstructed reliably from totals.

For the same interval, provide desired subscriptions, requests and per-symbol ACKs, queue admissions/removals, open/close transitions, reconnects, checksum failures/skips, instrument-precision availability, snapshot arrival and resync completion. Include channel and connection identity.

**Resolves:** sampled presence versus genuine subscription coverage; missing/pending/stale/unverified books; queue-only restoration; how often the comparison was a book against its own cache write. The zero book-only count cannot identify these causes.

## 3. Price and context lineage at actual decisions

Provide a joined sample from scanner through MCE, RTB ranking and execution: raw producer observation and ID, asset class, price kind, sides/sizes, venue time, receipt time, cache insertion time, decision time, smoothing input/output, MCE cache hit/miss/key/input version, returned context price and originating lane. Include both quant and pattern paths, and both VTS and active where applicable.

**Resolves:** mixture of print/mid/bar; repeated observations treated as new; cross-caller context reuse; the actual price consumed. Transport labels and WS-resolution branch counters are insufficient proxies.

## 4. xStock archive and bar primitives

Provide raw one-minute OHLC versions and ticker records, including venue event timestamps if captured, `interval_begin`, `captured_at`, IDs, bid/ask/quantities and last. Include the exact scanner symbols and scan times, the 15-minute returned bars, cache snapshot/overlay boundaries and aggregation query. Include normal sessions, sparse periods and the windows used for the reported lag and spread statistics.

Supply the spread percentile calculation, sample counts, eligibility rules, denominator and symbol/session weighting. For claims about unavailable REST history, provide the exact public endpoint, instrument identifier, request parameters, timestamp and raw response, or current authoritative capability documentation.

**Resolves:** constituent age versus bar interval; incomplete/forming bars; archived-row duplication and quote staleness; interpretation of 11.784% spread. Missing event times should remain unknown rather than being replaced by capture times.

## 5. Execution and fee evidence

Provide order-level records linking signal geometry and intent to gate snapshot, snapshot timestamps, validation result (`accepted`, `rejected`, `skipped`), validation start/end, modeled dispatch/arrival, simulated fills and booking. Include all ladder levels used, requested and filled quantity, partial/remainder disposition, exit penalties and cold fallbacks.

For maker orders, include placement/limit/post-only/time-in-force, qualifying price or trade events and event times, cancellation/expiry and all partial fills. If there have been no real fills, state that explicitly. Do not place trades merely to satisfy this request.

Provide effective maker/taker fee schedules by account, product and pair as applicable, and the code/config-selected rate. Include each result's separate fee, spread, slippage and rebate components so costs can be reconciled without double counting. Account/API execution records, if already available and authorized for this review, are more useful than an order-validation acknowledgment.

**Resolves:** actual gate-to-fill age, maker model optimism, synthetic completion, fee assumptions and whether simulation matches intended live orders. Top-of-book touch alone cannot resolve owned maker queue fills.

## 6. Candidate and risk accounting

Provide candidate IDs, originating producer, stored target/stop/entry, missing-value disposition, chosen EV, fallback use, rank components, queue time, promotion decision and rejection reason. Include sizing inputs/output, venue rounding, portfolio/exposure state and limit checks before and after fill-price selection.

**Resolves:** which candidates reach fallback ranking; how often EV overrides it; whether stale geometry changes decisions; whether final modeled exposure respects unchanged risk limits. Counts of a fallback branch alone cannot identify its effect on final rank or portfolio outcome.

## 7. Independent three-arm comparison and operating cost

The report specifies a replacement experiment. If equivalent raw evidence already exists, provide independent trades-ticker, bbo-ticker and synchronized book observations for the same symbols/windows, with raw requests/ACKs, event and receipt times, continuity epochs and quality flags. Include distinct event counts, processing latency/backlog, dropped frames and resource use. Supply archive throttle settings alongside hot/cold archive-count partitions.

**Resolves:** whether bbo is accepted and behaves as intended; whether ticker accuracy is adequate at actual decision times and sizes; whether broad books deliver a useful improvement within operating constraints. Independent states are required: producer labeling on an already overwritten shared cache is not enough.

## Minimum first return

Start with items 1–3 and a small, complete joined execution sample from item 5, including exceptions rather than only successful fills. Those primitives can validate the instrumentation and refine the remaining collection without generating another large ambiguous export. No runtime or profitability conclusion should be supplied in place of unavailable primitives.
