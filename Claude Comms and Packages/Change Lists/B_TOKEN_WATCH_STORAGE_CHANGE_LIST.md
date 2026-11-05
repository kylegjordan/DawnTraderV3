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

## Tests (current at Step 4 r4; r1 figures superseded)

| suite | Windows | staging Linux (scratch copy) |
|---|---|---|
| `test_cold_offbox.py` (fake B2 returning ONE measured v4 shape per request; refusal blocks check their REASON) | 71 / 0 | 71 / 0 |
| `test_store_watch.py` | 31 / 0 | 31 / 0 |
| `test_ops_boundary.py`: direct-import allowlist, the computed import CLOSURE within {config, tier, liveness, store, provenance}, `PINNED` == closure, `OPS` == ops/ modules | 14 / 0 | 14 / 0 |
| `mutate_cold_offbox.py`: read-back compare off · EOF check off · prefix refusal off · capability allowlist off · capabilities-present off · v4-shape off · bucket check off · bucket name+id clauses dropped · bucket entry type dropped · abort→carry-on | 10 of 10 caught | 10 of 10 caught |
| every other token-watch suite | all pass (`test_isolation` skips 4 on Windows) | all 19 suites exit 0 at r4 (`test_isolation` 20/0/0) |

The mutations are applied **by exact line**: the runner refuses if the line is not found exactly once. Each one is judged by **the suite's exit code AND the named block's FAIL line**.

**Round history:**
- **r2** — the v4 blocker: auth at v4, the v4 shape only, and a capability ALLOWLIST. Also: the measured fixture, reason checks, the pinned collector files, and checks before install.
- **r3** — the bucket leg fenced (T13, T14), and `PINNED` is the measured import closure.
- **r4** — the wrong-bucket, no-id and not-an-object cases (T15-T17) and their two mutations, and `OPS` asserted equal to the ops/ modules.
- **Positive control on staging:** the real account-wide key is REFUSED at v4 for its capabilities. That proves the refusal side only; the PASS side is `prove_cold_key.py` step 1, after the mint.

## Judgement calls I want attacked

1. **`ops/` outside the collector.** `test_pipeline.py` failed three checks when the new modules sat at the top level ("exactly ONE module makes OUTBOUND calls", "exactly ONE egress CALL SITE", "…and it is in providers.py").
   - I moved the four jobs into `ops/`, which that scan does not walk (`os.listdir(here)`, top level only), and added `test_ops_boundary.py`.
   - Is a directory boundary plus its own test the right answer? The alternative is an explicit, reasoned exemption list inside `test_pipeline.py`. Its author warns against name lists ("DERIVED, NEVER A NAME LIST"), which is why I did not choose it.
2. **The key gate inside the uploader**, refusing the account-wide key, as well as the key's own restriction. Belt and braces, or noise?
3. **`install_storage.sh` reads blobs through `deploy`'s app clone** (a fetch in the app's repo). The alternative is a separate bare clone just for token-watch.


---

# AMENDMENT 1 (OBJ-7 due prune, OBJ-8 feed watch) — Step 4 change list

## Dispatch header
- **(i) Declared change-class:** `non_architecture` (scope header, unchanged by the amendment).
- **(ii) That class's doc set:** scope `B_TOKEN_WATCH_STORAGE_SCOPE.md` r3a **present** (OBJ-7, OBJ-8, C-1..C-5) · pre-audit `B_TOKEN_WATCH_STORAGE_PRE_AUDIT.md` §4 r2a **present** (Langston PROCEED, two in-commit conditions landed at `20803391b`) · this change list **present** · completion report **absent, not yet due** (Step 11) · SIM / `STORAGE_POLICY` / `SYSTEM_MANUAL` line / `BATCH_CATALOG` / `PHASE_HISTORY` **absent, not yet due** (Step 10, P10) · `DELETED_COMPONENTS_LOG` **N/A** — nothing is removed as a component; the 91-day due rule is replaced in place, and the `run_hour` → `liveness.check()` call moves, it is not deleted as a capability.
- **(iii) Step-2 reference:** `Claude Comms and Packages/Scope Files/B_TOKEN_WATCH_STORAGE_PRE_AUDIT.md` §4, r2a at `20803391b`.
- **Graded ref:** the commit that carries this section (it names its sha in the dispatch): `eebe1ed12` (15 files) plus the damaged-cursor fix found by the second reader below.

