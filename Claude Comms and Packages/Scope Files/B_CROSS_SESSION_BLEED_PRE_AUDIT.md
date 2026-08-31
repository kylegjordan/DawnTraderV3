# B-CROSS-SESSION-BLEED — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**Owner:** CC-B · **Issue:** #753 · **change-class: architecture** *(A7 asked Langston to overrule `non_architecture`; he DID — ruled `architecture` 2026-08-31, so both this file and the scope header now carry it. The scope header is what the governance checker parses.)*

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

---

# AUDIT r3 — READER LOOP ROUND 2 (object round). TWO CORRECTIONS TO MY CORRECTION, AND A BETTER FINDING THAN ANY OF MINE.

## A12 — ⛔ THE 2026-08-21 BOUNDARY IS WRONG. THE CONTENT WAS **NEVER** FOREIGN — NOT BEFORE THE FIX EITHER.
r2/A8 scoped the finding to *"since 2026-08-21"*. The reviewer tested **three PRE-fix artifacts** — `-old stash@{5}` (08-21 14:26, **18 minutes before** the fix), `-old stash@{6}` (08-18), `-analyst stash@{4}` (08-20, labelled *"FOREIGN: unexplained local variant"*) — and **all three are also exact origin blobs at hook-run time.**
⇒ **13/13 artifacts, pre- AND post-fix, are byte-identical to what origin held at the moment the hook ran.** **What 2026-08-21 changed is ONLY whether the index was written too. It never changed whether the content was foreign, because it was never foreign.** My scoping implied the earlier instances were a different thing. They were not. **★ And byte-identity also proves no session's own work was ever mixed in — nothing was ever at risk in any of the 13.**

## A13 — ⛔ "POST-FIX THE STAGED FORM CANNOT HAPPEN" IS FALSE, AND MY OWN STASH IS THE COUNTEREXAMPLE
`-new stash@{0}` was created **2026-08-31, ten days after the fix**, and holds **9 STAGED paths** — because that clone was 755 behind, so the **on-disk** hook was still pre-fix when it ran. ⇒ **a stale clone reproduces the pre-fix index symptom INDEFINITELY after the fix date.** This is A4 restated, but my r2 wording contradicted it. **The staged form is not historical; it is available to any clone that has not started a session since 2026-08-21.**

## A14 — ★★ THE MECHANISM I MISSED, AND IT IS THE BEST FINDING IN THE BATCH: **THE HOOK PERMANENTLY STOPS REFRESHING THE FILE IT REFRESHED.**
Once a path is refreshed it is **dirty relative to HEAD** — and every subsequent run hits the `skippedDirty` branch (`:101`) and **leaves it alone forever.** ⇒ **the worktree holds origin-tip-AS-OF-THE-FIRST-REFRESH, not origin-tip-now, and it never advances again until the session pulls.**

**MEASURED IN MY OWN CLONE:** `RUNNING_ISSUES.md` was refreshed **2026-08-16**, went dirty, and was therefore **correctly absent from the 08-31 refresh list** — it had been skipped as dirty for **14 days**, holding a blob from 08-17 while origin moved 755 commits.

⛔⛔ **THIS IS THE HOOK DEFEATING ITS OWN PURPOSE.** It exists so no session runs stale rules. **Its own refresh marks the file dirty, and dirty means never refreshed again.** ⇒ **one refresh converts a file from auto-maintained into permanently frozen**, and the session is told the frozen copy is its own local work (A5). **The two findings compound: the hook freezes the file, then misattributes the freeze to you.**

## PLAN — A14 CHANGES THE DELIVERABLE AGAIN
| # | change |
|---|---|
| **P5** | **Now covers BOTH halves and is unambiguously the batch:** (a) tell the session a refreshed file is the hook's work, not its edit — **and (b) recognise hook-residue as refreshable rather than skipping it forever.** Residue = worktree matches SOME origin commit for that path and the index is clean ⇒ **refresh it again**, do not skip |
| **P10** *(NEW)* | **Staleness ceiling:** the run record carries, per skipped path, how long it has been skipped and how far its content is behind origin. **Falls out of A14** — 14 days of silent staleness produced no signal at all |
| **P2** | **Re-promoted from regression fence** — A13 shows the staged form is live for any clone that has not started since 08-21, which at five clones is not hypothetical |

