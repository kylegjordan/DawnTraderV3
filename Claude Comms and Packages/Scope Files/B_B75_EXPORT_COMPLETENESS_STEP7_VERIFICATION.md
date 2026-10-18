# B-B75-EXPORT-COMPLETENESS (#1195) — Step 7 verification record (part 1, 2026-10-17)

**Deployed:** `fef7f0cc7021014cf4d093ac43f140e6b39a447a`, `dt-deploy --by cc-a` at 2026-10-17T11:44:52Z. `migrate_ran_at` 11:44:39Z, `migrate_ms` 1000, engine resumed, identity asserted.
**Rollback sha:** `93dce9cb9871feadce51a419edee264c23c2ff6a` (cc-c, 07:56:13Z).
**CI:** run `39029631884` at `fef7f0cc7` — TypeScript Check (baseline gate), Test Suite, Build and Docker Build: all `success`, read per job.

## UI surface — none, and why
This batch changes three server cron/CLI scripts — the nightly sweep (root crontab 02:15Z), the context-bridge lane (unscheduled, `#169`) and the cold rotator (monthly) — plus the rehydrate CLI and one manifest table. **No dashboard panel reads `data_archive_manifest` or `data_archive_exact_evidence`.** So there is no staging page whose rendering could change. Verification is server-side, below.

## 1. The migration landed (staging, psql after the deploy)
| check | result |
|---|---|
| `completeness_basis` census | `gate-deployed-unrecorded` 4 · `unverified-legacy` 568 (= the dry-run's 568 / 4 / 0 / 0) |
| `data_archive_exact_evidence` | exists; `xstock_bar_archive_exact_evidence` is gone (`to_regclass` null) |
| manifest triggers | `trg_data_archive_manifest_basis_requires_evidence` present |
| evidence rows | 0 (no export has run under the new code yet) |

## 2. A13, re-run with the instrument that showed it (staging, read-only, temp dir)
`b75-rehydrate.ts --table context_bridge_log --from 2026-02-05 --to 2026-02-06`. This morning it crashed with `fatal … 404 NoSuchKey`.
- **Without `--restore-cold`:** `2026-02: 2 objects (cold/active/unverified-legacy, warm/migrated/unverified-legacy); downloading cold — the other copy exists and is listed here`, then `use --restore-cold`, `DONE downloaded=0 skipped_cold=1`, exit 0. No crash.
- **With `--restore-cold`:** `2026-02 (cold): rows(unproven)=29069 completeness=unverified-legacy … checksum=OK`. A `WARNING … NOT proven complete`, and a sidecar with `proven:false`, `checksum_ok:true`, `other_objects:[{tier:warm,state:migrated}]`.
- **A new defect, found here:** `rows_unproven=029069`. BIGINT `row_count` arrives as a string and `+=` concatenated it; the pre-batch `total_rows` had the same defect.
  - Fixed at the read site (`queryManifest` → `Number()`), at review ref `25410d804`, sent to Langston as a one-gate mini-cycle.
  - **Probed on staging** (a temp copy of the fixed CLI, removed after; staging tree confirmed clean): `crypto_perp_ohlc_1m 2026-09-14..16` printed `rows(unproven)=240000`, `240000`, `264960` and `rows_unproven=744960`, which is correct.
  - **The same output is the batch's own subject:** the two legacy days at exactly 240,000, the post-hotfix day at 264,960 (184 × 1,440), all three labelled not proven.

## 2b. The Step-7 fix and why it is NOT deployed
- **Fix:** on migration at `7b078a3430181b193f39822eb7fa32a97bd75ea6`; Langston PROCEED (both folds re-derived at `fe05d68eb`); CI `39031907558`, 4/4 per job.
- **Held undeployed.** `fef7f0cc7..7b078a343` carries **9 runtime files across 2 batches besides this one**, enumerated per commit:
  - `1b705c80d` B-RR-FLOOR-HEADROOM Step-3 (CC-B): `active-execution-engine.ts` only;
  - `bafba0029` B-FEED-HEALTH-GRADE-ARM Step-9 (CC-B): `ai-transparency.tsx`, `kraken-websocket-adapter.ts`, `feed-integrity-auto-check.ts`, `alerts-service.ts`, `feed-integrity-monitor.ts`, `feed-health-aggregate.ts` and `equity-spot-archiver.ts`;
  - this batch's `b75-rehydrate.ts`.
  - *(Corrected: my first statement named 3 of the 9 and attributed the archiver to the wrong batch — Langston.)*
- **Why holding is safe:** the rehydrate CLI is hand-run only. It has 0 hits in root's 11 crontab lines and 0 systemd units (Langston's census, with a positive control). And the 02:15Z sweep runs `fef7f0cc7`, already live.
- **Deploy owner:** asked of NEW Claude, who owns both other batches. The hourly drift rung on this range will be a **true positive**: resolve it with the deploy, never as noise (#1001/#1002).

## 3. Not verifiable until tonight — scheduled, not assumed
The first sweep under the new rules runs 2026-10-18 02:15Z. **Event-wait alert `4f8123f8-fdef-482c-b9ec-9a127a45c20e`** (dedupe key `b-b75-export-completeness-first-run`, triggers 02:45Z) carries the checks:
1. every new manifest row is `source-count-matched`, with exactly one evidence row of its own source table, tier and contract, three counts equal;
2. the census then reads 568 / N / M / 0;
3. the per-object wall-clock on the largest object actually exported (Langston gate B attack 3), or a statement that the run did not reach a large one;
4. any minted sweep alert carries a key.

**Langston's bound, stated up front: 0 `verified` rows exist, so the reuse arm and its recount have no live population on run 1.** A quiet reuse path will not be reported as exercised.

---

# Part 2 — the first live sweep under the new rules (2026-10-18)

**The code it ran:** staging `dist/BUILD_SHA` = `f0abf8494e4a9d10c66ea6bd3ee306e25680b280`. It is a descendant of this batch's `fef7f0cc7` and of the Step-7 fix `7b078a343` (deployed in NEW Claude's `162ae0537` at 2026-10-17T13:03:42Z, then later deploys).

