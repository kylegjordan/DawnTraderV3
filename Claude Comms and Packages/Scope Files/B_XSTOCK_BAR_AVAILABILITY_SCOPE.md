# B-XSTOCK-BAR-AVAILABILITY — Scope r3 (Step 1 correction draft)

change-class: architecture

**Owner:** ANALYST Codex / CC-C

**Issue:** `#707`

**Placement:** `SPRINT_TO_LIVE_PLAN` pre-sprint Stage 3, first item, after the completed CORZ investigation and before `B-CRON-MISSED-CATCHUP`.

**Finding record:** `CORZ_QUOTE_VS_BARS_INVESTIGATION_2026-10-13.md` (Coltrane-approved at `08ac3e29923c0664d26392cac69acef69e18df5f`).

## 1. Goal

Make xStock OHLC availability an explicit, end-to-end contract. Preserve Kraken's `interval_begin` as the vendor label, separately preserve local receipt/enqueue time and when a persisted revision became reader-visible, and ensure live decisions, replay, calibration, provenance, and the passive-archive dashboard never silently treat any one of those clocks as another.

This batch starts with the contract decision. It does **not** begin with a `+15 minutes` rewrite: the evidence still permits late publication, shifted labels, or whole-feed delay, and the original design intentionally preserved the vendor label.

## 2. Established facts and unresolved boundary

### 2.1 Established

1. The xStock OHLC payload reaches DawnTrader with an `interval_begin` about 15–16 minutes behind local receipt. In the fixed current population from the investigation, 20,151 bars across 465 symbols had label→`arrived_at` p50 953.70 seconds; the same-writer crypto control was 11,677 bars across 432 symbols at p50 42.60 seconds.
2. The raw equities wire already contains the old label. DawnTrader validates it and stores it unchanged.
3. `arrived_at` is a local process receipt/enqueue clock. F-G-1 stamps it in `bufferOhlcBar` before a 5-second batch flush and possible pool wait, then uses it to prevent an older receipt from overwriting a later one. It is neither persistence time nor proof that a reader could use the revision then.
4. `captured_at` is assigned by the database write/upsert. It is closer to persistence than `arrived_at`, but the current design never established it as exact commit/reader-visible time; neither field alone proves the exact moment another transaction could read the values.
5. The live 15-minute scanner path, independent 60-minute regime-refresh path, both snapshot tables/cache paths, xStock replay, calibration tooling, and passive-archive dashboard use `interval_begin`/derived bucket time without a common availability contract. The 240-minute cache path remains dormant but callable.
6. The raw clock split was deliberate, and consuming the perceived newest/forming bar was deliberate. Kyle expressly accepted forming-bar classification in B.3; B.4 retained it.

### 2.2 Not established

No public `ws-equities` OHLC specification found in the official Kraken API corpus defines whether `interval_begin` is event time, a shifted interval name, publication time, or the start of a bar delivered on a fixed delay. The official corpus positively exposes separate execution and publication timestamps for generic market-data APIs, but its searchable xStock/equities WebSocket material does not document this OHLC clock. Therefore neither “the bar is stale” nor “the label is merely shifted” is yet a proved provider contract.

The minimum invariant is nevertheless decidable: receipt is only a lower bound on reader-visible availability; a consumer may not claim a revision was usable before it was committed/readable, and unknown historical availability must remain unknown rather than be invented from `arrived_at`, `captured_at`, or a constant offset.

## 3. Contract questions this batch must settle before implementation

Step 2 must write one canonical clock dictionary and choose the consumer rule from evidence:

| clock | required meaning |
|---|---|
| **vendor interval/event label** | Kraken's unchanged `interval_begin`; bar identity and bucketing input, never silently rewritten. |
| **source publication time** | A venue-supplied publication timestamp if Kraken documents or supplies one; otherwise explicitly unavailable. |
| **local receipt/enqueue time** | When this DawnTrader process received and buffered the revision. Existing `arrived_at` means the latest accepted revision's receipt/enqueue time; it is not reader-visible availability. |
| **persistence / reader-visible availability time** | When the exact revision became committed and readable to a consumer. The current schema does not store a proven exact value: `captured_at` is database write time, while flush, pool wait, statement execution, and commit visibility are distinct. Step 2 must either capture a trustworthy conservative value or state and test an explicit bound. |
| **aggregate availability time** | The latest trustworthy reader-visible availability among the exact source revisions contributing to a returned aggregate value, not merely their latest receipt. |
| **cache availability time** | The aggregate availability carried through snapshot read, live-overlay merge, and cache insertion without substitution by cache-write time. |
| **decision time** | The time a live/replay/calibration decision is evaluated; provenance must make the comparison reproducible. |

The design must then distinguish these states rather than collapse them:

- **available and source-current under a documented provider rule**;
- **persisted/readable locally but provider event/publication recency unresolved**;
- **retained revision not yet reader-visible at decision time**;
- **retained revision ineligible, prior overwritten revision availability/value unknown**;
- **historical availability unknown** because the row predates trustworthy receipt/visibility metadata or because an earlier revision was overwritten.

If Kraken cannot supply a stronger contract, the safe fallback is not a fabricated label shift. The batch uses trustworthy reader-visible availability (or an explicitly conservative tested bound) as the forward no-look-ahead boundary, keeps provider-currentness explicitly unresolved, and prevents any report or decision-provenance field from calling unresolved event recency “current.” Existing upserted history cannot support exact revision-at-decision parity merely because its final retained row has `arrived_at`. Any proposal to refuse all xStock decisions on label age, or to continue calling receipt-fresh data “forming/current,” requires an explicit Step-2 rationale and Coltrane review because either choice changes trading behavior.

## 4. Architectural read (System Impact Map + System Manual, at `bda409da8`)

### 4.1 Upstream and stored state

- The B74 equities archiver validates Kraken's OHLC frame and passes `interval_begin` unchanged into the shared OHLC writer.
- The shared writer serves four asset classes. It stamps `arrived_at` at enqueue, normally waits for the scheduled 5-second flush and can then wait on the pool/write/retry path, upserts on `(symbol, interval_begin)`, replaces the stored OHLCV with the newest accepted revision, and sets `captured_at` during the database write. A writer change therefore has cross-class blast radius even though this batch's consumer contract is xStock-only.
- The upsert destroys revision history. If the retained revision arrived after a historical decision, an earlier overwritten revision may have been readable at that decision but its values and clocks are gone. A final-row query must classify that case **retained revision ineligible; prior revision unknown**, not “no bar was available.”
- `xstock_spot_ohlc_1m` is the canonical local 1-minute substrate. Pre-F-G-1 rows have no trustworthy `arrived_at`; current rows still lack a proved exact reader-visible timestamp. `captured_at` is not a permitted substitute until Step 2 establishes and tests its bound. Exact future replay requires either append-only revision retention or an equivalently auditable revision record.

### 4.2 Transformation and live consumers

- The xStock aggregator buckets source rows by `interval_begin` into 15/60/240-minute bars. It currently returns the in-progress bucket and drops receipt, visibility, and revision identity.
- The xStock OHLC cache has separate 15- and 60-minute snapshot-first branches, each merging a live overlay, letting live win on bucket collisions, caching the result, and writing recent buckets back. Both snapshot tables carry bucket time and snapshot write time, not source revision visibility. The fall-through 240-minute aggregation path has no active scanner caller but remains callable and must be fenced from reactivation under the old shape.
- The scanner requests 15-minute bars, computes DBS and all downstream strategy inputs from them, and uses the latest rolled close as the evaluation price. The scanner path is the high-blast-radius xStock signal source.
- Regime refresh independently reads the xStock OHLC cache. It must inherit the same eligibility rule; a scanner-only fix would leave a second production decision path on the old contract.

### 4.3 Replay, calibration, provenance, and monitoring

