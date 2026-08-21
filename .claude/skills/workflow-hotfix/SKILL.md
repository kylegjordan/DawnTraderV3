---
name: workflow-hotfix
description: HOTFIX ONLY - the abbreviated DawnTrader workflow for an urgent break that cannot wait for a full eleven-step batch. Use when something is actively broken, losing money, corrupting data or blocking the pipeline, and only then. Covers the qualifying test, the blast-radius audit, the Langston gate before staging, and the single verification. NOT for new functionality, NOT for improvements or refactors, NOT for a normal batch.
---

# THE HOTFIX PATH — the eleven steps miniaturised into one, and STILL GATED BY LANGSTON

> ⛔ **THIS EXISTS BECAUSE IT DID NOT (Kyle, 2026-08-21).** Measured before it was written: **"hotfix" appears 256 times across the governance corpus and every occurrence is a USAGE — a batch that was one.** The only rule-shaped mention was the word sitting in the `change-class` list. **There was no definition, no qualifying test, and no steps.** ⇒ a hotfix was whatever the session doing it decided it was, which made the fast path available exactly when someone felt rushed — **which is the moment it should be hardest to reach, not easiest.**
> ★ **THIS IS ALSO THE MISSING HALF OF `CLAUDE.md` RULE 23 (FIX-ON-FIND).** Rule 23 orders a surfaced pipeline defect fixed "instantly, in a mini-cycle through Langston" — and never said what a mini-cycle IS. **This file is that mini-cycle.** Rule 23 is the trigger; this is the procedure.

---

## ⛔ 1. THE QUALIFYING TEST — DECLARE IT ONLY IF **ALL THREE** HOLD

| # | test | why it is a test and not a formality |
|---|---|---|
| **1** | **Something is BROKEN NOW** — losing money, corrupting or mis-recording data, blocking the trading pipeline, or presenting false information in the UI. | "Broken" means a live wrong behaviour, **not** a thing that could be better. |
| **2** | **Waiting for a normal batch causes REAL harm** that the fix prevents. | If the harm is "it annoys me", that is a batch. Urgency must be a property of the DEFECT, not of the mood. |
| **3** | **The blast radius is SMALL AND PROVEN small** — proven by §2 below, not assumed. | An urgent fix with an unknown blast radius is the most dangerous change we can ship. **Urgency is not a reason to skip the audit; it is the reason the audit must be fast.** |

### ⛔ WHAT IS **NOT** A HOTFIX — no matter who is asking or how urgent it feels
- **New functionality.** Ever. However small.
- **An improvement, a refactor, a cleanup, a rename, a "while I'm in here".**
- **Anything whose blast radius you could not establish** in §2. Unknown radius ⇒ it is a batch, and saying so is the correct answer.
- **A defect found mid-batch that is not actually urgent** — that is rule 23 fix-on-find inside the batch you are already running, not a separate hotfix.
- **A governance or documentation change.** There is no such thing as an urgent doc edit.

⚠️ **IF IN DOUBT, IT IS A BATCH.** The failure this file guards against is the fast path being reached for *because it is fast*. **Declaring a batch when a hotfix would have done costs a day. Declaring a hotfix when a batch was needed is how an unreviewed change reaches live trading.**
★ **Kyle may direct a hotfix directly. That satisfies test 2 — he owns the urgency call. It does NOT satisfy tests 1 or 3, and §2 still runs in full.**

---

## ⛔ 2. THE ONE MINIATURISED STEP — AUDIT AND EVIDENCE, BEFORE ANY CODE

**This single step replaces steps 1, 2 and 3 of the full workflow. It is short, but NONE of it is optional.** Two entry paths, demanding different work:

### PATH A — the defect was ALREADY a finding in a completed or just-completed audit
**CITE IT.** Name the audit, the batch, the issue number, the report section. **That audit work is done and is NOT repeated.** ⇒ go straight to §2.3.