## What changed, by plan item

### P1 `config.py` — `DUE_SPENT_HOT_DAYS = 7`
With a comment naming the reader (the follow-up, through the cursor) and why it is not `WORKING_INDEX_HOT_DAYS`.

### P2 `follow_up.py` — the lineage start, and the switch call removed (A9)
```python
# BEFORE
def _advance_cursor(buckets):
    if buckets:
        save_state("follow_up_cursor",
                   {"last_bucket": max(buckets).strftime("%Y-%m-%dT%H")})
# AFTER
    if not buckets:
        return
    prev = load_state("follow_up_cursor", {})
    rec = {"last_bucket": max(buckets).strftime("%Y-%m-%dT%H")}
    if prev.get("consumed_from"):
        rec["consumed_from"] = prev["consumed_from"]
    elif not prev.get("last_bucket"):
        rec["consumed_from"] = min(buckets).strftime("%Y-%m-%dT%H")
    save_state("follow_up_cursor", rec)
```
**Fix after the second reader (below), in the follow-up commit:** the condition is not "a `last_bucket` key exists" but "`_last_consumed` can parse it". A cursor whose `last_bucket` is missing or unparsable while `consumed_from` survives is a DAMAGED cursor; `_last_consumed` already treats it as a first run, so it now starts a new lineage too (`prev_last_ok = _last_consumed(None) is not None`).
**Judgement call:** a cursor that EXISTS without `consumed_from` keeps it ABSENT (the pre-field state of the live cursor). Starting it at the next run's hour would date it to whenever the job next ran; only the backfill (P4) sets it. The prune treats "absent" as "remove nothing".
`run_hour`'s `liveness.check()` block and the `import liveness` are deleted (A9); a comment names where the switch now runs.

### P3 `tier.py` — `classify_due_buckets` + `prune_due_buckets`
```python
# BEFORE (removed): cutoff = now - timedelta(days=WORKING_INDEX_HOT_DAYS + 1); unlink any bucket older
# AFTER, the decision per bucket:
            if not ok:            # no cursor, no consumed_from, or consumed_from > last_bucket
                cls = ("kept_after_cursor" if last is not None and h > last
                       else "kept_before_consumed_from")
            elif h < first:
                cls = "kept_before_consumed_from"
            elif h > last:
                cls = "kept_after_cursor"
            elif h < spent_before:          # now - DUE_SPENT_HOT_DAYS
                cls = "removable"
            else:
                cls = "kept_spent_window"
```
`prune_due_buckets` reads the cursor with `load_state` inside `run`'s `periodic_lock` (the follow-up's lock), removes only the `removable` paths, and returns and logs count + bytes for every class plus `due_prune_ok` / `due_prune_reason`. The docstring states the refuted premise. One classifier serves the prune and the census, so they cannot disagree.

### P4 `tools/backfill_consumed_from.py` (new)
Derives the hour from the FIRST observations file, excluding `reason == "scheduled_in_the_past"`; prints both minima and the three row counts; refuses (exit 2, nothing written) on a disagreement with the literal `"2026-08-31T11"`, a missing cursor file, an existing `consumed_from`, or `last_bucket` before the value. Dry run unless `--apply`; takes the periodic lock.

### P5 `tools/due_census.py` (new)
Read-only, the same classifier. ⚠️ **Deviation:** P5 said "written to `offbox/due-census.json`". `offbox/` is `tokenwatch-cold`'s (0750, measured today) and `tokenwatch` cannot write it, so it writes `<store>/due-census.json`, where the store root's default ACL gives `deploy` read.

