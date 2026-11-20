# B-WORKFLOW-IMPROVE reconciliation: A-block rules vs the summary above them

Ref: `b75aeba603f5e5c469e7289e2b9e63810c310e07` (the pre-move ref on migration/aws-supabase, read with `git show b75aeba60:.claude/skills/<dir>/SKILL.md`). *Re-stamped 2026-11-20 (Langston gate 3, Q10 c): the ref first named here, `eb12f019b`, was dropped by a rebase and no remote serves it; `b75aeba60` resolves.* The verdict tables below are AS AT that ref; the section "Re-check at the graded ref" at the end closes five of the nine MISSING rows.
Method: each A block ("THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM") split into atomic rules; each searched in the SAME file's text above the A heading. Line numbers are the committed file's. A dated attribution that is absent from the summary makes the row PARTIAL (tagged "attribution only" when the substance is carried). Greps of the summary part found nothing for: 2026-05-24, 2026-07-29, #174, #452, #453, "amendment", #649, #621, 2026-07-23, 2026-05-07, and "review branch" (skill 10).

## workflow-01-scope (A block lines 55-64; summary lines 1-50)
| # | A-block rule (short) | verdict | summary line + quote, or what is missing |
|---|---|---|---|
| 1 | Kyle directive -> draft BATCH_N_SCOPE.md with numbered objectives + verification criteria -> Langston approves | PRESENT | L11 "draft ... BATCH_N_SCOPE.md with numbered objectives + verification criteria"; L8 "Langston approves the scope" |
| 2 | 1.a read SIM + System Manual for every component (Kyle directive 2026-05-24) | PARTIAL | L17 carries the read; attribution only: date "Kyle directive 2026-05-24" absent |
| 3 | 1.a claims (caller counts, dependencies, blast radius, surface API) come from direct reads or compile-driven probes, not grep or memory | PRESENT | L17 "from those reads or a compile-driven probe — NOT from grep and NOT from memory" |
| 4 | 1.a origin: B79.0n.STRATEGY scope v1 underestimated caller surface 2 -> 7 files; v2 fixed by compile probe; see history doc §2.1a | MISSING | no origin case or history-doc pointer in summary |
| 5 | 1.b provenance read in EVERY scope, not just audits (Kyle directive 2026-07-29); every service / module / function / helper / route; extends §9.5(b) to a standing scope obligation | PARTIAL | L19-20 "For every service/module/function/route ... record its ORIGINAL INTENT". Missing: the 2026-07-29 date, "helper", and that it extends §9.5(b) from audits-only to all implementation batches |
| 6 | Tiered scope: TIER 1 full provenance for behaviour changed, TIER 2 one-line note (Langston amendment D); reason: unbounded rule gets skipped, 40-file batch cannot do tier 1 on everything | PARTIAL | L21-22 carry both tiers. Missing: "Langston amendment D" and the reason |
| 7 | Where to look (a): BATCH_CATALOG + completion report + RUNNING_ISSUES, searched by FILE/SYMBOL not symptom | PRESENT | L24 "searched by FILE/SYMBOL name, not by symptom" |
| 8 | Origin of (a): #174 missed seven weeks because the search was for the symptom | MISSING | no #174 / seven-weeks case |
| 9 | Also search FORMER filenames (Langston amendment C); P19-B-RENAME 2026-07-03 renamed the active-* family plus three tables | PARTIAL | L24 "search FORMER filenames too (the active-* family was renamed 2026-07-03...)". Attribution only: "Langston amendment C", "P19-B-RENAME", "plus three tables" |
| 10 | (b) git log -S "<symbol>" --reverse, not path-limited, then READ the introducing commit's message AND any attached directive | PARTIAL | L24 "git log -S ... NOT path-limited so it survives renames, then READ the introducing commit". Missing: "and any attached directive" |
| 11 | (c) if it predates 2026-01/02 governance change -> bridge/canonical/ PLUS the old unorganised phase/batch reports in the archived folders | PARTIAL | L24 names bridge/canonical/. Missing: the old unorganised phase/batch reports in archived folders |
| 12 | Canonical corpus = what we INTENDED, NOT current-state truth, NEVER edited (frozen) | PRESENT | L24 "documents what we INTENDED then and is never current-state truth and never edited" |
| 13 | Evidence standard (Langston amendment B): NAME corpora searched; QUOTE introducing commit/directive verbatim with a ref, no summary; #452 | PARTIAL | L26 carries both. Attribution only: "Langston amendment B", #452 and its reason |
| 14 | Intent not recoverable -> say so, mark INFERRED-FROM-CODE not established; #453 asserted absence needs presence-evidence; without this box scope picks the plausible disposition (the 0.7-default failure) | PARTIAL | L26 "mark it `INFERRED-FROM-CODE`, not established". Missing: #453 and the 0.7-default failure rationale |
| 15 | The FIVE dispositions (1 relevant+correct, 2 needs update, 3 reconnect, 4 remove, 5 disconnected and should stay disconnected/removed) (Langston amendment A) | PRESENT | L28 lists all five. (Attribution "amendment A" absent, minor) |
| 16 | (5) routes to rule 18/§15: delete on the spot or a placed deletion, DELETED_COMPONENTS_LOG + _archive | MISSING | L28 (5) has no routing, no rule 18/§15, no log/archive |
| 17 | Why (5) exists: dead code otherwise lands in (3) "reconnect" (wrong, accidental re-entry risk) or (4) (falsely asserts connected) | MISSING | not stated |
| 18 | An implementation/scope that cannot say which of the five has not finished | PRESENT | L28 "A scope that cannot say which is unfinished." |
| 19 | Why it earns its token cost (Kyle's reasoning): cheaper than re-litigating fixes, retracted causes, wild-goose chases; rule 24's three outcomes unanswerable without intent | MISSING | not stated |

Totals workflow-01: PRESENT 6 / PARTIAL 8 / MISSING 5 (19 rules).

## workflow-02-audit-and-plan (A block line 132; summary lines 1-125)
| # | A-block rule (short) | verdict | summary line + quote, or what is missing |
|---|---|---|---|
| 1 | Renamed 2026-08-21 (Kyle); merged by #694 piece (5), Langston adopted, name never followed | PRESENT | L8 "(Renamed 2026-08-21; the merge was #694 piece 5, adopted by Langston.)"; L16 |
| 2 | ONE step, ONE document, Langston signs off once | PRESENT | L8 "ONE step. ONE document. Langston signs off ONCE" |
| 3 | AUDIT comes BEFORE the plan; reason: under two documents plan approved first so an overturning audit arrives after approval is spent | PRESENT | L12 "an audit that overturned the design arrived after the approval was already spent" |
| 4 | Every plan item back-references the audit finding; unaudited flagged UNAUDITED | PRESENT | L20 "Every plan item back-references the audit finding ... flagged `UNAUDITED`" |
| 5 | Read actual files, check PM2 logs, query Supabase, screenshot UI | PRESENT | L24 "Read actual files. Check PM2 logs. Query the database. Navigate the UI." |
| 6 | MANDATORY consult SIM per affected component, "deeper than Step 1.a": upstream + downstream + shared-state + background-execution + blast-radius | PARTIAL | L25 carries the five dimensions. Missing: "deeper than Step 1.a" comparison |
| 7 | Document in BATCH_N_PRE_AUDIT.md | PRESENT | L15 "filename stays `<BATCH>_PRE_AUDIT.md`"; frontmatter L3 |
| 8 | Langston reviews | PRESENT | L8-9 "Langston signs off ONCE ... Ends when: he clears the merged document" |
| 9 | Skipping the SIM review is how cascade bugs get prevented, non-negotiable | PRESENT | L25 "Skipping the SIM review is how cascade bugs get through. Non-negotiable." |

Totals workflow-02: PRESENT 8 / PARTIAL 1 / MISSING 0 (9 rules).

## workflow-03-implementation (A block line 49; summary lines 1-42)
| # | A-block rule (short) | verdict | summary line + quote, or what is missing |
|---|---|---|---|
| 1 | CC edits directly in the clone repo on the migration branch | PRESENT | L11 "Edit directly in your own clone, on `migration/aws-supabase`" |
| 2 | Surgical edits explicitly documented; no speculative refactoring | PRESENT | L12 "Surgical edits, explicitly documented. No speculative refactoring." |

Totals workflow-03: PRESENT 2 / PARTIAL 0 / MISSING 0 (2 rules).

## workflow-04-code-review (A block line 104; summary lines 1-97)
| # | A-block rule (short) | verdict | summary line + quote, or what is missing |
|---|---|---|---|
| 1 | Langston reviews the actual git diff AT THE GRADED REF origin/migration/aws-supabase, AFTER push to the review branch, BEFORE it advances to main | PRESENT | L11 "AFTER the push to the review branch and BEFORE it advances to `main`" |
| 2 | Code-level, not high-level gloss | PARTIAL | reviews "the diff" (L8) but the explicit code-level-not-gloss requirement is not stated |
| 3 | Change list in Claude Comms and Packages/Change Lists/ | PRESENT | L15 "Write the change list to `Claude Comms and Packages/Change Lists/`" |
| 4 | Unpushed diff does not exist for him (reads at a ref); commit and push before dispatching | PRESENT | L11 "An unpushed diff is a file that does not exist for him" |
| 5 | The review gate is the advance to main, not the push to the review branch | PRESENT | L12 "The gate is the advance to `main`, not the push to the review branch." |
| 6 | Correction record 2026-07-23 (Kyle quote "Langston reviews the review branch on GitHub, so it's already been pushed"); old "BEFORE push" wording contradicted §6.5 and reality | MISSING | correction date, Kyle quote and the contradiction history not in summary |

Totals workflow-04: PRESENT 4 / PARTIAL 1 / MISSING 1 (6 rules).

## workflow-05-ci (A block line 42; summary lines 1-35)
| # | A-block rule (short) | verdict | summary line + quote, or what is missing |
|---|---|---|---|
| 1 | Push to GitHub | PARTIAL | only the title L6 "GITHUB PUSH + CI"; no body instruction to push |
| 2 | CI runs 4 jobs: TypeScript Check, Test Suite, Build, Docker Build | PRESENT | L11 "TypeScript Check (baseline gate) · Test Suite · Build · Docker Build" |
| 3 | All 4 must be GREEN | PRESENT | L8 "all four jobs are green, verified per-job" |
| 4 | Do not push on top of red CI | PRESENT | L19 "NEVER PUSH ON TOP OF RED CI." |

Totals workflow-05: PRESENT 3 / PARTIAL 1 / MISSING 0 (4 rules).

## workflow-06-deploy (A block line 61; summary lines 1-54)
| # | A-block rule (short) | verdict | summary line + quote, or what is missing |
|---|---|---|---|
| 1 | Deploy command: ssh root@188.245.193.8 "su - deploy -c 'dt-deploy <full-40-char-sha> --by <session>'" | PRESENT | L12 identical command |
| 2 | B-DEPLOY-LOCK #649: dt-deploy is THE deploy path, NEVER the raw git-pull/build/restart chain | PARTIAL | L10, L14 "NEVER the raw git-pull/build/restart chain". Attribution only: "B-DEPLOY-LOCK #649" absent |
| 3 | It locks against concurrent deploys, refuses a dirty worktree, conditionally npm ci on lockfile change, asserts sha-identity + ENGINE RESUMED before recording | PRESENT | L14 same list |
| 4 | db:migrate runs in-chain "per the SYSTEM_MANUAL invariant" | PARTIAL | L14 "runs `db:migrate` in-chain". Missing: the SYSTEM_MANUAL invariant citation |
| 5 | --pre-restart '<npm script>' for batch-specific steps | PRESENT | L15 same |
| 6 | The sha is the FULL 40-char reviewed commit, #621 | PARTIAL | L15 "The sha is the FULL 40 characters of the REVIEWED commit." Attribution only: #621 absent |

Totals workflow-06: PRESENT 3 / PARTIAL 3 / MISSING 0 (6 rules).

## workflow-07-verify-cc (A block line 93; summary lines 1-86)
| # | A-block rule (short) | verdict | summary line + quote, or what is missing |
|---|---|---|---|
| 1 | Check PM2 logs | PRESENT | L38 "PM2 logs, psql, CI status, server health" |
| 2 | psql to Supabase | PRESENT (superseded form) | L39 "A database read goes through `dt-sql` ... never a hand-built `psql` login"; L39 states the A line is preserved history |
| 3 | UI via Claude-in-Chrome | PRESENT | L23 "`mcp__claude-in-chrome__*` ... THE ONLY SURFACE FOR STAGING" |
| 4 | CI status, server health | PRESENT | L38 |
| 5 | Capture evidence | PRESENT | L8 "evidence is captured and the UI has been navigated" |

Totals workflow-07: PRESENT 5 / PARTIAL 0 / MISSING 0 (5 rules).

## workflow-08-verify-langston (A block line 33; summary lines 1-28)
| # | A-block rule (short) | verdict | summary line + quote, or what is missing |
|---|---|---|---|
| 1 | Independent UI + evidence verification (Langston) | PRESENT | L10 "Independent UI + evidence verification." |
| 2 | Mandatory | PRESENT | L10 "Mandatory." |

Totals workflow-08: PRESENT 2 / PARTIAL 0 / MISSING 0 (2 rules).

## workflow-09-iterate (A block line 35; summary lines 1-30)
| # | A-block rule (short) | verdict | summary line + quote, or what is missing |
|---|---|---|---|
| 1 | If any scope objective not met: fix -> Langston reviews -> push -> deploy -> verify | PRESENT | L10 "fix → Langston reviews → push → CI → deploy → verify" (adds CI) |
| 2 | Repeat until all green | PRESENT | L10 "Repeat until all green." |

Totals workflow-09: PRESENT 2 / PARTIAL 0 / MISSING 0 (2 rules).

## workflow-10-governance (A block lines 272-288; summary lines 1-267)
| # | A-block rule (short) | verdict | summary line + quote, or what is missing |
|---|---|---|---|
| 1 | Update ALL applicable Tier 1 + Tier 2 docs | PRESENT | L8 "every applicable Tier-1 and Tier-2 document has landed its CONTENT update" |
| 2 | Batch touched architecture/math -> update SYSTEM_MANUAL.md | PRESENT | L111 class table "SYSTEM_MANUAL.md ... REQUIRED"; L149 "architecture · strategy logic ... quantitative math" |
| 3 | Batch touched components -> update SYSTEM_IMPACT_MAP.md | PRESENT | L112; L150 "any component added / removed / re-keyed" |
| 4 | Failing to update either when applicable = incomplete batch | PRESENT | L73 "If SIM or System Manual were applicable but not updated, batch not complete." |
| 5 | MANDATORY 10.b Langston memory sync at the same time as own MEMORY (Kyle directive 2026-05-07) | PARTIAL | L205 "in the same turn you update your own". Attribution only: "Kyle directive 2026-05-07" absent |
| 6 | Update /home/langston/MEMORY.md on Hetzner with batch closure + sequencing changes + operational invariants | PRESENT | L205 "batch closure, sequencing changes, operational invariants" |
| 7 | His MEMORY auto-loads every claude -p invocation; stale -> wrong baseline | PRESENT | L205 "auto-loads every invocation — stale memory means a wrong baseline" |
| 8 | Mirror your MEMORY structure (state block, recent-batch row, sequencing update, open-issue diff) | MISSING | not in summary |
| 9 | Keep <=200 lines: SUPERSEDED, load capped as a SUM, read both numbers from langston-size-watch --status | PRESENT | L205 sum cap and `langston-size-watch --status` |
| 10 | Sync recipe (edit the PART, discover it, sha of fetched bytes, langston-memory-write with deltas) | PRESENT | L217-236 full recipe |
| 11 | The /tmp + cp recipe is replaced (B-LANGSTON-CONTEXT P-6b, 2026-09-11) and why (fixed pre-creatable path, no CAS, no copy) | PRESENT | L207-211 |
| 12 | Update /home/langston/CLAUDE.md only when comms protocol or his persona changes (rare) | MISSING | not in summary |
| 13 | Repo-side docs reach Langston off the REVIEW BRANCH, so a doc he needs must be pushed, not merely saved (LANGSTON_ARCHITECTURE.md §6) | MISSING | not in summary (L160 names LANGSTON_ARCHITECTURE.md only as a doc row) |

Totals workflow-10: PRESENT 9 / PARTIAL 1 / MISSING 3 (13 rules).
Note (outside the A block, flagged): the file continues after the A block with "Moved from CLAUDE.md — B-TOKEN-ECONOMY P5" (lines 292-300, block P5-44: reorganizing is not updating, Kyle directive 2026-06-16, sub-batches get their own governance, judge applicability explicitly). It is a separate moved block, not the A block; if "archive the A block" is implemented as cutting from the heading to end of file, that block would go too. Its substance is partly carried at summary L201-202 (anti-patterns), but not the 2026-06-16 attribution or the sub-batch rule.

## workflow-11-completion (A block line 95; summary lines 1-90)
| # | A-block rule (short) | verdict | summary line + quote, or what is missing |
|---|---|---|---|
| 1 | Scope objectives checklist YES / NO / PARTIAL + evidence | PRESENT | L27 "YES / NO / PARTIAL, each with its evidence" |
| 2 | List ACTUALLY-edited governance files (including Langston's MEMORY per 10.b) | PRESENT | L28 "governance files ACTUALLY changed (including Langston's MEMORY)" |
| 3 | Save to Claude Comms and Packages/Batch Completion/BATCH_N_COMPLETION_REPORT.md | PRESENT | L26 |
| 4 | Langston reviews + confirms | PRESENT | L8 "Ends when: Langston confirms." |
| 5 | Batch CLOSED only after Kyle's acknowledgment | PRESENT (superseded) | L8 "Kyle does NOT acknowledge a close"; the A block itself marks this superseded |
| 6 | SUPERSEDED 2026-09-02 (Kyle): a close needs no acknowledgement | PRESENT | L8 "(Kyle, 2026-09-02: never block on him for an ack ...)" |

Totals workflow-11: PRESENT 6 / PARTIAL 0 / MISSING 0 (6 rules).

## Grand totals
PRESENT 50 / PARTIAL 15 / MISSING 9 (74 rules) across the 11 skills. Skills 03, 07, 08, 09, 11 are fully carried; 01 and 10 hold most of the gaps.

## Re-check at the graded ref (Langston gate 3, Q10 d, 2026-11-20)
Population: the 9 MISSING rows above, re-read in the step skills at `origin/migration/aws-supabase`. Five are now carried by the summary; the sentence "every rule in it is carried by the summary above" therefore holds at the ref for every rule except four origin or history items, which the archive keeps by design.
| row | rule | now | where |
|---|---|---|---|
| wf-01 M16 | (5) routes to rule 18/section 15 (delete on the spot or a placed deletion, DELETED_COMPONENTS_LOG + _archive) | CARRIED | `workflow-01-scope/SKILL.md:32` ("(5) routes to CLAUDE.md rule 18") |
| wf-01 M17 | why (5) exists (reconnect risk, false "connected") | CARRIED | `workflow-01-scope/SKILL.md:32` ("Why (5) exists") |
| wf-10 M8 | mirror your MEMORY structure in Langston's MEMORY | CARRIED | `workflow-10-governance/SKILL.md:208` (10.b) |
| wf-10 M12 | update /home/langston/CLAUDE.md only for comms-protocol or persona change | CARRIED | `workflow-10-governance/SKILL.md:208` (10.b) |
| wf-10 M13 | repo-side docs reach Langston off the review branch, so push them | CARRIED | `workflow-10-governance/SKILL.md:208` (10.b) |

**Still MISSING from the summary, assigned to the archive (4):** wf-01 M4 (the B79.0n.STRATEGY origin case), wf-01 M8 (the #174 seven-weeks case), wf-01 M19 (Kyle's cost reasoning for the five dispositions), wf-04 M6 (the 2026-07-23 correction record). Each is an origin case, a rationale or correction history, which the archive pointer (`1-system-manual/_archive/WORKFLOW_SKILL_ORIGINAL_TEXT.md`) assigns to the archive; none states a rule a session must follow.

**Totals at the graded ref (74 rules):** PRESENT 55 / PARTIAL 15 / MISSING 4 (was PRESENT 50 / PARTIAL 15 / MISSING 9 at the pre-move ref). Line numbers are the committed files' and can move by a line or two; locate by the quoted text.

## Every PARTIAL and MISSING item, with the A-block wording to carry
### workflow-01-scope
- P2: "(Kyle directive 2026-05-24)" on MANDATORY 1.a.
- M4: "See history doc §2.1a for the discipline origin (B79.0n.STRATEGY scope v1 underestimated caller surface 2 → 7 files; v2 fixed via compile-driven probe; reading upfront would have saved an iteration)."
- P5: "(Kyle directive 2026-07-29 — REQUIRED IN EVERY SCOPE, not just audits)" and "This EXTENDS §9.5(b), which required a provenance read only for audits and disputed behaviour; it is now a standing scope obligation for all implementation batches." Also "helper" in the list.
- P6: "TIERED, because an unbounded rule gets quietly skipped (Langston amendment D)" and "Kyle's cost argument is strongest on tier 1, and a 40-file batch cannot do tier 1 on everything."
- M8: "(#174 was missed for seven weeks because the search was for the symptom; the filename would have returned it instantly)".
- P9: "(Langston amendment C) — P19-B-RENAME (2026-07-03) renamed the whole `active-*` family plus three tables".
- P10: "then READ the introducing commit's message and any attached directive".
- P11: "plus the old unorganised phase/batch reports in the archived folders".
- P13: "EVIDENCE STANDARD (Langston amendment B)" and "(#452: a reviewer ruling on your gloss is ruling on the wrong thing)".
- P14: "#453: an asserted absence of provenance needs presence-evidence. Without this box, a scope under pressure picks the most plausible disposition and asserts it, which is exactly the `0.7`-default failure this rule cites."
- M16: "(Langston amendment A; route to rule 18/§15: delete on the spot or a placed deletion, `DELETED_COMPONENTS_LOG` + `_archive`)".
- M17: "(5) exists because without it dead code hits no box and the nearest are (3) "reconnect" — wrong, and precisely the accidental-re-entry risk §15 exists to prevent — or (4), which falsely asserts it is connected."
- M19: "WHY THIS EARNS ITS TOKEN COST (Kyle's own reasoning ...): ... re-litigating "fixes" to things that were working, retracting announced causes, and wild-goose chases ... Rule 24's three outcomes (real defect / working-as-designed-but-unaddressed / legacy that no longer fits) are unanswerable without the intent, so skipping this read does not save the cost — it defers it into a more expensive form."
### workflow-02-audit-and-plan
- P6: "(deeper than Step 1.a — per-component upstream + downstream + shared-state + background-execution + blast-radius enumeration)".
### workflow-04-code-review
- P2: "Code-level, not high-level gloss."
- M6: "(Corrected 2026-07-23 — Kyle: "Langston reviews the review branch on GitHub, so it's already been pushed." The old "BEFORE push" wording contradicted §6.5's own instruction to commit-and-push before dispatching, and contradicted reality ...)"
### workflow-05-ci
- P1: "Push to GitHub." (body instruction; only the title carries it).
### workflow-06-deploy
- P2: "(B-DEPLOY-LOCK #649: `dt-deploy` is THE deploy path ...)".
- P4: "runs `db:migrate` in-chain per the SYSTEM_MANUAL invariant".
- P6: "The sha is the FULL 40-char reviewed commit — #621."
### workflow-10-governance
- P5: "MANDATORY 10.b — Langston memory sync (Kyle directive 2026-05-07)".
- M8: "Mirror your MEMORY structure (state block, recent-batch row, sequencing update, open-issue diff)."
- M12: "Update `/home/langston/CLAUDE.md` only when comms protocol or his persona changes (rare)."
- M13: "Repo-side docs reach Langston off the REVIEW BRANCH — so a doc he needs must be pushed, not merely saved (`LANGSTON_ARCHITECTURE.md` §6)."
