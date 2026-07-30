# Research ask — what are we NOT cataloguing, and what does the industry do about it?

**Proposed batch:** `B-CATALOG` (not opened) · **change-class:** `architecture` · **Author:** CC-A · 2026-07-30
**Kyle directed this and told me to PAUSE leg 2 for it.** His question, verbatim: *"do we have a catalog of all of our database tables and what they're used for, what they're capturing, what data they're capturing, what system they are part of? … I think that would be extremely helpful to us. This is something that is done as an industry standard."* And: *"what are we not documenting that we should?"*
**He wants you to review this, ADD to it, and DO YOUR OWN RESEARCH, before it is scheduled as a batch.**

---

## 1. THE MEASURED GAP — the answer is NO, and here is the size of it

**OBJECT:** live Supabase DB, `current_schema()`. **POPULATION:** all base tables + partitioned parents, **dated monthly partitions excluded** (they are instances of a parent, not distinct objects).

| Measure | Value |
|---|---|
| Total relations incl. dated partitions | **390** |
| **Distinct logical tables** | **206** |
| Named *anywhere* in `SYSTEM_IMPACT_MAP` + `STORAGE_POLICY` + `SYSTEM_MANUAL` | **157 (76%)** |
| **Named in NONE of the three** | **49** |

**CONTROL (rule 29b):** `vts_open_trades` — known-present — **is** found by the docs instrument ⇒ the 76% is measured with a working instrument.
⚠️ **A SECOND INSTRUMENT FAILED ITS CONTROL AND ITS NUMBER IS DISCARDED, NOT REPORTED:** a `shared/schema.ts` coverage check returned *"`vts_open_trades` NOT present"*, which cannot be true for a table in constant use ⇒ wrong file or a split schema. **No schema-coverage figure is claimed here.**
⚠️ **AND 76% IS AN UPPER BOUND, NOT A DOCUMENTATION RATE.** *"Named in"* means **the string appears somewhere** — not that anyone recorded its purpose, contents, owner, retention, or which subsystem it belongs to. **The true catalogued fraction is lower and currently unmeasured, because no artifact exists whose presence could be measured.**
**The 49 with no mention at all include:** `actuation_policies`, `ai_lessons`, `asset_capabilities`, `behavioral_log`, `behavioral_state`, `crew_coordination`, `ethical_audit_log`, `ethical_rule_set`, `expert_compliance_reports`, `expert_principles`, `expert_response_logs`, `expert_sources`. **Several look like pre-governance/legacy systems ⇒ each is a rule-18 disposition question nobody has asked.**

## 2. WHAT THE INDUSTRY ACTUALLY DOES (researched, not assumed)

**(a) A data dictionary / data catalogue is standard practice, and its named failure mode is EXACTLY ours.** The literature is blunt: without version control, a review cadence, and **automated metadata syncing**, a dictionary *"drifts as source systems change and quietly loses trust."* ⇒ **a hand-maintained catalogue of 206 tables WILL rot, and a rotted catalogue is worse than none because it is believed.** The recommended form is **generated from the source of truth and diffed**, with humans supplying only what cannot be generated (purpose, owner, subsystem, retention).
**(b) ★ AND THE FINDING THAT SHOULD CHANGE OUR GOVERNANCE, because it contradicts a ruling we already made.** 2026 research on AI coding agents finds: **context-file bloat REDUCES task success; more rules do NOT produce better performance.** The described anti-pattern is our exact history — *"Every time an agent makes a mistake, the default reaction is to add another rule. Rules are rarely removed. The file accumulates contradictory patches and one-off fixes, working directly against effective context engineering."* Plus the **"lost in the middle"** effect: instructions buried mid-file get ignored, and agents are documented ignoring them for that reason. Guidance: **keep files short, put critical rules EARLY.**
⇒ **`RUNNING_ISSUES` #339 ruled NO-TRIM — *"the rich full file; re-grounding in the FULL file is worth more than the tokens."* THE EXTERNAL EVIDENCE NOW CUTS AGAINST THAT RULING, and I think it should be revisited rather than worked around.** Our file is **664 lines / 136 KB** (measured; **I previously told you ~60 KB and that was unmeasured and wrong by >2×**). Rule 29 sits at ~line 274 of 664 — **squarely in the middle, which is where the research says instructions are ignored.** *(Sources listed at the end.)*

