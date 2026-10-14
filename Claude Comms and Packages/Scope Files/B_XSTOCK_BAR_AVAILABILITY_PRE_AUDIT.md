# B-XSTOCK-BAR-AVAILABILITY — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Batch:** `B-XSTOCK-BAR-AVAILABILITY` · **Issue:** `#707` · **Owner:** ANALYST Codex / CC-C

**Workflow:** Step 2 of 11 · audit first, plan second · **Read ref:** `origin/migration/aws-supabase` at `5ce1cdac3` (the only change from the initial `a604387d...` audit ref was two unrelated `B-CREW-ACCESS-HARDEN` Step-2 documents; no audited component changed)

**Scope:** `B_XSTOCK_BAR_AVAILABILITY_SCOPE.md` r3, Coltrane-approved at `cf011e6d748f7af373dfe867bbf6c4bf8b0f0336`

---

## 0. PREVIOUSLY STATED vs NOW

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 1 | The originating CORZ investigation measured xStock label→`arrived_at` p50 **953.70 s** over **20,151 retained current rows / 465 symbols**. | The bounded two-hour reread at 2026-10-14 ~14:05Z measured p50 **949.585 s**, p95 **959.751 s**, over **15,352 retained current rows / 465 symbols** in the October child, labels 12:07–13:51Z. | Different fixed read window and row population; the conclusion is stable, but the populations must not be pooled. |
| 2 | B-NEW-34b and current source comments describe `xstock_spot_ohlc_60m_snapshot` as bounded at about **15,900–16,000 rows**. | `pg_class.reltuples` estimates **580,769 rows**, total relation size **134 MB**. | The cache read caps each symbol; no target-table delete or truncate exists. The cap is not a storage-retention mechanism. |
| 3 | B.4/current source comments describe `xstock_spot_ohlc_15m_snapshot` as bounded at about **63,600–64,000 rows**. | `pg_class.reltuples` estimates **2,225,519 rows**, total relation size **503 MB**. | Same cause: upsert preserves every historical bucket and no pruning job exists. |
| 4 | The scope left reader-visible capture as a choice between a trustworthy timestamp and an explicit conservative bound. | The plan uses a **primary-database post-commit certificate**, not `arrived_at`, `captured_at`, or an application-clock guess. The xStock revision/current projection commit first; a later statement observes the exact immutable ID and records `visible_by = clock_timestamp()` plus a monotonic `visible_seq`. Until the whole expected ID set certifies and commits, NULL fails closed. | `track_commit_timestamp=off`; `captured_at=NOW()` is not commit proof. The later primary observation proves causal order. The wall timestamp is called an upper bound only while an explicit clock non-regression guard is healthy; the sequence remains the ordering proof. |
| 5 | The scope required exact revision provenance but did not choose its storage shape. | The plan uses append-only 1-minute revision rows plus content-addressed aggregate/window manifests; it does **not** put a 240-ID array on every `signal_eval_provenance` row. | Live estimates show `signal_eval_provenance` already has **25,027,072 estimated rows / 8,519 MB** and `signal_eval_archive` **64,212,184 estimated rows / 39 GB**. Repeating settled revision arrays per strategy evaluation is the wrong cardinality. |

`reltuples` values above are PostgreSQL planner estimates, not exact counts. The positive control is the same catalog query returning both target tables and their sizes; the direct two-hour child-table latency query is an exact count over its stated predicate. A combined parent-table two-hour query timed out at 30 seconds and is a failed read, not evidence.

---

## A. AUDIT

### A1. Six sources read

All six workflow sources apply and were read:

1. **Actual code at the ref.** The shared OHLC writer, equities producer, xStock aggregator/cache, 15-minute scanner, independent 60-minute regime refresh, snapshot prewarm/lifecycle callers, replay, decision provenance, dashboard route/UI, calibration scripts, dormant readers, schema, migrations, and tests were read as files. Grep was used only for the repo-wide entry-point and component censuses after the entry files were read.
2. **Runtime logs and database.** PM2 writer/cache telemetry, authenticated passive-archive API, PostgreSQL settings, current table/partition sizes, bounded latency samples, and signal-provenance sizes were read on staging. The staging UI was **not visually checked**: Codex may not type a password into a login form. The API and UI source were checked; Kyle's visual Step-7 check remains required.
3. **`SYSTEM_IMPACT_MAP.md`.** Consulted for the passive archive writers, xStock aggregation/cache, scanner, regime refresh, snapshots, VTS/replay, provenance, dashboard, scheduling, shared state, and downstream blast radius. Its xStock flow coverage is useful but does not specify revision-visible availability.
4. **`SYSTEM_MANUAL.md`.** Consulted for B-NEW-34's crypto-parity decision, removal of the ticker freshness gate, forming/current-bar policy, snapshot design, B.4's 15-minute activation, and replay/provenance claims. It is silent on publication, commit visibility, revision identity, and availability propagation. Its “exact replay” wording is too strong for mutable snapshots without revision identity.
5. **Batch reports and ledger.** `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, the B74/B79.0m/B-NEW-34/B-NEW-34b/B-NEW-35/B.3/B.4/B73/B.5/F-G-1 records, completion reports, scopes, pre-audits, and design asks were searched by component and symbol. `#441` owns the inert freshness monitor; it does not own unbounded snapshot accumulation.
6. **`bridge/canonical/` plus git archaeology.** The canonical execution-flow corpus documents why the xStock aggregation/cache path existed but has no availability-clock contract. Introducing and deciding commits were read from the origin, including what each replaced or deleted. Canonical is cited for original intent only, not current behavior.

### A2. Provenance answer — why the clocks are mixed

The mixed clocks are intentional at the original archive boundary:

