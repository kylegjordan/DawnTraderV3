# B-WAKE-HEARTBEAT-CONTROL-DATE (#1162, sprint row 1q) — CHANGE LIST (Step 4, r2)

**r2:** answers Langston's Step-4 gate A (18:17Z). The r1 whole-batch dispatch hit the 900 s ceiling (bridge error 16:50:57Z) and was split into gate A (the filter arm, SKILL.md and the filter tests) and gate B (`control_state.py`).

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` — crew tooling on the laptop (heartbeat task, decision script, one wake-filter regex arm); no trading path, nothing deployed to staging |
| **(ii) DOC SET for the class** | **SCOPE** — present, `Claude Comms and Packages/Scope Files/B_WAKE_HEARTBEAT_CONTROL_DATE_SCOPE.md` (APPROVED Step 1, `f565e42c4`, amended at Step 2) · **PRE_AUDIT** — present, `…/B_WAKE_HEARTBEAT_CONTROL_DATE_PRE_AUDIT.md` (APPROVED Step 2, `49b9bde4d`) · **CHANGE LIST** — this file · **COMPLETION_REPORT** — Step 11 · **BATCH_CATALOG, PHASE_HISTORY** — Step 10 · **SYSTEM_IMPACT_MAP** — Step 10, **required** (A1 row 3) · **RUNNING_ISSUES `#1162`** — Step 10 · **SPRINT_TO_LIVE_PLAN row 1q** — Step 10 · **CLAUDE_CODE_WAKE_WATCHER_RUNBOOK** layer 3 — Step 10 · **CC-A task list** — Step 10 · **CC-A `MEMORY_CC_A.md`** and **Langston's `MEMORY.md` row** — Step 10, required · **board card** — present (`PVTI_lAHODmulEM4BfQP4zhBSS5Q`, Implementation) · **SYSTEM_MANUAL** — N/A (no trading logic) · **DELETED_COMPONENTS_LOG** — N/A (nothing removed) |
| **(iii) STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_WAKE_HEARTBEAT_CONTROL_DATE_PRE_AUDIT.md` at `4be562e14`, APPROVED by Langston at `49b9bde4d` |

**REF: `review/b-wake-heartbeat-control-date` at `5a486de9d448c78ea34f7289b1164f89c5023b67`**: one code commit on top of `migration/aws-supabase` `4be562e14`. **It is NOT on `migration/aws-supabase` yet.** CI does not run on `review/**` (your Step-4 note on `#1195`). The two suites below are this batch's tests, and none of the four CI jobs exercise these files.

## FILES (5)
| file | change |
|---|---|
| `comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat/control_state.py` | **NEW**, 378 lines: the decision script (P1, P8) |
| `comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat/SKILL.md` | steps 2c, 3 and 4 (P2) |
| `comms-infra/laptop/cc-wake-filter.py` | one `_HEARTBEAT_BAD` arm (P7) |
| `scripts/analysis/test-heartbeat-control.py` | **NEW**, 32 cases (P3, P4, P9) |
| `scripts/analysis/test-wake-filter-cuts.py` | two `#1162` cases (P7) |

## THE LOAD-BEARING HUNKS
**P7 — `cc-wake-filter.py:125-129`**
```diff
-    r"|\bwatchers:\s*[^|]*\b(?:DEAD|STUCK)\b|\bcontrol:\s*NOT answered\b",
+    # CHECK FAILED (B-WAKE-HEARTBEAT-CONTROL-DATE, #1162, Langston Step-2 BLOCKER-1): ... (4 comment lines)
+    r"|\bwatchers:\s*[^|]*\b(?:DEAD|STUCK)\b|\bcontrol:\s*(?:NOT answered|CHECK FAILED)\b",
```

**P1 — the ordered table, `control_state.py:277-318`** (abridged; read it at the ref)
```python
if lv == "DEAD":          say("DEAD"); continue                       # 1
if lv == "not armed":     say("not armed"); continue                  # 2
if lv == "CENSUS-FAILED": say("CENSUS-FAILED (control not judged)"); continue   # 1b
if N is None:             say("not yet issued"); continue             # only while the issue is GATED
A = read_A(...)           # .control split()[0]
if A == N:                say("answered"); continue                   # 3, before STUCK
if lv == "STUCK":         say("STUCK (control pending)"); continue    # 1a
if lv != "alive":         checks.append(f"UNDETERMINED {x} (liveness=...)"); continue
T = read_T(...)           # lease taken_at
if P is None or T is None:          -> UNDETERMINED (raw inputs)      # 7
if pino != ino and not rotated:     -> UNDETERMINED (raw inputs)      # 7
if pino == ino and poff <= O:
    if not held and same_token and prev_P == P: NOT delivering        # 4b, pages
    else: awaiting                                                     # 4
if held: "held (record reset)"
if pino != ino: reissues = []                                          # rotation voids old offsets
live_before = [r for r in reissues if r.at > T]
arms = {r.T for r in reissues} | {T}
if live_before or len(arms) >= 3: NOT answered                         # 5, pages
else: append one WATCHER-CONTROL <x> <N>; record (offset, at, T)       # 6
```

**Issue rule and reads, `:224-247`:** read 1 (`N`, `O`, inode and `D`, from one whole-file scan on Helsinki); then, if all four `.alive` exist, write `WATCHER-CONTROL <x> <D>` for each alias whose `N != D`. An append failure is caught and left to read 2 to report. **Read 2 runs only if something was issued**, and feeds the NOT-RUN check and every decision. `ISSUER NOT RUN` counts `issuer_fail` in the record and pages at 2; on a held record it is held.

**Record, `:181-205`:**
- absent → `new`; unparseable → moved to `.bad-<utc>`, `RESET`; both go into `checks`, which pages;
- the write goes through a temp file and `os.replace`, then is **re-read and compared**; a mismatch is `NOT PERSISTING`, which pages.

**Lock, `:155-179` and `main` `:338-372`:** `os.open(O_CREAT|O_EXCL)`. A held lock prints `held`, `NOTIFY no` and touches nothing. Over 30 min, it is moved to `.stale.<utc>` and taken, with the takeover noted in the line. It is released in `finally` around `decide`, and any exception in `decide` becomes `control: CHECK FAILED — UNDETERMINED (script error …)`, `NOTIFY yes`.

**Composition, `:327-334`:** `control: NOT answered — …` if any state 4b or 5; else `control: CHECK FAILED — …` if any check; else `control: <states>` with `NOTIFY no`.

## TESTS, run on the laptop at `5a486de9d`
- `python3 scripts/analysis/test-heartbeat-control.py` → **32 passed, 0 failed.** It includes:
  - the OBJ-1 discriminating fixture (UTC day 20261015 at 22:30Z → answered);
  - per-alias issue; GATED; 4 then 4b over two runs; 6 then 5; a new arm after a re-issue → re-issued; the third arm → NOT answered;
  - DEAD / STUCK (both ways) / CENSUS-FAILED;
  - record new, which then reads ok next run; RESET moved aside; held; NOT PERSISTING; a tampered read-back;
  - ISSUER NOT RUN on run 1 not paged and on run 2 paged; rotation; UNDETERMINED for P absent and for a foreign inode;
  - the lock held, stale and on exception;
  - **TOTALITY**: 90 cells, 5 liveness × 6 positions (incl. P absent and foreign inode, Step-1 condition 2) × 3 records, each alias in exactly one state;
  - **P4** both directions with healthy other fields, against `_HEARTBEAT_OK`/`_HEARTBEAT_BAD`/`is_allclear_heartbeat` **parsed out of the repo filter** (it has no import guard), with a positive control;
  - **P9**: port 1 on `204.168.141.77` → `control: CHECK FAILED — remote read failed (ssh exit 255)`, `NOTIFY yes`, exit 0, lock released, exactly as pre-stated.
- **MUTATION, recorded rather than claimed:**
  - P4 FAILED against the repo filter before P7 was applied: it listed two `CHECK FAILED` lines as suppressed.
  - `test-wake-filter-cuts.py`'s new `CHECK FAILED` case **FAILS on the installed (old) filter** (`~/.claude/cc-wake-filter.py`) and passes on the repo copy. The 33-case suite otherwise passes: ALL PASS, 16 of 33 cases woke.
  - R1 failed on my first draft (it re-issued at the third arm) and was fixed by counting the current arm, `:308`.

## JUDGEMENT CALLS TO ATTACK
1. **`not yet issued` as a non-paging state for `N is None`.** It is reachable only while the issue is GATED, which is already reported. Should an alias with no control line ever, under no gate, be UNDETERMINED instead? In code it cannot be: not gated means issued, or ISSUER NOT RUN.
2. **A rotation clears the alias's re-issue history** (`reissues = []`), so a rotation can never page on stale offsets. The cost is that the 3-arm budget restarts at a rotation, which has no scheduled trigger.
3. **`issuer_fail` counts runs, not a per-alias streak.** Two different aliases failing on two consecutive runs pages.
4. **An exception anywhere in `decide` pages** as `CHECK FAILED — UNDETERMINED (script error)`. This is fail-loud. Is a script bug paging Kyle the right cost?
5. **The test reads the repo filter by `ast`,** pulling three nodes, not the whole module. It is a parse of the real file rather than a copy, but a refactor that moved the regexes into a function would make it silently test nothing — **guarded:** the P4 positive control asserts a DEAD heartbeat is delivered and a healthy one suppressed.

## NOT YET DONE (Steps 5-7)
- **Install (Step 6, P5):** copy the three files to `~/.claude/`; verify each against the blob; tell Kyle the first run pages once (`CHECK FAILED — control record new`); "Run now"; ask all four sessions to re-arm.
- Until then the live heartbeat and filter are unchanged.

## r2 — GATE A, BLOCKER-A1 and the folded item
**The arm is now field-scoped, not anchored** (`cc-wake-filter.py`):
```diff
-    r"|\bwatchers:\s*[^|]*\b(?:DEAD|STUCK)\b|\bcontrol:\s*(?:NOT answered|CHECK FAILED)\b",
+    r"|\bwatchers:\s*[^|]*\b(?:DEAD|STUCK|CENSUS-FAILED)\b|\bcontrol:[^|]*\b(?:NOT answered|CHECK FAILED)\b",
```
- **`control:[^|]*`** — a verdict mid-field wakes, using the same idiom as the watchers arm. It is pipe-bounded, so it cannot reach a neighbouring field. No non-paging state's text contains `NOT answered` or `CHECK FAILED`; the table below shows each state's text.
- **`CENSUS-FAILED` in the watchers arm** (Langston's §13, disposition 2, folded): a failed liveness census means liveness is unknown. Step 2b reports it without `--notify`, so before this it posted an all-clear-shaped line that every filter suppressed. It now wakes the sessions. It still does not page Kyle: the sessions are reachable, the same reasoning as STUCK.
- **Tests:** `test-wake-filter-cuts.py` gains a mid-field `NOT answered` case and a `CENSUS-FAILED` case, both expecting a wake. **35 of 35 pass on the repo filter. Both new cases FAIL on the r1 arm** (`5a486de9d`'s filter, run as argv[1]: "2 FAILED"), so the tests discriminate.

## GATE-B CONDITION 1 — every state, its NOTIFY value, and whether its text matches the arm
| state (as printed) | NOTIFY | how it reaches the sessions |
|---|---|---|
| answered · awaiting · re-issued · re-issued (log rotated) · log rotated · not yet issued · held (record reset) · ISSUER GATED BY · ISSUER NOT RUN (first run) · `held — another heartbeat run is in progress` | no | suppressed as an all-clear (correct: nothing is wrong) |
| STUCK (control pending) | no | **delivered by the watchers field** (`watchers: STUCK: …`, step 2b), not paged |
| CENSUS-FAILED (control not judged) | no | **delivered by the watchers field** (`watchers: CENSUS-FAILED: …`, the r2 arm) |
| not armed | no | not a failure (step 2b; it gates the issue) |
| DEAD | no from this script | **paged by step 4's DEAD rule** and delivered by the watchers field (unchanged) |
| NOT answered (state 5) · NOT delivering (4b) | **yes** | line starts `control: NOT answered —` |
| control record new · RESET · NOT PERSISTING · UNDETERMINED · ISSUER NOT RUN (second run) · re-issue failed · remote read failed · script error | **yes** | line starts `control: CHECK FAILED —` |

**Asserted, not tabulated only:** `test-heartbeat-control.py` now records EVERY control line the suite produces, 131 of them (80 paging, 51 quiet). It asserts `NOTIFY yes` ⇔ delivered and `NOTIFY no` ⇔ suppressed against the repo filter with healthy other fields, and that all 8 paging kinds were produced (P4 coverage). **34 of 34 pass.**

## GATE-B CONDITION 2 — the all-four `.alive` gate
It exists in exactly one place, `control_state.py` `decide()`:
`alive_files = [x for x in ALIASES if a.liveness.get(x) != "not armed"]`; `gated = …`; the issue loop runs only `if not gated`.
Step 2b reports "not armed" exactly when the `.alive` file is missing (`SKILL.md` 2b: *"No file = 'not armed'"*), so the script's gate is the old human gate. Tests: `ISSUER GATED BY CC-B: nothing written` and the TOTALITY grid's `not armed` column.