### P6 `liveness.probe_readable()` + `ops/feed_watch.py` (new)
The probe: the census directory LISTS; it holds ≥1 dated file; the newest opens and yields a byte; the cursor's file (if any) opens and yields a byte, **unless it is dated after every census file present**. ⚠️ **Deviation:** P6 said "open the cursor's birth file and today's … EACCES/ENOENT → exit non-zero". In a real outage there is no today's file, and that is the prospective leg's gap to report, not a unit failure that would stop the gap being recorded — so the probe reads the NEWEST file instead of today's.
⛔ **CORRECTED AT STEP 4 PART 2 (Langston, CHANGES NEEDED 19:07Z): the deviation was only half applied at `3a68e4fd0`.** `check()` parks the cursor on TODAY's path whether or not that file exists (`liveness.py`, end of the forward read), so the cursor leg still required today's file one hop later: from the second hourly run after midnight in an outage the probe failed every run, `check()` never ran, recovery did not heal it, and `gaps.jsonl` held no record of the outage — the #1247 shape (six consecutive missing day files) would have wedged it for the whole outage. **Fix:** the cursor leg now discriminates. A cursor file that does not exist and is dated AFTER every census file present was never created (an outage) — the probe passes and the prospective leg reports the gap. A cursor file that is gone while it is NOT ahead of the newest census file means the census was deleted or moved — still a failure. A cursor outside the census directory is opened as before. ENOENT on a cursor file that should exist still fails.
`--check` (tokenwatch): probe → exit 2 naming each path, no reading taken, no result written; else `check()`, then the result (`checked_at`, `open_gap`, stats, `maxrss_mb`) to `state/feed_watch_result.json`.
`--mint` (root): refuses a missing result or one older than 15 min (exit 1); mints `token-watch-feed-gap` (warning) only on an open gap; the body states A8's consequence and says resolve, never ack. Imports `config` and `liveness` only.

### P7 units (new) `token-watch-feed-watch.service` / `.timer`
`User=tokenwatch`, `ExecStart … --check`, `ExecStartPost=+ … --mint`, `OnFailure=token-watch-failed@%n.service`, `NoNewPrivileges=true`, `ProtectSystem=strict`, `ReadWritePaths=/var/lib/token-watch`, `MemoryMax=256M`. Timer `OnUnitActiveSec=3600s` — a test asserts it equals `config.LIVENESS_CHECK_INTERVAL_SECONDS`.

### P9 `deploy/install_storage.sh`
```sh
# BEFORE: each PINNED live file vs the NEW blob (would refuse this amendment)
  tr -d '\r' < "$DEST/$f" | cmp -s - "$stage/$f"
# AFTER: every live file vs its blob at the PREVIOUS reviewed install
PREV=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sha"])' "$DEST/INSTALLED")
...
for f in $ALL; do
  [ -f "$DEST/$f" ] || continue          # new in this install: nothing to guard
  g cat-file blob "$PREV:token-watch/$f" > "$prev" … || fail "… live but has no blob at the previous install"
  tr -d '\r' < "$DEST/$f" | cmp -s - "$prev" || fail "… edited on the box — stop and look"
done
```
Plus: `OPS` gains `ops/feed_watch.py`; `CORE="follow_up.py"`; the four lists asserted disjoint; compile covers OPS, CORE and TOOLS; the feed-watch units installed and the service verified; `previous_sha` written into `INSTALLED`. ⚠️ **Deviations, both widenings:** (a) a fifth list, `TOOLS`, so P4/P5's tools are installed from the reviewed blob under `/opt/token-watch/tools` and run from there as `tokenwatch` (they import the collector from their parent directory; run from the app clone they would need tokenwatch to read `/home/deploy`); (b) the guard covers every live file in all four lists, not PINNED and CORE only — OPS were installed from blobs at the previous sha, so they must match it too.

### Also
- `ops/store_watch.py`: two stale sentences (the `follow_up.py:220` pointer and "pruning starts ~91 days") corrected.
- `tests/test_ops_boundary.py`: the job list gains `feed_watch`.
- `tests/test_wiring.py` §7 REWRITTEN: it proved `run_hour` ran the switch — the wiring this amendment removes. It now proves `run_hour` does NOT write `state/liveness.json`, the feed watch's check step DOES, and a held periodic lock cannot silence it.

