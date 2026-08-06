# B-DEPLOY-LOCK — Completion Report (#649, closes #140)

**Owner:** CC-B · **change-class:** `non_architecture` · **Date:** 2026-08-06
**Scope:** `B_DEPLOY_LOCK_SCOPE.md` rev 4 (Step-1 approved after 4 revs) · **Pre-audit:** `B_DEPLOY_LOCK_PRE_AUDIT.md` (Kyle-directed cross-system audit; Step-2 approved after 2 revs)
**Code:** `354ace0ca` → `c556ab8c5` (Step-4 seven fixes) → `2b1c5fbe4` (window-bound honesty) → `8aad3f112` (Docker fix) → `b16131a5e` (self-timestamping) → `22702f2a3` (OBJ-5 sweep) → `280768887` (Step-8 leg-2 survivors + durable migrate record)
**CI:** 4/4 green verified job-by-job at `8aad3f112` and `22702f2a3` (the two deployed shas).
**Langston:** Step-1/2/4/8 all APPROVED at refs, each after real CHANGES-NEEDED rounds; board `Review = Approved` (set by him).

## 0. What exists now
**`dt-deploy <full-40-char-sha>`** — the ONLY documented staging deploy path. Locks (atomic, outside the repo), refuses concurrency naming holder+sha+since with the #540 tier-3 protocol in the refusal text, refuses a dirty worktree listing what it protects, deploys only reviewed refs (ancestor check), conditionally `npm ci`s on a lockfile diff, migrates in-chain (**the SYSTEM_MANUAL:12734 invariant, restored to the live path — this closes #140**), asserts post-conditions AT THE OBJECTS (live HEAD, build-identity response — never a bare 200, ENGINE RESUMED) and records **only after they pass**: sha, restart_time, window, **migrate_ran_at + migrate_ms (durable — Step-8)**.

## 1. Objectives — all eight
OBJ-1 chain ✅ (two live runs) · OBJ-2 refuse-not-queue ✅ (provoked) · OBJ-3 holder-named ✅ (provoked) · OBJ-4 tier-3 in refusal ✅ (provoked) · OBJ-5 six-site sweep + two Step-8 survivors ✅ (**wide-pattern grep clean at `280768887`**; historical records annotated, never rewritten) · OBJ-6 record + three-branch discriminator ✅ (544→545 observed) · OBJ-7 dirty-refusal ✅ (protected 10 real items, preserved via stash `pre-dt-deploy-first-run 2026-08-06`) · OBJ-8 dormant CI deployer DELETED ✅ (`DELETED_COMPONENTS_LOG`, archive `.removed`).

## 2. Live evidence — two real deploys by the tool itself
**Run 1** (`8aad3f112`): exit 0, window **15s**, restart_time 543→544. **Run 2** (`22702f2a3`): exit 0, window **11s**, **timestamped transcript: build 10.3s · `db:migrate` 08:16:38.243→.880 = 637ms · restart** — the migrate leg measured, and structurally guaranteed besides (`set -e`: "end" cannot print on a non-zero migrate). **Watchdog disposition settled by measurement: both windows 20×+ inside the 300s never-fires bound.**

## 3. What the reviews caught — the batch's real ledger (11 substantive catches)
Step-1×4: destructive reset (F3) · migrate omission, docs already disagreeing (F1) · sweep undercount 2→5 (F2) · wrong-victim protection (F4) + prose-vs-graded-row class + citation-range class. Step-2×2 + rev: my own watchdog missing from my own census · non-monotonic restart counter (his own premise, corrected against himself) · debounce bands felt-not-implemented. Step-4×7: **the poll loop died on iteration one of every real deploy** (verified by execution) · mode 100644 · fail-open engine check · deployer-stamped identity (forgeable) · restart_time by ordering luck · false blast-radius claim · trap signals. Step-8×2: **my "grep returns ZERO" was a narrow pattern dressed as a sweep** — his wide grep found a copyable block whose first line fails then builds arbitrary state outside the lock · transcript-not-durable. **Plus his retraction of the implausibility premise after measuring, and his own npx-adjacent-instrument near-miss, logged against himself.**

## 4. Mine, on the record
The false "PUSHED" echo (twice; replaced permanently by origin-vs-local verify) · the CRLF shebang break (fixed at the class: global `*.sh eol=lf`) · the row-55 mis-homing (`#140\b` matched PM2 counters) · the Docker red landing on CC-A's run (my stamp called git in a gitless image; owned in-channel by name) · the narrow-grep zero · a worktree-commit silently discarding a staged mode bit (new failure shape, documented).

## 5. Governance files changed
This report · `RUNNING_ISSUES.md` (#649 + #140 RESOLVED; #652, #653 filed+homed (both RENUMBERED 2026-08-06 - CC-B minted into occupied slots; Langston caught it at this sign-off)) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `PHASE_19_PLAN.md` · `SYSTEM_IMPACT_MAP.md` (dt-deploy component row) · `DELETED_COMPONENTS_LOG.md` (OBJ-8, body corrected at Step-4) · the six swept prescriptive docs · `GOVERNANCE_EXCEPTIONS` not needed (closed in-window). **System Manual: content in the invariant block only (marked ENFORCED) — judged applicable exactly there, nowhere else.**

## 6. §4c RECONCILIATION (first use — Kyle's rule, confirmed by the owner)
**(1)** Every OPEN Phase-19 batch has a card — verified against the plan's open set at close. **(2)** Every non-Complete card corresponds to plan/roadmap/issue work — the two 08-05 additions (deploy lock, cloud trial) trace to #649 and Kyle's directive. **(3)** This card's column matches reality — `Governance` at report time, `Complete` on Kyle's acknowledgment; **its completion report exists at the ref before any card reads Complete.** Reconciled by CC-B, 2026-08-06.

## 7. Carried, named
**Installed-copy drift check** (`/usr/local/bin/dt-deploy` vs the blob — #641's shape; fold into P19-B12's health checks with #652) · **#653** (CC-A ack pending) · **stash disposition** (the F3 debris) · alerts `83afc970` + `e5eece5b` (acked cc-b, due now this batch is closed).
