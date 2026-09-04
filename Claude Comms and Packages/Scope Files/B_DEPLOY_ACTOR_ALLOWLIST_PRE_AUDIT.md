# B-DEPLOY-ACTOR-ALLOWLIST — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN (r1)

change-class: non_architecture · **Owner:** CC-B · **Issue:** `#656` residual · **Plan row:** `2.4a`
**Scope:** `B_DEPLOY_ACTOR_ALLOWLIST_SCOPE.md` **r2 at `cda17c57d`** — Langston **APPROVED WITH CONDITIONS** 2026-09-04 11:38Z, design ruling 11:42Z.
**Everything below is read at `origin/migration/aws-supabase`. Every line number is quoted from the ref, not from a working tree.**

---

## 0. ⛔ PREVIOUSLY STATED vs NOW — the deltas since the scope Langston approved

| | |
|---|---|
| **PREVIOUSLY STATED** | *"three deploys, three spellings, three sessions."* |
| **NOW** | **five recorded attributions, three sessions, FOUR distinct spellings** — `ANALYST-Claude` ×2 (CC-C) · `cc-c` ×1 (CC-C) · `cc-a` ×1 (CC-A) · `CC-B` ×1 (CC-B). |
| **REASON** | I attributed one spelling per session **by inference from the string** and never checked who used which. CC-C corrected it unprompted; I re-derived it at `F_G_2_PROGRESS_REPORT.md:9,:21` and the live record. **Two of the four are the same session one day apart.** |

| | |
|---|---|
| **PREVIOUSLY STATED** | *"the record holds one row, so there is no historical population to count"* (scope r1), and Langston's **"3 of 3, saturated"** (Step-1 approval). |
| **NOW** | **Both withdrawn — his by him, mine by me.** The RECORD holds one row; the SYSTEM does not. Every completion report transcribes the `--by` used at that deploy. **Object:** every `--by` / `deployed_by_claimed` occurrence in `Claude Comms and Packages/Batch Completion/`. **Population:** all of them, none excluded. **Result: 5 attributions / 4 spellings, of which the canonical set accepts exactly 1.** |
| **REASON** | The saturation argument wanted a corpus that persists and is re-derivable by someone else. A single-row record cannot be one; the reports are. |
| **STATUS** | Langston tagged this **`RULED ON REPORTED FACT`** and said he will enumerate the corpus himself at this step. **It is load-bearing on why the batch exists, so it is NOT settled until he does.** |

| | |
|---|---|
| **PREVIOUSLY STATED** | §6 recommended option **(c)**, generate the bash list from the TypeScript. |
| **NOW** | **(a) plus a drift test** — Langston's ruling, accepted. |
| **REASON** | His argument, which I had not seen: **the load-bearing part of (c) is the TEST, not the generator.** A committed generated file is a *third* copy whose freshness that same test must then check. Drop the generator, keep a readable literal, keep the test. |

---

# PART I — THE AUDIT

## A-1 ✅ RIDER 2 DISSOLVES AT THE OBJECT — the check is ALREADY ahead of every side effect

Langston's condition: *"validate before the first mutation, and state in Step 2 which line that is relative to `:81`."*
**Measured, `scripts/dt-deploy.sh` at the ref:** `--by` presence `:80`, charset `:81` → **lock `mkdir` `:84`** → holder write `:113` → `git fetch` `:121` → `npm ci` `:139` → build → migrate → `pm2 restart` `:166` → record `:206-214`.
⇒ **The validation is already the FIRST thing after the sha check and BEFORE the lock — which is before the earliest side effect of any kind, including taking the lock.** Nothing to move. The new gate replaces `:81` in place and inherits the ordering.
⚠️ **This is a rider I am reporting as SATISFIED, not as DONE BY ME.** It was built that way in `#656`.

## A-2 ⛔ THE RAW VALUE ECHOES AT **FOUR** SITES, NOT ONE — and the scope named none of them

Langston's rider 1 asked for `#987`'s no-echo condition carried forward. **Census of every site that can emit the raw `--by`, `scripts/dt-deploy.sh`, unbounded:**

