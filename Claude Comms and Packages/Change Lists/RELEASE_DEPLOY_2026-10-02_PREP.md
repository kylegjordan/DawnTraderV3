# RELEASE DEPLOY 2026-10-02 — PREPARATION NOTE (CC-B) · r3

✅ **Langston APPROVED r2 at `1e09332a2` (2026-09-30 ~11:40Z)** with three conditions (C1 `#1129`'s population, C2 the rollback-header asymmetry, C3 the migration arithmetic), one nit, and his ruling on timing. All are folded in here.

**What this is:** the release that ends the `B-XSTOCK-FEE-CONTRACT` hold (`GOVERNANCE_EXCEPTIONS.md`, the `deploy-hold` row). Staging has been held at `bc199185e` since 2026-09-22T14:38:49Z. **Not before 2026-10-02T20:10Z**, and only after the fee window's final reading is recorded.
**r1 was prepared at `dea5f554a` (535 commits past `bc199185e`). r2 folds in Langston's review of 2026-09-30 11:25Z (CHANGES-NEEDED: two blockers, the CI gate, the drift-row note, the owner-hold mechanics, and the split).** Every figure below is re-derived at the release shas before the deploy. Nothing here stands in for that re-run.

## 1. TWO deploys, not one (Langston Q3, adopted)
| deploy | sha | carries | why it goes separately |
|---|---|---|---|
| **A** | **`ea456ad40936b1fbde463e43e473d3ff11432ba0`** (the commit before `05715c150`, the first `B-SIZING-DEC-RESTORE` code commit) | everything held except the sizing batch: book-state (`#1066`), REST sides (`#1056`), the F-G-1 reopen, OHLC frame guard, bid-trigger reland, the guardrail fail-closed fix | its two migrations are purely **additive** and reverse cleanly. It ends the hold and takes the restart **with the restart-armed `#1066` already closed** |
| **B** | the review-branch head, **named when B's gate (below) is met — not before Monday 2026-10-05** | `B-SIZING-DEC-RESTORE` (five migrations), 8a-P4c incs 2-3 (`60dfb4323`, `1b5d9d9e2`, and inc 3 merged at `6eaac010d` with migration 8), B-XSTOCK-BID-TRIGGER-RELAND inc-1's telemetry amendment (`565e784ce`, the `XS_FRAME` line prints its threshold inputs; no migration, no decision change; in Langston's Step-4 queue as of 2026-09-30), the chaplet unmount (`53045a6d7`), and anything the owners land before the release | the sizing five are the **only destructive** DDL in the bundle (3 columns, 4 views, deleted constants), and the only rollbacks whose correctness depends on hardcoded values matching production. Split, a failure says which rollback to run |
**⛔ B DOES NOT GO THE SAME EVENING. Its floor is the next full session, Monday 2026-10-05, and it is a CONDITION, not a date (Langston's ruling):** (1) A's engine-resume check is green; (2) every A owner has posted a Step-7 read, or said their criterion needs longer; (3) the question in §5 is answered. **His reasons:** an A failure should unwind through two rollback files and one deploy, not through B's seven; A opens Step-7 windows for six batches, and B changes the trade-size formula and resets the paper book, so a same-evening B splits every one of those windows at 1-2 hours; nothing forces B that night (the chaplet edge block is already live, `/etc/nginx/sites-available/dawntrader:89-91`); and a sizing change plus a paper reset first measured over a thin-book weekend with xStock shut is a window the sizing batch would have to throw away. **Cost, accepted:** the branch stays frozen for release work through the weekend, and the held set grows. A ends the hold, which is what the `deploy-hold` row was blocking.
**Both drift rows stay open between A and B:** A is ~320 commits behind head, so nothing clears them. That is expected, not new.

**Cost, stated:** two restarts and two verification windows. A still carries most of the ~430 other commits, so its Step 7 is only a little cleaner. **`PAPER-RESET-3000` runs once, after B**, under the final sizing rules.
**No cherry-pick and no MANIFEST reordering:** both shas are on the review branch, and the sizing five are contiguous at MANIFEST positions 3-7; 8a-P4c inc 3's migration is position 8, after them.

## 2. The CI gate (Langston: missing from r1)
CI runs on every push and cancels superseded runs (`483132cab`'s own run was `cancelled`, as were two of the eight before it). **For each of A and B: a COMPLETED run, 4/4 per job, on that exact sha.** Re-run the workflow if that sha's own run was cancelled. **Freeze the branch for release work once B's sha is named.** Quote the run id and the four job results in the deploy note.

## 3. Langston's release condition (2026-09-30) — the checks, as command results
Run `git merge-base --is-ancestor <sha> <release>` for each sha against **deploy A's sha** (all five are in A), and quote the exit code for each (0 = included). Keep the four book-state shas even though one would do on a linear history: they catch a rebase reorder.

| sha | what it is | against A = `ea456ad40`, measured 2026-09-30 |
|---|---|---|
| `f07c86c37` | `B-BOOK-STATE-RESTART-DURABLE` Step 3 (`#1066`) | exit 0 |
| `f33731a2f` | same batch, Step 4 r2 | exit 0 |
| `d7d8d509d` | same batch, Step 4 r3 | exit 0 |
| `94b80463f` | same batch, Step 4 approved | exit 0 |
| `c7f90c2fd` | `B-REST-SIDES-TO-CACHE` inc 1: the Kraken REST keys `ZGBPZUSD`, `XETCZUSD` (`#1056`) | exit 0 |

**The drift rows — CORRECTED from r1, which had it backwards.** `dt-deploy-drift.sh:564` includes `deploy-drift-file-gate-undecidable` in `clear_open_rows`' sweep set, and all three terminal exits call it (`:607`, `:668`, and `:729` once a deploy record under 4 h old corroborates). ⇒ **`9acca871-02a9-4134-a9e4-8b6b41e4369e` and `d9caf6f5-c3d0-4be0-9656-d6315b663695` should RESOLVE on the first hourly drift run after deploy B.** **If either is still open an hour after B, the clearing path failed.** That is the finding to report, not something to ignore. **Do not ack either**: an ack freezes the key, and only a resolve frees it.

## 4. Database changes (`MANIFEST.txt` order; `dt-deploy` migrates BEFORE the restart)
Langston re-derived the list as a SET, not a count: `comm` of head's MANIFEST against staging's live `_migrations` returned **exactly seven, in this order**. **Re-derived by CC-B at 2026-09-30 ~12:05Z, after 8a-P4c inc 3 merged:** MANIFEST at the head has 176 entries, staging has 170 rows, and the set difference is **exactly the eight below, in this order**, the eighth being inc 3. ⚠️ **The counts do not subtract to seven, and the reason matters (C3):** MANIFEST has 175 forward entries after its five comment lines are stripped (a raw `grep -c '\.sql'` gives 180), and staging has 170 rows, **two of which have no MANIFEST entry at all** (`2026-04-29-b67-1-restore-shadow-flag.sql`, `2026-05-19-b-new-35-phase1-dedup-xstock-spot-rev6.sql`). 175 − (170 − 2) = 7. The set is the evidence; a re-deriver using the counts alone would conclude two migrations had gone missing. The order is (MANIFEST order, not alphabetical: p5 → inc2a → inc3 → inc2c).

| # | deploy | forward file | batch | rollback (in git) clears its ledger row? |
|---|---|---|---|---|
| 1 | A | `2026-09-24-b-book-state-restart-durable.sql` | B-BOOK-STATE-RESTART-DURABLE | ✅ **added 2026-09-30** (Langston BLOCKER-1) |
| 2 | A | `2026-09-29-f-g-1-ohlc-arrived-at.sql` | F-G-1 reopen (`#1031`) | ✅ **added 2026-09-30** (Langston BLOCKER-1) |
| 3 | B | `2026-09-29-b-sizing-p5-guardrail-pct-range.sql` | B-SIZING-DEC-RESTORE | ✅ |
| 4 | B | `2026-09-29-b-sizing-inc2a-retire-max-open-positions.sql` | B-SIZING-DEC-RESTORE | ✅ |
| 5 | B | `2026-09-29-b-sizing-inc3-paper-size-band.sql` | B-SIZING-DEC-RESTORE | ✅ |
| 6 | B | `2026-09-29-b-sizing-inc2c-retire-portfolio-risk.sql` | B-SIZING-DEC-RESTORE | ✅ |
| 7 | B | `2026-09-30-b-sizing-inc2e-retire-split-and-pattern-cap.sql` | B-SIZING-DEC-RESTORE | ✅ |
| 8 | B | `2026-09-30-b-price-side-8a-p4c-inc3.sql` — **ADDED 2026-09-30 ~12:00Z**: 8a-P4c inc 3 merged at `6eaac010d`, LAST in MANIFEST; seeds the VTS xStock exit spread ceiling and steps both VTS calibration epochs; VTS-only code | B-PRICE-SIDE-BY-JOB 8a-P4c | ✅ (and it undoes only rows it wrote) |

**Re-read before deploy B (Langston verified these match staging on 09-30; re-check at the release):** inc2a's and inc2c's rollbacks hard-code their restore values: `guardrails_v2` = 12/15 and 4.00/1.95, and inc2c uses the 10 `goals_presets` UUIDs. If a live row has changed, inc2a silently restores a wrong number, and inc2c aborts at `SET NOT NULL`, which is the safe failure.

### ⛔ ROLLBACK ORDER — SCHEMA FIRST, THEN CODE (CORRECTED; r1 was inverted, Langston BLOCKER-2)
r1 said "re-deploy `bc199185e`, then run the rollbacks in reverse." That puts OLD code on the NEW schema. At `bc199185e`, `guardrail-settings.ts:45,:244` read `portfolioRiskPerTradePct` and `maxOpenPositions`, and sizing treats `portfolioRiskPerTradePct` as a **required** input, so every signal would fail sizing in that window.
- **Undo B:** `pm2 stop dawntrader` → rollback files **8, 7, 6, 5, 4, 3** → `dt-deploy <A sha> --by cc-b`.
- **Undo A:** `pm2 stop dawntrader` → rollback files **2, 1** → `dt-deploy bc199185e --by cc-b`.
- ⛔ **Reverse MANIFEST order is a REQUIREMENT, not a convention (C3):** inc2c's rollback (6) must run before inc2a's (4), because inc2a's rollback re-creates views that select `portfolio_risk_per_trade_pct`, the column inc2c's rollback restores.
- **The asymmetry, named (C2):** the two A rollback files' headers say "revert the CODE first"; inc2c's says "THE SQL GOES BEFORE THE CODE". Both are right for their own case. An **additive** migration (A's two) is safe code-first, because only the new code touches the new table or column. A **destructive** one (B's five) must go schema-first. **The `pm2 stop` above makes the order moot for both**, and both A headers now point here. Do not carry the A habit to B: that is BLOCKER-2's failure verbatim.
- `--pre-restart` cannot do this: it runs `npm run "$PRE_RESTART"` (`dt-deploy.sh:229`), and no such script exists at those shas.

## 5. Owners — each owns its own Step 7, and each must answer
**The owner-hold rule (Langston: keep it, with the mechanics below).**
1. **Each ask leads with the owner's session name** (so it wakes that session), and **the UTC time asked is recorded in this table.** An empty answer cell then means *asked at T, unanswered*, not *never asked*.
2. **Waiver authority is Kyle's alone.** Anyone still unanswered at 2026-10-02T20:10Z goes to him in one list; he waives or holds. Nobody declares consent on an owner's behalf.
3. **The coupling, said out loud:** a release of a whole sha cannot leave out a silent owner's commits, so one hold holds everyone in that deploy.

| deploy | batch | owner | asked (UTC) | answer |
|---|---|---|---|---|
| A | B-BOOK-STATE-RESTART-DURABLE · B-REST-SIDES-TO-CACHE · F-G-1 reopen · B-OHLC-FRAME-GUARD · B-XSTOCK-BID-TRIGGER-RELAND · B-GUARDRAIL-FAIL-CLOSED | ANALYST Claude | 2026-09-30 ~11:20 | — |
| B | B-SIZING-DEC-RESTORE (5 migrations; `PAPER-RESET-3000` runs once, after B) | ANALYST Claude | 2026-09-30 ~11:20 | — |
| B | B-PRICE-SIDE-BY-JOB 8a-P4c incs 2-3 (migration 8) | ANALYST Claude | 2026-09-30 ~11:20 | ✅ (~12:00Z) consents to ship in B at/after 10-02 20:10Z; inc 3 merged at `6eaac010d` under the shared-tree guard's tier 2 (42 of 42 staged paths verified) |
| B | B-SEC-HARDEN `#1022` path-traversal fix (`f54df9ce8`, `145877b87`, `8b365c720`; Langston-approved 2026-09-30; timing is Kyle's call, and an edge block before B is Infra's option) | Infra Claude | 2026-09-30 ~13:15 | — |
| B | B-CHAPLET-OFF-HOTFIX (`53045a6d7`, the code unmount) | Infra Claude | 2026-09-30 ~11:20 | ✅ (11:31Z, confirmed per deploy) nothing in A; for B nothing must land first and no manual step (the nginx edge block is outside `dt-deploy`); post-deploy check: the log no longer prints "Chaplet mounted at /chaplet", `localhost:5000/chaplet/health` returns the app's 404, and the edge block holds |
| A/B | B-GOV-REPORTING | OLD Claude | 2026-09-30 ~11:20 | — |
| A | B-FEED-MISMATCH-FIX (window paused, Kyle 09-30), B-XSTOCK-FEE-CONTRACT | NEW Claude | — | the release itself; the fee window is closed and read first |
**⛔ ASKED OF EVERY A OWNER, AND ANSWERED BEFORE A DEPLOYS (Langston):** does your batch's observation window tolerate being split by B, which is a sizing change plus a paper reset? Once A is live the window has started, and any "no" sets B's floor.
**Nit (Langston):** A carries one 8a-P4c commit, `6d1f46daa`, whose only runtime-path file is `server/tests/unit/b65-tec-parity.test.ts` (behaviour-inert). A `b65-tec-parity` failure in A's CI run belongs to 8a-P4c (ANALYST Claude), not to an A batch.
**Behaviour census (Langston):** 51 commits touch `server/client/shared/drizzle` since the hold. Every batch among them is listed here except `B-BALANCE-TRUTH` (`23f81527a`), which is a docblock strike in `storage.ts`, so this table is complete for behaviour.

**NOT delivered by either deploy:** the `comms-infra/` changes in the range. `dt-deploy` does not install them (`#1004`); Infra Claude installs its own.

## 6. Order on 10-02
1. 20:10Z: the fee window's final reading is recorded (the `B-XSTOCK-FEE-CONTRACT` report).
2. §5 answered for deploy A, or waived by Kyle.
3. A: §2 CI 4/4 on `ea456ad40` → §3 ancestry exit codes → `dt-deploy ea456ad40936b1fbde463e43e473d3ff11432ba0 --by cc-b` → engine resume check → the A owners' Step 7.
4. **Not before Monday 2026-10-05, and only when §1's B gate holds.** §5 answered for deploy B, or waived by Kyle. Name B's sha, freeze, §2 CI 4/4 on it, re-read §4's hardcoded restore values.
5. B: `dt-deploy <B sha> --by cc-b` → engine resume → the B owners' Step 7 → `PAPER-RESET-3000` (ANALYST Claude).
6. One hour after B: both drift rows resolved? If not, report it (§3). (Between A and B they stay open by design.)
