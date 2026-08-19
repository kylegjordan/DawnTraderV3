# B-RULES-1d — SCOPE r3: skills extraction (Kyle's list as design input)

> **✅ STEP-1 APPROVED (Langston, 2026-08-07, at `96cfa5416`) — FOUR BINDING RIDERS FOLDED BELOW (§2.5). He re-read the live docs page himself: every §2(B) quotation verbatim-correct; NOTHING ruled on reported fact. 1d remains gated on 1c’s order — nothing ships before 1c’s two gates clear.**

> **r1→r2 (ANALYST Claude, adopted whole — he attacked finding (B) on SEVERITY ORDERING and on MEASURABILITY, and he is right on both). I had the two failure modes the right way round in the DOCS and the WRONG way round in RISK.**

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

⛔⛔ **SEVERITY INVERSION — ANALYST’S CORRECTION, ADOPTED: A SHORTENED DESCRIPTION IS WORSE THAN A DROPPED SKILL, AND r1 HAD IT BACKWARDS.** His reasoning: **a DROPPED skill is the MILDER case — it never runs, the workflow visibly does not happen, and someone eventually notices an absence.** **A SHORTENED description is worse because the skill is STILL THERE and STILL SELECTABLE — it just matches the WRONG requests, or fails to match the right ones.** ★★ **AND THE KILLER: that does not present as a CONFIG problem. It presents as THE MODEL EXERCISING BAD JUDGMENT — unfalsifiable from the chat, rationalised as a bad turn, and it NEVER routes anyone to the listing budget.**
⚠️ **HE CAUGHT ME FAILING TO APPLY MY OWN FINDING, AND IT IS RECORDED AS THAT:** this is the SAME shape I had named an hour earlier about Infra Claude’s summariser binary — *a capability degrading into plausible-looking output rather than an error.* **I named the class, then wrote the risk ordering as if I had not.**
⇒ **VERIFICATION CONSEQUENCE 1: MEASURE THE DESCRIPTION TEXT, not just the byte drop and the NAME SET.** **A name-set check confirms nothing was dropped WHILE EVERY DESCRIPTION IS SILENTLY SHORN OF ITS MATCHING KEYWORDS — and it passes GREEN while doing it.**
⛔⛔ **VERIFICATION CONSEQUENCE 2 — THE HARDER ONE: THIS CLASS CANNOT BE MEASURED FROM INSIDE THE SESSION AT ALL.** *"A session cannot see that its own listing was truncated — the truncation removes the very evidence."* ⇒ **the check MUST compare ON-DISK skill descriptions against WHAT THE LISTING ACTUALLY CARRIED, from OUTSIDE — otherwise it is measuring the shortened copy AGAINST ITSELF.** ★ **Same absent-as-valid trap as 1c’s GATE 1, one level up.**

**Mitigations, all documented:** `skillListingBudgetFraction` (e.g. `0.02`) or `SLASH_COMMAND_TOOL_CHAR_BUDGET` · `skillOverrides: "name-only"` for low-priority entries · put the key use case FIRST in each description · **`/doctor` reports the listing's context cost + biggest contributors** · **`--debug` writes a warning when the listing overflows.**
✅ **MEASUREMENT IS TRUSTWORTHY AT OUR VERSION:** the `/context` Skills row reports the size **after** the budget is applied — *"Before v2.1.196, the row counted the full text of every description and could show a value several times larger."* **We measured 2.1.219 (1c r4), above that gate ⇒ the instrument reports what the model actually receives.**

---

## 2.5 ✅ LANGSTON’S FOUR BINDING RIDERS (Step-1 approval)

⛔⛔ **RIDER 4 — THE BUDGET CHECK IS A HARD GATE, and its COMPOSITION is specified: (b)+(e) JOINTLY, DETERMINISTIC. (f) STAYS A PROBE, NOT A GATE.** His decision rests on my own backstop argument: **a failure that can ONLY be caught at ship time must be GATED at ship time** — a shorn description presents as bad model judgment, is unfalsifiable from the chat, and never routes anyone to the config. **Two reasons for the exact split:**
★ **(i) THE 1,536-CHAR PER-ENTRY CLIP APPLIES “REGARDLESS OF BUDGET” (his re-read) ⇒ (b) CAN SHOW NO OVERFLOW WHILE AN ENTRY IS STILL CLIPPED.** **So (e)’s per-entry diff of on-disk text vs delivered text is LOAD-BEARING EVEN ON A GREEN (b)** — the two checks are not redundant and neither substitutes for the other.
★ **(ii) (f) IS BEHAVIOURAL AND PROBABILISTIC** — a one-shot auto-invoke pass proves little, a fail does not localise cause, and **a flaky gate is a gate that gets waived.** Keep it as EVIDENCE.

