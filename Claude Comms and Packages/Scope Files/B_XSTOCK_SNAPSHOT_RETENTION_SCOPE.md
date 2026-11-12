# B-XSTOCK-SNAPSHOT-RETENTION — SCOPE

change-class: architecture

**Batch:** `B-XSTOCK-SNAPSHOT-RETENTION` · **Issue:** `#1194` · **Owner:** CC-C / ANALYST Codex · **Reviewer:** Coltrane for this Codex shift · **Plan position:** `SPRINT_TO_LIVE_PLAN` pre-sprint stage 3, item 6, after the now-closed `B-B75-SCRIPT-TEST-HARNESS` and before `B-CRON-MISSED-CATCHUP`.

## 0. Directive and boundary

The 15-minute and 60-minute xStock snapshot readers deliberately return only the newest bounded window per symbol, but the two stored tables have accumulated every bucket since May 2026. This batch makes the stored history bounded without turning retention into data loss: the exact rows selected for cleanup must first pass the existing B75 export, downloaded-count, checksum, evidence, and rehydrate contract.

This is `architecture` because it adds the snapshot tables to the governed hot/warm/cold lifecycle, defines which rows are live cache state versus historical evidence, introduces destructive cleanup semantics, and must coordinate that cleanup with the cache and lifecycle prewarm writers. It does **not** change xStock bar values, mixed-clock semantics, forming-bar policy, availability eligibility, scanner cadence, DBS/regime inputs, or the active xStock-bar observation windows.

The scoped retention rule is the union of two protections:

1. keep every row inside a governed **30-day hot horizon**; and
2. regardless of age, keep at least the newest **240 fifteen-minute rows** and **60 sixty-minute rows** for every symbol that has snapshot history.

A row is cleanup-eligible only when it is outside **both** protections. Step 2 may make the horizon more conservative if a current consumer requires it, but it may not reduce either per-symbol floor or replace archive-before-delete with a bare delete.

## 1. Objectives and verification

### OBJ-1 — Establish one governed retention contract for both snapshot tables

Add explicit wildcard `data_lifecycle` retention constants for the 15-minute and 60-minute snapshot tables, initially 30 days, and one shared selector that applies the time horizon plus the per-symbol floor. Each archive object must freeze one cutoff/ranking instant and materialize one deterministic population ordered by `(symbol, bucket_ts)`; the dry run, export, downloaded proof, and delete must all consume that frozen identity rather than re-evaluate a moving retention predicate.

**Verified by:**

- a current database read names the configured horizon and the two per-symbol floors;
- exact fixture populations cover a liquid symbol, an inactive symbol whose newest rows are older than 30 days, ties at the cutoff, fewer-than-floor history, and concurrent recent inserts;
- a mutation that changes `240`, `60`, the cutoff comparison, or the selector used by only one phase fails the population-identity tests;
- cutoff drift and a recent insert that pushes the prior floor row into eligibility cannot change an already frozen object population;
- missing, narrow-scope, non-numeric, non-positive, or contradictory configuration fails closed before archive or delete.

### OBJ-2 — Reuse B75’s proven move-not-delete path

Register both unpartitioned snapshot tables in the B75 plain-archive lane, or add the narrowest equivalent selector seam to that lane, while keeping `data_archive_manifest`, `data_archive_exact_evidence`, `archive-completeness.ts`, the exporter, storage client, cold rotator, and rehydrate CLI as the single lifecycle implementation. Every archived object must contain the complete snapshot row, including the availability columns when populated, and its proof must bind the complete ordered `(symbol, bucket_ts)` key set plus a canonical full-row content digest at the frozen cutoff/ranking instant.

**Verified by fake I/O and database fixtures:**

