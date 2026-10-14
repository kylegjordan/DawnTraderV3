# CORZ quote-versus-bars investigation — receipt time versus interval label

**Owner:** ANALYST Codex (CC-C)

**Date:** 2026-10-13

**Code ref:** `483e6f4903a65d6da0c3267790f6083b2cf32be0`

**Full-provenance base ref:** `aa6314b43f44b060f3dda81de49b3e326b74b3f7`

**Trigger:** `PRE_SPRINT_SIMULATION_TRUTH_PLAN.md` Stage 3 — CORZ, 2026-10-06 19:00–19:36Z

**Disposition:** §9.4 (3), rule-24 outcome (3)

## Finding

The reported CORZ discrepancy does **not** establish that either Kraken's quote or its trade bar was wrong. It compared two different clocks:

- `xstock_spot_ticker_snap.captured_at` is DawnTrader receipt time; the equities ticker payload has no venue timestamp.
- `xstock_spot_ohlc_1m.interval_begin` is copied directly from Kraken's equities WebSocket payload.
- Kraken's xStock OHLC payloads become available to DawnTrader about 15–16 minutes after that label. The latest/current ticker at bar receipt is much closer to the bar close than the ticker stored under the bar's label.

DawnTrader now stores the bar's receipt clock separately as `arrived_at`, but the live 15-minute scanner, rollup, replay, and calibration paths generally select/order/bucket by `interval_begin` and do not enforce `arrived_at <= decision_time`. The live path therefore calls its newest rolled bar “forming” without modelling when the constituent one-minute rows became available.

This establishes a clock-contract gap. It does **not** establish whether Kraken's equities OHLC label means event time, a shifted interval name, or another vendor-specific convention; no official contract for `ws-equities` OHLC timing was found.

## Symptom reproduction

The original hot-table read covered CORZ bars labelled 2026-10-06 19:00–19:36Z. There were 36 rows (19:02Z absent). Their database-write time was about 917–962 seconds after `interval_begin`.

Representative rows:

| bar label | close | DB write time | label→write | ticker near label | ticker near write |
|---|---:|---|---:|---:|---:|
| 19:00Z | 16.86 | 19:15:52Z | 952.4 s | mid 16.885 | mid 16.855; last 16.86 |
| 19:21Z | 16.70 | 19:36:57Z | 957.4 s | mid 16.875 | mid 16.695; last 16.695 |

The historical rows predate a populated `arrived_at` value, so `captured_at` is a database-write proxy for that window, not asserted as exact receipt. The current control below uses the actual `arrived_at` receipt stamp and shows the write proxy differs by only a few seconds in the present population.

## Population controls

### Current receipt-clock population

Fixed population: every non-null-`arrived_at` row whose `interval_begin` was between database `now()-2h` and `now()-20m`, read on 2026-10-13.

| class | bars | distinct symbols | min label→arrival | p50 | p90 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| `xstock_spot` | 20,151 | 465 | 900.08 s | **953.70 s** | 959.64 s | 962.78 s | 964.25 s |
| `crypto_spot` control | 11,677 | 432 | 0.03 s | **42.60 s** | 58.15 s | 59.94 s | 60.04 s |

The crypto population is the positive control: the same writer and `arrived_at` clock can report a current one-minute bar rather than mechanically manufacturing a 15-minute lag.

### Same-label versus receipt-time price pairing

For the fixed 2026-10-06 18:30–20:00Z xStock population measured during this investigation:

- 36,806 bars across 467 symbols had label→write p50 957.23 seconds (p01 907.26; p99 982.64); 36,720 of 36,806 were between 900 and 1,020 seconds.
- Among 36,744 bars across 466 symbols with a nearby ticker-last pair, the same-label median absolute error was 0.1274%, while the receipt/write-time ±10 s median error was 0.0000% (p90 0.01925%). Receipt-time was closer on 35,058 rows, equal on 1,015, and label-time closer on 671; 28,401 receipt-time pairs matched exactly.

A second current-window control reproduced the shape: among 23,061 xStock bars across 464 symbols with ticker-last pairs, same-label error p50 was 0.13577% versus receipt-time p50 0.0000%; receipt-time was closer on 21,799 rows, equal on 653, and label-time closer on 609.

These are pairing measurements, not a claim that quote midpoint must equal a trade-derived OHLC close. The exact-last matches and class-wide clock lag are the stronger discriminators.

## Raw-wire control

A fresh direct subscription to `wss://ws-equities.kraken.com` at 2026-10-13 21:11:10.998Z returned for SPY/USD:

- OHLC snapshot: `interval_begin=2026-10-13T20:55:00Z`, close 778.02, two trades.
- ticker snapshot at about 21:11:11Z: bid 778.00, ask 778.04, last 778.02.

A same-method crypto control at 21:11:38.789Z returned a BTC current OHLC bucket labelled 21:11Z and a ticker last matching its close. Therefore DawnTrader does not create the old xStock label at persistence; it is present on the Kraken equities wire.

## Code path and current consumers

### Producer and clocks

- `server/services/passive-archive/equity-spot-archiver.ts:115-135` reads Kraken `interval_begin` and passes it through unchanged.
- `server/services/passive-archive/ohlc-batch-writer.ts:247-256` defines and stamps `arrivedAt` as the process-receipt clock.
- `server/services/passive-archive/ohlc-batch-writer.ts:345-363` upserts by `(symbol, interval_begin)`, touches `captured_at=NOW()`, persists `arrived_at`, and uses arrival order for overwrite safety.
- `server/services/passive-archive/equity-spot-archiver.ts:315` stamps ticker `capturedAt` locally; the equities ticker payload supplies no venue clock.

### Current runtime consumers

- `server/asset_classes/xstock_spot/scanner.ts:592` reads 15-minute bars; `:914-915` prices strategy geometry from the latest rolled bar close.
- `server/asset_classes/xstock_spot/ohlc-aggregator.ts:225-297` buckets and orders by `interval_begin`; it does not carry `arrived_at` into the aggregate.
- `server/services/xstock-ohlc-cache.ts:217-329` caches the rollup and merges snapshots/live overlays without an availability predicate.
- `server/core/metrics/regime-inputs.ts` consumes the same xStock OHLC cache for regime refresh.
- `server/services/exit-strategy-replay-service.ts:163-173` reads and orders by `interval_begin` only.
- `server/routes.ts:9052-9060` exposes the live passive-archive status route. Its `computePassiveArchiveStatus` reader in `server/services/drift-dashboard-aggregator.ts:888-997` applies the same wall-clock window start to OHLC `interval_begin` and ticker `captured_at`. That is the mixed-clock boundary in monitoring form: it can skew the dashboard's stored-row and active-symbol comparison even though it does not affect admission or execution.

### Offline and non-current readers

- `scripts/b-xstock-calib-b31a-gate-audit.ts:125-138` reconstructs decision-minute bars from `interval_begin` only while asserting no look-ahead.
- `server/services/amr-context-bonus-shadow.ts:111-146` reads label-time SPY 15-minute snapshots, but `computeContextBonusShadow` has zero production callers at this ref: the repo-wide code search finds only its export definition. Positive control: the same caller-search method finds the passive-archive route plus its aggregator definition and tests. **Disposition:** fold a dormant-path guard into `B-XSTOCK-BAR-AVAILABILITY`; if this module gains a caller at the implementation ref, it must adopt the decided availability contract before activation.
- `server/scripts/b-xstock-freshness-monitor.ts:181-216` also queries OHLC by `interval_begin`, but it is not a running reader: its own header says it is a superseded draft, the required `xstock_freshness_report` migration is absent, and `RUNNING_ISSUES #441` records it as inert and unscheduled. **Disposition:** it remains owned by existing batch `B-XSTOCK-FRESHNESS-MONITOR` / `#441`; that rebuild must consume the contract settled by `B-XSTOCK-BAR-AVAILABILITY`, not independently reinterpret the label clock.

Fixed live-provenance population, 2026-10-13 18:30–20:00Z: 61,940 xStock `signal_eval_provenance` rows across 414 symbols with `bar_interval_sec=900` had `decision captured_at - forming_bar_ts` p01 947.0 seconds, p50 1,484.1 seconds, and p99 2,055.8 seconds. Thus even the youngest bar called “forming” in this population was more than 15 minutes behind the decision clock.

## Provenance and rule-24 taxonomy

### Full history-and-intent read (2026-10-14)

The clock split has three different intent answers that must not be collapsed:

- **Capture boundary: deliberate.** B74 deliberately stored the vendor-supplied OHLC interval label and a locally generated ticker receipt stamp in different primary time fields. That was a raw-storage choice, not an assertion that the two timestamps denoted the same market instant.
- **Use of the perceived current/forming bar: deliberate.** B-NEW-34 deliberately emitted the partial bucket and priced from its latest close to match crypto. On 2026-06-02, B.3 then surfaced the forming-bar choice to Kyle, and Kyle explicitly approved classifying on the in-progress/most-current bar for live decisions; B.4 graded forming-bar emission “OK as-is.”
- **Whether the xStock label actually denotes a currently available/forming bar: not deliberately settled.** No original or later design record defines the xStock OHLC interval label as publication or availability time, measures its label-to-arrival delay, or tests the premise that crypto-style current-bar semantics apply to this feed. Replay likewise gained no receipt/publication-time predicate.

#### Transition chronology

| transition | introducing evidence and intent | what it added | what it deleted or superseded | availability consequence |
|---|---|---|---|---|
| **B74 passive capture** | `ce4a7e408436229d05e9edd48329383edabdd1b9`; `BATCH_74_SCOPE.md`; `BATCH_74_PRE_AUDIT.md` | A sink-only archive. Original producer code maps OHLC `interval_begin` from Kraken and stamps ticker `capturedAt` with `new Date()`. Scope calls the OHLC field “bar start”; ticker snapshots exist for sub-minute information. | The commit adds 18 new files and makes additive bootstrap/schema/canonicalizer changes. Its nine reported deletions are import-formatting changes in `shared/schema.ts`; it replaced no prior bar clock or consumer contract. | The split is intentional as stored provenance. The pre-audit explicitly says there are no v1 readers and accepts storing a wrong/duplicate Kraken `interval_begin` as-is with no inbound bar-quality check. Therefore B74 did not decide decision-time availability. |
| **B79.0a observability scanner** | `a327964a5` (2026-05-08) | A live xStock scanner that reads locally receipt-stamped ticker snapshots and applies the 90-second freshness gate. | No OHLC evaluation path yet; its own later scope records this stage as observability-only. | Establishes a receipt-time liveness gate, not a bar-availability rule. |
| **B79.0m.b first live/VTS bar consumer** | `914a25e05` plus immediate column-name repair `4904ea66b` (2026-05-11); `BATCH_79_0m_SCOPE.md`; `BATCH_79_0m_b_PRE_AUDIT.md` | After the ticker freshness gate, fetches xStock OHLC directly from `xstock_spot_ohlc_1m`, ordered by `interval_begin`, and feeds VTS evaluation. The introducing commit mistakenly queried `timestamp_minute`; `4904ea66b` corrected it to the archive's real `interval_begin` column two minutes later. | Replaces no availability predicate; it adds evaluation beneath the existing receipt-time ticker gate. | This—not B-NEW-34—is the first functional live/VTS promotion of the B74 OHLC archive after the immediate repair. Bar labels were used only for ordering/history while a separate receipt-time quote gate controlled pair liveness. |
| **B79.0m.b2 replay consumer** | `4c60d259e` (2026-05-11); `BATCH_79_0m_b2_SCOPE.md`; `BATCH_79_0m_b2_PRE_AUDIT.md` | Adds xStock replay reads from the same archive, selected and ordered by `interval_begin`. | Supersedes the prior wrong-asset/empty xStock replay lookup. | Replay gains label-time bars without a receipt/publication-time predicate. |
| **B-NEW-34 crypto-parity promotion** | `756b64e4949e7edcd279e8aac6f63130853a1523` (2026-05-15); three design-ask rounds; completion report; governance close `69b3ed8f2` | Local 60/240-minute aggregation keyed by `interval_begin`; latest rolled-bar close becomes evaluation price “to avoid ticker-vs-bar drift”; the current partial bucket is emitted to match crypto; OHLC history is declared the source of truth. | Deletes the direct 1-minute fetch, the scanner's `isPairDataFresh` gate, and the xStock 90-second freshness setting. Ticker data remains enrichment only. | This is the decisive transition: it intentionally removed the only receipt-time gate, but the design asks discuss cadence, parity, partial bars, capacity, and calibration—not xStock label-to-arrival semantics. “Match crypto” assumed the newest xStock label represented a current/forming bar; it did not measure or decide the 15–16 minute availability gap. |
| **B-NEW-35 evolving-bar normalization** | `B_NEW_35_SCOPE.md`; implementation sequence beginning 2026-05-19 | One row per `(symbol, interval_begin)`; later WebSocket updates overwrite the evolving in-progress minute; `captured_at=NOW()` on each update. | Replaces append-only duplicates with an upsert. | Reinforces that `interval_begin` is the vendor bar identity and `captured_at` is the latest database update, not a stable first-availability clock. It adds no reader contract. |
| **B.3 explicit forming-bar decision** | `B_3_REGIME_AUDIT_REPORT.md`; decision commit `3ee0c0579` (2026-06-02) | Identifies that live regime classification includes the newest partial bucket and records Kyle's written decision that forming-bar classification is intended because it represents the in-progress/most-current bar for live decisions. | Supersedes the possibility that partial-bar consumption was merely accidental; completed-bar replay is explicitly rejected as the calibration basis for live parity. | This is direct evidence that consuming the perceived forming bar was intentional. It did not investigate whether the xStock label/arrival relationship made that bucket genuinely current when DawnTrader received it. |
| **B.4 15-minute foundation** | `B_4_BAR_FREQUENCY_RESULTS_REPORT.md`; scope/pre-audit; aggregator commit `64fc9e5e0`; activation `ae2ddc845` (2026-06-03/04) | Changes live xStock evaluation from 60-minute to 15-minute rollups and re-anchors bar-count lookbacks to real time; its architecture table grades forming-bar emission “OK as-is.” | The activation changes the scanner's requested interval from 60 to 15; it does not replace the underlying label-time bucketing or partial-bucket rule. | Inherits and reaffirms B-NEW-34/B.3's deliberate current/forming-bar policy. The design deeply audits bar duration, time-anchored lookbacks, and calibration, but never defines or tests publication/arrival/decision-time availability. |
| **F-G-1 arrival stamp** | `F_G_1_REOPEN_PRE_AUDIT.md`; `4f9df55e107028cfa6bee9d7ff849358c6a4a71c` (2026-09-29) | Adds stable `arrived_at` at the writer chokepoint and uses it for max-by-arrival dedupe plus a cross-flush overwrite guard. | Replaces order-dependent retry/upsert behavior; deliberately leaves `captured_at` semantics and all readers unchanged. | The first explicit bar-arrival clock was created solely for write ordering. The pre-audit says “none on readers”; it did not settle consumer-time availability. |

