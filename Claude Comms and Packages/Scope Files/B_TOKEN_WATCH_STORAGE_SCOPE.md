# B-TOKEN-WATCH-STORAGE — SCOPE r3 (amendment 1, 2026-11-05: OBJ-7 and OBJ-8 for Langston's Step-1 ruling)

> **Amendment 1 (2026-11-05), from Langston's sizing ruling (03:04Z ask, ruled ~07:20Z):** (A) raising the cap REFUSED; (B) moving births and observations off the box REFUSED as proposed; **(D) APPROVED as the fix, pending the measured split** — prune SPENT `due` buckets on their own constant. Measured below, and corrected on one point: a past bucket is not spent until the follow-up job's cursor has passed it (OBJ-7). OBJ-8 adds the feed's dead-man's switch, which has not run since 2026-09-30 and missed an 8-day stop in the new-token feed. §1-§3 OBJ-1..6 are unchanged.

> **Langston PROCEEDED on r2 with two in-commit conditions, applied here in the Step-2 commit:** (1) the ACL entry is applied to the 86 files already in `cold/` (82 of them are 0640 and a default ACL does not reach them), and (2) the claim that `deploy` reads the whole store is corrected — it reads `cold/` and `public/` only.

> **r2 (2026-11-04), answering Langston's r1 send-back (B1-B3, his four rulings, two record items).** §§1-3 were approved as written and are unchanged except §0's sizing table. Board card `PVTI_lAHODmulEM4BfQP4zhF-9jU` created (Sub-batch, Infra Claude).

change-class: architecture

> **Re-declared from `sub_batch` to `architecture` at Step 2 (Langston condition 2):** `sub_batch` made the scope, pre-audit, System Manual and SIM conditional (`scripts/governance-checker/config.mjs:144`), which removed the checker's teeth on exactly the documents a new off-box egress path, a new system user and new timers must land in. OBJ-6 already delivers the architecture set.

**Parent:** `B-TOKEN-WATCH` (paused, after live). **Issue:** `#1132` (2026-11-04 measurement). **Owner:** Infra Claude (CC-INFRA).
**Directive:** Kyle 2026-11-04, relayed by OLD Claude (inbox msg `1567524394312532069`): *"token-watch storage fix (a) and (b) jump ahead of your Langston size work. (a) Upload each compressed file to the off-box cold store (B2), check it by downloading it again, then delete the local copy; then move the 5.7 GB already there the same way. (b) Run the 8 GiB check daily, with an alert. Both go through Langston as usual."*
**Placement:** `SPRINT_TO_LIVE_PLAN.md` §0a, Infra Claude order 1 (commit `6584f6b05`).

## 0. Why — measured on staging 2026-11-04

