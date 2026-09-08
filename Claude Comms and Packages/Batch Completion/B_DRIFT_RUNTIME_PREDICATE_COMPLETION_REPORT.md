# B-DRIFT-RUNTIME-PREDICATE — COMPLETION REPORT

# 🟩 CLOSED 2026-09-08

**Batch:** `B-DRIFT-RUNTIME-PREDICATE` · **owner:** CC-A · **issue:** `#1016` (CLOSED) · **plan row:** `PHASE_19_PLAN` 4.56
**change-class:** `non_architecture` · **head:** `c9f529450` · **CI:** run `34188486088`, **4/4 green verified per job**
**Langston:** Step-1 APPROVED `521e315eb` (4 conditions) · Step-2 ACCEPTED `eecadec6f` (4 conditions) · Step-4 APPROVED `9208c8261` (after r2, r3) · **Step-8 CONFIRMED, every leg re-derived on his own commands — not `RULED ON REPORTED FACT`**

---

## 1. WHAT IT WAS FOR

The hourly drift line asked *"does the undeployed range touch runtime paths?"* and answered with `RUNTIME = ('server/','client/','shared/')` — **a directory convention standing in for a question about execution.**

Langston's Step-8 finding on the parent batch: `dt-deploy` also runs `npm ci` on a lockfile diff, `npm run build` over four config files, and **`db:migrate` over `drizzle/migrations/**`**. ⇒ **a gap made only of those logged `NO_RUNTIME_PATHS` and filed nothing** — and an undeployed schema migration is the highest runtime risk we carry. The parent batch's first production firing then showed the same predicate failing the *other* way: a **comment-only** change under `server/` opened the gate and asked for a restart of live trading.

## 2. ⛔ THE CRITERION `#1016` PRESCRIBED WOULD NOT HAVE WORKED

Its fix sentence says *derive the set from **what the deploy executes***. Taken literally that selects **every tracked file in the repository**, because `dt-deploy.sh:204` is `git reset --hard "$SHA"` — the deploy rewrites the whole working tree before running anything. **A criterion that admits everything is not a gate.**

✅ **REPLACED WITH A CONSEQUENCE TEST — FOUR SINKS.** *Can this change what the running system does after the restart?*

| sink | what reaches it |
|---|---|
| **1** what ends up in `dist/` | `server/ client/ shared/` + `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js` |
| **2** what the DB **schema** becomes | `drizzle/migrations/**` (**rollbacks excluded**, mirroring `db-migrate.ts:118`) + `scripts/db-migrate.ts` |
| **3** what the process **resolves** | `package-lock.json`, `package.json` |
| **4** ⛔ what it **reads off disk** | 8 files — incl. **`audit/coherency_rules.yaml`, the Core-Four risk envelope** (`guardrail-policy.ts:191`, singleton `:742`, **THROWS** `:197`), `config/vts.json`, and `bridge/canonical/mapping-regime-strategy.json` |

**Every entry names its sink and cites the line that carries it there. Renames qualify on `previous_filename`.**

## 3. OBJECTIVES

| # | objective | outcome |
|---|---|---|
| **OBJ-1** | replace the folder convention with the sink criterion, derivation readable in-file | ✅ and the file says explicitly that *"what the deploy executes"* is **not** the criterion, citing `:204`, so the next reader cannot "simplify" it back |
| **OBJ-2** | widen to the executed set | ✅ **nine paths, ENUMERATED not counted** (Langston C3 — the draft said "eight" against a seven-row table) |
| **OBJ-3** | `MANIFEST.txt` reported with its own reason | ✅ **and gated to the discriminating shape** — see §5 |
| **OBJ-4** | reduce the over-report | ⛔ **CUT BY LANGSTON AT STEP 1.** Spec preserved in-document for a future batch |
| **OBJ-5** | do not couple to the governance checker's `CODE_PREFIXES` | ✅ read, wider, deliberately not imported; the divergence is recorded in-file |
| **OBJ-6** | a committed control that would fail if the reader broke | ✅ **and it took three rounds to make true — see §4** |

⚠️ **OBJ-4's CUT IS A REAL RESIDUAL, NOT A TIDY CLOSE: a comment-only `server/` change still opens the gate.** Langston's reason, using this batch's own asymmetry against it: *over-reporting costs attention, under-reporting costs a schema* — and OBJ-4 was the whole risk budget spent on the half that can only make the tool quieter.

