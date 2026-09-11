# B-TASK-LIST-SLOT — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**change-class: non_architecture · owner CC-A · `#1009` · Phase 19, plan row 4.57**
**Scope approved by Langston at `340836b0a` with four conditions; all four applied at `40a1ae5aa`.**
**Step 2 r2 (`4a946bb0b`) APPROVED WITH CONDITIONS by Langston, 2026-09-09T19:37Z — "BUILD THE CHECKER. DO NOT NAME ME AS A SECOND GATE." This is r3: all ten conditions applied, each re-derived at the object before it was applied (§7 records each one).**

---

## 0. ⛔ PREVIOUSLY STATED vs NOW — AT THE TOP, BECAUSE A CLAIM THAT MOVED IS THE MOST DECISION-BEARING THING HERE

> **PREVIOUSLY STATED (scope r1): "no slot-time trigger exists at all." (r2, first draft): "slot time has the strongest mechanism we own." (r2, retraction): "NONE." NOW: A WEAK TRIGGER EXISTS. REASON: `CLAUDE.md:539` states the duty itself in the always-loaded file — *"AND A SLOTTED ITEM ALSO LANDS IN THE OWNING SESSION'S TASK LIST (Kyle 2026-09-05)"* — and its mechanics resolve to `workflow-10-governance`, whose frontmatter gates it `STEP 10 ONLY`. One line in a 588-line file (measured at the ref), pointing at a file that declares itself out of scope for the moment you are in. Weak, real, not absent. (Langston condition 1.)**
> **PREVIOUSLY STATED (scope r1): "the CLOSE-time half works." NOW: 1 of 3, enumerated in §2a. REASON: measured; I had measured nothing.**
> **PREVIOUSLY STATED (r2): the copied-ledger drift is one Tier-1 row wide. NOW: at least THREE rows wide in `B_EXIT_BOOK_AGE_STAMP`. REASON: Langston read the report; I re-derived it with a control (§3).**
> **PREVIOUSLY STATED (r2 P1): "measured blast radius ≈4 immediate alerts." NOW: DROPPED. REASON: it had no stated object or population. The cutoff stands on design grounds; the exact expected-alert set is derived offline at Step 3 and pre-registered before deploy (P1).**
> **PREVIOUSLY STATED (r2 P1): "check `GOV_SHADOW` on the box first", and the cutoff quoted as `2026-06-23`. NOW: the checker ENFORCES (`GOV_SHADOW=0`) and the box cutoff is `GOV_CUTOFF=2026-06-24T12:07:01Z`; `2026-06-23` is only the repo default. REASON: `systemctl show`, 2026-09-11 (§4).**
> **PREVIOUSLY STATED (r2 §5): "slot-time and close-time are the same check." NOW: they are NOT. REASON: my own P2 refuted it forty lines later; §5 is amended in place.**
> **PREVIOUSLY STATED (r2): "the checker for presence + Langston for truth", a pair. NOW: the CHECKER ONLY. REASON: Langston struck his own half (Part Two, rejected candidates).**
> **PREVIOUSLY STATED (r2 residuals): "the folder choice has no precedent either way." NOW: STRUCK — precedent exists on both sides, weighed in P3.**
> **PREVIOUSLY STATED (scope r2): CC-INFRA's 48 KB is non-conforming. NOW: STRUCK (Langston ruling — no cap was ever written). The task-list NAME is ratified at `workflow-10-governance:132`; only the FOLDER was open.**

---

# PART ONE — THE AUDIT

## 1. SOURCES READ (workflow-02's six, named)

1. **The CODE at the ref** — `scripts/governance-checker/{config,checker,poller}.mjs`, `.claude/settings.local.json`, `.claude/skills/workflow-10-governance/SKILL.md`, `.github/workflows/ci.yml`.
2. **RUNTIME** — `systemctl show governance-checker.service` on staging (environment + drop-ins), the live alert store, the checker's 30-minute timer.
3. **`SYSTEM_IMPACT_MAP.md`** — documents per-session MEMORY via the hook layer; **no entry for the task lists.**
4. **`SYSTEM_MANUAL.md`** — silent on session bookkeeping; correctly out of its scope.
5. **THE LEDGER** — `#1009`, `#998`, `#1005`, `#995`, plan rows 4.57 / 4.6, and every completion report added since the task-list row landed.
6. **`bridge/canonical/`** — **consulted, NO coverage of session bookkeeping.** Post-governance machinery with no pre-governance ancestor.

