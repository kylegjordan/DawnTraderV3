# B-PLAN-CURRENCY-CHECK — OBJ-1 RE-CUT (state check) — audit and plan

**Ref:** every repo object in this document was read at `97aff32b7` (`97aff32b7cbe56dc560bf739df8214ba000ddd75`, 2026-09-30T02:36:15Z), with `git show` / `git grep` / `git log` / `git ls-tree`. Nothing was read from a working tree.
**The plan under test:** `1-system-manual/SPRINT_TO_LIVE_PLAN.md` (the active plan; 378 lines at the ref). Its own obligation, plan:66: *"**The owner updates its row at every batch close** (status + report link), in the same governance turn"*.
**Binding ruling:** scope `B_PLAN_CURRENCY_CHECK_SCOPE.md` §10d (Langston, 2026-09-30T02:33:15Z, re-derived at `9a681d010`). **Prior design:** `B_PLAN_CURRENCY_CHECK_PRE_AUDIT.md` §5.1 (CD-A1…CD-A18) and §6.6 (P31–P39), §6.9 (P61), §6.1 (P4). This document replaces §5.1's diff-specific findings and §6.6's plan items for OBJ-1; it does not edit the pre-audit.
**Status:** DRAFT for Langston. Not committed, not posted. Scratch evidence: `predicate.mjs` and `run_97aff32b7.txt` in this session's scratchpad `recut/` folder (the scratch reimplements the parser and predicate below independently of the checker; it imports only `config.mjs` taken from the ref).

---

## 0. WHAT CHANGED, IN ONE PARAGRAPH

The close-diff rule asked *"did this batch's close change its own plan line?"* and needed a diff read, a lower bound and a window. The ruling replaces it with *"at the ref, does a batch that has a completion report have a current row?"* — a STATE check of plan:66. There is no diff, no bound, no window and no first-add gate, so the pre-audit's bound machinery (P35), its diff reader (P34's `readPlanIo`, `parsePlanDiff`) and the questions about them dissolve. What remains is a parser (P33, nearly unchanged), a predicate, keys, a tick wiring, a flag and a preview. **Three things in this document need Langston before Step 3** (§5.1): the ruling's literal trigger reaches none of today's failing rows (C1), the §5 leg is unreachable under that trigger and has no machine default to fail on (C2, C3), and row 16's parseable id does not make row 16 gradable (C4).

---

## 1. THE PREDICATE, SPECIFIED EXACTLY

### 1.1 Reads (two per tick, both at `GOV_REF`, both existing readers)

| read | function at the ref | failure |
|---|---|---|
| the plan text | `showFile(PLAN_LINE.path)` (`checker.mjs:57-63`) — `git show GOV_REF:<path>`, returns `null` when absent | `null`, empty, or any parse throw (§1.2) ⇒ **fail-closed**: `gov-planline-unreadable`, nothing graded, no per-batch key opened or resolved |
| the Batch Completion listing | `lsTreeNames(DOCS.completion_report.dir)` (`checker.mjs:48-55`), read ONCE per tick and handed to `findGlobDoc` (P34 adds an optional `names` argument, so there is still one implementation of the filter) | an `ls-tree` failure returns `[]` ⇒ every id reads "no report" ⇒ not graded — the same direction `checkLedgerRows` documents for a failed `ls-tree` (`checker.mjs:217-218`); stated, not changed |

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

For a graded id with **0** §4 rows: **not required** (no key). With **2 or more**: **FAIL — ambiguous**, the body naming every row number and line number (key `…:s4`). With **exactly 1**: FAIL iff the status test OR the report test fails.