- xStock exit replay reads 1-minute final rows through the trade's hold window and orders only by `interval_begin`. Its no-look-ahead claim is incomplete until revision history and reader-visible availability are applied; old overwritten-revision windows cannot be upgraded to exact parity after the fact.
- The B31a calibration audit reconstructs the decision minute from label time and asserts no look-ahead. Any reusable calibration/replay helper must enforce the new era/revision/availability rule; one script-only patch is insufficient.
- `signal_eval_provenance` records the forming bar by value and its timestamp, but not the local availability clock that made the exact values usable. This batch must make future decisions auditable without inventing history.
- `computePassiveArchiveStatus`, exposed by the live analytics route and UI, applies one wall-clock cutoff to OHLC label time and ticker receipt time. It must stop presenting that mixed-clock count as like-for-like coverage.

### 4.4 Dormant readers

- `computeContextBonusShadow` reads xStock label-time snapshots but has no production caller at the approved investigation ref. It stays dormant and gains an activation fence tied to the settled contract.
- `b-xstock-freshness-monitor.ts` is a superseded, unscheduled draft whose required output table does not exist. It stays with `#441`; this batch records the contract it must inherit, but does not complete that monitor.

### 4.5 Direct reader census and required disposition

This census was rerun across TypeScript, JavaScript, Python, and SQL against the parent and partition-family table names (`xstock_spot_ohlc_1m`, `xstock_spot_ohlc_1m_*`, both snapshot tables), the exported xStock cache APIs, and current/former names. Partition/retention/bootstrap utilities, schema mappings, tests, fixed verification-evidence queries, and comments that name a table but do not turn bar time into a market or decision claim are administrative/evidence surfaces, not semantic readers; they remain compatibility controls.

| reader(s) | current role | disposition in this batch |
|---|---|---|
| `ohlc-aggregator.ts`; `xstock-ohlc-cache.ts`; `b-new-34b-prewarm-snapshot.ts` | live 15m/60m aggregation, snapshot merge/write-back, and lifecycle prewarm | **MIGRATE** both 15m and 60m values plus exact source-revision visibility; add collision/readback coverage. **FENCE** the dormant 240m fall-through until it returns the canonical shape. |
| `scanner.ts`; `regime-inputs.ts`; `eval-cycle.ts`/decision provenance | production 15m signal path plus independent 60m regime refresh | **MIGRATE** to one availability-aware API and provenance shape; neither production path may retain a label-only bypass. |
| `exit-strategy-replay-service.ts`; `b5-w20c-provenance-replay.ts` | replay and claimed exact decision-input reconstruction | **MIGRATE for post-cutover revisions**; classify older/overwritten-revision windows unknown. Do not claim exact parity for the legacy final-row era. |
| `drift-dashboard-aggregator.ts` route/UI stack | operational archive window counts | **MIGRATE** to separately named label, receipt, and reader-visible measures; no mixed-clock aggregate claim. |
| `b-xstock-calib-b31a-gate-audit.ts`; `b-xstock-calib-b31a-gate-audit-2.ts` | reusable gate audit whose bar-0 method claims no look-ahead | **MIGRATE OR RETIRE THE CLAIM**. It may run exact decision-time analysis only on revision-aware rows; legacy windows must be unknown/conservative, not “no look-ahead.” |
| `b-phase-a2-backfill.ts`; `b-xstock-calib-b1a-replay.ts`; `b-xstock-calib-b3-regime-audit.ts`; `b4-bar-frequency-study.ts`; `b4-dbs-15m-recompute.ts`; `b4-regime-parity.ts`; `b4-regime-recalib-study.ts`; `b4-vndi-recalib-study.ts` | one-off/re-runnable backfill and B.1/B.3/B.4 label-time calibration studies | **HISTORICAL-ONLY/FENCE** existing outputs as final-row, vendor-label studies. Any future decision-time or live-parity reuse must move to the canonical revision-aware helper first. |
| `b5-w2a-geometry-sweep.ts`; `b-pattern-evidence-15m-study.ts`; `b-pattern-winner-traits-study.ts`; `hce/hce_ohlc_sim.py`; `hce/hce_rawfeat.py` | offline outcome/geometry/feature studies over final archive or snapshot rows | **HISTORICAL-ONLY/FENCE**: retain as event-label outcome research, but forbid claims about what was available at a decision unless migrated. |
| `b-new-42-corp-action-scan.sql` | read-only corporate-action discontinuity study ordered by vendor label, including a direct monthly-partition summary | **HISTORICAL-ONLY/FENCE**: valid final-row event-label research, not evidence of decision-time availability. Any reuse must retain that label or migrate to revision-aware inputs. |
| `codex-export/export-data.sql` | raw 1-minute “tape” export from a named monthly partition | **RAW-EXPORT/HISTORICAL**: preserve vendor labels, add/export revision and visibility fields where the selected era has them, mark legacy revision/visibility unavailable, and forbid downstream decision-availability claims from the legacy tape. Partition children are inside the source fence. |
| `computeContextBonusShadow` | dormant AMR shadow over 15m snapshot | **FENCE** activation until migrated to the canonical API. |
| `b-xstock-freshness-monitor.ts` | superseded/inert #441 draft | **RETAIN INERT under #441** and require the settled contract before rebuild/activation. |

