# How technical decisions are made (Kyle 2026-11-05, KD-34)

> Kyle, ~14:06Z: *"It really should come down to having complete information about the situation. And when I say having it, I'm not talking about me having it. I'm talking about the session that is making the fix or doing the implementation. I'm talking about Langston. I'm talking about Coltrane, all coming to consensus on what is best ... We have to make a decision, document that decision, and stick to it."*

PM Claude runs this for every open technical question. Kyle is not asked to choose between technical options.

## 1. Before anything is called a problem
- Read the original intent first: the pre-governance corpus (`bridge/canonical/`), the batch scopes, pre-audits and completion reports that built the thing, the decision ledger (`1-system-manual/pm/DECISIONS.md`, `GOVERNANCE_EXCEPTIONS.md`, Langston rulings), and the current and future plan rows that touch it.
- If the thing does what it was built to do and that intent still holds, it is **not a defect**. Record that, cite the source, and stop.
- Only after that is it a finding.

## 2. The provenance pack (PM assembles, one file per question)
`1-system-manual/pm/decisions/<date>_<slug>.md`, holding:
1. The question, in one sentence.
2. What was intended, when and why (quotes with path:line and dates, back to the earliest record).
3. What is built today (code at the ref, measured where a number matters).
4. What the plans say is coming.
5. The options, each with its benefits and risks.

## 3. Who decides
The owning session + Langston + Coltrane read the pack and iterate to consensus on the best balance of benefit to risk. PM chases, keeps the pack current, and records every round's position in the pack.

## 4. The record
- The outcome becomes a KD row in `DECISIONS.md`: the decision, its reason, and "was X, now Y, better because ..." when it replaces an earlier intent. It cites the pack.
- Once recorded it is binding. Reopening it needs new evidence the pack did not have, and goes back through steps 1 to 4.

## 5. What reaches Kyle
- **Progress and solutions**: what was decided, by whom, and where the work sits in the plan. One settled answer, never a running correction.
- **His own calls only:** a true deadlock after the group has tried; anything touching money, the risk envelope or go-live; and additions to his agreed list, presented as "the group agreed this, placed here" for his yes.
- A correction to something already told to Kyle is made once, in one line, and only after the corrected answer has itself been through steps 1 to 4.
