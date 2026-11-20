# B-LANGSTON-TWO-WORKERS — PROGRESS REPORT

## OPEN — waiting on the after-window: the day-3, day-7 and day-21 reads (second worker switched on 2026-11-20T18:36:29Z)

> Batch `B-LANGSTON-TWO-WORKERS` · issue `#1248` · owner Infra Claude · plan row `SPRINT_TO_LIVE_PLAN.md` 4a · change-class `non_architecture` (scope header).
> When the reads are in and a decision has been taken on them, this file is renamed to `B_LANGSTON_TWO_WORKERS_COMPLETION_REPORT.md` (`workflow-10-governance`).
> The step-by-step evidence is in `Claude Comms and Packages/Change Lists/B_LANGSTON_TWO_WORKERS_CHANGE_LIST.md`. This report points at it rather than copying it.

## 1. What the batch is for

Kyle, KD-44: *"Need to observe how well it works and if the quality of the reviews is impacted."*

Langston answered one message at a time, so a quick question from one session queued behind a fifteen-minute review from another. This batch gives his bridge two workers that take work by **lane**. One batch's review stays in order on one lane, and different batches run side by side. The batch shipped:

- the lane queue;
- the two-worker bridge, with a shared circuit breaker and cap;
- per-review scratch directories;
- the memory-write retry;
- the operator flags `langston-bridge-flag` (drain, one-worker);
- the task log `/var/log/langston-tasks.jsonl`.

It was installed with the **one-worker flag SET**, so the first two weeks measured a one-worker baseline.

## 2. Steps done, with evidence

| step | evidence |
|---|---|
| 1 Scope | `Scope Files/B_LANGSTON_TWO_WORKERS_SCOPE.md` r2, Langston APPROVED, seven conditions folded |
| 2 Audit + plan | `Scope Files/B_LANGSTON_TWO_WORKERS_PRE_AUDIT.md` r2a at `1e29bdb38`, Langston PROCEED |
| pre-registration | `Scope Files/B_LANGSTON_TWO_WORKERS_PRE_REGISTRATION.md`, committed before any baseline figure was read; amendment A-1 |
| 4 Code review | Langston part 1 PROCEED `1568135957126058046`, part 2 PROCEED `1568140829212803113`; Coltrane concurrency pass (1)-(4) PROCEED at `dd6238954` |
| 5 CI | run `42178305136` at `f6ea3f3d3`, 4/4 per job |
| 6 Install | bridges at `06e2e8079`, restarted 2026-11-06T14:05:30Z on one worker. The P6 concurrency smoke test passed. Langston's loaded set went 143,478 → 142,325 B. Commits `a322a5a52`, `1cc3ef936`, `e05423e5a`, `9e980b42e` |
| 7 Baseline reads | 11-07 (`f3559a23f`), 11-10 (`d2f745e97`), 14-day read (`251b4a116`): the three-day gate was met on 11-14 |
| 7 Switch-on gate | dispatch `1573403067146174626`; Langston **PROCEED** `1573405021331259394` with four conditions (§4 below) |

## 3. The one-worker baseline (from the 14-day read, re-derived by Langston)

- **Qualifying days:** 11-07 (159), 11-13 (82) and 11-14 (108). Each is a count of `langston_inbound` rows in that UTC day of `/var/log/cc-discord-inbox.jsonl`, against a threshold of 80; the counting control reads 11-05 = 201. 11-16 (107) also qualified, but it falls outside the first three.
- **Text-task wait** (post → start), pooled across the three days: **n=351, median 4.63 min**. Per day: 6.29, 8.01 and 0.003 min.
- **⚠️ Langston's framing, adopted:** the pooled median is a mix of days, not a baseline. 108 of the 351 rows come from 11-14, which never queued.
  - **The tail is the quantity that matters:** **48 of 351** baseline text tasks waited **over 20 min** (27.3 % of 11-07 alone), with a maximum of 95.76 min.
  - On 11-16, 34 of 102 waited over 20 min (33.3 %); p90 47.96 min.
  - §2's "no contention to relieve" reading is therefore refuted, not available.
- **His two-worker replay** of the logged service times (an upper bound):
  - baseline over-20 count goes 48 → 4, and p90 goes 25.33 → 5.87 min;
  - on 11-16, 34 → 13. The 13 survivors are in the shared lane, the residual A-1 named.
  - Model control: the one-worker replay gives a median of 4.58 vs 4.63 logged, and an over-20 count of 47 vs 48.
- **Outcomes:**
  - text population: 345 reply and 6 timeout;
  - **all kinds: 371 reply and 7 timeout**;
  - all 18 timeouts in the log are exactly 15.0 min, the invoke ceiling;
  - replies under 40 characters: 0.
- **One worker held:** every task row before the switch-on is on `task-worker-1`, and none of the intervals overlap (796 of 796 at the 14-day read).

## 4. Langston's four switch-on conditions and how each is met