### 4.6 Blast radius

**High.** The contract changes the data substrate used by every xStock regime/strategy evaluation and by historical claims about those decisions. Shared-writer edits can touch crypto and both perp classes; crypto is therefore a mandatory no-change control. Snapshot schema or cache-type changes reach cold starts and weekly prewarm. Replay changes affect outcome research, not only display. The dashboard is non-trading but is an operational truth surface and cannot retain the old mixed-clock comparison.

## 5. Provenance read (Step 1.b)

**Corpora searched:** `BATCH_CATALOG`, all completion reports, `RUNNING_ISSUES`, the originating B74/B79/B-NEW-34/B.3/B.4/F-G-1 scope, pre-audit and design records, unrestricted `git log -S` history, the System Impact Map, the System Manual, `bridge/canonical`, and the current source tree's TypeScript/JavaScript/Python/SQL table/API callers. Searches used current and former table names (`xstock_spot_*` and `equity_spot_*`), the parent and partition-family names, both snapshot tables, both exported xStock cache methods, plus every named file/symbol in §4. The official Kraken API/support corpus was searched separately for `ws-equities`, xStock OHLC, `interval_begin`, publication, and availability semantics; generic spot/futures documentation was the positive control, while a public equities-OHLC timing contract was not found.

### 5.1 Tier 1 — behavior this batch changes

