# B-RULES-1d — SCOPE r1: skills extraction (Kyle's list as design input)

change-class: non_architecture
**Owner:** CC-A · 2026-08-07 · Sequence: the Langston-approved 1a→1e order (1a + 1b CLOSED; **1c PARKED on its two session-boundary gates — this leg is drafted in parallel because a SCOPE lands no change; nothing here ships before 1c clears**).

> **⚠️ GATING CORRECTED AT DRAFT TIME (against my own memory).** My memory carried *"1d skills, gated on B-MEASURE-GATE leg 2."* **That is wrong and I checked rather than repeating it:** `B_RULES_1B_COMPLETION_REPORT.md:22` shows it is the **rule-29 CONVERSION** whose hooks are leg 2, not this leg. **1d is gated on 1c's ORDER, not on #623.** *(Recorded because a false gate is a deferral nobody ever revisits.)*

---

## 1. WHY THIS LEG IS THE REAL LEVER — CONFIRMED VERBATIM AT ANTHROPIC'S DOCS
**`code.claude.com/docs/en/skills`, quoted exactly:** *"Unlike CLAUDE.md content, **a skill's body loads only when it's used**, so long reference material costs almost nothing until you need it."* Plus the authoring trigger, which describes our situation precisely: *"…or when **a section of CLAUDE.md has grown into a procedure rather than a fact**."*

⇒ ★★ **KYLE'S MODEL IS CORRECT AND IS NOW EVIDENCED, NOT ASSUMED.** This is the mechanism `@path` imports were NOT (`1a`: *"imported files load at launch"* — struck as a lever). **Procedures move; facts stay.**

---

## 2. ⛔⛔ TWO MECHANISM FINDINGS THAT CHANGE THE DESIGN — FOUND BEFORE BUILDING, PER THE 1c LESSON

### (A) ★★ KYLE'S EXACT QUESTION — "are parent → child skill references reliable?" — **THE ANSWER IS: NOT A DOCUMENTED MECHANISM.**
I searched the skills documentation for skill-to-skill composition — *invoke another · call another · chain · sub-skill · composable · from within a skill*. **Eight of eleven such patterns matched NOTHING.** What IS documented is different and narrower:
- **the Skill tool** — Claude invokes skills, and permissions govern which;
- **"a directory for supporting files"** — a skill may BUNDLE files it references;
- **nested/directory-qualified skills** (`apps/web:deploy`) — a NAMESPACE feature, not a parent/child call graph.

⛔ **CONSEQUENCE: do NOT build a parent skill that "calls" six children as though that were a supported mechanism.** A parent CAN name its children in prose and Claude MAY invoke them via the Skill tool — **but that is a BEHAVIOURAL expectation, not a documented guarantee, and this crew has spent a week paying for exactly that distinction.**
⇒ **DESIGN RULE: the workflow parent is a MAP, not a dispatcher.** Each step-skill must stand alone and be invocable by name, so the tree degrades to a flat set if the referencing behaviour proves unreliable. ★ **AND IT GETS THE 1c TREATMENT: a LIVE CANARY (a two-skill parent/child pair, exercised, observed) before any real procedure depends on the reference.**

### (B) ⛔⛔ THE FINDING THAT CUTS AGAINST A LARGE SKILL SET — **SKILL BODIES ARE FREE; SKILL *LISTINGS* ARE NOT, AND THEY DEGRADE SILENTLY.**
**Docs, verbatim:** *"Claude Code loads a listing of skill names and descriptions into context… **The listing always contains every skill name, but if you have many skills, Claude Code shortens descriptions to fit the listing's character budget, which can strip the keywords Claude needs to match your request.** When the listing overflows, Claude Code **drops descriptions starting with the skills you invoke least**, so the skills you use most keep their full text."* Budget = **1% of the context window**; per-entry text capped at **1,536 chars**.

⇒ ★★ **THIS IS THE ABSENT-AS-VALID CLASS AGAIN, AIMED STRAIGHT AT KYLE'S LIST.** An over-budget skill set does not error. The skill still lists, still works when invoked BY NAME — **it just silently stops being AUTO-invocable, because the description Claude matches on was truncated away.** ⛔ **And the drop order is precisely wrong for us: descriptions go FIRST from the LEAST-INVOKED skills — and the rare-by-design ones (provenance-read, mistake-and-correction, alert-assignment) are exactly the ones a session most needs prompting to remember.** A frequently-used skill does not need its description; **a rare one is nothing but its description.**

**Mitigations, all documented:** `skillListingBudgetFraction` (e.g. `0.02`) or `SLASH_COMMAND_TOOL_CHAR_BUDGET` · `skillOverrides: "name-only"` for low-priority entries · put the key use case FIRST in each description · **`/doctor` reports the listing's context cost + biggest contributors** · **`--debug` writes a warning when the listing overflows.**
✅ **MEASUREMENT IS TRUSTWORTHY AT OUR VERSION:** the `/context` Skills row reports the size **after** the budget is applied — *"Before v2.1.196, the row counted the full text of every description and could show a value several times larger."* **We measured 2.1.219 (1c r4), above that gate ⇒ the instrument reports what the model actually receives.**

