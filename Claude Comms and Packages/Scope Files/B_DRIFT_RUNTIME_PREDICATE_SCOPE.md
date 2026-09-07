# B-DRIFT-RUNTIME-PREDICATE — SCOPE

**change-class: non_architecture**

**Batch:** `B-DRIFT-RUNTIME-PREDICATE` · **owner:** CC-A · **issue:** `#1016` · **plan row:** `PHASE_19_PLAN` 4.56
**Origin:** Langston's Step-8 finding on `B-DEPLOY-DRIFT-LINE`, widened by that batch's first production firing (2026-09-07).
**Ref for every citation below:** `origin/migration/aws-supabase` at `747ca41d2`.

---

## 1. THE PROBLEM — ONE CAUSE, TWO FAULTS, AND BOTH MUST BE NAMED OR THE FIX CANNOT BE CHECKED

`comms-infra/discord/dt-deploy-drift.sh:263` — `RUNTIME = ('server/', 'client/', 'shared/')`, filtered at `:265` to exclude `/tests/` and `*.test.ts`.

⛔ **THAT IS A DIRECTORY CONVENTION ANSWERING A QUESTION ABOUT EXECUTION.** The gate's own alert body says it asks *"whether the range touches runtime paths at all"*. What it actually asks is *"does it touch three directories"*.

| direction | what the convention misses | cost |
|---|---|---|
| **UNDER-reports** (Langston, Step 8) | `drizzle/migrations/**`, `package-lock.json`, the build configs — **all executed by `dt-deploy`**, none visible to the gate | ⛔ **a held schema migration, silently** |
| **OVER-reports** (the 2026-09-07 firing) | a comment, a test fixture, a type-only edit — all live under `server/` and all open the gate | a false nag in **all four sessions' every prompt**, and a restart requested for nothing |

⚠️ **THE ASYMMETRY IS LOAD-BEARING AND THIS BATCH MUST PRESERVE IT: over-reporting costs ATTENTION; under-reporting costs a SCHEMA.** A fix that narrows the gate to quieten the nag, and in doing so lets one migration through, has made the tool worse while making its output look better. ⇒ **OBJ-2 (widen) is unconditional; OBJ-4 (narrow) is gated and fail-safe by construction.**

## 2. MANDATORY 1.a — ARCHITECTURAL READ

- **`SYSTEM_IMPACT_MAP.md:3627`** — `dt-deploy-drift.sh`, added by `B-DEPLOY-DRIFT-LINE`. Records host, trigger, cadence, operands, dedupe keys and failure mode. **The runtime predicate is named in that entry, so the entry needs a content update in this batch.**
- **`SYSTEM_MANUAL.md` — JUDGED NOT APPLICABLE, and stated rather than skipped.** Its scope is architecture, strategy logic, regime detection, filter design, signal pipeline and quantitative maths. **This batch changes a shell script's file-path predicate on an observability job.** Nothing it documents moves. *(Applied explicitly per `CLAUDE.md` §9 — do not read this as skip-by-default.)*
- **Blast radius — and the first draft of this line was WRONG in a way worth keeping visible.** It said *"it crosses no process boundary."* **It crosses three:** the embedded python prints the count on stdout and the shell reads it back through `$( )`; `:459` interpolates it into the alert BODY, which is written over ssh into the staging alert store and read by every session's `inject-due-alerts` hook; and `:443`/`:489` write it to `/var/log/dt-deploy-drift.log`.
  ⇒ **THE TRUE, NARROWER CLAIM: the shell VARIABLE `RUNTIME_N` is referenced at exactly FIVE lines, all inside that one file** — `:409` (positional arg 6), `:429` (the gate), `:443`, `:459`, `:489` — **and no other file in the repo names it.** ⚠️ **My first draft said SIX and cited `:452`; that line assigns the UNDECIDABLE `RUNTIME_LINE` string and does not reference `RUNTIME_N` at all.**
  ⛔ **AND THE PREDICATE'S REACH IS WIDER THAN THE COUNT: `runtime()` at `:265` also produces `runtime_files`, written to `$WORK/rtlist.txt` at `:277` and read back as `LIST` (`:411`) and `SHOWN` (`:458`), both interpolated into the body at `:459`.** ⇒ **widening the set changes the ENUMERATED FILE LIST in every alert, not just a count.**
  ⚠️ **What is NOT established: that nothing PARSES the alert body or the log.** I enumerated no readers of either, so a body-parsing consumer would be invisible to this search. **The magnitudes AND the file list in that body are a published interface, and this batch changes both.**

## 3. MANDATORY 1.b — PROVENANCE READ

