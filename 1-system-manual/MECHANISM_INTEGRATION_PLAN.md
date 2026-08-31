# WHERE THE NEW MECHANISMS FIT — WORKFLOW PLACEMENT, INVOCATION, ADOPTION, AND WHAT COMES OUT

> **Kyle-directed 2026-08-31**, after the Langston iteration closed on all three research rounds: *"I would like to understand where these tools fit into our current workflow, when they'll be called, when they'll be used, and how we get the other sessions to use them. Does that mean we're adding another rule? And if so, what rules do we drop out?"*
> ⛔ **THE HEADLINE ANSWER, AND IT IS THE WHOLE POINT OF THE PROGRAMME: NONE OF THE THREE ADDS A RULE. TWO REQUIRE NO ADOPTION AT ALL BECAUSE NOBODY HAS TO KNOW THEY EXIST.**

---

## 1. THE THREE PIECES — AND THEY ARE DELIBERATELY NOT ONE THING

| | piece | what it catches | Langston's ruling |
|---|---|---|---|
| **A** | **IMPACT LOOKUP** (the language server, installed 2026-08-30) | **blast radius** — what else does this change reach | ⛔ **NOT A BATCH.** A **scope-bar amendment**, folded into work in hand |
| **B** | **`B-MEASURE-GATE`** — a `PostToolUse` hook, matcher `Bash` | **wrong-object** — the command ran and its output is not what the claim is about. **77 instances / 24 batches / 48%** | the batch. Two stages, **warn-only first** |
| **C** | **`B-STATE-ASSERTION-LINT`** | **consensus staleness** — a sentence that was true when written | **its own batch**, placed AFTER B's hooks, BEFORE the rule-conversion sweep |

⛔ **THEY ADDRESS THREE DIFFERENT FAILURES AND MUST NOT BE SOLD AS A STACK.** ★ **Langston killed my attempt to order them by value: I ranked A first because we already own it — *"a cost argument wearing a value argument's clothes."* A answers *"what does this edit touch"*; our top failure is measuring something **nobody edited**.**

---

## 2. WHERE EACH FIRES IN THE ELEVEN STEPS

| | fires at | invoked by | a session must… |
|---|---|---|---|
| **A — impact lookup** | **Step 1 (scope)** and **Step 2 (audit)**, wherever a blast-radius claim is made | **the session, deliberately** | ⚠️ **DO SOMETHING — the only one of the three that does** |
| **B — measure gate** | **every gated `Bash` result, at any step, continuously** | ⛔ **NOBODY. It fires by itself.** | ✅ **nothing** |
| **C — state-assertion lint** | **the governance checker's existing 30-minute timer** *(proven live: `governance-checker.timer`, and it raised `a25799c8` against CC-A's own batch)* | ⛔ **NOBODY.** | ✅ **nothing** |

### ★ A IS THE ONLY ONE NEEDING HUMAN COMPLIANCE — AND IT IS ENFORCED AT A GATE THAT ALREADY EXISTS
**Langston's amendment, under his standing block-thin-scopes rule:** *"a scope's blast-radius statement must quote the reference query and its result, not prose."*
⇒ ✅ **He refuses the scope at Step 1. No session has to remember anything: a scope that asserts blast radius in prose does not pass.** ★ **That is a rule becoming a mechanism — the programme's whole thesis — without a line being added to any always-loaded file.**
⚠️ **AND THE REACH LIMIT SHIPS WITH IT OR WE REPEAT `#661` LEG 1 (his condition):** a reference set is **PRESENCE evidence and cannot make an absence claim.** It does not cross dynamic dispatch, string-keyed lookup, a SQL column name, a DB row or a config key — **precisely `§9.5(a-ii)`'s hole, where a removed writer with a surviving reader is invisible to caller-tracing, `tsc` and CI alike.** ⇒ **it sits BESIDE the state-write census; it never replaces it.**

---

## 3. ⛔ HOW THE OTHER SESSIONS GET THEM — AND THE MEASURED REASON THIS IS THE RISK

**MECHANICALLY: hooks travel by git.** `.claude/settings.local.json` is **TRACKED** (verified: `git ls-files` returns it; it is not ignored) and present in all three clones. **A session gets a new hook when it PULLS and RESTARTS.** ⇒ **no announcement, no rule, no adoption step.**

### ⛔⛔ AND THAT IS EXACTLY WHERE IT FAILS SILENTLY. MEASURED 2026-08-31:

| clone | behind `origin` | HEAD dated |
|---|---|---|
| `-old` (CC-A) | 4 | 2026-08-31 |
| ⛔ **`-new` (CC-B)** | ⛔ **747** | ⛔ **2026-08-16 — fifteen days** |
| `-analyst` (CC-C) | 0 | 2026-08-31 |
| `DawnTraderV3` (spare) | 0 | 2026-08-31 |

⛔⛔ **A HOOK SHIPPED TODAY WOULD NOT EXIST FOR CC-B AT ALL — AND NOTHING WOULD SAY SO.** ★ **This is the same failure recorded on 2026-08-20, when CC-B was 131 behind and INFRA 53 and NEITHER clone held `CONDUCT.md` or its loader.** ⚠️ **It has gone from 131 to 747.**