---

## 3. THE CANDIDATE SET — KYLE'S LIST, WITH THE BUDGET APPLIED
**Kyle's list (his intent, verbatim in substance):** a **workflow** parent referencing per-step children — **scope · pre-implementation-audit · implementation · deployment · verification · governance-batch**; plus **push-queue/deploy · error-investigation · alert-processing · DB/table search · provenance-read · when-to-comment-on-another-session's-work · Langston's alert-assignment · mistake-and-correction (WITH ITS OWN TRACKED FILE)**.

⚠️ **THAT IS ~14 ENTRIES. Finding (B) makes the count itself a design variable** — the honest question is not *"is each skill worth writing?"* but *"which entries can afford to lose their description?"*

**Kyle's own two corrections, both adopted:**
1. ⛔ **The history/intent (provenance) read does NOT get absorbed into error-investigation.** Kyle disagreed with folding it: **it belongs in SCOPE and PRE-AUDIT** — which matches §2 1.b (a standing scope obligation) and §24.0 (every found bug gets its own provenance read). ⇒ **provenance content appears in the scope + pre-audit skills; error-investigation REFERENCES it rather than owning it.**
2. **Database/table searching belongs in BOTH pre-audit and error-investigation.**

**His stated goal for the mistake-and-correction skill, verbatim in intent — and it is the acceptance test for that one:** *stop the six-hour monologues about what went wrong and where it will never happen again.* ⇒ **that skill must make a correction SHORTER, not add a ritual. If a draft of it would have lengthened any correction this week, it fails.**

---

## 4. WHAT MOVES — AND THE ONE THING THAT MUST NOT
✅ **MOVES: PROCEDURES** — ordered steps a session executes when already doing that kind of work (the docs' own trigger: *"a procedure rather than a fact"*).
⛔ **STAYS IN `CLAUDE.md`: anything a session must hold BEFORE it knows what it is doing** — THE EIGHT, the plain-language + canonical-terms rules, measurement discipline (rule 29), the comms protocol, §7.1 storage flow. ★ **Rule 29's home was already ruled to be the HOOK, not a skill — "nobody invokes a skill in the seconds before mis-measuring." That reasoning generalises: a skill cannot fire in the gap between wanting to know something and typing the query.**
⚠️ **AND FINDING (B) SHARPENS IT FURTHER: a rule that must fire UNPROMPTED is doubly wrong as a skill** — it depends on a description that the budget may silently truncate.

**Riding this leg (Kyle-directed):** the **governance TIER LIST** (design: `B_RULES_1D_GOVERNANCE_TIER_LIST_r1.md`) incl. a **TEMPORARY tier** for phase-scoped docs (`PHASE_19_PLAN`), `ACTIVE_PATH_FLOW.md` joining when Analyst finishes it, **the skills files themselves being maintained when the processes change**, and ⚠️ **the `STORAGE_POLICY.md` CONTENT refresh — the trap being that the doc is ALREADY Tier-2-LISTED, so the row is easy to mark done while the content still does not track the hot/warm/cold changes.**

---

## 5. VERIFICATION
**(a)** ⛔ **PRECONDITION — the parent/child LIVE CANARY** of §2(A): a throwaway parent + one child, exercised on the real binary, observing whether the reference actually resolves. **No real procedure depends on the reference until this passes.**
**(b)** ⛔ **THE BUDGET MEASUREMENT IS A GATE, NOT A REPORT:** `/doctor` + `/context` Skills row BEFORE and AFTER, plus a `--debug` run confirming **no overflow warning**. **A truncated description is a silent capability loss ⇒ if the set overflows, the set is too big — reduce it or spend `skillListingBudgetFraction`, deliberately and recorded.**
**(c)** the auto-loaded byte total drops by the moved bytes, read from the **native `InstructionsLoaded` sink** (ground truth) — ⚠️ **which inherits 1c's GATE 1: that hook must be PROVEN TO FIRE first, or this check passes by measuring nothing.**
**(d)** each moved procedure is findable at its new home; §339 old→new table; **nothing deleted.**
**(e)** ★ **the rare-skill probe: after the move, confirm a rare skill (provenance-read) still AUTO-invokes on a natural request — not merely that `/provenance-read` works.** **The by-name test passes even in the exact failure mode (B) describes, so it proves nothing on its own.**

## 6. OUT OF SCOPE
Ordering (1e) · Langston's files (INFRA lane) · rule-29 conversion (its hooks are #623 leg 2) · any rule that must fire unprompted.
