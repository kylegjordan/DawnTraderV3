---
name: pm-slotting
description: PM SLOTTING ONLY - the enforced slot check PM Claude runs before recommending where a batch, issue or decision goes, who owns it, or in what order. Use before any slotting, ownership or ordering recommendation to Kyle or order to a session. NOT for batch workflow steps, NOT for code review, NOT for writing the decision row itself.
---

# PM slotting - the enforced slot check (KD-28, scope OBJ-9)

Kyle, 2026-11-05: *"make it a rule that is automatically enforced as opposed to steps you can forget or choose to skip"* and *"build the slot check using lower model agents to run it, so it doesn't eat up context/tokens."*

Guard 1 (`.claude/hooks/guard-pm-slot.mjs`) refuses a slotting question to Kyle, or a PM order on Discord, when no FRESH record exists for the named owner from the last 6 hours. Guard 2 (`.claude/hooks/guard-pm-decisions.mjs`) refuses a `placement` decision row that does not cite its record. This skill is how you satisfy both.

## Run it, once per owner, through ONE agent

Spawn exactly ONE Agent call with `model: sonnet` (never PM's own model) per owner. Its brief:

1. Run, from the repo root: `node scripts/pm/slot-check.mjs --owner <CC-A|CC-B|CC-C|CC-INFRA> --item "<what is being slotted, in a sentence>"`. It fetches first, reads at the ref, and writes `1-system-manual/pm/slot-checks/<UTC>_<alias>_<slug>.md`. If the record says `DEGRADED`, report the reason and stop: a DEGRADED record does not satisfy either guard.
2. Read the record. For EACH candidate position PM names, append to the record a short section: what slotting there would push back, item by item, ranked on Kyle's priorities in this order: open trades, faulty closes, calibration data, KD-2 data truth first, then everything else.
3. Repeat, word for word, every `UNPARSEABLE` and `UNREADABLE` line in the record. An unparseable task list is a refusal to omit, never an empty queue.
4. Return no more than 200 words: the record path, FRESH or DEGRADED, the ranked push-back per position, every UNPARSEABLE line, and the decisions of the last 48 hours that bind the owner.

## After the agent returns

- Quote the record path in your recommendation to Kyle.
- When Kyle decides, the decision row takes `kind` = `placement` and cites `slot-check: <record path>`. **Commit the record in the SAME commit as the row.** A record from another run, or one committed later, does not discharge the check.
- A genuinely exceptional case writes `no-slot-check: <reason>` in the row, where Kyle can see it.

## Limits, stated

Guard 1 recognises slotting by its wording, so an unusual phrasing can pass it; Guard 2 is the one that cannot be talked past. The agent's push-back is judgement, which is why it is written into the committed record.
