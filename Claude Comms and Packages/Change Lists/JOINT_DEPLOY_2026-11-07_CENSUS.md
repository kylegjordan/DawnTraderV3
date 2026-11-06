# Joint deploy after 2026-11-07T13:03:42Z — DRY-RUN CENSUS (CC-C, the runner)

**Why:** `GOVERNANCE_EXCEPTIONS.md` deploy-hold row of 2026-11-05T19:49:00Z — staging is held at `0f4835b5a` until 2026-11-07T13:03:42Z (plan row 59a's window), then ONE deploy of the head, run by CC-C; every runtime commit must carry its owner's Langston PROCEED and CI 4/4. OLD Claude asked for this census (Discord `1568234419448316036`); Langston set the binding form (Discord `1568229733714497568`).

> ⛔ **THIS IS A DRY RUN against head `f47a07332` (2026-11-06 ~12:05Z).** The binding print is redone **after the final push, against the sha actually deployed**: `git merge-base --is-ancestor <approved-sha> <deploy-sha>; echo $?` per approved commit (a non-ancestor is a STOP, not a re-cite), CI read per job at the deploy sha, and the migrations below confirmed applied as the first post-deploy read.

## Range
`0f4835b5a..f47a07332`: 453 commits; **51 runtime files** (`server/`, `shared/`, `client/`, `scripts/`, `drizzle/`, tests excluded), touched by 36 commits.

## Migrations — MANIFEST order (three, all dated 2026-11-05)
1. `2026-11-05-b-entry-gate.sql` — `B-ENTRY-GATE` (NEW Claude)
2. `2026-11-05-b-balance-session-pairing-block-reasons.sql` — `B-BALANCE-SESSION-PAIRING` (CC-C)
3. `2026-11-05-b-close-writer-costs-open-positions-mode.sql` — `B-CLOSE-WRITER-COSTS` (OLD Claude)
Each has its rollback file in git beside it.

## Runtime commits by batch — each owner names the sha Langston's PROCEED was given at
| batch | owner | runtime commits in range (newest first) | what it changes at runtime | PROCEED sha (owner fills) |
|---|---|---|---|---|
| `B-ENTRY-GATE` inc A | NEW Claude | `a2f14b4d7`, `db4152691`, `40cbbe742`, `4200094af`, `51068b670`, `8e7d80e02`, `9d994ddae`, `231b7108a`, `588002ef6` | entry window at the taker fill, the economic test at the price paid, VTS worse-side entry window, watch-only maker would-cancel, the three 2% target fallbacks deleted; migration 1 | `a2f14b4d7` — Langston Step-4 PROCEED (graded `c67740745`, conditions met at `a2f14b4d7`, msg `1567911217417429013`) and CI-leg PROCEED 2026-11-05 16:08Z on run `42049275277` at `9c1a65990` (descendant of `a2f14b4d7`, docs-only delta), 4/4 per job (NEW Claude) |
| `B-BALANCE-SESSION-PAIRING` | CC-C | `05cee280b`, `d4de1d733`, `e3bcb0364`, `4b54a052b` | sizing and the exposure cap read the money held; the kill switch keeps the session anchor; a refused read leaves an audit row; migration 2 | **CC-C, confirmed:** Step-4 PROCEED at `d4de1d733` (Langston `1567930379875258391`) and at `05cee280b`, the condition-(b) fold (Langston, Discord `1568243383816691775`; `guardrail-settings.ts` byte-identical at `05cee280b` and the stamped head). RIDES. (`05cee280b` is the newest of the batch's four runtime commits in range, enumerated by `git log` on CC-C's clone; Langston's own tool could not enumerate the range.) |
| `B-CLOSE-WRITER-COSTS` inc 1+2 | OLD Claude | `42a06e8d4`, `613d3df7a`, `493d233a1`, `b3583659e` | the close finds its one trade record; open positions carry their mode; migration 3 | **OLD, confirmed:** inc 1 PROCEED at `613d3df7a` (Langston `1568013302376824903`); inc 2 PROCEED at `42a06e8d4` (`1568022332541505581`); conditions discharged, CI 4/4 per job run `42113339435` at `3ffd479b3` (`1568041279575564392`). RIDES. |
| `B-DISK-FILE-TIERING` inc 6 | OLD Claude | `e43cae96e` | archival scripts and `archival-cadence.ts` (amendment 1, AP-1/2/3) | **OLD, confirmed:** Step-4 PROCEED at `e43cae96e` (Langston `1567895376227205141`), one in-commit condition folded at `c41bd612f` (test-only, no runtime file). RIDES. AP-4/5 (cold streaming) are NOT in the range and do not ride. |
| `B-STATUS-BOARD` retirement | OLD Claude | `844ca753a`, `5b9a8191e` | the phone status board's page, route and file reader removed | **OLD, confirmed:** Step-4 PROCEED at `844ca753a` (Langston `1567970027993440440`), its one condition (SIM rows marked REMOVED) at `b5f170cfb`, discharged (`1567988485317595317`). RIDES. The checker half (`review/b-status-board-retire-c1`) is NOT on the head and does not ride. |
| `B-XSTOCK-BAR-AVAILABILITY` Step-9 R2 | CC-C | `7acff9be6` | the graded window's start re-registered (governed row `graded_window_start` → 2026-11-09T00:05Z, gate literal moved with it); read only by the manual capacity gate, zero runtime readers (Langston's grep); migration 4, LAST in MANIFEST order | **CC-C, confirmed:** Step-4 PROCEED at `7acff9be6` (Langston `1568374387269435422`, 2026-11-06); CI: its own runs were cancelled by the next push — rule 19 is satisfied at head `10ecbc0b8` (4/4), with all five files byte-identical (Langston `cmp`) |

**Comment-only or non-app changes in range (checked: no code lines changed):** `server/core/logging/vts-telemetry.ts` (`9b0e047ba`), `server/asset_classes/xstock_spot/active-dispatch.ts` (`9af40b962`), `shared/asset-classes.ts` (`7e1b3a78b`, provenance comment). Scripts outside the app's runtime: `scripts/analysis/*`, `scripts/pm/*`, `scripts/inventory/manual_extra.json`.

## What the runner does at the deploy (2026-11-07, after 13:03:42Z)
1. Each owner's PROCEED sha filled in the table above (an owner who has not confirmed = that batch does not ride; if its commits are already on the head, that is a STOP for the whole deploy).
2. Final push; then the ancestry print and CI per job at the deploy sha.
3. `dt-deploy <full-40-char sha> --by cc-c`; first read: the ~~three~~ **four** migrations applied, in MANIFEST order (`b-entry-gate`, `b-balance-session-pairing-block-reasons`, `b-close-writer-costs-open-positions-mode`, then `b-xstock-bar-availability-window-rerun` last; Langston measured 4 pending against staging `_migrations`); then ENGINE RESUMED.
4. Name OLD and NEW in channel; the deploy-drift rungs clear on their own. **Audit them BY ID at the clear (Langston 2026-11-06):** rung 1 `e4b0d52a-bd6e-41a9-92e7-4ef15ea07481`, rung 2 `d911da3d-44c9-417e-8e17-e4fd159b53c8`, rung 3 `5e760b86-0a29-4d32-b49c-453c93bac97f` (rung 4 added here if it mints before the deploy) — each must read `resolved` after the deploy. *(Line added by NEW Claude.)*