- B74 (`9e9ff010c`, `ce4a7e408`) built a passive sink with no trading consumers. It preserved the venue's `interval_begin` as the OHLC bar identity and stored ticker snapshots on local capture/receipt time. Its design explicitly accepted vendor labels as supplied. That is correct raw provenance, not a producer defect.
- B79.0m.b (`914a25e05`, functional after the immediate `interval_begin` repair `4904ea66b`) was the first intended live/VTS promotion of this OHLC archive. It still sat below a separate receipt-time ticker freshness gate.
- B-NEW-34 (`756b64e49`, governance close `69b3ed8f2`) intentionally removed that 90-second ticker gate, made rolled OHLC the source of truth, used the latest rolled close as the evaluation price, and emitted the perceived current/forming bucket to match crypto.
- B.3 (`3ee0c0579`) explicitly recorded Kyle's acceptance of forming-bar classification. B.4 (`64fc9e5e0`, activation `ae2ddc845`) moved the live path to 15-minute bars and graded forming-bar emission “OK as-is.”
- F-G-1 (`4f9df55e1`) later added `arrived_at` for writer ordering. Its own design said readers were unchanged; it did not establish a consumer availability clock.

**Audit conclusion:** preserve the mixed raw clocks and preserve the approved forming-bar policy. The broken legacy is the missing contract between them: a vendor-labelled, mutable raw revision was promoted into “current,” replay, and exact-provenance claims without recording when that exact revision became readable. Rule-24 outcome remains **(3): legacy no longer fits today's intent** at the consumer contract, while the provider's label/publication semantics remain outcome **(2): relevant but unresolved**. A blind `interval_begin + 15 minutes` rewrite would destroy intended provenance and is prohibited.

### A3. Clock and eligibility truth table

| field/state | meaning after this batch | allowed use |
|---|---|---|
| `interval_begin` | Unchanged Kraken vendor interval/event label and bar key. | Bucketing, ordering, event-label studies. Never renamed publication or availability time. |
| source publication time | Venue-provided publication timestamp, if a documented field becomes available. Currently unavailable. | Provider-currentness only when supplied/documented. |
| `arrived_at` | Local process receipt/enqueue time of the accepted revision; still the F-G-1 latest-arrival ordering key. | Writer ordering and receipt-latency telemetry. Never proof of persistence. |
| `captured_at` | Database statement/transaction timestamp on the mutable current projection. | Operational write metadata only. Not exact commit or reader visibility. |
| revision identity | Immutable event ID for one post-buffer projection attempt, its payload hash, plus whether it actually changed the compact projection, the projection generation assigned by that row-locked update, and the preceding winner it replaced. An identical payload at a later/equal arrival is still a distinct event. | Exact input identity, F-G-1 arrival-watermark/winner ordering, aggregation manifests, provenance, replay. Content equality and certification order never substitute for projection order. |
| `visible_by` + `visible_seq` | A later statement on the authoritative primary observes the exact immutable revision after its first transaction committed, records wall time, and assigns a monotonic database sequence. NULL/missing or a clock fault means unproved/fail closed. | `visible_seq` proves primary causal order. `visible_by` is a conservative wall-time upper bound only in clock-healthy segments; neither is exact commit time or universal replica visibility. |
| aggregate availability | Maximum `visible_by` of the exact source revisions, plus a DB read-observation carried with the aggregate. | Availability-aware 15m/60m consumer reads. |
| cache/snapshot availability | The winning aggregate revision's original identity and availability, carried unchanged through read/merge/write-back. | Cache reads; cache write time never substitutes for source availability. |
| decision/read observation | Primary database wall time plus a monotonic observation sequence from the read that returned the exact revision set, followed causally by the decision. | Live proof that the recorded inputs were readable to the production role on a new primary Read Committed statement. Application wall time remains telemetry, not the sole cross-clock proof. |
| legacy/unknown | Pre-cutover row, NULL certification, overwritten prior revision, or mutable snapshot with no identity. | Event-label/final-row research only; never exact decision parity. |

The consumer states are: `eligible_certified`, `persisted_but_provider_currentness_unknown`, `retained_revision_ineligible_prior_unknown`, `metadata_unknown_legacy`, `clock_fault`, and `unavailable_fail_closed`. “Current/forming” remains a policy label only when the returned revision is availability-eligible; it does not assert a documented venue publication contract. “Database-visible” is scoped to a new Read Committed statement by the production role on the authoritative primary; it does not claim visibility inside a pre-existing Repeatable Read snapshot, through a lagging replica, or to a role denied by RLS/grants.

### A4. Entry points first — repo-wide, tests excluded

The entry-point census was done before tracing components:

| mechanism | production entry points | concurrency result |
|---|---|---|
| Passive archive bootstrap/writer | Exactly **one** production `passiveArchiveBootstrap()` caller at `server/index.ts:1171`; it starts `startBatchWriter()` once. | The writer has a 5-second timer and a shutdown drain. They converge on per-class in-flight coalescing/mutual exclusion in `ohlc-batch-writer.ts`; they are two triggers, not two independent writers. |
| xStock OHLC producer | Exactly **one** xStock call to `bufferOhlcBar`, in `server/services/passive-archive/equity-spot-archiver.ts`. Three sibling asset-class producers are positive controls. | Shared writer/type blast radius; xStock-specific revision behavior must not change crypto or either perp class. |
| xStock scanner | Exactly **one** `start()` from bootstrap and exactly **one** Central Clock subscription. | Runs every 30 seconds with a 25-second timeout; no parallel `setInterval` scanner exists. |
| xStock cache maintenance | Exactly **one** 10-minute interval in `xstock-ohlc-cache.ts`. | It only evicts in-memory cache entries; it is not database snapshot retention. |
| Snapshot prewarm | Manual CLI `runPrewarm`, lifecycle shutdown boundary, and lifecycle restart boundary. | Lifecycle calls share the prewarm `inFlight` mutex and scanner-state gate. No snapshot cron remains. |
| RTB regime refresh | Exactly **one** live scheduler: `RTBRefreshService` Central Clock subscription. | 15-second micro / 120-second macro cadence with `isRefreshing` exclusion. The older per-signal refresh is retired. |
| Passive-archive dashboard | Exactly **one** authenticated route caller of the aggregator. | Non-trading truth surface; API verified, visual UI pending. |
| xStock exit replay | Exactly **one** production caller from VTS close handling. | It queries final 1-minute rows today; no parallel exact-revision path exists. |
| AMR context shadow | Definition/export exists; **zero production callers**. | Dormant activation fence is required. Positive control: the same caller method finds the dashboard and replay callers above. |

### A5. Component census at every hop

#### A5.1 Raw 1-minute archive