**Status test — fail on the machine default only.** `deMark(status)` is **empty**, or is **exactly `QUEUED`**. "Empty" means zero characters, or only dash characters (`—`, `–`, `-`) — the plan's placeholder for an empty cell (it fills 220 of 221 report cells, §2.4). Rules and why:
- **Markup is stripped before comparing** (`**QUEUED**`, `` `QUEUED` `` fail): emphasis around the default is still the default.
- **Case-sensitive** (`queued` passes): the machine wrote upper case (`plan_doc.py:114`, `STATUS.get(k, 'QUEUED')`); a lower-case word was typed by a person, and grading what a person typed is the terminal-token whitelist the ruling forbids.
- **Exact after trim** (`QUEUED — next in CC-A's list`, row 73, passes; `QUEUED — decision (Kyle's; …)`, row 9f, passes): anything beyond the bare token is a hand statement. ⚠️ Row 73's text was itself machine-written from `plan_doc.py`'s `STATUS` table (:44-46), as were six in-flight statuses (`IN FLIGHT — Step 7`, `BUILT — deploy after 2026-09-30` ×2, `REOPENED — Step 3`, `IN FLIGHT — 8a-P4c window…`, `IN FLIGHT — half live`). They pass the status test by construction; **the report test is what catches them** at close (§1.5).
- **No terminal token is read.** `DONE`, `CLOSED`, `✅` are never looked for.

**Report test — the cell must name a file `findGlobDoc` resolved.** PASS iff, for some basename `n` in the resolved set, `n` occurs in `deMark(report)` bounded on both sides by a character that is not `[A-Za-z0-9_.-]` (or the cell edge). That is a **basename match**. Chosen from how reports are cited at the ref:

| where | full repo path | `Batch Completion/…` | bare basename | markdown link |
|---|---:|---:|---:|---:|
| `SPRINT_TO_LIVE_PLAN.md` (any cell) | 1 (§0 plan:11, `B_GOV_REPORTING_COMPLETION_REPORT.md`) | 0 | 0 | 0 |
| `PHASE_19_PLAN.md` (the predecessor plan, whose rows carried report links) | 0 | 6 | 51 | 0 |

(Occurrences of `…COMPLETION_REPORT….md`, classified by the prefix before the basename, perl over `git show`; markdown links `](` counted in both plans: 0 and 0, control `BATCH_CATALOG.md` 48 lines.) A path rule would fail the form used 51 of 57 times in the plan this one replaced; the basename is unique because every resolved file sits in the one `Batch Completion/` directory. A markdown link passes because its target ends in the basename followed by `)`.
**Controls (all run in the scratch, all as expected):** full path, `Batch Completion/`-relative, bare, and `[report](…/B_X_COMPLETION_REPORT.md)` → pass; `—`, `B_X_PROGRESS_REPORT.md`, `OLD_B_X_COMPLETION_REPORT.md`, `B_X_COMPLETION_REPORT.md.bak`, `B_X_COMPLETION_REPORT` (no extension) → fail.
**Several resolved files:** any one named passes (the obligation is "report link", singular). At the ref **0** plan ids resolve more than one completion-named file, so this is unexercised today.

### 1.5 The §5 leg (⚠️ C2 and C3, needs Langston)

§5's header is `| item | owner | closes |` — no status cell and no report cell. A state rule needs something in the line that a close must change. Three forms, all computed at the ref over the three graded §5 ids:

| form | rule for a graded id present in §5 | `B-REACH-BASELINE-ADJUST` L354 `✅ closed 2026-09-29` | `B-XSTOCK-FEE-CONTRACT` L355 `21 days from 2026-09-11` | `B-DEPLOY-DRIFT-LINE` L357 `observation window open` |
|---|---|---|---|---|
| **A — presence is stale** | FAIL while the id is in §5 at all (removal is the end state the Step-1 ruling named) | FAIL | FAIL — **false**: its window is genuinely open; it filed a completion-named report when observation OPENED (report heading *"COMPLETION REPORT"*, first-added 2026-09-12T00:59:24Z, `b6ade3d40`; §0:20 *"FINISH: convert at close"*) | FAIL — true |
| **B — machine default only** | FAIL iff the `closes` cell is empty. §5 was never machine-defaulted, so this is the ruling's principle applied literally | pass | pass | **pass — misses the one known stale line** (closed 2026-09-09; report heads *"✅ CLOSED 2026-09-09"*; §0:15 records that this line "read 'observation window' in error") |
| **C — the report link, on §5 too (recommended)** | FAIL iff the `closes` cell does not name a resolved file (the §1.4 report test on the `closes` cell) | FAIL — marked closed, no link (the §3 obligation is *status + report link*) | FAIL — until the owner adds the link to the report it already filed (one edit); after that it passes for the rest of the window | FAIL — true |

