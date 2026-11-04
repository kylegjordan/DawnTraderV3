# B-TOKEN-WATCH-STORAGE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: sub_batch · **Scope:** `B_TOKEN_WATCH_STORAGE_SCOPE.md` (r2, Step 1 PROCEED by Langston 2026-11-04 with two conditions, both applied in this commit) · **Issue:** `#1132` · **Card:** `PVTI_lAHODmulEM4BfQP4zhF-9jU` · **Owner:** Infra Claude

## 0. Previously stated vs now

- **PREVIOUSLY STATED (r1): store 13,801,205,273 B. NOW: 13,822,564,314 B. REASON:** the same `du -sb`, as root, an hour later (13:22Z), and decomposed by directory.
- **PREVIOUSLY STATED (r1): after the drain "about 8.1 GB". NOW: 7,737,679,985 B. REASON:** r1 subtracted a `du -sh` disk figure from a `du -sb` apparent figure; r2 is apparent bytes throughout.
- **PREVIOUSLY STATED (r2): "`deploy` already reads the whole store". NOW: `deploy` reads `cold/` and `public/` only. REASON:** the mask is `---` on 7 of 9 directories (Langston condition 2).
- **PREVIOUSLY STATED (r2): a default ACL on `cold/` gives the new user the backlog. NOW: it does not; 82 of the 86 files are 0640 and need the entry applied. REASON:** a default ACL acts only at creation (Langston condition 1; mode census re-measured below).
- **NEW, from the audit:** the first store-watch mint will not equal §0's total. `_store_size_check` sums file sizes (`liveness.py:298-304`), while `du -sb` also counts directory entries (`due/`'s own is 131,072 B). The gap is about 10⁵ B against 852 MB of headroom. Each number states its instrument.

## 1. AUDIT

**Sources read** (the six-source rule; each stated):
1. **The code at the ref**: `tier.py`, `liveness.py`, `config.py`, `store.py`, `provenance.py`, `follow_up.py`, `tools/backfill_creator_stake.py`, `token-watch/systemd/*`, `scripts/system-alerts.ts`, `server/services/system-alerts.ts`, `server/services/data-archive/storage-client.ts`.
2. **The box**: `systemctl cat`, `journalctl`, `getfacl`, `stat`, live-vs-repo hashes, crontabs.
3. **SYSTEM_IMPACT_MAP**: no token-watch entry (0 hits); the B75 cold-tier rows at `:2374`, `:2385`, `:2397`.
4. **SYSTEM_MANUAL**: N/A for the trading pipeline; cold-tier text `:12214`, `:12271`.
5. **The ledger**: `#1132`, `#670`, `#1004`, and the B-TOKEN-WATCH scope §4 and pre-registration.
6. **`bridge/canonical/`**: not consulted. Token-watch is a 2026-08 component, well after the governance change, and its intent is fully recorded in its own scope (§1 of the scope quotes it).

### A1. Census of `cold/` (§9.5(a); repo-wide grep at the ref, tests excluded)
| question | members | evidence |
|---|---|---|
| **writes / creates** | **exactly one: `tier.py`** (`tier_payloads`, `:170` writes `cold/<prefix>-<name>.gz` straight to its final name, with no temp-and-rename) | `git grep COLD_DIR` returns only `config.py:225`, `store.py:54/83` (`ensure_dirs`), `tier.py:44/170` |
| **reads** | `tier.py` (its own one-byte check, `:178-180`) · **`tools/backfill_creator_stake.py:77-80`** (reads `cold/provenance-raw-*.jsonl.gz`) · `deploy` through its ACL entry | same grep; `getfacl` |
| **mutates** | none | — |
| **★ deletes** | **none today**: nothing ever removes a file from `cold/` | same grep: `tier.py` unlinks only hot sources (`:183`) |
| **schedules** | `token-watch-tier.timer`, 04:30 UTC daily with up to 600 s jitter (last run took 14 s CPU, finished 04:36Z) | `systemctl cat`, journal |

⇒ After this batch there is **one deleter**, the new uploader, and it runs after the only writer. **A2** covers how the two avoid each other.
⇒ **`backfill_creator_stake.py` loses its input** once `cold/` drains. It was a one-time backfill (last change `ef5503491`, 2026-09-02). **Disposition:** recorded in the README with how to read the archive back from B2. No code change; it is not scheduled anywhere (crontab: root and deploy hold no token-watch lines).

### A2. The writer and the deleter must not overlap
`tier.py` writes each `.gz` in place, so a file mid-write looks like a short file. The uploader therefore:
- skips any file modified in the last hour (the same guard `tier.py` uses on its own inputs, `STILL_WARM_SECONDS`, `:66`);
- runs at **05:30 UTC**, an hour after tiering finishes;
- decompresses each file to EOF before upload (B3), so a truncated file is refused rather than archived.

It cannot take `tier.py`'s `periodic_lock`: the lock lives in `state/`, which `tokenwatch-cold` must not reach.