- **Writes/creates:** one xStock producer feeds the shared writer. The writer stamps `arrived_at` at enqueue (`ohlc-batch-writer.ts:247-256`), flushes in 5-second batches (`:466-474`), and upserts current OHLCV with `captured_at=NOW()` and latest-arrival protection (`:344-363`).
- **Reads:** aggregator, direct replay/calibration/export/SQL readers, partition/bootstrap/retention utilities, and evidence queries. Semantic readers are dispositioned in A9.
- **Mutates:** the shared upsert is the only live value mutator for a `(symbol, interval_begin)` current row. It accepts the maximum `arrived_at`; an equal timestamp is accepted and the write that is applied last under the database row lock wins. An older-arrival cross-process write is rejected even if it commits later. The compact row replaces OHLCV and therefore destroys the preceding winner's values.
- **Deletes:** partition-retention tooling operates on the family; no per-revision ledger exists yet. Any new ledger must join partition creation, retention inventory, and B75 archive before deletion.
- **Schedules/starts:** bootstrap writer timer plus shutdown drain, mutually excluded per class as described in A4.

#### A5.2 Aggregator and snapshots

- **Writes/creates:** prewarm and cache write-back upsert 15m/60m snapshot rows. Live aggregation creates in-memory bars.
- **Reads:** cache reads both snapshot tables and overlays raw live aggregation. Scanner consumes 15m; RTB regime refresh consumes 60m. Historical scripts read raw or snapshots directly.
- **Mutates:** snapshot upsert updates values and `captured_at`; live-over-snapshot merge lets live win by bucket label. Both discard source revision identity/availability today.
- **Deletes:** target-table `DELETE`/`TRUNCATE` census returned **zero**. Positive controls found real deletes in B75 retention and recompute code. Thus snapshot storage is unbounded despite bounded reads.
- **Schedules/starts:** manual/lifecycle prewarm plus cache misses/write-back; lifecycle paths have mutual exclusion. There is no cleanup scheduler for stored snapshot buckets.

#### A5.3 Live decisions and provenance

- **Writes/creates:** scanner creates xStock evaluations; provenance writer stores forming-bar value, settled timestamp/count/hash, but not the exact aggregate revision or availability observation.
- **Reads:** scanner gets 15m cache data; `RTBRefreshService` independently obtains 60m regime input. The 60m path currently reduces the fetched bar window immediately to volatility, trend strength, and ADX, so the exact bar window disappears before the refresh outcome or later promotion is persisted. DBS, regime, strategy inputs, and latest-bar pricing all inherit those reads.
- **Mutates:** caches replace entries by key/TTL; decision records are append-only but point to mutable/finalized bar representations.
- **Deletes:** provenance/archive retention operates by partitions; no deletion is proposed in this batch without archive coverage.
- **Schedules/starts:** scanner and RTB refresh are distinct Central Clock subscribers with distinct cadences. They do not share a single read, so both must use the same contract rather than fixing only the scanner.

#### A5.4 Replay, calibration, exports, and dashboard

- **Writes/creates:** replay produces derived outcomes; calibration scripts/reports produce evidence; dashboard produces a response payload; raw export creates offline tapes.
- **Reads:** B73 exit replay reads compact final 1-minute rows by label; B31a claims no-look-ahead from label time; dashboard combines OHLC label-window and ticker receipt-window counts; other studies use final-row/event-label history.
- **Mutates/deletes:** these paths do not mutate the source tables. Their risk is semantic promotion, not competing state writes.
- **Schedules/starts:** exit replay is called on close; dashboard is request-driven; the named studies/exports are manual. The freshness monitor is unscheduled and remains so.

### A6. Current runtime and database truth

1. Runtime/code refs are deliberately separate: PM2 `dawntrader` is online on Node 20.20.0 at deployed checkout `94bf16d1022b8cb24c027df9aa721fb1d0333f18`, while this audit reads current origin `5ce1cdac3`. The deployed writer still has the same direct mutable upsert/no-`visible_by` shape; code changes are planned against origin.
2. PostgreSQL 17.6 positive controls at 2026-10-14 14:21:30Z returned `pg_is_in_recovery()=false`, default isolation `read committed`, `track_commit_timestamp=off` (postmaster setting), and `synchronous_commit=on`. The public-schema column control found 103 `arrived_at` columns and 0 `visible_by` columns. Therefore the system cannot recover exact commit timestamps after the fact and has no current certificate object.
3. The current xStock October child, for rows with vendor label in the preceding two hours, contained **15,352 retained current rows across 465 symbols**. Label→arrival was p50 **949.585 s**, p95 **959.751 s**. Arrival→`captured_at` was p50 **2.172 s**, p95 **4.734 s**, max **5.089 s**. The latter measures current retained-row timestamps, not commit visibility and not all attempted revisions.
4. Current available PM2 telemetry contained **107 xStock upsert lines** from 13:57:45–14:06:35Z (**530 s**): **20,162 accepted rows**, min **141**, max **294**, mean **188.43 per flush**, or **38.04 accepted rows/s**. This is accepted/upserted rows, not unique content revisions.
5. Snapshot telemetry positively showed a 72-symbol / 17,280-bar read at 17,916 ms and a later one at 1,835 ms; 1-symbol / 60-bar reads were about 32 ms. Write-back positively showed 1,728 rows at about 212–231 ms and 24-row writes at about 29–40 ms. Performance is variable enough that availability tests must exercise pool/query delay, not only an immediate in-memory path.
6. The authenticated `/api/analytics/passive-archive-status?window=rolling_24h` call returned HTTP 200. The xStock row reported configured 473, OHLC rows 189,729, ticker rows NULL, active symbols NULL, and status `COUNT_UNKNOWN` after a timeout; disk was 31.2 GB. Source inspection confirms that when both counts exist the endpoint uses `max(label-window OHLC symbols, captured-window ticker symbols)` and the UI calls it “Active in window.” That is a mixed-clock operational claim.
7. The database read **141,834,767,507 bytes = 132.09 GiB** on the 2026-10-14 capacity recheck. The authoritative live `database_monitor` constants are `plan_cap_mb=204800` (**200 GiB**), warning 0.65, and critical 0.80; these are the B75 Supabase Pro cap controls, not a guessed provider-dashboard value. Eighteen xStock 1-minute child partitions total an estimated **22,389,880 rows / 12 GB**, spanning April 2026 through September 2027. A naïve ledger at the observed accepted-row upper-rate would add about **26.3 million rows over eight days**; using the current family average of roughly **575 bytes/row including indexes** gives an order-of-magnitude upper bound around **15 GB**. This is a capacity bound, not a forecast: content dedupe and actual revision rate must be measured before enforcement.

