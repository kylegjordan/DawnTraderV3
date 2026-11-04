# B-TOKEN-WATCH-STORAGE — SCOPE r1

change-class: sub_batch

**Parent:** `B-TOKEN-WATCH` (paused, after live). **Issue:** `#1132` (2026-11-04 measurement). **Owner:** Infra Claude (CC-INFRA).
**Directive:** Kyle 2026-11-04, relayed by OLD Claude (inbox msg `1567524394312532069`): *"token-watch storage fix (a) and (b) jump ahead of your Langston size work. (a) Upload each compressed file to the off-box cold store (B2), check it by downloading it again, then delete the local copy; then move the 5.7 GB already there the same way. (b) Run the 8 GiB check daily, with an alert. Both go through Langston as usual."*
**Placement:** `SPRINT_TO_LIVE_PLAN.md` §0a, Infra Claude order 1 (commit `6584f6b05`).

## 0. Why — measured on staging 2026-11-04

| what | value | how |
|---|---|---|
| `/` on staging | 75G, 62G used, 11G free (86%) | `df -h /` |
| token-watch store | 13,801,205,273 B | `du -sb /var/lib/token-watch` |
| the store cap | 8 GiB = 8,589,934,592 B (`config.py` `STORE_CAP_BYTES`) | repo at `6584f6b05` |
| `cold/` (same disk) | 5.7G, 86 files | `du -sh`, `ls \| wc -l` |
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
- **Verify:**
  - (i) after the first run, `cold/` holds only files younger than an hour, and the manifest line count equals the files removed;
  - (ii) three manifest entries chosen by line number are re-downloaded on the box, `gunzip -t` passes and the sha256 matches the manifest;
  - (iii) free space on `/` rises by about the 5.7 GB moved (`df` before and after, both stated);
  - (iv) **mutation:** a test that corrupts the downloaded bytes leaves the local file in place and exits non-zero, judged by exit code, never by grepping;
  - (v) a re-run with nothing to move exits 0 and writes no manifest line.

**OBJ-2: least-privilege credential.**
- **The key:** the app's B2 key is account-wide. Its capabilities include `deleteFiles`, `deleteBuckets`, `writeKeys` and `bypassGovernance`, with no bucket or prefix restriction (read 2026-11-04 by `b2_authorize_account`, capabilities only). **It is NOT given to token-watch.** A new key is created with it, restricted to:
  - bucket `dt-archive-cold`;
  - name prefix `token-watch/`;
  - capabilities `listFiles`, `readFiles` and `writeFiles` only — **no `deleteFiles`**.
- **Why that is enough:** with keep-all-versions, a writer without `deleteFiles` cannot destroy an archived object.
- **Who can read it:** the receiver is internet-facing and runs as `tokenwatch`. So the upload runs as a **new system user `tokenwatch-cold`**, and the key reaches it only through systemd `LoadCredential=` from a root-only file (`/etc/token-watch/b2-cold.key`, 0600 root:root). `tokenwatch-cold` gets an ACL on `cold/`: `rwx` on the directory, plus a default `r` for new files. It gets no other access to the store.
- **Verify:** `b2_authorize_account` with the new key reports exactly the three capabilities, the bucket and the prefix. As `tokenwatch`, reading the key file is refused (exit code, stated before it runs).

**OBJ-3: the size check runs on its own.** A new root-run daily unit, `token-watch-store-watch`, runs `token-watch/store_watch.py`.
- It calls `liveness._store_size_check()`, the single home of the cap and its warn line.
- On `warn` or `over_cap` it mints a system alert as `deploy`: `npm run system-alerts -- add --dedupe-key token-watch-store-<state> --severity warning|critical`, with the measured bytes, the per-directory split and the cap in the body.
- It is the same mint form as `dt-deploy-drift.sh:165`, and a failed mint is logged as `MINT_FAILED`, never swallowed.
- **Verify:**
  - (i) a run today mints an alert. Predicted before it runs: the store is 13.8 GB against the 8 GiB cap, so `over_cap`/critical before OBJ-1 moves anything, and `warn` after it (about 8.1 GB, above the 6 GiB warn line);
  - (ii) a run with the cap raised in a test copy mints nothing;
  - (iii) a second run with the row still open does not mint a duplicate (dedupe).

**OBJ-4: failures are not silent.** `OnFailure=` on the tier, cold-offbox and store-watch units starts a root template `token-watch-failed@.service`, which mints a system alert naming the failed unit. This is `#1132` (c), for the units this batch touches. The follow-up unit gets it in `B-TOKEN-WATCH-FOLLOWUP-MEMORY`.
- **Verify:** a deliberately failing run of `cold_offbox` (bad key path) mints exactly one alert naming the unit, and that test alert is then resolved.

**OBJ-5: the backlog.** The 5.7 GB already in `cold/` moves through OBJ-1's own path. There is no special one-off script, so the backlog is the first real exercise of the code. It is run once by hand after deploy, then left to the timer.

**OBJ-6: governance.**
- A **SYSTEM_IMPACT_MAP entry for token-watch**: all its units, stores, users, caps, the off-box leg, and the shared-box blast radius (an existing gap, closed here).
- **STORAGE_POLICY:** a token-watch row with the hot windows (raw 1 day, working index 90 days, births never deleted) and `cold → dt-archive-cold/token-watch/`.
- A SYSTEM_MANUAL one-liner (cold-tier contents).
- `token-watch/README.md` and the B-TOKEN-WATCH pre-registration as an appended AMENDMENT.
- The `#1132` entry, `BATCH_CATALOG`, my task list, and a completion report.

## 4. Out of scope, each with its home

- **The follow-up sweep's memory fix and restart:** `B-TOKEN-WATCH-FOLLOWUP-MEMORY` (§0a order 4, after `B-LANGSTON-CLAUDEMD-RESIDUAL`).
- **Births stay on the box:** by design (scope §4, never deleted). They are about 28 MB a day.
- **Finding, not fixed here: `due/` has no measured steady state.** `prune_due_buckets` removes hour buckets older than 91 days, so `due/` should plateau. The buckets date from 2026-08-31, so the plateau is not reached yet and its size is unmeasured. If it sits near today's growth, it would hold the store above the 6 GiB warn line on its own. OBJ-3's alert will show this; sizing it is folded into `B-TOKEN-WATCH-FOLLOWUP-MEMORY`, where the sweep that reads `due/` is fixed. *DISPOSITION: added to B-TOKEN-WATCH-FOLLOWUP-MEMORY.*
- **The rest of staging's disk** (telemetry files, the March trace): OLD Claude's, per Kyle 2026-11-04.

## 5. What I want attacked

1. **The separate user plus `LoadCredential=`**, against the simpler option of a 0640 root:tokenwatch key file. The residual, with the simpler option: a compromised receiver could add objects under `token-watch/` (cost only; no delete, no read outside the prefix). Is the separation worth one more account on the box?
2. **Deleting the local copy on a sha256 match of a single download**, against keeping local copies for N days.
3. **Minting the restricted key with the account-wide key.** It is a credential change on Kyle's B2 account, made by API from staging. The new key's secret goes only into the root-only file and is never printed.
