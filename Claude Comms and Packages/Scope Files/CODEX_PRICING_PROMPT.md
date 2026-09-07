# THE PROMPT TO SEND CODEX — paste the block below, nothing else

> **⛔ THIS FILE IS NOT FOR THE REVIEWER. It holds the exact text to paste, and the reasoning for why it is this short.**
> **Kyle's instruction, 2026-09-06: *"the prompt should just tell them where to look for the brief."***
> ★ **THE BRIEF IS THE CANONICAL INSTRUCTION SET.** A prompt that restates it creates a second copy that drifts — and the copy the reviewer reads first is the one that wins. **So the prompt carries a pointer and a repository ref, and nothing that duplicates the brief.**
> ✅✅ **STATUS: READY TO SEND — CLEARED 2026-09-07 at `cd75cdcf0`.** The document went through **six revisions** with Langston (three blockers, then four, then one, then one, then two one-liners). **His pre-clearance on the final round, verbatim: *"Fix those and §6.4 is cleared; I don't need another round for a one-line strike."*** Both were fixed and pushed.
> ★ **WHY THAT MATTERS TO WHOEVER SENDS THIS: the reviewer is being asked to DISAGREE with §6, so it had to be the strongest version we could put in front of him — not the first one that read well.**

---

## ⇩ PASTE THIS

```
You are reviewing the pricing architecture of an automated trading system.

Repository: kylegjordan/DawnTraderV3, branch migration/aws-supabase.

Read this first — it is your brief, and it tells you what we want and how to
return it:

  Claude Comms and Packages/Scope Files/CODEX_PRICING_ARCHITECTURE_BRIEF.md

The document under review is named in that brief.

You have the repository. The brief asks you to verify our claims against the
code rather than accept them, and it says what standard of evidence we hold
ourselves to. Work from the brief.
```

---

## WHY EACH LINE IS THERE

| line | why |
|---|---|
| **the repo and branch** | ⛔ **The reviewer must read at the branch we actually develop on.** `main` lags the review branch, and a review of `main` is a review of an older system. |
| **"Read this first — it is your brief"** | The brief carries the objective, the three asks, the evidence standards and the return format. **One home.** |
| **"The document under review is named in that brief"** | ⛔ **Deliberately does NOT name the pricing document here.** If the path changes, the brief is the single place that has to be corrected. |
| **"verify our claims against the code rather than accept them"** | The one instruction worth stating twice, because it is the whole point of the exercise and the easiest for a reviewer to soften. |
| ⛔ **what is ABSENT** | **No list of what to distrust, and no summary of our findings.** *(Kyle, 2026-09-06: pointing him at our own suspicions "kind of biases his search."* A search steered by our doubts can only find what we already doubt.) A ten-item distrust list was written by Langston, reviewed, and then struck for exactly this reason — do not reinstate it here. |

## ⚠️ WHAT TO CHECK BEFORE SENDING
1. **§6 of `PRICING_DATA_ARCHITECTURE.md` has cleared Langston's review.** *(Currently CHANGES-NEEDED.)*
2. **Both files are PUSHED** — the reviewer reads at a ref, so an uncommitted file does not exist for him.
3. **The brief's own status line says COMPLETE and ready to dispatch.**