### PATH B — the error just turned up on its own
⛔ **A BLAST-RADIUS AUDIT IS MANDATORY, AND IT EXISTS TO ANSWER ONE QUESTION: *am I looking at the whole problem, or at one visible symptom of a bigger one?*** (Kyle's framing, and the reason this path may not be skipped.) **A symptom fixed in isolation hides its cause and buys silence, not health.**
Answer these explicitly, **in writing**, before proposing any fix:
1. **What is the actual mechanism?** Not "X is wrong" — *why* X is wrong, traced in the code, quoted at `origin/migration/aws-supabase`.
2. **§9.5(a) CENSUS AT THE AFFECTED COMPONENT** — who **writes**, who **reads**, who **mutates**, ★ who **DELETES**, who **schedules** work against it. **If a list has exactly one member, say so explicitly** — an asserted absence needs presence-evidence.
3. **Are there OTHER call sites with the same defect?** Repo-wide grep for the *pattern*, not the reported symptom. **Fixing one of five identical sites is worse than fixing none, because it makes the remaining four look investigated.**
4. **What state does the change write, and who READS that state?** (§9.5(a-ii) — an altered or removed writer whose reader survives produces **no compile error and no failing test**.)
5. **Could this be a symptom of a larger design fault?** If the honest answer is yes or maybe ⇒ **STOP. It is a batch.** Say so and escalate rather than patching.

### 2.3 — SEARCH THE LEDGER BEFORE CALLING IT A DEFECT (§9.5(b-ii))
Grep `RUNNING_ISSUES.md`, `BATCH_CATALOG.md` and the completion reports for the component and the symbol. **A deliberate, Kyle-approved, Langston-reviewed decision reported as a defect is worse than no finding** — it burns review cycles and impugns work that was done correctly. ★ **If the code comment names its own provenance — a batch id, an issue number, "Langston-approved" — FOLLOW IT.**

### 2.4 — THEN WRITE THE FIX, AND PUSH IT
Implement, commit with explicit paths, push to `migration/aws-supabase`. ⚠️ **PUSHING IS NOT DEPLOYING. Nothing reaches staging until §3 clears** — and Langston reads at a ref, never a working tree, so the code must exist at `origin/…` before he can review it at all.

---

## ⛔ 3. THE LANGSTON GATE — BEFORE STAGING, NOT AFTER. THIS IS WHAT MAKES THE FAST PATH SAFE.

**Kyle's directive, 2026-08-21: Langston reviews a hotfix BEFORE it goes up on staging.** The hotfix path is *quicker*; it is **not** *unreviewed*. **This gate is the entire reason the fast path is allowed to exist.**

**Dispatch to Langston — lead the post with "Langston" — carrying ALL of:**
1. **WHAT IS BROKEN** — the observed wrong behaviour, with evidence: the log line, the row, the screenshot, the number.
2. **WHY IT IS BROKEN** — the mechanism, quoted at `path:line` **from `origin/migration/aws-supabase`**, never from your working tree.
3. **HOW IT IS BEING FIXED** — the diff, load-bearing hunks inline. He should not have to go and find them.
4. **THE BLAST-RADIUS AUDIT from §2, in full** — every census list, including every list you found to have exactly one member.
5. **WHY THIS QUALIFIES** — the three tests in §1, answered one by one.
6. **THE COMMIT SHA** it is all pushed at.

**THE LOOP:** he reviews → if he wants changes, **it comes back, gets fixed, and goes to him again** → repeat until he approves. ⛔ **No round limit, and no "he was slow so I shipped it". Absence of a reply is not approval** — chase him (§6.5 follow-through), escalate to Kyle after two or three tries.

---

## ⛔ 4. DEPLOY, THEN VERIFY ONCE
1. **Deploy:** `dt-deploy <full-40-char-sha> --by <session>` — the ONLY deploy path (B-DEPLOY-LOCK #649). Deploy the **reviewed** sha.
2. **VERIFY ONCE ON STAGING — and verify THE THING THAT WAS BROKEN**, not that the server came back up. If it has a UI surface, **navigate it** (§9.3: "staging verified" means UI-navigated, never curl-checked).
3. **Confirm the original symptom is GONE, using the same measurement that showed it present.** The same instrument, or you have not shown a change.

---

## ⛔ 5. IT STILL GETS A RECORD — a fast path is not a silent one
- **`CHANGES_AND_FIXES.md`** — symptom, mechanism, fix, blast-radius result, Langston's approval, the deployed sha.
- **`RUNNING_ISSUES.md`** — open an entry if anything was deferred; **close the entry if this closed it**. If §2 path B turned up other sites or a larger fault, **each gets a named, dated home NOW** (§9.4) — "we'll get to it" is not a disposition.
- **`BATCH_CATALOG.md`** — one row. Commit subject carries the batch id; `change-class: hotfix`.
- **A short completion note**, not a full report: what broke, what was done, how it was verified, what Langston said.

⚠️ **The lighter doc-set is the ONLY governance concession the hotfix path makes. The audit, the Langston gate and the verification are NOT concessions and are never traded away for speed.**
