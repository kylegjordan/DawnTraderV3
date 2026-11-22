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

### 3. `token-watch/summary.py` — condition 2, `_follow_up_lag_s` docstring
New baseline: about one run length (~1-1.3 h). Measured: the live published file today carries
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
`test_p10_tier_tail` 29/0 · `test_summary` 41/0 · `test_p7_obs_fold`, `test_p7_states`, `test_p4_lock`,
`test_p5_error_requeue`, `test_p7_birth_stamp` exit 0. Full run on the laptop: 32 of 38 exit 0; the other 6 fail
identically at HEAD with this change stashed (Windows file locks, box-only paths) — not this change.

## Judgement calls to attack
1. **Render vs drop** — rendered in the header line, not in the rose banner, so it shows when healthy too.
2. **The 2 h threshold kept** — 40 min margin at the measured worst run; a run over 80 min shrinks it.

## Discharge plan (after PROCEED)
Install `follow_up.py` + `summary.py` on staging; read `summary.json` mtime − `generated_at` across a day — expect
~60 min → seconds, today's 62m42s as the positive control; quote one :12 skip line with a fresh age; then resolve
07eba4b2 with that evidence (never acked).
