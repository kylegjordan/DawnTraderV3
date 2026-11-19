---
name: workflow-08-verify-langston
description: STEP 8 ONLY of the DawnTrader batch workflow - Langston's independent second-pass verification on staging. Use when asking Langston to confirm the deployed outcome himself. NOT for his code-diff review, which is step 4, and NOT for the implementer's own first pass.
---

# STEP 8 — SECOND-PASS VERIFICATION (LANGSTON)

**Ends when:** he independently confirms.

**Mandatory. Independent UI + evidence verification.** He has staging SSH access and reads at the ref.
**Give him what he needs to re-derive rather than accept:** the ref, the object and population for every number, and the commands you ran. **Anything he cannot reach, he will tag `RULED ON REPORTED FACT` — and that is disqualifying for a PROCEED on the leg it covers.**
⇒ **If a measurement rests on something only you can see, commit the derivation so it is second-party checkable.**

## ⛔ WHAT MAKES HIS PASS WORTH ANYTHING IS THAT HE CAN RE-DERIVE IT
Give him the ref, the object, the population, and the exact commands you ran. **A number he cannot re-derive he will tag `RULED ON REPORTED FACT` — and that is DISQUALIFYING for a PROCEED on the leg it covers, not a caveat he can attach to one.**
⚠️ **He is STATELESS per-invoke and may be mid-review with another session.** **Do not read a slow reply as agreement**, and never carry a conclusion from his prior turn into a new dispatch without restating it in full. *(`1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §3.)*


## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
Card stays in **`Verification`**; set **Blocked on = Langston** for his second pass.
★ **The board rules every step shares — Langston sets `Review`, the session moves the card, nothing automates it, and the card holds status, owner, order and the description only — are in `1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §2 (`WI-B1`).** Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## ◇ DRAFT — B-WORKFLOW-IMPROVE (non-blocking until the OBJ-9 pilot; any part becomes a gate only by the reviewer's recorded ruling)
- **Two legs, each recorded.** (1) **Re-derive:** the reviewer re-runs the Step-7 proof at the ref with his own instrument. (2) **Challenge:** he tries one way the claim could be wrong that Step 7 did not test: a second path, a failed read treated as empty, or a meaning mismatch.
- Each leg goes in the ledger's `step8_challenge` with actor, ref, instrument and result. A leg ruled on reported fact is recorded `unproven`, never `pass`. The batch ledger: `scripts/crew-tooling/ledger-schema.json`, checked by `node scripts/crew-tooling/ledger-validate.mjs <ledger.json>`.

## THE ORIGINAL RULES-FILE TEXT — ARCHIVED (`WI-A08`)
The word-for-word `CLAUDE.md` §2 text for this step is archived, unchanged, at `1-system-manual/_archive/WORKFLOW_SKILL_ORIGINAL_TEXT.md` (`WI-A08`; B-WORKFLOW-IMPROVE Q10, 2026-11-20). **Every rule in it is carried by the summary above;** the archive keeps the origin cases, dates and issue numbers. Read it when a rule's history matters.
