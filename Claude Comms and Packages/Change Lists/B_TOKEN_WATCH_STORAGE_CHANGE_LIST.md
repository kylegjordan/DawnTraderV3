# B-TOKEN-WATCH-STORAGE — Step 4 change list

## Dispatch header
| field | value |
|---|---|
| **(i) declared change-class** | `architecture` (re-declared from `sub_batch` at Step 2, Langston condition 2) |
| **(ii) the class's doc set** | **scope** — present, `Scope Files/B_TOKEN_WATCH_STORAGE_SCOPE.md` · **pre_audit** — present, `Scope Files/B_TOKEN_WATCH_STORAGE_PRE_AUDIT.md` · **completion_report** — absent, owed at Step 11 · **batch_catalog** — absent, owed at Step 10 · **phase_history** — absent, owed at Step 10 · **system_manual** — absent, owed at Step 10 (one cold-tier line) · **sim** — absent, owed at Step 10 (the token-watch entry, a known gap) · conditional: **running_issues** — present (`#1132` entry, 2026-11-04) · **changes_and_fixes** — judged N/A: new capability, no fix to an existing behaviour except the reconnected size check, which `#1132` records · **roadmap** — N/A, the running plan is `SPRINT_TO_LIVE_PLAN.md` §0a (order 1) · **deleted_log** — N/A, nothing deleted · **phase_19_plan** — N/A (not a P19 batch) · **adjustment_framework** — N/A, no trading constant |
| **(iii) Step-2 reference** | `Scope Files/B_TOKEN_WATCH_STORAGE_PRE_AUDIT.md` r2 (PROCEED, six conditions applied at `6cd777607`) |

**Commits (review range `6cd777607..372bee3ed`, three commits, all `B-TOKEN-WATCH-STORAGE Step-3`):**
- `f02f3cfe7` (1/3): the live summary unit and timer copied byte-for-byte (P6). The blob sha256 equals the live sha256 for both.
- `310132582` (2/3): `OnFailure=` on the four existing units (P5, condition 5).
- `372bee3ed` (3/3): everything new.

Nothing is installed or run on staging yet; the run order is pre-audit P10 after this review.

## What changed, by plan item

### P1 `token-watch/ops/cold_offbox.py` (new)
- **The key gate**, `authorize()`: refuses any key that is not exactly one bucket (`dt-archive-cold`), the prefix `token-watch/`, and **without** `deleteFiles`. The account-wide key fails all three, so it can never run this by mistake.
- **Per file**, `move_one()`, in this order:
  1. `get_upload_url` before any local work (condition 4);
  2. `decompressed_size()` to EOF (B3; the count is a forward record, not a comparison);
  3. `file_hashes()`;
  4. `upload()` with `X-Bz-Content-Sha1`, then checking B2's recorded `contentSha1` and `contentLength`;
  5. `download_sha256()` by **file id** (Langston (2));
  6. compare;
  7. `append_manifest()` with an fsync, to `offbox/`;
  8. `unlink` and fsync of the directory.
- **Errors, `_call()`:** 401/403 → `Abort`; a 5xx, 408 or 429, or a transport failure, is retried once, then `Abort`; any other 4xx on upload → `FileFailed`. `run()` keeps a `FileFailed` file and continues, and breaks the loop on `Abort` or any unexpected exception.
- **Candidates:** `.gz` files whose mtime is at least `tier.STILL_WARM_SECONDS` old, oldest first.

### P2 `tools/mint_cold_key.py`, `tools/prove_cold_key.py` (new)
- **Mint:** uses the app's key from `/home/deploy/dawntrader/.env`; `b2_create_key` with `listFiles`, `readFiles` and `writeFiles`, the bucket id and `namePrefix token-watch/`; no duration.
- **The secret** is written with `O_CREAT|O_EXCL` 0600 under umask 077, root:root. Only the two key ids are printed. It refuses if the key file already exists.
- **Proof**, each step with its expected outcome printed first:
  1. authorize — exactly 3 capabilities, 1 bucket, the prefix;
  2. a write under `token-watch/proof/` is ALLOWED;
  3. a delete-version is REFUSED (401);
  4. a read outside the prefix is REFUSED (401, not 404);
  5. hide-file — UNKNOWN, recorded, and it decides the fallback census.
- **The proof object stays:** this key cannot delete it, and nothing else is used to.

### P3 `deploy/cold_offbox_access.sh` (new)
- **Order (C1):** `useradd` → `--x` on the root → `r--` on each file in `cold/` (`find -type f`) → a default `r--` → the directory's `rwx` **last** → `offbox/` created as `tokenwatch-cold` 0750.
- **Assertions, each exiting non-zero:**
  - the new user reads a backlog file;
  - it creates and unlinks in `cold/`, and writes `offbox/`;
  - a new file written by `tokenwatch` keeps `user::rw-` and grants the new user `r--`;
  - zero backlog files are unreadable;
  - the new user **cannot** list `state/`.

