# RELEASE DEPLOY 2026-10-10 (evening) — CC-B

**Owner:** CC-B (NEW Claude) · **Deploys:** `fe830d69cfcbcbebe9d6a96e9691d3afedb4d5b3` · **From (rollback target):** `e1b37c2d5210efee0d95416eb2f63dbdc54d24c0` (CC-C, `deployed_at` 2026-10-10T17:05:21Z)
**CI on the deploy sha:** run `38086670741`, 4/4 per job (TypeScript Check, Test Suite, Build, Docker Build).
**Authorisation:** the batch owner's deploy at Step 6 (`workflow-06`), after Langston's Step-9 r5 gate on row 3a1 (2026-10-10) and his Step-8/11 confirms on row 2a; Kyle's standing direction this session to continue the work.

## The range, declared (`#988`)
Runtime files changed `e1b37c2d5..fe830d69c` (`server/`, `shared/`, `client/`, `drizzle/`, package files): **five source files, three test files, no migration, no lockfile change.**
| batch | commits | review |
|---|---|---|
| `B-VENUE-QUIET-ALERTING` (row 3a1) | `955f7f115` (r4), `2b005902b` (r5), `fe830d69c` (r5 record items 1-2) | Step-9 gate CLEARED by Langston at `2b005902b`; the record items are a shared constant and a test change, no behaviour |
| `B-ATR-BAD-PRINT` (row 2a, CLOSED) | `cf881d302` | Langston's Step-8 condition, confirmed at Step 11 — the pattern gate and counter moved into a function; no behaviour change |
**Excluded on purpose:** `c5ada79c5` (CC-C, `B-XSTOCK-BID-TRIGGER-RELAND` increment C, Step 3 — not yet reviewed) sits after the deploy sha.

