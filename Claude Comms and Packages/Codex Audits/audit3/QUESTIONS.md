# Assignment 3 — requests for missing or cleaner primitives

Source pin claimed by export: `d0eda8ae4ab86e5968f08710be8e382a946126fd`. Requests are evidence requests only; no credential, trade, deployment or implementation is requested. The completed bounded findings are in REPORT.md. No absent primitive was silently replaced by a proxy.

## 0. Restore the strict independent-reading experiment

The r3 filename resolved to `Claude Comms and Packages/Scope Files/CODEX_AUDIT_3_BRIEF.md` (the nested literal request path is absent), and its first-line version check passed. But line 62 puts DHMA's question and current answer on one line; §3 gives the price proposal at line 73 before the questions at 87–91. These statements were exposed in staged reads before the derivations. §2.b has no further reading after line 63; line 64 is blank. The report labels the failed blind gate explicitly.

To obtain genuinely blind corroboration, provide a separate question-only packet to a fresh reader who has not seen those interpretations, with current-reading files physically withheld. This session cannot unsee the statements. No rewrite of its derivation can restore that experimental independence.

## 1. §3 — the decision-instant price and clock evidence

Provide a bounded, contemporaneous sample per **class × lane × decision job**, including accepted and refused observations and at least one positive control for each producer. Needed primitives:

- Raw venue payload/channel, sequence/update ID and venue timestamp exactly as received; local socket receipt and parse/capture times; explicit clock units/timezone and host clock-offset/uncertainty evidence.
- The specific quote/book revision read by the detector, level constructor, ranking calculation, exit trigger and order placement, with bid/ask, sizes/depth, mark/last, local observation times, and the decision timestamp. Retain missing values as missing.
- Order intent, limit/post-only status, submitted size, acknowledgements, partial fills, fill times/prices/fees and liquidity role; paper execution-model version if simulated.
- Effective staleness, book-state and fallback configuration and the deployed sha/process identity for these records.

The archive subscriber is not the active subscriber, an archive nearest-time quote is not a decision quote, a receipt gap is not transit latency, and a side timestamp is not automatically the date of each unchanged level. Provide the current venue channel contract or observed raw-frame schema for the xStock book/ticker and the crypto timestamp fields. These settle source availability/meaning and distinguish missing coverage from quiet markets. Without them I refuse a numeric optimal freshness threshold or an assertion of realized price-side losses.

## 2. Q1 — establish the quote sample's observation process

The manifest calls both quote files full tick resolution; the source writer drops per-symbol arrivals within a throttle (`ticker-batch-writer.ts:107–119`) and the ledger already documents that sampling. Please provide the exact export SQL/source table and runtime throttle settings over each window, drop/buffer/flush-loss counters where available, reconnect/sequence records, and unthrottled raw frames for a matched bounded window. If these files actually bypassed that writer, show that provenance. Do not replace missing frames with forward-filled samples.

Please also supply the intended symbol universe and inclusion/omission reasons. Actual quote symbols are **528 crypto / 467 xStock**, against **571 / 480** on tape. Actual tape windows start September 1 and end September 6 09:13Z (crypto) / September 5 00:00Z (xStock); these are not seven full days. Explain bar omission semantics (no trade, closed session, incomplete bar or capture gap), and the **420 invalid crypto OHLC rows**. This will determine whether any gap can legitimately be filled or whether finer market-event questions require new capture.

## 3. Q1/Q3 — instrument identity, published tick and fee-group map

Provide timestamped raw venue instrument metadata for the sampled windows: venue product/instrument ID, internal symbol, base/quote currency, tick_size (not just pair_decimals), fee group and special maker-rebate eligibility. Include the xStock token/underlying symbol mapping and any verified increment/order-validation evidence. Supply the pair-specific applicable account schedule when it differs from the standard crypto/Pro-xStock ladders.

USDC/USD and USDT/USD occur in the crypto tape. A `crypto_spot` label therefore cannot authorize assignment of the standard crypto fee ladder to every row. Current fee-table scenarios remain conditional until this is mapped. The xStock inferred lattice is descriptive, not venue-published order validity. Historical metadata is needed for historical tick claims; a fresh metadata response can settle only a dated current question.