| component | intent, from the record | disposition |
|---|---|---|
| **`dt-deploy-drift.sh`** — born 2026-09-07, `B-DEPLOY-DRIFT-LINE`, `#1002` | Measure how far the *deployed* code has fallen behind the *reviewed* code, because every prior check compared the deployment against itself. **The gate exists so a governance-only gap does not nag** — it was added after an ungated firing was withdrawn. | **(2) relevant but needs updating to today's intent** — the gate's PURPOSE is right; its IMPLEMENTATION answers a narrower question than the purpose states |
| **`scripts/dt-deploy.sh`** — `B-DEPLOY-LOCK`, `#649` | The single deploy path: lock, fetch, verify sha on branch, refuse a dirty tree, reset, conditional `npm ci`, build, `db:migrate`, optional `--pre-restart`, `pm2 restart`, assert, record. | **(1) still relevant and correct.** ⛔ **IT IS THE AUTHORITY THIS BATCH DERIVES FROM AND IS NOT MODIFIED.** |
| **`scripts/governance-checker/config.mjs:92`** — `CODE_PREFIXES`, introduced `3d3dce073` (2026-06-17, `B-GOV` Step-3), **unchanged since; one commit, control-verified** | Classify a COMMIT as code-bearing vs governance-bearing, to grade its required document set and deadline (`checker.mjs:85`). | **(1) still relevant and correct — FOR ITS OWN QUESTION, WHICH IS A DIFFERENT ONE.** See OBJ-5. |

**Corpora searched:** `RUNNING_ISSUES.md`, `BATCH_CATALOG.md`, `PHASE_19_PLAN.md`, `CHANGES_AND_FIXES.md`, `SYSTEM_IMPACT_MAP.md`, the completion reports, and `git log -S` on each symbol. **`bridge/canonical/` NOT consulted and the reason is stated: every component here was built in 2026-06 or later, well after the 2026-01/02 governance change, so the pre-governance corpus has no coverage of any of them.**

## 4. THE PREDICATE — AND "WHAT THE DEPLOY EXECUTES" IS **NOT** THE RIGHT CRITERION

⛔⛔ **`#1016`'s FIX SENTENCE SAYS *"derive the set from WHAT THE DEPLOY EXECUTES"*, AND TAKEN LITERALLY THAT SELECTS EVERY TRACKED FILE IN THE REPOSITORY.** `scripts/dt-deploy.sh:204` is `git reset --hard "$SHA"` — **the deploy rewrites the entire working tree before it runs anything.** ⇒ every tracked file is, in the plainest sense, "deployed", and a criterion that admits everything is not a gate.