## Tests
- `tests/test_due_storage.py` (new): **114 passed, 0 failed** at the Step-4 re-land on Windows; Linux CI runs one more check, the permission-wall case, which Windows skips and says so (round 1 read 66; the CI run's own count is the carrier) — the classes by count and bytes; the live shape (a cursor 36 days behind with old unread buckets after it); no cursor / no `consumed_from` / inverted cursor remove nothing; C-1 cursor-loss-then-one-run; lineage never moves; census removes nothing; the backfill's refusals (round 1 covered four of five documented arms — Langston part 3 C-3; the empty-derivation, usage and lock-held arms were added at Step 4, so all are now driven) + dry run + apply; the probe (missing dir, empty dir, unreadable newest, vanished cursor file; EACCES where a non-root POSIX account exists, else skipped and said so); open gap mints with the fixed key, closed gap does not, stale/missing result refused, failed mint exits 1; the units and installer carry the feed watch.
- `tests/mutate_due_storage.py` (new): **16 of 16 caught** at the Step-4 re-land (round 1: 6; ten added by the three Step-4 rounds, named in the "Step-4 fixes" section below), each by exit code AND its named FAIL line, each patch verified applied. Round 1's six: no cursor bound · no `consumed_from` in the classifier · no lineage start on a lost cursor · a damaged cursor keeping its old `consumed_from` · no probe · backfill counting the miss rows. (Round 1 had the cursor-bound mutation SURVIVE: the only after-cursor bucket was 2 days old, inside the margin. The live shape — old unread buckets after a stalled cursor — was added and it is now caught.)
- Every other `tests/test_*.py` passes unchanged.

## Second reader, before this dispatch
`REVIEWER: object handed (the code at eebe1ed12) · "what other states of the world, consistent with this code, delete a due bucket that was not fully read?" · 5 candidates · re-derived as below`
1. **A damaged cursor** (`consumed_from` kept, `last_bucket` unreadable) — **re-derived, real** (`follow_up.py:120-126` → first run → old `consumed_from` kept). **Fixed** (P2 above); test §4b + mutation.
2. **A stolen periodic lock** lets a second follow-up run move the cursor while the first still re-queues into a passed bucket, and can move the cursor backward — mechanism read (`store.py:157-166`, `follow_up.py:209`). 3. **Read is not processed** — an observation that raises is dropped, not re-queued (`follow_up.py:315-318`). 5. **A birth appended into a bucket already read** (the receiver takes no lock). ⇒ **All three are the follow-up's own read guarantees, and the observation is lost whether or not the prune runs: the prune only removes the scheduling entry, which is derivable from the census** (an entry is `mint`, `age`, `due_at`, `created_at`, `store.py:355-357`). The follow-up timer is off. **HOME: `B-TOKEN-WATCH-FOLLOWUP-MEMORY` OBJ-4b (scope r1b), §9.4 disposition 2 — that batch re-enables the timer, so they are settled before it does.**
4. **The backfill assumes the follow-up read every hour 08-31 → 09-30 without a reset** — hypothesis, not checkable from the journal (it starts 2026-10-11). Bounded the same way: a bucket behind the cursor is never read again by the follow-up whether or not it is removed, and its entries are derivable from the census. Stated as a residual, not fixed.

## Not yet done (later steps)
Install (P9) at a reviewed sha; the A7 mint drill ending in a read-back `resolve` before the timer is enabled; the backfill (P4, dry run then `--apply`); the census before and after the next 04:30Z tier run (P5); first live feed-watch run's `maxrss_mb` recorded (it reads 36 days of census the first time).

## Judgement calls I want attacked
1. P6's probe reading the NEWEST census file rather than today's — and (part-2 fix) the cursor leg forgiving only a never-created day file dated after every census file.
2. P2 leaving `consumed_from` absent on a pre-field cursor rather than starting it.
3. The first live `--check` reads the census from the switch's 2026-09-30 cursor to now (~36 daily files, one at a time). I expect well under `MemoryMax=256M` and will record `maxrss_mb`; is that the right bound, or should the first run be done by hand outside the unit?

### AMENDMENT 1 — Step-4 fixes (part 1 and part 2 rulings)

- **Part 1 (PROCEED, three in-commit items), `55c3adfca`:** the lineage premise is named as unevidenced in `tools/backfill_consumed_from.py` and checked by `tools/due_census.py --lineage` (a removable bucket with < 50 % of its entries observed within its day + 2 is a gap; exit 1; run before the first real prune); `last_bucket` and `consumed_from` parsed separately with a `damaged cursor: …` reason; both `<=` endpoints carry a bucket in `LAYOUT` and are mutated. Record line in the `classify_due_buckets` docstring: the lower bound is load-bearing on the scheduler's same-hour push.
- **Part 2 (CHANGES NEEDED, the midnight wedge):** `liveness._never_created` + the probe's cursor leg, above. Test section 9b drives `run_check` across midnight with no new census file (four runs over three days: rc 0, `check()` ran, the gap stays open from the last row, the mint fires), with a positive control that the cursor did park on a never-created file; then the feed returns, the gap closes and a `prospective_closed` record lands in `gaps.jsonl`. Section 8 adds the two discriminating cases (gone with newer files present = problem; dated after every file = not). Mutations 12/12, two new: the old cursor leg (caught at "second run after midnight (the wedge)", matching Langston's replay) and a probe that forgives every missing cursor file.
- `tests/test_due_storage.py`: **101 passed, 0 failed**. Every other token-watch suite green.
- **Part 3 (PROCEED, both widenings approved, three in-commit conditions):** C-1 the installer compiles `$ALL`, PINNED included; C-2 the record carries `actor_declared` (the constant, a claim) and `actor_transport` (SUDO_USER, else logname, else "unknown"), never a bare `actor`; C-3 the backfill's no-follow-up-observation (miss rows only), usage and lock-held refusals are tested, and the "every backfill refusal" claim above is corrected in place. Record items: R-1 the `systemd-analyze` FAIL and the guard's "edited on the box" message both name the failed-install-after-copy case; R-3 the lineage floor is stated with its reason (requeue and observation-error write no row; residual is conservative) and pinned at its boundary (exactly 0.5 is not a gap, one third is), with a mutation moving it; R-4 `--lineage` persists its verdict to `<store>/due-lineage.json`. R-2 (nothing removes a file that leaves the four lists) is a close-time disposition: the two TOOLS stay installed under `/opt/token-watch/tools` as the record of what gated the first prune; their §15 disposition is stated in the completion report.
- **Part 2 re-review (PROCEED, one in-commit item):** the census listing is filtered to census-shaped names by `liveness._is_census_name` (the inverse of `_birth_path`: 16 chars, `YYYY-MM-DD.jsonl`, the date parses), so legs 2, 3 and 4 all inherit it; `_never_created` date-shape-tests its own operand too. Reason: a stray letter-initial `.jsonl` sorted after every date, became "the newest census file" for every leg, and a probe failure takes no reading — loud about the stray, silent about the feed, the wedge's twin. Reachability zero in code (every writer goes through `_birth_path` / `store.py:185`), so a fence. Test: a `backup.jsonl` beside a real census changes no verdict (the readable census passes; a never-created day passes); mutation restoring the unfiltered listing is caught. **Left intentionally (§9.4 disposition 5, Langston re-read both consumers):** `promote.py:116` and `summary.py:114` carry the same unfiltered `endswith(".jsonl")` listing and are inert to a stray file — `summary._fold` derives the day from the row's own fields, `promote` uses the name only as a path and cursor key. Not refactored.
- **CI carrier (Langston's evidence finding):** `token-watch` had no CI step. `.github/workflows/ci.yml` gains "Token-watch storage tests", running `test_due_storage.py` and `mutate_due_storage.py` (stdlib only; the suite builds its own store root with `tempfile`). From here the counts are CI-carried, not hand-run.
- Tests now: `test_due_storage.py` **112 passed, 0 failed**; mutations **15/15**.