| surface | verbatim introducing/deciding evidence | intent and disposition |
|---|---|---|
| **B74 equities ingest + OHLC writer** | `ce4a7e408436229d05e9edd48329383edabdd1b9`: *“NO signal-pipeline impact, NO admission gates, NO consumers in v1 — pure passive accumulation.”* B74 pre-audit line 157: *“If Kraken sends a bar with wrong `interval_begin` or duplicate timestamp, B74 stores it as-is.”* | Preserve raw vendor identity: **(1) still relevant and correct**. Add/clarify availability metadata without relabelling `interval_begin`; do not recast B74 as a defective producer. |
| **first live/VTS consumer** | `914a25e05f8687797d20e2a59a40eea67aa7695c`: *“xstockSpotScanner.runCycle wired (post freshness gate)”* and *“For each fresh pair: fetch OHLC → evaluateXstockPairForVTS.”* Immediate repair `4904ea66b41080dc6a0c000951c6b0ff3996f471`: *“fix xstock OHLC column name (interval_begin not timestamp_minute)”*. | Bar history was promoted below a separate receipt-time liveness gate. The consumer remains needed, but its inherited label-only semantics are **(2) relevant but need updating**. |
| **B-NEW-34 aggregator/cache/scanner contract** | `756b64e4949e7edcd279e8aac6f63130853a1523`: *“switch xstock_spot scanner from 1-min bars + 90s ticker-freshness gate to 60-min bars on parity with crypto.”* Round 3 line 58: *“YES emit. Match crypto. Document in SYSTEM_MANUAL ‘Bar interval — design rationale’.”* | Removal of the ticker gate and use of the perceived current bar were intentional. The unverified xStock label→availability premise is **(2) relevant but needs updating**; do not restore the deleted 90-second gate as a surrogate. |
| **forming-bar policy** | B.3 decision commit `3ee0c05791d06742a54e17c2df2df5721974c2bb`: *“forming-bar classification INTENDED (written decision, NO-PATCHES)”* and *“strategy-gate calibration on LIVE/forming-bar telemetry (not settled replay).”* B.4 results line 57: *“Forming-bar emission / scanner cadence / dedupe / crypto isolation | OK as-is.”* | The policy is established, not accidental. It remains **(1) still relevant and correct only if the batch can define what ‘forming/current’ means on this feed**; otherwise the wording/consumer behavior is **(2)** and must be amended explicitly rather than silently contradicted. |
| **F-G-1 `arrived_at`** | `4f9df55e107028cfa6bee9d7ff849358c6a4a71c`: *“arrived_at stamped at the chokepoint bufferOhlcBar ({...row, arrivedAt} so a producer cannot supply it)”*. F-G-1 pre-audit line 50: *“none on readers: `captured_at` keeps its meaning.”* | Writer ordering remains **(1) relevant and correct**. Consumer use of the same clock is new and must preserve its exact “latest accepted revision receipt” meaning; it may not silently be renamed first-arrival or publication time. |
| **15-minute snapshot/cache + scanner** | B.4 completion line 16: *“scanner `getOHLCDataBatch` flipped 60→15.”* System Manual line 12756: *“The forming (in-progress) 15-minute bar is still included in the returned series.”* | Live components remain required, but dropping availability across aggregation/cache boundaries is **(2) relevant but needs updating**. |
| **snapshot prewarm/write-back lifecycle** | `d9031fe8de2abcbbfa96d5850780e33dd4489f13`: *“Cache cold-miss path reads snapshot first (cheap PK-indexed scan), then calls the live aggregator with a NARROW 24h overlay for the recent tail, merges by bucket_ts (live wins on collision).”* | The cold-start lifecycle remains **(1) relevant and correct**; snapshot rows are **(2) relevant but need updating** to carry the availability of the values they cache. |
| **regime refresh** | `86d39e00d88a1d1e397495a2a930b4f21b286eba`: *“NEW async `computeRefreshRegimeInputs` (regime-inputs.ts): dispatches OHLC by class.”* | The fresh per-class compute remains **(1) relevant and correct**; its xStock bar input is **(2) relevant but needs updating** so it cannot bypass the scanner's availability contract. |
| **xStock exit replay** | `4c60d259e2b523234eb954185422d646998c91a3`: *“B73 exit-strategy replay branches on assetClass so xstock trades pull OHLC from xstock_spot_ohlc_1m instead of Kraken crypto REST (silent fail pre-fix).”* | Replay is **(2) relevant but needs updating**: its time window must enforce revision identity plus reader-visible availability and the historical unknown era. |
| **B31a calibration audit** | `3c90b8dd49601228e607d23cae739b176c773db9`: *“1m bar-0 with entry at +1 (no look-ahead).”* | The analysis purpose is **(1) still relevant and correct**; its interval-only no-look-ahead premise is **(2) relevant but needs updating** or retirement behind a canonical availability-aware helper. |
| **B.4 recalibration/recompute family** | `0bbeafc813b163b48e87e57c3c05a4bf4cbe06b9`: *“Read-only replay: rebuilds full 15m+60m series from xstock_spot_ohlc_1m (uncapped)”*. `8175a1c63e4545acfc7388da387b2caa60199f42`: *“build the FULL uncapped 15m series per symbol from xstock_spot_ohlc_1m and slide a 192-bar window”*. `5baa15bef6c4de7ac651f493e541cb904c07ab92`: *“read-only replay study … same method.”* | Their settled bar-frequency/threshold evidence remains **(1) relevant as vendor-label/final-row research**. Reuse as decision-time parity is **(2) and must be fenced** until the shared revision-aware helper exists. |
| **B.5 geometry/provenance readers** | `4a4950ff129ba20f37924a8b3f4446816107a63d`: *“geometry-sweep harness + results (read-only diagnostic)”*. `1284db5dcd6c93d84abf621b566bf4b41aa78a42`: *“root cause = the settled-bar REFERENCE leg (snapshot table vs engine in-memory series)”*. | The outcome-research use is **(1) relevant**. The exact provenance/replay claim is **(2) relevant but needs updating** for revision identity and reader-visible availability; legacy final-row windows remain bounded unknown. |
| **older backfill/calibration readers** | `d567399bc57a01f6d3d59a09b32085e66eec1384`: *“Rolls up 1-min xstock_spot_ohlc_1m bars to 60-min via SQL date_trunc”*. `9d0a10271d5f976d6fd64c597238cce1ef04002d`: *“Replay harness imports production calculatePairRegime to produce empirical evidence”*. `db10e26d2bd87b5919c98c46f71f995b85822b20`: *“offline diagnostic, read-only”*. | Their original studies remain **(1) relevant as final-row label-time analyses**. Any future claim that they reproduce inputs available at a historical decision is **(2)** and must be migrated or explicitly refused. |
| **pattern/HCE archive studies** | `51f3bd329b84920776e980f531d15cd4b0ebe5fd`: *“per-pattern fire-rate + directional edge + tolerance sweep”*. `e707a7d02f828e71e013aac8167420ec175d11a6`: *“pure stop/target first-hit sim vs admitted known outcomes”*. `1e5b5f9ce043ee5b4c0668661703dadf442a532c`: *“raw-feature buy-the-dip lead”*. | Their event-label outcome purpose is **(1) relevant and correct**. They are **(5) disconnected from exact decision-time availability and should stay disconnected** unless deliberately migrated; a source fence must stop their outputs being presented as no-look-ahead parity. |
| **corporate-action SQL reader** | `498e85aff3c6ae3ab41503975e22793bff278e58`: *“3 archive query SQL scripts … consolidated audit report”* and *“Forward split (50% drop) … Reverse split (2x jump)”*. | Its discontinuity study is **(1) relevant and correct as final-row event-label research**. It is **(5) disconnected from decision-time availability and should stay disconnected** unless deliberately migrated. |
| **Codex raw tape export** | `37d6f02b397d5152825892810785077f5171bff4`: *“tape_1m for both classes, 7 days, every symbol … for the available-move-size half of the cost-hurdle question.”* | Raw market-structure export remains **(1) relevant**, but its unqualified “tape” boundary is **(2) relevant but needs updating**: legacy rows expose vendor-label/final-row history, not exact decision availability; future-era exports must carry or explicitly omit revision/visibility fields by contract. |
| **decision provenance** | `b1dbb2c43fdcee7d6c56df88c0860370c6593f2b`: *“Forward-only capture of each xStock decision's exact replay inputs so future calibration studies are exactly reproducible.”* | The capture purpose is **(1) still relevant and correct**; omission of revision identity and the reader-visible availability basis is **(2) relevant but needs updating** before exact replay can include time availability. |
| **passive-archive dashboard stack** | `b8eba807e4b468bc08194657b9c619ae72e38795`: *“New computePassiveArchiveStatus() aggregator queries DB for row-count + distinct-symbol per universe + reads in-process counters”* and *“PassiveArchiveSection rendered under Analytics → Drift Dashboard tab.”* | Aggregator, route, and UI remain **(1) relevant and correct**; their mixed-clock window claim is **(2) relevant but needs updating** to compare like clocks or label them separately. |
| **AMR context shadow reader** | `a5ea8b567c94072e83db9c35b7db6e00e2b874e7`: *“SPY-15m-bars xstock … structurally absent from live composition.”* The approved investigation's current caller control finds the export definition but no production caller; the same method finds the dashboard route caller. | **(5) disconnected and should stay disconnected** until it consumes the canonical availability-aware API. The batch adds an activation fence, not a new caller. |

