# B-WAKE-OWNER-LOSS-VISIBLE (#1142) — CHANGE LIST (Step 4)

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` (scope header) |
| **(ii) THAT CLASS'S DOC SET** | scope ✅ `Scope Files/B_WAKE_OWNER_LOSS_VISIBLE_SCOPE.md` · pre-audit ✅ `Scope Files/B_WAKE_OWNER_LOSS_VISIBLE_PRE_AUDIT.md` · completion report — absent (Step 11) · BATCH_CATALOG — absent (Step 10) · PHASE_HISTORY — absent (Step 10) · SIM — owed at Step 10 (judged applicable: SIM:3714 names this record) · System Manual — N/A, nothing under `server/`, `client/` or `shared/` changes |
| **(iii) STEP-2 REFERENCE** | `Scope Files/B_WAKE_OWNER_LOSS_VISIBLE_PRE_AUDIT.md`, CLEARED by Langston with B1, B2, C8–C11 (recorded in its last section, `cc2a661bd`) |

**READY AT:** `migration/b-wake-owner-loss-visible` @ `e6512205a` (one commit on top of `cc2a661bd`, which is on `migration/aws-supabase`). Not on the review branch until approved.

## WHAT CHANGED, by plan item

### P1 + B2 — `cc-wake-filter.py`: the loss is recorded in band, and the append never raises
`:641` `LOST_FILE = <ALIAS>.alert-owners.lost.jsonl` beside the owner record. `:644-659` `_record_loss`:
```python
    rec = {"ts": ts, "at": _utc(), "ids": lost_ids, "rejects": lost_rejects, "prose": lost_prose}
    try:
        with open(LOST_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
        where = f"recorded in {os.path.basename(LOST_FILE)}"
    except OSError as _e2:
        where = f"AND the loss record could not be written either ({_e2})"
    print(f"[cc-wake-filter] alert-owner record NOT saved, this line's routing is lost until re-stated "
          f"({named}{extra}) — {where}: {err}", file=sys.stderr, flush=True)
```
`record_owners` keeps `mutated` (appended ONLY in the NEW branch and the FLIP branch, C2), `lost_rejects` (the snippet, where a reject sets `changed`, C3/C11) and `lost_prose`. BEFORE → AFTER at the failed save (`:745-749`):
```python
-            print(f"[cc-wake-filter] alert-owner record NOT saved, this line's routing is lost until re-stated: {_e}", ...)
+            _record_loss(ts, mutated, lost_rejects, lost_prose, _e)
```
The seed branch above it is unchanged (C6).

### ★ FOUND BY B1's TEST, FIXED HERE — an unreadable owner record dropped the WAKE (§9.4 disposition 1: the batch depends on it)
The B1 leg makes the record's path a directory. On the INSTALLED filter that leg did not reach the save at all: `_load_owners` (`:618`) catches only `FileNotFoundError`/`ValueError`, so a record that exists but cannot be read raised inside the per-line try and **dropped the wake** — measured: control run `woke=False, dropped=True`. Same family as `ecabf7a47`'s fix, one call earlier. BEFORE → AFTER (`:671-683`, `:729-731`):
```python
-            owners = _SEED_OWNERS if SEED else _load_owners()
+            if SEED:
+                owners = _SEED_OWNERS
+            else:
+                try:
+                    owners = _load_owners()
+                except OSError as _le:
+                    owners, load_err = {}, _le          # parse the markers, but NEVER save over the unreadable record
 ...
+    if changed and load_err is not None:
+        _record_loss(ts, mutated, lost_rejects, lost_prose, load_err)
+        return
```
**Judgement call to attack:** against an empty dict every marker reads NEW, so an unchanged re-statement is listed as lost too. I rely on C11's owner-match clearing to remove those once the record reads again. The alternative, recording nothing on a load failure, is the silent case.

### P2 + C1/C8/C9/C11 — `alert-split.mjs:68-97`, pure `lostRoutings(lines, owners, nowMs, dropFirst)`
- EXPIRY reads `at` (`:81`, `nowMs - atMs >= 24 h`); an unparseable `at` counts as unparseable.
- CLEARING: `cur.owner === x.owner` (`:91`, C11), or `curMs >= lostMs` on PARSED epoch ms (`:93`, C9); a null ts on either side never clears.
- Torn lines anywhere are counted (C8); only the first line of an offset read is dropped uncounted.
- The latest loss per id wins.

### P3 + C4/C5/C6 — `inject-due-alerts.mjs:169-187`, `:212-221`
Own try/catch; `openSync` → `fstatSync` → `readSync` of the last `LOST_TAIL_BYTES` = 64 KB (`:97`); ENOENT is silent (the normal state), any other error gives one line saying the session cannot tell. Only when narrowed. Output:
`⚠ this session's wake filter failed to save N alert routing(s) in the last 24 h — they read as unrouted here until re-stated: <id8> → <owner>, … (also lost: …) — tell Langston, leading with his name, to re-state those markers.`

### P4 — census stamp `:400`: `($_.CreationDate.ToUniversalTime().ToString('s') + 'Z')`.
### P5 — `:1116-1119` the UNROUTED-LINE comment restated; P7 check: `grep -c "the Monitor treats stdout"` = 0, `grep -c "UNROUTED LINE"` = 1 at `e6512205a`.

### B1 — `ci.yml`: two steps inside Test Suite
`python3 scripts/analysis/test-wake-filter-cuts.py` and `node scripts/analysis/test-alert-split.mjs`, same P30/Q33 form (own `if: !cancelled()`, no npm ci). **CI did not run either suite before**, so without these B1's legs would still never be evaluated off the laptop.

## TESTS — laptop and Helsinki, both RULED ON REPORTED FACT for you; CI will run the Linux half
| suite | new filter | control (installed pre-#1142 filter) |
|---|---|---|
| `test-wake-filter-cuts.py`, Windows | ALL PASS — held-file leg now asserts the loss line (id, owner, message ts, `at` ending `Z`); seed leg asserts NO loss file; P1–P3 PASS; P4 SKIP | **4 FAILED** (held leg `loss_lines=0`; P1/P2 `woke=False, dropped=True`; P3 no line) |
| same, Linux as `nobody` (Helsinki, temp dir, removed) | P1–P4 PASS (held legs SKIP by design) | — |
| `test-alert-split.mjs` | 36 / 36 (14 new `lostRoutings` cases: later/equal/older ts, null ts, unparseable ts, owner match, expiry by `at` not `ts`, no-id loss, torn line mid-tail vs offset-cut first line, latest-wins, null owners) | the old module cannot load the suite (no `lostRoutings` export) |
| `test-wake-lease.py` | ALL PASS, incl. new OBJ-4: the orphan stamp ends `Z`, age 6 s | **FAILS OBJ-4**: `'2026-10-03T00:30:55'`, no zone, 2 h off |
| `test-wake-follow.py` | ALL PASS | — |
| hook smoke run (temp state dir, 70 KB pad + one loss + one torn line, real staging read) | printed the line naming `dddddddd → CC-B` and `1 unreadable line(s) skipped` | — |

## A FINDING OUTSIDE THIS BATCH — for its own dispatch, not this review
P4 on Linux exits **1 after the wake prints**: in a read-only state directory the POSITION save at `#@CAUGHTUP` (`_checkpoint` → `save_state`) raises. The arm loop reads non-zero as retry, so the task never ends and the next arm re-delivers the same message. That predates #1142 and touches the position state, not the owner record. **Proposed §9.4 disposition 4 — a scheduled review: I will put it to you as its own single question after this review, not fold it in here.**
