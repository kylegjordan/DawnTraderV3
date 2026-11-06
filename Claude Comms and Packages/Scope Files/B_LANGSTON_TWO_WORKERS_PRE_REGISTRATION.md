# B-LANGSTON-TWO-WORKERS — PRE-REGISTRATION (the KD-44 observation)

> **Committed BEFORE any baseline figure of any measure below is computed** (Langston, Step 1 attack 3: a retrospective baseline is visible to whoever sets the bands, so the bands are fixed first). This file's commit sha is named in the progress report. **Append-only after commit:** a change is a dated AMENDMENT below, never an edit, and an amendment written after a baseline figure was read says so.
> Scope `B_LANGSTON_TWO_WORKERS_SCOPE.md` r2 OBJ-7 · pre-audit r2a P8 (`1e29bdb38`) · issue `#1248`. Kyle, KD-44: *"Need to observe how well it works and if the quality of the reviews is impacted."*
> **What has been read before this commit, stated so it is not mistaken for a peek at a measure:** daily ARRIVAL counts (session/Kyle text and alert posts to Langston, inbox log, 10-20 → 11-06), which are the day-selection variable below, not a measure; and the pack's 11-05 wait figure (median 70 min, n=163), which is the log's positive control, not a baseline.

## 1. The instrument
- `/var/log/langston-tasks.jsonl`, one line per handled task, written by the bridge (`record_task`): message id, post time (from the Discord id), start, end, worker, lane key, class, kind, outcome (`reply` / `silent_voice` / `circuit_breaker` / `bridge_error` / `timeout` / `post_failed` / `worker_error` / `unknown`), reply length.
- **Overlap**, per task: another task's [start, end] intersects this one's. Computed from the log alone.
- **Positive control (must pass before the baseline counts):** the log's text-post median wait on a qualifying day is reproduced against the journal's `handling msg` lines for the same messages to within 1 minute, task for task, on at least 20 tasks. If it does not, the log is fixed before anything is measured.

## 2. Which days count — on ARRIVALS, derived, not chosen
- **A qualifying day (UTC) has at least 80 session/Kyle text arrivals to Langston** (inbox `langston_inbound`; alerts excluded).
- **Derivation:** at the pack's mean invoke of 5.9 min, 80 arrivals is ~7.9 h of work in a 24-h day, a single-worker load of ρ ≈ 0.33, where an M/M/1 wait is about half an invoke (ρ/(1−ρ) × S ≈ 2.9 min) and rising steeply. Below that a single worker barely queues, so a second one has nothing to relieve and the day measures nothing. 10-20 (49, ρ ≈ 0.20) and 10-21 (32, ρ ≈ 0.13) are real working days and are excluded for that reason, not because they are quiet. The same rule selects after-window days.
- **Lane diversity, reported per window beside every result** (Langston, attack 2): distinct lane keys per day, the share of each day both workers were busy, and the share of people-class tasks in the shared lane. A null result with little diversity reads as "no contention to relieve", not "two workers do not help".

## 3. Windows
- **Install with the one-worker flag SET.** The baseline is the first **3 qualifying days** after install, on one worker.
- **⛔ The fallback is the LIKELY path, stated now:** over the 18 days 10-20 → 11-06 (inbox log, read 2026-11-06), two days qualify (11-04 with 90, 11-05 with 201). If 3 qualifying days have not accrued within **14 calendar days** of install, the wait baseline is the pack's 11-05 figure plus whatever qualifying days exist, the progress report says so, and the switch-on proceeds. **What the fallback may claim:** with one or two days per side, the wait comparison supports a DIRECTION only, never a size.
- **After-window:** 7 calendar days from switch-on, measured on its qualifying days.
- **Quality baselines (q1)-(q4)** are read retrospectively from qualifying days in the 14 days before install.

