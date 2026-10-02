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

## r2 — Langston's Step-4 verdict CHANGES NEEDED (inbox id 1555710975…): BLOCKER-1 + C-1, with C-2 and the nits in the same commit

| item | change | proof |
|---|---|---|
| **BLOCKER-1** — the hook read the loss file only when `narrowed`, and an unreadable owner record (the load failure this batch records) is exactly what makes `narrowed` false | `inject-due-alerts.mjs`: the loss read is gated on the **alias alone**; the line is built by a new pure `lostReport(lost, lostWhy)` in `alert-split.mjs` and appended to BOTH emits (the full-list path and the narrowed path). Its wording only ever says "these routings were destroyed", never "narrowing is off" — the full-list header already says that. | test-alert-split: the report names `id → owner` with NO owner record; a failed read says the session cannot tell; nothing to say → `''`. **Hook smoke with a DIRECTORY at the owner-record path** (the EISDIR state): header `full list — owner record unreadable (EISDIR)` AND the line `… failed to save 1 alert routing(s) … dddddddd → CC-B — tell Langston …`. |
| **C-1** — `owners[x.id]` was prototype indexing; `"__proto__"` with no owner cleared silently | own-property read (`Object.prototype.hasOwnProperty.call`) at the one index site in `lostRoutings`; `splitAlerts`'s pre-existing site is out of scope, as ruled | new case passes; **control**: the pre-fix module returns 0 for that line (silently cleared), the fixed one returns 1 |
| **C-2** — the loss file had no cap | `_record_loss`: past `LOST_ROTATE_BYTES` = 1 MB the file is set aside WHOLE with `os.replace(… , … + ".old")` before the append, inside the same `OSError` catch — never rewritten in place. `_sweep_tmp` does not match `.old`. | new leg: a 1,126,401-byte file becomes `.old` at exactly that size and the fresh file holds the one new line — Windows and Linux |
| nit (a) | `_record_loss`'s docstring now claims what the code does: it catches every `OSError` from the file; the JSON it builds is plain strings and ints | — |
| nit (b) — stated, not fixed | **`test-wake-lease.py` is NOT in CI** (it drives Windows processes, PowerShell and taskkill), and **P4's census stamp (`:400`) is PowerShell-only — the one behavioural change in this diff with ZERO CI reach.** Its proof is the laptop run (OBJ-4 PASS, control FAILS) and stays RULED ON REPORTED FACT. | — |

**Runs at r2:** `test-wake-filter-cuts.py` Windows ALL PASS (P4 SKIP); Linux as `nobody` ALL PASS incl. P4 and C-2; `test-alert-split.mjs` 40 / 40 (Windows and Linux); CI on the review ref — see the dispatch.
**Not taken here:** Langston's §13 item (`dt-review` cannot read a batch branch) is his and Infra Claude's (`B-DT-REVIEW-BATCH-BRANCH`).

## r2 APPROVED by Langston (inbox id 1555716065…) with two in-commit conditions and two nits — landed in the same commit

| item | change | proof |
|---|---|---|
| **CONDITION 1** — the line was absent from the `0 due alerts` and `ALERT CHECK COULD NOT RUN` emits, and a lost FLIP leaves the OLD owner on record, so a quiet or unreachable window could swallow it | the alias, owner-record and lost-routing reads are hoisted above every emit (they are local, independent of staging); `lostText` is appended to all four emits (unreachable, zero due, full list, narrowed) | hook smoke with an unreachable host: `ALERT CHECK COULD NOT RUN (timeout…)` followed by `… failed to save 1 alert routing(s) … eeeeeeee → CC-C …`. The zero-due emit uses the identical append. |
| **CONDITION 2** — the rotate shared the append's `try`, so a failed rotate suppressed the line | the rotate has its own `try/except OSError: pass`; the append follows in its own `try`. The comment marks the Windows source-rename question as a HYPOTHESIS, not measured. | new leg: `.old` is a non-empty directory, so the rotate fails; the live file keeps its 1.1 MB and gains the new line at its end — Windows and Linux PASS; **control**: the r2 filter FAILS it (`last_line_ids=None`, size unchanged) |
| nit — "failed to save 0 alert routing(s)" | `lostReport` leads with the non-zero fact: `… failed to save its alert-owner record … — no routing was lost, but these were: <rejects / prose / unreadable lines>` | new test case |
| nit — `fix-follows-pointer`: the sibling prototype index at `splitAlerts` | guarded the same way (own-property read); the comment now says which ids are uuid-validated (the loss file's) and which are not (staging's alert ids). **Grep: two index sites in the file (`splitAlerts`, `lostRoutings`), both guarded.** | new case: an alert id `"__proto__"` reads as unrouted |

Runs: `test-wake-filter-cuts.py` Windows ALL PASS (P4 SKIP), Linux as `nobody` ALL PASS; `test-alert-split.mjs` 42 / 42 on both.
