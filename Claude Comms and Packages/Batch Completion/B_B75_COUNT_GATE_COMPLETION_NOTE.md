# B-B75-COUNT-GATE (hotfix, #1195) — COMPLETION NOTE

**Class:** `hotfix` (Kyle-directed 2026-10-16) · **Owner:** CC-A · **Scope:** `Claude Comms and Packages/Scope Files/B_B75_COUNT_GATE_SCOPE.md` · **Deployed:** `b678ef0f695447d5666f448568cb1e4f711f0ca7`, 2026-10-16T09:45:18Z

## What broke
The nightly B75 sweep copied each old day to warm storage, then dropped the original. The copy skipped the rest of any group of rows sharing one timestamp at each 1,000-row page boundary. Nothing counted the source, so the short copy verified and the original was dropped.
- Measured on the 09-16 children before the fix: `crypto_perp_ohlc_1m` 240,000 of 264,960; `signal_eval_archive` 2,235,422 of 2,284,067.
- The page rule dates from `565b605f0` (2026-05-06).

## What was done
- **r1:** a same-snapshot source count in both export modes; any difference throws before COMMIT, so nothing is uploaded, dropped or deleted; the cursor is carried as database text.
- **r2** (Kyle: "handle it all in one operation"): each boundary tie group is read whole by equality, so copies are complete the same night.
- **Sweep alert:** a count mismatch is named as one, not called transient.

## How it was verified
1. Four new tests, each mutation-proved; 54 of 54 B75 tests pass.
2. A read-only run of the changed exporter on staging against the 09-16 children: source = exported = file lines for all four.
3. **Coltrane** PROCEED at exact ref `97233c2ba` (Kyle routed it to him while Langston's queue was about 116 deep). **Langston** gave a second-pass PROCEED.
4. CI 4/4, run `38882226794`; staging blobs equal the deployed sha.
5. **The same instrument that showed the defect — the 2026-10-17 02:15Z sweep log:** every 09-16 child dropped, `failed=0`. The log's `rows=` is the EXPORTED count only, so the equality to the source rests on: the in-snapshot gate not firing; the 10-16 read-only proof (item 2); and Langston's independent derivation for the one-minute bars (184 symbols x 1,440 minutes = 264,960 on the hot neighbouring days, against 27 earlier nights at exactly 240,000).

| table | before (nightly) | after |
|---|---|---|
| `crypto_perp_ohlc_1m` | 240,000 | 264,960 |
| `signal_eval_archive` | short | 2,284,067 |
| `crypto_perp_ticker_snap` | short | 1,475,260 |
| `xstock_spot_ticker_snap` | short | 2,912,818 |

The run reported `failed=0`.

## What Langston said
PROCEED (r1, 10-16 11:08Z) with four findings recorded on `#1195`; second-pass CONFIRMED (12:08Z); **close CONFIRMED 2026-10-17 02:37Z**, re-derived from the log and the hot neighbouring days. Three close findings: (1) this record's wording, fixed here; (2) persist the source count beside `row_count` so completeness can be re-checked later, added to `B-B75-EXPORT-COMPLETENESS` as OBJ-7; (3) the task-list row below.

Earlier: Three were moot under r2 (the hold-back no longer happens). F2 (the sweep alert's dedupe key) and F4 (the plain lane's catch wording) are in `B-B75-EXPORT-COMPLETENESS`.

## Left open (owner CC-A, placed)
`B-B75-EXPORT-COMPLETENESS` (`#1195`, `SPRINT_TO_LIVE_PLAN.md` §0a stage 3). **Kyle decided 2026-10-17 to recover nothing** (option 3). The batch now owns:
- the per-object gap register for warm objects archived 2026-05-06 → 2026-10-16;
- the per-table key census;
- F2 and F4.

## Governance ledger (class `hotfix`)
| tier | document | verdict | one line |
|---|---|---|---|
| T1 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-10-16-A |
| T1 | the four session task lists | ✅ mine / N/A — not mine ×3 | CC-A: the hotfix moved to closed with Langston's 02:37Z confirm |
| T1 | COMPLETION_REPORT | ✅ | this note |