## ROUND RECORD
`REVIEWER r1: claim-only (mode B) · 6 claims · 4 HITS (A8/A9/A10/A11) · re-derived y`
`REVIEWER r2: object round · corrected-claim · 2 HITS (A12/A13) + 1 new mechanism (A14) · re-derived y`
⚠️ **STOPPING AT TWO ROUNDS, AND SAYING SO RATHER THAN CLAIMING CONVERGENCE: r2's corrections are themselves UNREVIEWED.** A12/A13 are scoping fixes I can state precisely; **A14 is a NEW mechanism claim and has had NO independent round.** Per the loop's own rule the correction is exactly as likely to be wrong as what it replaced — **so A14 goes to Langston flagged as single-sourced, not as established.**

---

# AUDIT r4 — LANGSTON'S STEP-2 RULING. Three mandatory corrections taken, class overruled to `architecture`, and his one hypothesis REFUTED on measurement.

## M1 — A7's INTERVAL: I OVER-CORRECTED; HIS VERSION IS RIGHT
r3/A11 replaced "28 days" with "12 days detected-but-unfixed" on the strength of the `CC-C-685-not-mine-2026-08-09` stash. **That was not a detection.** His evidence, re-checked: `fresh-rules.mjs:120` — *"both incidents were misread as another session writing into this clone. It was never that"*; **#753's instance table lists 07-28 · 08-21 · 08-27 — 08-09 is ABSENT**; and the stash object's reflog date is **2026-08-18**, nine days after its own label. The fix landed **18 minutes** after the 08-21 occurrence.

⇒ **28 days introduction→IDENTIFICATION, ~0 identification→fix. ZERO days known-and-unfixed.** ★ **And that RESTORES my A7 explanation to its full span:** the acceptance-set gap covers the **whole 28 days**, not the first 16. **My correction was worse than the thing it corrected** — I read a stash LABEL as an event date without checking the object's own reflog.

## M2 — A10 "THE ONLY THING THAT WOULD PUBLISH": REFUTED, WRONG POPULATION. Verified at the ref.

| script | `git add -A` | `cd` guard | target branch |
|---|---|---|---|
| `scripts/github-push.sh` | `:51` | **yes** `:22` (`set -e` aborts off-Replit) | `dawntrader-v4` `:16` |
| **`REPLIT_PUSH_SCRIPT.sh`** (repo root) | **`:46`** | **NONE** | `dawntrader-v4` `:19` |
| **`Claude Comms and Packages/REPLIT_PUSH_SCRIPT.sh`** | **`:46`** | **NONE** | `dawntrader-v4` `:19` |

Both `REPLIT_PUSH_SCRIPT.sh` copies run **unguarded**, and **`1-system-manual/REPLIT_ONBOARDING_PROMPT.md:88` + `:118-123` — an UNARCHIVED path — still mandate the push script.** My *"every invocation is Replit-era"* was **false**.

★ **ONE REFINEMENT I OWE, in the safer direction:** all three target **`dawntrader-v4`, not the review branch**, so the *push* would not reach `migration/aws-supabase`. **The risk is not the push — it is the local `git add -A` + commit, which bakes hook residue into local history on whatever branch is checked out, where an ordinary later push carries it.** ⇒ **P9 covers all four artifacts and retires the two onboarding directives.** *(`fix-follows-pointer` avoided — my own named pattern, nearly committed on my own batch.)*

## M3 — A1's ORDERING BOUND: **DROPPED, NOT DEFENDED**
He is right that `settings.local.json` establishes **registration** order, not **execution** order, and that my own hook header (`:18-20`) already calls the ordering *"UNDOCUMENTED"*.