1. **The q1 BEFORE sample, enumerated before the after-side exists.** See §5.
2. **The day-7 reader says that a non-qualifying day is not a W pass.** It is in the day-7 body in §6.
3. **The flip is confirmed by read-back, not by exit code:** a `task-worker-2` row and a first overlapping interval in the task log. Recorded in §6 after the flip.
4. **The weekly usage figure is checked with PM before the flip (KD-106).** At 85 % or above, the flip waits for the weekly reset. Asked in `1573406057227755583`; the answer is recorded in §6.

## 5. q1 BEFORE sample — the last 8 Step-2/Step-4 gate verdicts on baseline-rule days before install

**Rule, written before any after-side verdict exists:**

- **Days:** the pre-registration's baseline-rule days before install, 11-04 and 11-05 (§2/§3: the only days in the 14 days before install with 80 or more text arrivals).
- **Population:** `kind == "langston_outbound"` rows dated 11-04 or 11-05 in `/var/log/cc-discord-inbox.jsonl` that do both of these:
  - carry a ruling (PROCEED, CHANGES / CHANGES NEEDED, APPROVED, SEND BACK / SENT BACK, or DISCHARGED);
  - rule on a Step-2 (pre-audit) or Step-4 (code) dispatch. A re-review that discharges that gate's conditions counts.
- **Excluded:**
  - rulings that name Step 8 or Step 11;
  - operational go/no-go calls that answer no review dispatch;
  - board-field notes that report an earlier verdict rather than rule.
- **Selection:** the last 8 by message id.

| # | message id | UTC | to | gate |
|---|---|---|---|---|
| 1 | `1568022332541505581` | 11-05 22:00:58 | OLD Claude | Step 4, increment 2 re-review: conditions DISCHARGED, PROCEED |
| 2 | `1568027617523802263` | 11-05 22:21:58 | OLD Claude | Step 4, increment 3 Part A: CHANGES-NEEDED |
| 3 | `1568029636317810811` | 11-05 22:30:00 | OLD Claude | Step 4, increment 3 Part B: CHANGES NEEDED |
| 4 | `1568031129670516767` | 11-05 22:35:56 | OLD Claude | Step 4, Part C: CHANGES-NEEDED |
| 5 | `1568034096863649823` | 11-05 22:47:42 | Infra Claude | Step 2 (card at Pre-Audit), folded pre-audit text: SEND BACK |
| 6 | `1568046395670401135` | 11-05 23:36:34 | OLD Claude | Step 4, increment 3 Part A re-review: DISCHARGED, PROCEED |
| 7 | `1568049610679656449` | 11-05 23:49:21 | OLD Claude | Step 4 re-review: GATE DISCHARGED, PROCEED |
| 8 | `1568051958571466774` | 11-05 23:58:43 | OLD Claude | Step 4, increment 3 Part B amendment at `905f5fa48`: APPROVED with two conditions |

**Excluded inside the span of the eight, with the reason:**

- `1568024554180452366`: a Step 8 ruling.
- `1568038842471288833`: a Step 11 ruling.
- `1568044465074217033`: an operational call ("let tonight's prune run"), not a gate.

Excluded just before row 1: `1568022657771905046`, a board note (Review = Approved) citing two earlier verdicts.

**Labelled `NOT RE-READ`:** the gate assignment of each row was made from the row's own text by me, with no fresh reader. Langston, or Coltrane at q1, may re-derive it from the ids. Coltrane gets each verdict's **dispatch** text and ref, never the verdict (§4).

## 6. The flip and the readers

- **Condition 4, the weekly usage figure:** PM Claude read "Weekly · all models" at **28 %**, resetting 2026-11-26 23:00Z (msg `1573406161838018747`). That is below the KD-106 85 % line, so the flip went ahead.
- **Idle check before the flip** (bridge journal, Helsinki): at 18:36:19Z the queue depth was 0 and nothing was running on either worker. The last task ended 18:32:50Z.
- **The flip:** `langston-bridge-flag one-worker off --by cc-infra` at **2026-11-20T18:36:29Z** (`T`). It printed `one-worker: on -> off (by cc-infra)`; `status` read `{"drain": false, "one-worker": false}`; the file `/etc/langston/bridge-one-worker` is gone. No restart: `_may_take` reads the flag before every take (`discord-langston-bridge.py:992-999`).
- **Condition 3, the read-back: MET, 2026-11-20T19:00:01Z.** The exit code above is not the confirmation; these rows are. Read from `/var/log/langston-tasks.jsonl` on Helsinki by `tw_readback.py` (rows with `started >= T`, T = 1795199789.5 = 18:36:29.5Z). Population: 801 rows in the file, 2 after `T`; 1 `task-worker-2` row; 1 overlapping pair. Positive control for the instrument: the same read at 18:37:45Z returned `after_T 0 worker2 0 overlap 0`, so the zero-then-one change is the flip, not a reader that always matches.
  - First `task-worker-2` row: `{"message_id": "1573408161224728628", "started": 1795200138.276, "ended": 1795200352.179, "worker": "task-worker-2", "lane": "shared", "outcome": "reply", "reply_len": 3157}` — 18:42:18Z to 18:45:52Z.
  - First overlap, its partner: `{"message_id": "1573408601089908888", "started": 1795200243.147, "ended": 1795201091.804, "worker": "task-worker-1", "lane": "batch:B-TOKEN-ECONOMY", "outcome": "reply", "reply_len": 12148}` — 18:44:03Z to 18:58:11Z. The two ran together for 109 s (18:44:03Z to 18:45:52Z), on different workers and different lanes, and both replied.
