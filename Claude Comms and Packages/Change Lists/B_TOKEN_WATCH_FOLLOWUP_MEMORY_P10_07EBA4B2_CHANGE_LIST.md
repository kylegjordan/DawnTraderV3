# B-TOKEN-WATCH-FOLLOWUP-MEMORY P10 — 07eba4b2 summary stamp — Step-4 change list

**READY AT:** `9475e08790018e5b20da6a08aad1876fba11461f` on `origin/migration/aws-supabase`.
**Ruling being implemented:** Langston `1574004423271649361` — PROCEED on (a), call-site form, three conditions.

## Dispatch header (workflow-04)

| # | field | value |
|---|---|---|
| i | DECLARED CHANGE-CLASS | `non_architecture` (scope header, `B_TOKEN_WATCH_FOLLOWUP_MEMORY_SCOPE.md:15`) |
| ii | DOC SET, non_architecture | SCOPE — present, `Scope Files/B_TOKEN_WATCH_FOLLOWUP_MEMORY_SCOPE.md` · PRE_AUDIT — present, `Scope Files/B_TOKEN_WATCH_FOLLOWUP_MEMORY_PRE_AUDIT.md` · COMPLETION_REPORT — absent, batch in P10 observation (Step 9), written at Step 11 · BATCH_CATALOG, PHASE_HISTORY — owed at Step 10 · SYSTEM_MANUAL — judged N/A, token-watch is not trading architecture · SYSTEM_IMPACT_MAP — judged at Step 10 (Layer 9 token-watch entry; a timing fix, no new component) · the rest judged at Step 10 |
| iii | STEP-2 REFERENCE | `Scope Files/B_TOKEN_WATCH_FOLLOWUP_MEMORY_PRE_AUDIT.md`; this is a P10 iteration fix (Step 9 loop) under that audit, ruled on by `1574004423271649361` |

## The change (4 files, +45 −7)

### 1. `token-watch/follow_up.py` — the call site
```diff
         try:
-            stats["summary"] = {k: v for k, v in summary.build(now).items()
+            stats["summary"] = {k: v for k, v in summary.build(_clock()).items()
                                 if k in ("generated_at",)}
```
Comment added above it: cause, the 62m42s measurement, and **the exit-4 pairing**: the same clock feeds
`label_states` → `job_fault_exit_code`; safe because the lookback is `_hours_back(now, 3 * cycle_s)` (≥ 3 h), so
only a verdict already one bucket from flipping moves. `build(now)` stays injectable; every fixed-clock test and
double is unchanged.

### 2. `token-watch/summary.py` — condition 1, the `SKIP_STALE_AFTER` comment (BEFORE → AFTER)
BEFORE: *"follow-up publishes at ~:45-:50 … a normal skip sees a ~25-min-old file and the first page lands on the
third missed publish"* — false since the follow-up became back-to-back.
AFTER: publishes at the END of each run, stamped at publish time; runs 63-80 min back to back (journal 2026-11-22:
07:39:16→08:56:25 = 77 min, 08:56:25→09:59:08 = 63 min); a skip at :12 sees a file at most one run old, a 40-57 min
margin to 2 h; **NOT widened**; residual stated — a page is ambiguous between a missed publish and a single run over
2 h, and `store.last_refusal()` (`store.py:219`) names the holder.
**Population, corrected at Step 4 (Langston):** 63-80 min is the 3-run journal of 2026-11-22 only. This change list's
own record has ~95-min runs (`:841`) and one 3 h 01 m 28 s run (`:845`), so the 40-57 min margin is today's, not a
design margin, and the stated residual has already happened once. The comment now says so.

### 3. `token-watch/summary.py` — condition 2, `_follow_up_lag_s` docstring
~~New baseline: about one run length (~1-1.3 h).~~ **Corrected at Step 4 (Langston C-1):** the gauge is
`run_length + run_start_minute − 60 min`, a healthy band of ~3-79 min (Langston: L ∈ {63, 71, 80} × m ∈ {0..59});
it leaves the band only when the follow-up skips or the timer builds alone. +3548 s is the top of the band
(m=56, L=63). Measured: the live published file today carries
`follow_up_lag_s = -214` at `generated_at 08:56:25Z` with the cursor's consumed hour ending 09:00Z — negative, as
ruled. Rebuilt at 09:59:08Z the same cursor gives +3548 s.

