# B-COMMS-CHUNK-FIX — SCOPE (#553)

> **change-class: non_architecture**
> **Owner:** Claude Analyst (CC-C). **Reviewer:** Langston (Step-2 pre-audit ruling + Step-4 APPROVED as-is, 2026-07-22).
>
> ## ⚠️ THIS SCOPE FILE IS RETROACTIVE — written 2026-07-22 AFTER the batch closed. Stated plainly rather than backdated.
> **What actually happened:** I treated `1-system-manual/CREW_COORDINATION_AND_COMMS_PROPOSAL_2026-07-20.md` Part 3 (Kyle-assigned, Langston-reviewed) as the Step-1 scope and went straight to the Step-2 pre-audit. That is **not** what §2 Step-1 requires: the scope is a distinct artifact, and **B-GOV-2 puts the `change-class:` declaration in the SCOPE header specifically** — so with no scope file, the checker had nothing to parse, correctly defaulted to the strictest doc-set (`architecture`), and raised four alerts. **The checker was right and I was wrong.** A design-input document approved by Langston is not a scope; conflating them is how the declaration went missing.
> **Alerts this closes:** `acff127e` (class-undeclared) · `86307ce9` (missing scope). `da127589` (missing system_manual) resolves as a consequence — see §5.

---

## 1. PROBLEM (Kyle-reported 2026-07-20)

*"a discord. Truncation issue. So messages beyond a certain length are getting truncated. And Langston isn't able to read them. And there's been some load bearing discussions that have been missed as a result."*

Discord's hard cap is 2000 chars. A longer post is split into independent messages. Langston's address gate is **anchored** (`^…langston\b`) and runs **pre-enqueue**, so only the first piece passes it — every piece after the first was discarded before becoming a task, with **no error on either side**. Load-bearing review content was reaching him truncated and nobody could see it happening.

## 2. OBJECTIVES

1. **Stop the silent half-delivery** — a >2000-char Langston-addressed dispatch must arrive as ONE coherent message.
2. **Fix the adjacent notify-mention defect** surfaced in the pre-audit (a `--notify` dispatch to Langston was dropped **entirely**, not truncated, because the `<@id>` prefix broke the anchored gate).
3. **Leave every other sender byte-identical** — Kyle-facing traffic and the §10.5 alert webhook must not change at all.
4. **Zero adoption burden** — no sender may have to remember a flag, a command, or a length rule.

## 3. CONSTRAINTS

- Bridge sources are **repo-canonical at `comms-infra/discord/`** and pushed to Helsinki by `deploy.sh`. *(⚠️ My pre-audit got this wrong — see the completion report §8b. A Helsinki-only edit is reverted by the next deploy.)*
- `_send_chunks` in `discord_common.py` is the **shared** delivery path for every poster — so the blast radius is every sender, and R1/R2 must be discharged by construction rather than by runtime check.
- **Fail-loud over silent-hold**: an incomplete group must surface, never be quietly buffered — the defect being fixed is itself a silent drop.

## 4. VERIFICATION CRITERIA

Send-side unit cases (non-Langston byte-identical · Langston multi-chunk marked and still gating · notify case passes · mention unchanged) · token-integrity across boundary offsets · **live end-to-end with load-bearing content deliberately placed in the FINAL chunk, quoted back by Langston** · at least one genuine unplanned production reassembly.

## 5. GOVERNANCE DOC-SET (for the declared `non_architecture` class)

**Applicable:** scope (this file) · pre-audit · change list · completion report · BATCH_CATALOG · PHASE_HISTORY · RUNNING_ISSUES (#553) · SYSTEM_IMPACT_MAP (Discord Comms Fabric — a component's behaviour changed) · CHANGES_AND_FIXES · CLAUDE.md §6.5 (the capability + its narrow scope).
**NOT applicable — SYSTEM_MANUAL:** this batch changes **no** architecture, strategy logic, regime detection, filter design, signal pipeline, or quantitative math. It changes how a chat message is delivered between two agents. Judged explicitly per §9's "judge applicability, don't skip by default" — the judgement is *not applicable*, and it is recorded here rather than silently omitted. Alert `da127589` graded System Manual only because the missing class-declaration defaulted the batch to `architecture`.