- **The three readers**, minted on staging as `deploy` in the app directory at `T`. Each has owner CC-INFRA, is resolved with evidence, and is never acked:

| reader | alert id | triggers at |
|---|---|---|
| day-3: q5/q6 stops | `5437766c-fc28-4bf2-a409-2b0d73c6d9c6` | 2026-11-23T18:36:29Z |
| day-7: W, q1-q3, q5, q6 | `ad4a3ea7-141a-4da1-9040-06bd87921f21` | 2026-11-27T18:36:29Z |
| day-21: q4 later-caught misses | `d78d017b-5724-472b-a4aa-375d90f3dd14` | 2026-12-11T18:36:29Z |

> **PREVIOUSLY STATED** (pre-registration §5): `--category observation`. **NOW:** `--category verification`. **REASON:** the alert tool refuses `observation`. The categories it will create are `ALERT_CATEGORIES` in `server/services/system-alerts.ts`, and `observation` is not among them. The first attempt with the pre-registered text returned rc=1 for all three and wrote nothing (the read-back finds exactly three rows). Only the category changed; the titles, times and owner are as registered.

**Day-7 reader body, as minted (condition 2):**

> Read /var/log/langston-tasks.jsonl on Helsinki and apply W, q1-q3, q5, q6 per Scope Files/B_LANGSTON_TWO_WORKERS_PRE_REGISTRATION.md section 4, with the q1 BEFORE sample in Batch Completion/B_LANGSTON_TWO_WORKERS_PROGRESS_REPORT.md section 5. W is graded ONLY on a qualifying day (80 or more langston_inbound text arrivals in the UTC day). A non-qualifying day is NOT a W pass: if the 7 days hold no qualifying day, W is NOT-RUN and is reported so, not passed. On a q1 fail or a q5/q6 stop run 'langston-bridge-flag one-worker on --by cc-infra'. switch-on 2026-11-20T18:36:29Z. Owner CC-INFRA. Resolve with evidence, never ack.

## 7. The pre-registered close criterion (quoted from `B_LANGSTON_TWO_WORKERS_PRE_REGISTRATION.md` §4, unchanged)

- **W:** "PASS: under 20 min on the first qualifying day after switch-on"; the 7-day median is reported beside it. Per A-1, a miss is read beside the after-window's shared-lane share.
- **q5:** "STOP (absolute): more than 3 such outcomes in a UTC day AND more than 5 % of that day's invokes; or the mean overlapped invoke over 600 s on a day with ≥ 20 overlapped invokes".
- **q6:** "STOP (absolute): 3 or more in a UTC day".
- **q1:** "FAIL if after exceeds before by 3 or more". Coltrane gets the dispatch text and the ref, never the verdict.
- **Overall:** "PASS = W met AND no q5/q6 stop tripped AND q1 not failed." A q5/q6 stop sets the one-worker flag at once; a q1 fail sets it at the day-7 read. Either goes to Kyle through PM with the numbers. q2-q4 are reported, not graded; q4 is read at day +21.

## 8. What is unproven

- **Invoke health under concurrency (q5/q6):** no invoke has overlapped before the switch-on, so the day-3 read is the first data of any kind.
- **W can say a direction only:** the pooled one-worker median is already under the 20-min mark. The tail (over-20 count, p90) carries the real comparison and is reported beside W, ungraded.
- **The replay assumes unchanged service times,** and concurrency can lengthen them. q5's mean-overlapped-invoke rule is what would show it.
- **A 7-day after-window may hold no qualifying day.** Only 4 of the 14 baseline-window days qualified. W is then NOT-RUN, not passed (condition 2).

## 9. Governance files changed so far

- `Scope Files/B_LANGSTON_TWO_WORKERS_SCOPE.md`, `..._PRE_AUDIT.md`, `..._PRE_REGISTRATION.md`
- `Change Lists/B_LANGSTON_TWO_WORKERS_CHANGE_LIST.md`
- `GOVERNANCE_EXCEPTIONS.md`: the declared-open row since 2026-11-06T14:05:30Z
- `SPRINT_TO_LIVE_PLAN.md`: row 4a
- Langston's `MEMORY.md`: delivery-board section shortened, retry recipe (Step 6)
- this report

Owed at Step 10: `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, the System Impact Map (the bridge, the task log, the flags). The System Manual is judged N/A (comms only), recorded as an `na-skip` row for Langston to confirm.
