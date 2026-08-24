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
⚠️ **He is STATELESS per-invoke and may be mid-review with another session.** **Do not read a slow reply as agreement**, and never carry a conclusion from his prior turn into a new dispatch without restating it in full.


## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
Card stays in **`Verification`**; set **Blocked on = Langston** for his second pass.
★ **LANGSTON SETS THE `Review` FIELD; THE SESSION MOVES THE CARD.** *(Kyle’s wording, 2026-08-24.)* ⛔ **His approval is NOT the move** — he sets `Review = Approved`, then YOU move it and update `Blocked on`. If approval also moved the card the board would freeze every time he is mid-review, at FOUR gates per batch.
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

8. **Second-Pass Verification (Langston)** — Independent UI + evidence verification. Mandatory.