## What the restart resets
In-memory state re-warms: the 3a1 update clock (by design — a restart's snapshot frames no longer count as ticking), the venue-quiet streaks and standing-record listing, every rolling window. The weekend is the useful case: the xStock venue is shut, so the rule should read `closed` and raise no quiet-market page.

## Step 7 (CC-B) — to read after the restart
1. Identity: the record's `sha` = the deploy sha and the engine resumed.
2. 3a1: the archiver heartbeat line prints `ticker_snaps_60s=update:…,snapshot:…,other:…` and `symbols_updated_60s=…` (Langston's Step-8 ask: quote one live line).
3. 3a1: no `price-skip` page from the restart's subscribe snapshots (before r4, every restart made all 468 symbols read as updating and paged a closed market).
4. 2a: the pattern pool line still carries `PATTERN_ATR_DROPS` and `PATTERN_EVAL_ERRORS`.

## Results (CC-B Step 7, read 2026-10-10 21:23-21:30Z; `/var/log/dawntrader/out.log`, which starts at the 20:53:31Z rotation and so holds both sides of the restart)
**Deploy:** `dt-deploy` OK — record `sha=fe830d69c…`, `deployed_at` 21:21:08Z, `deployed_by_claimed=cc-b`, engine resumed, identity asserted; **`pm_uptime` 2026-10-10T21:20:58.182Z**. No migration in range (`migrate` ran, 673 ms, nothing to apply). Staging worktree: the live `phase9_predictive-learning.json` and 5 `reports/` files were copied to `/home/deploy/preserved-20261010T212030Z`, stashed, and popped after — 6 of 6 sha256 equal to the copies.

| read | result |
|---|---|
| 1. identity | PASS — as above |
| 2. heartbeat line (Langston's Step-8 ask) | PASS — first line after the restart: `2026-10-10 21:22:01 … rows_persisted_60s=467 ticker_snaps_60s=update:0,snapshot:468,other:0 symbols_updated_60s=0`. **This is the r4 fix measured live:** the reconnect replayed one snapshot per symbol (468) and none counted as updating (T=0); next minute `update:0,snapshot:0,other:0`, T=0 (venue shut) |
| 3. no page from the restart | PASS — **before** (old code, 20:54-21:20Z): 27 sweeps read `verdict=thin` on the shut Saturday venue. **After:** all 4 sweeps so far read `verdict=closed`; **16 of 16** xStock skip streaks logged `[VENUE_QUIET][STANDING] … verdict=closed (T=0) — joins the standing record, no page` (11 with `families=quiet_market+book_state`, 5 `quiet_market`); `newEscalations=0` on all 31 sweep lines in the file. Alerts created since the restart: **1**, the info-level standing record (`venue-quiet-paper-xstock_spot`, 16 members) — no `price-skip` row (the last one is 18:38:07Z) |
| 3b. the old pages | the first sweep resolved **5** — CRCL, NOC, PLTR, RCL, MRVL, each with its re-priced position id as evidence (the restart's snapshot gave them a fresh mark). The **8 mixed-basis rows** (ORCL, GEV, CRWD, KKR, UNH, AMAT, COPX, MCD) stay active: their book-state check refuses before the engine notes a price, so they cannot clear while the venue is shut — Langston's 18:20Z mechanism, routed to row 3a1/`#679`, left active by his ruling |
| 4. pattern pool (row 2a) | PASS — 59 of 59 pool lines since the restart carry `[PATTERN_ATR_DROPS] 0` and `[PATTERN_EVAL_ERRORS] 0` |

**Not yet readable:** a weekday — the r4/r5 rule's `quiet` / `not_quiet` / `thin` arms in session and after hours (the venue reopens Sunday 20:00 ET = Monday 00:00Z).

## Second deploy, before the 00:00Z reopen — `28121f958` (r6 + r6b + the evidence-token condition)
**From (rollback target):** `5da17e02c25d78dec0bbc4690e9c45e58b400b7c` (CC-C, `deployed_at` 2026-10-10T21:58:27Z, which contains `fe830d69c`). **Range `5da17e02c..28121f958`, runtime files:** `active-execution-engine.ts` (the sweep line's `held=`), `venue-quiet-alerting.ts`, the 3a1 test file — row 3a1 only; no migration, no lockfile change. **Review:** Langston cleared r6+r6b at `19639663e` with one in-commit condition, met at `28121f958`. **Why now:** the progress report's pre-registered criteria (amendments 1-2) read the Monday reopen on r6b; a deploy after 00:00Z would void that window.
**Step 7 reads:** the sweep line carries `held=N[SYM:fam+fam,…]`; the 16-member standing record shows its blockers by family set; no `price-skip` mint from the restart; `pm_uptime` recorded as the progress report's re-anchor.

**Deployed** `71c8a2210e5434310df1771f1869e9cd42aade17` (= `28121f958` + a docs-only commit; CI on `28121f958` was cancelled by that push, so the deploy sha is the one with the green run: `38094196875`, TypeScript Check / Test Suite / Build / Docker Build each success). `dt-deploy` OK, `deployed_at` 23:17:54Z, **`pm_uptime` 2026-10-10T23:17:43.835Z** — the progress report's re-anchor. Staging files set aside to `/home/deploy/preserved-20261010T231726Z` and restored, 6 of 6 sha256 equal.
**Step 7 (first sweep, 23:17:48Z):** `[VENUE_QUIET][SWEEP] mode=paper T=0 verdict=closed … newEscalations=0 unmatchedKeys=0 held=16[ORCL/USD:quiet_market+book_state, GEV/USD:quiet_market+book_state, …]` — the field prints each member's family SET (r6b BLOCKER-1 measured live). Alerts created since the restart: **0**.

## Third deploy — `e5e017ef4b72c3ea4543075a5a8ef1a60504b8bd` (3a1 r6c), 2026-10-11 Sunday, under `closed`
**Pinned below** the `B-ENTRY-DISTANCE-GUARD` Step-3 code (`c285745e9`, at Step 4) on Langston's instruction — `dt-deploy` resets to the named sha, so descendants are excluded. Range from the running `71c8a2210`: 3a1 files only (`active-execution-engine.ts`, `venue-quiet-alerting.ts`, the test), no migration. CI `38095663279`, 4/4 per job. Rollback target `71c8a2210`. The r6c condition commit (`3829b68a6`) sits above the row-59 code and rides the next deploy.
**Deployed** `deployed_at` 2026-10-11T00:52:41Z, **`pm_uptime` 2026-10-11T00:52:31.185Z**; staging files set aside to `/home/deploy/preserved-20261011T005213Z` and restored, 6 of 6 sha256 equal.
**Rehearsal (Langston's pre-registered expectations, read 00:55:53Z):** the standing record `68075647` — **16 of 16 `listedAtMs` unchanged** against the snapshot taken at 00:52Z before the deploy (21:22-23:19Z values); each member `lastJoinedAtMs` in the restart burst (00:53:34-00:53:54Z), **`joins = 1` on all 16**, **`suppressedPages = 16`**; sweep `T=0 verdict=closed newEscalations=0 held=16`; **0 alerts** minted since the restart. `lastPricedAtMs` absent on all 16 — expected: this build predates the r6c condition.
**Two record notes (Langston, accepting the rehearsal 2026-10-11):** (1) one sweep at 00:53:36Z reads `held=11` — taken between the 11 mixed-family joins (00:53:34-35Z) and the 5 pure `quiet_market` joins (00:53:53-54Z): a mid-fill snapshot, not a drop. (2) `lastPricedAtMs` is absent on all 16 current members (they joined under a build without it), so after `3829b68a6` deploys a fresh process re-joins this cohort with nothing in process and nothing on the row, and the duration page's clock falls to `listedAtMs` — for these 16 that still under-reads (their listing, 2026-10-10 23:18Z, is later than their last real price), so it stays a lower bound. **The carry binds members joining under the new code; it does not retro-fit the held cohort.**

## Fourth deploy — `fdcaff411` (row 59 increment 1 + the 3a1 r6c condition), Sunday 2026-10-11, under `closed`
**From (rollback target):** `e5e017ef4b72c3ea4543075a5a8ef1a60504b8bd`. **Runtime commits in range `e5e017ef4..fdcaff411`, all CC-B, all reviewed:** `c285745e9` (B-ENTRY-DISTANCE-GUARD Step 3), `42f56e063` (its Step-4 r2), `fdcaff411` (its r2 condition) — Langston APPROVED r2 with the condition, met in `fdcaff411`; `3829b68a6` (3a1 r6c condition — Langston: condition DISCHARGED). No migration, no lockfile change. Avoids 02:10-02:30Z.
**What the restart does:** the 3a1 standing record's members re-join (as at 00:52Z) — `listedAtMs` must again be unchanged; the carry (`lastPricedAtMs`) binds only members joining under this code, so the held cohort's clock still falls to `listedAtMs` (a lower bound for them).
**Step 7 reads:** row 59 — the `[ENTRY_GEOMETRY][SHADOW]` line on the first taker open after the restart (crypto, the xStock venue being shut), an `entryArm` stamp on its admitted archive row, `ENTRY_GEOMETRY` in `/api/diagnostics/rtb-metrics`; 3a1 — `listedAtMs` unchanged on all 16, no `price-skip` mint.
**Deployed** `a52f16a5263fd146cfe8f5cbad961d67b9cf28b7` (= `fdcaff411` + the declaration commit; the run on `fdcaff411` was cancelled by that push, so the deploy sha is the one with the green run: `38101871492`, Build / TypeScript Check / Test Suite / Docker Build each success). `deployed_at` 01:30:39Z, **`pm_uptime` 2026-10-11T01:30:29.047Z**; staging files set aside to `/home/deploy/preserved-20261011T013012Z` and restored, 6 of 6 sha256 equal.
**Step 7 (read 01:34:01Z):** 3a1 — the standing record's 16 members keep 16 distinct `listedAtMs`, min/max 1791674327138 / 1791674349527, **identical** to the pre-deploy snapshot; `joins = 2` on all 16; `suppressedPages = 32`; **`lastPricedAtMs` present on 5** (the five pure `quiet_market` members priced off the restart's snapshot frames before re-joining — the carry working on its first live join); sweep `closed`, `newEscalations=0`; **0 alerts** minted. Row 59 — **0 `[ENTRY_GEOMETRY][SHADOW]` lines so far: no taker open has happened since the restart** (the xStock venue is shut; crypto opens are a few a day) — a zero with no opportunity, not a reading; a background watch reads the first line when it lands.