### 5.2 Tier 2 — read/call surfaces whose behavior is not independently redesigned

- The xStock freshness monitor remains inert under `#441`: **(5) disconnected and should stay disconnected in this batch**. Its future implementation must import/use the canonical contract rather than copy label-time SQL.
- Generic crypto OHLC cache and scanner are controls, not change targets: **(1)** and byte/behavior unchanged.

### 5.3 Provenance conclusion

Rule-24 outcome **(3): legacy no longer fits today's intent**. The legacy is not the vendor label or the forming-bar decision by itself; it is the promotion of a passive raw label into live/replay “current bar” semantics without adding an availability contract. The repair must reconnect that missing contract across every consumer, not erase the intentional history.

## 6. Numbered objectives and verification criteria

| # | objective | verification criterion |
|---|---|---|
| **1** | **Settle and publish the clock contract.** Obtain a provider answer if possible; otherwise record the bounded unresolved states. Define every clock in §3, including the receipt-versus-reader-visible split, the exact semantics of existing `arrived_at`/`captured_at`, revision identity, and the historical-era boundary. | Step-2 plan cites the provider evidence/response or explicit no-public-contract result; one canonical truth table covers live, snapshot, replay, calibration, retained-late/prior-unknown, and historical-null cases. Coltrane approves it before code. No rule derives availability by adding a constant to `interval_begin`. |
| **2** | **Carry revision identity and trustworthy availability through the bar substrate without changing bar identity.** The chosen design either retains append-only revisions or an equivalently auditable record. The 1-minute substrate, 15m and 60m aggregation, both snapshots, live-overlay merge, and cache preserve vendor bucket time plus the reader-visible availability of the exact returned values; the dormant 240m path cannot return the old shape. | Schema/type/SQL tests prove aggregate availability is the maximum trustworthy reader-visible time among the exact contributing revisions; 15m and 60m migration/readback and live-over-snapshot collision tests preserve the winning value's revision/availability; delayed-flush and pool-wait tests prove receipt cannot impersonate readability; 240m activation fails until canonical. Existing rows/revisions that cannot meet the contract stay unknown; mutation tests fail if availability is dropped, replaced by receipt/cache time, or shifted by 15 minutes. |
| **3** | **Make every live xStock decision use one explicit eligibility rule.** Scanner pricing, DBS, regime classification, strategy inputs, and refresh-regime computation all consume the same availability-aware bar API and record decision time plus eligibility state. No second label-only live route remains. | Compile-driven caller census at the implementation ref; unit/integration tests at boundary−1 ms / boundary / boundary+1 ms; source fence covers scanner and regime refresh; staging decision provenance shows the chosen state and timestamps on every sampled xStock decision. Crypto output remains unchanged under paired fixtures. |
| **4** | **Make replay and calibration honestly no-look-ahead.** Only post-cutover source revisions with trustworthy reader-visible availability `<= decision_time` may support exact replay. A retained revision after the decision does not prove no earlier revision existed: classify it retained-ineligible/prior-unknown. Rows without exact revision/visibility evidence are unknown and excluded from exact-parity claims unless a separately named conservative method is approved. | Fixtures include (a) label before / receipt before / persistence after decision, (b) retained revision after decision with an earlier overwritten revision, (c) pre-F-G-1 NULL history, and (d) a post-cutover eligible revision. B31a and every census reader either uses the canonical helper or carries an enforced historical-only/retired disposition. A fixed replay population reports eligible revision, retained-ineligible/prior-unknown, and metadata-unknown separately. |
| **5** | **Make decision provenance and operational monitoring tell the same clock truth.** Future xStock decision provenance records revision identity, bar label, receipt time, reader-visible availability, decision time, and contract/era status. The passive-archive dashboard stops comparing OHLC label-window counts with ticker receipt-window counts as though they share a clock. | Migration/readback and API tests; route payload names each basis or emits separate label-time, receipt-time, and reader-visible measures; UI/API check shows no ambiguous combined “active in window” claim for xStock. Positive control demonstrates the old mixed-clock query and corrected query differ on the known historical population. |
| **6** | **Fence dormant, historical, export, and future readers.** `computeContextBonusShadow`, dormant 240m aggregation, and every historical/raw-export reader in §4.5 cannot be promoted into decision-time evidence while reading the old label-only/final-row shape. `#441` retains ownership of the inert freshness monitor but receives a durable contract reference. Re-run the census at implementation time. | Compile/source fence covers the parent, snapshots, dynamic table variables, and partition-family names such as `xstock_spot_ohlc_1m_2026_09`; it fails on a new unclassified label-only cache/table reader. Zero-caller claim has a positive control; every §4.5 reader has a tested migrate/fence/retire/historical-only/raw-export disposition; `RUNNING_ISSUES #441` and canonical architecture docs name the inherited contract. No monitor schedule or 240m activation is added here. |
| **7** | **Prove the change on live and bounded historical controls.** Re-measure xStock label→receipt, receipt→reader-visible persistence, decision→bar-label, decision→revision-availability, and same-label versus receipt-time price pairing; retain the same-writer crypto control. | After deploy, a pre-registered venue-active window containing at least 20,000 stored xStock 1-minute revision records across at least 400 symbols and at least 5,000 crypto revision records across at least 300 symbols. Every sampled post-cutover xStock decision carries revision and availability state; zero decisions consume a revision whose trustworthy reader-visible availability is after decision time. That zero is readable only after the same detector finds violations in a deliberately delayed-flush/pool-wait/time-shifted fixture. Historical final-row populations report unknown rather than being counted as exact passes. Counts always name revision records, distinct symbols, time window, and ref. |
| **8** | **Provide a reversible, observable cutover.** The implementation may stage capture/propagation before enforcement, but no permissive fallback may silently revive label-only behavior. Rollback preserves raw labels, receipt stamps, and revision/visibility evidence. | Step-2 deployment plan names activation order, rollback point, counters, and fail-closed behavior for missing required metadata. It includes delayed-flush and pool-wait observability plus a rollback rehearsal proving no raw-label rewrite and no crypto behavior change. |

