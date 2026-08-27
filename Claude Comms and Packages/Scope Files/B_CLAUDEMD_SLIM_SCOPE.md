# B-CLAUDEMD-SLIM — SCOPE

change-class: non_architecture

**Owner:** CC-A · **Opened:** 2026-08-27 · **Placement:** `PHASE_19_PLAN.md` §governance queue, **position 5** *(was 7; the two batches folded in as Class C vacate positions 3 and 4)* · **Gate:** Langston, before any cut

> ★★ **THIS BATCH FINISHES WORK WE ALREADY DID AND DID NOT CLEAN UP.** Most of what it removes is **content we copied into a skill and then left behind in the always-loaded file.** It is not a new trim; it is the deletion half of `B-RULES-1c/1d`, which was never run.

---

## 1. WHY THIS EXISTS — AND THE MEASUREMENT THAT MAKES THE CASE

**`CLAUDE.md` loads into every session on every start, resume and compaction.** It is **112,787 B — about 64% of everything a session loads before it does anything.**

⚠️ **AND THE PREVIOUS SLIM IS BEING GIVEN BACK. Measured from the file's own history:**
| | |
|---|---|
| peak, before the slim (2026-08-21) | 122,354 B |
| low-water mark after it (2026-08-23) | **108,513 B** |
| today (2026-08-27) | **112,787 B** |

⇒ **The slim won 13,841 B. In four days 4,274 B has come back — 31% of the gain.** ⛔ **Nobody was careless: every one of those additions is a Kyle directive or a Langston condition.** The file is simply **the default destination for any new rule**, and nothing competes with it.
★ **So the real finding is not "the file is big" — it is that THE FILE GROWS BACK, and a one-off trim does not change that.** This batch removes what already has a home; **it does not solve the regrowth**, and §5 says so.

---

## 2. THE CANDIDATES — **RE-DERIVED PER CLAUSE (r2, Langston bounce 2026-08-27)**

⛔⛔ **r1 CLASSIFIED AT SECTION GRANULARITY. THE FILE’S UNIT IS THE CLAUSE, AND EVERY SECTION HERE MIXES TWO DIFFERENT TRIGGERS.** Langston: *"a distinctive phrase from §9.1 IS present in `workflow-11` — so phrase-match plus a negative control returns **duplicate** on a section that is **75% copied**. The negative control catches a broken query; it cannot catch a partial copy."*

⚠️ **AND MY SECOND ATTEMPT FAILED THE OTHER WAY, WHICH IS WORTH RECORDING: an exact 9-word-run matcher returned 0 of 3 and 0 of 3 — reporting as ORPHAN two clauses that ARE copied, condensed.** ⇒ **NEITHER MATCHER CAN DECIDE THIS. Too loose says "duplicate" on a partial copy; too strict says "orphan" on a reworded one.** ★ **The instrument is READING the destination and judging — which is what Langston did, and it is why this table has a stated disposition per clause rather than a score.**

### ★★ THE GENERALISABLE FINDING, and it is bigger than this batch
**EVERY ONE OF THESE SECTIONS CONTAINS BOTH STEP-TRIGGERED AND CONVERSATION-TRIGGERED CLAUSES, INTERLEAVED.** That is *why* section-level classification cannot work here — not because my check was sloppy, but because **the section is not the unit the trigger lives at.** A rule that fires *"when Kyle says X"* and a rule that fires *"at step 11"* sit in the same paragraph, and only one of them can move.

### THE DISPOSITION TABLE — every clause accounted for

