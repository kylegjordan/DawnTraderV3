# B-CLAUDEMD-SLIM — IMPLEMENTATION PLAN (Step 3), FULLY AUDITED

**Owner:** CC-A · **Audit ref:** `origin/migration/aws-supabase` · **Scope r5 APPROVED** (`c7ce7d8ea`) · **Step-2 audit APPROVED with six conditions** (`34f33e963`)
**For:** Langston — sign-off before any cut. ⚠️ **The scope has moved a long way since you last saw the whole picture; this is the complete current state in one document.**

---

## 0. WHERE THE BATCH ACTUALLY IS — STATED FIRST BECAUSE IT IS NOT WHERE IT LOOKS

⛔⛔ **NONE OF THIS BATCH'S WORK HAS BEEN DONE. MEASURED, NOT ASSERTED: every item on the cut list is still in `CLAUDE.md`, the bug-investigation skill still does not exist, and the file is 117,191 B — it GREW during the batch meant to shrink it.**
★ **A day of scope, audit and three review rounds; step 3 has not started.** Kyle's read is correct: *"we keep adding to it."*

⛔ **THE GATE I PUT ON THIS BATCH IS LIFTED, and I was wrong to set it.** I gated step 3 on `B-EOL-NORMALISE` (#751) because byte figures are per-checkout. **Re-derived: `CLAUDE.md` is 117,191 B at the ref, stores ZERO CRLF, and the blob is one object identical for every clone.** ⇒ **the distortion exists only when measuring a WORKING COPY, which the verification must not do anyway.** ✅ **`#751` remains real and stays at queue position 8; its "before the slim" rationale is stale and is corrected in the same commit.**

---

## 1. THE AUDIT OF EVERY ITEM — AND THE INSTRUMENT THAT NEARLY GOT IT WRONG AGAIN

⚠️ **I first ran an EXACT-PHRASE census. It reported eight items as *"in the rules file only, must be carried."* THREE OF THOSE EIGHT WERE FALSE** — the destination holds them in different words.
★★ **That is the same failure that produced five false absences in the step-2 audit, run again with the same instrument.** ✅ **Corrected by your condition (iii): for every claimed absence, name the nearest wording at the destination and say whether it is the same proposition.** **The table below is the paraphrase-checked result; the exact-phrase result is discarded.**

| # | clause | destination | accepted line / rejected line | disposition |
|---|---|---|---|---|
| 1 | **§9.1 scaffolding declaration** | `wf-11` | ACCEPT `:35-37` heading + banner | ✅ **CUT + pointer** |
| 2 | §9.1 real-time half | — | — | ⛔ **STAYS** |
| 3 | **§9.2 numeric-delta block** | `wf-11` | ACCEPT `:40` *"PREVIOUSLY STATED: X. NOW: Y"* | ✅ **CUT + pointer** |
| 4 | **§9.2 PRE-AUDIT half** | `wf-02` | REJECT — zero hits on PREVIOUSLY / NOW / delta anywhere in `wf-02` | ⚠️ **CARRY, then cut** |
| 5 | §9.2 in-flight half | — | — | ⛔ **STAYS** |
| 6 | **§9.3 curl-is-not-verification** | `wf-07` | ACCEPT `:10-11` | ✅ **CUT + pointer** |
| 7 | **§9.3 by-default UI verification** | `wf-07` | ⛔ **ACCEPT `:14-16` — *"UI VERIFICATION IS THE DEFAULT, NOT AN EXTRA"* + the *"if there is genuinely no UI surface, SAY SO AND SAY WHY"* escape clause.** REJECTED my earlier read of `:8` | ✅ **CUT + pointer — MY CARRY WAS A FALSE ABSENCE** |
| 8 | §9.3 Kyle-asks + no-assumptions | — | — | ⛔ **STAYS** |
| 9 | **§9.5 component census** | `wf-02` | ACCEPT `:52-61` **including `:59` *"who **DELETES** here?"*** — ⚠️ my matcher first REJECTED that row because the phrase spans markdown bold markers; **the end-to-end read caught it within minutes** | ✅ **CUT + pointer** |
| 10 | **§9.5 deletion-time census** | `wf-02` | ACCEPT `:63-65` | ✅ **CUT + pointer** |
| 11 | **§9.5 provenance read** | `wf-02` | ACCEPT `:36`, `:47-48`, `:50` incl. the RECORDING RULE | ✅ **CUT + pointer** |
| 12 | ★ **§9.5 enumerate-FIRST ordering** | `wf-02` | REJECT — `:63-65` renders (a-ii) as the **state-write census only**; the ordering is absent | ⚠️ **CARRY — ⛔ PLACEMENT CORRECTED: ONE clause naming BOTH triggers (at an audit hop AND before any cut), or it is carried OUT of the deletion path it was written for** |
| 13 | ★★ **§9.5 TRIGGER BREADTH** | — | genuinely absent from `wf-02` — **but `wf-02:3` is gated `STEP 2 ONLY` in its own frontmatter** | ⛔⛔ **RECLASSIFIED TO *STAYS*.** ★ **Writing the trigger into a skill that REFUSES TO LOAD outside step 2 puts the rule behind the exact gate that excludes two of its three triggers — and it would READ AS COVERED.** An unscheduled architectural dispute has no step to invoke. **Cut §9.5's BODIES; keep the trigger line on the always-loaded surface.** |
| 14 | **rule 19 — the four job names** | `wf-05` | ⛔ **ACCEPT `:10-11` under `## THE FOUR JOBS`, verbatim incl. the *(baseline gate)* parenthetical, again at `:42`.** REJECTED my earlier read of the frontmatter | ✅ **CUT — MY CARRY WAS A FALSE ABSENCE** |
| 15 | **rule 19 — `gh run list` form** | `wf-05` | ACCEPT `:15` | ✅ **CUT** |
| — | *(rule 19's CLOSE trigger, which my table never asked about)* | `wf-11` | ACCEPT `:30` — *"CI run ID + green status, per-job"* | ✅ **covered** |

**⇒ CORRECTED TALLY: 9 CUT-AND-POINT · 2 CARRY (items 4, 12) · 4 STAY (2, 5, 8, 13).**

⛔⛔ **AND THE FINDING THAT MATTERS MORE THAN THE TALLY — LANGSTON’S, AND IT IS ABOUT ME, NOT THE MATCHER: MY PARAPHRASE PASS CAUGHT THREE FALSE ABSENCES AND MISSED TWO, BECAUSE THESE TWO WERE NOT PARAPHRASE FAILURES.**
★ **Item 7 read `:8` and stopped. Item 14 read the frontmatter and stopped.** ⇒ **BOTH ARE FIRST-SUFFICIENT-EXPLANATION-AT-THE-HOP — §9.5(a), APPLIED TO A FILE INSTEAD OF A CODE PATH.** ⚠️ **That is the rule this very audit invokes, committed inside the audit that invokes it, for the third time today.** **A better matcher does not fix it.**
✅ **NEW CONDITION, ADOPTED, AND IT RAN BEFORE THIS TABLE: READ EACH DESTINATION FILE END TO END ONCE, AND CITE THE LINE YOU REJECTED AS WELL AS THE LINE YOU ACCEPTED.** *(The files are 43-119 lines; the whole eleven-skill set is smaller than the file being cut.)* ★ **It paid immediately: item 9's `who **DELETES** here?` row came back a false REJECT from the matcher and the read found it at `:59`.**

---

## 2. THE PLAN, IN EXECUTION ORDER

| # | step | why this order |
|---|---|---|
| **P1** | **CARRY the five (items 4, 7, 12, 13, 14) into their destinations.** Item 12 lands as ONE clause adjacent to `wf-02:53` carrying the discriminator: **`:53` is INCURIOSITY at a hop the trace VISITED; the clause is UNREACHABILITY of a hop it never visited.** | ⛔ **Nothing is cut before its destination holds it. This is the whole safety property.** |
| **P2** | **VERIFY each carry at the ref** — destination contains it, plus a NEGATIVE control against a skill that should not | a check of this shape returned four false zeros on 08-27 |
| **P3** | **CUT the twelve (7 duplicates + the 5 now carried), each leaving a FORWARDING POINTER at its own section** | **F3-A: 841 citations resolve onto a hollowed section otherwise** |
| **P4** | ⛔ **REGIME B: `§9.5`'s heading survives as a HUSK carrying its four sub-labels `(a)`, `(a-ii)`, `(b)`, `(b-ii)` as named pointers; `rule 19`'s NUMBER survives as an explicit hole in the form of `CLAUDE.md:161`'s `11. *(removed)*`** | **242 of 341 §9.5 citations are SUB-citations a bare heading cannot serve; 840 citations span rules 1-29 so no renumber** |
| **P5** | ★ **NEW — KYLE 2026-08-28: `wf-07` states that staging is reached with the Chrome tool and NEEDS NO LOGIN.** *"I keep getting sessions telling me they can't go to the staging site because they need a login and password. They don't."* | ⛔ **A false blocker that has cost real verification steps. It removes the excuse.** |
| **P6** | **BUILD the bug-investigation skill from `_pending-skills/bug-investigation-SOURCE.md`, then delete the staged source** | `CONDUCT.md` §9 tells every session to load a skill that does not exist (`#750`) |
| **P7** | **BUILD `#749` — recipient stamped on every chunk of a multi-recipient post** | continuation chunks wake every session |
| **P8** | **SIM + System Manual content updates** — SIM carries 19 `§9.x` citations, `SYSTEM_MANUAL:517` points at `§9.5` by number | F4, F5 |
| **P9** | **`_archive/CLAUDE_MD_RULE_HISTORY.md` takes the evicted evidence** | F7 |
| **P10** | ⛔ **Re-measure with `git show <ref>:CLAUDE.md | wc -c` — NEVER a working-copy `wc -c` — and the second party reproduces THAT EXACT FORM.** ★ **Langston: the invariant relied on is *"measure at the ref"*, NOT *"this file has no CRLF"* — a checkout measurement re-opens the hole just closed.** | his conditions 3 + 4 |
| **P11** | **Update the skill-count check** — P6 builds a THIRTEENTH skill; `SCOPE:123` checks for twelve | F7/P8 |

⚠️ **P5 is new since your last sight of this batch. Everything else you have ruled on.**

---

## 3. WHAT I AM ASKING FOR

1. **Sign-off on the CARRY list (items 4, 7, 12, 13, 14).** ★ **The exact-phrase instrument called eight items absent and three of those were false — I would rather you checked my paraphrase judgement than trusted it, since I got this exact call wrong once already today.**
2. **Item 7 is the one I am least sure of: `wf-07:8` says *"the UI has been navigated"* but does not carry the by-default OBLIGATION.** **Is that a paraphrase or a different proposition?** I read it as different — *ends-when* is not *must-by-default* — but it is the closest call in the table.
3. **The lifted gate: do you accept that measuring at the ref dissolves the `#751` dependency?** ⚠️ **I set that gate on your F11 ruling and I am now removing it, so it should not go without your say.**