### A3. What leaves the box
The raw records are built at `provenance.py:127-131`, with the keys `received_at`, `remote`, `bytes`, `sha256` and `body`. **No request headers are stored, so the webhook secret never enters `cold/`** (one decompressed record read on the box confirms the same five keys). The follow-up raw store is written by the disabled sweep and holds provider responses.
⇒ **What goes to the private, encrypted bucket:** public chain data and the senders' IP addresses. It sits in Kyle's own bucket, so nothing new is shared with a third party.

### A4. The B2 credential (re-read at the box, 2026-11-04)
- **The app's key is account-wide.** It carries 29 capabilities, including `deleteFiles`, `deleteBuckets`, `writeKeys` and `bypassGovernance`, with no bucket or prefix restriction. This was read with `b2_authorize_account`, printing capabilities only.
- **The bucket** is `dt-archive-cold`, and the S3 endpoint is in us-east-005.
- **Its `writeKeys` capability is what mints the restricted key.**

### A5. Alert path
- `cmdAdd` requires `--triggers-at`, `--category`, `--severity`, `--title` and `--body` (`scripts/system-alerts.ts:184-192`).
- The category must be one of the seven in `ALERT_CATEGORIES` (`server/services/system-alerts.ts:69-77`), so the mints use **`health_check`**, which that list itself describes as *"disk / archival-cron-silence / freshness system health"*.
- The same mint form is used at `comms-infra/discord/dt-deploy-drift.sh:165`.
- On staging, `deploy` resolves `/usr/bin/npm`.

### A6. How token-watch is installed, and live-vs-repo drift
- **The install is by hand:** root-owned copies in `/opt/token-watch`, with three stale `*.pre-*` backups beside them, and no install record.
- **Hashes:** 13 modules were compared with `sha256sum` against the blob at the ref. 6 are byte-identical. **The other 7 differ only in carriage-return bytes**: `diff --strip-trailing-cr` shows 0 differing lines for every one of them. **There is no content drift.**
- ⇒ **The install in this batch copies each file from the git blob at the reviewed sha** (`git show <sha>:<path>`), never from a working tree, and writes `/opt/token-watch/INSTALLED` (sha + per-file sha256).
- The stale `*.pre-*` backups are **left alone and named here**. They are not imported (the names do not end in `.py`), and removing them is rule-18 work outside this batch's scope. *DISPOSITION: added to B-TOKEN-WATCH-FOLLOWUP-MEMORY, which reinstalls the package.*

### A7. Units on the box (entry points enumerated FIRST)
- **Seven unit files exist:**
  - `receiver.service`, enabled and running;
  - `tier.service` + `tier.timer`, the timer enabled;
  - `summary.service` + `summary.timer`, the timer enabled — **no repo copy of either**;
  - `followup.service` (failed, oom-kill 2026-09-30) + `followup.timer` (disabled).
- **Crontab:** root and deploy hold no token-watch lines.
- **Network:** the tier unit has no network restrictions, and the receiver's fence is as quoted in scope OBJ-2.
- **Memory:** the box has 3,814 MB in total.
  - The existing units set `MemoryMax` at 256M (tier) and 512M (the cap in `config.py`).
  - The uploader streams every body in fixed-size chunks, for the upload, the download-back and the decompression alike, so its memory does not grow with file size. The largest cold file is 134,197,115 B (`provenance-raw-2026-10-07.jsonl.gz`).

## 2. PLAN — each item points to its audit finding