⇒ ⛔ **THEREFORE, A BINDING CONDITION ON EVERY ONE OF THE THREE: A MECHANISM MUST REPORT WHETHER IT IS ACTUALLY LIVE PER SESSION, OR IT IS A MECHANISM THAT READS AS COVERED AND IS NOT** — which is the exact failure this whole programme exists to remove, arriving one level up.
✅ **THE INSTRUMENT ALREADY EXISTS AND IS UNUSED FOR THIS:** `log-instructions-loaded.mjs` writes every session's loaded set to `~/.claude/instructions-loaded.jsonl`. **A per-session liveness row is a small addition to a sink we already run.**

---

## 4. ⛔ DOES THIS ADD A RULE? **NO. NOT ONE.**

| piece | rule added? | why not |
|---|---|---|
| **A** | ❌ | a **stricter reading of Langston's existing Step-1 gate.** He already refuses thin scopes; this names what "thin" means for a blast-radius claim |
| **B** | ❌ | **code that runs on its own.** A session that never heard of it is still gated |
| **C** | ❌ | **a check inside the governance checker**, which already runs and already raises alerts to owners |

★★ **AND THAT IS THE ANSWER TO THE PROGRAMME'S CENTRAL MEASUREMENT.** `wrong-object` is **ALREADY the most heavily ruled pattern we own** — `CLAUDE.md` rule 29, `CONDUCT.md` §10, and slot 1 of the always-loaded short list — **and it is the most frequent by a factor of six.** ⇒ **a fourth rule for it would be the measured failure, repeated. The output has to be something that executes.**

★ **LANGSTON'S DISCRIMINATOR, WHICH SETTLES *"we already own it"* AND IS WORTH KEEPING AS A STANDING TEST:** *does the owned thing **EXECUTE**, or is it **PROSE**?* **A language server executes — that instinct was right and near-zero-build. The staleness rule has never executed once: it sat auto-loaded in his file for twenty days, a few lines above the false value it was meant to prevent.** ⇒ **"we own it" is TWO different answers wearing one phrase.**

---

## 5. ⛔ SO WHAT COMES OUT? **NOTHING YET — AND THE DROP IS A LATER, EARNED STEP**

⛔ **NOTHING IS ADDED TO ANY ALWAYS-LOADED FILE, SO NOTHING NEEDS TO COME OUT TO MAKE ROOM.** *(`CONDUCT.md` is at its cap and its one-in-one-out rule is NOT triggered by any of this.)*

★★ **THE DROP HAPPENS AT LEG 3 — THE RULE-CONVERSION SWEEP — AND ONLY AFTER THE MECHANISMS HAVE PROVED THEMSELVES.** Once a rule has a mechanism that demonstrably fires, its always-loaded prose can shrink to a pointer: **the operative sentence stays, the paragraphs of evidence move out** (`#564`'s placement rule, applied with a mechanism behind it instead of a hope).
⛔⛔ **AND THE ORDER IS LANGSTON'S, FOR A REASON THAT IS NOT NEGOTIABLE: leg 3 waits on leg 2.** *"Converting rules to mechanisms before the mechanisms are trusted loses both."* ⇒ **and `B-STATE-ASSERTION-LINT` sits BETWEEN them deliberately — converting rules while duplicate copies survive just multiplies the copies.**

⇒ **THE SEQUENCE, PLACED NOT DATED:**
> **A (fold in, now — nothing to build) → B leg 1 warn-only → B leg 2 blocking, once the false-positive rate is measured → C the state-assertion lint → leg 3 the rule-conversion sweep, where prose finally comes out.**

---

## 6. PRE-REGISTERED BARS, SET BEFORE ANY DATA *(Langston, and I am not restating them into something looser)*

- **B ships at ≥5 of 8 known positives caught, AND ≤1 false block per 50 gated `Bash` results (2%).** Below 5 it is decorative; above 2% **it gets bypassed inside a week, which is how `#756` died.**
- ⛔ **The first arm ships WARN-ONLY.** Live FP measured over a fixed window before anything blocks. **A gate that blocks on day one has an FP anecdote, not an FP rate.**
- ⚠️ **The 8 known positives were chosen BY LOOKING AT THE DATA — `control-enumerates-the-observed` by construction.** ⇒ **the negative arm is sampled BY REF-WINDOW, independently of whether anything was later corrected.**
- ⛔ **An agent-hook verdict citing NO tool output it produced itself is INADMISSIBLE** — that is a prompt hook wearing an agent's clothes, and re-reading my own sentence is the failure, not the fix.
- ⛔ **C inherits a blind spot AT BIRTH and it is named rather than discovered:** the delivery-board recipe case has **no register entry**, so claimed-vs-register returns CLEAR over a corpus that excludes it — **the tripwire shape, `#661` leg 2.**

---

## 7. WITHDRAWN

> **PREVIOUSLY STATED: teams run 15-30% documentation drift, detected in weeks-to-months, so we sit in the normal band. NOW: withdrawn as calibration. REASON: Langston refused the population — theirs is "teams' documentation", ours is "governance state assertions in auto-loaded files". Different object. Our own four instances (4 days, 3 weeks, 17 days, 20 days) carry the argument without it.**
> **PREVIOUSLY STATED: a judgement-capable hook can sit at the END of a turn and hand a message back before it reaches Kyle. NOW: FALSE. Prompt and agent hooks are available ONLY on tool events — `PreToolUse`, `PostToolUse`, `PermissionRequest`. REASON: I welded two adjacent true facts into one sentence that is not true. ⛔ That is this batch's own failure class, in its own approach round, on its load-bearing sentence — recorded here at Langston's instruction as the best instance we will get.**
