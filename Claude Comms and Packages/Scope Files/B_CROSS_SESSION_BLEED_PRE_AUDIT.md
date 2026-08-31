# B-CROSS-SESSION-BLEED — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**Owner:** CC-B · **Issue:** #753 · **change-class: non_architecture** *(see A7 — I am asking Langston to overrule this to `architecture`)*

---

## ⛔ PREVIOUSLY STATED / NOW — every number that moved since the scope

> **PREVIOUSLY STATED: 12 occurrences. NOW: 22. REASON:** I censused 3 clones; there are **5**. The Infra clone was missed entirely and holds 3 more artifacts. *(Langston CONDITION-2.)*
> **PREVIOUSLY STATED: "all three clones". NOW: five —** `DawnTraderV3`, `-old`, `-analyst`, `-infra`, `-new`. **REASON:** the spare clone and the Infra clone both exist and both run the hook.
> **PREVIOUSLY STATED: nine files is the hook's ceiling. NOW: 14.** **REASON:** 4 single-file entries + the 10 files currently under `.claude/hooks`. Nine was what *differed on my run*, not the maximum.
> **PREVIOUSLY STATED: the premise is REFUTED. NOW: DOWNGRADED —** *"no cross-session write in any surviving artifact; one permanently untestable."* **REASON:** Langston's formulation; mine over-claimed. Adopted verbatim.
> **PREVIOUSLY STATED: 12/12 origin-reachable proves the hook delivered it. NOW: origin-reachable proves PROVENANCE ONLY; attribution comes from 22/22 log-pairing.** **REASON:** BLOCKER-1 — anything writing origin's bytes yields origin-reachable.
> **PREVIOUSLY STATED: "9 of 10 same file CONFIRMS it". NOW: STRUCK as non-discriminating.** **REASON:** BLOCKER-2 — that file is both the most-refreshed and the most-contended; both hypotheses predict it.

---

# PART 1 — THE AUDIT

## SOURCES READ (all six, named per the step's requirement)
1. **CODE at `origin/migration/aws-supabase`** — `fresh-rules.mjs` in full, 164 lines.
2. **RUNTIME LOG** — `~/.claude/dt-fresh-rules.jsonl`, **396 runs, 5 clones**. *(The hook is not a PM2 service; this log IS its runtime record. No staging-server component is involved — flagged so the absence of a PM2 read is not read as a skipped source.)*
3. **`SYSTEM_IMPACT_MAP.md`** — entry present, `:1000`.
4. **`SYSTEM_MANUAL.md`** — **0 matches. SILENT.** Flagged below as A6.
5. **LEDGER + BATCH REPORTS** — `RUNNING_ISSUES` #753/#756, and **`B_RULES_FRESHNESS_SCOPE.md`, the hook's own originating scope**.
6. **`bridge/canonical/`** — 14 files, **NO coverage of this component.** Recorded as required: the corpus predates the hook by ~6 months, so its silence is expected and is not evidence of anything.

## A1 — ENTRY-POINT ENUMERATION (repo-wide, BEFORE any trace)
**Exactly ONE registration:** `.claude/settings.local.json:155`, matcher `startup|resume|compact`. **Stated explicitly per rule 22: one, not "I found one".**

★ **AND THE ORDERING IS LOAD-BEARING: `fresh-rules` is hook 1 of 13.** ⇒ the other twelve — including `load-conduct` and `load-own-memory` — execute **AFTER** the refresh has landed and therefore run the NEW bytes in the same session start. **Only `fresh-rules` itself runs stale.** The blast radius of the self-staleness is exactly one file.

## A2 — COMPONENT CENSUS (§9.5(a)) — who writes, reads, mutates, deletes, schedules

| question | answer | evidence |
|---|---|---|
| who **WRITES** the working tree via git path-checkout? | **EXACTLY ONE** — `fresh-rules.mjs:124` | repo-wide grep at the ref; the only other hits are `github-push.sh:43` (a **branch** switch, not a path checkout) and a string inside `guard-bare-commit.mjs:298` |
| who **WRITES** the run log? | exactly one — `fresh-rules.mjs:52` | |
| who **READS** the run log? | **no code reader** — two scope docs and a runbook cite it in prose | ⚠️ see A7 |
| who **DELETES** here? | **none** | the hook never removes a path |
| who **SCHEDULES** it? | one registration (A1) | no timer, no cron, no second subscription |