### 4. `client/src/pages/token-watch/TokenWatchPage.tsx` — condition 3, rendered
Beside "Updated …": *"· checks read through N min before this update"* (≥ 2 h shown in hours; ≤ 0 "the current
hour"). Rides the next app deploy; the field had a type at :66 and no reader.

### 5. `token-watch/tests/test_p10_tier_tail.py` — T10, the fence
`s_build` records the `now` it receives. T10 drives `run_hour(08:56)` with the clock at 09:59 and asserts the build
got 09:59 and the published stamp is 09:59. **Mutant** (revert to `build(now)`) → exit 1, `FAIL T10 … [08:56]` —
killed; restored.

## Tests
`test_p10_tier_tail` 29/0 · `test_summary` 41/0 on the laptop with 2 skipped (the two directory-mode checks; NTFS reports 0o777), **43/0 on the box** (corrected at Step 4) · `test_p7_obs_fold`, `test_p7_states`, `test_p4_lock`,
`test_p5_error_requeue`, `test_p7_birth_stamp` exit 0. Full run on the laptop: 32 of 38 exit 0; the other 6 fail
identically at HEAD with this change stashed (Windows file locks, box-only paths) — not this change.

## Step-4 ride-along (Langston PROCEED at `9475e0879`, no new review round)
- **C-1** — `_follow_up_lag_s` docstring rewritten to the formula and band above.
- **C-2** — the second 2 h reader of `generated_at`, `server/routes/token-watch.ts` `STALE_AFTER_MS` (the page's
  stale banner), is named beside `SKIP_STALE_AFTER`, with a comment-only cross-reference at its own definition.
  Before the fix its age just before a publish was previous run + current run (≥ 125 min), so it false-fired on
  healthy cycles; it now peaks at one run, and it changes with the token-watch install (it reads the file).
- **C-3** — 14th mutant *"the summary is stamped with the run-start now"* added to `mutate_p10_tier_tail.py`
  (anchor `summary.build(_clock())`, count 1). Harness: 14 KILLED, exit 0.
- Records: the population note and `test_summary` 43/0 above.

## Judgement calls to attack
1. **Render vs drop** — rendered in the header line, not in the rose banner, so it shows when healthy too.
2. **The 2 h threshold kept** — 40 min margin at the measured worst run; a run over 80 min shrinks it.

## Discharge plan (after PROCEED)
Install `follow_up.py` + `summary.py` on staging; read `summary.json` mtime − `generated_at` across a day — expect
~60 min → seconds, today's 62m42s as the positive control; quote one :12 skip line with a fresh age; then resolve
07eba4b2 with that evidence (never acked).

## P10 alert disposition — 2026-11-25

- **Follow-up `11d7e194-c665-48f7-bae5-1cae25fe9804` resolved.** The staging journal recorded five failed sweeps ending 2026-11-24 19:06:37 UTC through 2026-11-25 02:20:20 UTC. All eight checkpoint errors were requeued and none were abandoned. Seven subsequent sweeps ended successfully between 03:29:54 and 10:02:37 UTC with no checkpoint or stage errors. Read back the resolved row at 10:12:48 UTC under `codex-infra`.
- **Summary `6f9fa1d3-0aa6-4ac2-aa29-61fd3b5428aa` remains active.** Both installed Python files match `9ff39a260`; the 2026-11-24 21:12 UTC check saw a genuinely old publish (2 h 05 min 34 s) while the sweep that started at 19:06:37 UTC held the lock through 21:19 UTC. This exercises the long-run residual above. The next 13 hourly checks through 2026-11-25 10:12 UTC all skipped with a fresh file, with the latest age 9 min 33 s. At that check, the published stamp was 10:02:26.823 UTC, about 11 s before file mtime, and the checkpoint lag was 3,746 s. Keep the row open for the existing P10 observation to determine whether publish cadence has settled. Journal sources are `token-watch-followup.service` and `token-watch-summary.service` on staging.

## P10 follow-up warning `5f9268f4` — 2026-11-25 UTC

- **Cause.** The sweep that ended at `23:10:16Z` exited 1 after a single DexScreener HTTP read timeout on a 24h checkpoint. The sweep processed 4,302 due entries and recorded 3,973 observed checkpoints, one observation error requeued, zero abandoned and no stage errors. The `21:57:14Z` traceback and the sweep's own result tie the warning to that read. The sweep also published at `23:10:05.009Z`. The separate credit projection warning was shedding liquidity.
- **Exact recovery evidence.** In the November 25 observation file, mint `GaqUAWL2w9jD1RFvr5gm8fFot9FHscCvchF6dBvJXou8`, 24h age, creation `2026-11-24T21:06:54Z`, changed from an `observed=false` timeout in the `21:55:44.496Z` cycle to `observed=true` in the `23:10:16.756Z` cycle. The 22:00 UTC bucket contains the same checkpoint with `attempts=1`. These establish the retry succeeded even while the service was completing the later sweep.
- **Completed natural recovery.** The retry sweep finished successfully at `2026-11-26T00:20:12Z`. It found 5,054 due entries and recorded 3,206 observations, with zero checkpoint errors, error requeues, abandonments or stage errors. It published a new summary at `00:20:00.546Z`, then the next natural sweep started. The `00:12Z` freshness check before that publish showed age 1 h 1 min 55 s, below the two-hour limit. Together with the exact recovered checkpoint above, this is the evidence to resolve the follow-up warning by `codex-infra`.
- **Alert `5f9268f4-2fe0-4642-beb3-a5286f4ba333` resolved.** Independent staging alert-log readback at `00:23Z` confirmed terminal state, timestamp `00:23:05.533Z`, `codex-infra` via CLI, and evidence `/var/lib/token-watch/observations/2026-11-25.jsonl:55220` (the successful retry row). Disposition posted to PM and ANALYST in Discord `1575305927546896485`.
- **Phase A and P10.** The 23:12 UTC summary check saw age 1 min 55 s, below the 2 h threshold. The current exact Phase A ref and installed units leave these three Token Watch services outside the app restart. INFRA's clearance remains conditional on the original exact-ref, sweep, window-owner and preflight gates. PM and ANALYST notified in Discord `1575295740627132540`. Keep both protected Token Watch windows and the snapshot, take the freshness reading after the actual restart, and retain the seven-day read scheduled for 2026-11-27 00:05 UTC. The separate summary warning stays open for P10.