- the selected source count, complete ordered key set, and canonical full-row content digest equal the exported and downloaded proof before a manifest row can become `source-count-matched` and `verified`;
- checksum, count, key-set, or content-digest mismatch; an existing unproven/closed-out copy; changed source proof; upload/readback failure; or evidence failure performs no delete;
- a verified, still-matching copy is reusable only under the existing B75 decision and alert rules;
- rehydrate returns the archived rows with the completeness sidecar, and a sampled archived object reproduces its row count and content digest;
- the existing B75 42-case harness and predecessor suites stay green, with new cases for the ranked keep-floor selector and red mutations for same-count key replacement and in-place UPSERT/content replacement.

### OBJ-3 — Prune only the exact proven population

After archive proof, delete only the frozen, proven `(symbol, bucket_ts)` key set in bounded transactions and vacuum/analyze the tables without blocking the live scanner or lifecycle prewarm beyond a measured, reviewed ceiling. Immediately before removal, the gate must compare the hot source against the downloaded archive's complete ordered key set and canonical full-row content digest under the lock/isolation shape settled at Step 2. It must never issue deletion from a newly evaluated rolling cutoff or ranking predicate; any mismatch refuses before deletion and leaves both the proven rows and any newly eligible rows hot.

**Verified by:**

- before/after exact counts show every remaining row is within the hot horizon or its symbol’s keep floor;
- the complete pre-delete ordered key set and full-row content digest equal the downloaded proof, deletion targets that proven key set, the archived count equals the deleted count for each object, and the post-delete absence check names that same key set;
- red mutations cover same-count key replacement, in-place UPSERT/content replacement, a recent insert that pushes the prior floor row into eligibility, and cutoff drift; each mismatch refuses before deletion and proves both the frozen population and newly eligible rows remain hot;
- forced cache write-back and prewarm activity at each boundary cannot delete a newly written row, omit an eligible row from the archive, or resurrect an already closed-out archive label silently;
- statement timeouts, lock waits, batch duration and rows per transaction are bounded and reported over the measured cleanup population;
- heap, index, dead-row and total-relation bytes are reported before and after. Ordinary `VACUUM` is not claimed to return disk to the operating system; if physical reclamation is needed, Step 2 must choose and review an online rewrite/reindex or a maintenance-window operation before it is run.

### OBJ-4 — Preserve the live cache and lifecycle prewarm guarantees

The 15-minute cache continues to receive up to 240 rows per symbol and the 60-minute cache up to 60. The default 14-day lifecycle prewarm remains inside the hot horizon. A manual prewarm or other writer may not reinsert rows into an archived/closed-out old range without an explicit, observable rebuild mode that routes those rows through a fresh archive proof before later cleanup.

**Verified by:**

- cache cold-start and weekend prewarm tests still return the required floors for active and inactive symbols;
- the current 14-day prewarm succeeds unchanged;
- a lookback beyond the governed hot horizon either refuses with a named recovery instruction or enters the reviewed rebuild mode; it never silently recreates old hot rows;
- cache write-back remains recent-only and no trading, scanner, DBS, regime, or mixed-clock output changes.

### OBJ-5 — Preserve availability and decision-provenance evidence

Cleanup may delete only snapshot rows. It must not cascade to or prune `xstock_bar_revision_event`, `xstock_bar_aggregate_revision`, `xstock_bar_window_manifest`, decision/refresh-attempt provenance, certificates, exact archive evidence, or the existing xStock-bar observation records. Legacy all-NULL snapshot evidence and future certified snapshot evidence must both archive and rehydrate without shape loss.

**Verified by:**

- a database constraint/trigger census proves the delete has no cascade into the evidence tables;
- fixtures archive and rehydrate one legacy row and one fully certified row, preserving microseconds, UUIDs, hashes, sequences, primary identity, contract version, and eligibility state exactly;
- current xStock-bar availability Step-9 gates, daily failure tallies, window anchor, and alert rows are unchanged by deployment and cleanup;
- an attempted delete of any evidence table is absent from the implementation census and rejected by the test fence.

### OBJ-6 — Make historical consumers honest about the hot horizon