| # | item | from |
|---|---|---|
| **P1** | **`token-watch/cold_offbox.py`** (stdlib only). For each `cold/*.gz` not modified in the last hour, oldest first: decompress to EOF and count bytes (refuse on error) → sha256 + sha1 → `b2_get_upload_url` → `b2_upload_file` streamed with `X-Bz-Content-Sha1` → `b2_download_file_by_id` streamed, sha256 compared → manifest line appended and fsynced to `offbox/cold-offbox-manifest.jsonl` → unlink. After the loop, if anything moved, upload the manifest to `token-watch/manifest/cold-offbox-manifest.jsonl`. Any per-file failure keeps that file, logs ERROR and makes the exit status 1, but the other files still go. The key is read from `$CREDENTIALS_DIRECTORY/b2-cold`. | A1, A2, A3, scope OBJ-1 |
| **P2** | **`token-watch/tools/mint_cold_key.py`**, run once as root. It reads the app key from `/home/deploy/dawntrader/.env` and calls `b2_create_key` with capabilities `listFiles, readFiles, writeFiles`, bucket `dt-archive-cold`, `namePrefix: "token-watch/"` and no duration. It writes `keyId:applicationKey` to `/etc/token-watch/b2-cold.key` under `umask 077` in-process, and prints only the two key ids. **`token-watch/tools/prove_cold_key.py`** proves the refusals with the new key, each with its expected outcome stated before it runs: delete-version refused · read outside the prefix refused · `b2_hide_file` under the prefix — **the result is recorded either way, and if it is permitted the fallback census in the README becomes `b2_list_file_versions`** (Langston's hypothesis, settled by one call). | A4, scope OBJ-2 |
| **P3** | **The user and the ACL**, a root shell script `token-watch/deploy/cold_offbox_access.sh`, idempotent: `useradd --system --no-create-home --shell /usr/sbin/nologin tokenwatch-cold` · `setfacl -m u:tokenwatch-cold:--x /var/lib/token-watch` · `setfacl -m u:tokenwatch-cold:rwx cold` · `setfacl -d -m u:tokenwatch-cold:r-- cold` · `setfacl -R -m u:tokenwatch-cold:r--` on the existing files · `install -d -o tokenwatch-cold -g tokenwatch-cold -m 0750 offbox`. It prints `getfacl` for the root, `cold/` and `offbox/` and a mode census afterwards. | scope OBJ-2 + both conditions |
| **P4** | **`token-watch/store_watch.py`**, run as root. It imports `liveness` and calls `_store_size_check()` **only**. It walks the store per directory with the same instrument, files-only `getsize`. On `warn` or `over_cap` it runs `runuser -u deploy -- /usr/bin/npm --prefix /home/deploy/dawntrader run --silent system-alerts -- add --triggers-at <now> --category health_check --severity warning|critical --dedupe-key token-watch-store-<state> --title … --body …`, passed as an argument list with no shell. The body carries the bytes, the per-directory split, the cap and warn line, the instrument, and for `warn` the standing-condition text: *"stays open while the store is above 6 GiB; it is not resolved as fixed"*. A failed mint is logged `MINT_FAILED` and exits 1. Unit: `ReadOnlyPaths=/var/lib/token-watch`, daily at 06:00 UTC. | A5, scope OBJ-3 |
| **P5** | **`token-watch-failed@.service`**, a root oneshot template that mints `--category health_check --severity warning --dedupe-key token-watch-unit-failed-%i`, naming the unit and pointing at `journalctl -u %i`. `OnFailure=token-watch-failed@%n.service` goes on the tier, summary, receiver, cold-offbox and store-watch units. | A5, A7, scope OBJ-4 |
| **P6** | **`summary.service` and `summary.timer` come into `token-watch/systemd/` byte-for-byte** from the box (commit 1), then only `OnFailure=` is added (commit 2), so the reviewer sees the copy and the edit separately. | A7, Langston's record item |
| **P7** | **The units for P1 and P4**: `token-watch-cold-offbox.service` as `User=tokenwatch-cold`, with `LoadCredential=b2-cold:/etc/token-watch/b2-cold.key`, `ReadWritePaths=/var/lib/token-watch/cold /var/lib/token-watch/offbox`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`, `NoNewPrivileges=true`, `MemoryMax=256M` and `CPUQuota=25%`, with its timer at 05:30 UTC. Plus `token-watch-store-watch.service` and its timer. | A2, A7, scope OBJ-1/2/3 |
| **P8** | **Tests**, in `token-watch/tests/test_cold_offbox.py`, against a local fake B2 (`http.server` in-process): a happy path; a corrupted download → file kept, exit 1; a truncated `.gz` → kept, exit 1; an upload error → kept, exit 1; a file younger than an hour → untouched; a re-run with nothing → exit 0 and no manifest line. In `test_store_watch.py`: the mint argument list is formed correctly, nothing is minted under the warn line, and **a run writes nothing under the store** (a before/after file census). All are judged by exit code; each mutation is applied by line number and confirmed applied before reading its result. The existing suites still pass. | scope OBJ-1 verify (iv), OBJ-3 |
| **P9** | **Install** (after Step 4 approval and CI): copy each file from the git blob at the reviewed sha into `/opt/token-watch`, as root:root 0644 for modules and 0755 for the script → write `INSTALLED` → units into `/etc/systemd/system` → `daemon-reload` → enable the two new timers. **Not `dt-deploy`:** token-watch is not part of the app and the app is not restarted. | A6 |
| **P10** | **Run order on the box:** P2 mint + P2 proofs → P3 access → store-watch by hand (expect `over_cap`/critical, mints once) → cold-offbox by hand (the backlog, 86 files expected) → verify (i)-(v) → store-watch again (expect `warn`) → hand-resolve the `over_cap` row with the evidence (Langston's record item (c)) → let the timers take over. | scope OBJ-1/3/5 |
| **P11** | **Governance**: a SYSTEM_IMPACT_MAP token-watch entry; a STORAGE_POLICY row; a SYSTEM_MANUAL cold-tier line; the README (install, archive read-back, `backfill_creator_stake` note); an appended AMENDMENT to the B-TOKEN-WATCH pre-registration; `#1132`; `BATCH_CATALOG`; my task list; the completion report. **Both key ids are recorded** in the SIM entry. | scope OBJ-6 |

**UNAUDITED:** none. Every plan item maps to a finding above.

## 3. Plain-language summary

The audit found that only one job writes to the archive folder, and nothing ever removes anything from it. That is why it grew to 6 GB on the trading server.

The plan adds a job that, an hour after the daily archiving, uploads each file to the off-site archive under a key that can add files but never delete them. It then reads each file back to check it, and only then removes the local copy. A separate daily check measures the study's size and raises an alert. Any of the study's jobs failing will also raise an alert.

The data going off-site is public blockchain data plus the address it came from. No passwords or secrets go off-site.