| § | clause | already in a skill? | **disposition** |
|---|---|---|---|
| **9.1** | *"any sub-batch shipping scaffolding MUST state it at the TOP, in bold, separated"* | ✅ `workflow-11`, condensed | **CUT** — Class A |
| **9.1** | *"**equally applies in REAL TIME** — mid-conversation, as a bold-prefixed inline disclaimer, not a parenthetical"* | ⛔ **nowhere** | ⛔ **STAYS — §3-protected.** It fires **mid-conversation**, not at step 11. There is no skill a session has open when it happens. |
| **9.1** | pointer to the origin cases in the history doc | n/a | **stays with the surviving clause** |
| **9.2** | *"any change to a previously-stated number → PREVIOUSLY STATED / NOW / REASON"* | ✅ `workflow-11` | **CUT** — Class A |
| **9.2** | *"**PRE-AUDIT** and completion reports MUST carry a PREVIOUSLY-STATED-VS-NOW section at the top"* | ⚠️ **completion half only** | ★ **CARRY IT TOO** — the pre-audit half has no home. Into `workflow-02`, **then** cut. |
| **9.2** | *"applies retroactively to IN-FLIGHT communications — lead the next message with the block"* | ⛔ **nowhere** | ⛔ **STAYS — §3-protected.** Fires in conversation. |
| **9.3** | the curl-isn’t-verification half · the by-default half | ✅ `workflow-07:10-16` **(Langston verified at the ref)** | **CUT** — **Class A, not B.** r1 had this as a move; it is already there. |
| **9.3** | *"when Kyle ASKS for verification, it is not optional"* · *"no assumptions when Kyle REPORTS issues"* | ⛔ nowhere | ⛔ **STAYS — §3-protected. Both fire on a KYLE UTTERANCE, not at step 7.** |
| **9.5** | census · deletion-time census · provenance read | ⚠️ **partially — see the block below** | ⛔ **NOT Class A. RE-CLASSIFIED r3 — CLASS B WITH A CARRY-ACROSS LIST.** |
| **r19** | the four job names **+ the `gh run list` command form** | ✅ job names in `workflow-05` | **CUT, WHOLE.** ★ **The command form comes forward too (Langston):** leaving the job list in one home and the command that checks it in another is the two-sources shape, self-inflicted. |
| **r23** | fix-on-find | — | ⛔ **STAYS — r1 had it as a move and that was wrong.** It fires *when work surfaces a remnant* — at step 2, 4, 7 **or a plain conversation.** A session doing a pre-audit would not have it if it lived in `workflow-03`. |

**REVISED TOTAL: §9.5 (6,038 B) + the two cut clauses of §9.1/§9.2 + §9.3’s two copied halves + rule 19 whole.** ⚠️ **DELIBERATELY NOT RESTATED AS A SINGLE BYTE FIGURE UNTIL THE CUTS ARE DRAFTED** — r1’s headline number was a section-level sum, and section sums are exactly what this bounce refuted. **The figure gets re-derived from the actual diff, not predicted.**

⚠️ **FOUR HELD BACK, three confirmed by Langston** — §7.1 batch-close sync gate, §6.5 file-first dispatch, §6.7 iterate-to-consensus: **all fire unprompted, hold them.** ★ **The fourth — rule 19’s command form — he PULLED FORWARD; it is now in the table above.**

---

### ⛔⛔ §9.5 — RE-CLASSIFIED (r3). **A FRESH-CONTEXT REVIEWER FOUND CONTENT THAT WOULD HAVE BEEN DESTROYED, INCLUDING THE CLAUSE THE SECTION IS NAMED AFTER.**

**HOW THIS WAS FOUND, because the provenance matters:** Kyle noticed the fresh-context reviewer we designed **had never once been spawned** — the gate was mine. He granted standing approval; **this was run one**, pointed at the claim Langston was about to rule on. ★ **It contradicted a ruling he had already given** (*"the substance is in `workflow-01` + `workflow-02`, condensed — Class A is still safe for §9.5"*).
⚠️ **THE REVIEWER’S OUTPUT IS A CLAIM, NOT A VERDICT. I RE-DERIVED EVERY ITEM BELOW MYSELF** with `grep -c` against `CLAUDE.md` and both skills, **with a positive control** — `COMPONENT CENSUS AT EVERY HOP` returns 1 in `CLAUDE.md` and 1 in `workflow-02`, so the query works and the zeros are real absences.

**MEASURED — present in `CLAUDE.md`, ABSENT from BOTH skills:**
| clause | CLAUDE.md | wf-02 | wf-01 |
|---|---|---|---|
| *"tracing forward from one entry point structurally CANNOT discover a second entry point"* | 1 | **0** | **0** |
| *"enumerate every scheduler, timer, clock subscription, service `.start()`, bootstrap call, cron and event subscription FIRST, repo-wide"* | 1 | **0** | **0** |
| *"state each list in the audit"* | 1 | **0** | **0** |
| *"the canonical corpus is a frozen historical record and is NOT edited"* (+ the obligation to update SIM / System Manual instead) | 1 | **0** | **0** |
| the `rule 22` citation — *asserted absence needs presence-evidence* | 2 | **0** | **0** |
| the five named `bridge/canonical/` files | 1 | **0** | **0** |
| *"(does mechanism 2 respect mechanism 1’s in-flight guard?)"* | 1 | **0** | **0** |
| *"The synthesis is the point, not the inventory"* + the four history-doc pointers | 1 | **0** | **0** |