## 2. FINDING A — RESTATED: THE SLOT-TIME TRIGGER IS WEAK, NOT ABSENT

**The object:** `CLAUDE.md:539` (at the ref, file length 588 lines) — *"AND A SLOTTED ITEM ALSO LANDS IN THE OWNING SESSION'S TASK LIST (Kyle 2026-09-05) — the full rule, the three destinations and the plan-is-authority guard live in `workflow-10-governance`'s Tier-1 ledger row, NOT here."*
- **The DUTY is stated in the always-loaded file.** What sits behind the skill is the DETAIL (three destinations, the plan-is-authority guard), not the existence of the duty.
- **The DETAIL resolves to a skill gated `STEP 10 ONLY`** — the one moment a slotting session is least likely to be in.
⇒ **"no slot-time trigger at all" (scope r1, and my r2 retraction) is FALSE. "The strongest mechanism we own" (my r2 first draft) is also FALSE** — that sentence borrowed `CLAUDE.md:34`, whose "this table" is the §0.a eleven-step table, a pointer to a NAMED STEP FILE. §9.4's duty has no step file of its own.

⚠️ **AND MY r2 RETRACTION WAS CORROBORATED WITH THE WRONG KIND OF EVIDENCE.** I cited plan row 4.57 as agreeing with it — **row 4.57 carries the same false claim and I wrote it.** Two artifacts from one author are one source. Row 4.57 is corrected in place in the same commit as this revision.

⇒ **CONSEQUENCE: Kyle's option 1 (a slot-time skill) is argued on the LAYER, not eliminated on "no trigger exists".** The argument is in Part Two.

## 2a. THE CLOSE-TIME EVIDENCE — MEASURED, ENUMERATED

| end | trigger available | outcome |
|---|---|---|
| **SLOT** | **WEAK** — one line at `CLAUDE.md:539`, detail behind a `STEP 10 ONLY` skill | untested; no instrument |
| **CLOSE** | **STRONG** — a named Tier-1 row inside the step file you must open to do the step (`workflow-10-governance:132`) | ⛔ **1 of 3** |

**The population, enumerated rather than counted — every completion report added since the row landed (`bfdd1197f`, 2026-09-05T05:45:00Z), as of r2:**

| report | owner | what it carries |
|---|---|---|
| `B_EXIT_BOOK_AGE_STAMP_COMPLETION_REPORT.md` | CC-C | **absent** — a full two-tier ledger with no task-list row |
| `B_DRIFT_RUNTIME_PREDICATE_COMPLETION_REPORT.md:94` | CC-A | **a prose mention only** — a governance-files sentence, no table row. ⛔ **P1 must FAIL this one.** |
| `B_DEPLOY_DRIFT_LINE_COMPLETION_REPORT.md:209` | CC-A | **the row, correct shape:** `T1 · the four session task lists · ✅ mine / N/A ×3` |

⇒ **A strong trigger existed at close and the outcome still failed. That is the argument for a CHECK at close — and it says nothing about slot time.**

## 3. FINDING B — THE MECHANISM, AND IT IS WIDER THAN r2 SAID

**`B_EXIT_BOOK_AGE_STAMP_COMPLETION_REPORT.md` §7 carries a Tier-1 table, a Tier-2 "judged applicable" table, and a third "judged NOT applicable, stated rather than skipped" section.** Nothing was declined. The report was built carefully — from a copy.
★ **A session writing a completion report COPIES THE LAST COMPLETION REPORT. It does not open the skill.** ⇒ a row added to the skill reaches nobody who copies a predecessor, and the omission is invisible because the copied ledger looks complete.

