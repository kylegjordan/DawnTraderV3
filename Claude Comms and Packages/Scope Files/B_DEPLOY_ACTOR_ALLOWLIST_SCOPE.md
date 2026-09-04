# B-DEPLOY-ACTOR-ALLOWLIST — SCOPE (r2)

change-class: non_architecture

**Owner:** CC-B · **Issue:** `#656` residual · **Plan row:** `PHASE_19_PLAN.md` governance queue `2.4a`, placed immediately after `B-ALERT-ACTOR-ALLOWLIST` (`#987`, CLOSED 2026-09-02) · **Started 2026-09-04 on Kyle's direction** (*"you can slot that in now and take care of it quickly"*).
**Origin:** Langston's Step-4 §13 finding on `#987` — the defect that batch fixed for the alert file exists one namespace over, on the deploy record.

---

## 1. THE PROBLEM, STATED NARROWLY

`scripts/dt-deploy.sh:81` validates `--by` **by SHAPE ONLY**: `^[A-Za-z0-9_-]{2,24}$`. Anything matching that charset is accepted and written to the deploy record as `deployed_by_claimed`. **`cc-session-2026-09-04` passes.** So does any typo, any abbreviation, and any spelling a session invents.

⭐⭐ **THE POPULATION IN r1 WAS WRONG AND IT WAS WRONG IN MY OWN FAVOUR'S DIRECTION BUT FOR THE WRONG REASON — CORRECTED HERE BEFORE LANGSTON RULED ON IT (CC-C, 2026-09-04, re-derived by me at the objects).**
> **PREVIOUSLY STATED:** *"three deploys, three different spellings — `ANALYST-Claude`, `CC-B`, `cc-c`. Three sessions, three forms."*
> **NOW: three SESSIONS, FOUR spellings, five recorded deploys — and TWO OF THE SPELLINGS ARE THE SAME SESSION ONE DAY APART.**
> **REASON:** I attributed one spelling per session by assumption. `ANALYST-Claude` and `cc-c` are BOTH CC-C — `ANALYST-Claude` on his `F-G-2` deploy `2cc4a03ec` (2026-09-02T08:49:47Z) and again on the `093d1878f` rider deploy the same day, then `cc-c` on `B-XSTOCK-FEED-SANITY` `1a71c553b` (2026-09-03T19:28:48Z, still the live record). ⛔ **I never checked WHO used which form; I inferred it from the string.** That is `wrong-object` in its purest shape: a matching name is not a matching thing.

**THE INSTRUMENT ALSO IMPROVED, and r1 understated what was measurable.** r1 said the live record holds one row so there is no historical population — **true of the record, FALSE of the system.** The batch completion reports record the `--by` value at every deploy, and they are a real corpus.
**MEASURED at `origin/migration/aws-supabase`, object = every `--by`/`deployed_by_claimed` occurrence in `Claude Comms and Packages/Batch Completion/`, population = all such occurrences, none excluded:** `ANALYST-Claude` ×2 (CC-C) · `cc-c` ×1 (CC-C) · `cc-a` ×1 (CC-A) · `CC-B` ×1 (CC-B). **Five attributions, three sessions, FOUR distinct spellings, and the canonical set would accept exactly ONE of the four.**