### A7. Findings

| ID | audit finding | consequence |
|---|---|---|
| **A1** | The raw mixed-clock design and forming-bar policy were intentional; the availability premise underneath the consumer promotion was never specified or measured. | Preserve labels and policy; add a contract. Do not shift timestamps or resurrect the old ticker gate. |
| **A2** | `arrived_at` is receipt/enqueue and `captured_at` is write statement/transaction time. Commit timestamps are unavailable. PostgreSQL wall time is not monotonic and visibility is observer-scoped. | Neither may impersonate reader visibility. Use an exact-ID post-commit primary certificate with monotonic certification ordering, expected/returned-set equality, clock health, and fail-closed absence. Keep certification order separate from F-G-1 projection-winner order. |
| **A3** | The mutable current-row upsert destroys preceding OHLC revisions, while its deliberate winner contract is maximum `arrived_at` and, on equality, last database-applied update; it accepts a later/equal arrival even when OHLCV is identical. An older arrival rejected after waiting on another process must never reappear through a later certificate. | Exact forward replay requires a distinct immutable event for every post-buffer projection attempt plus projection outcome/generation/predecessor evidence. Content equality cannot erase an arrival-watermark advance. The as-of reader must choose the applied winner before checking eligibility; legacy overwritten history stays unknown. |
| **A4** | Aggregation, snapshot read/write-back, collision merge, and in-memory cache all reduce a bar to label plus OHLCV/count. | Create an xStock-specific availability-aware aggregate type and preserve the winning revision object end-to-end for 15m and 60m. |
| **A5** | The scanner and independent RTB regime refresh are separate live consumers. The 60m RTB path immediately reduces its bar window to three scalar regime inputs. | Both must use one canonical eligibility API; scanner-only repair is incomplete. Carry a typed 60m window manifest/read observation through the scalar reduction and persist every refresh outcome and promotion. Dormant 240m must hard-fail until migrated. |
| **A6** | Current decision provenance names values/timestamps/hashes but not exact revision identity or the read that proved availability; RTB refresh outcomes do not retain the 60m window that produced their scalar regime inputs. | Store scanner 15m and RTB 60m evidence independently: forming aggregate, content-addressed window manifest, DB read observation, and refresh-attempt/promotion linkage. |
| **A7** | B73 replay and B31a no-look-ahead claims use final rows ordered by vendor label. | Post-cutover exact replay uses certified revisions; retained-late/prior-overwritten and legacy cases are reported separately as unknown. |
| **A8** | Dashboard/API combine label-window OHLC coverage with receipt-window ticker coverage. | Return separately named label-, receipt-, and visible-window measures; remove the ambiguous combined xStock claim. |
| **A9** | Twenty-eight semantic reader surfaces exist: 26 TypeScript/Python and 2 SQL. Some are live/replay, others are valid final-row/event-label studies. | Migrate live/exact-claim readers; fence or explicitly label historical/export readers. A source fence prevents new unclassified readers. |
| **A10** | Snapshot tables are not storage-bounded: 15m estimated 2.23M rows and 60m 0.58M, with no target delete. | File a separate retention batch. This batch may make reads revision-aware/bounded but must not smuggle destructive cleanup into the availability change. |
| **A11** | The raw ledger's worst-case hot footprint is material against a 132.09-GiB database and the governed 200-GiB cap, while provenance tables are already large. | Capture-only rollout and a fixed 160-GiB pre-reserve ceiling precede enforcement; archive-delay and index-rebuild reserves are additional left-hand terms; manifests deduplicate settled windows; hot revisions archive through B75 before deletion. |
| **A12** | System Manual/SIM/canonical documents explain bar cadence and cache intent but are silent on availability; Manual's exact-replay wording overstates current evidence. | Update governance with the clock dictionary, era boundary, and limits; canonical silence is recorded, not backfilled as historical intent. |
| **A13** | Provider label/publication meaning remains undocumented in the public xStock/equities corpus. | Provider-currentness remains explicitly unresolved. A future documented publication timestamp can extend the contract without rewriting vendor labels. |
| **A14** | After the cutover, the prior label-only reader still cannot establish availability. Returning it to decision duty would contradict the new live gate and could make an uncertified decision look exact. | Rollback is a fail-closed xStock admission/RTB-promotion pause with the old reader shadow-only. It preserves exit handling and evidence; it never resumes label-only decisions under the certified era. |

### A8. Separate finding — snapshot retention

# 🟨 FINDING — xStock snapshot tables are not bounded

**Evidence:** the 15m and 60m relations are estimated at 2,225,519 and 580,769 rows respectively; the source/table census finds bounded per-symbol reads but no delete/truncate against either target. Existing design text calls them about 64k/16k bounded.

**Ledger result:** `#441` is the inert freshness monitor and a stale-snapshot concern, not stored-bucket retention. No existing batch/issue found owns accumulation of historical snapshot buckets.

**Disposition:** `#1194`, home `B-XSTOCK-SNAPSHOT-RETENTION`, immediately after `B-XSTOCK-BAR-AVAILABILITY` and before `B-CRON-MISSED-CATCHUP`. It owns retention horizon, archive/rebuild guarantees, deletion safety, and cleanup execution. This availability batch owns schema compatibility and bounded indexed reads, but no destructive historical cleanup. If governance refuses the new home, scope must be explicitly amended before any delete is implemented.

### A9. Semantic reader disposition

The census population is **28 direct semantic reader files: 26 TypeScript/Python and 2 SQL**. The dashboard route/UI are downstream presentation surfaces in the dashboard reader's disposition, not additional direct table/cache readers. Schema declarations, partition creators, retention/bootstrap utilities, tests, evidence-only verification queries, and comments are compatibility/control surfaces rather than semantic readers.