**I tried to establish it and could not.** Pairing the two hooks that both write logs (`fresh-rules` #1, `log-instructions-loaded` #13) over the last 40 runs: **25/40 paired, median gap 30.4 s, range 0.52–115.8 s.** Consistent with sequential, **but it does not exclude concurrency and 15 did not pair at all.**

⇒ **the "only `fresh-rules` runs stale, blast radius one file" bound is WITHDRAWN.** If execution is concurrent, `load-conduct`/`load-own-memory` can read `CLAUDE.md` **while `checkout` is writing it** — a torn read, for which I have no instrument. **Recorded as an open risk, not a bounded one.**

## M4 — ★ HIS HYPOTHESIS IS REFUTED ON MEASUREMENT, AND THE REFUTATION IS USEFUL
He proposed (29(c), explicitly untested — he cannot read stashes): *"your stash corpus is the fingerprint of the aborted pull; stash is the documented way out."* **Testable, so I tested it:** for every stash in all four clones, the gap to the next `pull (start)` in that clone's reflog.

| | |
|---|---|
| population | **19 stashes, 4 clones** — the whole corpus *(grown from 13; a moving count I should have stamped)* |
| stashes with a pull within 180 s | **2 / 19** |
| the rest | 368 s → **122,330 s (34 h)** |

⇒ **NOT the fingerprint of aborted pulls.**

★ **AND THAT SEPARATES THE TWO FINDINGS RATHER THAN MERGING THEM:** the stashing is driven by **A5, the misattribution WORDING** — sessions read *"you have UNCOMMITTED local edits"*, conclude foreign content, and stash under rule 25.c. **A14 is the mechanical harm; A5 is what generates the human response.** They need different fixes, and the priority follows: **the wording has produced 19 recorded reactions; the freeze reaches every skipped path silently.**

## A14 — CONFIRMED BY HIS OWN SCRATCH REPRODUCTION, and larger than I wrote
- ⛔ **`git pull` ABORTS** — *"Please commit your changes or stash them before you merge. Aborting."* I wrote the freeze lasts *"until the session pulls."* **The pull is the thing it blocks.** Not a stale file with an exit — **a stale file barricading the exit.**
- **ERA-INDEPENDENT:** pre-fix leaves `M ` staged, also non-empty at `:100`. **08-21 changed which column, not whether it freezes** — which **strengthens A12**.
- `:157` says *"Commit and push them"* — the misattribution is now **an instruction to publish hook residue.** ⚠️ **Magnitude honestly, per his caution: the content is origin's own and a behind-HEAD clone cannot push, so this is AUTHORSHIP NOISE, not content loss. Not inflated.**

## CHANGE-CLASS — OVERRULED to `architecture` (his ruling, my request)
Delta is exactly `system_manual` + `sim`. **The bind he flagged is real:** `SYSTEM_MANUAL.md`'s silence is **CORRECT** — `:23` and `:70-72` exclude build/process machinery and route it to `BUILD_METHOD_PLAYBOOK.md` and the SIM — but `architecture` makes `system_manual` **required** and `workflow-10:117` forbids `N/A` on a required row.

⇒ **P11: file a confirmed `na-skip | system_manual` exceptions row carrying the verbatim `:70-72` citation. DO NOT invent a Manual section to satisfy a checker.**
**P6 extended:** `SIM:1000` update **plus** `:992-993` — a GFM table header separated from its body by the blockquote at `:994-999`, **currently rendering as literal pipe text.**

## NEW ITEMS, homed per §13
- **FOLDED IN:** pull-block → **P5** · four publishers + two onboarding directives → **P9** · na-skip row → **P11** · broken SIM table → **P6**.
- ➕ **`B-FRESHNESS-LOG-READER` — owner CC-B, `PHASE_19_PLAN` governance queue, immediately after this batch.** My A2 *"no code reader"* is right, **but I missed what it collides with:** `fresh-rules.mjs:40-41` asserts in the **present tense** that *"the monitoring routine reads"* the log, and **`CLAUDE.md:202` — auto-loaded into every session — cites the pairing as LIVE DETECTION COVERAGE.** The `freshness-log-review` cron is defined in **no committed artifact**. **A claimed control cited as protection it may not provide** (#661 leg 3).
- ➕ **`B-GOV-CLASS-GUARD-HOOKS` — owner CC-A**, after `B-CHANGE-CLASS-PARSER` (#968), same file. `CORE_ENGINE_PATHS` (`config.mjs:187-198`) has **no `.claude/` entry**, so the under-declaration cross-check is **structurally blind to the hook estate** — the one file class executing in every session in five clones. **It would not have flagged my `non_architecture`. He had to.**

## ⚠️ WHAT REMAINS UNVERIFIED BY HIM — his tag, carried forward
The run log, the stash corpus and A12/A13's byte-identity **live on laptop clones he cannot reach.** **`RULED ON REPORTED FACT` — no PROCEED on the A12/A13 legs.** **A14 carries because he re-derived the mechanism himself.** ⇒ **M4 above is mine-only by the same constraint** — a measurement he cannot check, and it should be read with that tag.

## ⚠️ AND A COUNT I MISSTATED THREE TIMES
The run log was cited as **396** (audit), **403** (dispatch), **409** (now). **Not an inconsistency — a live counter read at three different moments.** The error was presenting a moving figure as a fixed one. **Any count of a growing artifact is stamped with its read time from here on.**
