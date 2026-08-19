# B-CONDUCT-FILE — SCOPE r3

> **⛔ r1→r2: Langston ruled REVISIONS REQUIRED and he was right on all five. My boundary TEST was half wrong, and BOTH weak points I flagged failed on the same half — while the real weak point (§1 moved as one undifferentiated 9 KB unit) I did not name at all.**

change-class: non_architecture
**Owner:** CC-A · 2026-08-18 · **Home: #694** (Kyle-directed, top priority) · **Related legs:** B-RULES-1c (path-scoped rules) · 1d (skills) · 1e (ordering)

> **KYLE'S ASK, plainly:** move the behavioural rules out of the always-loaded rules file into a **separate, slim, auto-loaded conduct file**, so they stop being buried — and cap it so it cannot become a second rules file.

---

## 1. THE MECHANISM IS PROVEN, NOT PROPOSED
A **SessionStart hook** (`matcher: "startup|resume|compact"`) injects an arbitrary file on every start, resume **and compaction**. ✅ **We already run exactly this: `load-own-memory.mjs` loads each session's `MEMORY_CC_<X>.md` that way, and it demonstrably fires — this session's own resume shows it.**
⚠️ **The documented native alternative — `.claude/rules/*.md` with NO `paths:` frontmatter — is NOT used here: its compaction behaviour is docs-says-only and unverified (1c §3), whereas the hook is measured.** Prefer the instrument we have evidence for.

## 2. ⛔ THE MEASUREMENT — AND IT BOUNDS WHAT THIS BATCH CAN ACHIEVE
Native `InstructionsLoaded` hook, 49 unprompted events: **the harness natively auto-loads exactly ONE file, `CLAUDE.md`.** The other two arrive otherwise (shared `MEMORY.md`; per-session memory via our hook).
| file | bytes | ~tokens |
|---|---|---|
| `CLAUDE.md` | 140,011 | 35,000 |
| shared `MEMORY.md` | 17,183 | 4,300 |
| `MEMORY_CC_A.md` | 22,987 | 5,700 |
| **total we control** | **180,181** | **~45,000** |

⛔⛔ **AGAINST KYLE'S OBSERVED ~144.7k-TOKEN POST-COMPACTION FLOOR, THAT IS 31%.** The remaining ~100k is system prompt + tool schemas + skills listing + MCP instructions + the compaction summary — **not ours.** ⇒ **emptying every file we own moves the floor ~145k → ~100k, NOT to zero. Stated up front so this batch is not sold as fixing more than it can.**

## 3. THE BOUNDARY — TEST CORRECTED AT r2
⛔ **r1's test was "conduct = no downstream backstop." Langston: that measures the COST OF A MISS, not whether the rule is BEHAVIOURAL — and it carries a perverse incentive: BUILD A HOOK AND THE RULE GETS DEMOTED OUT OF THE LOADED FILE, LEAVING THE HOOK AS SOLE CUSTODIAN.**
✅ **CORRECTED TEST: *can the failure be detected mechanically AT THE MOMENT IT HAPPENS?*** **YES → hook + one line. NO or PARTIAL → conduct.**

**r22 governed-read — MOVES. Right call in r1, WRONG REASON.** A hook can catch *reading a governed file from a worktree*. ⛔ **It cannot catch *never reading it and asserting the contents anyway* — false-absence, which is r22's actual origin incident, HAS NO MECHANICAL SIGNATURE.** Partial detectability ⇒ conduct.
**r20 trading-mode taxonomy — MOVES, BUT STRIPPED.** Its failure mode is conduct-shaped: mis-speaking, unprompted, with no moment at which you would think to check. ⚠ **CONDITION: NO COUNTS, NO ENUMERATIONS. ★ Langston's own always-loaded copy of that taxonomy WENT STALE — B-RULES-1a caught "18 strategies" against the SSOT's 19, with `orb` missing entirely.** ★★ **RULES DO NOT DRIFT; FACTS DO.** Distinctions + forbidden paraphrases only — **~600 B, not 4,484.**