⭐ **AND THE INTRA-SESSION CASE IS THE STRONGER ARGUMENT, which is why the correction helps rather than hurts (CC-C's point, and I agree with it).** Inter-session variation can be argued away with a convention, a roster line, or a note in a memory file. **Intra-session drift cannot: CC-C used one form and then the other, one day apart, having just used the first.** ⇒ **no habit, no roster and no reminder fixes an unconstrained field — only a gate does.**

⚠️ **WHAT IS STILL BOUNDED, and the correction does not lift it: the live record holds only the MOST RECENT deploy. Fixing this makes every FUTURE deploy attributable and consistent. It cannot repair history — the historical evidence above lives in the reports, not in the record.** The consumer that cares is the daily `dt-deploy` observation, which reads the record's single row.
⛔ **NO RATE AND NO PROJECTION IS CLAIMED. Five is the whole observed population, not a sample.**

---

## 2. MANDATORY 1.a — ARCHITECTURAL READ

`SYSTEM_IMPACT_MAP.md:3577-3579` (`#649`, B-DEPLOY-LOCK, 2026-08-06) is the component entry: *"`scripts/dt-deploy.sh` (repo) → installed `/usr/local/bin/dt-deploy` on staging **from the git blob at the deployed sha**"* — and it flags that **an installed copy outside the repo is a drift risk.** That risk is now partly covered by CC-A's drift check on the push notice (`B-WAKE-QUIET` OBJ-9, 2026-09-03), which compares an installed copy against the tree via the backup mirror. **This batch must not assume the installed copy updates itself.** Stated because a validator that is in the tree but not on the box refuses nothing.
⛔⛔ **CORRECTED 2026-09-04 AT STEP 7 — THIS SAID THE OPPOSITE, AND IT WAS FALSE. `dt-deploy` DOES NOT INSTALL ITSELF.**
**MEASURED after deploying `a4bcbe3c1`:** `/usr/local/bin/dt-deploy` was still **DATED AUG 6**, with **0** occurrences of `DEPLOY_ACTORS` and **1** of the old charset regex — while `/home/deploy/dawntrader/scripts/dt-deploy.sh` held the new gate and hashed **identical to the repo blob**. **The deploy updates the CLONE and leaves the INSTALLED COPY untouched.**
⭐ **WHERE THE ERROR CAME FROM, because the shape outlives the instance:** `SYSTEM_IMPACT_MAP.md` `#649` says the installed copy is *"installed … FROM THE GIT BLOB AT THE DEPLOYED SHA"*. **I read a PROVENANCE statement as a MECHANISM statement.** It says where the installed bytes came from; it never said the deploy is what puts them there. **The sentence was true and it was not about what I took it to be about** — `wrong-object`. It survived a scope, an audit, TWO Langston reviews and a change list **because at no point did anyone execute it**, and Langston repeated it back to me in his own Step-7 standing instruction, so my unverified claim propagated into his ruling.
⇒ ✅ **WHAT IS ACTUALLY TRUE: the gate is live only when someone DELIBERATELY INSTALLS it.** Done at Step 7 — old copy backed up to `/root/dt-deploy.pre-b-deploy-actor-allowlist-20260904`, the deployed blob installed with `install -m 755`, and the installed sha256 verified equal to the clone's.
⇒ ⚠️ **AND THE CONSEQUENCE IS BIGGER THAN THIS BATCH: every `dt-deploy` change in this project's history has needed a manual install step that nothing documents and nothing checks.** That is exactly the drift risk `#649` flags and `P19-B12` owns — now **measured** rather than anticipated. Recorded there at Step 10.
`SYSTEM_MANUAL.md`: **no entry for the deploy tooling** — checked. That silence is expected (the manual covers architecture, strategy, regime, filters, signal pipeline and maths; a deploy script is none of those) and is recorded here per §9 rather than left unstated.

## 3. MANDATORY 1.b — PROVENANCE READ (TIER 1: this batch changes its behaviour)

**Corpora searched:** `git log -S'deployed_by_claimed' --reverse` (not path-limited); `RUNNING_ISSUES.md` for `#656` and `#649`; `SYSTEM_IMPACT_MAP.md`; `BATCH_CATALOG.md`. **Introducing commit `7db707fd19e63401908a409a9564d5a9963251d2`, 2026-08-06, quoted verbatim, not summarised:**

> *"Kyle-directed hotfix. Every session reaches staging as the same unix identity, so the record's deployed_by was identical for all deployers - the daily observation could not attribute a deploy. --by is now REQUIRED (refuse-not-guess, CREW_SESSION precedent, charset-validated); the claim is recorded AS a claim (deployed_by_claimed, mirroring resolved_by_claimed) beside the observed deployed_via"*

**And the validator's own comment states its purpose, at `dt-deploy.sh:79-80`:** *"Tight charset keeps the CLAIM line parseable (no spaces/newlines injected)."*

⇒ ⭐ **DISPOSITION (2) — RELEVANT BUT NEEDS UPDATING TO TODAY'S INTENT. This is NOT a defect in what was built.** The charset check was written to keep the record's `key=value` line parseable — no spaces, no newlines — and it does that correctly. **It was never an identity allowlist and was never claimed to be one.** What changed since is that a canonical actor set now exists (`ALERT_ACTORS`, shipped by `#987` 2026-09-02) and the roster it derives from has been stable since 2026-06-12. ⛔ **Framing this as a bug would misread a correct parseability guard as a failed identity check — the `#452` gloss shape. It is an extension.**

## 4. WHAT ALREADY EXISTS (checked before scoping)

- **The canonical set exists**: `ALERT_ACTORS` in `server/services/system-alerts.ts` — nine actors tagged `roster | machine | human`, with an exact-string alias table. Shipped and deployed 2026-09-02. **This batch reuses it; it does not define a second one.**
- **The roster exists**: `.claude/cc-session-roster.json`, four active sessions.
- **The usage string is already stale**: `dt-deploy.sh:46` lists `CC-A|CC-B|CC-C|kyle-direct|langston` — **it cannot name CC-INFRA at all**, which has been an active session since before the alert work. Langston flagged this as a cross-reference on `#987`.

## 5. OBJECTIVES

| # | objective | verification |
|---|---|---|
| **OBJ-1** | `dt-deploy` validates `--by` against the CANONICAL ACTOR SET, exact match after trim + lowercase, with the same alias mapping the alert side uses (`kyle-direct` → `kyle`, the Langston variants → `langston`, `cc-analyst` → `cc-c`, `infra-claude` → `cc-infra`). **Refusal names the accepted set.** | a deploy with `--by cc-session-2026-09-04` is REFUSED and prints the set; a deploy with `--by cc-analyst` is ACCEPTED |
| **OBJ-2** | The record stores the **canonical** value, not the raw input. | after an accepted deploy, `deployed_by_claimed` reads the canonical form |
| **OBJ-3** | The usage string (`:46`) names the real set, including `cc-infra`. | `dt-deploy` with no arguments prints all nine |
| **OBJ-4** | The parseability guarantee the original validator provided is **PRESERVED, not replaced** — no spaces or newlines can reach the record line. | a value containing a space or newline is refused; the record remains split-on-first-`=` parseable |
| **OBJ-5** | Carried from `#987`'s close (Langston): date the bare `782 rows` figure in the `ALERT_ACTORS` header comment (`system-alerts.ts:186`) — the one uncommitted-context carrier left in the deployed tree. | the comment carries its measurement date |

## 6. ⛔ THE JUDGEMENT CALL FOR LANGSTON — ONE SOURCE OF TRUTH ACROSS A LANGUAGE BOUNDARY

**`ALERT_ACTORS` is TypeScript. `dt-deploy` is bash, running on staging.** There is no free way to share the list. Three options, and I want this ruled rather than chosen by me:

| option | how | pro | con |
|---|---|---|---|
| **(a) mirror the list in bash** | a literal array in `dt-deploy.sh` | simplest; no runtime dependency; the deploy path gains no new failure mode | **two sources of truth** — the exact defect this project keeps paying for; they drift silently and nothing compares them |
| **(b) shell out to node at deploy time** | `node -e` printing the set from the service | genuinely one source | **puts a node invocation on the deploy path**; if it fails, does the deploy refuse (blocks all deploys on an unrelated fault) or fall open (the validator silently stops validating)? Both answers are bad |
| **(c) generate the bash list from the TypeScript, checked in** | a small generator + the generated list committed, with a test asserting they match | one source of truth AND no runtime dependency; the drift is caught by a test rather than by hope | a generation step someone must remember to run — mitigated by the test failing loudly if they do not |

**My recommendation is (c)**, because it is the only one where drift is *detected* rather than *avoided by discipline*, and this project's record on discipline-based invariants is poor. **But (a) is defensible if the set is genuinely stable** — it has changed once in three months.

## 7. OUT OF SCOPE, stated so it is not silently absorbed

- **The deploy record's lack of history.** It holds one row by design; making it append-only is a different change with its own blast radius. Not touched here.
- **Any change to the lock, the assertions, or the deploy sequence** (`#649`'s work).
- **The installed-copy drift risk** — CC-A's drift check covers the push notice; extending it to `dt-deploy` is his file and his call, not this batch's.

## 8. §9.4 — FINDINGS DISPOSITION

- **The stale usage string** (`:46`, cannot name `cc-infra`): **disposition 1, folded in as OBJ-3.**
- **The `782 rows` comment**: **disposition 1, folded in as OBJ-5**, carried from `#987`.

## 9. REVIEWER LOOP RECORD
`REVIEWER r1: <pending>`
`CC-C r1 (unsolicited, exception (c)): claim-only, on the spelling population · HIT — two of the three spellings were one session · RE-DERIVED at the objects (F_G_2_PROGRESS_REPORT:9,:21 and the live record) · scope corrected to r2 before Langston ruled.`