⇒ **single writer, single scheduler. No mutual-exclusion check required.**

## A3 — THE MECHANISM (established, and attributed)
`git checkout <ref> -- <path>` writes the **index as well as the working tree** — documented git behaviour. Before `4a988bf32` (2026-08-21) the loop had no index-clearing step, so every refresh left its result **staged**. `:125` now runs `reset`, **inside a bare `catch`** so a failure is swallowed and never reaches the run record at `:130-137`.

**ATTRIBUTION, not just provenance:** **22/22 artifacts** across all five clones pair to a logged `refreshed:` of **that path in that clone**, typically **0.1–2.1 h** before the artifact. Two long lags (**347.3 h**, **207.9 h**) are dormancy, not anomaly.

## A4 — THE SELF-DELIVERY FIXED POINT
The hook executes the **on-disk** file, which is whatever the previous run wrote — **HEAD is irrelevant.** A fix therefore cannot protect the run that installs it. **Exposure per clone = the first run after a fix reaches origin.**

**AND THE PIN (Langston):** residue leaves worktree == origin ⇒ `git diff --name-only REMOTE_REF -- path` (`:95`) is empty ⇒ `continue`, harmlessly — **until a NEW hook fix lands while residue is present.** Then it differs, the dirty check (`:100`) sees the staged entry, and the fix is **refused indefinitely** as *"UNCOMMITTED local edits"*. **MEASURED: 1 in 396 runs** (CC-C, 2026-07-24). **Rare, real, unbounded once armed.**

## A5 — ★ THE MISATTRIBUTION ENGINE (Langston's finding, and the most consequential one)
`:155` prints **"NOT refreshed — you have UNCOMMITTED local edits here"**. When those "edits" are origin's bytes staged by the session's own prior run, **the hook asserts ownership that is false.** ⇒ **every one of the 22 occurrences was read as another session writing into the tree.** The batch's own NAME comes from this sentence.

## A6 — GOVERNANCE GAPS FOUND
- **`SYSTEM_MANUAL.md` is SILENT on the session-tooling layer.** Per the step's rule, that silence is itself a gap — **flagged, not fixed here** (the Manual's scope is trading architecture; this may be correctly out of scope, which is a Langston call).
- **`SYSTEM_IMPACT_MAP.md:1000` is STALE:** it describes the hook as *"re-stages … can restage files into a session's index"* — **that is the PRE-`4a988bf32` behaviour.** The SIM documents the bug as the design. **Plan item P6.**
- **The originating batch shipped unreviewed.** Its own scope says so verbatim: *"Langston reviewed none of it"*, written after implementation, 8 commits with no batch id so the checker never fired.

## A7 — ★ WHY THE DEFECT SURVIVED 28 DAYS: THE ACCEPTANCE SET NEVER ASKED
`B_RULES_FRESHNESS_SCOPE.md` OBJ-4 enumerates **five** verified behaviours: stale→refreshed · uncommitted preserved · unpushed preserved · silent when current · fail-open on error. **NOT ONE OF THEM INSPECTS THE INDEX.** ⇒ the defect was **invisible to the batch's own verification by construction**, not missed by inattention. **This is the finding that should shape the fix: the repair is worthless unless its acceptance test asserts the thing the original acceptance test could not see.**

⚠️ **AND THE SAME SHAPE IS LIVE RIGHT NOW:** the run record at `:130-137` logs `refreshed`, `skipped_dirty`, `skipped_unpushed`, `quiet` — **it does NOT log whether the index was left clean.** The instrument that would have caught this still cannot.

⇒ **I am asking Langston to overrule `non_architecture` → `architecture`:** this changes a hook that runs at every session start for all five clones, and its own originating batch was `architecture`. Declaring lower than my predecessor for the same component is the downgrade the workflow warns about.

