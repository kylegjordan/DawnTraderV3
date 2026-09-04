# B-DEPLOY-ACTOR-ALLOWLIST — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN (r5)

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

## A-0 ⛔⛔ **A LIVE DEFECT IN THE CODE `#987` SHIPPED TWO DAYS AGO — THE ACTOR GATE IS NOT TOTAL, AND I CLAIMED IN r1 THAT IT WAS**

**`normaliseAlertActor` (`system-alerts.ts:255-261`) ends `return ALERT_ACTOR_NORMALISATION[key] ?? null;`. `ALERT_ACTOR_NORMALISATION` (`:225`) is a PLAIN OBJECT LITERAL, not `Object.create(null)` — so a lookup falls through to `Object.prototype`, and `??` catches only `null`/`undefined`, never an inherited truthy value.**

**EXECUTED against the live module, not reasoned about. Object: `assertAlertActor`. Population: eight probe inputs including three known-good controls:**

| input | `assertAlertActor` returns | what lands in the row |
|---|---|---|
| `constructor` | **the `Object` FUNCTION — NOT refused** | ⛔⛔ **`{"id":"x","state":"acknowledged"}` — the `acknowledged_by` FIELD IS GONE.** `JSON.stringify` drops function values silently. |
| `__proto__` | **`Object.prototype` — NOT refused** | `"acknowledged_by":{}` |
| `" CONSTRUCTOR "` | **the `Object` function — NOT refused** | same as `constructor` (trim + lowercase at `:258`) |
| `toString` / `valueOf` / `hasOwnProperty` | REFUSED | — **saved only ACCIDENTALLY, by `.toLowerCase()` mangling the key** |
| `cc-b` (control) | `cc-b` | `"acknowledged_by":"cc-b"` |
| `nonsense` (control) | REFUSED | — |

⇒ ⛔⛔ **THE WORST CASE IS NOT A BAD STRING, IT IS AN ABSENT FIELD.** An ack with `--by constructor` passes the gate and writes a row with **no attribution field at all** — which every downstream reader sees as *"acknowledged by nobody"*. **That is the absent-as-valid class (`#546`/`#568`) reproduced INSIDE the gate built to prevent free-text attribution.**
⚠️ **HONEST ON REACHABILITY, and it is low: nobody types `--by constructor`. The route that makes it more than theoretical is the API (`routes.ts:6762-6804`), which takes `by` from a request body.** ⛔ **But likelihood is not the point here — I asserted totality in r1 as the warrant for mirroring this function into bash, and the warrant was false.**
⇒ **DISPOSITION 1, FOLDED IN AS P7 — the current batch DEPENDS on it.** New issue **`#1000`** (verified free at the ref; `#999` present as the control).
⭐ **AND THE BASH SIDE IS NOT VULNERABLE THE SAME WAY** — a bash associative array has no prototype chain. **So the mirror is safe and the ORIGINAL is not, which is the reverse of what r1 assumed.**


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

⛔ **r3 — THE CENSUS I CALLED "unbounded" MISSED A FOURTH ECHO SITE AND MIS-CITED A FIFTH.**
- **`:62` — the `*)` catch-all arm — `echo "… unrecognised argument: $1. $USAGE"`. It is REACHABLE WITH `--by=CC-B`**, the equals form, which never matches the `--by)` case and falls straight through, **echoing the whole raw token.** P2 as written at r2 ("all three refusal sites") would have left it echoing.
- **The lock-refusal stderr write is `:89-91`, NOT `:85-88`.** `:85-88` are `HOLDER=$(cat …)` assignments — **they write to VARIABLES, not to stderr.** The heredoc opens at `:89` and the interpolation is `:91`. **I cited the read and called it the write.**

⇒ **FOUR refusal echoes — `:55`, `:56`, `:62`, `:81`. `:113` is not one of them** — under the new gate it receives the canonical value, so it is closed by construction rather than by a rule.
⚠️ **AND `:113` IS A RECORD SURFACE THAT READS BACK: the lock-refusal at `:85-88` `cat`s `holder` into a SECOND session's stderr.** Today that content is the raw claim of whoever holds the lock. **After this batch it is canonical.** Stated because it is the one place a bad value would have travelled to a party who never typed it.

## A-3 ⛔⛔ A CANONICAL ACTOR IS ALREADY REFUSED BY THE LIVE GUARD — AND IT BREAKS THE TABLE PROPERTY LANGSTON ASKED FOR