## 7. Non-goals

- No blind `interval_begin + 15 minutes` normalization and no historical relabelling.
- No claim that ticker last/mid and trade-derived OHLC close are the same price kind.
- No provider-publication timestamp invention when the feed supplies none.
- No exact reconstruction of intra-minute revisions that the upserted archive did not retain.
- No claim that current `arrived_at` is reader-visible time, or that current `captured_at` is exact commit visibility, without the Step-2 bound and its delayed-flush/pool-wait proof.
- No completion or scheduling of `B-XSTOCK-FRESHNESS-MONITOR` (`#441`).
- No implementation of `B-XSTOCK-VENUE-TS` / `#442`; if a source publication clock requires that work, Step 2 must state the dependency rather than smuggle it in.
- No strategy threshold, bar-frequency, or forming-bar-policy retune unless objective 1 proves the current policy cannot be stated truthfully; such a behavior change must be explicit in the Step-2 plan.
- No changes to crypto bar semantics, the F-G-1 writer-order guarantee, or unrelated xStock quote/exit-price work.

## 8. Dependencies, coordination, and stopping conditions

1. This batch remains before `B-CRON-MISSED-CATCHUP` because replay/scheduling work must not institutionalize the old clock premise.
2. Step 2 must refresh the caller census and inspect any files changed on the shared branch since `bda409da8` before choosing types/schema.
3. Any shared-writer or shared-schema change must prove all four archive classes preserve F-G-1 ordering. Any decision-path change must prove crypto isolation.
4. If provider evidence proves the current 15-minute interpretation wrong in a way that changes the forming-bar policy, stop at the decision boundary and obtain Kyle's ruling; do not bury the policy reversal in implementation.
5. Observation is required. Step 11 cannot close on tests alone; objective 7's live population must be complete and Coltrane must independently verify the availability/no-look-ahead claim.

## 9. Expected governance set

As an architecture batch, the eventual close is expected to update at least the System Impact Map, System Manual, `BATCH_CATALOG`, `RUNNING_ISSUES #707`, `SPRINT_TO_LIVE_PLAN`, the applicable data/schema manifest and change/fix ledger, plus a completion report naming the historical-era limit. Step 10 makes the authoritative applicability decision; this list is not a substitute for that step.
