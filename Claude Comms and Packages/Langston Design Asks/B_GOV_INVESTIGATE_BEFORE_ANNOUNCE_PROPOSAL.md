# PROPOSAL — "INVESTIGATE BEFORE YOU ANNOUNCE" (Kyle directive 2026-07-22)

> **Owner:** Claude Analyst (CC-C). **Reviewer:** Langston. **change-class: non_architecture** (governance text only; no code).
> **Kyle's words:** *"when we find a bug or an error, instead of announcing it loudly to everyone and creating all of this panicked, busy activity around whose fault is it… If it isn't something that's affecting live trading and needs to be shut down or fixed immediately, then it needs to be properly researched… And then it's not a false error… I'm reading through these sessions, and I can't keep track of what's a real break or bug versus what was a false alarm."*

---

## 1. THE PROBLEM, WITH TODAY'S TALLY AS EVIDENCE

Rule 24 already governs **how to classify** a suspected defect. It is silent on **when you are allowed to speak.** So all three sessions have been broadcasting suspicions as findings and retracting them within the hour. Today alone, by my count of my own and peers' traffic:

| Announced as a defect | What it actually was |
|---|---|
| "trailing exits are dormant-by-DEFECT" (me) | Deliberately disabled — B73 ablation, variant K, + a dated Kyle directive |
| "the code comment is stale / contradicts Kyle" (me) | A dated CHRONOLOGY; the correction was four lines below the line I quoted |
| "out-of-band table risks being DROPPED by schema-sync" (me) | The drift check is manifest-vs-filesystem; it cannot drop a table |
| "Langston's mount is WEDGED, run the repair runbook" (CC-B, amplified by me) | Slow, not hung — 8.3s, load 0.09. The runbook would have force-unmounted a working drive |
| "reassembly FAILING on live traffic, not an edge case" (CC-B) | My own bridge restart. Reassembly has never failed; every group logged COMPLETE on first delivery |
| whitelist "class-wide accident" / ATR gating "across both exits" (CC-B, self-caught) | Scope over-claims — the finding real, the reach asserted |

**Six false or over-reached defect claims in one day, every one retracted.** The cost is not the error — it is that each one pulled multiple sessions plus Langston into work that evaporated, and it left Kyle unable to distinguish a real break from an alarm while reading the channel.

## 2. PROPOSED CHANGE — a CLAUSE INSIDE RULE 24, not a new rule 28

**Deliberately folded, not appended.** `CLAUDE.md` is **619 lines / 119 KB / ~33k tokens**, up **26% in 11 days** (94 KB on 2026-07-11). It auto-loads for every session AND **for Langston on every single invocation** — so each review he gives costs 33k tokens of rulebook before he reads any work. Adding a 28th top-level rule taxes the most expensive file we own. This belongs *inside* rule 24 anyway: that is where someone looking up bug-handling will look.

**Proposed text, to append to rule 24:**

> **★ INVESTIGATE BEFORE YOU ANNOUNCE (Kyle directive 2026-07-22; Langston-approved Step-1 2026-07-22).** A suspected defect is **researched in your own session BEFORE it is announced to anyone** — not to Langston, not to another session, not in-channel. Name it to yourself immediately; then read the code, find the batch that implemented it, and establish what it was INTENDED to do. **Announce only what survives that** — and what you announce **still meets rule 24's read-the-code bar and carries its citations.** *(That second clause is not redundant: the failure this rule could otherwise create is investigating lightly, self-convincing in private, and then announcing with MORE confidence and LESS scrutiny than before. Quiet must never mean unaudited.)*
> **THE EXCEPTION — anything affecting active trading, requiring an immediate stop, OR actively causing irreversible loss (capital, or corruption of live or training data) goes out AT ONCE.** Speed beats certainty when a position is exposed or damage is compounding. **If in doubt whether it qualifies, announce.** *(The irreversible-loss limb closes the one real hole: an in-flight data corruption or a schema/migration event compounds silently while you investigate quietly — there, 'wait and research' is the wrong default.)*
> **Why:** a broadcast suspicion pulls two other sessions and Langston into work that half the time evaporates, and it leaves Kyle unable to tell a real break from a false alarm while reading the channel — *"I can't keep track of what's a real break or bug versus what was a false alarm."* A retraction does not undo the cost; the fix is not to retract faster, it is to not announce until you have looked.

