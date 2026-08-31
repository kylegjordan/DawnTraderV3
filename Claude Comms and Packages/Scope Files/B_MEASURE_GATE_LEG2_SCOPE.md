# B-MEASURE-GATE leg 2 — SCOPE (hooks: convert measurement/process rules into mechanisms)

change-class: architecture

**Owner:** CC-A · **Date:** 2026-07-30 · **Home:** `RUNNING_ISSUES` #623 · **Leg 1 shipped:** `b43af6c1d` (rule 29 + history §5.29)
**Kyle directive (2026-07-30):** *"Let's proceed with Legs 2 and 3 first in order to avoid mistakes in the rest of your batch work."* ⇒ leg 2 precedes #602 / #613 / #615 / the retention legs.
**Langston ruled the design** at `4e0d5335`/`69f3c03d`; this scope implements his scoring, his ordering, and his two non-negotiables.

⚠️ **AFFECTS ALL THREE CC SESSIONS.** Hooks live in `.claude/settings.local.json` + `.claude/hooks/`, which ship in the repo. **A blocking hook can interrupt CC-B's or CC-C's batch mid-flight.** OBJ-0 is therefore a notification obligation, not a courtesy.

---

## 0. PREVIOUSLY-STATED-VS-NOW (§9.2)

- **PREVIOUSLY STATED: eleven targeting errors. NOW: ten. REASON:** Langston's population correction — #6 was confabulation (no measurement to control, so no adjacent object) and the self-caught #11 is a *working control*, not a defect; counting it inflated the denominator the fix was sized against.
- **PREVIOUSLY STATED: a control on every reported number. NOW: a positive control only for load-bearing numbers, zeros, near-totals and absences. REASON:** Langston ruled the per-number form unaffordable and predicted it would be abandoned within a week; I agree and had no counter-argument.
- **PREVIOUSLY STATED: the conversion line is "mechanical vs judgement." NOW: "does the violation have a TOOL-EVENT SIGNATURE?" REASON:** Langston's correction — `guard-governed-read` works because the violation *is a command string*; that, not the rule's nature, is what makes it hookable.

## 1. PROVENANCE READ (§2 1.b) — TIER 1 on the two files whose behaviour changes