| line | site | echoes |
|---|---|---|
| `:55` | `--by` value looks like a flag | `'$2'` — the raw value |
| `:56` | duplicate `--by` | `'$BY' then '$2'` — **two raw values** |
| `:81` | charset refusal | `'--by $BY'` — the raw value |
| `:113` | lock holder file | `$BY` — **not a refusal path; runs only after `:81` passed** |

⇒ **Three refusal echoes. `:113` is not one of them** — under the new gate it receives the canonical value, so it is closed by construction rather than by a rule.
⚠️ **AND `:113` IS A RECORD SURFACE THAT READS BACK: the lock-refusal at `:85-88` `cat`s `holder` into a SECOND session's stderr.** Today that content is the raw claim of whoever holds the lock. **After this batch it is canonical.** Stated because it is the one place a bad value would have travelled to a party who never typed it.

## A-3 ⛔⛔ A CANONICAL ACTOR IS ALREADY REFUSED BY THE LIVE GUARD — AND IT BREAKS THE TABLE PROPERTY LANGSTON ASKED FOR

**Object:** the nine `ALERT_ACTORS` values and the seven `ALERT_ACTOR_NORMALISATION` keys, tested against the live `dt-deploy.sh:81` pattern `^[A-Za-z0-9_-]{2,24}$`. **Population: all sixteen, none excluded.**

- **Canonical values refused: `governance-checker-heartbeat` — 28 characters, over the 24 ceiling.**
- **Alias keys refused: `langston (reviewer)`** — space and parens. *(Langston named this one.)*

⇒ ⛔ **His rider 3 says express OBJ-4 as "every canonical value matches the record-line charset", asserted in the drift test. AS WRITTEN THAT TEST FAILS ON DAY ONE** — not because of drift, but because the length ceiling is not part of the parseability guarantee it is standing in for.
⇒ ✅ **THE SPLIT THE AUDIT FORCES: the record line's actual requirement is NO SPACE, NO NEWLINE, NO `=`. The `{2,24}` bound was a proxy and it is not load-bearing on parseability.** The table property to assert is **`^[A-Za-z0-9_-]+$` with no length ceiling.** A ceiling may stay on the RAW input as a cheap sanity bound; it may not sit on the canonical output, where it would refuse a member of the very set it is supposed to admit.
⚠️ **`governance-checker-heartbeat` will never deploy — it is an alerts machine actor. That does NOT save the test**, which asserts a property of the whole table, and a test that is red for a correct reason on its first run is a test nobody trusts afterwards.

## A-4 ⭐ `=` IS A HARD CONSTRAINT AND IT COMES FROM THE READER, NOT FROM THE WRITER

**The sole consumer parses with `cut -d= -f2`** (`scripts/batch-verify/dt-deploy-observation/daily_deploy_check.sh:8`). A value containing `=` would be **silently truncated at the first one** — no error, a shorter name, and the daily observation reads it as the actor. The live charset already excludes `=` incidentally; **after this batch that exclusion must be deliberate and asserted**, because the property now lives in a table rather than in a regex sitting next to the write.

## A-5 ✅ ENTRY-POINT ENUMERATION (§9.5(a-ii)) — repo-wide, BEFORE the trace

**Object:** every file naming `dt-deploy` at the ref. **`_archive/` and `.test.` excluded, and that exclusion is stated.**
**Result: 58 files. 55 are documentation, governance, memory mirrors or skills. THREE are code, and NONE of them invokes it:**
- `scripts/reset-outcome-feedback-keys.ts:3` — a header comment naming the `--pre-restart` form.
- `server/routes/health.ts:42` — a comment about `dist/BUILD_SHA`.
- `server/services/system-alerts.ts:232` — the `'kyle-direct'` alias comment, *"the dt-deploy convention"*.

⇒ ⛔ **EXACTLY ONE ENTRY POINT EXISTS AND IT IS A HUMAN OR A SESSION AT A SHELL. I am stating that as a presence-checked absence, not an assumption:** zero cron units, zero timers, zero `child_process` calls, zero CI steps. **Positive control that the instrument can find an invocation: `.claude/skills/workflow-06-deploy/SKILL.md:12` and `:56` both return the real command form.**
⇒ **No mutual-exclusion check is owed** — one entry point, and the lock at `:84` already handles two humans racing.