**Recommendation: C.** It reads no status word, it cannot be satisfied by a stale in-flight phrase, it grades the half of plan:66 that §5 can carry, and it gives the observation-at-open shape a one-edit, truthful way to pass. **Its residual (the same one the diff design had, R1-Q11):** once a window-at-open batch links its report, the later conversion close — when the line actually goes stale — is never seen, because nothing in the line has to change. Census list (f) (*"any plan line … not marked closed while its batch already has a completion-named file"*) is the only reader of that shape.
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

**Instrument:** the scratch `predicate.mjs`, run at `97aff32b7` (output `run_97aff32b7.txt`). It implements §1.2–§1.5 directly; for "has a report" it uses the checker's own matcher — `batchIdToFileRegex(bid)` (`config.mjs:79-87`) AND `DOCS.completion_report.match` (`/COMPLETION|COMPLETE/i`, `config.mjs:106`) over `git ls-tree 97aff32b7 "Claude Comms and Packages/Batch Completion/"` (329 entries) — i.e. `findGlobDoc`'s filter (`checker.mjs:96-102`). First-add (printed for information, not used by the rule) is `git log 97aff32b7 --diff-filter=A --reverse` as `firstAddCommitMs` computes it (`checker.mjs:130-139`). Tick enrolment is replicated from `poller.mjs:44-67`, `:100-106` and `:86-88` with the box's `GOV_CUTOFF` 2026-06-24T12:07:01Z.

**Population:** every id parsed from a §4 batch cell (221 seven-cell rows; 105 with a parseable id, 105 distinct) or a §5 item cell (7 lines; 5 parseable). **6** of those ids have a completion-named file. No id is in two §4 rows or two §5 lines. One §4 row is malformed: **row 138a, line 256, 8 cells** (the stray `SUPERSEDED:` cell).

**Predicate controls** (run before trusting the population result): 7 status cases and 9 report-cell cases, all as expected — listed in §1.4.

### 2.1 Result

