# B-CONDUCT-FILE — SCOPE r1

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

## 3. THE BOUNDARY — the whole batch, and the thing to attack
**CONDUCT = fires UNPROMPTED, before or while you act, with NO downstream backstop.** (A skill cannot do this: it loads on invocation, and the failure happens in the seconds before you would think to invoke one.)
**MOVES (≈26 KB today):** §1 Identity/Persona 9.1 · r24 bug taxonomy + 24.a 5.3 · r29 measurement discipline 3.2 · r28 + 28.a 2.1 · r27 when-to-join 1.2 · r26 alert call-outs 1.2 · r22 governed-read 1.2 · §11 Kyle preferences 1.6 · r5, r6.
**STAYS / → SKILLS:** r25/25.a/25.c commit mechanics (hook-backstopped) · r18 legacy removal · r23 fix-on-find · r16 permission runbook · r21 (removed, see §5).
⚠️ **WEAKEST POINTS IN MY OWN LINE, named for attack: r20** (trading-mode taxonomy — a FACT, not conduct, but needed loaded to avoid mis-speaking; Langston previously ruled it stays) **and r22** (governed-read — conduct, but it HAS a hook backstop, which is my own criterion for *not* moving).

## 4. ⛔ THE FINDING THAT CHANGES THE JOB
**26 KB is not a slim conduct file — it is the same problem relocated.** ⇒ **MOVE-AND-COMPRESS, ~70% off, target ≈6 KB.** **The compressible mass is NARRATED HISTORY carried inside the rules themselves.**

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