★★ **THE FIRST TWO *ARE* THE ENTRY-POINT ENUMERATION — the phrase in the section’s own title — and they are in neither skill.** Not trimmed evidence: **a standing instruction to enumerate every scheduler, timer, `.start()`, bootstrap, cron and event subscription BEFORE tracing.** That is the exact discipline whose absence let the RTB dual-mechanism run seven months through two audits.

⛔ **AND A NARROWING NOBODY HAD NOTICED. §9.5 reads, verbatim: *"Two mandatory steps for ANY audit, pre-audit, **or architectural dispute** touching a subsystem."* Both skills fire ONLY at their own numbered step** (*"STEP 1 ONLY"* / *"STEP 2 ONLY"*). ⇒ **a standalone audit, or an architectural dispute outside a batch, would lose the discipline entirely. That fails toward SILENCE**, which is the direction that costs us.

⚠️ **THE ADDRESS PROBLEM, separate from the substance and measured: `§9.5` is cited 290 times across 103 files.** Cutting the section leaves every one of those resolving to nothing — **true even if every clause had travelled.**

★ **AND ONE OBSERVATION I PASS ON AS THE REVIEWER’S, NOT MINE:** both skills declare their **`§2` verbatim block authoritative over their own summary** — *"a derivation is not the rule."* **All §9.5 material sits in the summary halves.** So even where present, it lives in the half each file says is non-binding.

⇒ **REVISED PLAN FOR §9.5 — CLASS B, and the cut is the LAST step, not the first:**
1. **CARRY ACROSS to `workflow-02`, verbatim:** the entry-point-enumeration clause, *"state each list in the audit"*, the in-flight-guard parenthetical, the `rule 22` citation, the frozen-corpus + update-current-docs obligation, and the five named canonical files.
2. **WIDEN THE TRIGGER** so the discipline reaches a standalone audit or dispute — **it belongs in the `bug-investigation` skill C-1 builds**, which is exactly the *"ANY audit"* case with no home today. ★ **C-1 and this are now coupled: neither ships without the other.**
3. **KEEP A POINTER AT §9.5’s ADDRESS** so the 290 citations resolve. ⛔ **Do not delete the anchor.**
4. **ONLY THEN cut the body**, re-verified clause by clause with the control above.

★★ **AND THE STANDING LESSON, which outlives this batch: "the substance is there, condensed" IS A JUDGEMENT, AND IT WAS MADE BY THE TWO PEOPLE WHO ALREADY BELIEVED THE MOVE WAS SAFE.** A reader with no memory of forming that belief produced a list of eight specific absences in one pass. ⚠️ **One run, one claim, and it is the run I chose — that is a positive result, not proof the mechanism generalises.**

---

### CLASS C — TWO THINGS THIS BATCH **BUILDS**, not moves (Kyle directive 2026-08-27)

> ⚠️ **BOTH WERE FOUND BY THIS BATCH’S OWN SCAN AND I FIRST PARKED THEM AS SEPARATE QUEUED BATCHES. Kyle’s correction: *"don’t just tell me about the fact that we don’t have a skill file for it, and then not actually propose or plan to fix it in the scope."*** ★ **That is the `#9.4` failure one level up — naming a defect and giving it a queue slot READS as handling it. Reporting is not proposing.**

#### C-1 — **BUILD the bug-investigation skill** *(#750)*
**`CONDUCT.md:145` tells every session, on every start, to *"load the bug-investigation skill"* — and the skill does not exist.** Its own caveat reads *"until `B-RULES-1d` lands"*; **`B-RULES-1d` closed 2026-08-25 without building it.** The source has been staged at `1-system-manual/_pending-skills/bug-investigation-SOURCE.md` since — the only file in that directory.
**BUILD:** the skill, from that staged source, at `.claude/skills/bug-investigation/`. **Then DELETE the staged file** — `B-RULES-1d`'s own instruction, never carried out.
★ **AND IT CARRIES A PIECE THAT HAS NOWHERE ELSE TO LIVE:** Kyle directed database/table searching into **both** the pre-audit and error-investigation skills. **The pre-audit half exists; the other half has had no home to go to.**
**THEN:** `CONDUCT.md` §9's pointer loses its *"not built yet"* caveat and its dead batch reference — **which also frees bytes in the capped file.**
**VERIFY:** the skill parses, appears in the listing with a surviving `description` (the `#740` check), the staged file is gone, and **no pointer anywhere still says "not built yet"** — grepped, with a negative control.

