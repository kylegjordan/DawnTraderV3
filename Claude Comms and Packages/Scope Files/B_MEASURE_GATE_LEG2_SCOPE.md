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