**Object:** the nine `ALERT_ACTORS` values and the seven `ALERT_ACTOR_NORMALISATION` keys, tested against the live `dt-deploy.sh:81` pattern `^[A-Za-z0-9_-]{2,24}$`. **Population: all sixteen, none excluded.**

- **Canonical values refused: `governance-checker-heartbeat` — 28 characters, over the 24 ceiling.**
- **Alias keys refused: `langston (reviewer)`** — space and parens. *(Langston named this one.)*

⇒ ⛔ **His rider 3 says express OBJ-4 as "every canonical value matches the record-line charset", asserted in the drift test. OVER ALL NINE THAT TEST FAILS ON DAY ONE** — not because of drift, but because the length ceiling is not part of the parseability guarantee it is standing in for.

⛔⛔ **r3 — AND THE REAL RESOLUTION IS NOT A WIDER CHARSET, IT IS A NARROWER SET. r1 AND r2 BOTH HAD THE WRONG POPULATION, AND THE APPROVED PLAN ROW SAYS SO IN WRITING.**
**`PHASE_19_PLAN.md:498`, the row `2.4a` this batch is filed under, specifies the deploy set VERBATIM as `cc-a|cc-b|cc-c|cc-infra|kyle|langston` — SIX, NOT NINE.** ⇒ **my OBJ-3/P3 "prints all nine" would have made `governance-checker`, `governance-checker-heartbeat` and `b-new-40-soak-verify` — three MACHINE actors that ack alerts and have never deployed anything — into ACCEPTED DEPLOYERS. That is a widening of who may deploy staging, arriving inside a batch whose whole purpose is to narrow it.**
⇒ ✅ **AND THE TABLE ALREADY CARRIES THE DISCRIMINATOR, so this needs no second list and no hand-maintained subset: every entry has `tag: 'roster' | 'machine' | 'human'`. THE DEPLOY SET IS `ALERT_ACTORS` WHERE `tag !== 'machine'` — 4 roster + 2 human = 6, which is EXACTLY the plan row's six.** One source of truth, one derivation, and the exclusion is a property of the data rather than a list someone must remember to prune.
⇒ ⭐ **A-3's 28-CHARACTER PROBLEM THEN DISSOLVES RATHER THAN NEEDING A FIX: `governance-checker-heartbeat` is tagged `machine`, so it is not in the deploy set and never reaches the property.** ⛔ **It is NOT dropped from the audit — it is the evidence that the subset must be TAG-DERIVED and not hand-listed. A hand-listed six would have been right today and silently wrong the first time a machine actor was added.**
⇒ ✅ **THE PROPERTY THAT SURVIVES, scoped correctly: every DEPLOY-SET CANONICAL VALUE matches `^[A-Za-z0-9_-]+$` — no space, no newline, no `=` — with NO length ceiling.** All six pass. **It is asserted on the CANONICAL OUTPUTS only; alias KEYS are exempt by construction** — they are lookup keys and never reach the record, which is why `langston (reviewer)` may keep its space. *(r2's verification wording said the test "fails if a space-bearing value is added"; that was written before the scoping and is corrected in P4.)*

## A-4 ⭐ `=` IS A HARD CONSTRAINT AND IT COMES FROM THE READER, NOT FROM THE WRITER

**The one BY-NAME consumer parses with `cut -d= -f2`** *(r3: r2 wrote "the sole consumer" twenty-six lines after A-6 retracted "sole" — corrected)* (`scripts/batch-verify/dt-deploy-observation/daily_deploy_check.sh:8`). A value containing `=` would be **silently truncated at the first one** — no error, a shorter name, and the daily observation reads it as the actor. The live charset already excludes `=` incidentally; **after this batch that exclusion must be deliberate and asserted**, because the property now lives in a table rather than in a regex sitting next to the write.
⭐ **r2 — AND THE STATED PARSER IS NOT THE IMPLEMENTED ONE.** `SYSTEM_IMPACT_MAP.md:3580` says the record is *"split-on-first-`=`"*; the only by-name reader, `daily_deploy_check.sh:6-8`, uses **`cut -d= -f2`, which takes the SECOND FIELD ONLY and truncates at the second `=`, not the first.** ⇒ **they agree today ONLY because the `--by` charset happens to exclude `=`.** ⇒ **P4's `=` exclusion is not belt-and-braces — it is the sole thing making the stated contract true.**
⛔ **r3 — AND IT IS FOUR PLACES, NOT ONE, AND ONE OF THEM IS `dt-deploy.sh` ITSELF.** The same claim sits at `SYSTEM_IMPACT_MAP.md:3580`, **`scripts/dt-deploy.sh:79`** — *four lines above the guard P1 replaces* — and verbatim duplicates in `B_DISAGREEMENT_FINDER_CENSUS_r4.md:223` and `B_DISAGREEMENT_FINDER_LIVE_SET.md:241`. ⇒ **r2 framed this as "the governance doc versus the code" and disposed of it as one sentence to fix at Step 10. It is a code comment plus three document copies, and fixing only the SIM would leave the text NEAREST the change still wrong.** *(This is the `#641` two-copies shape, four deep.)*

⛔⛔ **r3 — AND "NO SPACE" IS NOT A REQUIREMENT THE READER IMPOSES. I derived it from the wrong object.** `daily_deploy_check.sh:8` is a **quoted** command substitution, `:24` quotes the echo, `:30` is a `-n` test — **a space in the value survives all three intact.** The space exclusion is real but its warrant is **`dt-deploy.sh:77`'s own comment, *"no spaces/newlines injected"*** — a source r1 and r2 never cited, and which **independently corroborates A-3's split by attributing parseability to the CHARSET and not to the length.**
⛔⛔ **AND THE NEWLINE CASE IS WORSE THAN I STATED. I called it "unparseable". It is FORGERY.** `$BY` is interpolated into a heredoc at `:206-215`; a newline in it **injects a whole additional `field=value` LINE into the record**, which `daily_deploy_check.sh:6`'s `grep -E '^sha='` would then match. ⇒ **a fabricated record field, not a mangled name — the `#447` class.** **That single fact is the strongest argument in the batch and neither earlier revision contained it.**

## A-5 ✅ ENTRY-POINT ENUMERATION (§9.5(a-ii)) — repo-wide, BEFORE the trace

**Object:** every file naming `dt-deploy` at the ref. **`_archive/` and `.test.` excluded, and that exclusion is stated.**
⛔ **r3 — MY COUNTS WERE WRONG IN BOTH DIRECTIONS AND THE STATED EXCLUSION REMOVED NOTHING. Re-derived unbounded: 61 files, not 58 — and the `_archive/`/`.test.` exclusion I disclosed excludes ZERO files at this ref, so it cannot explain the gap.** ⇒ **I reported a filtered count as if the filter had done something.**
**FIVE are code or config, not three:**
- `scripts/dt-deploy.sh` — itself.
- ⛔ **`scripts/batch-verify/dt-deploy-observation/daily_deploy_check.sh` — WHICH I OMITTED WHILE RELYING ON IT IN A-4, A-6 AND A-5's OWN RESIDUAL PARAGRAPH.** At `:34` it `sha256sum`s the **installed** copy. It names `dt-deploy` and it is code.
- `scripts/reset-outcome-feedback-keys.ts:3` — a header comment naming the `--pre-restart` form.
- `server/routes/health.ts:42` — a comment about `dist/BUILD_SHA`.
- `server/services/system-alerts.ts:232` — the `'kyle-direct'` alias comment, *"the dt-deploy convention"*.
- (`.gitattributes` is the sixth non-prose file and is neither code nor documentation — the r2 split did not partition the population.)
⇒ ✅ **THE CONCLUSION IS UNDISTURBED — none of the five INVOKES it; `daily_deploy_check.sh` fingerprints the binary and never executes it. But the count and the classification were not what the object yields, and a census whose arithmetic is wrong is not a census.**

⇒ ⛔ **EXACTLY ONE ENTRY POINT EXISTS AND IT IS A HUMAN OR A SESSION AT A SHELL. I am stating that as a presence-checked absence, not an assumption:** zero cron units, zero timers, zero `child_process` calls, zero CI steps. **Positive control that the instrument can find an invocation: `.claude/skills/workflow-06-deploy/SKILL.md:12` and `:56` both return the real command form.**
⇒ **No mutual-exclusion check is owed** — one entry point, and the lock at `:84` already handles two humans racing.

⛔⛔ **r2 — MY r1 SAID "ZERO CRON UNITS" AND THE REPO CANNOT SAY THAT. A fresh reader named the reach problem and it is real: the repo tracks ZERO crontab files, so a repo-wide grep has NO INSTRUMENT POINTED AT CRON AT ALL.** **Measured: `crontab`/`cron.d` files tracked at the ref = 0; positive control on the same listing = 23 tracked `.service`/`.timer` units.** And cron is demonstrably a LIVE surface on that box — four repo files document root-cron lines installed by hand (`b-storage-archival-health.ts:26`, `b70-table-export.ts:27`, `b74-create-daily-partitions.ts:25`, `b74-refresh-universe.ts:19`). ⇒ **an un-versioned, operator-installed surface the clone is structurally blind to.**
⇒ ✅ **SO I WENT AND MEASURED THE BOX RATHER THAN DISCLOSING THE GAP. Live on `188.245.193.8`, 2026-09-04:** root crontab **12 lines, 0 naming `dt-deploy`** — **positive control: 11 of those 12 match the known DawnTrader job pattern, so the instrument is demonstrably live and reading the right file**; the `deploy` user's crontab **0 naming `dt-deploy`**; `/etc/cron.d/` + `/etc/crontab` **0 files naming `dt-deploy`**.
⇒ **THE ABSENCE NOW HOLDS ON BOTH SURFACES — the repo AND the running box — which is a different and much stronger claim than the one r1 made.**
⚠️ **WHAT STILL DOES NOT CLOSE, stated rather than glossed: an un-versioned WRAPPER at `/usr/local/bin/` could invoke it under another name.** That is precisely why `daily_deploy_check.sh:33-38` sha256-compares the installed copy against the repo blob and prints *"drift check: DIFFERS — read before concluding"*. **The existing drift check is the instrument for that residual, and it is already homed at P19-B12 (A-7).**
⚠️ **AND ONE NARROWING OF THE CLAIM ITSELF, not a refutation of it: `comms-infra/discord/discord-langston-bridge.py:183-211` programmatically SPAWNS a fully-tooled agent session on an inbound message, and `.claude/settings.local.json` allows `Bash(*)`.** ⇒ **the claim "only an agent session at a shell" is true, but the repo contains a service whose job is to CREATE such a session — so "manual" means "not scripted", never "not reachable without a human present".** Recorded because the scope's value argument leans on deploys being deliberate.

## A-6 ✅ CONSUMER CENSUS — exactly one reader of `deployed_by_claimed`

⛔ **r2 — "EXACTLY ONE READER" WAS TOO STRONG, AND THE TWO I MISSED WERE IN READS I HAD ALREADY MADE.** A fresh reader caught it; both re-derived at the ref before this correction.

| reader | line | how it reads |
|---|---|---|
| `daily_deploy_check.sh` | `:8` extract, `:24` print, `:30` populated-check | **BY NAME** — `grep '^deployed_by_claimed=' … \| cut -d= -f2` |
| `daily_deploy_check.sh` | `:5` | **WHOLE FILE** — `tail -n 9 …` |
| `dt-deploy.sh` | `:223` | **WHOLE FILE** — `cat "$RECORD"`, printed on every successful deploy |
| ~~`SYSTEM_IMPACT_MAP.md:3580`~~ | — | ⛔ **r3 — STRUCK. I put it in this table as a fourth reader OF THE ACTOR FIELD and it is not one.** The line directs Step-7/8 to compare recorded-vs-live *"on the three-branch read: sha drift = overwrite · counter higher = crash · counter lower = boot-resurrect"* — it reads **`sha` and `restart_time`**. It never mentions the actor. **A procedure that reads the record is not a procedure that reads this field.** |

⇒ ✅ **THE CORRECTED STATEMENT (r3): exactly ONE consumer extracts the field BY NAME; TWO print the record whole, the field's value included.** *"Who breaks if the field is RENAMED"* is **1**; *"who would SEE a change in its value"* is **3**. *(r2 said 4 on the struck row above.)*
⇒ **The blast-radius conclusion is UNCHANGED and now rests on a better base:** no reader anywhere matches the value against a set — they print it or check it is non-empty — **so storing a canonical value cannot break any of them.**

## A-7 ✅ SIM READ (mandatory, deeper than Step 1) — and one thing it already owns

`SYSTEM_IMPACT_MAP.md` `#649`: **COMPONENT** `scripts/dt-deploy.sh` → installed `/usr/local/bin/dt-deploy` **from the git blob at the deployed sha**. **UPSTREAM:** *"invoked manually by the batch-owning session"* — which is what A-5 independently re-derived. **DOWNSTREAM:** the app clone · `dist/BUILD_SHA` · the liveness endpoint · the record, whose `deployed_by_claimed` the entry already names as *"the REQUIRED `--by <session>`, a claim labelled a claim."* **SHARED STATE:** the lock. **BLAST RADIUS: LOW, no trading-path surface** — and this batch does not widen it.

⭐ **THE INSTALLED-COPY DRIFT ALREADY HAS A HOME AND IT IS NOT MINE: the SIM entry states the `installed sha256 == blob` check is *"a carried item, folded into P19-B12 with #652."*** ⇒ **not re-scoped here.** *(Scope §7 said the same on weaker grounds — CC-A's push-notice drift check. The SIM's named home is the better citation and supersedes it.)*
⚠️ **WHAT DOES NOT CHANGE, and it is the operational fact that matters at Step 6: the installed copy comes from the blob at the DEPLOYED sha, so this gate reaches the box on the FIRST DEPLOY AFTER IT LANDS. Until then the tree is fixed and the box is not.** A validator in the tree refuses nothing.

`SYSTEM_MANUAL.md`: **no deploy-tooling entry — checked, and the silence is correct.** The manual's scope is architecture, strategy logic, regime, filters, signal pipeline and maths; a deploy script is none of those. Recorded per §9 rather than left unstated.

## A-8 ✅ THE LEDGER SEARCH (§9.5(b-ii)) — this is a KNOWN, RECORDED risk, not a discovery

`CHANGES_AND_FIXES.md:3971` already carries it: *"the deploy record's `--by` is validated by SHAPE only (`dt-deploy.sh:81`)"*. `RUNNING_ISSUES` `#656` is the issue; `#649` is the parent component. ⇒ **nothing here is filed as a new finding.** The batch closes a residual that was correctly recorded when `#987` shipped the alert half.

## A-9 ✅ PRECEDENT FOR THE TEST — and an honest absence

**No test in the repo reads a shell script** — checked across every `*.test.ts` at the ref.
⛔ **r3 — MY CITED PRECEDENT DOES NOT REACH THE FILE I NEED, and the real precedent was sitting there uncited.** `b-epoch-reader-census-fence.test.ts:18` is `join(__dirname, '..', '..')` from `server/tests/unit/` — that resolves to **`server/`**, and `:67` uses it as `join(SERVER, 'services', …)`. **From `server/`, `scripts/dt-deploy.sh` is not reachable at all.**
⇒ ✅ **THE THREE-LEVEL REPO-ROOT IDIOM ALREADY EXISTS, in five tests I did not cite:** `p19-b8-5f-maxhold-carry.test.ts:20`, `p19-b8-5j-max-hold-switch.test.ts:15`, `p19-b8-5k-atr-neutrality.test.ts:145`, `p19-b8-5l-atr-source-fix.test.ts:21` (all `join(__dirname, '..', '..', '..')`), and `b79-0n-hygiene-null-reason-import-hygiene.test.ts:122`, which resolves the same three levels into a variable literally named `repoRoot`.
⇒ **The object supports a STRONGER claim than r2 made — repo-root reading is an established idiom, not "a path change" — and r2 reached a weaker version of it by citing the wrong file.**

## A-10 ✅ TOTALITY IS ACHIEVABLE — the TypeScript side is already total, and the bash mirror can be

`normaliseAlertActor` (`system-alerts.ts:255-261`): trim → lowercase → **exact membership in the canonical set** → **exact alias lookup** → `null`. **No pass-through arm.** ⇒ the bash mirror is ONE associative array of **13 KEYS — the SIX deploy-set canonical values mapping to themselves, plus the SEVEN aliases** — and the only exit for a miss is refusal.
⛔ **r4 (Langston BLOCKER-1) — r3 SAID 16, WHICH IS 9 + 7, AND 9 IS THE NUMBER A-3 r3 HAD ALREADY REJECTED.** The six-versus-nine correction landed in the audit prose and **never reached the two rows that BUILD the gate** — so implemented as written, P1 would have admitted the three machine actors as deployers, **the exact widening A-3 r3 caught**, and P5's set-equality assertion would have gone red on its first run. ⭐ **This is `fix-follows-pointer`, inside the document that names it — and his standing ruling applies: a correction stacked on wrong text is not a correction, because the implementation and the completion report are written from the BODY, not from the prose above it.**
✅ **13 verified at the object, not inferred: all SEVEN alias targets are non-machine** — `cc-a-old-claude`→`cc-a`, `cc-analyst`→`cc-c`, `cc-c-analyst`→`cc-c`, `infra-claude`→`cc-infra`, `langston (reviewer)`→`langston`, `langston-reviewer`→`langston`, `kyle-direct`→`kyle` (`system-alerts.ts:225-233`). **No alias points at a machine actor, so the union is 6 + 7 with no overlap and no orphan.** **Bash 4+ associative arrays; staging is Ubuntu 24.04 with bash 5 and the script already declares `#!/usr/bin/env bash`.**

## A-11 ✅ CHANGE-CLASS FIT — `non_architecture` verified against the checker's own table

`CLASS_DOCSET.non_architecture` (`scripts/governance-checker/config.mjs:130-135`) requires **scope · pre_audit · completion_report · batch_catalog · phase_history**.
⛔ **r3 — THERE ARE EIGHT CONDITIONALS, NOT FOUR. r2 named four, called them "all four", and closed "no document is skipped by default; each was judged" — WHICH WAS FALSE FOR THREE OF THEM, IN THE SENTENCE CLAIMING OTHERWISE.** The full list: `system_manual` · `sim` · `changes_and_fixes` · `running_issues` · **`roadmap`** · **`deleted_log`** · **`adjustment_framework`** · `phase_19_plan`.
**Judged, all eight, explicitly:**

| conditional | applicable? | why |
|---|---|---|
| `sim` | **YES** | `#649`'s component entry changes, and A-4's `split-on-first-=` line is wrong |
| `changes_and_fixes` | **YES** | `:3971` records this as an open risk; the batch closes it |
| `running_issues` | **YES** | `#656` closes; **`#1000` opens (A-0)** |
| `phase_19_plan` | **YES** | row `2.4a`. *(`REQUIRED_IF` at `config.mjs:152-154` promotes this to required only for `/^P19-/i` ids; this batch's id does not match, so conditional is correct.)* |
| `system_manual` | **NO** | no deploy-tooling entry exists and the silence is correct — A-7 |
| `roadmap` | **NO** | the item is placed in the phase plan, not the roadmap; no roadmap item changes |
| `deleted_log` | **NO** | nothing is deleted — the guard at `:81` is REPLACED in place, not removed |
| `adjustment_framework` | **NO** | no trading parameter, threshold or risk knob is touched |

---

# PART II — THE PLAN

**Every item back-references the audit finding it falls out of. Nothing here is `UNAUDITED`.**

| # | plan item | falls out of | verification |
|---|---|---|---|
| **P1** | Replace `dt-deploy.sh:81` with a **total normalise**: trim → lowercase → **one 13-key associative array (the SIX deploy-set canonical values + the SEVEN aliases — A-3 r3, A-10 r4)** → canonical value **or refuse**. No pass-through arm. `BY` is reassigned to the canonical value, so `:113` and `:210` store canonical. ⚠️ **AND STATE THE ONE VALUE THIS CHANGES: `kyle-direct` — which `:46` advertises TODAY as the name to type — now COLLAPSES TO `kyle` in the record.** A-6 shows no reader matches the value against a set, so nothing breaks; **it is named here so it does not surface as a surprise at Step 8.** | A-10 r4, **A-3 r3**, OBJ-1, OBJ-2, Langston's totality condition | `--by cc-analyst` recorded as `cc-c`; `--by kyle-direct` recorded as `kyle`; **`--by 'langston (reviewer)'` — a live alias carrying a space and parens, which the OLD `:81` charset refused and the new gate must ACCEPT, mapping to `langston` (Langston's Step-4 rider; the lookup must be quoted)**; `--by governance-checker` **REFUSED**; `--by cc-session-2026-09-04` refused |
| **P2** | The refusal **names the accepted set and never echoes the rejected value** — length only, mirroring `AlertActorError`. Applied at **all FOUR refusal sites — `:55`, `:56`, `:62`, `:81`** — not just the new one. ⛔ **r4 (Langston BLOCKER-2): r3 still said "all three" here after A-2 r3 had found four. `:62` is the catch-all arm, reachable via the `--by=CC-B` equals form, and it echoes the WHOLE RAW TOKEN — P2 as written would have left it echoing.** Same `fix-follows-pointer` shape as BLOCKER-1. | **A-2 r3** (four sites; the scope named none), Langston rider 1 | a `--by` containing a newline is refused with no newline in the output |
| **P3** | Usage string `:46` names the real deploy set — **the SIX non-machine actors, including `cc-infra`.** | scope §4, OBJ-3, **A-3 r3** | `dt-deploy` with no args prints exactly the six, matching `PHASE_19_PLAN.md:498` |
| **P4** | **OBJ-4 becomes a TABLE PROPERTY, not a runtime branch**, asserted in the drift test: **every DEPLOY-SET CANONICAL VALUE** matches **`^[A-Za-z0-9_-]+$`** — no space, no newline, **no `=`** — **with NO length ceiling**. **Scoped to canonical OUTPUTS; alias KEYS are exempt** (they never reach the record, which is why `langston (reviewer)` may keep its space). A `{2,24}`-style bound may remain on the RAW input only. | **A-3 r3** (the deploy set is the six non-machine actors, so the 28-char case never arises) + **A-4 r3** (`=` from the reader; newline from `dt-deploy.sh:77` — and a newline FORGES a record line rather than mangling one) + rider 3 | the test passes on the six and **fails if a `machine`-tagged, space-bearing or `=`-bearing value enters the deploy set** |
| **P5** | **The drift test**: parse the literal out of `dt-deploy.sh` (repo-root path via the **three-level** idiom — A-9 r3), assert **set equality against `{ALERT_ACTORS where tag !== 'machine'}` ∪ `{alias keys whose target is in that subset}`** — **the alias half included**. **Fails closed on parse failure** (cannot find or parse the literal ⇒ red, never skip). | Langston condition 1, **A-3 r3** for the subset, **A-9 r3** for the path idiom | add or retag a value on either side ⇒ red; corrupt the literal ⇒ red, not skip |
| **P6** | `#987` carry-forward: date the bare `782 rows` figure in the `ALERT_ACTORS` header comment. | scope OBJ-5, §8 disposition 1 | the comment carries its measurement date |
| **P7** | ⛔ **FIX `#1000`: make `normaliseAlertActor` TOTAL.** Prototype-free lookup (`Object.create(null)`, or `Object.prototype.hasOwnProperty.call`), plus an explicit `typeof canonical === 'string'` check in `assertAlertActor` so a non-string can never be returned. **Regression test covering `constructor`, `__proto__` and a case variant.** | **A-0** — a live defect in the code `#987` shipped, and the false warrant for r1's mirroring claim | `assertAlertActor('constructor')` and `('__proto__')` both REFUSE; `cc-b` and every alias still pass |

**OUT OF SCOPE, restated so it is not silently absorbed:** the record's lack of history (one row by design) · the lock, assertions and deploy sequence (`#649`) · **the installed-copy drift check, which A-7 shows is already homed at P19-B12 with `#652`**.

---

## §9.4 — FINDINGS DISPOSITION

- **A-3, a canonical actor refused by the live guard** — **disposition 1, folded in as P4.** Not filed as a defect: the guard was correct for its own purpose (A-8 provenance), and the value only becomes reachable because this batch introduces the table.
- **A-2, FOUR raw-echo refusal sites (`:55`, `:56`, `:62`, `:81`)** — **disposition 1, folded in as P2.** *(r4: this line said "three" through r3, one row below the audit that had already found the fourth.)*
- **A-4, the reader's `cut -d=` dependency** — **disposition 1, folded into P4's property.**
- ⛔ **A-0, the actor gate is not total (`#1000`)** — **disposition 1, folded in as P7.** A real defect under rule-24 outcome (1), in code I shipped on 2026-09-02. **Not deferred: this batch's P1 mirrors that function, and r1 cited its totality as the warrant for doing so.**
- **A-4b, `split-on-first-=` stated in FOUR places while the code does `cut -d= -f2`** — **disposition 1, folded in:** P4 keeps the `=` exclusion (the sole thing making the stated contract true), and Step 10 corrects **all four** — `SYSTEM_IMPACT_MAP.md:3580`, **`dt-deploy.sh:79`** (the text nearest the change), `B_DISAGREEMENT_FINDER_CENSUS_r4.md:223`, `B_DISAGREEMENT_FINDER_LIVE_SET.md:241`. *(r2 disposed of this as one sentence in one document; that was wrong.)*
- ⭐ **A-12 (NEW, surfaced at Step 3 by running the script) — `mkdir` FAILING FOR ANY REASON IS REPORTED AS "a deploy is already in progress".** `dt-deploy.sh:84` treats every non-zero `mkdir` as lock-held; **observed while testing the gate locally, where `/home/deploy` does not exist: the script printed the full lock-refusal including the tier-3 stale-lock protocol, for a lock that did not exist.** ⇒ **a wrong-cause message that would send a reader down the #540 tier-3 procedure looking for a phantom holder.** ⚠️ **Severity is genuinely low on staging** — `/home/deploy` is the deploy user's home and always exists, so the arm fires only in a world where the deploy is doomed anyway. **DISPOSITION 2 — ADDED TO `P19-B12`**, which already carries `#652` and the `dt-deploy` installed-copy drift check; recorded as an amendment on `#649` (the component's entry) at Step 10 rather than as a new number. ⛔ **NOT folded here: it is `#649`'s lock, explicitly out of scope per §7, and widening a batch to cover something it merely tripped over is how scopes rot.**
- **A-3 r3, P3/P5 would have admitted three machine actors as deployers** — **disposition 1, folded into P3/P4/P5 via the tag-derived subset.** Caught against `PHASE_19_PLAN.md:498`, which specifies six.
- **A-7, installed-copy drift** — **disposition 5, WITHDRAWN with the citation that dissolves it:** `SYSTEM_IMPACT_MAP.md` `#649` already homes it at **P19-B12 with `#652`**. Not a finding.

## ⛔ LOCATOR CORRECTION — r5, LANGSTON'S CONDITION ON THE STEP-2 APPROVAL

**Row `2.4a` is at `PHASE_19_PLAN.md:498`.** It has now been wrong twice: r3 said `:496` (row `2`), r4 said `:497` (row `2.4`, the CLOSED PARENT) — **I applied `:497` on Langston's authority without re-deriving it, and he flagged his own number in the same message that approved the step.** Corrected at all five sites and **re-derived independently before applying**, unbounded, two instruments agreeing: `grep -nE '^\| 2\.4a? '` returns `497:| 2.4 |` and `498:| 2.4a |`, and a grep for the verbatim six-set returns `498` and only `498`.
⭐ **THE DURABLE LESSON, and it is bigger than one line number: A LINE NUMBER IN A LIVE, MULTI-SESSION GOVERNANCE FILE IS NOT A STABLE ADDRESS.** Four sessions append to `PHASE_19_PLAN.md` daily; a citation written on Tuesday points somewhere else on Wednesday. **The ROW ID `2.4a` is stable and the line is not** — so cite the row id first and the line as a convenience, never the line alone. *(This is why the wrong locator survived three revisions and two readers: `:497` looked plausible because it WAS row 2.4a until the file grew.)*
⚠️ **AND THE PROCESS POINT I OWN: I took a correction from the reviewer and applied it WITHOUT re-deriving it, which is the same class of error as taking my own memory for the object.** A number is not more trustworthy because Langston said it.

## REVIEWER LOOP RECORD
`LANGSTON Step-2 r3: SENT BACK TO OWNER — not on substance ("the audit is the strongest one you have sent me"; he reproduced #1000's mechanism himself and accepted the tag-derived six). TWO BLOCKERS, both fix-follows-pointer: the six-versus-nine correction never reached A-10 or P1 (16 → 13), and P2 plus its disposition still said three echo sites after A-2 found four. Two non-blocking folds: PHASE_19_PLAN:498 not :496, and kyle-direct collapsing to kyle must be STATED in P1. All four applied in r4; no new investigation.`

`REVIEWER r1 (scope): CC-C, claim-only, unsolicited · HIT — two of three spellings were one session · re-derived y · scope corrected to r2 before Langston ruled.`
`REVIEWER r3 (audit): fresh reader, OBJECT round — handed the document plus the six objects it cites · question: for each checkable assertion, what other states of the world are consistent with the object it cites · HIT ×11. Load-bearing ones, each re-derived by me at the object before it moved anything: (1) `normaliseAlertActor` is NOT total — EXECUTED against the live module: `constructor` and `__proto__` pass the gate and the attribution field VANISHES from the row [now `#1000`, P7]; (2) `PHASE_19_PLAN:498` specifies SIX deployers where my plan said nine, which would have made three machine actors valid deployers [tag-derived subset]; (3) the census is 61 files / 5 code, not 58 / 3, and my disclosed exclusion excluded nothing; (4) a fourth echo site at `:62` via the `--by=` form, and `:85-88` is the READ, not the write; (5) "no space" is not a reader requirement, and a newline FORGES a record line rather than mangling a name; (6) `CLASS_DOCSET` has eight conditionals and I judged four while writing "each was judged"; (7) my test precedent resolves to `server/`, not repo root; (8) the SIM row reads `sha` and `restart_time`, not the actor field; (9) `split-on-first-=` is stated in four places including `dt-deploy.sh` itself · re-derived y · A-0 added, A-2/A-3/A-4/A-5/A-6/A-9/A-11 and P3/P4/P5 rewritten, P7 added.`
`REVIEWER r2 (audit): fresh reader, CLAIM-ONLY (mode B — mandatory, both were absence claims) · question: name the objects that would settle these, then what other states of the world are consistent with them · HIT ×3 — (1) the repo has no instrument pointed at cron so "zero cron units" was unearned, (2) "exactly one reader" counts by-name reads only and misses two whole-record reads I had already seen, (3) the SIM describes a parser the code does not implement · re-derived y, all three, at the ref, plus a LIVE crontab measurement with a positive control that the repo could not have produced · A-4, A-5 and A-6 rewritten.`