**`.claude/settings.local.json` + `.claude/hooks/`.** Introduced for rule 22 enforcement (`guard-governed-read.mjs`, 2026-07-13) after the same false-absence error recurred twice; `guard-bare-commit.mjs` followed (#540, 2026-07-19) after two cross-session index sweeps. **Original intent, verbatim from `CLAUDE.md` rule 22:** *"a **PreToolUse hook** … that **BLOCKS** any Bash command combining a git object read with stderr suppression — the exact dangerous shape — and tells you to remove the suppression … it is **fail-open** (only ever blocks that one shape, never breaks a session)."*
⇒ **DISPOSITION (1) — still relevant and correct.** Design intent is *narrow shape, fail-open, never breaks a session*, and it is the intent this leg extends rather than revises. **Both existing hooks are the working precedent and their fail-open construction is the pattern to copy.**
**`CLAUDE.md` §10.5 / §7.1 / rule 19 / rule 25.c** — read for intent in leg 1; each stays **DISPOSITION (2): relevant, needing an update to today's intent** — the rule text is right, its *enforcement surface* is missing. **No rule text is deleted in leg 2** (that is leg 3, and only per-rule once its hook has been observed firing).

## 2. OBJECTIVES

**OBJ-0 — NOTIFY CC-B AND CC-C BEFORE ANY HOOK LANDS.** Post to `#general` naming both sessions: what will block, what will merely warn, and the disable path. **Verification:** the post exists and both hooks' behaviour is stated in it. *(A hook that surprises another session mid-batch is this batch causing the class of error it exists to prevent.)*

**OBJ-1 — §10.5 ALERT CHECK → `UserPromptSubmit` hook** (Langston: *"strongest candidate, convert first"*). Injects active-unacked alerts so the per-turn check stops depending on memory.
- ⚠️ **HARD REQUIREMENT (his):** *"Must fail-open with a hard timeout — an SSH to Frankfurt on every turn is a new wedge surface."* ⇒ timeout ≤3s, `exit 0` on any failure, **never** blocks the prompt, and caches so we do not SSH on every keystroke-turn.
- **Verification:** alert appears injected on a turn with a known-present active alert; **and with the network path deliberately broken, the turn still proceeds** (that second half is the load-bearing test).

**OBJ-2 — §7.1 `git fetch` GATE → `PreToolUse` on `git commit`/`git push`.** Warns when `origin/<branch>` was last fetched longer ago than a threshold, because the sync gate's step 0 has **already failed once by being remembered** (reported behind 0 while genuinely behind 3; and again tonight at behind 6 while picking an issue number).
- **Verification:** with a stale fetch, the warning fires; with a fresh fetch, silent; **and it never blocks** (warn-only — a blocked commit at the wrong moment costs more than a stale compare).

**OBJ-3 — RULE 19 CI-GREEN → `PreToolUse`, keyed on the COMMIT THAT ADDS A `*COMPLETION_REPORT*` PATH** (Langston's correction: *"the event isn't 'close'"*). Demands a cited run id in the message.
- **Verification:** a completion-report commit without a run id warns; with one, silent.

**OBJ-4 — RULE 29 MEASUREMENT SHAPES → `PreToolUse`, WARN-ONLY.** The shapes with a genuine command-string signature, each drawn from a real error this session: an unfiltered `LIKE '%…%'` table hunt (missed `exit_decision_archive`) · `grep -c` used as a population · `head -N` treated as a population · a `2>/dev/null` on a non-git read. **Warn, never block** — these are legitimate commands in other contexts, and rule 25.c is *content*, so per Langston the best available is a prompt.
- **Verification:** each shape triggers its warning; a controlled equivalent does not.

**OBJ-5 — THE SELF-TEST (Langston's second non-negotiable).** *"A fail-open hook that has silently stopped running is a lookalike failure in the enforcement layer itself — the exact bug we're fixing."* ⇒ each hook records a heartbeat on fire; a **weekly** check reports any hook with no heartbeat, and **absence of the report is itself the alarm** (the `B-STAGING-LIVENESS-WATCH` pattern).
- **Verification:** disable one hook deliberately → the self-test names it.

## 3. EXPLICITLY OUT OF SCOPE

- **Leg 3** (collapsing rule text to pointers) — separate batch, **per-rule gated on that rule's hook having been OBSERVED firing.** Langston: *"converting rules to mechanisms before the mechanisms are trusted is how you lose both."*
- **Judgement rules — NOT convertible:** rule 24's three outcomes · §2 1.b provenance · rule 15 · §1 plain-language · rules 27/28. A hook cannot rule on intent.
- **Anything that BLOCKS on a content judgement.** Blocking is reserved for the narrow command-shape class (rule 22's precedent).

## 4. RISK — stated plainly

**The failure mode this batch can itself cause, and Langston named it in a different context: a mechanised WRONG rule is worse than prose, because it is authoritative.** Mitigations: warn-only for everything except the already-precedented block shapes; fail-open by construction; the OBJ-5 self-test; OBJ-0 notification; and **a stated disable path in the same post** so another session is never stuck behind my hook.
**Second risk:** banner-blindness. Langston: *"fire it too often and it goes banner-blind, which is worse than nothing."* ⇒ OBJ-4 warnings must be specific and rare; if any fires on routine correct work, it gets narrowed or removed, not tolerated.

---

# ★★ AMENDMENT 1 — 2026-08-31: THE POST-EXECUTION LEG, AND THE MEASUREMENT THAT REORDERED THE BATCH

> ⛔⛔ **THIS SCOPE ALREADY EXISTED AND I ALMOST WROTE A SECOND ONE.** Kyle said *"go ahead and write the scope"*; the step-1 existence check returned `B_MEASURE_GATE_LEG2_SCOPE.md` **and** its pre-audit, both dated 2026-07-30. ★ **In the batch whose subject is measuring the wrong object, I nearly duplicated the object.** Recorded rather than quietly avoided.

## A1.0 WHAT CHANGED SINCE 2026-07-30, AND WHY IT IS AN AMENDMENT NOT A REWRITE

✅ **OBJ-0 through OBJ-5 STAND UNCHANGED.** Langston ruled that design and his two non-negotiables still bind. **Nothing below revises them.**
⛔ **THE GAP: every one of OBJ-1..5 fires BEFORE a command runs** — `PreToolUse` or `UserPromptSubmit`. **They gate the SHAPE OF A COMMAND.** ⇒ **the scope has no leg that can see what a command RETURNED**, and that is where `wrong-object` is born: **the command is well-formed, it runs, it exits 0, and its output does not answer the question the claim is about.**

## A1.1 THE MEASUREMENT THAT PUTS THIS FIRST (Kyle-directed ledger pass, 2026-08-31)

**Population: every `MISTAKE:` trailer in the commit history. 43 distinct patterns, 162 trailered instances.** ✅ **CONTROL: 166 raw `MISTAKE:` occurrences — 4 malformed, so the instrument is sound.**

| pattern | instances | batches | share |
|---|---|---|---|
| ⛔ **`wrong-object`** | **77** | **24** | **48%** |
| `silence-not-evidence` | 12 | 8 | 7% |
| `verification-weaker-than-claim` | 9 | 6 | 6% |
| `fix-follows-pointer` | 8 | 6 | 5% |

★★ **ONE PATTERN IS 48% OF EVERY MISTAKE WE HAVE RECORDED, SIX TIMES SECOND PLACE — AND IT IS ALREADY THE MOST HEAVILY RULED THING WE OWN** (`CLAUDE.md` rule 29, `CONDUCT.md` §10, slot 1 of the always-loaded short list). ⇒ ⛔ **THE MOST-RULED PATTERN IS THE MOST FREQUENT. A FOURTH RULE FOR IT WOULD BE THE MEASURED FAILURE REPEATED.**

## A1.2 ★ **OBJ-6 (NEW) — `PostToolUse`, MATCHER `Bash`: SEE WHAT THE COMMAND RETURNED**

**A `PostToolUse` hook fires after a tool call succeeds and receives the call AND its result.** ⇒ **the only point in the design that sees the read itself.**
✅ **It carries everything a `Stop` hook would have:** `decision:"block"` with a `reason`, and `hookSpecificOutput.additionalContext` — *"text injected into model context."*

⛔⛔ **AND THE SENTENCE THAT PROPOSED A `Stop` LEG WAS FALSE. RECORDED AT LANGSTON’S INSTRUCTION AS THE BEST INSTANCE THIS BATCH WILL EVER GET.** I wrote that a judgement-capable hook could sit on `Stop` and hand a message back before it reached Kyle. **The shipped bundle’s own hooks documentation states, twice: prompt hooks and agent hooks are *"Only available for tool events: `PreToolUse`, `PostToolUse`, `PermissionRequest`."*** ★ **`Stop` has a feedback channel and prompt hooks exist — two adjacent true facts, welded into one that is not true. That is `wrong-object`, in the approach round of the batch against `wrong-object`, on its load-bearing sentence.**
⇒ ✅ **THE `Stop` LEG IS STRUCK. The batch survives intact on `PostToolUse` alone.**

**⛔ THE MATCHER IS `Bash` AND NOTHING ELSE (Langston set the cut, and it is evidence-based):** `Read`/`Grep`/`Glob` **do not manufacture denominators.** All eight attributed instances at `MISTAKE_PATTERNS.md:264-278` were Bash — worktree-vs-ref, `git log -200` capping after filtering, substring `correct`, the `opened_at` window, the `total_fee` column, a 404 read as a row list, `grep -cvE`. **The population is Bash.**

**★ TWO STAGES, CHEAP IN FRONT OF EXPENSIVE:** a **deterministic command hook** fires on every gated Bash result and escalates only a subset to an **agent hook**. ⛔ **DESIGNING THAT ESCALATION PREDICATE IS THIS OBJECTIVE’S REAL WORK AND MUST NOT BE HAND-WAVED — IT IS WHERE THE COST LIVES.**

⛔⛔ **AGENT HOOK, NOT PROMPT HOOK, AND THE DISTINCTION IS THE WHOLE EPISTEMIC ARGUMENT.** A **prompt** hook re-reads my sentence about the object — it inherits my framing if my framing is in the transcript, which is Langston’s own `#675` failure. **An AGENT hook *"runs an agent with tools"* and can RE-EXECUTE THE MEASUREMENT AGAINST THE OBJECT.** ★ **That is not a second reader; it is an independent re-derivation.**
⛔ **PRE-REGISTERED, HIS: an agent-hook verdict citing NO tool output it produced itself is INADMISSIBLE** — that is a prompt hook wearing an agent’s clothes.
⛔ **He will NOT approve a prompt-type hook as a verdict-carrying gate.**

## A1.3 ⛔ PRE-REGISTERED BARS — SET BEFORE ANY DATA, AND NOT TO BE RESTATED LOOSER

| | bar |
|---|---|
| **ship** | **≥5 of the 8 known positives caught, AND ≤1 false block per 50 gated Bash results (2%)** |
| below 5 | **decorative** |
| above 2% | ⛔ **bypassed inside a week — which is how `#756` died** |
| **first arm** | ✅ **WARN-ONLY** (`additionalContext`, no block). Live FP measured over a fixed window **before anything returns `decision:"block"`.** ★ *A gate that blocks on day one has an FP anecdote, not an FP rate.* |
| ⚠️ **the negative arm** | **The 8 known positives were chosen BY LOOKING AT THE DATA — `control-enumerates-the-observed` by construction.** ⇒ **sample the negative arm BY REF-WINDOW, independently of whether anything was later corrected.** |

## A1.4 ✅ THE PER-SESSION LIVENESS CONDITION IS **ALREADY OBJ-5** — I NEARLY RE-INVENTED IT

**CC-B was dormant 15 days holding 33 open items and NOTHING SAID SO** — found by accident while measuring hook propagation. **Its clone was 747 commits behind: a hook shipped that day would not have existed for it.**
★ **I proposed *"a mechanism must report whether it is live per session"* as a new binding condition. IT IS OBJ-5, WRITTEN 2026-07-30:** *"a fail-open hook that has silently stopped running is a lookalike failure in the enforcement layer itself — the exact bug we are fixing."*
⇒ **OBJ-5 is AMENDED, not added to: its self-test must report per SESSION, not only per hook** — a hook can be alive in three clones and absent from a fourth, and OBJ-5 as written would not see that. **CC-B’s fifteen silent days are the case.**

## A1.5 CHANGE-CLASS — CONFIRMED `architecture`, NOT LOWERED

✅ **The 2026-07-30 header declared `architecture` and it stands.** ⇒ under the change-class matrix (`d8d4999bb`) that makes **`SYSTEM_MANUAL.md` and `SYSTEM_IMPACT_MAP.md` REQUIRED, not judged.** ⚠️ **I would have declared this `non_architecture` had I written it fresh today — and that would have downgraded two required documents to judged.** ★ **A second reason the existence check earned its keep.**

## A1.6 ⛔ WHAT THIS AMENDMENT DOES **NOT** DO

1. ⛔ **It does not touch leg 3.** Langston: *converting rules to mechanisms before the mechanisms are trusted loses both.* **Leg 3 stays gated per-rule on that rule’s hook having been OBSERVED firing.**
2. ⛔ **It does not address CONSENSUS STALENESS.** Every leg here — old and new — fires at **write time on a single artifact.** A copy that was right when written and is wrong now is **structurally unreachable** by all of it. ⇒ **`B-STATE-ASSERTION-LINT`, its own batch, placed after these hooks and before leg 3.**
3. ⛔ **It does not carry the impact-lookup.** Langston ruled that **not a batch** but a **scope-bar amendment**: *a scope’s blast-radius statement must quote the reference query and its result, not prose.* **Folded into work in hand.** ⚠️ **And its reach limit ships with it: a reference set is PRESENCE evidence and cannot make an absence claim — it does not cross dynamic dispatch, string-keyed lookup, a SQL column name, a DB row or a config key. It sits BESIDE the state-write census, never replacing it.**

## A1.7 WHAT WOULD FALSIFY OBJ-6

1. **If the escalation predicate cannot be made cheap**, a hook on every Bash result is turned off inside a week and we have built `#756` again. **Say so and stop.**
2. **If the agent hook cannot cite its own tool output**, it is a prompt hook and Langston has already refused it as a gate.
3. ⚠️ **Grounding checks REDUCE this class; they do not eliminate it** — a model can still misread what it genuinely retrieved. **This is a large dent in 48%, not a solve, and it is sized that way going in.**
