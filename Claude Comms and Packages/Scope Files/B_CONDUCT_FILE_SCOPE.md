# B-CONDUCT-FILE — SCOPE r2

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
- **Rule 21 (daily model check) → REMOVED** — a rule restating a scheduled mechanism is redundant. ⛔ **PAIRED WITH `#695`: the run log holds ONLY its 2026-08-06 seed row, so the routine has not fired in twelve days. Removing the rule while the mechanism is dead deletes the capability AND the reason anyone notices. The routine is proven firing, or explicitly retired by Kyle, BEFORE the removal ships.**
- **`CLAUDE_MD_RULE_HISTORY.md` → the reference body of a *changing-a-rule* SKILL.** ⚠️ **MEASURED: 58,106 B, 14 commits ever (last 08-06), referenced 32× from `CLAUDE.md` ⇒ write-heavy, read-never.** ★ **This RETRACTS my own earlier plan to move narration into it — that moves text from a file people skim into one they never open.** Its function (*"a rule without its origin gets optimised away"*) survives only if read AT the moment of trimming, which a pointer has never achieved.

## 6. BUDGET + CAP
**45k → ~19k tokens:** conduct **2k** · `CLAUDE.md` **8k** · shared MEMORY **3k** · session MEMORY **6k** *(not cut — the only file carrying what the session is actually doing)*.
**CAP DESIGN:** ⛔ **BYTES, not lines** — the 200-line memory cap is routinely breached because dense paragraphs stay under the line count (CC-A breached it 3× in one day). **ENFORCED IN THE LOADER, not by a rule:** over cap → **still loads (fail-open, never break a session)** but prints a loud over-cap line every session start. **Plus ONE-IN-ONE-OUT.**

## 7. VERIFICATION
**(a)** the conduct file demonstrably loads on **startup, resume AND compaction** — observed in the native `InstructionsLoaded` sink, not inferred · **(b)** over-cap warning **proven by deliberately exceeding the cap** and seeing the line — a warning never fired is not a warning · **(c)** every moved rule findable at its new home; §339 old→new table; **nothing deleted** · **(d)** `CLAUDE.md` byte total drops by the moved bytes, measured blob-to-blob · **(e)** ⚠️ **the moved rules still FIRE — checked behaviourally, not by presence**: a rule that loads but sits below the point of use is the failure this batch exists to fix.

## 8. OUT OF SCOPE
1c's path-scoped extraction · 1d's skills build (this batch only NAMES the skill triggers) · the ~100k we do not control.