**Re-derived (Langston's read, confirmed at the ref with a control):** the skill's Tier-1 has **nine** rows (`workflow-10-governance:125-133`); that ledger's Tier-1 table covers **six**. Absent from all three sections:

| Tier-1 row | `workflow-10` line | in `B_EXIT_BOOK_AGE_STAMP` | control: in `B_DEPLOY_DRIFT_LINE` |
|---|---|---|---|
| the four session task lists | `:132` | **absent** | present |
| the SHARED `MEMORY.md` (half of `:128`; only its own `MEMORY_CC_C.md` is listed) | `:128` | **absent** | present |
| Langston's `/home/langston/MEMORY.md` | `:133` | **absent** | present |

⇒ **the copied-ledger drift is at least three Tier-1 rows wide, not one.** This strengthens the mechanism. **P1 scopes to ONE row deliberately and says why (P1).**

## 4. ENTRY-POINT CENSUS — EVERY PLACE A CHECK COULD LIVE, ENUMERATED BEFORE CHOOSING

| # | entry point | when / where | can it COMPARE document vs requirement? | one version for every session? |
|---|---|---|---|---|
| 1 | **`governance-checker`** | staging, every 30 min, reads **at the ref**, mints alerts | ✅ **already does** — `findEntryDoc` reads CONTENT (`checker.mjs:105`) | ✅ one install, grades the BRANCH |
| 2 | Claude Code hooks | laptop, per clone; arm at session start | ✅ could | ⛔ **no** — four clones run the version their last session start refreshed (`B-HOOK-ESTATE-VERSION`) |
| 3 | CI (`ci.yml`) | on push | ✅ could | ✅ yes |
| 4 | Langston at Step 11 | on dispatch | human judgement | ⚠️ only when dispatched |

**THE CHECKER'S LIVE STATE, re-derived on the box 2026-09-11 (condition 4):**
- `governance-checker.service` Environment: **`GOV_SHADOW=0 GOV_CUTOFF=2026-06-24T12:07:01Z`**, set by the drop-in `/etc/systemd/system/governance-checker.service.d/go-live.conf`. The repo unit's `GOV_SHADOW=1` is overridden. ⇒ **the checker is ENFORCING: a miss mints a real alert, not a shadow-log line** (`config.mjs:207`: `SHADOW_MODE = process.env.GOV_SHADOW !== '0'`).
- **Positive control:** alert `1960cdff-9a0f-4736-b6de-d0aa0d4b1bc9` (category `governance`, *"Change-class undeclared for B-EXIT-BOOK-AGE-STAMP"*) was minted into the store 2026-09-07T14:23:20Z. It has since been resolved (2026-09-10); it was live when Langston read it.
- **`ENFORCEMENT_CUTOFF_MS` (`config.mjs:224`) defaults to `2026-06-23T00:00:00Z` and is env-overridable; the box sets `2026-06-24T12:07:01Z`.** r2 quoted the default — the wrong object.

## 5. FINDING C — AMENDED IN PLACE: SLOT-TIME AND CLOSE-TIME ARE **NOT** THE SAME CHECK

**r2 said they were. Its own P2 refuted that, and both stood in one document. The corrected finding:**
- **CLOSE-TIME is a PRESENCE test inside ONE named document** — does this completion report carry this ledger row? The key is the batch-id already in the report's filename. **Buildable on current machinery (P1).**
- **SLOT-TIME is a PLACEMENT test across THREE documents** — a §9.4-slotted item placed in `RUNNING_ISSUES.md`, the phase plan, AND the owning session's task list. **Not buildable on current machinery**, for three reasons verified at the ref:
  1. **No join key.** The checker's only key is a batch-id regex; §9.4 dispositions 2, 4 and 5 produce items with no batch-id, and a large share of phase-plan rows carry no `#NNN`.
  2. **Presence cannot see placement.** `findEntryDoc` returns true if the token appears ANYWHERE; `#1009` appears on several lines of `RUNNING_ISSUES.md`, mostly cross-references. §9.4's own words are *"NAMING IS NOT PLACING"* — a presence test sees only naming, so it would pass the defect it was built for.
  3. **The task lists are not in `DOCS`** (`config.mjs` DOCS table). r2's *"all three are files the checker already reads"* was false for them.
⇒ **Slot-time gets its own batch with a real home (P2).**

## 6. GAPS AND SILENCES FLAGGED

- **`SYSTEM_IMPACT_MAP`** documents per-session MEMORY via the hook layer and **has no entry for the task lists.** Precedent: `B_CONDUCT_FILE_COMPLETION_REPORT.md` records the session-instruction hook estate getting a SIM entry because it had none. ⇒ **entry required (P4).**
- **`bridge/canonical/`** — consulted, no coverage.
- **THE FOLDER — precedent exists on BOTH sides (condition 9):** `CC_A_SESSION_TASK_LIST.md` and `CC_INFRA_SESSION_TASK_LIST.md` sit in `Claude Comms and Packages/Scope Files/`; `CLAUDE_NEW_PHASE_19_TASK_LIST.md` sits in `1-system-manual/`, beside the rest of the Tier-1 set (`BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `PHASE_19_PLAN.md`). Weighed in P3.

## 6a. READER CENSUS — DISCHARGED (condition 10)

**Langston ran it (`dt-review grep` for `SESSION_TASK_LIST` and `CLAUDE_NEW_PHASE_19_TASK_LIST` at head: document references only). Re-derived 2026-09-11 with `git grep` at `origin/migration/aws-supabase` over `*.ts *.mjs *.js *.cjs *.py *.sh *.json *.yml *.yaml`: ZERO code readers (exit 1). Control: the same pattern over `*.md` returns 8 files.** ⇒ **a rename or move has a documentation-only blast radius.**

---

# PART TWO — THE IMPLEMENTATION PLAN
*Every item back-references the audit finding it falls out of. Anything with no audit treatment is flagged `UNAUDITED`.*

### P1 — TEACH THE CHECKER THE TASK-LIST LEDGER ROW
**Falls out of:** Findings A and B; §2a; §4.
- **WHAT:** a new predicate `kind`, generic over a small row table, populated in this batch with ONE row.
- **TARGET:** a markdown TABLE ROW (a line beginning with a pipe) in the batch's completion report that names the session task lists AND carries a verdict. ⛔ **A prose mention outside a table row does NOT satisfy it.**
- **ACCEPT-SET (condition 5):** at least one `✅` (the owning session's own list) with every other verdict `✅` or `N/A` — so `✅ mine / N/A ×3` PASSES, because `workflow-10-governance:132` makes `N/A — not mine` the correct answer on three of four.
- **CUTOFF — WHICH VALUE, STATED (condition 4):** the row carries its own `since` = the commit at which the row first appears in `workflow-10-governance` at the ref (`bfdd1197f`, 2026-09-05T05:45:00Z), compared against the report's first-add time (`completionReportCommitTime`, `checker.mjs:141`). **NOT env-overridable** — it records when the requirement came into existence, a fact about the repo, not deploy configuration. `GOV_CUTOFF` still applies upstream through batch enrolment (`poller.mjs:86`), so a batch must clear both.
- **POPULATION (condition 6): inherited DELIBERATELY from `completion_report` (`config.mjs:106`, basename matching `COMPLETION` or `COMPLETE`), progress reports EXCLUDED.** Reason: the row's trigger is *"EVERY batch close"*, and a progress report is by definition an OPEN state whose ledger lists files changed *so far* — grading it against a close-time obligation would alert on batches that are correctly open. **They enter the population the moment they convert:** conversion is a rename, and the checker's add-time query (`--diff-filter=A` with a pathspec, `checker.mjs:130`) sees a rename as an ADD at the new path — control: `B_DEPLOY_DRIFT_LINE_COMPLETION_REPORT.md` returns status `A` at its conversion commit `8e7e1ba9c`. ⇒ `F-G-2`, `#951` and `B-XSTOCK-FEED-SANITY` are graded when they convert, not before.
- **ALERT COPY:** its own (the doc-gap wording says a document is "absent or hollow", wrong for a missing row), naming the batch and the missing row.
- ⛔ **SCOPE — ONE ROW, DELIBERATELY.** Finding B measured three rows missing. The other two (`:128` shared `MEMORY.md`, `:133` Langston's `MEMORY.md`) landed 2026-08-28, before the verdict-column ledger shape was in common use, so completion reports since then record them in older shapes (for example a `document / what changed` table with no verdict token). A uniform accept-set would either flood closed batches with alerts or weaken to "named anywhere in a table", and either choice needs its own derived retroactive set. **The `kind` is generic, so each is a config line plus seeded cases — homed in P2's batch as OBJ-B.**
- **VERIFICATION — SEEDED, because a one-positive test written by me against my own report discriminates nothing:** S1 `✅ mine / N/A ×3` table row ⇒ PASS · S2 four `✅` ⇒ PASS · S3 the task lists named in PROSE only ⇒ FAIL · S4 a table row naming the lists with an EMPTY verdict cell ⇒ FAIL · S5 row absent ⇒ FAIL · S6 report first-added before the row's `since` ⇒ NOT GRADED · S7 real reports at the ref: `B_DEPLOY_DRIFT_LINE` ⇒ PASS, `B_EXIT_BOOK_AGE_STAMP` ⇒ FAIL, `B_DRIFT_RUNTIME_PREDICATE` ⇒ FAIL.
- **BEFORE DEPLOY (condition 7):** run the predicate offline against the ref and PRE-REGISTER the exact set of already-closed batches it will alert on. Known members: at least the two S7 FAILs. The deploy must then produce that set and nothing else.

### P2 — SPLIT OUT: THE SLOT-TIME PLACEMENT CHECK
**Falls out of:** Finding C (amended); Finding B.
- Not buildable as a presence test (§5).
- **`HOME: B-SLOT-PLACEMENT-CHECK, owner CC-A, placed in PHASE_19_PLAN.md §governance at row 4.8, after 4.7 B-HEARTBEAT-RESCOPE`** (condition 8). Placed after Kyle's own ordering of 4.57 → 4.6 → 4.7, not ahead of it.
- **OBJ-A:** define a join key for items with no batch-id, then a PLACEMENT predicate across `RUNNING_ISSUES.md`, the phase plan and the owning task list.
- **OBJ-B:** extend P1's row table to the `:128` and `:133` rows, with their retroactive set derived and pre-registered first.
- **VERIFICATION:** the plan row and a `#1009` annotation exist at the ref — both land in the same commit as this revision.

### P3 — THE FOLDER, CHOSEN AND ARGUED (condition 9): `1-system-manual/`
**Falls out of:** §6 (folder); §6a.
- **For `Scope Files/`:** two lists already live there — but both were created there since 2026-09-05 with no ruling. That is accretion, not a decision.
- **For `1-system-manual/`:** `CLAUDE.md` §4 documents `Scope Files/` as holding scopes, pre-audits and audit discussion docs, and a task list is none of those; the Tier-1 ledger places the lists beside `BATCH_CATALOG.md`, `PHASE_HISTORY.md` and `PHASE_19_PLAN.md`, all in `1-system-manual/`; CC-B's list is already there.
- **Side effect, measured:** `1-system-manual/` is a `GOVERNANCE_PREFIXES` entry (`config.mjs:93`, used at `checker.mjs:86`). A commit touching it whose subject LEADS with a batch-id sets that batch's `hasGovernance`, whose only consumer is the deadline check; untagged commits are ignored (`poller.mjs:48-55`). At a batch close that is the correct reading — the task-list update IS Tier-1 governance.
- **Blast radius of the moves:** documentation only (§6a).
- **WHAT THIS BATCH DOES:** name and justify the convention `1-system-manual/CC_<X>_SESSION_TASK_LIST.md`; move `CC_A` (mine) and update its pointers; create the missing `CC_C` shell; post the convention to the crew.
- **NOT MINE:** CC-B renames its own file, CC-INFRA moves its own, CC-C populates its own — named dependencies, not pass conditions.
- **VERIFICATION:** the convention is written into `workflow-10-governance:132`; `CC_A` and the `CC_C` shell exist at the chosen path; the crew post exists.

### P4 — `OPEN AND STALLED` AS THE PRIMARY SECTION, PLUS THE SIM ENTRY
**Falls out of:** Kyle's amendment 2026-09-05; §6 precedent.
- Define the shape: each list leads with every batch its session OPENED and has not closed, the step it stalled at, and what it waits on.
- Add the `SYSTEM_IMPACT_MAP` entry.
- Each list actually leading with that section is a dependency on its owner, recorded as such.
- **VERIFICATION:** the SIM entry and the shape definition exist at the ref.

### P5 — PRE-REGISTERED MEASUREMENT
**Falls out of:** §2a; scope §7b.
- **Baseline:** close-time = **1 of 3** (§2a).
- **PRIMARY:** of the next three completion reports first-added after the deploy, the row is present AT CLOSE in all three — the checker's purpose is that no omission survives.
- **SECONDARY:** present in the report's FIRST pushed version — measures whether sessions write it unprompted, not only after an alert. Reported, not gated.
- ⛔ **FAIL:** the primary does not reach 3 of 3 ⇒ the checker is not closing the gap, and the batch says so.
- **Measured the same way, on the P1 population, at the ref.**

## REJECTED CANDIDATES — ARGUED (condition 2: CHECKER ONLY)

- **Kyle's option 1 — a slot-time SKILL: REJECTED, on the LAYER.** A skill reaches a session in one of two ways: a pointer in an always-loaded file, which already exists at `CLAUDE.md:539` and is the weak trigger of Finding A, or auto-invocation, which `CLAUDE.md` §0.a calls a coin flip never relied on. **Either way it is a fourth delivery on the instruction layer `#995` measured failing three times** (the rule as written, the rule restated, and an instruction delivered at the event). Its failure would be as invisible as the close-time row's was. **The non-instruction alternative for slot time is a check, and that check is P2.**
- **Kyle's option 2 — a clause in each step skill: REJECTED.** Finding B: sessions copy the previous REPORT, not the skill. A clause inside a file nobody opens is the failure being fixed.
- **A HOOK: REJECTED on the estate, and only on the estate.** Hooks can block (`guard-bare-commit.mjs` exits 2), so "it runs inside the session that erred" was never a valid objection. The valid one: hooks are per-clone and refresh at session start, so four sessions run up to four versions (`B-HOOK-ESTATE-VERSION`). **A hook remains the only PREVENTIVE candidate; that is the cost of this choice, stated.**
- **CI: REJECTED.** It scores with the checker on both census columns and does not lag. Against it: it gates the PUSH, and failing code CI on a missing ledger row trains people to bypass CI — `workflow-05`'s stated hazard.
- **THE LANGSTON STEP-11 GATE: STRUCK, on Langston's own ruling.** His reasons: he ruled on `B_EXIT_BOOK_AGE_STAMP` and did not catch the omission; his reviewer checklist is itself instruction-shaped; and "truth-checking" has zero measured instances. ⇒ **the pair is withdrawn. One mechanism: the checker.**

## HONEST RESIDUALS

- **The checker LAGS** (up to 30 minutes after the push); it is not preventive. That is the right shape given `#995`, and it is the cost of rejecting the hook.
- **Slot time is NOT fixed by this batch.** It stays on the weak trigger until P2's batch builds a placement check; its baseline is unmeasured, because the corpus cannot tell a mention from a firing.
- **P1 covers one of three measured missing rows**; the other two are homed (P2, OBJ-B).
- **The accept-set is a pattern over free-form markdown.** S1-S7 bound it; a ledger row in a shape none of them anticipate may be misgraded, and the first real alert is where that shows.

## 7. CONDITION RECORD — Langston Step 2, 2026-09-09T19:37Z

| # | condition | applied where | re-derived at the object |
|---|---|---|---|
| 1 | restate Finding A on `:539`; correct §2a and row 4.57 IN PLACE | §0, §2, §2a; plan row 4.57 | `CLAUDE.md:539` text + 588 lines at the ref |
| 2 | strike the pair; checker only, argued on the layer | rejected candidates | — (a ruling) |
| 3 | amend §5 in place | §5 | P2's three grounds re-read |
| 4 | `GOV_SHADOW` answered; state which cutoff the predicate keys on | §4, P1 | `systemctl show` on staging; alert `1960cdff` in the store |
| 5 | accept-set admits `✅ mine / N/A ×3` | P1, S1 | `B_DEPLOY_DRIFT_LINE_COMPLETION_REPORT.md:209` carries exactly that shape |
| 6 | disposition the progress-report blind spot | P1 population | the rename-as-add control on `8e7e1ba9c` |
| 7 | derive or drop "≈4" | §0, P1 | dropped; derivation moved to a pre-deploy step |
| 8 | P2 gets a §9.4 home placed in the plan | P2; plan row 4.8; `#1009` | name checked unused at the ref |
| 9 | strike "no precedent either way"; weigh both | §6, P3 | `git ls-tree` of all three list locations |
| 10 | record the reader census as discharged | §6a | `git grep` at the ref, with a `*.md` control |