| what | value | how |
|---|---|---|
| `/` on staging | 75G, 62G used, 11G free (86%) | `df -h /` |
| token-watch store | **13,822,564,314 B** (13:22Z; the 13,801,205,273 B in r1 was the same command about an hour earlier) | `du -sb .` **as root**, and the nine directories below sum to it exactly |
| the store cap | 8 GiB = 8,589,934,592 B (`config.py` `STORE_CAP_BYTES`) | repo at `6584f6b05` |
| `cold/` (same disk) | 6,084,884,329 B, 86 files | `du -sb` as root, `ls \| wc -l` |
| **composition, `du -sb` per directory, as root, 13:22Z** | births 1,419,901,828 · **cold 6,084,884,329** · dead 258,564,193 · **due 2,807,777,303** · observations 1,880,342,585 · provenance 393,424,021 · public 55,855 · state 599,991,562 · study 377,622,638 · files at the root 0 | sums to 13,822,564,314 B exactly. ⚠️ **A `du` as `deploy` is permission-truncated** (it can traverse only `cold/` and `public/`); Langston measured that wall at r1 |
| **after OBJ-1 drains `cold/`** | **7,737,679,985 B** = total − cold. Cap 8,589,934,592 B ⇒ **852,254,607 B (~0.85 GB) of headroom**; warn line 6,442,450,944 B ⇒ **above warn by design** | arithmetic on the row above, all in apparent bytes (`-sb`) |
| written on 11-03, by store | births 28 MB · cold 104 MB · due 92 MB · others 0 | `find -newermt` sizes, one day — a single-day reading, not a rate |
| follow-up sweep | `failed (Result: oom-kill)` since 2026-09-30 13:05Z; timer `disabled` | `systemctl status`, `list-unit-files` |
| the size check | runs only inside `follow_up.py` (the dead-man's switch) | `follow_up.py:220` calls `liveness.check()`, which calls `_store_size_check()` at `liveness.py:287` (defined `:291`) |

**Three facts the batch rests on:**
1. **"Cold" never leaves the box.** `tier.py` compresses each one-day-old raw file to `cold/` and verifies it is readable before removing the hot copy (`tier.py` `tier_payloads`). The scope's off-box step was never built.
2. **The cap is not enforced.** `_store_size_check` is reached only through the follow-up sweep. `#1132` disabled that sweep on 2026-09-30, so since then nothing measures the store, and it has passed the cap with no signal.
3. **The off-box target exists and works.** The bucket is `dt-archive-cold` (Backblaze B2, us-east-005, private, encryption on, **keep-all-versions**: SYSTEM_IMPACT_MAP row 13 of the B75 table, `:2397`). The app's B75 rotator runs against it with `cold_configured=true` (`/var/log/dawntrader/b75-cold-rotator.log`, 2026-11-01).

## 1. Provenance read (1.b)

**Corpora searched:** the B-TOKEN-WATCH scope §4, `RUNNING_ISSUES` `#1132` / `#670`, `git log -S COLD_DIR --reverse -- token-watch`, `tier.py` / `liveness.py` / `follow_up.py` headers, `STORAGE_POLICY.md` §1, and SYSTEM_IMPACT_MAP / SYSTEM_MANUAL for `dt-archive-cold`.

- **`tier.py` — TIER 1 (the cold directory's meaning changes from "final" to "staging for upload").**
  - **Intent, quoted from scope §4 (`B_TOKEN_WATCH_SCOPE.md`):** *"birth payload + follow-up series (bulky) | 1 day | daily `.jsonl.gz` → warm → cold"* and *"Transitions: export → upload → **download-verified checksum** → only then remove above (§1)"*. Also: *"★ Cold hand-off built day one"*.
  - **Introducing commit `bdb688284`, quoted:** *"TIERING IS THE ONLY DELETER AND CANNOT REACH A BIRTH RECORD … Cold copy is verified readable BEFORE the hot copy is removed: a hand-off that deletes before confirming is a data-loss path wearing a retention policy's clothes."*
  - **Disposition (2): relevant but needs updating to today's intent.** The off-box leg the scope promised is missing. `tier.py` itself is not changed: a new step consumes its output.
- **`liveness._store_size_check` — TIER 1 (its scheduling changes; its logic does not).**
  - **Intent, quoted from `config.py` (`STORE_CAP_BYTES`):** *"THE STORE CAP — Langston's (b) … This study writes to local disk by design … which makes it the FIRST capture-only writer to share filesystem fate with the trading app. A full `/` stops pm2 logging and stops the app writing."*
  - **Disposition (3): disconnected, should be RECONNECTED.** It was disconnected as a side effect of `#1132`'s mitigation, not by decision.
- **TIER 2, read or called only:**
  - `follow_up.py`: the dead-man's switch host; untouched, stays off (`B-TOKEN-WATCH-FOLLOWUP-MEMORY`).
  - `scripts/system-alerts.ts` `add --dedupe-key`: the alert path; it is already used the same way by `comms-infra/discord/dt-deploy-drift.sh:165`.
  - `server/services/data-archive/storage-client.ts`: the app's B2 client. It is read for the API pattern, not imported, because token-watch is Python, stdlib-only by design.
- **Ledger check (§9.5(b-ii)):** no decision says cold should stay local. `#1132` homed the memory fix to B-TOKEN-WATCH, and `#670` is the same no-hand-off defect in the crew-status store. Neither conflicts.

## 2. Architectural read (1.a)

- **SYSTEM_IMPACT_MAP has NO token-watch entry.** The only hits are the B75 cold-store rows (`:2374`, `:2385`, `:2397`). This governance gap is closed in this batch (OBJ-6). The service shares CPU, memory and disk with the trading app; the map must say so.
- **SYSTEM_MANUAL:** token-watch is capture-only and outside the trading pipeline, so the System Manual is **N/A**. The cold-tier description (`:12214`, `:12271`) gains one line saying the bucket also holds `token-watch/` objects.
- **Blast radius:**
  - The new units run on the trading box, so they get the same `MemoryMax` / `CPUQuota` / `TasksMax` caps as the existing token-watch units.
  - The upload is network egress only, about 105 MB a day after the 5.7 GB backlog.
  - Nothing in the trading app reads `/var/lib/token-watch`.
  - The tracking page reads only `public/` (`summary.py`), which is untouched.

## 3. Objectives

**OBJ-1: the off-box leg.** A new `token-watch/cold_offbox.py` (stdlib only) and its unit run daily after tiering. For each `cold/*.gz` not modified in the last hour, in order:
- upload it to `dt-archive-cold` as `token-watch/cold/<name>`, through the B2 native API with `X-Bz-Content-Sha1`, so B2 itself rejects a corrupted body;
- download it back by name and compare the SHA-256 of the downloaded bytes with the local file's;
- only on a match: append a manifest line to `state/cold-offbox-manifest.jsonl` (name, B2 fileId, sha256, bytes, uploaded_at), then unlink the local file;
- on any error or mismatch: keep the local file, log ERROR, exit non-zero.
- **★ BEFORE upload (B3): decompress the local `.gz` to EOF** and count the uncompressed bytes. `tier.py:178-180` only reads the first byte, so a truncated archive passes it today, the hot copy is already gone, and an upload by itself would faithfully archive the truncation. A decompress failure keeps the file, logs ERROR, and fails the run. The uncompressed count goes in the manifest.
- **Verify by `fileId`, never by name (Langston (2)):** on a keep-all-versions bucket a retried run leaves several versions under one name, so the download-back uses `b2_download_file_by_id` with the id the upload returned.
- **The manifest has its own directory, `offbox/` (B2):** `/var/lib/token-watch/offbox/cold-offbox-manifest.jsonl` (name, fileId, sha256, compressed bytes, uncompressed bytes, uploaded_at). After each run that moved anything, the manifest itself is uploaded to `token-watch/manifest/cold-offbox-manifest.jsonl`; versions accumulate and are never deleted. **Fallback census if the manifest is lost:** `b2_list_file_names` under `token-watch/cold/`, plus each object's `X-Bz-Content-Sha1`.
- **Verify:**
  - (i) after the first run, `cold/` holds only files younger than an hour, and the manifest holds **86** lines for the backlog (the count measured 2026-11-04 13:22Z; any file `tier.py` adds before the run is counted and named), equal to the files removed;
  - (ii) **three manifest entries chosen by a rule stated now: the oldest, the largest and the newest** are re-downloaded by fileId; `gunzip -t` passes, and both the sha256 and the uncompressed byte count match the manifest;
  - (iii) free space on `/` rises by about the 5.7 GB moved (`df` before and after, both stated);
  - (iv) **mutations, judged by exit code, never by grepping:** corrupted downloaded bytes, and a truncated local `.gz`, each leave the local file in place and exit non-zero;
  - (v) a re-run with nothing to move exits 0 and writes no manifest line.

**OBJ-2: least-privilege credential.**
- **The key:** the app's B2 key is account-wide. Its capabilities include `deleteFiles`, `deleteBuckets`, `writeKeys` and `bypassGovernance`, with no bucket or prefix restriction (read 2026-11-04 by `b2_authorize_account`, capabilities only). **It is NOT given to token-watch.** A new key is created with it, restricted to:
  - bucket `dt-archive-cold`;
  - name prefix `token-watch/`;
  - capabilities `listFiles`, `readFiles` and `writeFiles` only — **no `deleteFiles`**.
- **Why that is enough:** with keep-all-versions, a writer without `deleteFiles` cannot destroy an archived object.
- **Who can read it, on two separate axes (Langston (1)):**
  - **At rest:** the key reaches the unit only through systemd `LoadCredential=` from a root-only file (`/etc/token-watch/b2-cold.key`, 0600 root:root). This is the load-bearing half: nothing can read the key all day.
  - **During the run:** the upload runs as a **new system user `tokenwatch-cold`**, so the run-time copy in `/run/credentials/<unit>/` (0400, directory 0700, owned by the unit's user) is not readable by `tokenwatch`.
  - **The residual is compound:** a compromised receiver would first have to escape its own network fence (`IPAddressAllow=localhost`, `IPAddressDeny=any`, `RestrictAddressFamilies`, `NoNewPrivileges`, `MemoryDenyWriteExecute` in its unit) before any call to B2 was possible, and then could only add objects under `token-watch/`.
- **Access for `tokenwatch-cold`, added to the store's EXISTING ACL (B2; corrected per Langston's condition 2):** the root and every subdirectory carry a `user:deploy:r-x` entry with matching default entries, **but on 7 of the 9 directories the mask is `---`** (`getfacl` prints `user:deploy:r-x #effective:---`), so **`deploy` reads `cold/` and `public/` only**, as §0 says. This batch adds entries; it does not create the ACL. It grants:
  - `--x` on the store root;
  - `rwx` on `cold/`, plus a default `r--` for new files, **and `r--` applied to the 86 files already there** (`setfacl -R -m u:tokenwatch-cold:r--`; Langston's condition 1 — the mode census is 82 at 0640 and 4 at 0644, so without it the new user could read 4 of 86). `setfacl -m` recalculates `cold/`'s mask from `r-x` to `rwx`; `deploy` keeps `r-x` on the directory and `r--` on files through its own entries.
  - `rwx` on the new `offbox/`.
  - **Nothing store-wide.** The unit names exactly `ReadWritePaths=/var/lib/token-watch/cold /var/lib/token-watch/offbox`.
- **A decision, stated (Langston's condition 2, third surface):** `offbox/` is created under the root, so it inherits `default:user:deploy:r-x` with `default:mask::r-x`; **the manifest will be readable by `deploy`**, unlike `births/` or `state/`. It holds file names, B2 file ids, hashes and sizes — no secret — so this is accepted, not fenced.
- **Minting the key (Langston (3): inside Kyle's approval).** The account-wide key already lives on staging for the B75 rotator, so this adds no new exposure of it. Conditions:
  - no `validDurationInSeconds`, because an expiring key would die quietly;
  - the secret is returned once, and is written inside the same process under `umask 077` — never on a command line, in a redirect, in shell history or in the journal;
  - the new `keyId` **and** the account-wide key's `keyId` are recorded in governance, so either can be revoked.
- **Verify, by refusal and not only by metadata:**
  - `b2_authorize_account` with the new key reports exactly the three capabilities, the bucket and the prefix;
  - with the new key, **`b2_delete_file_version` on a test object under `token-watch/` is REFUSED**, and **a read of an object outside `token-watch/` is REFUSED** (expected outcomes stated before each runs, judged by HTTP status);
  - as `tokenwatch`, reading `/etc/token-watch/b2-cold.key` is refused (exit code).

**OBJ-3: the size check runs on its own.** A new root-run daily unit, `token-watch-store-watch`, runs `token-watch/store_watch.py`.
- It calls `liveness._store_size_check()`, the single home of the cap and its warn line.
- On `warn` or `over_cap` it mints a system alert as `deploy`: `npm run system-alerts -- add --dedupe-key token-watch-store-<state> --severity warning|critical`, with the measured bytes, the per-directory split and the cap in the body.
- It is the same mint form as `dt-deploy-drift.sh:165`, and a failed mint is logged as `MINT_FAILED`, never swallowed.
- **It calls `_store_size_check()` and NEVER `check()` or `python3 liveness.py`** (Langston's record item). `check()` ends in `save_state` into `state/`, so a root run would leave root-owned files that `tokenwatch` cannot rewrite, and the liveness switch would stay broken; `liveness.py`'s `__main__` *is* `check()`. Made a mechanism: the unit has `ReadOnlyPaths=/var/lib/token-watch`, and a test asserts the run writes nothing under the store.
- **★ THE WARN ROW IS A STANDING CONDITION, NOT AN EVENT (Langston B1).** After OBJ-1 the store is about 7.74 GB, above the 6 GiB warn line by design, so `token-watch-store-warn` will stay open. Its body says so and names what clears it (the store back under 6 GiB). It is **not** resolved as fixed, and Step 8 must not read it as a pass.
- **Time to the cap after the drain:** about 852 MB of headroom. On 11-03 the stores that stay grew about 120 MB (births 28 + due 92; a single-day reading). So **the critical row would fire in roughly a week** unless `due/` stops growing; `due/` buckets only start pruning after 91 days, from about 2026-11-30. This goes to Kyle now, not at Step 8.
- **Verify:**
  - (i) a run today mints an alert. Predicted before it runs: `over_cap`/critical while `cold/` is undrained (13.82 GB against 8.59 GB), and `warn` after OBJ-1 (7.74 GB, above 6.44 GB);
  - (ii) a run with the cap raised in a test copy mints nothing;
  - (iii) a second run with the row still open does not mint a duplicate (dedupe).

**OBJ-4: failures are not silent.** `OnFailure=` on **the tier, summary, receiver, cold-offbox and store-watch units** starts a root template `token-watch-failed@.service`, which mints a system alert naming the failed unit. This is `#1132` (c). The follow-up unit gets it in `B-TOKEN-WATCH-FOLLOWUP-MEMORY`, when it is fixed and re-enabled.
- **The summary unit and timer are live on staging with no copy in the repo** (Langston's record item; same class as `#1004`). Their absence once made the tracking page go stale invisibly. Both are copied into `token-watch/systemd/` byte-for-byte from the box first, then edited only to add `OnFailure=`.
- **Verify:** a deliberately failing run of `cold_offbox` (bad key path) mints exactly one alert naming the unit, and that test alert is then resolved.

**OBJ-5: the backlog.** The 5.7 GB already in `cold/` moves through OBJ-1's own path. There is no special one-off script, so the backlog is the first real exercise of the code. It is run once by hand after deploy, then left to the timer.

**OBJ-6: governance.**
- A **SYSTEM_IMPACT_MAP entry for token-watch**: every unit (receiver, tier, summary, follow-up (disabled), cold-offbox, store-watch, the failure template), every store, both users, the caps, the off-box leg, **the existing ACL (`deploy` has entries everywhere but reads only `cold/`, `public/` and the new `offbox/`, because the mask is `---` elsewhere)**, and the shared-box blast radius (an existing gap, closed here).
- **STORAGE_POLICY:** a token-watch row with the hot windows (raw 1 day, working index 90 days, births never deleted) and `cold → dt-archive-cold/token-watch/`.
- A SYSTEM_MANUAL one-liner (cold-tier contents).
- `token-watch/README.md` and the B-TOKEN-WATCH pre-registration as an appended AMENDMENT.
- The `#1132` entry, `BATCH_CATALOG`, my task list, and a completion report.

**OBJ-7 (amendment 1): spent `due` buckets are pruned on their own constant, and only once the reader has passed them.**
- **Why:** `due` is the largest store and the largest growth term. `prune_due_buckets` keeps every bucket for `WORKING_INDEX_HOT_DAYS + 1` = 91 days (`tier.py:195-216`, `config.py:234`), a constant borrowed from the grid lookback, which says nothing about how long a spent hour is worth keeping (Langston).
- **The reader, named:** `follow_up.py` reads buckets from its own cursor forward (`_buckets_to_read`, `follow_up.py:130-156`, at most `CATCHUP_MAX_BUCKETS` = 48 per run, through `store.due_now` at `store.py:637`) and advances the cursor after them (`_advance_cursor`). ⛔ **So a past bucket the cursor has not reached is NOT spent: if the job restarts, it reads it.** Langston's premise, "a bucket is dead once its hour passes", holds only while the job is running. Today it has not run since the cursor's `2026-09-30T13`.
- **Measured 2026-11-05 07:1xZ on staging (`due/` split by bucket hour against `state/follow_up_cursor.json`):**

| buckets | count | bytes |
|---|---|---|
| at or before the cursor (`2026-09-30T13`) — consumed, spent | 724 | **1.137 GiB** |
| after the cursor, hour already past — **never read** | 851 | 1.016 GiB |
| current and future | 1,767 | 0.497 GiB |

- **The change:** a NEW constant `DUE_SPENT_HOT_DAYS` (never `WORKING_INDEX_HOT_DAYS` reused, so a grid change cannot move retention), with a comment naming the reader. The prune removes a bucket only when its hour is BOTH before the cursor and older than `DUE_SPENT_HOT_DAYS`. **A missing or unreadable cursor prunes nothing** (logged): an unknown position is never read as "all spent". The old 91-day rule is removed, because it could also delete never-read buckets after a 91-day outage.
- **Proposed value: 3 days.** Nothing reads a consumed bucket; 3 days keeps the last few for an audit read of the schedule. Langston to rule on the number.
- **Effect today:** frees ~1.14 GiB, store ~7.18 → ~6.04 GiB. The 1.016 GiB of never-read buckets stays: whether a 36-day catch-up is wanted when the job returns is `B-TOKEN-WATCH-FOLLOWUP-MEMORY`'s call.
- **Verify:** unit cases, each predicted before it runs: consumed and older than 3 days → removed; consumed and younger → kept; past but after the cursor → kept; future → kept; no cursor → nothing removed. Mutation: dropping the cursor bound must fail the after-cursor case. Live: `due/` bytes before and after the next 04:30Z tier run, with the cursor unchanged.

**OBJ-8 (amendment 1): the feed's dead-man's switch runs on its own, and pages.**
- **Measured:** `liveness.check()` last ran 2026-09-30T13:04:39Z (`state/liveness.json` `checked_at`). Its only caller is the follow-up job (`follow_up.py:220`), whose timer is disabled. **The new-token feed then stopped for 8 days with nothing raised:** the last birth row of 2026-10-18 was written at 20:24Z, the receiver logged 13 receipts on 10-20 (22:14Z) and almost nothing else, and births resumed at 2026-10-27T00:00Z. No birth file exists for 10-19 or 10-21..10-26 (Langston found it in `public/summary.json`; re-derived by me from `births/` and the receiver's journal). Births are never re-derivable.
- **And even when it ran, it only LOGGED.** `check()` writes a warning and a gap record (`liveness.py:234-270`); it mints no system alert, so an 8-day stop would have been a log line.
- **The change:** a new hourly unit, `token-watch-feed-watch`, runs `liveness.check()` as `tokenwatch` (it writes `state/`, so never as root — OBJ-3's rule); a root companion step mints `token-watch-feed-gap` (warning) through the same `alert_mint` path as the store watch while `open_gap` is set, with its start time in the body, and the row clears when the gap closes. `OnFailure` per OBJ-4.
- **Verify:** an open gap in a test store mints exactly one alert; a closed gap mints none; a second run does not duplicate; a run that cannot read the census fails the unit (pages), never reports "no gap".
- **Not in this batch: why the feed stopped.** Langston proposed `B-TOKEN-WATCH-BIRTH-GAP` (owner Infra Claude, stage 00, after this batch); a new batch needs Kyle's agreement (2026-10-19 rule), so it goes to him through PM Claude.

## 4. Out of scope, each with its home

- **The follow-up sweep's memory fix and restart:** `B-TOKEN-WATCH-FOLLOWUP-MEMORY` (§0a order 4, after `B-LANGSTON-CLAUDEMD-RESIDUAL`).
- **Births stay on the box:** by design (scope §4, never deleted). They are about 28 MB a day.
- **Finding, not fixed here: `due/` has no measured steady state** (2,807,777,303 B today, §0; Langston accepted the disposition). `prune_due_buckets` removes hour buckets older than 91 days, so `due/` should plateau. The buckets date from 2026-08-31, so the plateau is not reached yet and its size is unmeasured. If it sits near today's growth, it would hold the store above the 6 GiB warn line on its own. OBJ-3's alert will show this; sizing it is folded into `B-TOKEN-WATCH-FOLLOWUP-MEMORY`, where the sweep that reads `due/` is fixed. *DISPOSITION: added to B-TOKEN-WATCH-FOLLOWUP-MEMORY.*
- **The rest of staging's disk** (telemetry files, the March trace): OLD Claude's, per Kyle 2026-11-04.

## 5. What I want attacked

1. **The separate user plus `LoadCredential=`**, against the simpler option of a 0640 root:tokenwatch key file. The residual, with the simpler option: a compromised receiver could add objects under `token-watch/` (cost only; no delete, no read outside the prefix). Is the separation worth one more account on the box?
2. **Deleting the local copy on a sha256 match of a single download**, against keeping local copies for N days.
3. **Minting the restricted key with the account-wide key.** It is a credential change on Kyle's B2 account, made by API from staging. The new key's secret goes only into the root-only file and is never printed.