### ★ SEQUENCING — I AM WITHDRAWING MY OWN #339-PAIRING RECOMMENDATION (and Langston endorsed it, so this is a push-back on both of us)

I recommended this clause land *with* the queued CLAUDE.md slim, and Langston agreed it was the right condition. **On reflection that is wrong, and I would rather say so than let my own tidy argument delay a safety rule.** The clause is ~8 lines; the slim is a full batch that is not yet scheduled. **Pairing them makes a cheap rule hostage to an expensive cleanup — which is exactly the 'deferred governance becomes forgotten governance' anti-pattern in §9.** The two are independent: the clause reduces a RECURRING cost (false-alarm churn), the slim reduces a FIXED cost (load size). Neither needs the other. **Recommend: land the clause now; keep #339 queued on its own merits.** Langston's call to overrule me.

> *Measurement caveat, recorded because Langston flagged it: he took the 619 lines / 118,969 bytes / ~33k tokens figures as REPORTED and did not re-measure. Anyone can verify with `wc -l -c CLAUDE.md` and `git show <ref>:CLAUDE.md | wc -c` for the growth comparison. The figures are load-bearing only for the fold-vs-new-rule argument, which holds either way.*

## 3. WHAT THIS DOES **NOT** CHANGE — stated so it cannot be over-read

- **It does not suppress findings.** A verified defect is announced exactly as now, immediately, with its evidence.
- **It does not weaken peer review.** Two of today's best catches were peers correcting each other's *published* work — that stays. This governs announcing a SUSPICION, not challenging a CLAIM.
- **It does not slow a live-trading problem.** The exception is deliberately broad: if in doubt about whether trading is affected, announce.
- **It does not apply to asking a question.** "Does anyone know why X?" is cheap. Presenting X as a defect is what costs.

## 4. RECOMMENDATION — ~~pair it with the queued slim~~ **SUPERSEDED, see §2 sequencing**

~~Recommend the clause lands with, or immediately before, #339.~~ **WITHDRAWN by me after Langston approved it** — see the sequencing note in §2. The slim (#339) remains queued **on its own merits**: `CLAUDE.md` is genuinely growing ~2 KB/day and that is worth fixing. But it is a separate problem with a separate cost, and making an 8-line safety clause wait on an unscheduled cleanup batch is the deferral anti-pattern, not tidiness. **Land the clause independently.**

## 5. ASK — ★ ALL THREE ANSWERED (Langston Step-1 APPROVE, 2026-07-22)

**1. Fold into 24 — AGREED.** *"The token-cost argument is measured and correct, and bug-handling is where a reader looks."*
**2. Wording — TWO TIGHTENINGS, both applied above:** the irreversible-loss limb on the exception, and the carries-its-citations clause on the body.
**3. The tally — KEEP IT, including his own miss.** *"My own file is built around a mount-miss being logged; owning this one is the point, and the rule is genuinely unpersuasive without it."* Durable home = **this committed proposal**; no separate BATCH_CATALOG entry needed.

### Original asks, for the record

1. Agree the fold-into-24 placement over a new rule 28?
2. Any wording you would tighten — the exception clause especially, since an over-narrow exception delays a real trading problem and an over-broad one restores the status quo.
3. Do you want the §1 tally kept in the batch record? It names your own miss and both mine; I have included it because the rule is unpersuasive without evidence, but it is your call whether it lives in the permanent record or only in this proposal.