## A-6 ✅ CONSUMER CENSUS — exactly one reader of `deployed_by_claimed`

`daily_deploy_check.sh` `:8` (extract) · `:24` (print) · `:30` (populated-or-empty check). **No other reader anywhere in the tree.** ⇒ the blast radius of changing what is STORED is one script, and that script only ever prints or emptiness-checks the value — **it never matches it against a set**, so a canonical value cannot break it.

## A-7 ✅ SIM READ (mandatory, deeper than Step 1) — and one thing it already owns

`SYSTEM_IMPACT_MAP.md` `#649`: **COMPONENT** `scripts/dt-deploy.sh` → installed `/usr/local/bin/dt-deploy` **from the git blob at the deployed sha**. **UPSTREAM:** *"invoked manually by the batch-owning session"* — which is what A-5 independently re-derived. **DOWNSTREAM:** the app clone · `dist/BUILD_SHA` · the liveness endpoint · the record, whose `deployed_by_claimed` the entry already names as *"the REQUIRED `--by <session>`, a claim labelled a claim."* **SHARED STATE:** the lock. **BLAST RADIUS: LOW, no trading-path surface** — and this batch does not widen it.

⭐ **THE INSTALLED-COPY DRIFT ALREADY HAS A HOME AND IT IS NOT MINE: the SIM entry states the `installed sha256 == blob` check is *"a carried item, folded into P19-B12 with #652."*** ⇒ **not re-scoped here.** *(Scope §7 said the same on weaker grounds — CC-A's push-notice drift check. The SIM's named home is the better citation and supersedes it.)*
⚠️ **WHAT DOES NOT CHANGE, and it is the operational fact that matters at Step 6: the installed copy comes from the blob at the DEPLOYED sha, so this gate reaches the box on the FIRST DEPLOY AFTER IT LANDS. Until then the tree is fixed and the box is not.** A validator in the tree refuses nothing.

`SYSTEM_MANUAL.md`: **no deploy-tooling entry — checked, and the silence is correct.** The manual's scope is architecture, strategy logic, regime, filters, signal pipeline and maths; a deploy script is none of those. Recorded per §9 rather than left unstated.

## A-8 ✅ THE LEDGER SEARCH (§9.5(b-ii)) — this is a KNOWN, RECORDED risk, not a discovery

`CHANGES_AND_FIXES.md:3971` already carries it: *"the deploy record's `--by` is validated by SHAPE only (`dt-deploy.sh:81`)"*. `RUNNING_ISSUES` `#656` is the issue; `#649` is the parent component. ⇒ **nothing here is filed as a new finding.** The batch closes a residual that was correctly recorded when `#987` shipped the alert half.

## A-9 ✅ PRECEDENT FOR THE TEST — and an honest absence

**No test in the repo reads a shell script.** But the pattern is established for repo source: the fence tests resolve with `join(__dirname, '..', '..')` and `readFileSync` — `b-epoch-reader-census-fence.test.ts:15,:18,:48,:67`. ⇒ **reading `scripts/dt-deploy.sh` from `server/tests/unit/` is a path change to an existing idiom, not a new mechanism.**

## A-10 ✅ TOTALITY IS ACHIEVABLE — the TypeScript side is already total, and the bash mirror can be

`normaliseAlertActor` (`system-alerts.ts:255-261`): trim → lowercase → **exact membership in the canonical set** → **exact alias lookup** → `null`. **No pass-through arm.** ⇒ the bash mirror is ONE associative array of **16 keys** (9 canonical mapping to themselves + 7 aliases), and the only exit for a miss is refusal. **Bash 4+ associative arrays; staging is Ubuntu 24.04 with bash 5 and the script already declares `#!/usr/bin/env bash`.**

## A-11 ✅ CHANGE-CLASS FIT — `non_architecture` verified against the checker's own table