The live cache keeps its existing bounded reads. Direct historical/calibration scripts that query the snapshot tables must either stay within the governed hot horizon or use the B75 rehydrate sidecar/object path; none may silently present a hot-table subset as full history. The dormant AMR shadow stays dormant.

**Verified by:**

- every direct reader is classified as live, recent-hot, historical-rehydrate, or dormant;
- a requested era older than the hot horizon refuses and names the earliest readable date plus the rehydrate command/path;
- a hot-window positive control still runs without rehydrate;
- a rehydrated sample yields the same row population and digest as its proven archive object;
- no dormant reader becomes reachable and no UI/API claim changes in this batch.

### OBJ-7 — Execute cleanup safely and prove the bound holds

Deploy the reviewed retention code, run a dry-read first, archive and clean the initial eligible population only after all gates pass, and then observe at least one natural writer/retention cycle. This is a server-side data-lifecycle batch; there is no staging UI surface to inspect.

**Verified by:**

- the initial dry-read reports both tables, all 495 currently represented symbols, candidate counts, oldest/newest keys, and estimated bytes without mutation;
- the supervised cleanup proves frozen cutoff/ranking instant, archive, downloaded readback, complete key-set/content-digest equality, exact evidence, proven-key deletion, vacuum/analyze, and post-delete per-symbol/horizon invariants in that order;
- a later natural cache/prewarm writer cycle followed by the next retention read shows no out-of-contract row and no archive refusal/alert;
- TypeScript Check, Test Suite, Build, and Docker Build pass individually at the deployed ref;
- API/log/database checks are recorded; UI is **N/A**, not represented as checked.

## 2. Architectural read

### System Impact Map

The xStock snapshot entries define the live topology: the cache reads the newest 60 or 240 rows per symbol, merges a narrow live overlay, and writes only the recent tail back; lifecycle prewarm warms the same two tables. The 15-minute table feeds the scanner and the 60-minute table remains a live regime/parity substrate. The map calls the tables “bounded” because the reader is bounded, but it names no stored-row retention owner.

The B75 entries define the applicable lifecycle boundary: hot data is exported, uploaded, downloaded and verified before removal; the manifest is the rehydration seam; the plain-archive lane exists for unpartitioned tables; the daily sweep is serialized by its run lock. Therefore this batch extends that architecture instead of creating a second archive state machine or a second scheduler.

### System Manual

The B-NEW-34b/B.4 chapters say the tables exist to make cold starts cheap and guarantee 60-hour bar depth: 60 hourly buckets and 240 fifteen-minute buckets per symbol. They also say 60-minute history remains useful for parity/archive work and that the 15-minute settled-bar table was later reused by replay studies. The Data Lifecycle Policy supplies the controlling rule: data is moved between hot, warm and cold tiers, not dropped; only a verified `source-count-matched` object whose source still matches its proof may authorize a hot delete or reuse; rehydrate consumers must read the completeness sidecar.

The current live constants are more recent than old prose that still says 365/90 days: on 2026-11-11 the authoritative wildcard rows are 30 days for `xstock_spot_ohlc_1m` and `signal_eval_provenance`, and 15 days for `signal_eval_archive`. This scope uses live values only as current evidence; Step 10 must reconcile stale lifecycle prose with the final reviewed contract.

### Current measured state and blast radius

Read-only staging measurements at 2026-11-11 10:30–10:36Z:

| object | exact rows | symbols | oldest bucket | newest bucket | total relation bytes |
|---|---:|---:|---|---|---:|
| 15-minute snapshot | 2,687,293 at the size read | 495 | 2026-05-21 11:45Z | 2026-11-11 10:15Z | 642,834,432 |
| 60-minute snapshot | 701,922 | 495 | 2026-05-06 18:00Z | 2026-11-10 20:00Z | 169,517,056 |

The 15-minute writer remained live between reads; the later selector read saw 2,687,321 rows. Under the scoped 30-day-plus-floor rule, that read retained 516,852 and selected 2,170,469 for initial archive/cleanup. The 60-minute read retained 127,490 and selected 574,432. These are exact counts over each stated read, not forecasts.