## 4. §2.b DHMA — intended object and effective input contract

Provide the reviewed **current** DHMA contract: feature definitions, raw sources, input bar/event cadence, volatility lookback and forecast horizon, intended entry/stop/target units, and whether this is a candle strategy or actual L2/print microstructure. The manual asserts L2 while the current detector uses candle proxies; archive documents name a different HMA concept. None is a safe substitute for a current intent decision.

Supply resolved `strategy.dhma` and `expectancy_gates` rows with scope/precedence, version and any call-level overrides, plus representative pre-gate invocation primitives (prices/candles, σ, parameters, raw levels, guard disposition/outcome). The brief asserts live k=1.5 and a=1.001, but the raw settings evidence is absent. Need representative rejected cases and a positive detector/control invocation. The units defect is provable without these; current incidence and the horizon-correct volatility choice are not.

## 5. §2.b strong trend — matched stage denominators, not more closed trades

For the exact two-day observation, provide raw candidate/evaluation lifecycle events keyed to the same candidate, class, mode, process and deployed sha: prefilter route, family membership, regime/allowed strategies, detector invoked, detector null reason or emitted geometry, guards/normalizer, sizing/admission and archive-write disposition. Include effective class/strategy/DBS/minRR settings and exact query defining “evaluation.”

Provide at least one known nonzero strategy at the **same stage**, not a passive count or a prefilter count used as a positive control for an active sink. If a stage has no persisted events, state that gap and supply bounded process counter/log snapshots if they genuinely cover it. A code call exists and favored-list exclusion does not remove materialized eligibility. Zero output cannot localize failure. No closed-trade profit ranking can settle this request.

## 6. Q2 — complete risk sets and censor meaning

Provide all filled entries and positions still open at a fixed, stated observation cutoff, per lane (active paper/live, passive real, passive shadow), with actual entry-fill time, open/close/censor times, strategy, class, exit cause, wall type/version, and delayed-entry/retention rules. Separate never-filled orders from filled positions. Explain whether the five null-close rows in the current file are complete coverage of opens, and provide the actual censor cutoff; the latest quote time is not an acceptable inferred cutoff.

Keep 7-day real and 48-hour shadow walls separate and label wall terminations censored for natural-exit analysis. Preserve the four July 23 active max-hold records with their historical policy; do not relabel them as today's passive walls. Do not supply only successful/closed trades again.

## 7. Q2 and pin — deployment/provenance boundaries

Provide independent deploy/restart records or other admissible operational evidence linking each exit-changing sha to its actual active interval over **July 15 through September 6**, including effective configuration changes. The 39 file-touch rows describe 32 commits from August 25, not an exhaustive deploy history over the trade window. If the old intervals are irrecoverable, confirm that explicitly; Q2 then remains insufficient retrospectively.

Reconcile raw timestamp semantics: current-deploy sha `4dc231e...` is deployed_at `2026-09-05T08:12:21Z` but commit_time_utc `2026-09-05T11:28:00Z`; export built time is `2026-09-06T10:01:02.956Z`, while the exit list includes timestamp-parsing work committed `2026-09-06T13:03:23Z` and that code is present. Do not assume a timezone offset from these differences. The export lacks .git and its referenced `scripts/codex-export/MANIFEST.txt`; provide a content manifest/certificate linking the redacted files to the claimed sha if independent pin verification is required.

## 8. Q3 — executable cost rather than a bar-price opportunity scenario

To answer all-in per-instrument cost/capture, provide matched bid/ask/depth over the same tape horizons, intended order sizes, queue/partial-fill observations and arrival/decision clocks. For maker scenarios, a price touching a level is not two completed maker fills. For taker scenarios, a median spread added to a fee is not the depth cost of a specified order. Current outputs deliberately stop at conditional fee hurdles and observed bar paths. No substitute per-strategy net expectancy is requested or useful for this assignment.
