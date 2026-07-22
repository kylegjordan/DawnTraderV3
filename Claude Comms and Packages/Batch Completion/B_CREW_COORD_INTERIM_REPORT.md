# B-CREW-COORD — INTERIM REPORT (RUNNING_ISSUES #554)

> **⚠️ THIS IS NOT A COMPLETION REPORT AND THE BATCH IS NOT CLOSED.** It is deliberately titled *interim*: governance requires a completion report **at close**, and calling this one would be the exact "true as worded, misleading in effect" failure this batch has already corrected once. **OBJ-6 is unmet. OBJ-4 is deferred.**
>
> **Owner:** Claude Analyst (CC-C). **Reviewer:** Langston (Step-1 ACK, Step-4 APPROVED, plus three in-flight rulings recorded below).
> **change-class: non_architecture** — new isolated table + a CLI; **no trading-path code reads `crew_coordination`**, and that absence is a deliberate scope fence, not an accident.
> **Staging HEAD at verification:** `80ed5ca2a`. **CI:** 4/4 green on `23fcae705` (run `29956693472` on the predecessor; both green).

---

## 🚨 SCAFFOLDING-VS-FUNCTIONAL DECLARATION (§9.1)

> **🚨 THIS BATCH DOES NOT MAKE AUTOMATIC COLLISION-CHECKING FUNCTIONAL. THE COMMIT GUARD DOES NOT CONSULT THE BOARD, AND WILL NOT UNTIL THE WORKING-TREE RESOLUTION (#567).**

The board **is** functional and live — it can be read and written by hand. What does **not** exist is the reflex: nothing consults it for you. A session that forgets to run `crew claim` gets exactly the protection it had yesterday, which is none.

---

## 1. OBJECTIVE STATUS — honest per-objective, no rounding up

| # | Objective | Status |
|---|---|---|
| **OBJ-1** | Registry not on the flaky mount | **DONE + LIVE.** Registered migration applied to staging (14/14). Verified at the DB with `\d`, not from the migration file. |
| **OBJ-2** | Push serialization | **DONE + LIVE + PROVEN.** Partial unique index refuses a second active push **in Postgres**, not in application code. |
| **OBJ-3** | `crew` CLI | **DONE + USABLE.** Was "written, not usable" for several hours — see §3. Now verified live on staging. |
| **OBJ-4** | Commit guard consults the board | **❌ DEFERRED — NOT BUILT.** Langston-ruled. See §4 and `#567`. |
| **OBJ-5** | Stale-claim reaping that surfaces | **DONE.** `crew reap` defaults to DRY RUN; expiry is a visible status transition with a timestamp, enforced by a CHECK constraint. Not yet exercised against a genuinely stale claim (none exists yet). |
| **OBJ-6** | **Adoption, with a hard close gate** | **❌ OPEN. THE GATE IS UNMET.** |

---

## 2. VERIFICATION — the exercise, and the precise limit of what it proves

**Raw output, staging, `deploy` user** (npm banner lines stripped, nothing else edited):

```
Board is clear — no active claims or pushes.
===CLAIM===
Claimed [5] for ANALYST Claude: server/core/rtb
===BOARD-WITH-ENTRY===
ACTIVE CLAIMS (1):
  [5] CLAIM ANALYST Claude  (0m ago)
        paths: server/core/rtb
===RELEASE===
Released 1: [5] ...
===FINAL-BOARD===
Board is clear — no active claims or pushes.
```

**Push serialization, verbatim — the one hard guarantee in the batch:**
```
✗ A push is already in progress: ANALYST Claude since 2026-07-22T21:10:23.247Z (verify).
  Wait for it, or ask them to run: crew release --id 2
```

**★ The symmetric-overlap case proved live** — a session claiming the broader `server/services` was warned about an existing narrower `server/services/crew-coordination.ts`. **Unidirectional matching would have missed that collision entirely.** Warned, then recorded anyway: *the board reports, it does not block.*

**Release semantics verified at the DB:** all test rows `status=released` with `released_at IS NOT NULL`. **Nothing deleted.**

> **⚠️ THE LIMIT, STATED SO IT CANNOT DRIFT: every entry above says `ANALYST Claude` because I ran every command.** The cross-session collision test was me setting `CREW_SESSION="NEW Claude"` **myself** — impersonating his session name in a test, not NEW Claude using the board. **This proves the MECHANISM. It proves NOTHING about ADOPTION.** A clean transcript of one person's own commands must not be allowed to read as three-session use.

**Deploy note:** `git pull` + `db:migrate`, **deliberately NO `pm2 restart`.** Repo-wide grep (tests excluded) confirmed nothing in the running app imports the crew files, so a restart would have bought nothing and would have interrupted active trading with open positions. Announced in-channel before acting.

---

## 3. ★ A CORRECTION I MADE AGAINST MY OWN CLAIM

I told Langston OBJ-3 was *"usable by hand via `npm run crew` from a healthy tree today."* **True as worded, misleading in effect** — and he had accepted the OBJ-4 deferral partly on it.

`npm run crew` **fails in the working tree**: `'tsx' is not recognized`. `tsx` died with the rest of `node_modules` (#567). The only healthy local tree is the bench — 172 commits stale, and it did not even contain these files. **So "usable today" was, in practice, true nowhere a person works.** The adjective *"healthy tree"* was doing load-bearing work I had not flagged.

Retracted to Langston before he acted on it. His logging: *"the measurement was right; 'healthy tree' was the invented adjective doing load-bearing work."* The staging path (§2) is what actually resolved it.

---

## 4. OBJ-4 — DEFERRED, and why building it would have been worse than not

The guard runs with cwd = the working tree. **Measured there: 452 packages, 405 with a ZERO-BYTE `package.json`, 3 non-empty, 44 missing.** `pg` cannot import.

The guard is **fail-open by design** (correct — a board outage must never block committing). Combined with an import that always throws, it would have **warned nothing, blocked nothing, and reported nothing — silently, on every commit, forever — while looking installed and passing review.**

> **★ A control that appears present but never fires is WORSE than no control, because it manufactures assurance.** Absent-as-valid (#546), inside the tool built to prevent silent failure.

**Langston ruled DEFER over the fetch-to-a-new-endpoint alternative:** *"a patch on a patch… you'd stand up a new staging endpoint AND put a bearer token in a git hook on a batch you already fenced. A token-holding hook is its own authority/security decision; it does not get to ride in on a workaround for a wedged `node_modules`."*

**HOME:** the repo/working-tree resolution (`B-REPO-RELOCATE`), reopening as its own scoped item at that resolution. **Trigger:** if that proves weeks rather than days, reopen the endpoint-vs-defer trade with the token scoped separately.

---

## 5. WHAT REMAINS BEFORE THIS BATCH CAN CLOSE

1. **OBJ-6 adoption gate** — `crew board` showing real claims/pushes from **all three CC sessions**, cited here. Not simulated, not mine.
2. **OBJ-5 exercised** against a genuinely stale claim once one exists naturally.
3. **A real completion report**, replacing this file, at close.

---

## 6. GOVERNANCE FILES CHANGED — actually edited, not aspirational

- `1-system-manual/RUNNING_ISSUES.md` — **#554** updated; **#567** filed (working-tree breakage + the OBJ-4 deferral with its trigger).
- `1-system-manual/BATCH_CATALOG.md` — B-CREW-COORD row (recorded as OPEN/PARKED earlier today; needs updating to reflect this interim state at close).
- `1-system-manual/PHASE_HISTORY.md` — parked-batch entry.
- `Claude Comms and Packages/Scope Files/B_CREW_COORD_SCOPE.md`, `B_CREW_COORD_PRE_AUDIT.md` — unchanged this pass.
- `Claude Comms and Packages/Scope Files/B_REPO_RELOCATE_SCOPE.md` — §5c added: the three measured two-trees failures.

**NOT updated, with reasons rather than silence:** **SYSTEM_IMPACT_MAP** — the board is a new component and WILL need an entry, but per §9 judgment it is not trading-path and has no cross-cutting runtime state; **deferred to close, not skipped** — flagged here so it cannot be missed. **SYSTEM_MANUAL** — N/A: no architecture, strategy, regime, filter, signal-pipeline or math change.
