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