## 4. ⛔⛔ THE HONEST HEADLINE: FIVE DEFECTS IN THIS BATCH'S OWN INSTRUMENTS, ALL ONE SHAPE

**A fresh reader defeated the committed control** — damaged the shipped predicate (deleted an entry, cut a group to one, typo'd two paths) and it still printed **PASS, exit 0**.

| # | pointed at | I fixed | THE HOLE LEFT STANDING ONE STEP OVER |
|---|---|---|---|
| 1 | control blind in `SINK*_FILES` | asserted the FILES set | ⛔ `SINK1_PREFIXES` — **deleting `'server/'`, the prefix the entire alert exists for, still printed PASS** |
| 2 | prefixes asserted | added `EXPECTED_PREFIXES` | ⛔ **`qualifies()` had NO control at all** — one marker pair used twice, and it sat below the end marker. **The whole rename fix could have been deleted and the control would have certified it** |
| 3 | MANIFEST note asserted a verdict | downgraded to advisory | ⛔ still fired on the ORDINARY case — **78 of 109** migration commits carry `MANIFEST.txt` |
| 4 | a header comment giving a FALSE REASON | corrected it | ⛔ **a NEW header comment giving the old reason, in the same commit** |
| 5 | rollback case added to the control | wrote it | ⛔ **duplicated case 1's input under a different label** — the only one of the five I caught myself |

★★ **AND THE SHARPEST IS NOT IN THE CODE: I ASSERTED A PROPERTY OF MY OWN TEST WITHOUT READING IT.** I told Langston the control had *"two extractions with two markers"* and offered to trade that maintenance cost away. **There was one marker pair used twice, and the real defect sat underneath the cost I was offering to fix.** ⇒ **a claim about your own instrument gets the same rule-29(a) treatment as a claim about the system.**

**All five are `fix-follows-pointer`, whose mechanism clause already names the missing step: grep the CLASS before fixing the instance, and STATE what the grep returned.** Recorded as instances under that slug — **no new rule** (Langston's §13 disposition).

## 5. WHAT SHIPPED, BEYOND THE PREDICATE
- **`MANIFEST.txt`** gets its own body line — **advisory, not a verdict**, and fires only on `MANIFEST` present with **no `.sql` beside it** (the 6 manifest-only commits), never on the 78 ordinary ones. **Gated on `CAPPED=0`**, because its second clause is an *absence* read off a list that truncates at 300 — and **the cap is reached exactly when a deploy has stalled**, which is when a migration is most likely waiting.
- **Rollback `.sql` excluded** — `db-migrate.ts:118` filters them and `:120-125` throws if one is even listed. **87 of 247** tracked migration files are rollbacks.
- **Two committed controls.** `test-drift-runtime-predicate.py` extracts the predicate **from the shipped file** and asserts the SET as well as its behaviour (**34 cases, 18 discriminating**); `test-drift-shape-guards.sh` gains the CAPPED/MANIFEST gate (**5 cases**). Both state expectations **before** the run.

## 6. VERIFICATION
- **Installed by BLOB, not working tree** — this repo checks out CRLF and that breaks a shell script on Linux. **Hash-verified 3/3** against `git show c9f529450:…`.
- **Real-population fixture:** `fe097912d` — a genuine commit carrying a migration and **no `server/`** — run through the predicate **extracted from `/usr/local/bin/dt-deploy-drift.sh`**: **OLD = 0, NEW = 1.** Its file list also contained a **path with spaces**, which no synthetic fixture had.
- ⭐ **Langston replaced my single fixture with a population: 4,890 commits since 2026-05-01, and the discriminating class (OLD=0, NEW>0) has 66 MEMBERS** — `drizzle/migrations/*` ×149 files, `package.json` ×6 commits, `scripts/db-migrate.ts` ×2, **nine of them MANIFEST-only.**
- **UI (§9.3):** Claude-in-Chrome, no login; the drift row renders in full on System Alerts with its multi-line body intact. ⚠️ **Limit stated: that alert was minted by the PRE-fix predicate, so the page proves the rendering surface, not the new behaviour.**
- **File-vs-process:** `crontab -l` invokes the absolute path that was hashed, re-read each run ⇒ the process claim follows from the file claim (Langston verified).

## 7. ⛔ WHAT IS STILL TRUE AND UNFIXED — STATED, NOT BURIED
1. **A runtime path built from a VARIABLE is unreachable by any grep.** Four sites; **a floor, not a population.** Permanent limit of the method.
2. **The over-report survives** — OBJ-4 was cut.
3. ⛔ **`/opt/discord-bridges/dt-deploy-drift.sh` has ZERO invokers** (measured with a control). **Only `/usr/local/bin` is live.** Updating the mirror alone changes nothing while looking like a deploy — the `#1004` shape.
4. **My one null was overturned.** I reported no sink-4 commit without `server/` files over 400 commits. **Langston produced `8ef70628d` (2026-06-11) — `bridge/canonical/mapping-regime-strategy.json`, read from disk at `routes.ts:2083-2085`, nothing under `server/`; OLD=0, NEW=1.** ⇒ **I stated the WINDOW and not the PREDICATE — I had searched three of the eight entries. A null is only as wide as the predicate that produced it.**

## 8. SPAWNED
**`B-CANONICAL-BRIDGE-CHURN`** — under existing **`#402`** (open since 2026-06-30), owner CC-A, **`PHASE_19_PLAN` row 4.56a**. A **daily** scheduled task rewrites a tracked file with a fresh timestamp, dirtying the staging tree, and `dt-deploy` refuses a dirty tree — **it has already refused one deploy.** ⭐ **This batch's census settles the a/b question `#402` left open since June: `routes.ts:2083-2085` reads that file from disk ⇒ option (b), content-hash compare; gitignore is off the table.**

## 8b. ⭐⭐ THE SPAWNED BATCH IS NO LONGER AN INFERENCE — THE PREDICTION CONFIRMED AT `07:50:18Z`

**Written BEFORE the event, and amended before it could fail:** *if no deploy or restart occurs before ~`2026-09-08T07:50:17Z`, `git status --porcelain` on staging will list **exactly one** file — `bridge/canonical/mapping-regime-strategy.json` — **and NOT the two `.md` siblings**.*

**OUTCOME, read at `07:53:50Z`: exactly that.** One line, `M bridge/canonical/mapping-regime-strategy.json`. All three files carry mtime `2026-09-08 07:50:18.455946309`, so the task fired at **07:50:18 against a predicted 07:50:17**. The app was **not** restarted (`up since 2026-09-07T07:50:11Z`, 604 restarts, unchanged) ⇒ **the test is VALID, not void.**
**The diff is `#402`'s signature verbatim — 2 insertions, 2 deletions:** `generatedAt` and `updatedAt` moving `2026-06-11T01:17:10.255Z` → `2026-09-08T07:50:18.456Z`. Nothing else.

★ **THE AMENDED HALF IS WHAT MAKES IT A TEST RATHER THAN A GUESS.** The two `.md` siblings **were rewritten in the same run** — identical mtimes prove it — **and did NOT dirty the tree**, because their generators interpolate a CONSTANT while only `generateBridgeJSON` stamps a fresh time. ⛔ **My original prediction named all three and would have FAILED on a mechanism that is correct.** Langston caught it with three hours to spare, off the reflog: those two had survived **five** `git reset --hard` operations with mtimes unchanged, so they were clean at every one.

⛔⛔ **OPERATIONAL, AND TRUE RIGHT NOW: the staging tree is dirty, so `dt-deploy` refuses the next deploy (`dt-deploy.sh:194-196`, exit 3).** Crew warned on Discord with the clear command **and** an explicit instruction not to go hunting for what they broke. **That manual clear is the loop `#402` exists to end, not a fix.**

## 9. GOVERNANCE FILES CHANGED
**Batch Catalog · Phase History · Phase 19 Plan · System Impact Map · Running Issues · Changes and Fixes · Mistake Patterns · this batch's Scope, Pre-Implementation Audit and Implementation Plan, and Change List · this Completion Report · the CC-A session task list · the shared memory file and my own.**
**Judged not applicable, stated rather than skipped:** System Manual · Post-Audit Roadmap · Adjustment Framework · Authority Baseline · Storage Policy · Multi-Asset VTS Plan · Asset Class Onboarding · Build Method Playbook · Langston Architecture · CLAUDE.md / CONDUCT.md · the rule-history archive · Deleted Components Log · Governance Exceptions · Delivery Board Protocol.
