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

## 2. THE CANDIDATES — TWO CLASSES, DIFFERENT RISK, HANDLED DIFFERENTLY

⛔ **THE SPLIT IS THE WHOLE DESIGN. "Delete a duplicate" and "move content then delete" are not the same operation and must not be run as one pass.**

### CLASS A — DUPLICATES. The text is ALREADY in the skill, verbatim. Deleting the original removes nothing.
| section | size | already lives in |
|---|---|---|
| §9.5 architectural audits (census, deletion-time state-write census, provenance read) | **6,038 B** | the pre-implementation audit skill **and** the scope skill |
| §9.1 scaffolding declaration | **662 B** | the completion report skill |
| §9.2 numeric deltas | **718 B** | the completion report skill |
| **CLASS A TOTAL** | **7,418 B** | |

### CLASS B — MOVES. The rule is in `CLAUDE.md` and **NOT** in the skill that would use it. Content is carried across FIRST, verified, and only then cut.
| rule | size | destination (verified to exist) |
|---|---|---|
| §9.3 *"staging-verified" means UI-navigated* — **both halves**, including *when Kyle asks, it is not optional* | **2,570 B** | the first-pass verification skill |
| rule 19 — the four green checks, named | **618 B** | the CI skill |
| rule 23 — fix-on-find | **1,471 B** | the implementation skill |
| **CLASS B TOTAL** | **4,659 B** | |

**COMBINED: 12,077 B — 10.7% of the file. After: ~100,710 B.** ✅ **Every CLASS A and CLASS B destination skill EXISTS today** — checked against the twelve on disk, not assumed. ⚠️ **This line read *"none needs creating"* until Class C was added; that is now FALSE — C-1 CREATES one.** Corrected rather than left, because a "nothing to build" claim is exactly what a reviewer would rely on.

⚠️ **FOUR MORE WERE FOUND AND ARE DELIBERATELY NOT IN THIS BATCH** — §7.1's batch-close sync gate, §6.5's file-first dispatch discipline, §6.7's iterate-to-consensus, and rule 19's `gh run list` command form. **Each needs a judgement about how much context a session needs BEFORE it knows which step it is on**, which is the one thing §4 says must never move. **They get their own pass once this one is proven.**

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