★★ **RIDER 1 — SPEND THE BUDGET, AND ALLOCATE IT DELIBERATELY WITH `skillOverrides` RATHER THAN LETTING THE DROP HEURISTIC DECIDE.** My finding says least-invoked-first is precisely the wrong order for us ⇒ **INVERT IT BY CONFIGURATION: the workflow CHILDREN are invoked BY NAME off the parent map, so they can afford `"name-only"`; the rare-by-design skills (provenance-read, mistake-and-correction, alert-assignment) are NOTHING BUT THEIR DESCRIPTION and keep FULL TEXT.** ⇒ **that converts a SILENT DEGRADATION into a CHOSEN, RECORDED ALLOCATION.** ⚠ **`skillListingBudgetFraction: 0.02` is HEADROOM, NOT THE MECHANISM.**

✅ **RIDER 2 — MAP-PLUS-CANARY AS SCOPED; DO NOT REFUSE THE PARENT.** The design already contains the risk (children stand alone · the tree degrades to a flat set · §5(a) blocks any real dependence until the canary passes). **“Refusing the parent would discard Kyle’s stated structure to re-buy insurance you already hold.”**

⛔ **RIDER 3 — NOTHING MOVES OFF THE STAYS LIST.** ★ **Finding (B) STRENGTHENS the criterion rather than bending it: a rule that must fire UNPROMPTED now has TWO disqualifiers as a skill — the INVOCATION GAP and a BUDGET-TRUNCATABLE DESCRIPTION.**

★ **HIS CLOSING RULING ON THE PATTERN:** three instances of graceful-degradation-as-hazard in one leg **is not coincidence — it is the class §19 and #546 already name: ABSENCE WEARING A VALID VALUE’S CLOTHES.**

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
**(b)** ⛔⛔ **HARD GATE, JOINTLY WITH (e) — deterministic, per rider 4:** `/doctor` + `/context` Skills row BEFORE and AFTER, plus a `--debug` run confirming **no overflow warning**. **A truncated description is a silent capability loss ⇒ if the set overflows, the set is too big — reduce it or spend `skillListingBudgetFraction`, deliberately and recorded.**
**(c)** the auto-loaded byte total drops by the moved bytes, read from the **native `InstructionsLoaded` sink** (ground truth) — ⚠️ **which inherits 1c's GATE 1: that hook must be PROVEN TO FIRE first, or this check passes by measuring nothing.** ✅ **DISCHARGED 2026-08-19 (B-CONDUCT-FILE §2): the native `InstructionsLoaded` hook has fired **49 UNPROMPTED** times across sessions — the positive control is MET and this gate is PASSED. Do not re-litigate it.**
**(d)** each moved procedure is findable at its new home; §339 old→new table; **nothing deleted.**
**(e)** ⛔ **DESCRIPTION-TEXT FIDELITY, MEASURED FROM OUTSIDE (Analyst, r2 — supersedes a name-set check):** diff the ON-DISK `description`/`when_to_use` text against what the listing actually delivered; **an equality check on the NAME SET is explicitly NOT sufficient and would pass green through the whole failure.** Use the external instruments (`/doctor` contributors, the `--debug` overflow warning) rather than anything the session reports about itself.
**(f)** ⚠ **EVIDENCE, EXPLICITLY NOT A GATE (rider 4(ii): behavioural + probabilistic; a flaky gate gets waived) — the rare-skill probe: after the move, confirm a rare skill (provenance-read) still AUTO-invokes on a natural request — not merely that `/provenance-read` works.** **The by-name test passes even in the exact failure mode (B) describes, so it proves nothing on its own.**

## 6. OUT OF SCOPE
Ordering (1e) · Langston's files (INFRA lane) · rule-29 conversion (its hooks are #623 leg 2) · any rule that must fire unprompted.