| id | leg | line | status / closes cell | report cell | status test | report test | verdict | tick-enrolled today? |
|---|---|---|---|---|---|---|---|---|
| `B-WS-SUBSCRIBE-CLASS-FILTER` | s4 row 35 | 129 | `QUEUED` | `—` | fail | fail | **FAIL** | no (not in window) |
| `B-RTB-REFRESH-CONSOLIDATE` | s4 row 55 | 155 | `QUEUED` | `—` | fail | fail | **FAIL** | no |
| `B-COST-MATH-CONSOLIDATION` | s4 row 87 | 189 | `QUEUED` | `—` | fail | fail | **FAIL** | no |
| `B-REACH-BASELINE-ADJUST` | s5 | 354 | `✅ closed 2026-09-29` | — | — | — | A FAIL · B pass · **C FAIL** | yes (no §4 row) |
| `B-XSTOCK-FEE-CONTRACT` | s5 | 355 | `21 days from 2026-09-11` | — | — | — | A FAIL · B pass · **C FAIL** | yes (no §4 row) |
| `B-DEPLOY-DRIFT-LINE` | s5 | 357 | `observation window open` | — | — | — | A FAIL · B pass · **C FAIL** | no |

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
- **Row 16 — the dual form.** The governed artifacts write it F-G first: `BATCH_CATALOG.md:728` *"### F-G-1 / B-GRID-REPRESENTABILITY"*, `PHASE_HISTORY.md:1076` *"F-G-1 / B-GRID-REPRESENTABILITY"*, the progress report H1 *"# F-G-1 / B-GRID-REPRESENTABILITY"*, the pre-audit H1 *"# F-G-1 — B-GRID-REPRESENTABILITY"*; the alias is `unify.py:18` `"B-GRID-REPRESENTABILITY": "F-G-1"`. **That order does not parse** (`extractLeadingBatchId('F-G-1 / B-GRID-REPRESENTABILITY')` → `null`, leading-token rule). The parseable dual form is the same pair reversed: batch cell **`B-GRID-REPRESENTABILITY / F-G-1`** → `B-GRID-REPRESENTABILITY` (probe run on the ref's `config.mjs`). ⚠️ **C4:** that id is parseable but NOT gradable — `batchIdToFileRegex('B-GRID-REPRESENTABILITY')` matches neither `F_G_1_PROGRESS_REPORT.md` nor a future `F_G_1_COMPLETION_REPORT.md`; it DOES match `F_G_1_B_GRID_REPRESENTABILITY_COMPLETION_REPORT.md` and `B_GRID_REPRESENTABILITY_COMPLETION_REPORT.md` (probes). 0 commit subjects lead with `B-GRID-REPRESENTABILITY` (control: 65 lead with `F-G-1`) — irrelevant under plan enrolment, fatal under the literal trigger. So Q1(b)'s condition is met in form; **in effect, row 16 grades only if CC-C names the conversion report with the B- form in its filename** (e.g. `F_G_1_B_GRID_REPRESENTABILITY_COMPLETION_REPORT.md`), or when `#1116` lands. Proposed: P4 writes the reversed dual form, and CC-C is asked (not told) to carry both forms in the conversion's filename; Langston rules whether that request is enough (§5.1).
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
- **Tests:** the 16 predicate controls of §1.4 as unit cases; a graded id with one row `QUEUED`/`—` → s4 fail with both reasons; the same with `DONE — x` + the basename → pass; `QUEUED — next …` + the basename → pass; `BUILT — …` + `—` → fail on the report test only; an id in two §4 rows → s4 fail ambiguous naming both; an id with no report → no legs; an id in §5 only → s5 leg only; §5 form-C cases (closes cell with and without the basename); two §5 lines → s5 ambiguous.
- **falls out of:** §1.3–§1.6, §2.1.

**P35 · the lower bound — DROPPED.** No bound exists in a state check (ruling: *"P35 … go[es] away"*). CD-A1, CD-A2, CD-A4, CD-A7 and the `_leads`/`planBound` design have no successor.

**P36 · the decision — AMENDED (its own pure function, not a block inside `decideAlerts`)**
- **Files and lines:** `poller.mjs`, a new exported `decidePlanLineAlerts(legs, malformed, na, { enabled })` → `{ toOpen, toResolveKeys }`, placed after `decideAlerts` (:218-344). **Not** block (3c) inside `decideAlerts`' per-batch loop: that loop iterates the window's enforceable batches (C1), which is exactly the population the plan enrolment replaces. The tick merges its intents into the existing add/resolve loops (:672-681).
- **Behaviour:** `enabled` false ⇒ `{[],[]}` — **FREEZE** (Q16): nothing opened, nothing resolved. Otherwise each failing leg opens its key (`warning`, through the same `sev()` shadow wrapper) with a body naming the row number, line number and which test failed; each passing required leg, or `na.has(bid+':plan_line')`, resolves its key; `malformed` non-empty opens `gov-planline-malformed`, empty resolves it.
- **Tests:** flag off → no intents for any `gov-planline` key; fail → open; pass → resolve; na-skip → resolve; malformed → the singleton with every line number and cell count in the body; empty malformed → resolve.
- **falls out of:** §1.3, §1.6; Q15, Q16.

**P37 · the orphan branch — AMENDED (per-leg regex; the verifier re-reads the plan's state)**
- **Files and lines:** `decideOrphanSweep` (`poller.mjs:163-197`): a 6th parameter `verifyPlanLine = () => false` and, before `// other orphan key types are not swept here` (:194), `/^gov-planline:(.+):(s4|s5)$/`. An open per-leg key this tick's `decidePlanLineAlerts` did not touch (its id left the plan, lost its report, or its leg stopped being required) is RESOLVED iff `verifyPlanLine(bid, leg)` is true — the leg is not required, or passes, at the ref — else KEPT. `makeVerifyPlanLine(naConfirmed, join, reportsFor)` beside `makeVerifyLedgerRow` (:206-208). When the flag is off or the plan is unreadable, the tick passes `() => false` (FREEZE).
- **Why an orphan branch still exists:** with plan enrolment there is no window to age out of, but an id can leave the plan (row deleted or re-pointed) with its key open. Resolving it is verified at the ref, not blind; the price is that deleting a row clears its alert (residual R3).
- **Tests:** untouched key, id gone from the plan → resolve; untouched key, leg still failing (defensive) → keep; no verifier → keep; the singletons are not matched; an `s5` key after the §5 line is removed → resolve.
- **falls out of:** §1.6; CD-A16 (the per-leg regex hazard, kept).

**P38 · the tick wiring and the liveness line — AMENDED**
- **Files and lines:** `poller.mjs` tick, after the rulebook block (:634-654) and before `decideAlerts` (:670), **only when `PLAN_LINE.enabled`**: `const text = showFile(PLAN_LINE.path)`; `join = planRowsByBatch(text)` in a `try`; on `null`/throw → open `gov-planline-unreadable` (`warning`, the :638-645 idiom), grade nothing, pass `() => false` to the orphan branch; on success → resolve that singleton (:651-654 idiom), `names = lsTreeNames(DOCS.completion_report.dir)`, `legs = checkPlanState(join, (bid) => findGlobDoc(bid, 'completion_report', names).map(basename))`. Other rules continue when the plan read fails. **Malformed body freezing:** the checker dedupes in its own table and never rewrites a body, so a second malformed row arriving while the singleton is open would be invisible (`#572`); the tick stores a signature of the malformed list in state and, when it changes while open, resolves and re-opens — the fetch-fail escalation idiom (:559-563).
- **Liveness line** (only when enabled and the read succeeds): `[gov-checker] planline: enabled ref=<gradedRefSha> rows4=<n> rows5=<n> ids=<n> graded=<n> legs=<n> fail=<n> malformed=<n>`. A pure function of the two reads, so an offline P39 run at the same sha reproduces it. **Expected at `97aff32b7`** (from §2): `rows4=221 rows5=7 ids=110 graded=6 legs=6 fail=6 malformed=1` under form C. *(`ids` = 105 §4 + 5 §5 parseable, no overlap.)* `DRIFT_LOADED_FILES` (:521) already covers the three files.
- **Tests:** the pure `decidePlanReadAlert({enabled, readOk, openId})` of the pre-audit, kept; the malformed-signature re-open as a pure unit.
- **falls out of:** §1.1, §1.2, §2; CD-A8.

**P39 · the preview — AMENDED (it can now show live fails)**
- **What:** `scripts/governance-checker/plan-lines-preview.mjs`, calling the SAME `planRowsByBatch` / `checkPlanState` the tick calls, with `--ref <sha>` (reads at that ref) or `--plan-file <path>` (a fixture text; the Batch Completion listing still at `--ref`). Prints the liveness counts, every graded leg with its verdict and reasons, and `malformed`. No `--gate` (nothing is timed).
- **Run 1 — live positive control, pre-registered from §2 (a second implementation must agree with the scratch):** `--ref 97aff32b7` ⇒ FAIL `B-WS-SUBSCRIBE-CLASS-FILTER:s4` (row 35 L129, status+report), `B-RTB-REFRESH-CONSOLIDATE:s4` (row 55 L155, status+report), `B-COST-MATH-CONSOLIDATION:s4` (row 87 L189, status+report); under form C also `B-REACH-BASELINE-ADJUST:s5` (L354), `B-XSTOCK-FEE-CONTRACT:s5` (L355), `B-DEPLOY-DRIFT-LINE:s5` (L357); malformed = [row 138a, L256, 8 cells]; nothing else graded. Any difference from this list is a defect in one of the two implementations and is investigated before Step 4.
- **Run 2 — the pass branch, at the ref where P4 (and OBJ-9's P9 for `B-DEPLOY-DRIFT-LINE`'s §5 line, and the owners' §5 links) have landed:** pre-registered as rows 35 and 87 PASS (status not default, report named), row 55 PASS if the P12 text landed; the §5 outcomes depend on the texts landed and are written into the change list, per id, before the run. HYPOTHESIS until run: it rests on texts not yet written.
- **Run 3 — the FAILURE branches, fixtures, expected output stated here BEFORE any run (`#744` rider):**
  - **(a) malformed row** — `--plan-file` = the plan at `97aff32b7` unchanged ⇒ `malformed` = exactly `[{section:4,rowNo:'138a',lineNo:256,cellCount:8}]`; row 138a absent from `rows`; no leg for `B-PATTERN-SIZE-CAP-REVIEW`; the tick decision opens `gov-planline-malformed` with body containing `138a`, `256` and `8`. **(a′)** the same text with one extra column appended to the Wave A2 header (plan:147) ⇒ throw ⇒ `gov-planline-unreadable` opens; zero legs; zero per-batch intents; an already-open `gov-planline:*` key is KEPT.
  - **(b) absent plan** — `PLAN_LINE.path` absent at the ref, the shape a rename produces (the plan was renamed once, `4f3668af2`); fixture: the preview's plan reader injected to return `null`, as `showFile` does for an absent path ⇒ `gov-planline-unreadable` opens (`warning`); zero legs; zero per-batch opens or resolves; the orphan verifier returns false for every key. **(b′)** an empty file ⇒ the same.
  - **(c) id in two rows** — the plan at `97aff32b7` with row 36's batch cell (L130, `#506 — batch named at Step 1`) replaced by `B-WS-SUBSCRIBE-CLASS-FILTER` ⇒ `B-WS-SUBSCRIBE-CLASS-FILTER:s4` FAIL with reason *ambiguous: row 35 L129, row 36 L130*; no status/report verdict for either row; every other leg as run 1. **(c′)** the §5 line L353 item replaced by `B-DEPLOY-DRIFT-LINE` ⇒ `B-DEPLOY-DRIFT-LINE:s5` FAIL ambiguous naming L353 and L357.
  - Plus two pass fixtures, so the failure fixtures are not the only verdicts: row 35's status set to `DONE — x` and report to `B_WS_SUBSCRIBE_CLASS_FILTER_COMPLETION_REPORT.md` ⇒ that leg PASS; the same with report `—` ⇒ FAIL on the report test only.
- **falls out of:** §2, §2.2 (2) (no live pass control), §1.2, §1.4, §1.5.

**P61 · the flip — AMENDED**
- **What:** one committed change to `PLAN_LINE.enabled` (no `sinceMs` any more). Never a drop-in environment variable (Q9).
- **Preconditions:** Langston Step 4; P30 (the checker tests in CI) green; P39 runs 1 and 3 committed and matching their pre-registration; **run 1 re-run at the flip commit's parent, and its fail set + malformed list committed as the EXACT expected open set of the first tick**; P13a (row 138a back to 7 cells) landed, or 138a is in that expected set. P4 before the flip is **recommended, not required** — it shrinks the first tick's opens; it no longer protects anything.
- **Verification:** four ticks. Each carries the P38 liveness line with counts equal to the offline P39 run at the sha the tick logged (`poller.mjs:543`); a tick without the line fails the flip. The first tick opens **exactly** the pre-registered keys — no more, no fewer (this is now possible because the live set is non-empty; the diff design could only say "nothing outside the set"). Wall time within the 120 s `TimeoutStartSec` (pre-audit CD-A6 baseline 11.1–11.5 s; the two new reads are unmeasured on the box and are measured here). Then each owner's fix is watched to resolve its key on the next tick — the live pass branch.
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
- **R6 — the observation-at-open conversion** (form C; §1.5). Once linked, the later close is invisible.
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
- **C2 — the §5 leg's form.** A, B or C (§1.5, measured). **Recommendation: C.** B is the ruling's "machine default only" read literally and misses the one known stale §5 line; A false-fails an open window.
- **C3 — the §5 leg's reachability.** Under "exactly ONE §4 row" as the trigger, 0 of 5 §5 ids can ever be graded (none has a §4 row). **Recommendation:** the §5 leg required iff the id is in §5, independent of §4.
- **C4 — row 16.** The parseable dual form (`B-GRID-REPRESENTABILITY / F-G-1`) does not join to any F-G-1 report. Is the Q1(b) condition met by the parse alone, by CC-C naming the conversion report with both forms, or only by `#1116`?
- **N4 — rows 35/87: split, not re-point.** P12's re-pointing makes the positive-control rows pass by losing their id. **Recommendation:** DONE + report on the shipped id, residual on its own lettered row.
- **N5 — row 55 fails** on an OBJ-1-only completion report (§2.2 (1)). **Recommendation:** fix the row's text in P4 (it is stale anyway); do not special-case the sentinel here (`#1099` owns that).
- **N6 — the normalisation choices** in §1.4 (markup stripped; dash-only = empty; case-sensitive; exact after trim) — confirm, since each decides a verdict on a real row.
- **N7 — the malformed singleton's re-open on signature change** (P38) — confirm it over a per-row key (per-row keys on §5 would have to key on a line number that moves with every edit).