| group | readers | disposition |
|---|---|---|
| Canonical bar substrate | `ohlc-aggregator.ts`, `xstock-ohlc-cache.ts`, `b-new-34b-prewarm-snapshot.ts` | **MIGRATE** 15m and 60m; **FENCE** 240m. |
| Live decision paths | `scanner.ts`, `server/core/metrics/regime-inputs.ts`, `eval-cycle.ts` | **MIGRATE** to the single eligibility/provenance API. |
| Exact-claim replay | `exit-strategy-replay-service.ts`, `b5-w20c-provenance-replay.ts` | **MIGRATE post-cutover; legacy UNKNOWN**. |
| Operational truth | dashboard aggregator/route/UI stack | **MIGRATE** to clock-specific fields. |
| No-look-ahead calibration | two B31a gate-audit scripts | **MIGRATE OR RETIRE THE EXACT CLAIM**. |
| Older label-time studies | eight B.1/B.3/B.4/backfill scripts | **HISTORICAL-ONLY/FENCE**. |
| Geometry/pattern/HCE | five study files | **HISTORICAL-ONLY/FENCE**. |
| Corporate-action SQL | one SQL reader | **HISTORICAL-ONLY/FENCE**. |
| Raw tape export SQL | one SQL reader | **RAW EXPORT** with era/availability columns when present; legacy labelled unknown. |
| AMR context shadow | `computeContextBonusShadow` | **ACTIVATION FENCE** until canonical. |
| Freshness monitor | `b-xstock-freshness-monitor.ts` | **RETAIN INERT under #441**; inherit this contract when rebuilt. |

The exact per-file list remains the approved scope §4.5 inventory and will be regenerated at the implementation ref. A file added or newly reachable after this audit is not grandfathered; it must be classified.

### A10. Audit decision

Proceed, but as a staged architecture cutover rather than a timestamp correction. The minimum safe unit is: immutable raw revisions, a post-commit database certification bound, revision-aware 15m/60m aggregates, one live eligibility API, causal decision provenance, honest replay eras, and clock-specific monitoring. The implementation may begin capture before enforcement, but it may not enforce while storage headroom, certification repair, reader parity, or crypto controls are unresolved.

---

## B. IMPLEMENTATION PLAN

Every item names the audit finding(s) it falls from. There are no `UNAUDITED` implementation items.

### P1. Publish the canonical contract and era boundary

**Falls from A1, A2, A12, A13.** Add one canonical xStock bar-availability contract module/document defining the A3 clock/state table, contract version, cutover timestamp/revision era, and provider-currentness limitation. Preserve `interval_begin`; prohibit constant shifts and the deleted ticker gate as substitutes. Correct the System Manual's exact-replay wording and add SIM flow/blast-radius coverage.

### P2. Add an xStock-only append-only revision ledger

**Falls from A2, A3, A11.** Add a daily-partitioned xStock 1-minute revision-event table with a distinct immutable event/revision ID, symbol, vendor label, exact OHLCV/source fields, `arrived_at`, content hash, writer boot/contract version, nullable `visible_by`, nullable monotonic `visible_seq`, certificate-primary identity, clock-health state, and creation metadata. For every post-buffer projection attempt also record an immutable outcome: `projection_applied`, a row-local `projection_generation` returned by the actual row-locked projection update, `supersedes_revision_id`, and a reject reason when it did not become the projection. Keep the existing compact current table as the operational projection and store its winning event ID/generation.

**Content equality never deduplicates the event.** A later or equal `arrived_at` with identical OHLCV gets a new immutable event ID, advances the compact projection's arrival watermark, receives the next applied generation, and points to the prior winner. Payload bytes may be content-addressed/reused as a storage optimization only if the event row still carries its own immutable ID, arrival, outcome, generation, predecessor, and payload hash; an earlier event ID may never be reused for the later arrival. Count accepted input frames, post-buffer attempts, repeated-payload attempts, applied winners, and rejected older arrivals separately. Prevent update/delete/ID reuse outside the reviewed archive lifecycle.

The pre-flush rule remains the current `dedupeLatestArrival` contract. For each same-key buffer group, maximum `arrived_at` wins; on equality, the last buffered frame wins. Only that winner becomes the post-buffer projection-attempt event. The losing in-buffer frames never touched the database projection, so they receive no projection generation and are counted as `buffer_superseded` telemetry rather than being represented as applied/rejected database revisions. The xStock winner-event insert and current-projection upsert occur in one transaction. The projection increments its generation only inside the update that actually wins after row-lock acquisition; a database sequence allocated before waiting is not sufficient. Maximum `arrived_at` still wins across processes/flushes, equality still lets the last applied update win, and an older arrival that loses the guard commits only a rejected revision event with no generation. Crypto and both perp classes retain their existing path and schema.

### P3. Certify visibility after the revision transaction commits

**Falls from A2, A3.** After the revision/current transaction's awaited `COMMIT` resolves, issue a second statement on the authoritative primary for the exact returned immutable revision IDs. In one certification transaction it observes those rows under Read Committed, assigns monotonic `visible_seq` values, and sets `visible_by = clock_timestamp()` only where NULL. The writer compares the expected and returned ID sets exactly; zero/partial/wrong matches are failures, never success. Current Drizzle 0.39.1 awaits `COMMIT` before resolving its transaction promise, but the implementation test must pin the actual future call order rather than rely on library lore.

The certificate proves the source revision was visible to that primary statement; it does not prove universal replica/snapshot/role visibility. `visible_by` is a conservative wall-time upper bound only while a persistent database-clock non-regression guard is healthy; the monotonic sequence is the causal-order proof. The certification timestamp precedes the certificate transaction's own commit, so it is not called certificate-visible time. Readers see NULL until that second commit and fail closed.

On certification failure, partial return, clock regression, or primary/topology mismatch, retain the immutable revision with NULL/no eligible sequence and raise bounded telemetry. A repair job may later observe and certify the committed exact ID; this is later but still safe. Never backfill from `arrived_at`, `captured_at`, or label time. Tests delay flush, pool checkout, first commit acknowledgement, certification, and certification commit; mutations replacing the certificate with any earlier clock or skipping ID-set equality must fail.

### P4. Partition, retain, archive, and gate capacity before enforcement

