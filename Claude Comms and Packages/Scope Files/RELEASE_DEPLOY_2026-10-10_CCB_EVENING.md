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

## Results
*(filled in at Step 7)*