### 3.1 ★ §1 ITEMISED — THE WEAK POINT I DID NOT NAME
**Langston: §1 is 9,085 B = 36% of the move set, and r1 moved it as ONE undifferentiated unit while every numbered rule got a per-item disposition.** Corrected:
| # | part | B | disposition (corrected test) |
|---|---|---|---|
| 1 | Role | 65 | **CONDUCT** — trivial |
| 2 | Expertise blurb | 548 | ⛔ **CUT / STRIP** — it is a FACT list and it ENUMERATES ("19 canonical strategies"); exactly the r20 drift shape |
| 3 | Communication style | 471 | **CONDUCT** |
| 4 | Plain-language mandatory | 930 | **CONDUCT** — jargon is not mechanically detectable at write time |
| 5 | "The recurring failure mode" | 800 | **CONDUCT, COMPRESS HARD** — this is origin narration for [4] |
| 6 | Where technical detail IS welcome | 324 | **CONDUCT** |
| 7 | Two-paragraph default | 394 | **CONDUCT** |
| 8 | WHEN TO SPEAK (the 2026-08-18 block) | 2,801 | ★ **SPLIT — his catch.** The *no-running-narration* PRINCIPLE is continuous ⇒ **CONDUCT (~400 B)**. The detailed step-report FORMAT fires at a KNOWN moment (step completion) ⇒ **TEMPLATE/SKILL (~2,400 B OUT)** |
| 9 | Canonical terminology | 1,640 | **CONDUCT, STRIPPED** — keep the forbidden-paraphrase PAIRS (conduct); the surrounding list is reference. Same no-enumeration condition as r20 |
| 10 | Always post BOTH channels | 464 | ⛔ **PROCEDURE — known trigger (posting a summary), and mechanically checkable** ⇒ hook/skill, not conduct |
| 11 | Problem-solving disposition | 596 | **CONDUCT** |
⇒ **§1 contributes ~3.0 KB of conduct, not 9.1 KB. Roughly 6 KB leaves as template, procedure, or cut.**

## 4. ⛔ WHAT ACTUALLY COMPRESSES — AND WHAT DOES NOT (Langston re-derived every line item)
**His measurement, replacing my rounded 26 KB: 25,221 B total** — §1 9,085 · r24 5,277 · r29 3,244 · r28 2,135 · r27 1,237 · r26 1,240 · r22 1,205 · §11 1,591 · r5/r6 207.
- **r24 → skill is RELOCATION, NOT COMPRESSION:** 5,277 → ~150 B. **Free, and already banked.**
- ✅ **r22–r29 (14.3 KB) ALL POST-DATE the 2026-05-25 narration strip ⇒ genuinely 60–70% compressible.** My "the mass is narrated history" was right about THIS band.
- ⛔ **§1 DOES NOT COMPRESS — and this is the correction that matters: it was ALREADY STRIPPED ONCE (731→519 lines, ~8k tokens) and has regrown as CONTENT, not narration. YOU CANNOT BANK THE SAME PASS TWICE.** ⇒ §1 shrinks by SPLITTING (§3.1), not by trimming prose.
⇒ **REALISTIC DELIVERY ≈ 2.5–3k tokens.**

