# B-CONDUCT-FILE — COMPLETION REPORT

**Owner:** CC-A · **Closed:** 2026-08-20 · **change-class:** `non_architecture`
**Reviewed ref:** `0acb762d8` · **CI 4/4 GREEN, verified PER-JOB** (run `32314304639` — TypeScript Check / Test Suite / Build / Docker Build, not the run-level `conclusion`)
**Langston:** Step-1 · Step-2 (r1→r2, APPROVED at `aea2203d47`) · Step-4 **CHANGES-NEEDED → APPROVED** at `0acb762d8`

---

## 🚨 ONE SCOPE ITEM IS OPEN AND IS **NOT** CLAIMED — §7(a)

> **§7(a) — "the conduct file demonstrably loads on startup, resume AND compaction, OBSERVED in the native `InstructionsLoaded` sink, not inferred" — IS NOT CLOSED.**
> **Why it cannot be:** the hook was registered ~`23:15Z` 2026-08-19. **MEASURED at that moment: the sink held 113 rows, newest `22:54Z` (compact) and `23:02Z` — both PREDATING registration, and zero rows mentioning CONDUCT.** No session had yet started or compacted with the hook live, so there is nothing the instrument could have returned.
> **What IS proven** (all measured, none inferred): the hook **emits** when invoked directly · the over-cap warning **fires** when the file is deliberately padded · the missing-file breadcrumb prints · the unset-`CLAUDE_PROJECT_DIR` annotation renders.
> **What is UNPROVEN: that the HARNESS invokes it.**
> ✅ **HOMED, not hand-waved: alert `441abe49-7d72-4bc4-943d-ba150d628635`, fires 2026-08-20T12:00Z**, carrying the check, the closing condition (a sink row from a session started after `23:15Z` 2026-08-19), the failure condition (zero rows after several starts = registered-but-not-firing = a defect), and an explicit **"do NOT close this on a direct-invocation test — that is the thing already proven."**

---

## WHAT KYLE ASKED FOR, AND WHAT HE GETS

Kyle, 2026-08-19: sessions comment on every push and every wake; self-corrections run *"two or three, sometimes four paragraph"* explanations with *"all this self Flagellation"*; and — the sentence the batch is built around — ***"we're not learning from any of it, we're just complaining about the mistakes we're making and then making those mistakes again."***

The rules governing that behaviour **already existed**. They sat inside a ~140 KB always-loaded file, below thousands of bytes of architecture and workflow. ⇒ **A rule that loads but sits below the point of use is not a rule that fires.** This batch gives them their own slim, separately-loaded home so they arrive **before** you act instead of being findable after.

## SCOPE OBJECTIVES — CHECKLIST

| # | Objective | Result | Evidence |
|---|---|---|---|
| 1 | A slim conduct file, auto-loaded on start/resume/compaction | **YES** | `CONDUCT.md`, 12 sections, 12,526 B |
| 2 | A loader hook, fail-open, no clone gate | **YES** | `.claude/hooks/load-conduct.mjs`; registered position 4 of 5 |
| 3 | Byte cap enforced **in the loader**, never dropping rules | **YES** | `CAP_BYTES=16384`; **proven by firing it** — padded to 17,200 B, warning appeared, content still loaded in full |
| 4 | Move the conduct-classed rules out of `CLAUDE.md`, nothing deleted | **YES** | 10 items, each replaced by a live pointer; Langston checked all ten |
| 5 | SIM entry for the new component | **YES** | new Layer-9 entry + TOC line |
| 6 | Always-loaded budget reduced | **YES** | **−2,430 tokens**, re-derived independently by Langston |
| 7 | §7(a) native-load observation | ⛔ **OPEN — see the banner. Alert `441abe49` armed.** | sink held 0 CONDUCT rows at close |

## MEASUREMENT — STATED ON THE RIGHT OBJECT, AFTER TWO CORRECTIONS

**OBJECT:** `CLAUDE.md` at `e4d4a525c` (the commit BEFORE this batch) vs `0acb762d8`. **POPULATION:** the whole always-loaded set = `CLAUDE.md` + **what the loader EMITS**.

| | bytes |
|---|---|
| `CLAUDE.md` before | 140,011 |
| `CLAUDE.md` after | 117,382 (−22,629) |
| loader **emits** | 12,911 (file + 385 B preamble, paid every start **and** every compaction) |
| **always-loaded NET** | **−9,718 B = −2,430 tokens** |

