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

## 3. Not verifiable until tonight — scheduled, not assumed
The first sweep under the new rules runs 2026-10-18 02:15Z. **Event-wait alert `4f8123f8-fdef-482c-b9ec-9a127a45c20e`** (dedupe key `b-b75-export-completeness-first-run`, triggers 02:45Z) carries the checks:
1. every new manifest row is `source-count-matched`, with exactly one evidence row of its own source table, tier and contract, three counts equal;
2. the census then reads 568 / N / M / 0;
3. the per-object wall-clock on the largest object actually exported (Langston gate B attack 3), or a statement that the run did not reach a large one;
4. any minted sweep alert carries a key.

**Langston's bound, stated up front: 0 `verified` rows exist, so the reuse arm and its recount have no live population on run 1.** A quiet reuse path will not be reported as exercised.
