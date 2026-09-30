# RELEASE DEPLOY 2026-10-02 — PREPARATION NOTE (CC-B)

**What this is:** the one staging deploy that ends the `B-XSTOCK-FEE-CONTRACT` hold (`GOVERNANCE_EXCEPTIONS.md`, the `deploy-hold` row). Staging has been held at `bc199185e` since 2026-09-22T14:38:49Z. **Not before 2026-10-02T20:10Z**, and only after the fee window's final reading is recorded.
**Prepared 2026-09-30 at review-branch head `dea5f554a` (535 commits past `bc199185e`). Every figure below is re-derived at the RELEASE sha before the deploy; nothing here stands in for that re-run.**

## 1. The release sha
To be named on 10-02. It is the review-branch head at that moment, **after** every owner in §4 has said their must-land commits are in. Nothing is deployed from a topic branch.

## 2. Langston's release condition (2026-09-30) — the checks, as command results
Run `git merge-base --is-ancestor <sha> <release>` for each sha, and quote the exit code for each one in the deploy note (0 = included).

| sha | what it is | at `dea5f554a` |
|---|---|---|
| `f07c86c37` | `B-BOOK-STATE-RESTART-DURABLE` Step 3 (`#1066`) | exit 0 |
| `f33731a2f` | same batch, Step 4 r2 | exit 0 |
| `d7d8d509d` | same batch, Step 4 r3 | exit 0 |
| `94b80463f` | same batch, Step 4 approved | exit 0 |
| `c7f90c2fd` | `B-REST-SIDES-TO-CACHE` inc 1 — the Kraken REST keys `ZGBPZUSD`, `XETCZUSD` (`#1056`) | exit 0 |

**Why it matters:** `#1066` fires on a restart. The hold has meant no restarts, and that is the only reason it has not fired. A release that restarts without the fix would arm it.
**Also in the deploy note:** `9acca871-02a9-4134-a9e4-8b6b41e4369e`, the drift gate's UNDECIDABLE row, is minted only while the changed-file list sits at its 300 cap, and it does not clear itself. **It will still be open after this deploy.** That is expected, not unresolved drift. Do not ack it.

## 3. Database changes the deploy will apply (`MANIFEST.txt` order; `dt-deploy` migrates before the restart)
| # | forward file | batch | rollback file (in git) |
|---|---|---|---|
| 1 | `2026-09-24-b-book-state-restart-durable.sql` | B-BOOK-STATE-RESTART-DURABLE | `…-rollback.sql` |
| 2 | `2026-09-29-f-g-1-ohlc-arrived-at.sql` | F-G-1 reopen (`#1031`) | `…-rollback.sql` |
| 3 | `2026-09-29-b-sizing-p5-guardrail-pct-range.sql` | B-SIZING-DEC-RESTORE | `…-rollback.sql` |
| 4 | `2026-09-29-b-sizing-inc2a-retire-max-open-positions.sql` | B-SIZING-DEC-RESTORE | `…-rollback.sql` |
| 5 | `2026-09-29-b-sizing-inc3-paper-size-band.sql` | B-SIZING-DEC-RESTORE | `…-rollback.sql` |
| 6 | `2026-09-29-b-sizing-inc2c-retire-portfolio-risk.sql` | B-SIZING-DEC-RESTORE | `…-rollback.sql` |
| 7 | `2026-09-30-b-sizing-inc2e-retire-split-and-pattern-cap.sql` | B-SIZING-DEC-RESTORE | `…-rollback.sql` |

**Rollback of the whole release:** re-deploy `bc199185e`, and run the rollback files in **reverse** of this order (7 → 1). Each owner confirms that their rollback is safe to run after data has been written under the new schema.

## 4. Batches whose code ships in this release — each owner owns its own Step 7
| batch | owner | what the owner is asked for BEFORE 10-02 20:10Z |
|---|---|---|
| B-SIZING-DEC-RESTORE (29 code commits, 5 migrations) | ANALYST Claude | anything that must land first; any manual step after the deploy (the `PAPER-RESET-3000` script is a separate run, not part of `dt-deploy`); the exact post-deploy check |
| B-PRICE-SIDE-BY-JOB 8a-P4c | ANALYST Claude | which increments must be on the review branch before the release (inc 3 is on `migration/ci-cc-c-8a-p4c-inc3`) |
| B-BOOK-STATE-RESTART-DURABLE · B-REST-SIDES-TO-CACHE · F-G-1 reopen · B-OHLC-FRAME-GUARD · B-XSTOCK-BID-TRIGGER-RELAND · B-GUARDRAIL-FAIL-CLOSED | ANALYST Claude | post-deploy checks (the book-state Step-7 reads are pre-registered in its approval) |
| B-CHAPLET-OFF-HOTFIX (`53045a6d7`, the code unmount) | Infra Claude | confirm the edge block stays after the app unmounts the route |
| B-GOV-REPORTING | OLD Claude | none expected; confirm |
| B-FEED-MISMATCH-FIX window, B-XSTOCK-FEE-CONTRACT | NEW Claude | the release itself; the fee window must be closed and read first |

**NOT delivered by this deploy:** the `comms-infra/` changes in the range (`dt-api`, `dt-install-drift`, the staging systemd units, the Helsinki scripts). `dt-deploy` does not install them (`#1004`). Infra Claude installs its own.

## 5. Order on 10-02
1. 20:10Z: the fee window's final reading is recorded (the `B-XSTOCK-FEE-CONTRACT` report).
2. Each owner has confirmed §4 in `#general`. **An owner who has not answered holds the release**; a timeout is not consent.
3. Name the release sha; re-run §2 and quote its exit codes; re-read §3 at that sha.
4. `dt-deploy <40-char sha> --by cc-b`. Then the engine resume check.
5. Each owner runs their own Step 7, in `#general`.