`CLASS_DOCSET.non_architecture` (`scripts/governance-checker/config.mjs`) requires **scope · pre_audit · completion_report · batch_catalog · phase_history**; SIM, CHANGES_AND_FIXES, RUNNING_ISSUES, PHASE_19_PLAN are conditional. **All four conditionals are APPLICABLE here and will be updated** — SIM because `#649`'s component entry changes, `CHANGES_AND_FIXES:3971` because the open risk it records is closed, `RUNNING_ISSUES` for `#656`, the plan for row `2.4a`. **No document is skipped by default; each was judged.**

---

# PART II — THE PLAN

**Every item back-references the audit finding it falls out of. Nothing here is `UNAUDITED`.**

| # | plan item | falls out of | verification |
|---|---|---|---|
| **P1** | Replace `dt-deploy.sh:81` with a **total normalise**: trim → lowercase → one 16-key associative array → canonical value **or refuse**. No pass-through arm. `BY` is reassigned to the canonical value, so `:113` and `:210` store canonical. | A-10, OBJ-1, OBJ-2, Langston's totality condition | `--by cc-analyst` accepted and recorded as `cc-c`; `--by cc-session-2026-09-04` refused |
| **P2** | The refusal **names the accepted set and never echoes the rejected value** — length only, mirroring `AlertActorError`. Applied at **all three refusal sites** `:55`, `:56`, `:81`, not just the new one. | **A-2** (the census found three; the scope named none), Langston rider 1 | a `--by` containing a newline is refused with no newline in the output |
| **P3** | Usage string `:46` names the real set including `cc-infra`. | scope §4, OBJ-3 | `dt-deploy` with no args prints all nine |
| **P4** | **OBJ-4 becomes a TABLE PROPERTY, not a runtime branch**, asserted in the drift test: every canonical value matches **`^[A-Za-z0-9_-]+$`** — no space, no newline, **no `=`** — **with NO length ceiling**. A `{2,24}`-style bound may remain on the RAW input only. | **A-3** (`governance-checker-heartbeat` is 28 chars and would fail the property as Langston phrased it) + **A-4** (`=` is required by the reader, not the writer) + rider 3 (an output-side runtime guard is unreachable and untestable) | the test passes on the current table and fails if a space-bearing or `=`-bearing value is added |
| **P5** | **The drift test**: parse the literal out of `dt-deploy.sh`, assert **set equality against `ALERT_ACTORS` ∪ `keys(ALERT_ACTOR_NORMALISATION)`** — **the alias table included**. **Fails closed on parse failure** (cannot find or parse the literal ⇒ red, never skip). | Langston condition 1, A-9 for the file-reading idiom | add a value on either side ⇒ red; corrupt the literal ⇒ red, not skip |
| **P6** | `#987` carry-forward: date the bare `782 rows` figure in the `ALERT_ACTORS` header comment. | scope OBJ-5, §8 disposition 1 | the comment carries its measurement date |

**OUT OF SCOPE, restated so it is not silently absorbed:** the record's lack of history (one row by design) · the lock, assertions and deploy sequence (`#649`) · **the installed-copy drift check, which A-7 shows is already homed at P19-B12 with `#652`**.

---

## §9.4 — FINDINGS DISPOSITION

- **A-3, a canonical actor refused by the live guard** — **disposition 1, folded in as P4.** Not filed as a defect: the guard was correct for its own purpose (A-8 provenance), and the value only becomes reachable because this batch introduces the table.
- **A-2, three raw-echo refusal sites** — **disposition 1, folded in as P2.**
- **A-4, the reader's `cut -d=` dependency** — **disposition 1, folded into P4's property.**
- **A-7, installed-copy drift** — **disposition 5, WITHDRAWN with the citation that dissolves it:** `SYSTEM_IMPACT_MAP.md` `#649` already homes it at **P19-B12 with `#652`**. Not a finding.

## REVIEWER LOOP RECORD

`REVIEWER r1 (scope): CC-C, claim-only, unsolicited · HIT — two of three spellings were one session · re-derived y · scope corrected to r2 before Langston ruled.`