### P4 `ops/store_watch.py` (new)
- **Calls only `liveness._store_size_check()`** (a test replaces `liveness.check` with one that raises).
- **The split** is per top-level directory, files only.
- **Two keys:** `token-watch-store-warn` (warning, with the standing-condition text) and `token-watch-store-over_cap` (critical).
- **The unit has `ReadOnlyPaths=/var/lib/token-watch`.**

### P5 `ops/unit_failed.py`, `ops/alert_mint.py`, the `token-watch-failed@.service` template (new); `OnFailure=` on tier, receiver, summary and follow-up (edited)
- **`mint_argv`:** `runuser -u deploy -- /usr/bin/npm --prefix /home/deploy/dawntrader run --silent system-alerts -- add --triggers-at … --category health_check --severity … --dedupe-key … --title … --body …`, as an argument list.
- **`unit_failed`:** refuses names not matching `^token-watch-[a-z0-9-]+\.service$`, and carries `journalctl -p err -n 20`.

The unit edit, one hunk per file:
```
 [Unit]
 Description=token-watch payload tiering and cold hand-off
+# B-TOKEN-WATCH-STORAGE OBJ-4 (#1132): a failure pages instead of passing silently.
+OnFailure=token-watch-failed@%n.service

 [Service]
```

### P7 the units (new)
- **`token-watch-cold-offbox.service`:**
  - `User=tokenwatch-cold`, `LoadCredential=b2-cold:/etc/token-watch/b2-cold.key`;
  - `ReadWritePaths=/var/lib/token-watch/cold /var/lib/token-watch/offbox`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `NoNewPrivileges`;
  - `MemoryMax=256M`, `CPUQuota=25%`;
  - its timer at 05:30 UTC.
- **`token-watch-store-watch.service`:** root, `ReadOnlyPaths`, `MemoryMax=128M`; its timer at 06:00 UTC.

### P9 `deploy/install_storage.sh` (new)
- **Checks first:** a 40-character sha that is an ancestor of `origin/migration/aws-supabase`, after a `git fetch` as `deploy`.
- **Install:** each file is taken from `git cat-file blob <sha>:token-watch/<path>` into `/opt/token-watch/ops/` and `/etc/systemd/system/`, root:root 0644. `INSTALLED` records the sha, each file's sha256, `cc-infra` and the UTC time.
- **Refusals:** any installed file with a CR; `systemd-analyze verify` failing on the two new services.
- **No restart; timers are not enabled.** Both happen by hand after the first runs, per P10.

### Also
- `README.md` — the pieces table and *Reading the off-box archive back*.
- `.gitattributes` — `token-watch/** text eol=lf`. The blobs were already LF; this keeps working copies LF.

## Tests

| suite | Windows | staging Linux (scratch copy) |
|---|---|---|
| `test_cold_offbox.py` (fake B2 in-process) | 35 / 0 | 35 / 0 |
| `test_store_watch.py` | 31 / 0 | 31 / 0 |
| `test_ops_boundary.py` (each check with a planted positive) | 7 / 0 | 7 / 0 |
| `mutate_cold_offbox.py`: read-back compare off · EOF check off · prefix refusal off · delete refusal off · abort→carry-on | 5 of 5 caught | 5 of 5 caught |
| every other token-watch suite | all pass (`test_isolation` 6 passed, 4 skipped on Windows) | `test_pipeline` passes; `test_isolation` 20/0/0; `test_tiering` 28/0 |

The mutations are applied **by exact line**: the runner refuses if the line is not found exactly once. Each one is judged by **the suite's exit code AND the named block's FAIL line**.

## Judgement calls I want attacked

1. **`ops/` outside the collector.** `test_pipeline.py` failed three checks when the new modules sat at the top level ("exactly ONE module makes OUTBOUND calls", "exactly ONE egress CALL SITE", "…and it is in providers.py").
   - I moved the four jobs into `ops/`, which that scan does not walk (`os.listdir(here)`, top level only), and added `test_ops_boundary.py`.
   - Is a directory boundary plus its own test the right answer? The alternative is an explicit, reasoned exemption list inside `test_pipeline.py`. Its author warns against name lists ("DERIVED, NEVER A NAME LIST"), which is why I did not choose it.
2. **The key gate inside the uploader**, refusing the account-wide key, as well as the key's own restriction. Belt and braces, or noise?
3. **`install_storage.sh` reads blobs through `deploy`'s app clone** (a fetch in the app's repo). The alternative is a separate bare clone just for token-watch.
