---
name: pm-status-report
description: ONLY for answering where the DawnTrader work stands in plain language from current named sources. NOT for unsourced forecasts, technical verdicts, implementation, slotting or routine narration Kyle did not request.
---

# PM status report

Run `pm-crew-check` or read its current session-log rows first. A status report is a view of evidence, not a substitute for refreshing it.

For each owner, state in one compact block:

- current batch and its intent;
- current workflow step and what is happening inside it;
- the next action and the next recorded batch or return point, with a short plain-language description of what every named next batch is meant to accomplish;
- the exact wait, risk, stall or Kyle action, if any;
- the source for every claim, normally a commit, POSITION block, chat reply, Discord message, alert id, decision row, register row or plan row.

Use ordinary language before file or component names. Explain why the work matters to the platform's foundational machinery, strategy calibration, profitability evidence or accepted risk. Do not call a branch, accepted message or self-asserted receipt progress without the corresponding evidence.

If sources conflict, say `status uncertain`, name both sources and identify which owner must reconcile them. If a source is old, include its timestamp. Forecast only a gate or observable next condition; do not invent completion dates.

Default output tells Kyle only what changed, what is at risk and what needs him. A requested full report may include all owners, batches, steps and next batches. PM Claude mirrors substantive reports to Discord as required by its rules; PM Codex uses the fixed outbox sender and does so only when the operating instruction calls for a Discord copy.

## Full status reports requested by Kyle

Lead with the project story, not four isolated checkpoints. State plainly whether the crew is following the agreed pre-sprint or sprint sequence, which phase the project is in, what the active work unlocks, and whether Kyle should intervene.

Then include:

- the material change since the previous status report, including batches or steps closed, evidence windows completed, blockers cleared, and work that did not move;
- the dependency chain between active batches, including when one batch supplies the safe machinery or trustworthy data that the following batch needs;
- for each active batch, its intended outcome, what has actually been achieved, what the evidence means, what remains before the intent is met, and whether the owner is on the correct planned work;
- the meaning of strategy evidence in decision terms such as keep observing, calibrate later, disable, insufficient evidence, or profitable/not profitable, while preserving the registered decision rule and never substituting PM judgement for the owner/reviewer verdict;
- progress through the pre-sprint and sprint plans, distinguishing foundational machinery and data-truth progress from strategy calibration or profitability proof;
- batches closed since the comparison point, newly opened or expanded work, and bugs or findings absorbed into existing batches; if the comparison point is ambiguous, give both relevant boundaries instead of guessing;
- an overall assessment of whether the work is converging on live, mainly exposing additional prerequisites, or drifting, with the evidence supporting that assessment.

End with a plain `Kyle needed` statement. Say `No Kyle action now` when the crew can continue independently. When Kyle is needed, name the exact decision, access, tool, service, account, signed-in session or other authority boundary; explain what work it blocks, give the owner's recommendation when one exists, and separate required action from optional input. Never ask Kyle for access or a decision that the current tools, records or `DECISIONS.md` already provide.

Do not merely repeat counts or implementation details. Translate each result into why it matters for reliable trading, calibration, profitability evidence, data preservation or accepted risk. When a master-plan status cell is stale but the POSITION block and pushed evidence are current, say so and use the current evidence without hiding the documentation lag.
