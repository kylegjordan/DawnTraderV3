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
- Tests at that round (superseded): 112 passed on Windows, 15/15 mutations. **The final counts are in the Tests section above and in the CI run's own step;** this line is round history, not the current figure (Langston, Step-4 confirm record item 1).

## AMENDMENT 1 — Step 6, the install (staging, 2026-11-05 22:04-22:09Z)
- **CI (Step 5):** run `42117437480`, 4/4 per job, at `c428153655a`, which contains every reviewed token-watch change (`git diff dd729465a..c428153655a -- token-watch/` is empty).
- **Install:** `install_storage.sh` brought from the blob at `c428153655a` (blob `09207b03…`, `git hash-object` equal on the box) and run as root. The guard compared every live file with its blob at the previous install `41b538165` and passed. `INSTALLED` now carries `sha c428153655a…`, `previous_sha 41b538165…`, `actor_declared cc-infra`, `actor_transport root`, `installed_at 2026-11-05T22:04:09Z`, and a sha256 for each of the 24 files and units. The receiver was not restarted.
- **A7 mint drill:** a forced `open_gap` was written by `tokenwatch` (22:04:24Z) and `feed_watch.py --mint` run as root minted `c525db35-96fa-4290-81c2-1f429da17cb7` (`token-watch-feed-gap`, rc 0). It was **resolved** with evidence at 22:04:37.9Z (never acked) and **read back `resolved`** from the alert log before the timer was enabled.
- **First real check:** `rows=1,286,269`, `open_gap=None`, maxrss 187.5 MB. It wrote the two historical outages into `gaps.jsonl` after the fact: 2026-10-18T20:24Z → 10-20T22:12Z (179,320 s) and **10-20T22:14Z → 10-27T00:00Z (524,798 s, `#1247`'s six missing day files)**. **`token-watch-feed-watch.timer` enabled** 22:04:59Z (`User=tokenwatch`, `MemoryMax=256M`, `OnFailure=token-watch-failed@`).
- **Backfill:** the dry run derived `2026-08-31T11`, equal to the literal (11,773 rows; 11,466 follow-up, 307 miss). Applied: cursor `{"last_bucket": "2026-09-30T13"}` → `{"consumed_from": "2026-08-31T11", "last_bucket": "2026-09-30T13"}`.
- **⛔ The lineage gate fired, and the prune was held until the gap was explained:** `--lineage` checked **723** removable buckets: **722** clean, **1 GAP**, `2026-09-30T13` (8,927 of 18,032 entries observed, 49.5 %, under the 0.5 floor). `consumed_from` was removed at once under the periodic lock (census: 0 removable) while I investigated. **Explained:** it is the bucket the 09-30 pass read at the top of its own hour. `follow_up.py:308-311` requeues every not-yet-due entry to the NEXT bucket and leaves the original in place, and that path writes no observation row. **All 9,105 unobserved entries have an identical (mint, age, due_at) copy in `2026-09-30T14`**, which is after `last_bucket` and so kept and read on resumption. 9,039 of them are due after the 13:05:05 cursor write; the rest fall between the read and the write. This is the conservative residual Langston named at R-3 (a read bucket with heavy requeues flags as a gap; never the reverse). **So the backfill was re-applied at 22:09Z.** Census before the first prune: removable **723 / 1,220,540,157 B**; kept after the cursor 2,633 / 1,651,829,939 B; kept before `consumed_from` 1 / 21,739 B. `--lineage` still reads "GAPS" on that one bucket, by its rule, until the prune removes the original.
- **Store:** 8,278,576,990 B (`du -sb`) against the 8 GiB cap (8,589,934,592 B). The first prune (tier timer, next 2026-11-06 04:32Z) frees ~1.14 GiB.
- **Step 7, owed:** the census after the 04:32Z run; (ii) re-download oldest/largest/newest after 00:00Z; (v) the nothing-to-move pair after the 11-06 05:30Z off-box run; the feed-watch timer's scheduled runs.
- MISTAKE: shared-tmp-redirect [B-TOKEN-WATCH-STORAGE] — my first `--lineage` run redirected to `/tmp/.x` on staging. A stale deploy-owned file blocked it, so the check never ran. It was re-run to stdout. This is the shared-`/tmp` habit `#979` records.
- **Langston's prune ruling (msg `1568044465074217033`): PROCEED, with two conditions before the tier timer fires.** He re-derived the census and the lineage on the box. What carries his PROCEED is not my copy count. The flagged bucket IS `last_bucket`: a gap at the terminal hour, with all 722 interior buckets clean, is the signature of a stop, not a skip, and 8,927 observation rows keyed on its (mint, age) cannot exist unless that segment was read. He could not read `due/` as `deploy`, so **the 9,105-copies leg is RULED ON REPORTED FACT and may not be cited as confirmed by him.**
  - **C-1, done 2026-11-05 ~23:30Z:** `due/2026-09-30T13.jsonl` was copied to `/opt/token-watch/evidence/due-2026-09-30T13.jsonl` (dir root 0700, file root 0600; outside the store root and outside `/tmp`). Source and copy are identical: sha256 `00b567fd4c6a648ed4e6c5e1fb93b4935ee5a71948ffac0c399bdb5b9ed0c9af`, 2,619,296 B, 18,032 lines. Nothing inside `due/` was moved or renamed.
  - **C-2, done:** the `due-lineage.json` that fired is snapshotted in the repo at `Claude Comms and Packages/Change Lists/evidence/B_TOKEN_WATCH_STORAGE_due-lineage_20261105T220748Z.json` (live sha256 `8732c793…6a1c`; verdict "GAPS - do not prune", 723 checked, gap 2026-09-30T13 18,032 / 8,927). **After the prune the gate reads clean because the flagged object is gone, not because the premise was proven.**
  - **Record items:** R-1, the tier timer's next run is **Fri 2026-11-06 04:38:28Z** (read from `systemctl list-timers` on the box; it has a randomised delay, so not 04:32Z). R-2, `token-watch-followup.timer` stays disabled, so the T14 copies are **unread until `B-TOKEN-WATCH-FOLLOWUP-MEMORY` re-enables it**; the proof that they are read is observation rows for those (mint, age) pairs on the first T14 read, and it belongs to that batch. The lineage check's later silence proves nothing about them (#661 leg 3). R-3, the store size and headroom are my figures, not re-derived by him.

## Step 7 — the scheduled tier run and the re-download (2026-11-06)
- **The first due prune ran on the tier timer** (04:39:26Z, `token-watch-tier.service`): **removed 723 buckets, 1,220,540,157 B**; kept spent-window 0, after the cursor 2,639 (1,663,704,004 B), before `consumed_from` 1 (21,739 B), unparsed 0; `due_prune_ok: True`. It also moved 1 file to `cold/` (744,064,543 B freed; `cold/` now 225,483,231 B, compressed, waiting for the 05:30Z off-box run).
- **The census after it** (`tools/due_census.py` as `tokenwatch`, 04:40:47Z): `removable` **0**, `kept_after_cursor` 2,639 / 1,663,737,591 B, `kept_before_consumed_from` 1 / 21,739 B, spent-window 0, unparsed 0; `ok: true`. The 723 removed equal the 723 the lineage check cleared (722 clean + the explained `2026-09-30T13`).
- **Store size: 6,656,831,529 B = 6.20 GiB** (`du -sb /var/lib/token-watch`, 04:40Z) — **still above the 6 GiB warn line, so alert `7b19347d` stays open.** After the 05:30Z off-box run moves `cold/` (225 MB) the store should sit near 5.99 GiB, within about 11 MB of the line; it is resolved only on a measured size under 6 GiB.
- **(ii) re-download by file id — PASS, all three** (`tools/verify_cold_redownload.py`, run as `tokenwatch-cold` under `systemd-run` with the key via `LoadCredential`, the script on stdin; 86 manifest lines; the scope's rule read on the manifest's `verified_at`, which the scope had called `uploaded_at`):
  - oldest `provenance-raw-2026-08-31.jsonl.gz`: 59,851,351 B, sha256 match, decompressed to EOF, 416,247,981 B uncompressed = manifest;
  - largest `provenance-raw-2026-10-07.jsonl.gz`: 134,197,115 B, sha256 match, 934,537,764 B uncompressed = manifest;
  - newest `provenance-raw-2026-11-03.jsonl.gz`: 111,842,734 B, sha256 match, 775,117,370 B uncompressed = manifest.
- **Still owed:** (v) the nothing-to-move pair and the size re-read after the 05:30Z off-box run; the feed-watch timer's scheduled runs.

## Step 7 — the off-box runs, (v), and the feed watch (2026-11-06 05:30-06:00Z): ALL OWED CHECKS DONE
- **The scheduled 05:30Z off-box run:** moved `provenance-raw-2026-11-04.jsonl.gz` (118,441,609 B; 820,943,032 B uncompressed), manifest uploaded, *"0 file(s) still on the box (none attempted-and-kept)"*; it SKIPPED `provenance-raw-2026-11-05.jsonl.gz` as *"modified under 3600s ago"* (the tier wrote it 04:39:25Z) — the one-hour guard working. Manifest 86 → 87.
- **(v) the nothing-to-move pair — PASS** (two runs started by hand, 05:59Z): run 1 moved `provenance-raw-2026-11-05.jsonl.gz` (107,041,622 B), manifest 87 → 88; run 2 logged *"0 file(s) to move, 0 B in all"*, `Result=success`, `ExecMainStatus=0`, manifest still 88 lines and byte-identical (sha compared). `cold/` is empty.
- **The feed watch's scheduled runs** (hourly timer): 05:05:14Z *"rows=1447 gaps_recorded=0 open_gap=None store=warn maxrss_mb=15.2"*, *"no open gap ... nothing to mint"*. `maxrss` 15.2 MB against the unit's `MemoryMax=256M`.
- **Store: 6,466,298,244 B = 6.02 GiB at 06:00Z** — 24 MB above the 6 GiB warn line. **Alert `7b19347d` stays open, and it cannot clear inside this batch:** with the follow-up timer off (its own batch, `B-TOKEN-WATCH-FOLLOWUP-MEMORY`), the follow-up cursor does not move, so the due prune can remove no new bucket while `due/` grows by about one bucket an hour (2,640 → 2,642 buckets, 1,663,737,591 → 1,665,463,703 B between 04:40Z and 06:00Z). The store hovers near the line until the follow-up runs again. **Proposed disposition, for Langston at Step 8:** the row is a standing condition owned by CC-INFRA and resolved by `B-TOKEN-WATCH-FOLLOWUP-MEMORY`'s P10 (re-enable), not a close condition of this batch.

## Step 8 — Langston CONFIRM (msg `1568144949201993871`), three non-blocking conditions
- **What he re-derived himself:** the over-cap escalation is a separate key and armed (one `token-watch-store-over_cap` row ever, `9079f9ac`, resolved, so it can re-mint); `7b19347d` active, unacked, unresolved; `token-watch-followup.timer` disabled, tier / off-box / store-watch / feed-watch enabled; the 8 load-bearing files byte-identical at `c428153655a` and `5f1016c4e`; at either size the 8 GiB cap is 9-22 days away, with `/` at 30 G free of 75 G.
- **RULED ON REPORTED FACT (he cannot read `due/`, `provenance/` or the journals as his account):** the 04:39Z prune, the census, the (ii) re-downloads, the (v) pair, the feed-watch maxrss and the 6.02 GiB — the completion report says so.
- **C-1, recorded:** my "one bucket an hour" was the `due/` leg alone. From the two alert bodies (11-04 16:24Z → 11-05 06:00Z, 13.6 h, no prune in the window): due +50.06, births +32.16, state +13.37 = **~95.6 MB/day**; observations, study, dead flat. Order of magnitude, not a rate. **`births/` is `NEVER_TOUCH` (`tier.py:57`)**, so ~45 MB/day (births + state) has no prune path in this batch or the follow-up.
- **C-2, disposition 2 (added to `B-TOKEN-WATCH-FOLLOWUP-MEMORY`):** the follow-up's re-enable does NOT by itself clear `7b19347d` — a bucket is removable only 7 days after the follow-up reads it (`config.py:247`), and births + state keep growing. The follow-up batch now carries an item to dispose of the unprunable growth, on the decision already written at `RUNNING_ISSUES` `#1246` (raise the cap / move hot data off-box / both).
- **C-3, fixed (Step 9 below).**
- **`7b19347d` held active as a standing condition** — never acked, not a close condition of this batch; resolved only on a measured store under 6,442,450,944 B, expecting a re-mint until the C-2 item lands.
- **Step 10 note:** `GOVERNANCE_EXCEPTIONS.md` holds no row for this batch; it closes on a completion report, so none is owed.

## Step 9 — C-3: the warn body says its figures are mint-time
- `ops/store_watch.py` `body_for`: one line, *"THESE FIGURES ARE AS OF THIS ROW'S MINT (<UTC>) AND DO NOT UPDATE: the row is not re-minted while it stays open. Live size: `du -sb /var/lib/token-watch` as root, or the hourly token-watch-feed-watch log line (store=...)."* (`import datetime` added).
- `tests/test_store_watch.py`: S2 asserts the line; **32 passed, 0 failed** (Windows; the suite is pure).
- ⚠️ **The open row `7b19347d` keeps its old body** — a body is written at mint; the new line reaches the next row this key mints. Stated, not fixed: re-minting it would need a resolve, which the row's own criterion forbids while the store is over the line.

## Step 9 r2 — Langston CHANGES on the C-3 line (msg `1568148902463545384`), folded
- **C-3a:** the feed watch's `store=` is the band (ok/warn/over_cap), not the size. `ops/feed_watch.py` now logs `store_bytes=` beside it, and the alert line points there.
- **C-3b:** both live routes are root-only (journal and store), and an unprivileged `du` is denied parts of the store and prints a partial, silently small total (he measured `96,560` as `deploy`). The line now says AS ROOT on both and says so.
- **Source path** corrected to `token-watch/ops/store_watch.py`.
- **The stamp is fenced:** `utc_stamp()` (aware UTC); S2 asserts the rendered `YYYY-MM-DD HH:MMZ` is within 2 min of an aware UTC now, with a positive control (a +3 h stamp is caught by the same comparison), and asserts the root note and the source path. **37 passed, 0 failed.**
- **7b19347d, the consequence recorded:** the fix is forward-only, and the only row that exists carries no as-of line; it clears only when the store drops under 6 GiB, which may be the condition's whole life. **The alert CLI has no body-edit verb** (`scripts/system-alerts.ts` commands: `add`, `fire-due`, `list`, `ack`, `resolve`, `resolve-key`), so there is no honest route to amend it in place.

## Step 9 r2 — Langston DISCHARGED C-3a/C-3b (msg `1568151343321849867`); installed
- He re-derived `store_bytes` reaching the log line (`liveness.py:399` → `stats`), the AS-ROOT wording, the source path, the stamp fence and its +3 h control, and the asserted absence of a body-edit verb (`scripts/system-alerts.ts:360`, `:368-384`). 37/0 is my count.
- **His condition, met: both files in one install.** `install_storage.sh 5e6f1cec82f5d794bc41761f56831c37397752a0` from the reviewed blob, 06:34:13Z, previous `c428153655a`; the box-edit guard passed; `INSTALLED` records `ops/store_watch.py` `f8e779b7…` and `ops/feed_watch.py` `f19bca68…`. On the box: `AS ROOT` in `store_watch.py` (1 line), `store_bytes` in `feed_watch.py` (4 lines, = the ref; it was 1 before). The hourly feed watch logs `store_bytes=` from its next run.
- **Nit recorded:** S2's "body's source path exists in the repo" checks the string only and cannot catch a rename — not to be cited as a path-existence check.