---

# PART 2 — THE PLAN (every item back-references its finding)

| # | item | falls out of | verification |
|---|---|---|---|
| **P1** | Hook reports whether its **own on-disk bytes are origin's bytes** at run time, in its printed block and its run record | **A4** | on a clone pinned pre-`4a988bf32`, the block says so and names the newer version |
| **P2** | After the refresh loop, **assert the index is clean**; compare **index blob vs origin blob** per path | **A3, A7** | ⛔ **MUTATION-PROOF: revert the `reset` call ⇒ the assertion FAILS.** A fence that cannot fail was never proved |
| **P3** | Replace the bare `catch` at `:125` — a swallowed reset is **reported** in the run record | **A3** | force `reset` to fail ⇒ the run record carries it; **`:43` FAIL-OPEN preserved — report, never block a session start** |
| **P4** | Run record gains the index-clean result | **A7** | a run with residue is distinguishable in the log from one without |
| **P5** | Distinguish **dirty-because-I-edited** from **dirty-because-a-prior-run-staged-origin's-bytes**; identical to origin ⇒ hook residue, clear it, **never call it local work**. Correct the `:155` wording | **A5** | staged-origin-bytes ⇒ cleared + reported as residue; genuine local edit ⇒ **preserved untouched** *(both directions tested)* |
| **P6** | Correct `SYSTEM_IMPACT_MAP.md:1000` — it documents the bug as the design | **A6** | entry describes post-fix behaviour |
| **P7** | **Zero-residue census across ALL FIVE clones as a named PRE- and POST-deploy gate**; any primed clone cleared BY HAND first | **A4** + Langston CONDITION-1 | census output recorded both sides of the deploy. ⛔ **This batch's own fix is the arming event — the fix cannot deliver itself** |
| **P8** | Record the 22 occurrences, the two tracing artefacts and the premise downgrade in #753 | **A3, A5** | entry carries Langston's wording verbatim |

**NOTHING IN THIS PLAN IS `UNAUDITED`.** ⛔ **No item touches another session's clone: P7's by-hand clearing needs a per-clone owner, and four of the five are not mine.** All development in a throwaway clone.

---

## PLAIN-LANGUAGE SUMMARY
The session-start refresher fetches five shared files so nobody runs stale rules. Until 21 August it left every file it fetched half-filed, so the next person saw another session's work sitting in their folder looking like their own unsaved edits — and the refresher's own message told them it *was* theirs. That sentence is why this was called cross-session bleed for a month; nothing was ever written between sessions.

Two things make it stubborn. The refresher can't fix itself — it runs the copy already on disk, so a repair only takes effect the run *after* it arrives. And leftover residue can make a clone refuse the very fix that would clear it. **Our own fix is exactly the kind of arrival that triggers that**, so the all-clear check across all five folders is a gate before and after release, not a formality.

The reason this survived a month is the part worth keeping: the original work's test list checked five things and none of them looked at the half-filed state. It wasn't missed through carelessness — it was invisible to the tests that existed.

---

# AUDIT r2 — SECOND-READER LOOP, ROUND 1. FOUR HITS RE-DERIVED. **THE POST-FIX DEFECT DOES NOT EXIST.**

A fresh reviewer was handed the CLAIMS ONLY (mode B). Four hits re-derived at the ref; all four stand and one dissolves the batch's remaining premise.

## A8 — ★★ THE FINDING THAT SUPERSEDES THE REST: EVERY "INSTANCE" SINCE 2026-08-21 IS A CORRECT REFRESH BEING MISREAD
The reviewer noted the post-fix form is *different, not fixed*: with `reset` running, index = HEAD and worktree = origin, so content still lands — now **unstaged**. **Re-derived on the newest artifact in the fleet**, CC-C `stash@{0}`, labelled *"CC-A #978 content found in CC-C tree 2026-08-31 12:30 — NOT MINE (4th instance)"*:

| | |
|---|---|
| stashed blob | `be763c94d…` |
| **origin's blob for that path at stash time** | **`be763c94d…` — IDENTICAL** |
| HEAD blob | `23604dc34…` (older) |
| staged files in that stash | **0** |