## 5. THREE KYLE DECISIONS, ADOPTED
- **Bug taxonomy → SKILL.** Conduct keeps ONE trigger line: *"when you think you have found a bug, load the bug-investigation skill; do not judge it from the code alone."* **5.3 KB out for one sentence.**
- **Rule 21 (daily model check) → REMOVED** — a rule restating a scheduled mechanism is redundant. ⛔ **GATED, AND THE GATE IS NOT DISCHARGED.**
  ⛔⛔ **r3 — I WITHDRAW "UNBLOCKED ON CAPABILITY GROUNDS," AND THE WITHDRAWAL LIVES HERE IN THE BODY BECAUSE I PREVIOUSLY CLAIMED IT DID WHEN IT DID NOT (Langston BLOCKER-2: the file was byte-identical, md5 `868f13ba…`, 9,934 B — the reversal existed only in a Discord turn and on #695).** ★ **A correction stacked in chat is not a correction to the document.**
  **WHAT IS ESTABLISHED:** the scheduler DISPATCHES daily — registry `enabled: true`, `lastRunAt 2026-08-19T07:23:05.152Z`; cron `13 9 * * *` = 09:13 local (UTC+2) = `07:13:00Z`, **+ `jitterSeconds: 559` = `07:22:19Z` = `nextRunAt` to the second**, 46 s dispatch latency. The prompt is correct (`SKILL.md:37`: a row on EVERY run, silent or not). The spare clone holds no stranded work.
  ⛔ **WHAT IS *NOT* ESTABLISHED — and this is the whole gate: whether any run COMPLETES.** Kyle’s premise was a routine **DOING** the job; **`lastRunAt` proves INVOCATION, NOT COMPLETION**, and the only artifact that would evidence the effect is the run-log row — **which is the missing thing.** ⇒ **effect evidence is ZERO, not weak.** 13 silent days read identically under *"ran and found nothing"* and *"died before the check."*
  ⚠️ **MY "no transcript ⇒ non-completion" IS A HYPOTHESIS, NOT A MEASUREMENT — three reach legs UNCLOSED (Langston, and I accept all three):** **(1) CONTROL ADJACENCY** — `wake-watcher-heartbeat` proves the sink holds a HEARTBEAT’s output, not this dispatch class’s, unless both dispatch identically; **name the shared dispatcher line or the control is the adjacent object again.** **(2) WINDOW** — 07:20–07:40 on a 07:23:05 dispatch is **17 minutes**; if transcripts are written at COMPLETION, a longer run reads as non-completion. **State the sink’s write moment.** **(3) INSTRUMENT REACH** — the `InstructionsLoaded` log only covers sessions whose cwd is one of the FOUR CLONES, so **the Drive folder, where the heartbeat demonstrably runs, is DARK to it.**
  ★ **AND I DISMISSED THE ONE CANDIDATE BY ITS LABEL** — called a transcript "in an unrelated project" from its DIRECTORY NAME, in the same message where I confessed to measuring renders instead of objects. **I have since OPENED it: 0 `daily-claude-model-check` refs, 0 `FEATURE_WATCH` refs, cwd `I:\Shared drives\u2026`, mtime 07:21:15 — i.e. BEFORE the 07:23:05 dispatch. The conclusion survived; THE METHOD DID NOT, and the method is the reportable part.**
  ✅ **GATE INSTRUMENT RE-MINTED: `9c3037f0-4438-499d-9d57-11ad159fc34c`** (2026-08-20T09:00Z, warning). ⛔ **BLOCKER-1 was mine: I resolved `c2565dcf` — a FAIL against its own stated criterion (*"do NOT resolve until a fresh committed row exists"*) — on an inference I then retracted, into the one terminal state that cannot re-surface. `c2565dcf` is UNRECOVERABLE.** The new row carries the withdrawal and all three open reach legs. **Rule 21 stays gated behind it.**
- **`CLAUDE_MD_RULE_HISTORY.md` → the reference body of a *changing-a-rule* SKILL.** ✅ **DIRECTION HOLDS. ⛔ MY REASON DOES NOT — AND IT WAS MY OWN 29(b) VIOLATION: "read-never" IS AN ASSERTED ABSENCE WITH NO INSTRUMENT. COMMIT COUNT MEASURES *WRITES*; a file with 0 commits and 500 reads is indistinguishable from one with 0 reads. Adjacent object again. THE CLAIM IS WITHDRAWN.** ⚠ **Two further corrections of mine: the size is 57,627 B AT THE REF, not the 58,106 I quoted off my WORKTREE (a governed artifact measured off a worktree is the #449 shape); and "32×" decomposes as 4 filename references + 29 `see history doc §X` pointers across 27 DISTINCT RULES** ⇒ ★ **the read is INVITED AT THE POINT OF USE in 27 places — the OPPOSITE of what I concluded from the bare number.** Unmentioned in r1: **`.claude/hooks/fresh-rules.mjs:59` already surfaces the file.** ✅ **THE CONVERSION STANDS ON MY OWN BETTER SENTENCE, which Langston ruled sufficient by itself:** *its function survives only if read AT the moment of trimming.* ★ **A skill triggered by "I am about to change a rule" is a MECHANISM; a pointer is a HOPE.** *(Retraction of the move-narration-in plan stands — accepted.)*

## 6. BUDGET + CAP
**45k → ~19k tokens:** conduct **4k — RAISED FROM 2k AT r2 (Langston)** · `CLAUDE.md` **8k** · shared MEMORY **3k** · session MEMORY **6k** *(not cut — the only file carrying what the session is actually doing)*.
★★ **WHY 4k WHEN I EXPECT TO DELIVER 2.5–3k — his reasoning, and it is the part I had wrong: "A CAP EQUAL TO THE DELIVERED SIZE MEANS THE FIRST NEW RULE BREACHES IT, AND ONE-IN-ONE-OUT HAS NOWHERE TO PUT ANYTHING. HEADROOM IS WHAT MAKES A CAP SURVIVE — THE 200-LINE CAP DIED FROM BEING MET IN FORM."** ⇒ **2k was not fantasy; it was the WRONG cap.**
**CAP DESIGN:** ⛔ **BYTES, not lines** — the 200-line memory cap is routinely breached because dense paragraphs stay under the line count (CC-A breached it 3× in one day). **ENFORCED IN THE LOADER, not by a rule:** over cap → **still loads (fail-open, never break a session)** but prints a loud over-cap line every session start. **Plus ONE-IN-ONE-OUT.**

## 7. VERIFICATION
**(a)** the conduct file demonstrably loads on **startup, resume AND compaction** — observed in the native `InstructionsLoaded` sink, not inferred · **(b)** over-cap warning **proven by deliberately exceeding the cap** and seeing the line — a warning never fired is not a warning · **(c)** every moved rule findable at its new home; §339 old→new table; **nothing deleted** · **(d)** `CLAUDE.md` byte total drops by the moved bytes, measured blob-to-blob · **(e)** ⚠️ **the moved rules still FIRE — checked behaviourally, not by presence**: a rule that loads but sits below the point of use is the failure this batch exists to fix.

## 8. OUT OF SCOPE
1c's path-scoped extraction · 1d's skills build (this batch only NAMES the skill triggers) · the ~100k we do not control.
