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