#### Six-source provenance coverage

| required source | result |
|---|---|
| Actual code at `origin/migration/aws-supabase` | Producer still preserves the validated Kraken interval label; ticker still receives a local capture stamp; aggregation/scanning still use label-time buckets and newest rolled close; `arrived_at` is not a reader predicate. |
| Runtime/database | The fixed populations, raw-wire control, price pairing, and live-decision ages above demonstrate the present 15–16 minute label→arrival behavior and distinguish it from the same-writer crypto path. |
| System Impact Map | Documents the B74 writers, B79 live/replay consumers, B-NEW-34 aggregator/cache path, B-NEW-35 dedupe, and B.4 cadence change. It contains no decision-time availability contract for these bars. |
| System Manual | Records B-NEW-34's partial-bar decision, 60-minute parity, freshness-gate removal, B.3's intended live/forming-bar contract, and B.4's 15-minute supersession. It does not define label time versus publication/arrival/decision time. |
| Reports and ledger | The scopes, pre-audits, design asks, completion reports, `RUNNING_ISSUES #707`, and the placed `B-XSTOCK-BAR-AVAILABILITY` home agree on the transition chronology above. |
| Bridge/canonical | `DawnTrader_System_Architecture_Execution_Flow.md` first gains the xStock OHLC path in governance commit `69b3ed8f27a6774583cbcf9fc33e702a59c40dbb`, describing B-NEW-34's 60/240-minute cadence and source. **Canonical consulted, no coverage** of arrival, publication, receipt, decision-time, or mixed-clock semantics. Positive control: the same search finds its explicit `xstock_spot_ohlc_1m` entry; the target clock-contract terms return zero. |

The targeted absence check was also run across the eleven originating B74, B79.0m, B-NEW-34, B.3, and B.4 scope/pre-audit/design/audit records. Each instrument found its expected bar/freshness/interval/forming terms (2–34 hits per document), while explicit xStock label-to-publication/arrival/receipt-availability contract terms returned zero in every document. This does not negate the written decision to consume the perceived forming bar; it establishes that the prerequisite making that bar genuinely current was never tested or specified.

**Provenance conclusion:** the storage-layer clock split was deliberate, because the two feeds supplied different useful provenance to a passive archive. The later policy of consuming the perceived newest/forming bar was also deliberate: B-NEW-34 introduced it to match crypto, Kyle expressly approved it in B.3, and B.4 retained it. What was not reviewed was the load-bearing feed premise underneath that policy—whether the xStock interval label represented a bar that was actually current and available when received. B79 added the first consumers, B-NEW-34 removed the separate receipt-time liveness gate, and the 15–16 minute xStock label-to-arrival behavior remained unmeasured until this investigation.

