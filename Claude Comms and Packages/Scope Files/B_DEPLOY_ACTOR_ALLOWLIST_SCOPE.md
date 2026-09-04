# B-DEPLOY-ACTOR-ALLOWLIST — SCOPE (r1)

change-class: non_architecture

**Owner:** CC-B · **Issue:** `#656` residual · **Plan row:** `PHASE_19_PLAN.md` governance queue `2.4a`, placed immediately after `B-ALERT-ACTOR-ALLOWLIST` (`#987`, CLOSED 2026-09-02) · **Started 2026-09-04 on Kyle's direction** (*"you can slot that in now and take care of it quickly"*).
**Origin:** Langston's Step-4 §13 finding on `#987` — the defect that batch fixed for the alert file exists one namespace over, on the deploy record.

---

## 1. THE PROBLEM, STATED NARROWLY

`scripts/dt-deploy.sh:81` validates `--by` **by SHAPE ONLY**: `^[A-Za-z0-9_-]{2,24}$`. Anything matching that charset is accepted and written to the deploy record as `deployed_by_claimed`. **`cc-session-2026-09-04` passes.** So does any typo, any abbreviation, and any spelling a session invents.

**MEASURED, and the population is small by construction — stated rather than inflated:** the record at `/home/deploy/dawntrader-deploy.record` **holds only the most recent deploy** (it is overwritten, not appended), so there is no historical population to count. What I have is **direct observation across 2026-09-02→04: three deploys, three different spellings — `ANALYST-Claude`, `CC-B`, `cc-c`.** Three sessions, three forms, zero agreement. ⛔ **I am NOT claiming a rate or a total; the instrument cannot produce one.**

⚠️ **AND THE VALUE IS BOUNDED BY THAT SAME FACT: fixing this makes the CURRENT deploy attributable and consistent. It cannot repair history, because history is not kept.** The consumer that cares is the daily `dt-deploy` observation, which reads the record's single row.

---

## 2. MANDATORY 1.a — ARCHITECTURAL READ

`SYSTEM_IMPACT_MAP.md:3577-3579` (`#649`, B-DEPLOY-LOCK, 2026-08-06) is the component entry: *"`scripts/dt-deploy.sh` (repo) → installed `/usr/local/bin/dt-deploy` on staging **from the git blob at the deployed sha**"* — and it flags that **an installed copy outside the repo is a drift risk.** That risk is now partly covered by CC-A's drift check on the push notice (`B-WAKE-QUIET` OBJ-9, 2026-09-03), which compares an installed copy against the tree via the backup mirror. **This batch must not assume the installed copy updates itself: the deploy path installs from the blob at the deployed sha, so the change reaches the box on the first deploy AFTER it lands.** Stated because a validator that is in the tree but not on the box refuses nothing.
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