✅ **THE CRITERION THIS BATCH USES INSTEAD — WHICH CHANGED PATHS CAN ALTER THE BEHAVIOUR OF THE RUNNING SYSTEM AFTER THE RESTART. ⭐ **FOUR** SINKS, AND EVERY ENTRY IN THE NEW SET MUST NAME THE ONE IT FEEDS:**
| # | sink | what reaches it |
|---|---|---|
| **1** | **what ends up in `dist/`** (the bundle `pm2` re-execs) | `server/**`, `shared/**`, `client/**`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html` |
| **2** | **what the database SCHEMA becomes** | `drizzle/migrations/**`, **`MANIFEST.txt`**, and `scripts/db-migrate.ts` (the tool that produces this sink) |
| **3** | **what the process RESOLVES at runtime** | `package-lock.json`, `package.json` |
| **4** | ⭐ **what the process READS OFF DISK at runtime** — *added after a fresh reader found it, and it is the row I would have shipped without* | **NOT under a sink-1 prefix ⇒ new OBJ-2 entries:** ⛔ `audit/coherency_rules.yaml` · ⛔ `config/vts.json` · `1-system-manual/authority-baseline-v1.json` · `bridge/canonical/phase9_predictive-learning.json` · `bridge/canonical/mapping-regime-strategy.json` · `data/models/ara_model.json` <br> ⭐ **ALREADY under `server/` ⇒ NO new entry, but LISTED, per Langston condition 2:** `server/config/crypto-universe-filter.json` · `server/config/equity-perp-universe.json` · the TypeScript source `back_audit_engine.ts:200,:545` reads off disk at runtime |

⛔⛔ **LANGSTON CONDITION 2, AND IT IS SUBTLER THAN A LIST: A SINK-4 MEMBER THAT HAPPENS TO SIT UNDER A SINK-1 PREFIX MUST STILL BE LISTED, OR THE DERIVATION RECORDS A WRONG REASON FOR A RIGHT ANSWER.**
`server/config/crypto-universe-filter.json` (`passive-archive/universe-loader.ts:162` — `allowedQuotes`, `minVolume24hUsd`) and `server/config/equity-perp-universe.json` (`:44`) are caught today by the `server/` prefix — **but they are caught for SINK 1's reason, and esbuild does not bundle a `readFile` TARGET.** ⇒ **OBJ-2's path set does not change; the DERIVATION does.** ★ **This is my own *"the control passed for the wrong reason"* one layer down, and he found it in my correction to that very failure.**

⛔⛔ **SINK 4 IS THE ONE THAT NEARLY GOT AWAY, AND THE REASON IS INSTRUCTIVE: THREE SINKS WERE NOT ENOUGH, AND MY NEGATIVE CONTROL WAS ONE OF THE MISSING FILES.**
`server/core/boot_orchestrator.ts:76` calls `loadBaseline()`; `server/config/authority-baseline.ts:88` resolves **`path.resolve(process.cwd(), '1-system-manual/authority-baseline-v1.json')`** and `:107` `readFileSync`s it **at boot**. The file is **tracked** (`git ls-files` returns it). Same shape at `server/core/archival/regime-archiver.ts:26` and `server/bootstrap/schema-validator.ts:37,43`, both reading tracked JSON under `bridge/canonical/`.
★ **esbuild bundles IMPORTS, not `readFileSync` TARGETS** — so these reach no sink 1, are no schema, and are no npm resolution. **They are read from the working tree that `git reset --hard` just rewrote.** ⇒ **they change behaviour after the restart and all three original sinks were blind to them.**
⚠️⚠️ **AND OBJ-2's ORIGINAL NEGATIVE CONTROL WAS *"a range of only `1-system-manual/*.md` must not open the gate"* — TRUE ONLY BECAUSE OF THE `.md`.** I was treating that directory as categorically non-runtime while one file in it is a boot input. **The control passed for the wrong reason, which is the failure mode this whole batch is about.**
⛔⛔ **AND THIS PARAGRAPH USED TO SAY *"consequence is LOW."* THAT WAS FALSE, A THIRD READER KILLED IT, AND THE CORRECTION IS THE MOST IMPORTANT THING IN THIS SCOPE.**
⚠️ **My sink-4 search was anchored on the two directory NAMES I had already found — `1-system-manual/` and `bridge/canonical/` — rather than on an enumeration of `readFileSync` / `path.join(process.cwd(), …)` sites. It could not have reached `audit/` or `config/`.** ★ **The same instrument-reach failure this batch exists to fix, committed inside the scope that fixes it, for the second time.**
⛔ **`audit/coherency_rules.yaml` IS THE RISK ENVELOPE.** `server/services/guardrail-policy.ts:191` reads it via `path.join(process.cwd(),'audit','coherency_rules.yaml')` from the constructor; `:742` exports a **module-level singleton**, so it loads on import; and `:197` **THROWS** — `Cannot initialize GuardrailPolicy without coherency rules`. Its `RULE_001` is `portfolio_risk_per_trade_pct <= daily_loss_kill_switch_pct * 0.5`. ⇒ **an undeployed edit here is an undeployed change to the Core-Four coherency constraints, which `CLAUDE.md` §0 makes a HARD boundary. There is no reading on which that is low-consequence.**
⛔ **`config/vts.json`** — `server/services/vts-runner.ts:519`, spread over `DEFAULT_CONFIG`; carries `targetProfit`, `stopLoss`, `minVolume24h`, `strategies[]`. ⇒ **undeployed, it silently leaves VTS stop/target geometry and universe filtering on the old values.**
★ **`data/models/ara_model.json` is IN on a MEASURED READER, not on parity** — `training-audit-service.ts:159`, a TLVA checksum input. ⚠️ **Langston struck my "on the same footing as" reasoning: parity is not a reason, a reader line is.**
⛔ **`replit.md` IS *NOT* A SINK-4 ROW — IT IS A DEPLOY BLOCKER, WHICH IS A DIFFERENT AND WORSE THING (Langston condition 3).** He found the sharper fact I missed: **the running app WRITES to it.** `routes.ts:21998` appends to `path.join(process.cwd(),'replit.md')` **from an authenticated API route**, and `server/scripts/generate-kraken-docs.ts:17` does the same — while **`dt-deploy.sh:194-196` REFUSES a dirty worktree.** ⇒ ★ **a tracked file our own application appends to is a SELF-INFLICTED DEPLOY BLOCKER with no diff to see — the same family as the untracked `.sql`, not the same family as a config the process reads.** **Homed to `P19-B12`; see §7.**
✅ **What survives of the old bound, narrowed to what is true: the three ORIGINALLY-named files are individually low-consequence** — `loadBaseline` warns and continues when absent (`:118-120`), and `schema-validator.ts` has no callers I could find. ⛔ **That says nothing about the sink, and it is exactly the sentence that let two risk-bearing files sit outside it.**

★ **AND THAT is why `scripts/db-migrate.ts` is IN and `scripts/analysis/*` is OUT — a sink test, not a folder test.** ⚠️ **It is a judgement, and naming it as one is the point: `#1016`'s own wording hid a judgement inside what looked like a mechanical derivation.**

## 4b. THE EXECUTED SURFACE — MEASURED AT THE OBJECT, NOT ASSUMED

⭐ **`dt-deploy` is byte-identical repo-to-installed, checked because `#1004` says a deploy does NOT reinstall it.** `sha256` of `git show HEAD:scripts/dt-deploy.sh` = `6dbfe2dd21…` = `sha256sum /usr/local/bin/dt-deploy`. **Both sides are LF — the repo blob and a Linux file — so the comparison is on ONE surface.**

| `dt-deploy` step | line | what it reads / executes |
|---|---|---|
| conditional `npm ci` | `:202-207` | **`package-lock.json`** (the trigger is its diff), `package.json` |
| `npm run build` | `:213` | `vite build` → **`vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html`, `client/**`**; then `esbuild server/index.ts --bundle` → **`server/**`, `shared/**`** |
| `npm run db:migrate` | `:223` | `tsx scripts/db-migrate.ts` → **`drizzle/migrations/**` AND `drizzle/migrations/MANIFEST.txt`** |
| `--pre-restart <script>` | `:228-229` | an arbitrary `package.json` script — **caller-supplied, not statically knowable** |

⛔⛔ **`MANIFEST.txt` IS NOT AN ORDINARY FILE IN THAT DIRECTORY AND MUST BE CALLED OUT SEPARATELY.** `scripts/db-migrate.ts:140-148` **THROWS** on manifest drift — a migration file present but unlisted, or listed but absent. ⇒ **an undeployed `MANIFEST.txt` change does not merely fail to apply, it can HARD-FAIL THE WHOLE DEPLOY**, and the gate currently cannot see it at all.
★ **AND IT VALIDATES ON *EVERY* INVOCATION, NOT ONLY WHEN SOMETHING IS PENDING:** `listPendingMigrationFiles` (`:152-156`) calls `readManifest()` then `validateManifest()` **before** filtering by what is already applied. ⇒ **a drifted manifest fails a deploy that had no migrations to run.**
⚠️ **AND WHERE THE ABORT LANDS MATTERS: `db:migrate` is `dt-deploy.sh:223`, AFTER `npm run build` at `:213` has already overwritten `dist/`, and BEFORE `pm2 restart` at `:234`.** ⇒ **"the deploy aborts" leaves a HALF-MUTATED host — a new bundle on disk, the old process still serving, and no record written.** Not this batch's to fix; **stated so the alert body does not imply an abort is a no-op.**

✅ **AND `npm ci` / `npm run` ADD NO HIDDEN FILE READS: `package.json` defines NO `preinstall`, `postinstall`, `prepare`, `prebuild` or `postbuild` lifecycle hook.** *(Control: 21 scripts are defined, so the instrument was reading the block.)*

★ **AND `scripts/db-migrate.ts` IS ITSELF DEPLOY-EXECUTED WHILE `scripts/analysis/*` IS NOT.** ⇒ **the answer is NOT "add `scripts/`".** ⚠️ **Langston made exactly that over-broad move inside his own Step-8 measurement and corrected it in flight** — his first pass swept `scripts/` and returned 42, over-counting analysis files. **Adding the directory would reintroduce the error the finding is about.**

## 5. §9.5(a) CENSUS — WHO ELSE DEFINES "IS THIS CODE?"

⛔ **THE SEARCH RULE, STATED, BECAUSE THE COUNT IS AN ARTEFACT OF IT:** files containing all three literal tokens **with trailing slashes**, over `*.sh *.mjs *.ts *.tsx *.js *.cjs *.yml *.yaml`, `node_modules` excluded, at the ref. **Six files match; three are literal path-set constructs.**
⚠️ **A set spelled `['server','client','shared']` without slashes, built from a variable, written as a `{server,client,shared}/**` glob, or split across two files WOULD NOT APPEAR.** Slashless array literals were checked and none exist in code files; **not every spelling was.** ⚠️ **And the population is the REPO — a host-only script on staging or Helsinki is outside it entirely.**
★ **`CODE_PREFIXES` is counted here as a near-neighbour, not a match: it is a FIVE-element superset in a different order.** Two further **two**-element variants (`server/` + `client/src`) exist in test fences (`b-sizing-legacy-deletion-fence.test.ts:33`, `crew-coordination-overlap.test.ts:83`) and are excluded as lint/test scopes. ⇒ **"three" holds under the stated rule and moves to four or five under a looser one. The rule is the finding, not the number.**

**The three, and they are NOT all answering one question:**

| site | question it answers | same question as ours? |
|---|---|---|
| `dt-deploy-drift.sh:263` | *does the undeployed range contain code that RUNS?* | **the object of this batch** |
| `scripts/governance-checker/config.mjs:92` — **`server/ shared/ client/ scripts/ drizzle/`** | *is this COMMIT code-bearing, for doc-set grading?* | **NO — and it is WIDER, already counting `drizzle/`** |
| `scripts/check-no-hardcoded-uuids.sh:20` | *where does this lint rule apply?* | **NO — a lint scope, unrelated** |

★ **THE FINDING: a wider, older, already-reviewed definition existed and my gate reinvented a narrower one without reference to it.** ⛔ **That is NOT an argument for adopting `CODE_PREFIXES` — see OBJ-5.** It is evidence that `drizzle/` being code-bearing was settled here fifteen months of project-time before the drift gate omitted it.

---

## 6. OBJECTIVES

### OBJ-1 — REPLACE THE FOLDER CONVENTION WITH THE **FOUR-SINK** CRITERION, AND MAKE THE DERIVATION READABLE IN THE FILE
Every entry in the new set carries, as an in-file comment, **which of §4's FOUR sinks it feeds and the `dt-deploy.sh`, `db-migrate.ts` or reader line that carries it there.**
⛔ **NOT "what the deploy executes" — `dt-deploy.sh:204` `git reset --hard` makes that every tracked file.** The file must say so, so the next reader does not "simplify" the criterion back to the sentence in `#1016`.
**VERIFY:** every entry names a sink AND cites a line; **every sink in §4's table has at least one entry**; no entry lacks either. **And the negative case is verified too: `scripts/analysis/*` is shown excluded BY THE SINK TEST, not by an exclusion list** — an exclusion list would be the same folder convention wearing a different name.

### OBJ-2 — WIDEN THE GATE TO THE EXECUTED SET *(unconditional)*
Add, each tagged with its sink: `drizzle/migrations/**` (**incl. `MANIFEST.txt`**) and `scripts/db-migrate.ts` → **sink 2** · `package-lock.json`, `package.json` → **sink 3** · `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js` → **sink 1** · ⛔ **`audit/coherency_rules.yaml`**, ⛔ **`config/vts.json`**, `1-system-manual/authority-baseline-v1.json`, `bridge/canonical/phase9_predictive-learning.json`, `bridge/canonical/mapping-regime-strategy.json`, `data/models/ara_model.json` → **sink 4**.
⛔ **`replit.md` IS STRUCK FROM THIS LIST — Langston condition 3; it is a `P19-B12` residual, not a sink-4 row. See §7.**
★ **`data/models/ara_model.json` is a SINGLE-FILE entry, never a `data/models/**` prefix** — reader `training-audit-service.ts:159`, a TLVA checksum input, **and it is the only tracked file under `data/models/`**. *(Langston's correction: cite the reader line, and do not widen a prefix to cover one file.)*
⛔ **`index.html` IS STRUCK FROM THIS LIST — IT DOES NOT EXIST.** `git ls-tree -r` returns exactly one such path, **`client/index.html`**, because `vite.config.ts:18` sets `root: <repo>/client`. **As a prefix entry it would match nothing while READING as coverage in the sink comments OBJ-1 mandates** — and `client/` already covers it. *(Control: `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js` all DO exist at root, so the instrument was not simply returning nothing.)*
**VERIFY, and the negative case is now a real one rather than an accidental pass:** a synthetic range of **only** `drizzle/migrations/0123_x.sql` opens the gate; a range of **only** `1-system-manual/authority-baseline-v1.json` **opens it** (sink 4); a range of **only** `1-system-manual/BATCH_CATALOG.md` does **not**. **All run against the real reader, before and after — the before-run is the positive control showing the test can fail.**

### OBJ-3 — `MANIFEST.txt` IS REPORTED WITH ITS OWN REASON
When the range touches `MANIFEST.txt`, the alert body says the deploy can **hard-fail**, not merely that a migration is waiting.
**VERIFY:** the body line for a manifest-touching range is distinguishable from an ordinary migration range, checked by running the body builder on both.

### ⛔⛔ OBJ-4 — **CUT BY LANGSTON AT STEP 1 (2026-09-07). NOT BUILT. THE TEXT BELOW IS THE PRESERVED STARTING POSITION FOR A FUTURE QUIETENING BATCH, NOT AN OBJECTIVE OF THIS ONE.**
> **His ruling, and it turns my own asymmetry back on me:** *"over-reporting costs attention, under-reporting costs a schema. Value already shrunk to ~one observed shape, four conjunctive clauses, a mutation test, and a declared unknown — that is the whole risk budget of the batch spent on the half that can only make it quieter."*
★ **KEEP ON THE RECORD: clause (d) `CAPPED != 1` and the `patch`-PRESENCE key are the correct starting position if a quietening batch is ever homed.** ⇒ **THE BATCH SHIPS OBJ-1, 2, 3, 5, 6.** ⚠️ **The over-report therefore REMAINS — a comment-only `server/` change still opens the gate, and `#1016` stays open on that half.**

<details><summary>preserved specification, not to be built in this batch</summary>

**(CUT) OBJ-4 — REDUCE THE OVER-REPORT** *(gated, fail-safe, and droppable — and it was dropped)*
A range whose every changed hunk in every otherwise-qualifying file is **comment-or-blank** does not open the gate.
⛔⛔ **AND AS FIRST WRITTEN THIS OBJECTIVE WAS **NOT** FAIL-SAFE. IT REBUILT THIS BATCH'S PARENT DEFECT INSIDE THE BATCH'S OWN FIX, AND A FRESH READER CAUGHT IT.**
*"Every changed hunk is comment-or-blank"* is **universally quantified**, so **an EMPTY hunk set satisfies it VACUOUSLY** ⇒ suppressed.
⭐ **MEASURED AGAINST A REAL API RESPONSE, WITH THE EXPECTATION WRITTEN BEFORE THE RUN (`#744` rider, both clauses).** Commit `82e542ff4` is a pure rename; the compare API returns:
> `status='renamed'` · **`patch` key ABSENT** · `changes=0` · `drizzle/migrations/2026-04-29-b67-1-rollback.sql`
⛔⛔ **THE WORST CASE IS THE EXACT PATH OBJ-2 EXISTS TO PROTECT: renaming a MIGRATION FILE would have been silently suppressed as "all comments" because it has no hunks at all.** ★ **Same shape as the 404-as-zero-drift: the guard tests for the bad case, and the failure mode EMPTIES the field the guard reads instead of filling it.**
⇒ ✅ **THE REQUIRED CLAUSES, and suppression is now conjunctive rather than universal:** suppress **only if** (a) **every qualifying file carries a `patch` key**, AND (b) **at least ONE hunk was MATCHED**, AND (c) **every changed line matches the conservative comment-only pattern**, AND ⛔ **(d) `CAPPED != 1`.**
⛔ **A `renamed`, binary, or size-truncated entry — anything with no patch — REPORTS.** ★ **Keying on `patch` PRESENCE rather than on `status` is deliberate: it is robust to `copied`, `changed` and any status GitHub adds later, without enumerating them** — the enumeration would be the same *rule-out-only-what-you-have-seen* error `#1016` is about.

⛔⛔ **CLAUSE (d) EXISTS BECAUSE WITHOUT IT THIS OBJECTIVE SILENTLY REVERSES A STANDING LANGSTON RULING THAT IS ALREADY WRITTEN INTO THE FILE.** `dt-deploy-drift.sh:426-427`:
> *"CAPPED IS NOT ZERO. At the 300-file cap the gate is UNDECIDABLE, and his separate ruling is that the file gate may never gate EMISSION in that case — only annotate it."*
…enforced at `:429` (`[ "$CAPPED" != "1" ] && [ "$RUNTIME_N" -eq 0 ]`). **The reader caps `files` at 300 — measured 300 returned against a local truth of 761.** ⇒ **all three original clauses can hold across the returned 300 while an unseen `drizzle/migrations/*.sql` sits in the remainder.** ★ **The identical vacuous-satisfaction shape the revision was written to close, relocated from the HUNK level to the FILE-LIST level.**
⚠️ **The prose already said "a truncated file list — REPORTS", and that was NOT enough: it sat inside the line-matching sentence, was absent from the enumerated conditions, and had no VERIFY case. THE ENUMERATED LIST IS WHAT GETS BUILT.**
⚠️ **DECLARED UNCERTAINTY, stated rather than resolved in either direction: whether GitHub ever emits a PRESENT BUT TRUNCATED `patch`. If it does, clause (a) passes on a partially-read file.** Step 2 settles it against a real response before OBJ-4 is built; **if it cannot be settled, OBJ-4 is cut** — it is the droppable half.
⛔ **AND BLANK LINES ARE NOT CLASSIFIED AS SAFE AT ALL.** A blank line inside a multi-line template literal is *content*, and telling the two apart needs parsing this matcher deliberately does not do. ⇒ **the pattern is COMMENT-ONLY, not comment-or-blank**, which narrows what OBJ-4 ever suppresses to roughly the one shape observed on 2026-09-07. **That reduced value is accepted, and is stated here rather than discovered later.**
⛔ **Everything else unmatched — a string containing `//`, a line inside a block comment, an unparseable hunk, a truncated file list — REPORTS.** Doubt resolves toward the nag.
⛔ **NEVER APPLIES TO `drizzle/migrations/**` OR `package-lock.json`** — a "comment" in SQL or a lockfile is not a safe concept.
**VERIFY:** the 2026-09-07 range (`17a102477..0c9e2b5e8`) is suppressed; a range with one real code line is not; a range mixing a comment fix and a migration is **not**; ⭐ **and `82e542ff4^..82e542ff4` — the real patch-less rename — is NOT suppressed.** ⭐ **and a CAPPED range is NOT suppressed** (clause d). ⛔ **AND A MUTATION TEST: break the pattern matcher and confirm the suppression stops firing — a filter that never suppresses passes every one of the tests above.**
★ **THIS OBJECTIVE MAY BE CUT WITHOUT AFFECTING OBJ-1..3.** If it does not converge, ship the widening alone. — **AND IT WAS. See the CUT banner above.**

</details>

### OBJ-5 — DO **NOT** COUPLE TO THE GOVERNANCE CHECKER, AND SAY WHY IN THE FILE
Record in-file that `CODE_PREFIXES` was read, is wider, and is **deliberately not imported**: it answers *"is this commit code-bearing"*, ours answers *"does this need a deploy"*. `scripts/` belongs in theirs and mostly not in ours; a future edit to either for its own reasons must not silently move the other.
**VERIFY:** the comment exists, names the file and line, and states the divergence. **No import, no shared constant.**

### OBJ-6 — A COMMITTED CONTROL THAT WOULD FAIL IF THE READER BROKE
Extend `scripts/analysis/test-drift-shape-guards.sh` with the OBJ-2/OBJ-4 cases, **each stating its expected output in-file before it runs** (`#744` rider, clause 2).
**VERIFY:** the script passes on the fixed reader and **is shown failing on the pre-fix reader** — the before-run is the control.

---

## 7. EXPLICITLY OUT OF SCOPE
- **`dt-deploy.sh` itself is not modified.** It is the authority being read.
- **`--pre-restart` cannot be covered statically** and this batch does not pretend to: it is caller-supplied. **Stated as a known residual in the file, not silently omitted.**
- **The 300-file cap** already has correct `UNDECIDABLE` handling at `:452`; unchanged.
- **`#1004`** (`dt-deploy` does not reinstall itself) is a real hazard, homed at `P19-B12`, and **not folded in.**
- ⭐ **`ecosystem.config.cjs` — DECIDED, NOT LEFT OPEN: OUT, and here is the boundary it sits on.** It carries `NODE_ENV`, `PORT`, `node_args`, `max_memory_restart`, `kill_timeout`, `max_restarts`. **`dt-deploy.sh:234` is `pm2 restart dawntrader`, which re-execs the SAVED process definition and does NOT re-read this file** ⇒ out by sink 1-4 as written. ⚠️ **But it DOES change behaviour at the next `pm2 resurrect` or host reboot** — so the criterion's *"after the restart"* means **this deploy's restart**, not any future one. ★ **That gap is `#652` (`pm2 save`, `P19-B12`), which is precisely why it stays there and not here.**

### 🟨 AND A RESIDUAL THIS BATCH SURFACED AND **CANNOT** CLOSE — NO BRANCH-SIDE CHECK CAN EVER SEE IT
⛔ **A STRAY UNTRACKED `.sql` FILE SITTING IN THE STAGING CLONE'S `drizzle/migrations/` HARD-FAILS EVERY DEPLOY, WITH NO REPOSITORY CHANGE OF ANY KIND.** `db-migrate.ts:113-118` builds `fsForward` from **`fs.readdirSync(MIGRATIONS_DIR)`** — the filesystem, not git — so an untracked file enters the bijection as `missingFromManifest` and throws. **And `git reset --hard` does not delete untracked files**, so the state survives every subsequent deploy.
⇒ ★ **THE DRIFT LINE, AND EVERY OTHER BRANCH-SIDE INSTRUMENT WE OWN, IS STRUCTURALLY BLIND TO IT: there is no commit to see.** Widening the runtime set does not help — the failure has no diff.
**DISPOSITION (§9.4 #2): ADDED AS AN ITEM TO `P19-B12`**, which already carries the staging-host hygiene residuals — `pm2 save` (`#652`) and arming the `dt-deploy` install comparator (`#1004`). **Same family: host state the branch cannot see.** ⚠️ **Not opened as a new number; recorded on `#1016` and cited into the P19-B12 row.**

⛔⛔ **AND THE SAME MECHANISM HAS A SECOND LOCATION, AUTHOR-SIDE, WHICH BOUNDS WHAT OBJ-2 IS ALLOWED TO CLAIM.** `.gitignore:47` is **`*.sql`**, so every one of the tracked files under `drizzle/migrations/` was **force-added**. ⇒ **a migration the author forgot to `git add -f` is untracked in THEIR clone — never committed, never pushed, never in a compare range.**
★ **THE WIDENED GATE IS EXACTLY AS BLIND TO THAT AS THE NARROW ONE, AND FOR THE SAME REASON AS THE STAGING CASE: THERE IS NO DIFF.** ⇒ **OBJ-2 may claim only *"the gate can now see a HELD migration that was PUSHED"* — never *"we can no longer lose a migration."*** **Recorded on `#1016`; same `P19-B12` home.**

### 🟨 THIRD `P19-B12` RESIDUAL — **OUR OWN APP APPENDS TO A TRACKED FILE, AND THE DEPLOY REFUSES A DIRTY TREE** *(Langston condition 3)*
`routes.ts:21998` appends to `path.join(process.cwd(),'replit.md')` from an **authenticated API route**; `server/scripts/generate-kraken-docs.ts:17` does the same; **`dt-deploy.sh:194-196` refuses a dirty worktree.** ⇒ **a route anyone can call can block every subsequent deploy, and no branch-side instrument can see it because there is no commit.**
**DISPOSITION (§9.4 #2): ADDED TO `P19-B12`** alongside the untracked-`.sql` and force-add holes. **Same family — host state the branch cannot see. Recorded on `#1016`.**

---

## 7c. ✅ LANGSTON — STEP-1 VERDICT: **APPROVED, FOUR CONDITIONS**, re-derived at `521e315eb` (NOT `RULED ON REPORTED FACT`)

| # | condition | lands |
|---|---|---|
| **1** | ⛔ **Step 2 enumerates sink 4 BY CALL-SHAPE** — `readFileSync`, `fs.promises`/`await fs.readFile`, `readdirSync`, `createReadStream`, `require()`, dynamic `import` — **stating the pattern set, the population, and what it CANNOT reach** (`training-audit-service.ts:159` builds `${component}_model.json` from a variable; **that class is unreachable by any grep**). | **Step 2** |
| **2** | ⛔ **Sink 4 must list members that ALSO sit under a sink-1 prefix**, or the derivation records a wrong reason for a right answer. | ✅ **done in §4** |
| **3** | ⛔ **`replit.md` → `P19-B12` residual**, with the three lines — not an ordinary sink-4 row. | ✅ **done above** |
| **4** | ⛔ **The spec still said THREE above a four-row table.** *"A reader building 'the three-sink criterion' builds the version without the risk envelope."* | ✅ **done — §4 and OBJ-1** |

⛔⛔ **AND HIS OWN CENSUS IS THE ARGUMENT THAT COMPLETENESS IS *NOT* ESTABLISHED — THIS IS THE MOST IMPORTANT LINE IN HIS REVIEW.** He ran `readFileSync` + `readdirSync` + json-import across `server/ shared/ client/` and **found nothing new**; a broader `readFile(` then returned three more. ★ **AND HIS FIRST INSTRUMENT COULD NOT SEE `config/vts.json` AT ALL — it is `await fs.readFile`, not `readFileSync`. THE FILE I CALL RISK-BEARING WAS INVISIBLE TO HIS CENSUS.** ⇒ **no single-shape census settles this**, which is exactly why condition 1 is a call-shape enumeration with a stated unreachable class rather than one more grep.

⚠️ **WHAT THE APPROVAL DOES AND DOES NOT MEAN, in his words: *"I am approving a document whose author states a third reader was still finding real defects when the cap stopped him, and my own read added one more. That is survivable BECAUSE the unconditional half rests on citations I re-derived, and because Step 2 is where the census closes."*** ⛔ **He is deliberately NOT setting the board `Review` field: a Step-1 clearance is not batch approval and the card must not read that way.**

## 7b. ⛔ THE FRESH-READER ROUND RECORD — **THE CAP WAS REACHED AND THE DOCUMENT WAS STILL MOVING**

**`REVIEWER r1: claim-only (mode B) · six claims · 5 material hits · re-derived y`** — killed *"crosses no process boundary"*; forced the search rule and population onto the §5 census; enriched the `MANIFEST.txt` mechanism (validates on every invocation; the abort lands after the build, leaving a half-mutated host); and produced §4's central correction — **`git reset --hard` means "what the deploy executes" selects every tracked file**, so the criterion had to be restated as sinks.
**`REVIEWER r2: object round · 7 findings, 3 build-changing · re-derived y`** — **sink 4 discovered**, with the file sitting in the directory OBJ-2 used as its negative control; `index.html` struck as non-existent; **OBJ-4 shown NOT fail-safe** — the vacuous empty-hunk-set hole, confirmed against a real compare-API response on `82e542ff4`, whose worst case is a renamed *migration*.
**`REVIEWER r3: object round · 2 findings, both build-changing · re-derived y`** — **sink 4's population was wrong and its "consequence is LOW" bound was FALSE** (`audit/coherency_rules.yaml` is the Core-Four risk envelope; `config/vts.json` carries stop/target geometry); and **OBJ-4 omitted `CAPPED`, which would have silently reversed a standing Langston ruling already written at `dt-deploy-drift.sh:426-427`.**

⛔⛔ **THE CAP IS THREE ROUNDS AND ROUND THREE STILL RETURNED TWO BUILD-CHANGING ITEMS. THAT IS REPORTED, NOT SMOOTHED — IT IS THE FIRST THING TO RULE ON.**
★ **The narrowing was HEALTHY by the stated discriminator, not erosion: every round replaced a checkable assertion with a NARROWER CHECKABLE one** — *"no process boundary"* → five named lines plus a named unestablished residual; *"consequence is LOW"* → two named risk-bearing files; *"fail-safe by construction"* → four enumerated clauses with a real counterexample each. **Nothing became a hedge.**
⚠️ **BUT THE TREND DOES NOT SUPPORT STOPPING: hits did not converge to zero, and TWICE the defect found was THIS BATCH'S OWN SUBJECT rebuilt inside its own fix** — an instrument anchored on names it had already found (r3/F-1) and a guard testing for an absence the failure mode fills (r2/F-3). ⇒ **I do not claim the document is correct. I claim it is the best version I can put in front of you, and that a third independent reader was still finding real defects when the cap stopped me.**
⛔ **The round count is not evidence, and none of the above is cited as support for any claim in this scope — every claim above stands on its own object-and-line citation or it is marked as unestablished.**

## 8. PLAIN-LANGUAGE SUMMARY
The hourly staleness check decides "is any of this waiting work actually going to change what the server does?" by looking at which folder a file sits in. That shortcut is wrong twice over: it cannot see a waiting database change — the most dangerous thing we can leave undeployed — and it treats a corrected comment as a reason to restart live trading.

**This batch replaces the folder guess with a question about consequences: does this file change what gets built, what the database looks like, what the program loads, or what it reads off disk when it starts?** Four routes, and a file is in only if it takes one of them. **The obvious alternative — "list whatever the deploy runs" — turns out to select the entire repository**, because the deploy rewrites every file before it does anything; that is why the scope spells out the four routes instead.

**Two things worth saying plainly about how this scope was arrived at.** A second reader found a fourth route I had missed, and the file it found sits in the very folder I had written down as my example of something that could never matter — so my own test was passing for the wrong reason. And the optional half of the fix, the part meant to stop pointless nagging, turned out to have the same flaw this whole batch exists to correct: it would have gone quiet on a renamed database migration, because a rename has no visible changes to inspect and "nothing to object to" read as "nothing wrong". Both are fixed here rather than left to be found later. The important half — seeing the database changes — ships regardless; the quietening half is optional and now errs toward nagging whenever it cannot be certain.