All current snapshot rows have NULL aggregate-revision evidence because the availability cutover remains in its observation window: 2,687,293/2,687,293 fifteen-minute rows and 701,922/701,922 sixty-minute rows were legacy-shaped at 10:30Z. The schema and trigger already support fully certified rows, so the archive shape must cover both. A positive control found 30 public foreign keys and zero foreign keys referencing either snapshot table; each table has the availability insert/update guard trigger and no delete trigger.

`data_archive_manifest` held 6,089 rows at the read. Positive controls found 21 for `xstock_spot_ohlc_1m` and 93 for `signal_eval_provenance`; both snapshot tables had zero. That proves the manifest query can find registered archive families and that snapshot archival does not already exist.

Blast radius is **high for data durability, low for trading behaviour**. The cleanup touches two live cache stores and the shared archive safety boundary, but it changes no bar computation or decision. A false positive in the selector loses hot history; a false negative leaves storage unbounded; a proof mismatch must choose the latter and refuse.

## 3. Provenance read

### Corpora searched

Searched at the Step-1 ref: `BATCH_CATALOG`, `RUNNING_ISSUES`, the completion reports and scopes for B-NEW-34b, B-NEW-35, B.4, B-NEW-53, B-XSTOCK-BAR-AVAILABILITY, B75, B-B75-EXPORT-COMPLETENESS, and B-B75-SCRIPT-TEST-HARNESS; the relevant System Impact Map and System Manual sections; current TypeScript/SQL callers; `bridge/canonical/` for snapshot/B75 terms; and git archaeology. Tree-wide `git log -S` searches for both snapshot table names and the cache helpers were attempted without a path limit; the repository-wide history scan exceeded the command window, so the introducing refs named by the completion records were then read directly and path history was used only to identify later evolution. No former filename for either snapshot table or the B75 scripts was found.

### Tier 1 — behaviour this batch changes

#### Snapshot storage and cache/prewarm writers

The 60-minute snapshot architecture was introduced by `d9031fe8de2abcbbfa96d5850780e33dd4489f13`. Its commit says verbatim:

> “B-NEW-34b pivots to a snapshot architecture”

and:

> “New table xstock_spot_ohlc_60m_snapshot stores pre-aggregated 60-min buckets per symbol (PK on (symbol, bucket_ts)).”

> “Cache cold-miss path reads snapshot first (cheap PK-indexed scan), then calls the live aggregator with a NARROW 24h overlay for the recent tail, merges by bucket_ts (live wins on collision).”

Its prewarm source comment also said verbatim, “Keeps the snapshot table bounded to ~265 × 60 = 15,900 rows max.” The implementation capped the selected/upserted rows per run but never deleted older keys.

The 15-minute table was introduced by `f7fa4be2d85873d4d1499723f5121d56216f3aff`, whose message says verbatim:

> “New xstock_spot_ohlc_15m_snapshot table (mirror of 60m snapshot; cap to DBS-192+margin ~224 buckets/sym per Langston must-fix #1)”

The live cache branch followed at `d5f92a9b952a0bc9f029c7aa0daac49967cafb24`, verbatim:

> “Additive 15-minute branch in getOHLCDataBatch mirroring the 60m snapshot-first read path.”

The prewarm was extended at `8175a1c63e4545acfc7388da387b2caa60199f42`, verbatim:

> “Weekend prewarm (scripts/b-new-34b-prewarm-snapshot.ts): parameterized by interval and now warms BOTH the 60m and the new 15m snapshot tables per run (SNAPSHOT_INTERVALS). 15m cap = 240 buckets (= MAX_BARS_15M, DBS-192 + margin).”

**Disposition: (2) relevant but needs updating to today’s intent.** The snapshot-first cache, 60/240 live floors, recent-tail write-back and 14-day prewarm remain correct. The claim that a bounded upsert selection bounds stored keys is false; retention adds the missing lifecycle without changing the live bar contract.

#### B75 plain archive/delete lane and rehydrate

B75 was introduced by `f4e6a73f601521777925a62ab23e8ea79fc77616`. Its message says verbatim:

> “Tiered storage (Kyle directive: never drop data)”

> “Cold retention: indefinite. Move-not-delete at every boundary.”

and defines the sweep order verbatim:

> “insert pending -> snapshot+export -> upload -> re-read+verify -> manifest verified -> DROP -> active”

The plain-table move-not-delete lane was added by `f3d5fa54a7b04a971dc9fcca172bc8bd00b60ea5`, verbatim:

> “Plain-archive mode on the P19-B5c lane: per-present-day export ... -> warm TUS + checksum + manifest, DELETE gated on every present day verified”

The current completeness contract was added by `817f1a262a37832096e4309f80e49a40c90a55b0`, whose message says verbatim:

> “B-B75-EXPORT-COMPLETENESS Step-3: completeness register, one existing-copy decision, proof for every archive, proof-gated deletes (#1195)”

**Disposition: (2) relevant but needs updating to today’s intent.** The state machine, exact evidence, storage transports, rehydrate seam and run lock are correct and must be reused. The registered table inventory and plain-lane selector need to include the two derived snapshot stores and their per-symbol keep floor.

#### Availability evidence carried by snapshot rows

The current evidence shape was introduced by `d0ded28777dafd76ef37f1875c06ea9bbdf89d6b`, verbatim:

> “persist immutable 15m/60m aggregates and settled-window manifests”

> “fail closed across snapshot/cache identity and unsupported 240m reads”

and microsecond preservation followed at `a0d3a9c348917135f15653dbbe12eeeede354418`, verbatim:

> “keep database microseconds across aggregate, snapshot, and manifest boundaries”

**Disposition: (1) still relevant and correct.** Retention does not revise that design; it must archive and restore the full row without touching the immutable evidence tables.

### Tier 2 — components read or called, behaviour unchanged unless Step 2 proves otherwise

| Component | Original/current intent | Disposition |
|---|---|---|
| xStock 15m scanner/cache reader | Consume at most 240 recent certified bars per symbol for live xStock evaluation. | **(1) still relevant and correct** |
| xStock 60m regime/parity reader | Consume at most 60 recent bars; keep the substrate available for regime refresh and parity work. | **(1) still relevant and correct** |
| `xstock_bar_aggregate_revision` + window manifests | Immutable exact aggregate/window evidence, independent of mutable snapshot convenience rows. | **(1) still relevant and correct** |
| B-NEW-53/W20C replay | Historical snapshot reference proved non-exact at `1284db5d...`; the current tool already refuses eras outside its hot archive horizons. | **(2) relevant but its legacy snapshot claim remains bounded/honest, not a reason for unbounded hot storage** |
| B.1/B.3/B31a/W2a calibration scripts | Manual historical studies over final snapshot rows. | **(2) relevant but must rehydrate outside the hot horizon** |
| AMR context-bonus shadow | Dormant snapshot reader with no production caller. | **(5) disconnected and should stay disconnected** |
| B75 cold rotator and storage client | Move verified warm objects to indefinite cold storage and read them back. | **(1) still relevant and correct** |
| B75 rehydrate CLI | Restore a proven warm/cold object to a private analysis location with checksum and sidecar. | **(1) still relevant and correct** |

No live component is disposition (3) or (4): this batch reconnects no dormant trading path and removes no connected live path.

## 4. Existing capability and decision census

1. B75 already supplies the archive state machine, exact evidence, source recount, checksum readback, warm/cold transports, rehydrate CLI, alerts, run lock, and executable fake-I/O harness. This batch extends that capability; it does not build another archiver.
2. The cache and prewarm already centralize the 60/240 floors and 14-day default. The retention selector must consume or test against those same contract values rather than create unreviewed duplicates.
3. The current snapshot schemas already carry the complete future availability evidence shape. No new snapshot evidence columns are required.
4. `#1194` is the existing, Kyle-placed home. `#441` remains the separate inert freshness-monitor/stale-snapshot issue; `#1195` and `#1208` are closed B75 safety prerequisites, not reopened here.
5. The Delivery Board card already existed in Backlog with Analyst owner, Batch type, `#1194`, Phase 19, and the required description. It moved to Scope when this step began.

## 5. Expected implementation surface

Subject to the Step-2 write/read/scheduler census:

- `server/scripts/b75-retention-sweep.ts` — register the two tables and route one exact ranked selector through archive proof and delete;
- `server/services/data-archive/archive-completeness.ts` and/or `partition-exporter.ts` only if the existing seam cannot express the identical selected population without duplicating the decision;
- `server/scripts/b75-rehydrate.ts` only if the current generic row/object path cannot preserve the snapshot shape or sidecar contract unchanged;
- `scripts/b-new-34b-prewarm-snapshot.ts` — explicit beyond-horizon/rebuild guard if Step 2 confirms the current arbitrary `--days` input can recreate closed-out rows;
- a migration adding the two wildcard lifecycle constants and rollback;
- focused retention/archive/prewarm tests, extending the new executable B75 harness;
- required governance and completion records at Steps 10–11.

The Step-2 census may narrow this set. It may not introduce a second scheduler, archive state machine, evidence table, or storage provider.

## 6. Explicit non-goals

- No change to xStock interval labels, mixed clocks, forming bars, source revision winner rules, certification, aggregate/window hashes, scanner inputs, regime/DBS arithmetic, or trade decisions.
- No activation of the dormant 240-minute cache path or AMR context shadow.
- No pruning of raw revision events, aggregate revisions, manifests, decision provenance, B75 evidence, or the xStock-bar observation records.
- No change to the B75 warm/cold providers, cold retention, general completeness decision, schedule, or unrelated table horizons.
- No claim that ordinary `VACUUM` necessarily shrinks the physical database file.
- No forced closure or acknowledgement of KD-19, `#1250`, xStock-bar daily tallies, or the final xStock-bar observation window.

## 7. Safety, rollback, and deployment posture

The first run is dry-read only. The first mutating run is supervised and stops before deletion unless the archive object is downloaded, checksummed, and proven equal to the hot source by count, complete ordered key set, and canonical full-row content digest at the object's frozen cutoff/ranking instant. Deletion then uses only that proven key set; it never re-runs the rolling selector. A rollback disables future snapshot retention and removes only the new registration/config/seams; it does not delete archive evidence or warm/cold objects and does not try to reconstruct already archived rows automatically.

Normal reviewed deployments may continue during the existing xStock-bar window under that batch’s recorded continuity rule. This batch does not reset or close that window. If cleanup or a deployment produces an availability continuity fault, the xStock-bar batch’s own gate governs the consequence; this batch does not waive it.

## 8. Step boundary

Step 1 ends only when Coltrane approves this scope at an exact pushed ref. Step 2 then audits the selector, every writer/reader/deleter, the B75 transaction/lock shape, the physical-reclamation options, and the live database population before any implementation begins.

## 9. Step 10 disposition (2026-11-12)

All seven scoped objectives are green at Coltrane's exact Step-8 evidence ref `33e5162af1fbb460fddec9b204322fcb9fe8528e`. The deployed contract is 30 complete UTC hot days plus the newest 240 fifteen-minute / 60 sixty-minute rows per symbol; 2,163,663 fifteen-minute rows in 100 objects and 573,523 sixty-minute rows in 111 objects were archived, read back, proven and removed with zero eligible remainder at the frozen read.

The live writers advanced afterward and the next retention run deleted zero. The xStock-bar observation waits, KD-19 and `#1250` remain separate and unchanged; Step 11 creates the completion report and asks Coltrane to confirm the final package.