⚠️ **TWO CORRECTIONS, and the second was mine alone.** (1) **Langston:** the object of an "always-loaded" number is what the loader **EMITS**, not what the file **WEIGHS**; he could not reproduce my −2,846 on any basis and was right to refuse it. (2) **Mine:** re-measuring, I used `origin/migration/aws-supabase` as the baseline — **but that ref had advanced to my OWN pushed commit**, so "before" was already the stripped file and the arithmetic came out **+3,374 tokens**, nonsense in the wrong direction. Correct baseline is the pre-batch commit. **Both are the wrong-object family.**
**Per-item removals matched Langston's independent figures essentially to the byte:** §1 9,085 (his 9,085) · r24 5,277 (5,277) · r28 2,135 (2,135) · r27 1,237 (1,237) · r26 1,240 (1,240) · r22 1,200 (1,205) · r29 3,239 (3,244) · r5/r6 208 (207).

## THE THREE JUDGEMENT CALLS

**(a) NO CLONE GATE — APPROVED.** The sibling `load-own-memory.mjs` carries a three-entry map and **must** exit on an unmapped folder: it loads a **per-session private** file and cannot guess whose. Conduct has one file for everyone ⇒ nothing to guess, and the gate would only buy a silently-unruled clone. **Proven behaviourally:** on an unmapped `CLAUDE_PROJECT_DIR`, the sibling emits **0 bytes** (correct) and the conduct loader emits **12,538** (correct).

**(b) RULE 24 STAGED, NOT DELETED — APPROVED "as sequencing, not hedging. Do NOT take the deletion."** The scope routes it to a skill; the skills build is B-RULES-1d and does not exist. **Deleting a live rule into an unbuilt home is the absent-as-valid failure rule 24 itself warns about.** 5,276 B sit verbatim in `1-system-manual/_pending-skills/bug-investigation-SOURCE.md`, out of context entirely; 1d builds from it and deletes it.

**(c) RATIONALE CORRECTED — mine was wrong in a load-bearing way.** I kept rule 29's reviewer clause *"because it binds Langston and he does NOT load `CONDUCT.md`."* **He does not load the repo `CLAUDE.md` either** — his auto-loaded file is his own and already carries that clause verbatim. So the copy is a **MIRROR**, already drifted in emphasis and casing (#641 shape). Kept, because CC benefits from seeing the bar it is graded against, and **re-labelled: authoritative copy is his; drift means THIS copy is stale.**

## ⛔ THE BLOCKER LANGSTON FOUND — THE FAILURE I HAD JUST REFUSED, ONE LAYER UP

`CONDUCT.md` §9 said, live and unqualified: *"load the bug-investigation skill."* **There is no skills directory at this ref** — he checked with `dt-review`, not with my word. ⇒ **the file that AUTO-LOADS and arrives FIRST was sending a compaction-fresh session to a home that does not exist**, with no breadcrumb, **while the file that does NOT auto-load carried the full caveat.** I protected the deletion side of that boundary and left the pointer side open. Fixed with the interim pointer; **he then verified the pointer RESOLVES at the ref** — *"a pointer to a file that isn't there would have been the same failure wearing the fix's clothes."* **That is now my standing form for any pointer added to an auto-loaded file.**

## ★★ THE FINDING THAT OUTLIVES THIS BATCH — THREE CHECKS THAT COULD NOT FAIL

**All three surfaced in one session, and none was caught by care:**
1. **The wake filter's suppression had NEVER fired in production** (#730). stdin decoded as **cp1252** while the bridges write UTF-8, so an em-dash arrived as mojibake and the pattern never matched. **Langston's correction made it worse than I reported:** the read loop sits **outside** the per-line `try/except`, so a right curly quote — everyday phone-keyboard output — **killed the watcher process outright.** ✅ **Reproduced, not restated** — and my first fixture was wrong (`printf` left `\uXXXX` as literal escapes ⇒ pure-ASCII bytes ⇒ no decode error possible), so **I nearly filed a refutation off a test that could not fail.**
2. **Three hand-fed filter tests read as PASS while processing nothing** — `cur` is set only by `tail`'s `==> file <==` header and the chain had no `else`, so header-less lines were dropped in silence. **One of those passes was reported to Kyle as confirmation.** Caught only by a **positive control**: a real line known to have woken me live, through the same harness, also emitting nothing.
3. **§7(a)'s own guard** (this report's banner) and **the unset-path annotation that was unreachable** because `join('', 'CONDUCT.md')` is truthy — *"a fix that reads as applied and does nothing,"* which is **this batch's thesis turned on itself.**

⇒ ★ **The generalisable rule, and it is now mechanised rather than remembered: silence is not evidence until the instrument is shown able to speak.** Rule 29(b) already said so and was skipped twice in one day, so per **#623 leg 2** the control became a **mechanism** — the filter's new `else` writes `UNROUTED LINE (cur=…)` to **stderr** (never stdout, which the Monitor treats as the event stream), so a header-less harness **announces itself instead of impersonating a clean result.**

## ⚠️ DEPLOY + UI VERIFICATION — JUDGED N/A, WITH THE JUDGEMENT STATED (§9 anti-pattern: never skip by default)

