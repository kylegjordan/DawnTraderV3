# B-B75-EXPORT-COMPLETENESS — SCOPE r1 (2026-10-17)

change-class: architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` §0a stage 3, the urgent storage-safety interrupt · **Issue:** `#1195` · **Reviewer:** Langston
**Why `architecture`:** this batch adds a column to `data_archive_manifest` (a migration under `shared/schema.ts`) and changes what the rehydrate path tells its caller. That is a data-model change, so the batch takes the strictest document set rather than risk under-declaration. **For attack.**

## 0. WHY, AND WHAT IS ALREADY DONE
- **The forward loss is closed.** The hotfix `B-B75-COUNT-GATE` (deployed `b678ef0f6`; verified by the 2026-10-17 02:15Z sweep, with every 09-16 child dropped with `rows=` equal to its source) makes each copy complete and refuses a drop on any count mismatch.
- **Kyle decided on 2026-10-17 (option 3):** recover nothing; record the gaps everywhere.

What remains is to make the gap **impossible to miss for anyone who reads that period's archive later**, plus two follow-ups Langston raised at the hotfix's second pass.

## 1. MEASURED (`data_archive_manifest`, staging, 2026-10-17)
| window | objects | rows archived |
|---|---|---|
| before the page rule (created before `565b605f0`, 2026-05-06T18:51:29Z) | 1 (warm, migrated) | 4,145 |
| **the legacy window** (2026-05-06T18:51:29Z → the hotfix deploy, 2026-10-16T09:45:18Z) | **567** (561 warm active, 4 cold active, 2 warm migrated) | **810,600,041** |
| after the hotfix | 4 (warm active) | 6,937,105 |

**What is known of the shortfall per table:**
- `crypto_perp_ohlc_1m`: 27 of 29 days hold exactly 240,000 rows against about 264,960 recorded — about 25k bars a day.
- `signal_eval_archive`: about 2.1% short on the 09-16 replay.
- The ticker snapshots: about 0.1-0.3% short.
- Other tables: unmeasured, because the sources are gone.

**So for most objects the shortfall is UNKNOWABLE, not zero.** A table whose timestamps rarely tie may be complete. The register must say "unverified", never "complete", for anything it cannot prove.

## 2. PROVENANCE (tier 1)
- **The page rule**, `565b605f0` (2026-05-06), quoted verbatim: *"Trade-off: strict '> lastTs' would skip rows sharing exact timestamp value. For context_bridge_log (UUID id + ms timestamp resolution + random broadcast arrival) exact ties are negligible, and the sweep's row_count + min/max_ts manifest verify catches any anomaly."*
- **What went wrong:** the trade-off was judged for one table, `context_bridge_log`, and the same exporter then served the B74 tables (ticker snapshots, one-minute bars, signal evaluations), where ties are routine. The "manifest verify catches any anomaly" premise was false: `row_count` and min/max are derived from the export itself (`#1195`).
- **`data_archive_manifest`**: B75 (`BATCH_75_SCOPE.md` §C), the crash-safe archive state machine. The rehydrate CLI (`server/scripts/b75-rehydrate.ts`) pulls archived objects back *"for analytics. Future ML/analytics schedulers will wrap this script."* It is the path by which the gap would mislead a reader.
- **Readers of the manifest** (repo census, tests excluded): `b75-retention-sweep.ts`, `b75-cold-rotator.ts`, `b75-rehydrate.ts`, `context-bridge-log-ttl.ts`, `b-xstock-bar-availability-capacity-gate.ts`, and `storage-client.ts`. The full read/write census is Step 2.
- **Disposition: (2)** — relevant, and needs to carry completeness, which it never recorded.

## 3. OBJECTIVES
| obj | objective | verified by |
|---|---|---|
| OBJ-1 | **The gap register.** `data_archive_manifest` gains a completeness field: `complete-proven` (a same-snapshot source count matched — every object from the hotfix on, plus exact-mode objects with evidence), `unverified-legacy` (the legacy window, no source count) and `pre-page-rule`. All 567 legacy-window objects are backfilled `unverified-legacy`; where a shortfall is measured (the OHLC bars), the measured basis is recorded. | a census query: every object has exactly one value; the 567 count reproduces; a post-hotfix object reads `complete-proven` |
| OBJ-2 | **New objects are stamped at write.** The sweep and `context-bridge-log-ttl` write `complete-proven` only when the same-snapshot count matched (which, since the hotfix, is the only way an object is written). | a test; the next sweep's rows read `complete-proven` |
| OBJ-3 | **The rehydrate path says so.** `b75-rehydrate.ts` prints a per-object warning naming `unverified-legacy` objects and their window, and writes the completeness beside each rehydrated file. A future analytics wrapper therefore cannot read that period as whole. | a rehydrate of one legacy object prints the warning, and of one post-hotfix object prints none |
| OBJ-4 | **`STORAGE_POLICY.md`** names the window, the cause, Kyle's no-recovery decision and the field's meaning — the human-readable half of "record the gaps everywhere". | the document, at the ref |
| OBJ-5 | **Langston's F2:** the sweep-failure alert carries a dedupe key per parent and label, so a persistent failure does not mint a row per night. | a test: two failing runs mint one alert |
| OBJ-6 | **Langston's F4:** the plain-archive lane's catch names a count mismatch rather than calling it transient. | a test |

## 4. OUT OF SCOPE
- **Recovery of the lost rows:** Kyle decided no, 2026-10-17.
- **Retention sizing:** sprint row 6, Infra Claude.
- **The wake log's bound:** `#1202`, unrelated.

## 5. JUDGEMENT CALLS FOR ATTACK
1. **A column on the manifest vs a separate register table.** I prefer the column: one source of truth, read where the object is read.
2. **`unverified-legacy` for every legacy object vs trying to prove some complete** — for instance, tables whose timestamps never tie. Proving it would need the source, which is gone, so I prefer one honest label.
3. **The change-class** (`architecture`; see the header).