**Falls from A5, A11.** Add revision partitions with creator/headroom/bootstrap coverage. Hot retention is at least **8 days** (B73's 7-day maximum hold plus a 14-minute ATR prefix and operational margin), then B75 warm/cold archival before deletion. First deploy capture-only and measure accepted frames/s, post-buffer projection-attempt events/s, repeated-payload event share, bytes/event plus any separately content-addressed payload bytes, certification lag/nulls, partition growth, archive handoff, and exact heap/TOAST/index cost over **8 consecutive calendar days containing at least five complete venue-active sessions, at least 100,000 projection-attempt events, and at least 400 symbols**. A shorter or incomplete population does not authorize enforcement.

The authoritative limit is the live B75 `database_monitor.plan_cap_mb=204800` (**200 GiB**) and its critical threshold 0.80. Reserve **40 GiB** (20%) for normal database/WAL/maintenance operation by setting the steady/peak admission ceiling to **160 GiB**. Define `D_gate = pg_database_size(current_database())` at the end of the capture window; `R_archive = max(5 GiB, one measured full calendar day's total new availability-store growth)` for one late archive handoff; and `R_index = max(8 GiB, the exact total size of all new availability-store indexes)` for one concurrent index replacement/rebuild. Enforcement passes only when **`D_gate + R_archive + R_index <= 160 GiB`**, all three terms are measured at the same graded ref, and the B75 archive proof has successfully exported/read-back-verified one revision partition without deletion-before-verify. The observed 38.04 accepted rows/s and ~15-GB naïve eight-day value are bounds only and cannot satisfy the gate.

Capture stops before enforcement if the inequality fails, `pg_database_size` reaches 160 GiB, partition/archive health is unknown, or measurement coverage is incomplete; old consumers remain unchanged because cutover has not occurred. After enforcement, the same event stops new availability capture and automatically pauses new xStock scanner decisions plus RTB reconfirmation/promotion under P14; it never deletes evidence or falls back to label-only input. A critical system alert records every term and the last good partition. Capture/resume requires the inequality to pass again and the archive/index health checks to be green; changing the 200-GiB cap, 40-GiB operating reserve, or either reserve formula is a scope amendment requiring Kyle's decision and Coltrane review, not an implementation toggle.

### P5. Introduce a specialized revision-aware aggregate type

**Falls from A3, A4, A5.** Do not broaden shared crypto `OHLCData`. Define an xStock aggregate carrying vendor bucket timestamp, OHLCV/count, aggregate revision ID/hash, exact source revision-set hash/reference, maximum source `visible_by`/`visible_seq`, database `read_observed_at`/`read_observed_seq`, primary identity, contract version, and eligibility state. The aggregation SQL records the database observation in the same read.

The as-of algorithm preserves F-G-1 explicitly. For each `(symbol, interval_begin)`, first identify the greatest **applied projection generation visible to the read**, without filtering on certification; rejected/superseded-in-buffer revisions have no generation and can never win. Then require that exact winning generation's certificate be non-NULL, clock-healthy, on the expected primary/contract, and `visible_by <= requested_cutoff`. If the winning generation is uncertified or its bound is after the cutoff, return `retained_revision_ineligible_prior_unknown`/fail closed—never resurrect a lower generation merely because it certified earlier. Only after every constituent minute passes that rule may aggregation form the 15m/60m bar. This makes an older-arrival late commit harmless and makes equal-arrival inverted certification order resolve by database application generation, not certificate order.

For a live read, aggregate availability is the maximum certified source bound; the read observation proves that exact set was readable. For a simulated historical read, the cutoff is in the same database availability clock. Unknown/NULL revisions cannot silently fall back to the compact row.

### P6. Add append-only aggregate revisions and content-addressed manifests

**Falls from A4, A6, A11.** Persist immutable aggregate revisions for material 15m/60m value/source-set changes. Persist a content-addressed settled-window manifest once per distinct `(symbol, interval, window_hash)`, containing ordered aggregate revision identities and contract metadata. Decision provenance stores the forming aggregate revision ID plus settled manifest ID/hash, not a repeated array of roughly 240 IDs on each of ~25 million provenance rows.

Retain manifests with their source/aggregate revisions while referenced by the hot exact-replay horizon, then archive through B75. Hash collision handling compares canonical payload before reuse.

### P7. Migrate both snapshots and the cache merge

**Falls from A4, A5, A10.** Add revision-aware columns/pointers to both 15m and 60m snapshot schemas. Snapshot read and write-back preserve the aggregate revision and original source availability; snapshot write time remains separate. On a label collision, live may still win, but the merge must copy the entire winning revision object. A cache hit must return the original availability/read evidence, not cache insertion time.

Reads remain bounded/indexed per symbol. Historical snapshot deletion is explicitly deferred to `B-XSTOCK-SNAPSHOT-RETENTION`. The 240m fall-through throws a contract-version/unsupported error until separately migrated and reviewed.

### P8. Put scanner and RTB regime refresh behind one eligibility API

**Falls from A5, A6.** Migrate the 15m scanner and independent 60m regime refresh to the same xStock availability-aware API. The scanner's latest close, DBS, regime classification, strategy inputs, and evaluation price must all derive from the same eligible revision set for that evaluation. Extend the refresh result with a required xStock-only typed `Xstock60mBarEvidence`: interval, forming aggregate revision, ordered content-addressed 60m window-manifest ID/hash, maximum availability bound/sequence, database read observation/primary, contract version, and eligibility state. `computeRefreshRegimeInputs` must carry that object unchanged beside volatility/trend-strength/ADX; reducing bars to scalars may not discard it. Crypto keeps its current result and explicitly has no xStock evidence. Missing/NULL/unsupported metadata yields a named no-decision/fail-closed state, not a label-only fallback.

Preserve the approved forming-bar behavior: the forming aggregate remains eligible when its exact contributing revisions are certified and readable. The policy no longer implies that Kraken's vendor label is publication time.

### P9. Extend decision provenance without per-row array explosion

**Falls from A5, A6, A11.** For each post-cutover scanner decision, record contract version/era, database read observation, application decision timestamp as telemetry, 15m forming aggregate revision ID, 15m settled-window manifest reference/hash, eligibility state, and provider-currentness state. Enforce foreign-key/readback integrity appropriate to partition/archive constraints. Provenance writes may not manufacture identity from a mutable snapshot hash alone.

Persist the independent 60m RTB evidence separately in an append-only refresh-attempt record keyed by attempt ID and RTB signal ID. Every attempted xStock refresh writes one terminal outcome—reconfirmed, rejected by availability, rejected by SQE, processing error, or deleted—with either its exact typed 60m manifest/read observation or an explicit unavailable reason; a queue-row deletion must not erase the attempt. A reconfirmed queue row stores its latest eligible attempt ID. Promotion copies that attempt ID plus the 60m manifest/read observation into durable promotion/open provenance and refuses if the row has no eligible latest attempt. Replay/readback must recover the ordered 60m aggregate set, recompute the three scalar regime inputs, compare them with the recorded values, and prove rejected/error outcomes and promotions retain the same attempt/evidence linkage.

### P10. Make replay and calibration era-aware

**Falls from A3, A7, A9.** Provide one revision-aware replay helper. Exact post-cutover reconstruction selects certified revisions/manifests whose availability is at or before the simulated cutoff and verifies the recorded source set. Report separately: eligible exact revision, retained revision ineligible/prior revision unknown, metadata unknown/legacy, and missing.

Migrate B73 exit replay, B5 provenance replay, and the two B31a audits. Fence the remaining studies as final-row/event-label research. No legacy run may be relabelled exact because the final retained row happens to have an old `interval_begin`.

### P11. Split dashboard fields by clock

**Falls from A8.** Replace the xStock combined “Active in window” semantic with explicit `labelWindowSymbols`, `receiptWindowSymbols`, and `visibleWindowSymbols` (plus unknown/error states and denominators). Update route types/tests and UI copy. Preserve separate price-kind language: this batch does not claim ticker last/mid equals OHLC close.

### P12. Fence dormant and future readers

**Falls from A5, A9.** Add a source/contract fence that recognizes the parent, child naming family, both snapshots, exported cache functions, and canonical revision API. Any semantic reader must be registered as live/replay or explicitly historical/export. Keep AMR shadow dormant, 240m unsupported, and #441 unscheduled. Update #441 to cite this contract as its prerequisite.

### P13. Test the contract with adversarial timing and mutations

**Falls from A2–A9.** Required coverage:

- a real two-connection integration fence: hold the first transaction open and prove certification cannot match; commit and prove exact expected-ID certification; roll back and prove zero; then exercise partial/wrong/reused IDs, certification rollback/timeout, clock regression, and repair;
- two-process F-G-1 mutations: an older-arrival write that commits/certifies after a newer winner must remain `projection_applied=false`, and equal-arrival writes with deliberately inverted certification order must still resolve by row-locked projection generation;
- an identical-content watermark mutation across separate flushes/processes: apply `X@A1`, then identical `X@A3`, then delayed changed `Y@A2`; prove `X@A3` has a distinct event ID and next applied generation, `Y@A2` is rejected, and replay recovers the exact predecessor/generation chain. Pair it with a same-buffer fixture proving only the `dedupeLatestArrival` winner becomes a projection-attempt event and the other frames are counted `buffer_superseded`;
- delayed 5-second flush, pool checkout, first transaction/commit acknowledgement, certification, and certification commit;
- decision/read at boundary−1 ms, boundary, and boundary+1 ms in the database availability clock;
- NULL certification, repair-to-later-safe-bound, retained-late/prior-overwritten, and pre-cutover legacy fixtures;
- 15m and 60m aggregation, snapshot readback/write-back, live-over-snapshot collisions, TTL cache hits, restart/prewarm, and 240m refusal;
- scanner source fence plus typed 60m evidence surviving scalar reduction; append-only RTB attempt rows for every outcome; reconfirmed-row and promotion linkage; 60m manifest replay/readback that reproduces volatility/trend-strength/ADX; B73/B31a era classification;
- dashboard old-versus-new positive population; UI/API names;
- paired shared-writer fixtures across all four archive classes and byte/behavior no-change controls for crypto;
- mutations that drop availability/revision fields, substitute receipt/cache/write time, accept NULL, or add 15 minutes to the label.

### P14. Stage deployment, observe, enforce, and retain rollback evidence

**Falls from A6, A8, A11, A14.** Deploy in phases:

1. **Additive capture:** schema, partitions, xStock revision/current atomic write, post-commit certification, repair telemetry; consumers remain old.
2. **Capacity/quality gate:** measure material revision rate, bytes, certification latency/NULL repair, archive readiness, and crypto no-change.
3. **Dual-read:** compare old and revision-aware 15m/60m results, snapshots/cache collisions, manifests/provenance, replay categories, and dashboard measures without changing decisions.
4. **Enforce:** switch scanner and RTB refresh together to the canonical API; keep 240m fenced and legacy exact claims refused.
5. **Verify live:** collect a pre-registered venue-active population of at least 20,000 xStock revision records / 400 symbols and 5,000 crypto control records / 300 symbols. Every sampled post-cutover xStock decision must carry revision/availability state. The “zero consumed after availability cutoff” result is accepted only after the same detector catches deliberately delayed/time-shifted fixture violations.

Rollback is fail-closed and has no label-only decision mode. A per-symbol missing/late certificate produces only that symbol's named no-decision. The rollout controller automatically enters `paused_contract_fault` on any exact-ID/set mismatch, projection-generation/predecessor gap, certificate primary/clock fault, manifest/value mismatch, post-cutoff consumption, or **five consecutive one-minute buckets in which at least 50% of attempted xStock scanner/RTB reads are contract-unavailable, with at least 100 total attempts across those five buckets**. It immediately blocks new xStock scanner decisions, RTB reconfirmations, and RTB promotions; existing-position exit handling remains on its separate existing feed and is not disabled by this batch.

The prior reader may run only as `rollback_shadow_uncertified`, with `decision_eligible=false`; its outputs are stored separately and can never populate exact decision provenance. The automatic pause needs no human permission. ANALYST Codex/CC-C may deploy a repair while the pause remains; only Kyle may authorize resume after the original trigger is fixed, the capacity/certificate/manifest checks pass, and Coltrane verifies the evidence. Any request to trade from the old path is a new scope decision, not rollback. A critical deduplicated alert records trigger, affected population/denominator, contract/primary identity, last-good attempt/manifest, and rollout era; it remains active until repaired and is resolved only with readback evidence.

The mandatory rehearsal injects one integrity fault and one five-minute availability storm while the old reader returns plausible data. It must prove: the pause fires; no new xStock scanner decision, RTB reconfirmation, or promotion occurs; the old values appear only in the uncertified shadow era; every post-cutover exact-provenance query returns zero decisions after the fault; the detector first catches an intentionally mislabeled exact fixture as its positive control; existing exits continue; and resume requires Kyle's recorded authorization plus a healthy canonical read. Raw labels, revisions, certificates, manifests, alerts, and failed attempts remain intact. Staging verification uses API/log/database evidence; the UI remains “not yet visually checked” until Kyle checks the page.

---

## C. Verification matrix and stopping conditions

| gate | pass condition | stop condition |
|---|---|---|
| Schema/capture | Exact xStock revisions and current projection commit atomically; other classes unchanged. | Partial write, class crossover, missing partition, or material headroom breach. |
| Certification | Exact expected IDs certify only after first commit on the authoritative primary; sequence proves order; wall bound is used only in clock-healthy segments; NULL/fault fails closed and repairs later. | Partial/wrong ID success, topology/clock ambiguity, derivation from label/receipt/current-projection time, or any NULL pass. |
| Winner order | As-of selection chooses the greatest applied projection generation first, then certifies that exact winner; older-arrival rejection, equal-arrival inverted-certification, identical-content watermark, and same-buffer disposition mutations pass. | Certification-first filtering, rejected revision selection, content dedupe erasing an arrival event, reused event identity, or certificate order changing an equal-arrival winner. |
| Aggregation/cache | 15m/60m preserve exact revision/manifest and winning availability through collision/cache/prewarm. | Value and identity diverge, cache time substitutes, or 240m returns legacy shape. |
| Live decision | Scanner and RTB refresh both consume the canonical contract; scanner 15m provenance and every RTB 60m refresh outcome/promotion identify their independent exact inputs. | Any label-only live bypass, scalar-only RTB refresh/promotion, missing terminal attempt row, or permissive fallback. |
| Replay | Post-cutover exact reconstruction succeeds; legacy/overwritten cases remain separately unknown. | “Exact” claim from mutable final rows or inferred constant offset. |
| Monitoring | API/UI fields name their clock and denominator. | Combined xStock activity field survives. |
| Storage | After the full 8-day/five-session capture population, `D_gate + max(5 GiB, one-day growth) + max(8 GiB, new-index size) <= 160 GiB`, against the governed 200-GiB cap, and archive readback succeeds before deletion. | Estimate-only/short-window activation, 160-GiB reach, failed inequality, unknown archive/index term, or delete-before-archive. |
| Rollback | Injected integrity and availability faults pause new xStock decisions while old reads remain shadow-only; alert/provenance/readback show zero falsely exact post-fault decisions and exits remain live. | Old-path decision, exact-era mislabel, unalerted pause, evidence deletion, or resume without the required authority/proofs. |
| Observation | Objective-7 population and positive-control mutation complete; all four CI jobs green individually. | Tests only, missing control, UI represented as checked, or red/pending CI. |

Provider evidence that proves a different interval/publication meaning does not authorize a silent behavior change. If it would reverse the approved forming-bar policy, stop at the decision boundary for Kyle and Coltrane.

---

## D. Known limits and review labels

- Public Kraken xStock/equities material still does not establish source publication semantics. Provider-currentness remains unresolved; primary-scoped causal availability is still solvable.
- The certificate does not promise visibility to a pre-existing Repeatable Read snapshot, a lagging replica, or a role with different RLS/grants. The current production database is a primary and defaults to Read Committed; any topology/isolation/role change must invalidate or version the contract.
- Exact pre-cutover revision reconstruction is impossible where mutable upserts erased earlier values. The plan refuses to invent it.
- Staging UI was not visually checked under the Codex password restriction. API and source behavior were checked; UI verification remains open.
- The hot-ledger byte estimate is deliberately conservative and cannot authorize enforcement; the fixed 200/160-GiB capacity contract and full capture window decide it. A failed inequality requires a smaller storage shape, faster verified archival, or Kyle-approved cap/reserve scope amendment.
- Snapshot historical cleanup is not part of this batch; it is the separate A10 finding/disposition.
- **NOT RE-READ:** the 28-surface semantic-reader count and the 8-day hot-retention design judgment will receive Coltrane's ordinary Step-2 review but are not the single fresh-reader claim.

**REVIEWER: claim-only · asked what objects settle the post-commit visibility-certificate mechanism and what other worlds fit them · HIT: observer scope, wall-clock regression, immutable-ID/set-equality, and certificate-commit qualifications · re-derived YES at `a604387d...` plus live primary/database controls 2026-10-14 14:21Z.** Positive controls: origin grep found 45 `arrived_at`/`arrivedAt` matches while `visible_by`/`visibleBy` returned zero after successful revision resolution; the live public schema found 103 `arrived_at` columns and zero `visible_by`; Drizzle 0.39.1 source awaits `COMMIT` before resolving the transaction promise. The plan was corrected in P2–P5/P13 before dispatch.

---

## E. Plain-language summary

The audit found that DawnTrader intentionally kept the venue's bar label and its own receipt clock separate, and intentionally chose to trade from the perceived forming bar later. The mistake was not mixing those raw clocks; it was never recording which exact changing bar revision had actually committed and become readable before a live or simulated decision.

The plan keeps the original labels and forming-bar policy, adds immutable revisions plus exact projection-winner order and a post-commit primary-database certificate, carries that identity through 15m/60m aggregation and caches, and preserves the RTB refresh's independent 60m evidence through every outcome and promotion. It uses a fixed 200-GiB capacity contract with explicit reserves, makes rollback pause new xStock decisions instead of reviving the uncertified path, keeps replay/dashboard claims honest about their clock and era, preserves crypto behavior, and leaves destructive cleanup of the unexpectedly unbounded snapshot tables to a separately reviewed retention batch.