## 4. The run — `/var/log/dawntrader/b75-retention.log`, run_id `6f7ef0d4-990e-4766-b1f5-9ae9f346c81a`, started 2026-10-18T02:15:02.745Z
`DONE — examined=4 dropped=4 failed=0 bytes_freed=3000582144 bytes_archived=338495252 plain_deleted=137664 plain_failed=0 duration_ms=711617`. No `REFUSED`, no `UNCLASSIFIED`.

| partition (whole) | rows | duration_ms tonight | the same table's 2026-09-16 object the night before |
|---|---|---|---|
| `xstock_spot_ticker_snap/2026-09-17` | 2,905,247 | **304,884** | 313,486 |
| `crypto_perp_ticker_snap/2026-09-17` | 1,470,047 | 153,632 | 155,137 |
| `crypto_perp_ohlc_1m/2026-09-17` | 264,960 (= 184 × 1,440) | 25,203 | 27,360 |
| `signal_eval_archive/2026-09-17` | 2,200,627 | 221,532 | 230,586 |

**Langston gate B attack 3, answered with a measurement:**
- The largest object actually exported is `xstock_spot_ticker_snap`: 2.9M rows, 190 MB compressed.
- Its wall-clock, including the new second gunzip pass that counts the downloaded rows, is 304,884 ms, against 313,486 ms the night before without that pass.
- So the added cost is within the night-to-night spread on all four tables. It is not separable at n = 1 per table; the claim is "no measurable cost", not "zero cost".

**The plain lane:**
- `vts_open_trades` and `closed_trades` show `no age-eligible rows` and a cutoff printed as `2025-10-18`. That is the day-floored cutoff (gate B BLOCKER-2) in effect.
- `xstock_qd_probe_history` (delete-only) keeps its exact cutoff.

## 5. The register and the proofs (staging psql, after the run)
Each of the 4 manifest rows created after 2026-10-18T02:15Z reads `warm`, `active` and **`source-count-matched`**, with **exactly one** evidence row (`ev_rows = 1`) whose `source_table` is its own, tier `warm`, contract `text-ts-tiegroup-v1`, `producing_build_sha` `f0abf8494…`, and **source = exported = downloaded**:

| table | source | exported | downloaded |
|---|---|---|---|
| `xstock_spot_ticker_snap` | 2,905,247 | 2,905,247 | 2,905,247 |
| `crypto_perp_ticker_snap` | 1,470,047 | 1,470,047 | 1,470,047 |
| `crypto_perp_ohlc_1m` | 264,960 | 264,960 | 264,960 |
| `signal_eval_archive` | 2,200,627 | 2,200,627 | 2,200,627 |

**Census:** `unverified-legacy` **568** · `gate-deployed-unrecorded` **4** · `source-count-matched` **4** · `unrecorded` **0** — 576 rows. Evidence rows: 4.
**The tie trigger admitted every stamp:** a stamp without evidence would have thrown inside the transaction and failed the partition. `failed=0`, and the trigger's refusal of a no-evidence stamp was proven in the Step-6 dry run (P5).

## 6. What run 1 did NOT exercise — stated, not implied
- **The reuse arm and its recount:** 0 `verified` rows existed, so there was no population (Langston's bound).
- **The refusal arms** (`active`/`migrated` with rows, `stale-proof`): no label had an existing row with live rows.
- **The alert keys and resolve edges:** no failure occurred, so nothing was minted and nothing resolved. The log has no `resolved N alert(s)` line, because no keyed row existed to resolve.
- **The plain archive lane's export:** no rows are old enough (365-day windows; first eligible 2027-05-11).
- **The ctx lane:** still unscheduled (`#169`).
- These paths are proven by the tests (behavioural for the decision and the writer; structural for the wiring, `#1208`) and by the staging dry run, **not by this run**.

**Alert `4f8123f8-fdef-482c-b9ec-9a127a45c20e`** is resolved by cc-a with the run_id and census above.