#### C-2 — **EVERY RECIPIENT NAMED ON EVERY PART OF A SPLIT MESSAGE** *(#749)*
**MEASURED:** of the last 400 real posts, **124 carry no recipient and wake every session — and 123 of those are continuation chunks**, not careless messages. `comms-infra/discord/discord_common.py:252-256` already stamps every chunk of a **Langston-addressed** post; **every other multi-chunk post sends bare parts.** Chunk 0 has the name because the author typed it; the rest have nothing.

⛔⛔ **AND KYLE’S REQUIREMENT IS WIDER THAN "CARRY THE NAME FORWARD", WHICH IS WHAT I HAD SCOPED: WHEN A MESSAGE ADDRESSES SEVERAL RECIPIENTS — two sessions, or a session PLUS Langston — **ALL OF THEM MUST BE NAMED ON EVERY PART**, not just the first name found.**
★ **THAT IS NOT A DETAIL, IT IS THE HARDER HALF.** A single-name carry-forward would silently DROP the second and third recipients from parts 2..N — **so the very sessions a multi-party message was addressed to would stop being woken by most of it.** That is a *narrower* wake than today’s broadcast, and it fails toward SILENCE, which is worse than noise.
**BUILD:** extract the full recipient set from part 1 and stamp **all** of it on every subsequent part; widen the existing stamping from the Langston-only branch to all multi-chunk sends.
⛔ **NO RULE AND NO DISPATCHER REFUSAL (Kyle):** the single careless post is **n=1**, and *"a mechanism built for n=1 is the same error as a rule built for n=1, just harder to remove later."*
**VERIFY:** a multi-part post addressed to **two sessions plus Langston** — every part names all three; the wake filter fires for both sessions on **every** part, not just the first. **Positive control: a single-recipient post still wakes only that one.**

---

## 3. WHAT MUST NOT MOVE — the boundary, restated because it is the failure mode

⛔ **ANYTHING A SESSION MUST HOLD *BEFORE* IT KNOWS WHAT IT IS DOING STAYS IN `CLAUDE.md`.** The eight read-first non-negotiables · the plain-language and canonical-terms rules · measurement discipline · the storage and commit rules.
★ **AND THE SHARPER TEST, from the `B-RULES-1d` scope's own finding (B): a rule that must fire UNPROMPTED is doubly wrong as a skill** — it depends on a description the listing budget may silently drop, so its trigger is exactly the thing that cannot be relied on.

⚠️ **§9.4 (every deferred item gets a real placement) STAYS.** It fires when something is *surfaced* — not at any workflow step — so there is no skill it could live in. **Correctly in the rules file.**

---

## 4. VERIFICATION — and the control, because "the text is in the skill" is the load-bearing claim

**PER CANDIDATE, before its cut:**
1. **The destination skill contains the content** — checked by a distinctive phrase from the moved text, read at `origin/migration/aws-supabase`, **not** from the working tree.
2. ⛔ **A NEGATIVE CONTROL: the same check run against a skill that should NOT contain it must return zero.** Without that, a broken query returns "present" for everything and every cut looks safe. *(This is not hypothetical — a check of exactly this shape returned four false zeros on 2026-08-27 because a path was mangled, and the zeros read as "absent".)*
3. **`CLAUDE.md` still parses as one document**, section numbering intact, and **every inbound `§` citation still resolves** — §9 alone carries 237 of them.
4. **All twelve skills still parse** (frontmatter loads, `description` survives) — the check that already caught one self-inflicted break.

**WHOLE-BATCH:** the next session start's loaded-set measurement **drops by approximately the sum of the cuts** — the programme's own instrument, measured rather than asserted.

---

## 5. WHAT THIS BATCH DOES *NOT* FIX — stated so nobody reads it as solved

⛔ **IT DOES NOT STOP THE REGROWTH.** 4,274 B returned in four days while this file was being trimmed by the same session. **A one-off cut against a steady inflow buys time, not a solution.**
★ **The structural question — *what makes the rules file the default home for every new rule, and what would change that?* — is NOT scoped here and should not be smuggled in.** It is the harder problem and it deserves its own argument. Naming it here so the completion report cannot claim more than was done.