## 3. WHAT I THINK WE ARE NOT CATALOGUING (my starting list — ADD AND CUT)

1. **DATABASE TABLES** — purpose · what it captures · owning subsystem · writers/readers · retention tier · live-vs-legacy disposition. **206 objects, 49 wholly unmentioned.** *This is Kyle's ask and the clear first candidate.*
2. **LOG STREAMS + THEIR REACH** — which stream a message lands in (**`console.warn` → stderr, not `out.log`** cost me a false finding), retention, rotation, and rate-limiting. **A catalogue entry here answers "could this instrument have seen it?" — the exact question rule 29(b) demands.**
3. **DIAGNOSTIC COVERAGE** — what is instrumented vs not. Kyle: *"where we have diagnostics and where we don't. I don't know."* **Neither do I, and that is the point.**
4. **THE LOOKALIKE REGISTER** — pairs that have already caused a wrong call: working table vs archive · shadow vs real trades · JSON snapshot vs typed columns · `vts_trades`-the-file vs the table that does not exist · `active-*` vs its pre-RENAME names. **This is cheap, and it is the single artifact that would most directly have prevented last night.**
5. **SCHEDULED WORK** — 9 staging crons + systemd timers + app-internal schedulers, in one place. §9.5(a) demands the entry-point census every time *because* no such list exists.
6. **CONFIG KNOBS** — `module_constants` rows that silently change behaviour (a retention window lived in one, and nobody could see it).

## 4. QUESTIONS FOR YOU — please answer as the reviewer, and research independently

1. **Is the table catalogue the right FIRST artifact, or is the log/instrument-reach catalogue (2) higher-yield per hour?** My instinct says (2) prevents more of the specific errors, but (1) is what Kyle asked for and is the industry-standard baseline. **I would rather you rule than have me pick the one I like.**
2. **GENERATED vs HAND-WRITTEN.** I think the structural half (name, columns, size, partitioning, writers/readers) **must** be generated on a schedule and diffed, and only the semantic half hand-written — because 206 hand-maintained entries is a rot machine. **Do you agree, and what generates it?**
3. **★ #339.** Given the external finding that bloat *reduces* agent performance and that mid-file rules get ignored — **do you still hold NO-TRIM?** If not, this changes leg 3 from a retention optimisation into a **correctness** fix, and it should be resequenced accordingly.
4. **THE PART THAT MAKES IT NOT ROT.** Kyle's actual requirement is not the document — it is *"build the system to make sure that everything is updated when it should be, and that all of that documentation is used as a part of our workflow on a regular basis."* ⇒ **what enforces USE?** My candidate: the pre-audit census (§9.5(a)) stops being hand-rolled per batch and becomes *"cite the catalogue entry"* — which makes the catalogue load-bearing, so it cannot rot unnoticed. **Attack that.**
5. **WHAT AM I MISSING FROM §3?** You review across all three sessions' batches and see failure shapes I do not.

## 5. WHAT I AM NOT CLAIMING

- **I have not verified the 49 are genuinely undocumented** — only that they are unnamed in those three files. Some may be covered in a completion report or a batch doc. **The claim is "not in the three main governance docs," not "undocumented."**
- **I have not costed any of this.** No estimate of build or upkeep effort is offered, and none should be inferred.
- **I have not read `bridge/canonical/` for a prior catalogue attempt.** Kyle separately noted §4 omits `bridge/canonical/` from its archived list — **there may be prior art there and I have not looked.**

**Sources:** [OvalEdge — data dictionary best practices](https://www.ovaledge.com/blog/data-dictionary-best-practices) · [Atlan — what is a data dictionary](https://atlan.com/what-is-a-data-dictionary/) · [Secoda — data dictionary best practices](https://www.secoda.co/learn/data-dictionary-best-practices) · [Augment Code — building AGENTS.md (2026)](https://www.augmentcode.com/guides/how-to-build-agents-md) · [Codified Context: infrastructure for AI agents in a complex codebase (arXiv)](https://arxiv.org/html/2602.20478v1) · [Context engineering for large codebases](https://packmind.com/context-engineering-ai-coding/context-engineering-large-codebases/)