## 4. The measures and the decision
| # | measure | population | rule |
|---|---|---|---|
| W | median wait (post → start) of session/Kyle text tasks | qualifying days | **PASS: under 20 min on the first qualifying day after switch-on**; 7-day median reported beside it |
| q5 | invoke health: `bridge_error` + `timeout` + `worker_error` outcomes; mean invoke time | overlapped invokes, every day (not only qualifying) | **STOP (absolute)**: more than 3 such outcomes in a UTC day AND more than 5 % of that day's invokes; or the mean overlapped invoke over 600 s on a day with ≥ 20 overlapped invokes (the pack's mean is 355 s, its max 882 s) |
| q6 | degraded invokes: `post_failed`, a reply under 40 characters to a gate dispatch, a self-advance whose item was parked for a missing marker | every invoke | **STOP (absolute)**: 3 or more in a UTC day |
| q1 | Coltrane blind second pass: must-fix items he raises that Langston did not | 8 Step-2/Step-4 verdicts per side: after = the first 8 OVERLAPPED gate verdicts in message-id order; before = the last 8 gate verdicts on baseline-rule days before install, in message-id order | **FAIL if after exceeds before by 3 or more**. Coltrane gets the dispatch text and the ref, never the verdict. One-sided: agreement is not scored |
| q2 | sent-back rate per gate type | all gate verdicts, both windows | **descriptive only** (confounded by which batches landed) |
| q3 | findings per review (numbered conditions, must-fixes, blockers) | all gate verdicts | **descriptive only** |
| q4 | later-caught misses: a defect found at Step 7+ or after close in work a gate passed | gates in both windows | **read at day +21**, reported; not graded |
- **PASS = W met AND no q5/q6 stop tripped AND q1 not failed.** A q5/q6 stop sets the one-worker flag at once (any reader may, §5); a q1 fail sets it at the day-7 read. Either goes to Kyle through PM with the numbers.
- (q2)-(q4) are reported, not graded.

## 5. Readers — minted at switch-on, owner CC-INFRA, each resolved at the read with evidence, never acked
On the staging box, as `deploy` in the app directory, at switch-on time T:
```
npm run system-alerts -- add --triggers-at <T+3d> --category observation --severity warning \
  --title "B-LANGSTON-TWO-WORKERS day-3 read: q5/q6 stops" \
  --body "Read /var/log/langston-tasks.jsonl on Helsinki; apply the q5/q6 STOP rules in Scope Files/B_LANGSTON_TWO_WORKERS_PRE_REGISTRATION.md; on a stop run 'langston-bridge-flag one-worker on --by cc-infra'. Owner CC-INFRA. Resolve with evidence, never ack."
npm run system-alerts -- add --triggers-at <T+7d> ... --title "B-LANGSTON-TWO-WORKERS day-7 read: W, q1-q3, q5, q6" ...
npm run system-alerts -- add --triggers-at <T+21d> ... --title "B-LANGSTON-TWO-WORKERS day-21 read: q4 later-caught misses" ...
```
The exact commands run, with their returned ids, are recorded in the progress report.

## AMENDMENTS
- **A-1 (2026-11-06, Step 4 part 1, Langston; written BEFORE any baseline figure — the install has not happened):**
  - the outcome vocabulary gains **`voice_failed`** (a voice transcription that failed; that exit had recorded `unknown`);
  - **the wait test is read against the shared-lane share.** Langston measured, over the 347 text arrivals of the 14 days to 11-06 (inbox log; his per-day counts reproduce §2's 90 and 201): **46.4 % key to the shared lane**; of 283 consecutive arrivals ≤ 10 min apart, 190 (67.1 %) were in different lanes, and 69 of the 93 that would serialise were shared-lane. So a miss on W is reported beside the after-window's measured shared-lane share and must not be read as "two workers do not help"; the shared lane is the residual bottleneck. (`alert_key` returned None on 0 of 630 alert arrivals, so the per-message alert fallback is a fence, not a live path.)