**Rule-24 outcome (3): legacy that no longer fits today's intent.** A raw sink that intentionally preserved vendor labels without interpreting availability became a live decision/replay source, but the promotion did not add an availability contract. This is not classified as a B74 producer defect, and no timestamp shift is authorized from the evidence here.

## Competing states and what is settled

| state consistent with the original symptom | status after this investigation |
|---|---|
| DawnTrader adds ~15 minutes in its queue or DB writer | **Excluded as the main mechanism:** raw equities wire already carries the old label; current `arrived_at` reproduces the lag; crypto through the same writer does not. |
| Timezone/DST conversion in DawnTrader shifts the label | **Excluded as the main mechanism:** the wire value is already UTC and copied unchanged. |
| xStock OHLC is true event-time data published ~15 minutes later | **Still consistent.** |
| xStock OHLC uses a shifted/interval-end label convention | **Still consistent.** |
| The whole equities feed is delayed and ticker lacks the timestamp needed to reveal it | **Still consistent**, although bar close matching receipt-time ticker-last is evidence against treating same-label pairing as valid. |
| Quotes and trade bars legitimately differ because they are different price kinds | **True in general and retained as a limitation**; it does not explain the class-wide 900–964 s label/arrival distribution. |
| Sparse trades, corrections, adjusted/consolidated bars, or session-boundary rules affect individual rows | **Still possible for individual rows; not the measured class-wide clock mechanism.** |

Official generic Kraken post-trade and pre-trade APIs expose `trade_ts`/`publication_ts` separately, demonstrating that those are different concepts, but they do not establish the equities WebSocket contract: [PostTrade](https://docs.kraken.com/api/docs/rest-api/get-post-trade), [PreTrade](https://docs.kraken.com/api/docs/rest-api/get-pre-trade). Kraken's xStocks FAQ describes real-time market-maker reference pricing but does not define OHLC label/availability semantics: [xStocks FAQ](https://support.kraken.com/articles/xstocks-faq).

## Disposition and next batch

**§9.4 disposition (3): its own batch, placed before `B-CRON-MISSED-CATCHUP`.**

`HOME: B-XSTOCK-BAR-AVAILABILITY, owner CC-C, placed in SPRINT_TO_LIVE_PLAN.md pre-sprint Stage 3, after the CORZ investigation and before B-CRON-MISSED-CATCHUP.`

The batch starts with a contract decision, not a code patch:

1. Obtain or bound the `ws-equities` OHLC label/publication contract with Kraken, preserving the three still-consistent states above if the venue cannot answer.
2. Define separate event/interval, source-publication (if available), local-arrival, cache-insertion, and decision clocks for xStock bars.
3. Decide live semantics for an unavailable/current bar and replay semantics (`arrived_at <= decision_time` where historical receipt exists; honest unknown/era boundary where it does not).
4. Only after that decision, adapt ingress/aggregation/cache/scanner/replay/calibration/provenance and the passive-archive dashboard together; never silently add 15 minutes to `interval_begin` or relabel historical rows. Re-run the caller census at the implementation ref so a newly activated dormant reader cannot bypass the contract.
5. Re-measure live decision age and same-label/receipt-time pairing after the change, with the crypto control retained.

This batch is a precondition for interpreting historical xStock simulations and therefore stays ahead of the paper reset and learning-record restart.

`REVIEWER: claim-only · /root/corz_claim_reader · HIT: requested raw/provider clocks, consumer predicates, and competing label/publication states · verdict: mechanism bounded, upstream semantic unresolved · re-derived: yes, at 483e6f4903a65d6da0c3267790f6083b2cf32be0 with raw-wire and crypto controls`

`REVIEWER: claim-only · /root/corz_provenance_reader · HIT: found B79.0m.b's immediate column repair and the B.3/Kyle + B.4 explicit forming-bar approvals, which required narrowing “unintentional” to the unverified label→availability premise · verdict: capture split and forming-bar policy intentional; upstream availability equivalence unestablished; rule-24 outcome (3) still holds for the inherited consumer contract · re-derived: yes, from 4904ea66b, B_3_REGIME_AUDIT_REPORT.md, 3ee0c0579, and B_4_BAR_FREQUENCY_RESULTS_REPORT.md at aa6314b43f44b060f3dda81de49b3e326b74b3f7`
