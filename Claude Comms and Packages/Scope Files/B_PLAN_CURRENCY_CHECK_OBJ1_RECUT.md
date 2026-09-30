# B-PLAN-CURRENCY-CHECK — OBJ-1 RE-CUT (state check) — audit and plan

**Ref:** every repo object in this document was read at `97aff32b7` (`97aff32b7cbe56dc560bf739df8214ba000ddd75`, 2026-09-30T02:36:15Z), with `git show` / `git grep` / `git log` / `git ls-tree`. Nothing was read from a working tree. **r2 (the reader round, §READER ROUND):** the corrections were read at `05af099da` (`05af099da2ad4f75b7345bacf89d0cd650b75181`, this document's own commit). Between the two refs the plan, the checker's three files (`scripts/governance-checker/{poller,checker,config}.mjs`) and the Batch Completion file NAMES are unchanged (`git diff --stat 97aff32b7 05af099da`: one progress report's content changed, no file added or removed there), so every §2 figure holds at both; only the `-n300` window moved (now `2adbe4261` → `05af099da`), with the same two ids enrolled.
**The plan under test:** `1-system-manual/SPRINT_TO_LIVE_PLAN.md` (the active plan; 378 lines at the ref). Its own obligation, plan:66: *"**The owner updates its row at every batch close** (status + report link), in the same governance turn"*.
**Binding ruling:** scope `B_PLAN_CURRENCY_CHECK_SCOPE.md` §10d (Langston, 2026-09-30T02:33:15Z, re-derived at `9a681d010`). **Prior design:** `B_PLAN_CURRENCY_CHECK_PRE_AUDIT.md` §5.1 (CD-A1…CD-A18) and §6.6 (P31–P39), §6.9 (P61), §6.1 (P4). This document replaces §5.1's diff-specific findings and §6.6's plan items for OBJ-1; it does not edit the pre-audit.
**Status:** DRAFT for Langston. r1 committed at `05af099da`, not posted; the r2 corrections are in the working tree, uncommitted. **Evidence you can re-run from this document:** the scratch scripts live in a session scratchpad, which the review branch does not carry, so the final predicate script (r2, used for every figure below) and its full output at `05af099da` are reproduced verbatim in the **APPENDIX**. It reimplements the parser and predicate below independently of the checker; the only checker code it loads is `config.mjs`, which it takes from the ref itself with `git show`.

---

## 0. WHAT CHANGED, IN ONE PARAGRAPH

The close-diff rule asked *"did this batch's close change its own plan line?"* and needed a diff read, a lower bound and a window. The ruling replaces it with *"at the ref, does a batch that has a completion report have a current row?"* — a STATE check of plan:66. There is no diff, no bound, no window and no first-add gate, so the pre-audit's bound machinery (P35), its diff reader (P34's `readPlanIo`, `parsePlanDiff`) and the questions about them dissolve. What remains is a parser (P33, nearly unchanged), a predicate, keys, a tick wiring, a flag and a preview. **Eight things in this document need Langston before Step 3 — all eight are in §5.1:** C1 the ruling's literal trigger reaches none of today's failing rows; C2 the §5 leg's form (and first, whether §5 lists windows or batches); C3 the §5 leg is unreachable under the literal trigger; C4 row 16's parseable id does not make row 16 gradable; N4 rows 35/87 split, not re-pointed; N5 row 55's OBJ-1-only report; N6 the status/report normalisation choices; N7 what an alert body may name, given the checker never rewrites one.

---

## 1. THE PREDICATE, SPECIFIED EXACTLY

### 1.1 Reads (two per tick, both at `GOV_REF`, both existing readers)

| read | function at the ref | failure |
|---|---|---|
| the plan text | `showFile(PLAN_LINE.path)` (`checker.mjs:57-63`) — `git show GOV_REF:<path>`, returns `null` when absent | `null`, empty, or any parse throw (§1.2) ⇒ **fail-closed**: `gov-planline-unreadable`, nothing graded, no per-batch key opened or resolved |
| the Batch Completion listing | `lsTreeNames(DOCS.completion_report.dir)` (`checker.mjs:48-55`), read ONCE per tick and handed to `findGlobDoc` (P34 adds an optional `names` argument, so there is still one implementation of the filter) | **an EMPTY listing ⇒ fail-closed, exactly as for the plan read** (r2): `gov-planline-unreadable` (body names the listing), nothing graded, no per-batch key opened or resolved, orphan verifier `() => false`. **Why:** `lsTreeNames` swallows every error and returns `[]` (`checker.mjs:50-54`), which the join would read as "no id has a report" ⇒ every leg "not required" ⇒ P37's verified orphan branch would RESOLVE every open `gov-planline:*` key, and the next good tick would re-open them — a flap, the opposite of the FREEZE an unreadable plan gets. The directory holds **329** entries at the ref, so an empty listing is never a true state. (`checkLedgerRows` accepts the other direction, `checker.mjs:217-218`; not changed there.) |

No `git log`, no `-U0`, no first-add read. (`completionReportCommitTime`'s `git log --diff-filter=A` is not needed: nothing in the state form is timed.)

### 1.2 The row parse (P33)

1. **Lines.** Split on `\n`, strip one trailing `\r`. Line numbers are 1-based.
2. **Sections.** A line matching `/^## (\d+)\./` starts section N. §4 is from `## 4. The plan` to the next such heading; §5 likewise (`## 5. Running now — observation windows`). §0 and §6 are never graded (Step-1 ruling Q1(a); the state ruling does not revive §0).
3. **Cells.** A table line is one whose trimmed text starts with `|`. Cells = trim the line, drop ONE leading `|` and ONE trailing `|`, split on every `|`, trim each cell. There is no escape handling: at the ref the plan holds **0** `\|` sequences (`grep -cF '\|'`; control: 1 on a planted line), and the generator replaced `|` with `/` in every cell it wrote (`plan_doc.py` `c_()`, :47).
4. **§4 headers — every one, exact (R1-Q12 (iii)).** A §4 table line whose first cell is `#` is a header and must equal, after right-trim, exactly `| # | item | batch / reference | owner | status | report | note |`. **Zero headers ⇒ throw. Any header that differs ⇒ throw.** At the ref there are **10**, at plan lines 78, 110, 147, 209, 238, 276, 283, 297, 316, 339, all exact. (A column added to one wave table therefore fails closed instead of silently dropping that wave — CD-A8's amendment, kept.)
5. **§4 rows.** A §4 table line that is not a header or a separator (`/^\|[\s:|-]+\|?\s*$/`) and whose first cell matches `/^\d+[a-z]?$/`. **Exactly 7 cells ⇒ a row** `{rowNo, item, batch, owner, status, report, note, lineNo}`. **Any other count ⇒ `malformed` `{section: 4, rowNo, lineNo, cellCount}`**, not a row.
6. **§5.** Exactly ONE line equal (right-trimmed) to `| item | owner | closes |`; zero or two ⇒ throw. The §5 rows are the table lines after it up to the first non-table line, separators skipped; **exactly 3 cells ⇒ a row** `{item, owner, closes, lineNo}`; **any other count ⇒ `malformed` `{section: 5, rowNo: null, lineNo, cellCount}`**. (The pre-audit's §5 rule — "a 3-cell line whose first cell is not a session label" — is replaced by position under the one §5 header, which removes the `session`-header special case CD-A8 had to add at round 2.)
7. **The id.** `extractLeadingBatchId(deMark(cell))` (`config.mjs:67-74`), on the §4 **batch** cell (`cells[2]`) or the §5 **item** cell (`cells[0]`), where `deMark` removes `*` and backticks, maps NBSP to space and trims. The leading-token rule is what makes `#628 — batch named at Step 1`, `plan row 6` and `roadmap 16.7 — …` return null, and what makes `F-G-1 / B-GRID-REPRESENTABILITY` return null too (C4).
8. **Output.** `{ rows: Map<bid, {s4: Row[], s5: Row[]}>, unparsed: Row[] (id null), malformed: [...] }`. This is the exported plan-row join Langston named as `B-SLOT-PLACEMENT-CHECK`'s input (Step-1 Q7) — unchanged in purpose.

### 1.3 Who is graded — the trigger (⚠️ C1, needs Langston)

The ruling: *"trigger on the existing close sentinel (`hasCompletionReport`, `poller.mjs:104`) plus the id parsing in exactly ONE §4 row."*

**Measured at the ref, read literally this grades nothing that fails today.** `hasCompletionReport` is set only on batches built from the tick's `-n300` commit window (`computeBatchStates` at `poller.mjs:607`, then `:614-618`, then `applyCutoff` at `:626`). At `97aff32b7` the window spans `4ea23c1f3` (2026-09-28T20:20:21Z) → `97aff32b7` (2026-09-30T02:36:15Z), about 30 hours. Of the six plan ids that have a completion-named file (§2), **none of the three §4 ids is in the window** (rows 35, 55, 87 — last reports July), and the two that ARE enrolled by the tick (`B-REACH-BASELINE-ADJUST`, `B-XSTOCK-FEE-CONTRACT`) have **no §4 row**. Only 4 §4 ids have any leading-id commit in the window (`B-PLAN-CURRENCY-CHECK`, `B-XSTOCK-BID-TRIGGER-RELAND`, `B-SIZING-DEC-RESTORE`, `B-PRICE-SIDE-BY-JOB`), and none has a completion-named file. So "rows 35 and 87 fire today" is true of the PREDICATE and false of the tick's enrolment.

**Proposed (recommended): enrol FROM THE PLAN, keep the sentinel's primitive.** Every id parsed from a §4 batch cell or a §5 item cell at the ref is a candidate; it is graded iff `findGlobDoc(bid, 'completion_report')` is non-empty — the same primitive `hasCompletionReport` rests on (`poller.mjs:102-104` ← `completionReportCommitTime` ← `findGlobDoc`, `checker.mjs:141-144`), minus the first-add time, which a state check does not use. No window, no `applyCutoff`: the state is at the ref, so a window would only decide *when* a stale row is noticed, not *whether* it is stale. (`GOV_CUTOFF` 2026-06-24T12:07:01Z would change nothing today: all six reports were first added on or after 2026-07-22.) **Alternative:** keep the literal trigger (the tick's in-window batches only) — then the rule fires only for a batch whose report lands while it has a leading commit in the last ~300 commits, rows 35/55/87 are never graded, and P39 run 1 below has an empty fail set.

### 1.4 The §4 leg

For a graded id with **0** §4 rows: **not required** (no key). With **2 or more**: **FAIL — ambiguous**, the body naming every row number (key `…:s4`; no line numbers in a per-leg body — N7). With **exactly 1**: FAIL iff the status test OR the report test fails.

**Status test — fail on the machine default only.** `deMark(status)` is **empty**, or is **exactly `QUEUED`**. "Empty" means zero characters, or only dash characters (`—`, `–`, `-`) — the plan's placeholder for an empty cell (it fills 220 of 221 report cells, §2.4). Rules and why:
- **Markup is stripped before comparing** (`**QUEUED**`, `` `QUEUED` `` fail): emphasis around the default is still the default.
- **Case-sensitive** (`queued` passes): the machine wrote upper case (`plan_doc.py:114`, `STATUS.get(k, 'QUEUED')`); a lower-case word was typed by a person, and grading what a person typed is the terminal-token whitelist the ruling forbids.
- **Exact after trim** (`QUEUED — next in CC-A's list`, row 73, passes; `QUEUED — decision (Kyle's; …)`, row 9f, passes): anything beyond the bare token is a hand statement. ⚠️ Row 73's text was itself machine-written from `plan_doc.py`'s `STATUS` table (:44-46), as were six in-flight statuses (`IN FLIGHT — Step 7`, `BUILT — deploy after 2026-09-30` ×2, `REOPENED — Step 3`, `IN FLIGHT — 8a-P4c window…`, `IN FLIGHT — half live`). They pass the status test by construction; **the report test is what catches them** at close (§1.5).
- **No terminal token is read.** `DONE`, `CLOSED`, `✅` are never looked for.

**Report test — the cell must name a file `findGlobDoc` resolved.** PASS iff, for some basename `n` in the resolved set, `n` occurs in `deMark(report)` with **left** boundary a character that is not `[A-Za-z0-9_.-]` (or the cell edge), and **right** boundary either a character that is not `[A-Za-z0-9_-]` (or the cell edge), where a `.` counts as a boundary **unless a name character `[A-Za-z0-9_-]` follows it** — regex ``(?<![A-Za-z0-9_.-])n(?![A-Za-z0-9_-])(?!\.[A-Za-z0-9_-])``. That is a **basename match**. ⚠️ **r2 correction (reader item 1):** r1 put `.` in the right-boundary class, and because `deMark` strips backticks first, the ordinary sentence form `` `B_X_COMPLETION_REPORT.md`. `` became `B_X_COMPLETION_REPORT.md.` and FAILED. That is not a rare form: **in `PHASE_19_PLAN.md` at the ref, 12 of the 57 report citations are followed by `.`** (after the closing backtick) — the r1 rule names 45 of 57, the r2 rule 57 of 57 (APPENDIX, population control). A trailing `.` followed by a letter or digit (`.bak`, `.md.2`) still fails. Chosen from how reports are cited at the ref:

| where | full repo path | `Batch Completion/…` | bare basename | markdown link |
|---|---:|---:|---:|---:|
| `SPRINT_TO_LIVE_PLAN.md` (any cell) | 1 (§0 plan:11, `B_GOV_REPORTING_COMPLETION_REPORT.md`) | 0 | 0 | 0 |
| `PHASE_19_PLAN.md` (the predecessor plan, whose rows carried report links) | 0 | 6 | 51 | 0 |

(Occurrences of `…COMPLETION_REPORT….md`, classified by the prefix before the basename, perl over `git show`; markdown links `](` counted in both plans: 0 and 0, control `BATCH_CATALOG.md` 48 lines.) A path rule would fail the form used 51 of 57 times in the plan this one replaced; the basename is unique because every resolved file sits in the one `Batch Completion/` directory. A markdown link passes because its target ends in the basename followed by `)`.
**Controls (all run in the scratch, all as expected — APPENDIX):** full path, `Batch Completion/`-relative, bare, and `[report](…/B_X_COMPLETION_REPORT.md)` → pass; **r2:** `` report: `B_X_COMPLETION_REPORT.md`. ``, `B_X_COMPLETION_REPORT.md.` at the cell end, `` **`Batch Completion/B_X_COMPLETION_REPORT.md`.** `` and `B_X_COMPLETION_REPORT.md. Closed.` → pass; `—`, `B_X_PROGRESS_REPORT.md`, `OLD_B_X_COMPLETION_REPORT.md`, `B_X_COMPLETION_REPORT.md.bak`, **r2:** `B_X_COMPLETION_REPORT.md.2`, `B_X_COMPLETION_REPORT.md_x`, and `B_X_COMPLETION_REPORT` (no extension) → fail. Plus one before/after control: the r1 rule on the reader's case → fail, as the reader said. **The positive control re-run under the r2 rule is unchanged: the same six FAIL legs and the same one malformed row (§2.1, APPENDIX)** — no live report cell carries a link yet, so the correction changes no verdict today; it changes the verdict on the form the owners are most likely to write.
**Several resolved files:** any one named passes (the obligation is "report link", singular). At the ref **0** plan ids resolve more than one completion-named file, so this is unexercised today.

### 1.5 The §5 leg (⚠️ C2 and C3, needs Langston)

§5's header is `| item | owner | closes |` — no status cell and no report cell. A state rule needs something in the line that a close must change. Four forms (B′ added at r2), all computed at the ref over the three graded §5 ids:

| form | rule for a graded id present in §5 | `B-REACH-BASELINE-ADJUST` L354 `✅ closed 2026-09-29` | `B-XSTOCK-FEE-CONTRACT` L355 `21 days from 2026-09-11` | `B-DEPLOY-DRIFT-LINE` L357 `observation window open` |
|---|---|---|---|---|
| **A — presence is stale** | FAIL while the id is in §5 at all (removal is the end state the Step-1 ruling named) | FAIL | FAIL — **true or false depending on what §5 lists (C2)**. The BATCH is closed: its completion report (first-added 2026-09-12T00:59:24Z, `b6ade3d40`) says at line 11 *"The batch is CLOSED; the QUESTION it opened is not"*. Only its two pre-registered observation windows are open (to 2026-10-02T20:09:47Z, report line 20). If §5 lists batches, the line is stale and A is right; if §5 lists windows (its heading says *"observation windows"*), the line is current and A is wrong. *(r1 said "false" and called this a report filed when observation OPENED; the report records a close. The plan's own §0:20 still reads "FINISH: convert at close", which the report contradicts.)* | FAIL — true |
| **B — empty only** | FAIL iff the `closes` cell is empty | pass | pass | **pass — misses the one known stale line** (closed 2026-09-09; report heads *"✅ CLOSED 2026-09-09"*; §0:15 records that this line "read 'observation window' in error") |
| **B′ — the generator's text is the default** (r2) | FAIL iff the `closes` cell still equals, byte for byte, the text `plan_doc.py` hard-coded for that item (`scripts/inventory/plan_doc.py:119-122`, read at the ref, never run) | FAIL | FAIL (same dependence on C2's question as A) | FAIL — true |
| **C — the report link, on §5 too (recommended)** | FAIL iff the `closes` cell does not name a resolved file (the §1.4 report test on the `closes` cell) | FAIL — marked closed, no link (the §3 obligation is *status + report link*) | FAIL — until the owner adds the link to the report it already filed (one edit); after that it passes for the rest of the window | FAIL — true |

**§5 WAS machine-defaulted — r2 correction (reader item 2).** r1 said *"§5 was never machine-defaulted"*. That is wrong: `plan_doc.py:119-122` hard-codes all seven §5 lines (item, owner, `closes`), and **7 of 7 plan lines at the ref are byte-identical, in order, to that output** (APPENDIX). So "machine default only", the ruling's principle, has a literal reading on §5 after all: **B′**. Its costs, stated for C2: the checker would carry a frozen copy of seven strings from a script that row 1 is making refuse to write (a second copy of a table whose source is being retired); the check is discharged by ANY edit to the cell, true or not; and on a line added by hand after 2026-09-29 it has no default at all, so it degrades to B.
**Recommendation: C**, conditional on C2's first question (below). C reads no status word, cannot be satisfied by a stale in-flight phrase or by a cosmetic edit, and grades the half of plan:66 that §5 can carry. For `B-XSTOCK-FEE-CONTRACT` it asks for one truthful edit — link the completion report the batch already filed — whichever way C2's question is answered. **Its residual (R6, restated in r2):** once a line carries its report link, nothing in the line has to change again, so the end of an observation WINDOW is never seen — a line whose window has closed keeps passing. (r1 described this as a "later conversion close" of a batch that filed its report at window open; no §5 id at the ref has that shape — `B-XSTOCK-FEE-CONTRACT`'s report is a close, not an open — so the conversion case is hypothetical, and the window-end case is the real one.) Census list (f) (*"any plan line … not marked closed while its batch already has a completion-named file"*) is the only reader of it.
**C2's first question — does §5 list WINDOWS or BATCHES?** It decides A and B′ on `B-XSTOCK-FEE-CONTRACT` and decides what a closed batch with an open window owes: under "windows", its line stays until the window ends and C asks only for the link; under "batches", the line should already have left §5 and A's FAIL is correct.
**C3 — unreachable under the literal trigger.** All 5 parseable §5 ids have **zero** §4 rows (`B-FEED-MISMATCH-FIX`, `B-REACH-BASELINE-ADJUST`, `B-XSTOCK-FEE-CONTRACT`, `B-DEPLOY-DRIFT-LINE`, `B-INSTRUMENTS-OVER-RULES`). A trigger that requires exactly one §4 row therefore never grades the §5 leg of any batch in §5 today. Under the recommended plan enrolment (§1.3), the §5 leg is required iff the id is in §5, independently of §4. **Exactly one** applies to §5 as to §4: two §5 lines for one id ⇒ FAIL ambiguous.
The two §5 lines whose item does not parse (`8a-P4c (VTS xStock price instrument)` L352, `F-G-1 (venue price grid)` L356) are ungradable by construction — the `#1116` gap (`B-BATCH-ID-ALIAS-GRAMMAR`, row 1b).

### 1.6 What the check returns, and the keys

`checkPlanState(plan, reportsFor)` → an array of legs `{bid, leg: 's4'|'s5', fail: bool, why, rowNo?, lineNo}` for every graded id and every REQUIRED leg, plus `plan.malformed`. Pure; `reportsFor(bid)` → basenames, injected.

| key | when | severity |
|---|---|---|
| `gov-planline:<bid>:s4` | the §4 leg fails (status, report, or ambiguous) | `warning` |
| `gov-planline:<bid>:s5` | the §5 leg fails | `warning` |
| `gov-planline-malformed` | `malformed` is non-empty — body lists **every** malformed row with its **line number AND cell count** (R1-Q12 (iii)) | `warning` |
| `gov-planline-unreadable` | plan absent/empty, or any §1.2 throw (header missing, header mismatch, §5 header count ≠ 1) | `warning` (Q17) |

A passing required leg, or a confirmed `na-skip` row `<bid> | na-skip | plan_line` (one value covers both legs), RESOLVES its key. `plan_line` is disjoint from the 13 `DOCS` keys and the 1 `LEDGER_ROWS` key (`config.mjs:103-117`, `:168-175`; CD-A16, re-read at the ref). Neither singleton matches the per-leg regex `^gov-planline:(.+):(s4|s5)$` (hyphen, not colon).

---

## 2. THE POSITIVE CONTROL, MEASURED

**Instrument:** the scratch `predicate.mjs`, run at `97aff32b7` (output `run_97aff32b7.txt`); **r2: its successor, with the §1.4 report-test correction, re-run at `05af099da` — source and full output in the APPENDIX; the §2.1 result below is identical at both refs.** It implements §1.2–§1.5 directly; for "has a report" it uses the checker's own matcher — `batchIdToFileRegex(bid)` (`config.mjs:79-87`) AND `DOCS.completion_report.match` (`/COMPLETION|COMPLETE/i`, `config.mjs:106`) over `git ls-tree 97aff32b7 "Claude Comms and Packages/Batch Completion/"` (329 entries) — i.e. `findGlobDoc`'s filter (`checker.mjs:96-102`). First-add (printed for information, not used by the rule) is `git log 97aff32b7 --diff-filter=A --reverse` as `firstAddCommitMs` computes it (`checker.mjs:130-139`). Tick enrolment is replicated from `poller.mjs:44-67`, `:100-106` and `:86-88` with the box's `GOV_CUTOFF` 2026-06-24T12:07:01Z.

**Population:** every id parsed from a §4 batch cell (221 seven-cell rows; 105 with a parseable id, 105 distinct) or a §5 item cell (7 lines; 5 parseable). **6** of those ids have a completion-named file. No id is in two §4 rows or two §5 lines. One §4 row is malformed: **row 138a, line 256, 8 cells** (the stray `SUPERSEDED:` cell).

**Predicate controls** (run before trusting the population result): 7 status cases and 15 report-cell cases (9 at r1, 6 added at r2), all as expected, plus the r1-rule before/after case — listed in §1.4, output in the APPENDIX.

### 2.1 Result

| id | leg | line | status / closes cell | report cell | status test | report test | verdict | tick-enrolled today? |
|---|---|---|---|---|---|---|---|---|
| `B-WS-SUBSCRIBE-CLASS-FILTER` | s4 row 35 | 129 | `QUEUED` | `—` | fail | fail | **FAIL** | no (not in window) |
| `B-RTB-REFRESH-CONSOLIDATE` | s4 row 55 | 155 | `QUEUED` | `—` | fail | fail | **FAIL** | no |
| `B-COST-MATH-CONSOLIDATION` | s4 row 87 | 189 | `QUEUED` | `—` | fail | fail | **FAIL** | no |
| `B-REACH-BASELINE-ADJUST` | s5 | 354 | `✅ closed 2026-09-29` | — | — | — | A FAIL · B pass · B′ FAIL · **C FAIL** | yes (no §4 row) |
| `B-XSTOCK-FEE-CONTRACT` | s5 | 355 | `21 days from 2026-09-11` | — | — | — | A FAIL · B pass · B′ FAIL · **C FAIL** | yes (no §4 row) |
| `B-DEPLOY-DRIFT-LINE` | s5 | 357 | `observation window open` | — | — | — | A FAIL · B pass · B′ FAIL · **C FAIL** | no |

Reports and first-adds: `B_WS_SUBSCRIBE_CLASS_FILTER_COMPLETION_REPORT.md` 2026-07-22T23:58:36Z `3f85a607b`; `B_RTB_REFRESH_CONSOLIDATE_OBJ1_COMPLETION_REPORT.md` 2026-07-22T22:07:56Z `40004ddb3`; `B_COST_MATH_CONSOLIDATION_COMPLETION_REPORT.md` 2026-07-30T02:11:31Z `7d3e3e6f2`; `B_REACH_BASELINE_ADJUST_COMPLETION_REPORT.md` 2026-09-29T13:40:20Z `07c806722`; `B_XSTOCK_FEE_CONTRACT_COMPLETION_REPORT.md` 2026-09-12T00:59:24Z `b6ade3d40`; `B_DEPLOY_DRIFT_LINE_COMPLETION_REPORT.md` 2026-09-09T10:04:50Z `8e7e1ba9c`.

**Plainly: rows 35 and 87 FAIL, on both tests,** as Langston measured — under the plan enrolment of §1.3. **Under the ruling's literal trigger they do not fire** (not in the window) and nothing fires at all (C1).

### 2.2 Surprises

1. **Row 55 fails too** (`B-RTB-REFRESH-CONSOLIDATE`). Its only completion-named file is an OBJ-1 report whose header says *"this closes **OBJ-1 only** … **The batch is NOT closed.**"* (line 6). The sentinel counts it as a close — the `#1099` item-3 shape (a completion-named file ahead of the real close). Is the FAIL right? The row reads `QUEUED` for a batch with a shipped, deployed objective, so the row is stale either way; the pre-audit's P12 round-1 text (status *"OBJ-1 done; `#535` and OBJ-2b-6 (`#532`) open"*, report cell citing the OBJ-1 report) makes it pass. Folded into P4 below, with CC-B (row owner) and CC-A (HOME owner of `#532`/`#535`) told.
2. **Every graded leg fails today — 6 of 6 under form C (3 of 3 under B).** The live population has **no passing control.** The pass branch is shown only by P39 run 2 (after P4 lands) and by the fixtures.
3. **The report column is empty by construction:** 220 of 221 §4 report cells read `—`; the one other is row 39a's `⭐ Kyle decision`, which is not a report. No row has ever been closed into this plan with a link.
4. **The machine-written in-flight statuses** (six rows, §1.4) pass the status test forever; only the report test can catch them at close.

---

## 3. THE RE-CUT PLAN ITEMS

Numbers kept where the item survives. Line numbers are at `97aff32b7`.

**P4 · OBJ-2 + the positive-control rows — AMENDED** (ruling: *"P4 … now also carrying row 16's parseable id and rows 35/87's status and report"*)
- **Files and lines:** `SPRINT_TO_LIVE_PLAN.md` — row 16 L105, row 107 L215, row 120 L229, row 148 L266, row 157 L285, row 100 note L203 (`after F-G-1-REOPEN` → `after row 16`, same commit, PF-A15), **row 35 L129, row 87 L189, row 55 L155**. §0 L24/L29 go to CC-C with the pre-audit's CD-A13 texts. Plain-descriptor commit subject (CLAUDE.md §3.0).
- **Row 16 — the dual form.** The governed artifacts write it F-G first: `BATCH_CATALOG.md:728` *"### F-G-1 / B-GRID-REPRESENTABILITY"*, `PHASE_HISTORY.md:1076` *"F-G-1 / B-GRID-REPRESENTABILITY"*, the progress report H1 *"# F-G-1 / B-GRID-REPRESENTABILITY"*, the pre-audit H1 *"# F-G-1 — B-GRID-REPRESENTABILITY"*; the alias is `unify.py:18` `"B-GRID-REPRESENTABILITY": "F-G-1"`. **That order does not parse** (`extractLeadingBatchId('F-G-1 / B-GRID-REPRESENTABILITY')` → `null`, leading-token rule). The parseable dual form is the same pair reversed: batch cell **`B-GRID-REPRESENTABILITY / F-G-1`** → `B-GRID-REPRESENTABILITY` (probe run on the ref's `config.mjs`). ⚠️ **C4:** that id is parseable but NOT gradable — `batchIdToFileRegex('B-GRID-REPRESENTABILITY')` matches neither `F_G_1_PROGRESS_REPORT.md` nor a future `F_G_1_COMPLETION_REPORT.md`; it DOES match `F_G_1_B_GRID_REPRESENTABILITY_COMPLETION_REPORT.md` and `B_GRID_REPRESENTABILITY_COMPLETION_REPORT.md` (probes). 0 commit subjects lead with `B-GRID-REPRESENTABILITY` (control: 65 lead with `F-G-1`) — irrelevant under plan enrolment, fatal under the literal trigger. So Q1(b)'s condition is met in form; **in effect, row 16 grades only if CC-C names the closing report with the B- form in its filename** (e.g. `F_G_1_B_GRID_REPRESENTABILITY_COMPLETION_REPORT.md`), or when `#1116` lands. ⚠️ **r2 (reader minor): row 16's current work runs as "F-G-1 reopen"** — 6 commit subjects at the ref lead with `F-G-1 reopen` (e.g. `4f9df55e1` Step-3, `e9d01f1fe` Step-4), the pre-audit is `Scope Files/F_G_1_REOPEN_PRE_AUDIT.md`, and the plan's machine-written status key is `F-G-1-REOPEN` (`plan_doc.py:45`) — so the file that closes row 16 is likely an `F_G_1_REOPEN_*` report, not a conversion of `F_G_1_PROGRESS_REPORT.md`. Probes on the ref's `batchIdToFileRegex('B-GRID-REPRESENTABILITY')`: `F_G_1_REOPEN_COMPLETION_REPORT.md` → **no match**, `F_G_1_COMPLETION_REPORT.md` → no match, `F_G_1_REOPEN_B_GRID_REPRESENTABILITY_COMPLETION_REPORT.md` → match (APPENDIX). Proposed: P4 writes the reversed dual form, and CC-C is asked (not told) to carry the B- form in the filename of **whichever report closes row 16 — the reopen's report or the conversion, both if both are written**; Langston rules whether that request is enough (§5.1).
- **Row 35** (owner Infra Claude; batch CC-A): status `DONE — OBJ-2 shipped 2026-07-23 (71ec83f36); OBJ-1 continues as #571`, report `B_WS_SUBSCRIBE_CLASS_FILTER_COMPLETION_REPORT.md`.
- **Row 87** (plan owner CC-A; batch CC-C): status `DONE — 2026-07-31` **only after CC-C confirms** the close (its report's banner reads *"awaiting Langston's confirmation + Kyle's acknowledgement"*; `BATCH_CATALOG.md:19` records CI 4-green and deploy) — otherwise the true status CC-C gives; report `B_COST_MATH_CONSOLIDATION_COMPLETION_REPORT.md`. Pre-audit Question 26 stays with CC-C.
- **Row 55** (CC-B): the P12 round-1 text (surprise 1).
- ⚠️ **Interaction with P12 (needs Langston, §5.1 N4):** P12 as drafted RE-POINTS rows 35 and 87 to their residuals (`B-WS-SUBSCRIBE-BOUNDARY-CLASS`, `#627 — batch named at Step 1`). Under the state form that makes both rows ungraded — they pass by losing the id, which is how the diff design's exemption hid them. **Proposed instead:** keep the shipped id, mark it DONE with its report (above), and give each residual its own lettered row (35a `B-WS-SUBSCRIBE-BOUNDARY-CLASS (#571)`, Infra/CC-A; 87a `#627 — batch named at Step 1`, after CC-C's answer), so the close record stays graded and the residual stays placed.
- **Tests / verification:** at the landing ref, the P33 join: 0 rows with an id in the item cell but not the batch cell (4 before: 107, 120, 148, 157); P39 run 2 (below).
- **falls out of:** §1.2 item 7, §2.1, §2.2 (1), C4; CD-A12, CD-A13, PF-A15.
- **Ordering:** no longer load-bearing for correctness. CD-A14's hazard (a bulk plan edit crediting another batch's close) is a diff-form hazard and dissolves. Landing P4 before the flip only reduces what the flip opens (§P61).

**P31 · OBJ-2 id pattern — SURVIVES, B-/T- half only** (ruling). `config.mjs:22` replaced and the `T-` pattern added, live on push after a pre-push local run of `poller.test.mjs`. No F-G line (`#1116`). Pre-audit text otherwise unchanged. It makes row 107's `T-W20C-SCALAR-LEG` parse once P4 moves it into the batch cell.

**P32 · the `PLAN_LINE` table — AMENDED (no `sinceMs`)**
- **Files and lines:** `config.mjs`, after `LEDGER_ROWS` (:168-175), before `// Undeclared class` (:177): `export const PLAN_LINE = { path: '1-system-manual/SPRINT_TO_LIVE_PLAN.md', naKey: 'plan_line', enabled: false, s4Header: '| # | item | batch / reference | owner | status | report | note |', s5Header: '| item | owner | closes |' }`, with a comment in the :156-167 style: committed source, NOT env-overridable; key disjoint from `DOCS`/`LEDGER_ROWS`.
- **Why no `sinceMs`:** a gate on the report's first-add would re-create the diff design's permanent exemption — every graded id today has a report older than any landing time (§2.1), so rows 35/55/87 would never be graded. The state is graded as it stands; the flip's first tick opens exactly the pre-registered set (P61).
- **Tests:** disjointness beside `poller.test.mjs:503-504`; `PLAN_LINE.enabled === false` at landing (rewritten by the flip commit).
- **falls out of:** §1.6, §2.1; CD-A16.

**P33 · the row parser and the exported join — SURVIVES, nearly unchanged**
- **Files and lines:** `checker.mjs` imports (:14-19) gain `PLAN_LINE`, `extractLeadingBatchId`; a new section after `checkLedgerRows` (:225-234), before the `scopeCommitTime` comment (:235). `export function planRowsByBatch(planText, extract = extractLeadingBatchId)` → `{ rows, unparsed, malformed }` exactly as §1.2; throws as §1.2. `classifyPlanLine` is kept only if the implementation wants it as a helper. **Dropped:** `parsePlanDiff` (no diff). **Changed:** §5 rows by position under the one §5 header; §5 malformed rows reported.
- **Tests:** a §4 row with its id; item-cell-only row (107/120 shape) → id null; `plan row 6` → null; §0/§6 lines never classified; an 8-cell numbered row (138a shape) → in `malformed` with `lineNo` and `cellCount: 8`, not in `rows`; one of ten §4 headers with an extra column → throws; all ten exact → no throw; a 4-cell line under the §5 header → `malformed` §5; no §5 header or two → throws; empty text → throws; a `**QUEUED**` cell and an NBSP cell de-marked as §1.2 item 7.
- **Annotation (kept from the pre-audit):** the one-line *"input: `checker.mjs` `planRowsByBatch`"* note on `B-SLOT-PLACEMENT-CHECK`'s after-live line and CC-A's task-list row 4.8.
- **falls out of:** §1.2; CD-A8, CD-A12.

**P34 · the check — AMENDED (`checkPlanState` replaces `checkPlanLine`; `readPlanIo` dropped)**
- **Files and lines:** `checker.mjs`, same section. `export function checkPlanState(join, reportsFor)` → legs as §1.6 (pure). `findGlobDoc` (:96-102) gains an optional third parameter `names = lsTreeNames(spec.dir)` so the tick reads the listing once and every existing caller is unchanged. Status and report tests exported separately (`statusIsDefault(cell)`, `cellNamesFile(cell, basename)`) so their controls are unit tests.
- **Tests:** the 22 predicate controls of §1.4 as unit cases (7 status, 15 report — including r2's four sentence-dot passes and two dotted-suffix fails); a graded id with one row `QUEUED`/`—` → s4 fail with both reasons; the same with `DONE — x` + the basename → pass; `QUEUED — next …` + the basename → pass; `BUILT — …` + `—` → fail on the report test only; an id in two §4 rows → s4 fail ambiguous naming both; an id with no report → no legs; an id in §5 only → s5 leg only; §5 form-C cases (closes cell with and without the basename); two §5 lines → s5 ambiguous.
- **falls out of:** §1.3–§1.6, §2.1.

**P35 · the lower bound — DROPPED.** No bound exists in a state check (ruling: *"P35 … go[es] away"*). CD-A1, CD-A2, CD-A4, CD-A7 and the `_leads`/`planBound` design have no successor.

**P36 · the decision — AMENDED (its own pure function, not a block inside `decideAlerts`)**
- **Files and lines:** `poller.mjs`, a new exported `decidePlanLineAlerts(legs, malformed, na, { enabled })` → `{ toOpen, toResolveKeys }`, placed after `decideAlerts` (:218-344). **Not** block (3c) inside `decideAlerts`' per-batch loop: that loop iterates the window's enforceable batches (C1), which is exactly the population the plan enrolment replaces. The tick merges its intents into the existing add/resolve loops (:672-681).
- **Behaviour:** `enabled` false ⇒ `{[],[]}` — **FREEZE** (Q16): nothing opened, nothing resolved. Otherwise each failing leg opens its key (`warning`, through the same `sev()` shadow wrapper) with a body naming the id, the leg, the §4 row number (§4 only), the REQUIREMENT (a status that is not the default AND a report cell naming one of the resolved basenames, listed) and the preview command that shows the current line — **no line number and no failing-test name (r2, N7)**; each passing required leg, or `na.has(bid+':plan_line')`, resolves its key; `malformed` non-empty opens `gov-planline-malformed`, empty resolves it.
- **Tests:** flag off → no intents for any `gov-planline` key; fail → open, and the per-leg body is the SAME string for a status-only, a report-only and a both-tests failure of one row, and for that row moved down ten lines (so it carries neither a line number nor which test failed); pass → resolve; na-skip → resolve; malformed → the singleton with every line number and cell count in the body; empty malformed → resolve.
- **falls out of:** §1.3, §1.6; Q15, Q16.

**P37 · the orphan branch — AMENDED (per-leg regex; the verifier re-reads the plan's state)**
- **Files and lines:** `decideOrphanSweep` (`poller.mjs:163-197`): a 6th parameter `verifyPlanLine = () => false` and, before `// other orphan key types are not swept here` (:194), `/^gov-planline:(.+):(s4|s5)$/`. An open per-leg key this tick's `decidePlanLineAlerts` did not touch (its id left the plan, lost its report, or its leg stopped being required) is RESOLVED iff `verifyPlanLine(bid, leg)` is true — the leg is not required, or passes, at the ref — else KEPT. `makeVerifyPlanLine(naConfirmed, join, reportsFor)` beside `makeVerifyLedgerRow` (:206-208). When the flag is off, the plan is unreadable, **or the Batch Completion listing is empty (r2, §1.1)**, the tick passes `() => false` (FREEZE).
- **Why an orphan branch still exists:** with plan enrolment there is no window to age out of, but an id can leave the plan (row deleted or re-pointed) with its key open. Resolving it is verified at the ref, not blind; the price is that deleting a row clears its alert (residual R3).
- **Tests:** untouched key, id gone from the plan → resolve; untouched key, leg still failing (defensive) → keep; no verifier → keep; **r2: an open `gov-planline:B-WS-SUBSCRIBE-CLASS-FILTER:s4` with an EMPTY listing → KEEP (the flap case: a join built on `[]` would call every leg "not required" and resolve it);** the singletons are not matched; an `s5` key after the §5 line is removed → resolve.
- **falls out of:** §1.6; CD-A16 (the per-leg regex hazard, kept).

**P38 · the tick wiring and the liveness line — AMENDED**
- **Files and lines:** `poller.mjs` tick, after the rulebook block (:634-654) and before `decideAlerts` (:670), **only when `PLAN_LINE.enabled`**: `const text = showFile(PLAN_LINE.path)`; `join = planRowsByBatch(text)` in a `try`; on `null`/throw → open `gov-planline-unreadable` (`warning`, the :638-645 idiom), grade nothing, pass `() => false` to the orphan branch; on success → `names = lsTreeNames(DOCS.completion_report.dir)`; **r2: if `names` is empty, the tick treats it exactly as an unreadable plan** — opens `gov-planline-unreadable` with a body naming the Batch Completion listing, grades nothing, passes `() => false` to the orphan branch (§1.1); only when both reads succeed does it resolve that singleton (:651-654 idiom) and compute `legs = checkPlanState(join, (bid) => findGlobDoc(bid, 'completion_report', names).map(basename))`. Other rules continue when the plan read fails. **Malformed body freezing:** the checker dedupes in its own table and never rewrites a body, so a second malformed row arriving while the singleton is open would be invisible (`#572`); the tick stores a signature of the malformed list in state and, when it changes while open, resolves and re-opens — the fetch-fail escalation idiom (:559-563). (Its body names line numbers, which R1-Q12 (iii) requires and which go stale on an edit above the row; the body therefore states the ref sha they were read at — N7.)
- **Liveness line** (only when enabled and the read succeeds): `[gov-checker] planline: enabled ref=<gradedRefSha> rows4=<n> rows5=<n> ids=<n> graded=<n> legs=<n> fail=<n> malformed=<n>`. A pure function of the two reads, so an offline P39 run at the same sha reproduces it. **`ref=` is the sha the two reads were made at** — `gradedRefSha` (`rev-parse BRANCH`, `poller.mjs:580`), which is the reads' `GOV_REF` whenever `GOV_REF` is not set apart from `GOV_BRANCH` (`checker.mjs:34`, `poller.mjs:33`); if it ever is, the line prints `rev-parse GOV_REF` instead. It is NOT the sha of `poller.mjs:543`'s *"running at deployed HEAD"* line, which is the checker's own code version. **Expected at `97aff32b7`** (from §2), **and at `05af099da` (r2 re-run, APPENDIX)**: `rows4=221 rows5=7 ids=110 graded=6 legs=6 fail=6 malformed=1` under form C. *(`ids` = 105 §4 + 5 §5 parseable, no overlap.)* `DRIFT_LOADED_FILES` (:521) already covers the three files.
- **Tests:** the pure `decidePlanReadAlert({enabled, readOk, openId})` of the pre-audit, kept, with **r2's `readOk` = plan parsed AND listing non-empty** — cases: listing `[]` with a good plan ⇒ `gov-planline-unreadable` opens, zero legs, orphan verifier false for every key (the scratch's `planStep` shows this at the ref: `unreadable="Batch Completion listing empty" legs=0 verifyOrphan=false`, control on the real listing `verifyOrphan(not graded)=true`, APPENDIX); the malformed-signature re-open as a pure unit.
- **falls out of:** §1.1, §1.2, §2; CD-A8.

**P39 · the preview — AMENDED (it can now show live fails)**
- **What:** `scripts/governance-checker/plan-lines-preview.mjs`, calling the SAME `planRowsByBatch` / `checkPlanState` the tick calls, with `--ref <sha>` (reads at that ref) or `--plan-file <path>` (a fixture text; the Batch Completion listing still at `--ref`). Prints the liveness counts, every graded leg with its verdict and reasons, and `malformed`. No `--gate` (nothing is timed).
- **Run 1 — live positive control, pre-registered from §2 (a second implementation must agree with the scratch):** `--ref 97aff32b7` ⇒ FAIL `B-WS-SUBSCRIBE-CLASS-FILTER:s4` (row 35 L129, status+report), `B-RTB-REFRESH-CONSOLIDATE:s4` (row 55 L155, status+report), `B-COST-MATH-CONSOLIDATION:s4` (row 87 L189, status+report); under form C also `B-REACH-BASELINE-ADJUST:s5` (L354), `B-XSTOCK-FEE-CONTRACT:s5` (L355), `B-DEPLOY-DRIFT-LINE:s5` (L357); malformed = [row 138a, L256, 8 cells]; nothing else graded. Any difference from this list is a defect in one of the two implementations and is investigated before Step 4.
- **Run 2 — the pass branch, at the ref where P4 (and OBJ-9's P9 for `B-DEPLOY-DRIFT-LINE`'s §5 line, and the owners' §5 links) have landed:** pre-registered as rows 35 and 87 PASS (status not default, report named), row 55 PASS if the P12 text landed; the §5 outcomes depend on the texts landed and are written into the change list, per id, before the run. HYPOTHESIS until run: it rests on texts not yet written.
- **Run 3 — the FAILURE branches, fixtures, expected output stated here BEFORE any run (`#744` rider):**
  - **(a) malformed row** — `--plan-file` = the plan at `97aff32b7` unchanged ⇒ `malformed` = exactly `[{section:4,rowNo:'138a',lineNo:256,cellCount:8}]`; row 138a absent from `rows`; no leg for `B-PATTERN-SIZE-CAP-REVIEW`; the tick decision opens `gov-planline-malformed` with body containing `138a`, `256` and `8`. **(a′)** the same text with one extra column appended to the Wave A2 header (plan:147) ⇒ throw ⇒ `gov-planline-unreadable` opens; zero legs; zero per-batch intents; an already-open `gov-planline:*` key is KEPT.
  - **(b) absent plan** — `PLAN_LINE.path` absent at the ref, the shape a rename produces (the plan was renamed once, `4f3668af2`); fixture: the preview's plan reader injected to return `null`, as `showFile` does for an absent path ⇒ `gov-planline-unreadable` opens (`warning`); zero legs; zero per-batch opens or resolves; the orphan verifier returns false for every key. **(b′)** an empty file ⇒ the same. **(b″, r2)** the plan at the ref unchanged, the Batch Completion listing injected as `[]` (what `lsTreeNames` returns on any `ls-tree` error) ⇒ the same as (b): `gov-planline-unreadable` opens naming the listing, zero legs, zero per-batch opens or resolves, an already-open `gov-planline:*` key KEPT.
  - **(c) id in two rows** — the plan at `97aff32b7` with row 36's batch cell (L130, `#506 — batch named at Step 1`) replaced by `B-WS-SUBSCRIBE-CLASS-FILTER` ⇒ `B-WS-SUBSCRIBE-CLASS-FILTER:s4` FAIL with reason *ambiguous: row 35 L129, row 36 L130*; no status/report verdict for either row; every other leg as run 1. **(c′)** the §5 line L353 item replaced by `B-DEPLOY-DRIFT-LINE` ⇒ `B-DEPLOY-DRIFT-LINE:s5` FAIL ambiguous naming L353 and L357.
  - Plus two pass fixtures, so the failure fixtures are not the only verdicts: row 35's status set to `DONE — x` and report to `B_WS_SUBSCRIBE_CLASS_FILTER_COMPLETION_REPORT.md` ⇒ that leg PASS; the same with report `—` ⇒ FAIL on the report test only.
- **falls out of:** §2, §2.2 (2) (no live pass control), §1.2, §1.4, §1.5.

**P61 · the flip — AMENDED**
- **What:** one committed change to `PLAN_LINE.enabled` (no `sinceMs` any more). Never a drop-in environment variable (Q9).
- **Preconditions:** Langston Step 4; P30 (the checker tests in CI) green; P39 runs 1 and 3 committed and matching their pre-registration; **run 1 re-run at the flip commit's parent, and its fail set + malformed list committed as the EXACT expected open set of the first tick**; P13a (row 138a back to 7 cells) landed, or 138a is in that expected set. P4 before the flip is **recommended, not required** — it shrinks the first tick's opens; it no longer protects anything.
- **Verification:** four ticks. Each carries the P38 liveness line with counts equal to the offline P39 run **at the `ref=` that liveness line prints** (the graded ref; r2 correction — r1 said "the sha the tick logged (`poller.mjs:543`)", which is the deployed checker CODE's `HEAD`, not the ref the plan was read at, `gradedRefSha` at `:580`); a tick without the line fails the flip. The first tick opens **exactly** the pre-registered keys — no more, no fewer (this is now possible because the live set is non-empty; the diff design could only say "nothing outside the set"). Wall time within the 120 s `TimeoutStartSec` (pre-audit CD-A6 baseline 11.1–11.5 s; the two new reads are unmeasured on the box and are measured here). Then each owner's fix is watched to resolve its key on the next tick — the live pass branch.
- **falls out of:** §2, P38, P39.

**P5, P54 — SURVIVE unchanged** (approved by the ruling; not OBJ-1).
**P12 — AMENDED by P4's N4 proposal** if Langston agrees; otherwise unchanged and the row-35/87 texts move with it.

---

## 4. WHAT THE STATE FORM DOES NOT CATCH

- **R1 — currency, not diligence** (Langston's own framing). A row made current by ANOTHER session, or long after the close, passes. Who did the update is the `workflow-10-governance` Tier-1 ledger row's question, not this rule's.
- **R2 — a status a person typed wrongly.** Any non-default status passes the status test (`DONE` on an open batch, `IN FLIGHT` on a closed one). A closed batch with a wrong status and a correct report link passes both tests. The machine-written in-flight statuses (§1.4) are caught only by the report test.
- **R3 — a batch absent from §4.** An id in no §4 batch cell owes nothing: the 116 rows with no parseable batch-cell id (221 − 105) are ungradable until OBJ-2/`#1116` name them; a row deleted or re-pointed away clears its alert through the verified orphan resolve (P37). Census list (f) is the only reader, and it cannot see a deleted row either.
- **R4 — §0 is not graded** (Step-1 ruling). At the ref 7 §0 ids have a completion-named file, 4 of them §0-only (`B-GOV-REPORTING`, `B-MEASURE-GATE`, `B-ARCHIVE-RETENTION-SIZING`, `B-WAKE-LEAD-NAME`). Census list (f).
- **R5 — a completion-named file that is not a close** (row 55's OBJ-1 report; `#1099` item 3, home `B-GOV-LEDGER-GRADE`). The sentinel is the checker's, not this rule's.
- **R6 — the end of an observation window** (form C; §1.5; restated in r2). Once a §5 line carries its report link, nothing in it has to change again, so a window that has ENDED keeps passing. (r1 named this "the observation-at-open conversion"; that shape — a completion-named report filed at window open and converted later — has no instance at the ref: `B-XSTOCK-FEE-CONTRACT`'s report records a close, report line 11.)
- **R7 — report link to a neighbour.** `batchIdToFileRegex` accepts a separator-led suffix (`checker.mjs:221-224`), so a cell naming a neighbour's report that `findGlobDoc` also resolves passes. 0 plan ids resolve more than one file today.
- **R8 — a basename in the wrong cell.** Only the report cell (§4) and `closes` cell (§5) are read; a link written into the note passes nothing.
- **R9 — ids the grammar cannot see** (`F-G-*`, `8a-P4c`, and row 16 in effect — C4): `#1116`.

---

## 5. THE QUESTIONS — DISSOLVED, SETTLED, STILL OPEN, NEW

**Dissolved by the ruling (not re-argued):** Q8(a)–(d) and the §5 cell, R2-Q6, R1-Q10, R2-Q4, R3-Q2, R3-Q3, CD-A2's bound, CD-A5's diff filter and the rename, CD-A7's window, rows 22.1/22.5/22.9/22.11/22.12/22.16/22.21, Q18; R3-Q1 answers itself; R1-Q11's observation-open residual goes (it returns as R6, a property of form C, not a bound). **Also dissolved by the state form, listed here so nobody looks for them:** CD-A1 (the unpinned bound), CD-A3's historical runs at `9d80cd991`/`d4a2679c4` with `--gate` (nothing is timed), CD-A4 (the Step-10-then-code residual), CD-A14 (bulk plan edits crediting other batches — no crediting exists), CD-A15 as an exemption (the three QUEUED rows are now the positive control, not exempt), the P39 round-2/round-3 fixtures (draft-report, reopen, Step-1 naming pair — each was a bound question), and P61's P4-before-flip precondition.
**Settled by the ruling and applied above:** Q7 (no F-G pattern; `#1116`), R1-Q12 (iii), Q15 per-leg, Q16 FREEZE, Q17 `warning`, Q9 committed flag.
**Still open, carried unchanged:** Question 26 (row 87's residual, CC-C); the P12 row-55 owner question.

### 5.1 NEW — FOR LANGSTON BEFORE STEP 3

- **C1 — the trigger.** Literal reading (`hasCompletionReport` from the tick's window) grades nothing that fails today, including rows 35/87 (§1.3, measured). **Recommendation:** plan enrolment with the sentinel's primitive (`findGlobDoc` presence), no window, no cutoff.
- **C2 — the §5 leg's form, and first what §5 lists (r2).** **(i) Does §5 list observation WINDOWS or BATCHES?** `B-XSTOCK-FEE-CONTRACT` is a closed batch (report line 11) with two open windows (to 2026-10-02); its line is current under "windows" and stale under "batches", so this answer decides A and B′ on it. **(ii) The form:** A, B, B′ or C (§1.5, measured). **Recommendation: C** under either answer to (i). A is right on `B-XSTOCK-FEE-CONTRACT` only under "batches". B (empty only) misses the one known stale §5 line. **B′** (r2 — the closes cell still equals `plan_doc.py:119-122`'s hard-coded text, which all 7 §5 lines do today) is the literal "machine default only" reading; it fails all three graded lines today, but it carries a frozen copy of a retiring script's table, passes on any edit, and has no default for a hand-added line.
- **C3 — the §5 leg's reachability.** Under "exactly ONE §4 row" as the trigger, 0 of 5 §5 ids can ever be graded (none has a §4 row). **Recommendation:** the §5 leg required iff the id is in §5, independent of §4.
- **C4 — row 16.** The parseable dual form (`B-GRID-REPRESENTABILITY / F-G-1`) does not join to any F-G-1 report. Is the Q1(b) condition met by the parse alone, by CC-C naming the closing report with both forms, or only by `#1116`? (r2: the close is likely the **F-G-1 reopen's** report — an `F_G_1_REOPEN_*` name, which `B-GRID-REPRESENTABILITY` does not match — so the request covers the reopen's report name as well as any conversion; P4.)
- **N4 — rows 35/87: split, not re-point.** P12's re-pointing makes the positive-control rows pass by losing their id. **Recommendation:** DONE + report on the shipped id, residual on its own lettered row.
- **N5 — row 55 fails** on an OBJ-1-only completion report (§2.2 (1)). **Recommendation:** fix the row's text in P4 (it is stale anyway); do not special-case the sentinel here (`#1099` owns that).
- **N6 — the normalisation choices** in §1.4 (markup stripped; dash-only = empty; case-sensitive; exact after trim) — confirm, since each decides a verdict on a real row.
- **N7 — what an alert body may name, given the checker never rewrites one (r2, widened on the reader's finding).** The add loop opens a key only when it is not already open (`poller.mjs:672-676`) and never rewrites the body of an open alert. **The reader's point:** r1's per-leg bodies named a line number and the failing test, so they went stale silently — after a partial fix (status fixed, report still missing: the body still says both failed) or after any edit above the row (every line number below it moves; 49 commits at the ref touch the plan's current path, 34 dated 2026-09-29 and 15 dated 2026-09-30 — `git log 05af099da -- <plan>`, committer dates, no `--follow`). Two fixes: **(a) extend P38's re-open-on-change to per-leg keys**, or **(b) keep per-leg bodies to what does not move.** **Recommendation: (b)** — the per-leg body names the id, the leg, the §4 row number, the requirement and the preview command (P36), and the current line is one command away. (a) keyed on the line number would resolve and re-open every failing leg on every plan edit above it, each re-open a new alert; keyed on the failing test alone it removes only half the staleness. **The malformed singleton keeps its re-open on signature change** (confirm it over per-row keys, which on §5 would have to key on a line number that moves with every edit); its body carries the line numbers R1-Q12 (iii) requires, **stamped with the ref sha they were read at**, so a stale number is dated rather than wrong.

---

## APPENDIX — THE PREDICATE SCRIPT (r2) AND ITS FULL OUTPUT AT `05af099da`

**Why it is here:** the scratch scripts live in a session scratchpad, which the review branch does not carry, so a reviewer reading only the branch could not re-derive §2. This is the script every r2 figure came from, verbatim, and its complete output. **To re-run:** save the block as `predicate.mjs` in any empty folder and run `node predicate.mjs 05af099da <path-to-a-clone>`. It reads only git objects at the ref (`git show` / `git ls-tree` / `git log`), writes one file beside itself (`config.at-ref.mjs`, the ref's `scripts/governance-checker/config.mjs`) and imports it; it reads `scripts/inventory/plan_doc.py` as a blob and never runs anything under `scripts/inventory/`. The `-n300` window and the first-add times depend on the ref; nothing else does. First-add times print in the committer's offset (`%cI`).

### A.1 Source

````js
// OBJ-1 re-cut (state check) — positive control + predicate controls. Reads ONLY git objects at REF.
// Usage: node predicate.mjs [REF] [REPO]   (defaults: 05af099da, C:/DawnTraderV3-old)
// Self-contained: config.mjs is taken from REF (git show) into a file beside this script and imported.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REF = process.argv[2] || '05af099da';
const REPO = process.argv[3] || 'C:/DawnTraderV3-old';
const CUTOFF = Date.parse('2026-06-24T12:07:01Z'); // box GOV_CUTOFF (pre-audit CD-A3)
const git = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const cfgPath = fileURLToPath(new URL('./config.at-ref.mjs', import.meta.url));
writeFileSync(cfgPath, git(['show', `${REF}:scripts/governance-checker/config.mjs`]));
const { extractLeadingBatchId, batchIdToFileRegex, DOCS, CODE_PREFIXES } = await import(pathToFileURL(cfgPath).href);

const PLAN = '1-system-manual/SPRINT_TO_LIVE_PLAN.md';
const BC = 'Claude Comms and Packages/Batch Completion';
const S4H = '| # | item | batch / reference | owner | status | report | note |';
const S5H = '| item | owner | closes |';

// ── the parser under test (§1.2) ───────────────────────────────────────────
const cellsOf = (line) => { let s = line.trim(); if (s.startsWith('|')) s = s.slice(1); if (s.endsWith('|')) s = s.slice(0, -1); return s.split('|').map((c) => c.trim()); };
const isSep = (line) => /^\|[\s:|-]+\|?\s*$/.test(line.trim());
const deMark = (s) => s.replace(/[*`]/g, '').replace(/\u00a0/g, ' ').trim();
const idOf = (cell) => extractLeadingBatchId(deMark(cell));

function parsePlan(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('plan empty or absent');
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  let sec = null; let s5Header = 0, inS5 = false;
  const s4 = [], s5 = [], malformed = [], headers4 = [], badHeaders = [], other4 = [];
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const h = /^## (\d+)\./.exec(line);
    if (h) { sec = Number(h[1]); inS5 = false; return; }
    if (!line.trim().startsWith('|')) { if (sec === 5) inS5 = false; return; }
    const cells = cellsOf(line);
    if (sec === 4) {
      if (cells[0] === '#') { headers4.push(lineNo); if (line.trimEnd() !== S4H) badHeaders.push(lineNo); return; }
      if (isSep(line)) return;
      if (/^\d+[a-z]?$/.test(cells[0])) {
        if (cells.length !== 7) { malformed.push({ section: 4, rowNo: cells[0], lineNo, cellCount: cells.length }); return; }
        const [rowNo, item, batch, owner, status, report, note] = cells;
        s4.push({ lineNo, rowNo, item, batch, owner, status, report, note, id: idOf(batch) });
        return;
      }
      other4.push({ lineNo, first: cells[0] });
    } else if (sec === 5) {
      if (line.trimEnd() === S5H) { s5Header++; inS5 = true; return; }
      if (!inS5 || isSep(line)) return;
      if (cells.length !== 3) { malformed.push({ section: 5, rowNo: null, lineNo, cellCount: cells.length }); return; }
      const [item, owner, closes] = cells;
      s5.push({ lineNo, item, owner, closes, id: idOf(item) });
    }
  });
  if (headers4.length === 0) throw new Error('no §4 header');
  if (badHeaders.length) throw new Error(`§4 header mismatch at line(s) ${badHeaders.join(',')}`);
  if (s5Header !== 1) throw new Error(`§5 header count ${s5Header}`);
  return { s4, s5, malformed, headers4, other4 };
}

// ── the predicate under test (§1.4) ────────────────────────────────────────
const EMPTY = (s) => { const d = deMark(s); return d === '' || /^[—–-]+$/.test(d); };
const statusFails = (status) => EMPTY(status) || deMark(status) === 'QUEUED';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// r2 (reader item 1): a sentence-final '.' after the basename is punctuation, not part of a name;
// the right boundary rejects a name character, or a '.' that is followed by a name character.
const namesFile = (cell, basename) =>
  new RegExp(`(?<![A-Za-z0-9_.-])${esc(basename)}(?![A-Za-z0-9_-])(?!\\.[A-Za-z0-9_-])`).test(deMark(cell));
const namesFileR1 = (cell, basename) => // the rule at 05af099da, kept for the before/after control
  new RegExp(`(?<![A-Za-z0-9_.-])${esc(basename)}(?![A-Za-z0-9_.-])`).test(deMark(cell));

// ── reads at the ref ───────────────────────────────────────────────────────
const planText = git(['show', `${REF}:${PLAN}`]);
const plan = parsePlan(planText);
const bcNames = git(['ls-tree', '--name-only', REF, `${BC}/`]).split('\n').filter(Boolean).map((p) => p.split('/').pop());
const scNames = git(['ls-tree', '--name-only', REF, 'Claude Comms and Packages/Scope Files/']).split('\n').filter(Boolean).map((p) => p.split('/').pop());
const findGlob = (bid, names, match) => names.filter((n) => batchIdToFileRegex(bid).test(n) && match.test(n));
const firstAdd = (dir, name) => {
  const out = git(['log', REF, '--diff-filter=A', '--reverse', '--format=%cI|%h', '--', `${dir}/${name}`]);
  const f = out.split('\n').find(Boolean); if (!f) return null;
  const [t, h] = f.split('|'); return { ms: Date.parse(t), iso: t, sha: h };
};

// ── tick enrolment replica (the -n300 window) ─────────────────────────────
const logOut = git(['log', REF, '-n300', '--pretty=COMMIT|%H|%cI|%s', '--name-only']);
const win = new Map(); let cur = null; const commits = [];
for (const raw of logOut.split('\n')) {
  const line = raw.replace(/\r$/, '');
  if (line.startsWith('COMMIT|')) { if (cur) commits.push(cur); const [, h, d, ...s] = line.split('|'); cur = { h, d, s: s.join('|'), files: [] }; }
  else if (line.trim() && cur) cur.files.push(line.trim());
}
if (cur) commits.push(cur);
for (const c of commits) {
  const bid = extractLeadingBatchId(c.s); if (!bid) continue;
  const code = c.files.some((f) => CODE_PREFIXES.some((p) => f.startsWith(p)));
  const w = win.get(bid) || { lastCode: null }; const t = Date.parse(c.d);
  if (code && (w.lastCode === null || t > w.lastCode)) w.lastCode = t;
  win.set(bid, w);
}
const last = commits[commits.length - 1];
const windowSpan = `${last.h.slice(0, 9)} ${last.d} -> ${commits[0].h.slice(0, 9)} ${commits[0].d}`;

// ── the tick's plan step, as a pure function of the two reads (§1.1, item 4) ─
// An EMPTY completion listing is unreadable, not "no reports": FREEZE, like an unreadable plan.
function planStep(text, names) {
  let join;
  try { join = parsePlan(text); } catch (e) { return { unreadable: `plan: ${e.message}`, legs: [], verifyOrphan: () => false }; }
  if (!names || names.length === 0) return { unreadable: 'Batch Completion listing empty', legs: [], verifyOrphan: () => false };
  const ids = new Map();
  for (const r of join.s4) if (r.id) (ids.get(r.id) || ids.set(r.id, { s4: [], s5: [] }).get(r.id)).s4.push(r);
  for (const r of join.s5) if (r.id) (ids.get(r.id) || ids.set(r.id, { s4: [], s5: [] }).get(r.id)).s5.push(r);
  const legs = [];
  for (const [id, l] of ids) {
    const reps = findGlob(id, names, DOCS.completion_report.match); if (!reps.length) continue;
    if (l.s4.length > 1) legs.push({ id, leg: 's4', fail: true, why: 'ambiguous' });
    else if (l.s4.length === 1) { const r = l.s4[0]; const sf = statusFails(r.status), rf = !reps.some((n) => namesFile(r.report, n)); legs.push({ id, leg: 's4', fail: sf || rf, why: [sf && 'status', rf && 'report'].filter(Boolean).join('+') }); }
    if (l.s5.length > 1) legs.push({ id, leg: 's5', fail: true, why: 'ambiguous' });
    else if (l.s5.length === 1) { const rf = !reps.some((n) => namesFile(l.s5[0].closes, n)); legs.push({ id, leg: 's5', fail: rf, why: rf ? 'report' : '' }); }
  }
  const failing = new Set(legs.filter((x) => x.fail).map((x) => `${x.id}:${x.leg}`));
  return { unreadable: null, legs, verifyOrphan: (bid, leg) => !failing.has(`${bid}:${leg}`) };
}

// ── grade (form C on §5) ──────────────────────────────────────────────────
const step = planStep(planText, bcNames);
const ids = new Map();
for (const r of plan.s4) if (r.id) (ids.get(r.id) || ids.set(r.id, { s4: [], s5: [] }).get(r.id)).s4.push(r);
for (const r of plan.s5) if (r.id) (ids.get(r.id) || ids.set(r.id, { s4: [], s5: [] }).get(r.id)).s5.push(r);
const graded = [];
for (const [id, legs] of ids) {
  const reports = findGlob(id, bcNames, DOCS.completion_report.match);
  if (!reports.length) continue;
  const adds = reports.map((n) => ({ n, ...firstAdd(BC, n) }));
  const compMs = Math.min(...adds.map((a) => a.ms));
  const scopes = findGlob(id, scNames, DOCS.scope.match);
  const scopeMs = scopes.length ? Math.max(...scopes.map((n) => firstAdd('Claude Comms and Packages/Scope Files', n).ms)) : null;
  const reopened = scopeMs != null && scopeMs > compMs;
  const w = win.get(id);
  const anchoredLast = w ? (reopened ? w.lastCode : compMs) : null;
  const tickEnrolled = Boolean(w) && anchoredLast !== null && anchoredLast >= CUTOFF;
  const r = { id, reports: adds, inWindow: Boolean(w), tickEnrolled };
  if (legs.s4.length === 0) r.s4 = 'not-required';
  else if (legs.s4.length > 1) r.s4 = { fail: true, why: `ambiguous: ${legs.s4.map((x) => `row ${x.rowNo} L${x.lineNo}`).join(', ')}` };
  else { const row = legs.s4[0]; const sf = statusFails(row.status), rf = !reports.some((n) => namesFile(row.report, n));
    r.s4 = { fail: sf || rf, row: row.rowNo, lineNo: row.lineNo, status: row.status, report: row.report, statusFail: sf, reportFail: rf }; }
  if (legs.s5.length === 0) r.s5 = 'not-present';
  else { const row = legs.s5[0]; r.s5 = { lineNo: row.lineNo, closes: row.closes, count: legs.s5.length, A_presenceFails: true, B_emptyFails: EMPTY(row.closes), C_mustNameReport: !reports.some((n) => namesFile(row.closes, n)) }; }
  graded.push(r);
}

// ── print ─────────────────────────────────────────────────────────────────
const s4ids = plan.s4.filter((r) => r.id);
console.log(`REF ${REF} (${git(['rev-parse', REF]).trim()})  plan ${PLAN}`);
console.log(`§4 headers ${plan.headers4.length} at lines ${plan.headers4.join(',')}; all exact`);
console.log(`§4 rows (7-cell) ${plan.s4.length}; with parseable batch-cell id ${s4ids.length}; distinct ids ${new Set(s4ids.map((r) => r.id)).size}`);
console.log(`malformed: ${JSON.stringify(plan.malformed)}`);
console.log(`other §4 table lines: ${JSON.stringify(plan.other4)}`);
console.log(`§5 rows ${plan.s5.length}; with parseable id ${plan.s5.filter((r) => r.id).length}: ${plan.s5.map((r) => `${r.id ?? 'null'}@L${r.lineNo}`).join(' ')}`);
console.log(`ids in >1 §4 row or >1 §5 row: ${JSON.stringify([...ids].filter(([, l]) => l.s4.length > 1 || l.s5.length > 1).map(([i]) => i))}`);
console.log(`Batch Completion entries ${bcNames.length}; window ${windowSpan}`);
console.log(`plan ids with a completion-named file: ${graded.length}`);
for (const g of graded) {
  console.log(`\n${g.id} inWindow=${g.inWindow} tickEnrolled=${g.tickEnrolled}`);
  for (const a of g.reports) console.log(`   report ${a.n} first-add ${a.iso} ${a.sha}`);
  console.log('   s4: ' + JSON.stringify(g.s4));
  console.log('   s5: ' + JSON.stringify(g.s5));
}
const lf = step.legs.filter((x) => x.fail);
console.log(`\nLIVENESS rows4=${plan.s4.length} rows5=${plan.s5.length} ids=${ids.size} graded=${graded.length} legs=${step.legs.length} fail=${lf.length} malformed=${plan.malformed.length}`);
console.log(`FAIL legs: ${lf.map((x) => `${x.id}:${x.leg}(${x.why})`).join(' ')}`);

// ── controls on the predicate ─────────────────────────────────────────────
const X = 'B_X_COMPLETION_REPORT.md';
const ctl = [
  ['status QUEUED', statusFails('QUEUED'), true],
  ['status **QUEUED**', statusFails('**QUEUED**'), true],
  ['status empty', statusFails(''), true],
  ['status —', statusFails('—'), true],
  ["status QUEUED — next in CC-A's list", statusFails("QUEUED — next in CC-A's list"), false],
  ['status DONE — decided', statusFails('DONE — decided'), false],
  ['status queued (lower)', statusFails('queued'), false],
  ['report full path', namesFile('`Claude Comms and Packages/Batch Completion/B_GOV_REPORTING_COMPLETION_REPORT.md`', 'B_GOV_REPORTING_COMPLETION_REPORT.md'), true],
  ['report dir-relative', namesFile('`Batch Completion/B_X_COMPLETION_REPORT.md`', X), true],
  ['report bare', namesFile(X, X), true],
  ['report md link', namesFile('[report](../Claude Comms and Packages/Batch Completion/B_X_COMPLETION_REPORT.md)', X), true],
  ['report backticked + sentence dot (r2)', namesFile('report: `B_X_COMPLETION_REPORT.md`.', X), true],
  ['report bare + sentence dot at cell end (r2)', namesFile('B_X_COMPLETION_REPORT.md.', X), true],
  ['report + dot + bold close (r2)', namesFile('**`Batch Completion/B_X_COMPLETION_REPORT.md`.**', X), true],
  ['report + dot + space + text (r2)', namesFile('B_X_COMPLETION_REPORT.md. Closed.', X), true],
  ['report —', namesFile('—', X), false],
  ['report progress file', namesFile('B_X_PROGRESS_REPORT.md', X), false],
  ['report prefixed neighbour', namesFile('OLD_B_X_COMPLETION_REPORT.md', X), false],
  ['report suffix neighbour .bak', namesFile('B_X_COMPLETION_REPORT.md.bak', X), false],
  ['report suffix neighbour .md.2 (r2)', namesFile('B_X_COMPLETION_REPORT.md.2', X), false],
  ['report suffix neighbour .md_x (r2)', namesFile('B_X_COMPLETION_REPORT.md_x', X), false],
  ['report no extension', namesFile('B_X_COMPLETION_REPORT', X), false],
  ["r1 rule on backticked + dot (the reader's case)", namesFileR1('report: `B_X_COMPLETION_REPORT.md`.', X), false],
];
console.log('\nCONTROLS');
for (const [n, got, want] of ctl) console.log(`${got === want ? 'ok ' : 'BAD'} ${n}: got ${got} want ${want}`);

// population control for item 1: every report citation in the predecessor plan, tested on its own line
{
  const t = git(['show', `${REF}:1-system-manual/PHASE_19_PLAN.md`]).split('\n');
  let n = 0, r1 = 0, r2 = 0; const r1miss = [];
  t.forEach((line, i) => { for (const m of line.matchAll(/[A-Za-z0-9_]*COMPLETION_REPORT[A-Za-z0-9_]*\.md/g)) {
    n++; if (namesFileR1(line, m[0])) r1++; else r1miss.push(i + 1); if (namesFile(line, m[0])) r2++; } });
  console.log(`\nPHASE_19_PLAN report citations ${n}: named under r1 rule ${r1}, under r2 rule ${r2}; r1 misses at lines ${r1miss.join(',')}`);
}

// FREEZE control for item 4 (pure; no git)
{
  const e = planStep(planText, []);
  const u = planStep('', bcNames);
  console.log(`\nFREEZE empty listing: unreadable=${JSON.stringify(e.unreadable)} legs=${e.legs.length} verifyOrphan(B-WS-SUBSCRIBE-CLASS-FILTER,s4)=${e.verifyOrphan('B-WS-SUBSCRIBE-CLASS-FILTER', 's4')}`);
  console.log(`FREEZE empty plan:    unreadable=${JSON.stringify(u.unreadable)} legs=${u.legs.length} verifyOrphan=${u.verifyOrphan('B-WS-SUBSCRIBE-CLASS-FILTER', 's4')}`);
  console.log(`control, readable:    unreadable=${step.unreadable} verifyOrphan(failing leg)=${step.verifyOrphan('B-WS-SUBSCRIBE-CLASS-FILTER', 's4')} verifyOrphan(id not graded)=${step.verifyOrphan('B-NOT-IN-PLAN', 's4')}`);
}

// item 2: §5 lines against the generator's hard-coded tuples (read from the blob, never run)
{
  const py = git(['show', `${REF}:scripts/inventory/plan_doc.py`]).split('\n');
  const tuples = [...py.slice(118, 122).join('\n').matchAll(/\("([^"]*)", "([^"]*)", "([^"]*)"\)/g)].map((m) => `| ${m[1]} | ${m[2]} | ${m[3]} |`);
  const pl = planText.split('\n').map((l) => l.replace(/\r$/, ''));
  const s5lines = plan.s5.map((r) => pl[r.lineNo - 1]);
  const same = s5lines.filter((l, i) => l === tuples[i]).length;
  console.log(`\n§5 vs plan_doc.py:119-122 tuples: generator ${tuples.length}, plan ${s5lines.length}, byte-identical in order ${same}`);
}

// minor (C4): what B-GRID-REPRESENTABILITY's file regex would match
{
  const re = batchIdToFileRegex('B-GRID-REPRESENTABILITY');
  for (const n of ['F_G_1_PROGRESS_REPORT.md', 'F_G_1_COMPLETION_REPORT.md', 'F_G_1_REOPEN_COMPLETION_REPORT.md',
    'F_G_1_REOPEN_B_GRID_REPRESENTABILITY_COMPLETION_REPORT.md', 'F_G_1_B_GRID_REPRESENTABILITY_COMPLETION_REPORT.md', 'B_GRID_REPRESENTABILITY_COMPLETION_REPORT.md'])
    console.log(`B-GRID-REPRESENTABILITY regex vs ${n}: ${re.test(n)}`);
  console.log(`extractLeadingBatchId('F-G-1 / B-GRID-REPRESENTABILITY')=${extractLeadingBatchId('F-G-1 / B-GRID-REPRESENTABILITY')}; ('B-GRID-REPRESENTABILITY / F-G-1')=${extractLeadingBatchId('B-GRID-REPRESENTABILITY / F-G-1')}`);
}
````

### A.2 Output — `node predicate.mjs 05af099da C:/DawnTraderV3-old`, complete and unedited

````text
REF 05af099da (05af099da2ad4f75b7345bacf89d0cd650b75181)  plan 1-system-manual/SPRINT_TO_LIVE_PLAN.md
§4 headers 10 at lines 78,110,147,209,238,276,283,297,316,339; all exact
§4 rows (7-cell) 221; with parseable batch-cell id 105; distinct ids 105
malformed: [{"section":4,"rowNo":"138a","lineNo":256,"cellCount":8}]
other §4 table lines: []
§5 rows 7; with parseable id 5: null@L352 B-FEED-MISMATCH-FIX@L353 B-REACH-BASELINE-ADJUST@L354 B-XSTOCK-FEE-CONTRACT@L355 null@L356 B-DEPLOY-DRIFT-LINE@L357 B-INSTRUMENTS-OVER-RULES@L358
ids in >1 §4 row or >1 §5 row: []
Batch Completion entries 329; window 2adbe4261 2026-09-28T22:46:07+02:00 -> 05af099da 2026-09-30T04:48:55+02:00
plan ids with a completion-named file: 6

B-WS-SUBSCRIBE-CLASS-FILTER inWindow=false tickEnrolled=false
   report B_WS_SUBSCRIBE_CLASS_FILTER_COMPLETION_REPORT.md first-add 2026-07-23T01:58:36+02:00 3f85a607b
   s4: {"fail":true,"row":"35","lineNo":129,"status":"QUEUED","report":"—","statusFail":true,"reportFail":true}
   s5: "not-present"

B-RTB-REFRESH-CONSOLIDATE inWindow=false tickEnrolled=false
   report B_RTB_REFRESH_CONSOLIDATE_OBJ1_COMPLETION_REPORT.md first-add 2026-07-23T00:07:56+02:00 40004ddb3
   s4: {"fail":true,"row":"55","lineNo":155,"status":"QUEUED","report":"—","statusFail":true,"reportFail":true}
   s5: "not-present"

B-COST-MATH-CONSOLIDATION inWindow=false tickEnrolled=false
   report B_COST_MATH_CONSOLIDATION_COMPLETION_REPORT.md first-add 2026-07-30T04:11:31+02:00 7d3e3e6f2
   s4: {"fail":true,"row":"87","lineNo":189,"status":"QUEUED","report":"—","statusFail":true,"reportFail":true}
   s5: "not-present"

B-REACH-BASELINE-ADJUST inWindow=true tickEnrolled=true
   report B_REACH_BASELINE_ADJUST_COMPLETION_REPORT.md first-add 2026-09-29T15:40:20+02:00 07c806722
   s4: "not-required"
   s5: {"lineNo":354,"closes":"✅ closed 2026-09-29","count":1,"A_presenceFails":true,"B_emptyFails":false,"C_mustNameReport":true}

B-XSTOCK-FEE-CONTRACT inWindow=true tickEnrolled=true
   report B_XSTOCK_FEE_CONTRACT_COMPLETION_REPORT.md first-add 2026-09-12T04:59:24+04:00 b6ade3d40
   s4: "not-required"
   s5: {"lineNo":355,"closes":"21 days from 2026-09-11","count":1,"A_presenceFails":true,"B_emptyFails":false,"C_mustNameReport":true}

B-DEPLOY-DRIFT-LINE inWindow=false tickEnrolled=false
   report B_DEPLOY_DRIFT_LINE_COMPLETION_REPORT.md first-add 2026-09-09T14:04:50+04:00 8e7e1ba9c
   s4: "not-required"
   s5: {"lineNo":357,"closes":"observation window open","count":1,"A_presenceFails":true,"B_emptyFails":false,"C_mustNameReport":true}

LIVENESS rows4=221 rows5=7 ids=110 graded=6 legs=6 fail=6 malformed=1
FAIL legs: B-WS-SUBSCRIBE-CLASS-FILTER:s4(status+report) B-RTB-REFRESH-CONSOLIDATE:s4(status+report) B-COST-MATH-CONSOLIDATION:s4(status+report) B-REACH-BASELINE-ADJUST:s5(report) B-XSTOCK-FEE-CONTRACT:s5(report) B-DEPLOY-DRIFT-LINE:s5(report)

CONTROLS
ok  status QUEUED: got true want true
ok  status **QUEUED**: got true want true
ok  status empty: got true want true
ok  status —: got true want true
ok  status QUEUED — next in CC-A's list: got false want false
ok  status DONE — decided: got false want false
ok  status queued (lower): got false want false
ok  report full path: got true want true
ok  report dir-relative: got true want true
ok  report bare: got true want true
ok  report md link: got true want true
ok  report backticked + sentence dot (r2): got true want true
ok  report bare + sentence dot at cell end (r2): got true want true
ok  report + dot + bold close (r2): got true want true
ok  report + dot + space + text (r2): got true want true
ok  report —: got false want false
ok  report progress file: got false want false
ok  report prefixed neighbour: got false want false
ok  report suffix neighbour .bak: got false want false
ok  report suffix neighbour .md.2 (r2): got false want false
ok  report suffix neighbour .md_x (r2): got false want false
ok  report no extension: got false want false
ok  r1 rule on backticked + dot (the reader's case): got false want false

PHASE_19_PLAN report citations 57: named under r1 rule 45, under r2 rule 57; r1 misses at lines 33,43,43,204,223,238,346,577,600,604,605,606

FREEZE empty listing: unreadable="Batch Completion listing empty" legs=0 verifyOrphan(B-WS-SUBSCRIBE-CLASS-FILTER,s4)=false
FREEZE empty plan:    unreadable="plan: plan empty or absent" legs=0 verifyOrphan=false
control, readable:    unreadable=null verifyOrphan(failing leg)=false verifyOrphan(id not graded)=true

§5 vs plan_doc.py:119-122 tuples: generator 7, plan 7, byte-identical in order 7
B-GRID-REPRESENTABILITY regex vs F_G_1_PROGRESS_REPORT.md: false
B-GRID-REPRESENTABILITY regex vs F_G_1_COMPLETION_REPORT.md: false
B-GRID-REPRESENTABILITY regex vs F_G_1_REOPEN_COMPLETION_REPORT.md: false
B-GRID-REPRESENTABILITY regex vs F_G_1_REOPEN_B_GRID_REPRESENTABILITY_COMPLETION_REPORT.md: true
B-GRID-REPRESENTABILITY regex vs F_G_1_B_GRID_REPRESENTABILITY_COMPLETION_REPORT.md: true
B-GRID-REPRESENTABILITY regex vs B_GRID_REPRESENTABILITY_COMPLETION_REPORT.md: true
extractLeadingBatchId('F-G-1 / B-GRID-REPRESENTABILITY')=null; ('B-GRID-REPRESENTABILITY / F-G-1')=B-GRID-REPRESENTABILITY
````

---

## READER ROUND ON THIS RE-CUT

`REVIEWER r1: object at 05af099da · re-ran the positive control (reproduced: 6 fail legs, 1 malformed) · 7 load-bearing items + 2 minor · re-derived y · changes below, one line each`

Each item was re-derived at `05af099da` with a control before anything was changed; none was declined.
1. **Report test (§1.4):** the right boundary now accepts a trailing `.` unless a name character follows. Measured: 12 of 57 `PHASE_19_PLAN.md` citations are followed by `.`; the r1 rule names 45 of 57, r2 names 57 of 57. Six controls added. The positive control re-run gives the same six FAIL legs and one malformed row.
2. **§5 machine default (§1.5, C2):** the claim "§5 was never machine-defaulted" is withdrawn. `plan_doc.py:119-122` hard-codes all seven lines, and all 7 match the plan byte for byte. Form B′ ("the closes cell still equals the generator's text") is added to the table and to C2 as an option.
3. **`B-XSTOCK-FEE-CONTRACT` (§1.5, R6, C2):** the batch is closed (its report, line 11) and only its windows are open, so form A's FAIL depends on whether §5 lists windows or batches. That question now opens C2. R6 is restated as the window's end; the "later conversion close" has no instance.
4. **Empty completion listing (§1.1, P37, P38, P39 (b″)):** an empty listing is treated as unreadable. That means FREEZE: `gov-planline-unreadable` opens and the orphan verifier returns `() => false`, which stops the resolve-then-reopen flap. Tests and a scratch control are added.
5. **P61 compare sha:** the flip now compares at the `ref=` the P38 liveness line prints, which is the graded ref and not the deployed-HEAD sha at `poller.mjs:543`. P38 now defines `ref=`.
6. **Stale alert bodies (N7, P36, §1.4):** per-leg bodies drop the line number and the failing test, and the reader's reasoning is recorded in N7. The malformed singleton's line numbers are stamped with their ref sha.
7. **§0 count:** §0 now names all eight §5.1 items (C1–C4, N4–N7), not three.
- Minor, **C4 / P4:** row 16's close is likely an `F_G_1_REOPEN_*` report, which `B-GRID-REPRESENTABILITY` does not match (probed). The request to CC-C now covers that report's name.
- Minor, **evidence:** this APPENDIX adds the final script source and its full output at the ref.

⚠️ **NO READER HAS READ THESE r2 CORRECTIONS.** The round above graded r1 at `05af099da`. Everything marked r2 in this document, including the APPENDIX, is the author's own work and has not been re-derived by anyone else.