**Step-6 deploy: N/A.** Every changed file is laptop-side or governance — `CONDUCT.md`, `.claude/hooks/*`, `.claude/settings.local.json`, `CLAUDE.md`, `SYSTEM_IMPACT_MAP.md`, `RUNNING_ISSUES.md`, `comms-infra/laptop/*`, the staged skill source. **The staging app reads none of them**, so a deploy would restart live trading for zero functional change. **CI still gated (rule 19) and is 4/4 green per-job.**
**Step-7 §9.3 UI verification: N/A, justified.** This batch has **no staging-visible surface**. ⚠️ **Stated rather than skipped**, because §9.3's strengthening makes UI verification the default and "no surface" is a judgement that has to be made explicitly.

## GOVERNANCE FILES CHANGED
`CONDUCT.md` **(new)** · `.claude/hooks/load-conduct.mjs` **(new)** · `.claude/settings.local.json` · `CLAUDE.md` (10 rule sites + THE EIGHT re-pointed) · `1-system-manual/SYSTEM_IMPACT_MAP.md` (**new Layer-9 entry — the session-instruction hook estate had NO SIM entry at all; flagged as a governance gap per §9 rule 1, not quietly added**) · `1-system-manual/RUNNING_ISSUES.md` (#700, #701, #702, #730) · `1-system-manual/_pending-skills/bug-investigation-SOURCE.md` **(new)** · `comms-infra/laptop/cc-wake-filter.py` · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `PHASE_19_PLAN.md` · `MEMORY_CC_A.md` (truth + mirror) · Langston's `MEMORY.md` (§10.b) · scope + pre-audit + evidence file + this report.

## SPAWNED, ALL WITH OWNERS AND HOMES
**#700** scheduled tasks run from a non-repo folder ⇒ **no SessionStart hook fires at all** (CC-A, due with this batch's follow-up) · **#701** Langston invoke fails and the bridge suppresses the error in channel (CC-A) · **#702** issue-number minting race — **SETTLED: CC-C 704-729 · CC-A 730-759 · CC-B 760-789**, with **four legacy doubles (#642 #646 #660 #668) deliberately NOT renumbered blind** · **#730** the wake-filter encoding class, **FIXED**.

## ⚠️ DISCHARGE CRITERION FOR ALERT `441abe49` — READ THIS BEFORE CLOSING §7(a)

**Langston's Step-11 rider, and he is right: the alert body says *"zero rows after SEVERAL session starts is a defect"* — and `several` is not a number.** ⇒ **that is exactly the wording that lets an alert re-surface forever without ever concluding.** The alert CLI has no update path (`add`/`ack`/`resolve`/`list`/`fire-due` only) and `resolve` is terminal, so the criterion is homed HERE rather than by re-minting a row — **I have already destroyed one gating alert by resolving it to "fix" it.**

**AT DISCHARGE, DO ALL THREE:**
1. **State the OBSERVED SESSION-START COUNT read from the sink** (`~/.claude/instructions-loaded.jsonl`, rows newer than `2026-08-19T23:15Z`). **It supplies its own denominator** — "zero CONDUCT rows out of N starts" concludes; "zero after several" does not.
2. **Name #700 as the COVERAGE caveat:** a session whose folder is not a repo copy fires no hooks at all and is **dark to that sink**, so ⇒ **a LOW count may be coverage, not failure.** Do not read a small denominator as a defect.
3. **Do NOT close on a direct-invocation test.** That is the thing already proven.

## HONEST RESIDUAL
**§7(a) is open and armed** (`441abe49`) — the batch is closed on everything else. **Rule 21's removal stays GATED** behind alert `9c3037f0` and did **not** ride this batch. **CC-B and CC-C are still running the pre-fix wake filter until they re-arm** — the file being fixed is not their process being fixed. **The four legacy issue-number doubles remain live** and need a decision on which entry keeps each number plus inbound-citation re-pointing; **renumbering them blind is worse than the duplicate.**

## ⚠️ ONE THING THIS CLOSE MUST NOT BE READ AS SAYING (Langston, Step-11)

**"THIS BATCH needs no deploy" is NOT "THIS BRANCH needs no deploy."** He verified my N/A basis properly rather than accepting it: the compare range `e4d4a525c...0acb762d8` does contain three runtime files (`server/storage.ts`, `guard-eval-tracker.ts`, `shared/schema.ts`) **plus a DROP migration** — but all of them trace to `94f3869f6`, the **P19-B-PERPFEED close-out**, interleaved on the shared branch. **My batch's own commits touch nothing runtime, so the N/A holds.**
⛔ **BUT staging is at `f245ac3a7` (2026-08-19 01:50Z), so that DROP migration is sitting UNDEPLOYED on the branch.** Whoever owns the PERPFEED close-out owes it a Step-6. **Relayed to CC-C directly** rather than narrated to Kyle. *(He also stated he could NOT check whether `feature_snapshots` is still live — no DB reach from his account — rather than implying he had looked.)*