⇒ **The "foreign content" is byte-for-byte what origin held at that instant.** The file shows as modified **only because the clone is behind HEAD** — the hook wrote newer bytes, and git correctly reports they differ from an older commit. **This is the hook succeeding.**

⛔ **THERE IS NO POST-FIX DEFECT. There is a LEGIBILITY failure**, and it has been generating incident reports for ten days. ⚠️ **And the response is actively counter-productive: `git stash` reverts the worktree to HEAD — i.e. it puts the STALE rules back.** Sessions are discarding their own rules refresh and filing it as an incident.

## A9 — MY PIN EVIDENCE IS WITHDRAWN
r1/A4 cited *"1 in 396 runs"* as the measured rate of the self-pin. The reviewer checked the object: that single skip is **the FIRST LINE IN THE LOG** (`-analyst`, 2026-07-24T08:24:31Z) and **the very next run 57 seconds later REFRESHED `.claude/hooks` successfully.** Both v1 and v2 of the hook landed that same day. **The simpler reading is the author's own edit-in-progress, not staged residue.** ⇒ **I have ZERO measured instances of the pin. The mechanism remains sound by code reading; the frequency claim is withdrawn** *(#453 — an asserted rate needs a positive instance, and mine was the wrong object)*.

## A10 — THE SECOND WRITER IS REAL BUT LEGACY
`scripts/github-push.sh` does `git stash --include-untracked` (`:42`), `git checkout "$BRANCH"` (`:43`), `git stash pop` (`:44`) and **`git add -A` (`:51`)** — a far larger index writer than the hook. **A2's "exactly one writer" was true only for path-checkout and I scoped it too narrowly.** ⇒ **BUT: 0 references in `CLAUDE.md`/`CONDUCT.md`; every invocation is in Replit-era `attached_assets/` transcripts; rule 25 mandates explicit-path commits and `guard-bare-commit.mjs` enforces it.** **Rule-24 outcome (3): legacy that no longer fits today's intent.** ⚠️ **It is the ONLY thing that would publish an unstaged refresh — so while it is dead, it is one invocation away from live.** **DISPOSITION: own item, P9.**

## A11 — THE "28 DAYS" INTERVAL WAS THE WRONG ONE
A7 said the defect survived 28 days (introduction 07-24 → fix 08-21). **The reviewer is right that this conflates introduction→fix with detection→fix.** CC-A's stash `CC-C-685-not-mine-2026-08-09` is a **preserved artifact from 2026-08-09 — detection was 16 days after introduction and 12 days BEFORE the fix.** ⇒ **the honest interval is 12 days detected-but-unfixed**, and A7's causal claim ("the acceptance set never asked") explains the first 16 days, **not the last 12.** ⚠️ **A7's "because" is also unproven in the reviewer's sense: a coverage gap explains why tests did not catch it, not that a sixth criterion would have.** Restated as a contributing cause, not the cause.

## PLAN — RE-AIMED BY A8
| # | change |
|---|---|
| **P2** | **DOWNGRADED to a regression fence.** It asserts a form that has been fixed since 08-21. Keep it — it is cheap and it pins the fix — but it is **not the deliverable** |
| **P5** | ★ **PROMOTED TO THE PRIMARY DELIVERABLE.** The whole live problem is that a correct refresh is unreadable. The hook must say, at the file level, *"this file was refreshed from origin by me just now — it is not your edit"*, and the run record must carry it |
| **P9** *(NEW)* | `github-push.sh` — rule-18 disposition: delete on the spot or a dated deletion, `DELETED_COMPONENTS_LOG` + `_archive`. **Falls out of A10** |
| **P7** | unchanged, but its justification weakens: with the pin frequency withdrawn (A9) the census is prudence, not a measured need. **Still a gate — the mechanism is sound even with no observed instance** |

**REVIEWER: claim-only (mode B) · "what other states of the world are consistent with these objects?" · 6 claims, 4 hits · re-derived y — A8/A9/A10/A11 all confirmed at the ref.**
