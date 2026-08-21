---
name: workflow-02-audit-and-plan
description: STEP 2 ONLY of the DawnTrader batch workflow - the Pre-Implementation Audit AND Implementation Plan, one merged document. Use after the scope is approved and before any code is written, to read real files, consult SYSTEM_IMPACT_MAP.md per component and write BATCH_N_PRE_AUDIT.md. NOT for drafting the scope, NOT for editing code.
---

# STEP 2 — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**ONE step. ONE document. Langston signs off ONCE, on both.** (Renamed 2026-08-21; the merge was #694 piece 5, adopted by Langston.)
**Ends when:** he clears the merged document.

## ⛔ THE ORDERING IS THE WHOLE POINT
**The AUDIT comes FIRST in the document; the PLAN falls out of it.** Under the old two-document way the plan was approved first, so **an audit that overturned the design arrived after the approval was already spent.** This ordering is what let an audit kill a design *before* a plan was built on it.

## ⛔ BINDING FORMAT REQUIREMENT
**Every plan item back-references the audit finding it falls out of.** Anything in the plan with **no** audit treatment is flagged **`UNAUDITED`** in-document.
*Why: on this format's first use, an item that appeared only in the plan half was never audited — and it was precisely the risk the audit had already identified.*

## DO
1. **Read actual files. Check PM2 logs. Query the database. Navigate the UI.** Not inference.
2. **MANDATORY: consult `SYSTEM_IMPACT_MAP.md` for every affected component** — upstream feeders, downstream consumers, shared state, background execution, blast radius. **Skipping the SIM review is how cascade bugs get through. Non-negotiable.**
3. **If the scope contradicts the System Manual, one of them is wrong — flag it.** If either doc is SILENT on something the batch touches, **that silence is itself a governance gap — flag it.**
4. Write the plan, each item pointing back at its finding.
5. End with the **plain-language summary**: here is what the audit turned up, here is the plan.

## ⛔ §9.5(a) — COMPONENT CENSUS AT EVERY HOP, NOT A PATH TRACE
An end-to-end trace is **satisfied by the first sufficient explanation at each hop** — it never asks "is there a SECOND thing doing this?" That is how a dual mechanism ran for seven months through two audits. At each component ask, repo-wide grep, tests excluded:
| question | why |
|---|---|
| who **writes/creates** here? | multiple producers |
| who **reads** here? | hidden consumers |
| who **mutates** here? | competing updaters |
| ★ who **DELETES** here? | **highest-yield — this one alone surfaces duplicates** |
| who **schedules/starts** work against it? | timers, clock subs, `.start()`, bootstrap, cron |
**If a list has exactly one member, SAY SO explicitly** — an asserted absence needs presence-evidence. **Two or more schedulers over one component require a mutual-exclusion check.**

## ⛔ §9.5(a-ii) — DELETION-TIME STATE-WRITE CENSUS
Before cutting ANY code, **enumerate the state it WRITES and grep for READERS of each.** A removed WRITER whose READER survives produces **no compile error and no failing test** — caller-tracing, green CI and clean `tsc` all pass while the deletion silently breaks a live dependency.
⇒ **A deletion is verified by "zero callers AND every state it wrote has no surviving reader" — not by zero callers alone.**

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

2. **Pre-Implementation Audit AND Implementation Plan** — ⚠️ **RENAMED 2026-08-21 (Kyle). The step was merged with the plan by #694 piece (5) and Langston ADOPTED it, but THE NAME NEVER FOLLOWED** — the concept was recorded and the label was not, so the workflow still read as two steps. **ONE step, ONE document, Langston signs off once, and the AUDIT comes BEFORE the plan inside it** (that ordering is the whole gain: under two documents the plan is approved first, so an audit that overturns the design arrives after the approval is already spent). **Every plan item back-references the audit finding it falls out of; anything unaudited is flagged `UNAUDITED` in-document.** — Read actual files, check PM2 logs, query Supabase, screenshot UI. **MANDATORY: consult `SYSTEM_IMPACT_MAP.md` for every affected component** (deeper than Step 1.a — per-component upstream + downstream + shared-state + background-execution + blast-radius enumeration). Document in `BATCH_N_PRE_AUDIT.md`. Langston reviews. Skipping the SIM review is how cascade bugs get prevented — non-negotiable.
