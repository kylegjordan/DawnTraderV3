# P6 critical alert ownership and escalation

**KD-34 review question.** Who should take first responsibility for a critical alert when the owner table has no match and no established precedent applies, and how should the reviewer escalation work?

## Original intent

- Token Economy amendment 1 OBJ-13 says “An alert is never left unassigned.” It gives the owning batch or system and recorded evidence priority over a fallback. The Nov 20 pre-audit records Langston’s 12:04Z and 12:38Z rulings and explains why CC-INFRA owns genuinely new keys as the owner of the alert machinery (`aa7fba589`, `B_TOKEN_ECONOMY_AMENDMENT_1_PRE_AUDIT.md`, R2-4–R2-6 and §A4). A failed table read already has its own escalation path.
- Langston’s October 16 precedent ruling, recorded in the bridge at `39a3849c2`, gives prior confirmed assignments weight and escalates conflicts. The P6 install retains that path for an otherwise unmatched alert.

## Installed behavior and observed case

- At install ref `39a3849c2`, `comms-infra/discord/alert_owner_table.json` names CC-INFRA as fallback for genuinely new keys. `alert_lane.py:422–463` applies the fallback with no precedent and preserves pending escalation. `discord-langston-bridge.py:1416–1432` counts candidates before applying the rules. Count distinct final fallback alert IDs by UTC creation day for R2-5.
- On Nov 21, `a3b1bc1e-dd42-429a-b5ea-6cd53896fd2d` had no rule or precedent. The lane proposed CC-B at 05:10Z (Discord `1573566186925596673`), CC-INFRA received the fallback and the critical escalation remained in force. Langston assigned CC-A at 05:14Z (`1573567156816314489`). A 07:10Z repeat used that precedent (`1573596383112466473`). INFRA’s Step 9 package at `aa7fba589` records the 07:19Z resolution and the one observed ownership change.
- Coltrane accepted the Step 9 evidence at 10:04:53Z on Nov 28. Two final fallback IDs, including the seed, stayed within the daily cap. This case does not call for a new owner-table row on that evidence. The Nov 21–28 seven-day proof is unproven. Its separately reviewed re-registration remains INFRA’s responsibility.

## Plan and options for review

F-3 sits in Token Economy amendment 1 P6 Step 10. The later Alert Lane Ledger Owner and Alert Marker Retire work remains in the after-live plan (KD-51 and KD-109). An F-3 ruling should identify the initial responder, the durable owner after review, and the escalation trigger and delivery path.

| Option | Benefit | Risk |
| --- | --- | --- |
| Keep INFRA as first owner and retain critical escalation | Every critical alert has a named responder immediately and the reviewer can settle ownership | The first owner may need to hand off. The recorded case shows one such handoff. |
| Route immediately to the lane’s proposed domain owner and retain critical escalation | Could shorten some transfers when the proposal is right | The only observed F-3 proposal named CC-B and the reviewer assigned CC-A. A wrong guess can delay the actual owner. |
| Keep INFRA as named first responder pending an explicit reviewer assignment | Gives the crew a clear distinction between immediate response and durable ownership | Requires an explicit deadline, fallback for reviewer unavailability and a reliable handoff record. |

**Review round 1.** INFRA and Coltrane to rule on the owner and escalation under KD-34. Keep the current behavior during review. If a change is agreed, replay this exact critical case, a matched-rule case and an established-precedent case before proposing installation. Record the settled ruling in the decision ledger.

PM opened the review on Discord at 10:41:04Z (`1576186160244588574`).

**Coltrane, 10:44:33Z, Nov 28.** Immediate INFRA first response plus immediate escalation to the on-duty reviewer. Include the lane's suggested domain as context. From first triage, the reviewer records a named assignment within five minutes and the same-ID responder visibly accepts within ten. INFRA owns the alert until acceptance or resolution. A failed/unavailable reviewer route or missed deadline goes to PM immediately for a named backup and verified receipt. Repeats keep the original clock. `cc-wake-filter.py:1247–1261` at `39a3849c2` shows the marker alone does not wake the assignee. In the observed case the 07:10Z repeat still reported that the alert was unclaimed.

**Evidence and controls.** Coltrane passed 61/61 and 138/138 in the two offline suites at `39a3849c2`. His exact-ID reproducer retained the INFRA owner marker and queued zero escalations when he removed the lane's escalation tag. Require critical escalation independent of that tag. Before installation replay the exact case, matched-rule and established-precedent controls, failed delivery and missed acceptance. Preserve the distinct failed-table-read route (R2-4) and the family table.

**INFRA, Nov 28 after the 11:14Z Birth Cap read.** In the authorized builder chat, `PM PRIORITY CLEARED` (message `msg_04b1b63b5f914e23016b0ab7da7f2087d29a256d1e63382360`) explicitly accepted the first-owner, independent escalation, deadlines, confirmed handoff and immediate PM fallback. INFRA then resumed Conversation Index Step 2.

**Disposition — KD-129, technical agreement.** INFRA and Coltrane agree. Keep the present routing until the owner carries these requirements and the listed controls through the governed Step 10 checkpoint and exact review. This record authorizes no installation or reroute. The next seven-day active P6 observation remains separate.
