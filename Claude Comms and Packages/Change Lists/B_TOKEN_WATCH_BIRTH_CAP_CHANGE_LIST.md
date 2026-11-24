# B-TOKEN-WATCH-BIRTH-CAP — STEP 4 CHANGE LIST

**READY-AT:** `06df4bee5fb228c703420e041829b5fcdd77aac7` on `origin/migration/aws-supabase`. The batch's code is the three Step-3 commits `9fc98626e` → `05d9d5171` → `06df4bee5`; the base is `953ce3af5` (the LIQ-SHED hotfix, not this batch). Read the diff as `git diff 953ce3af5 06df4bee5 -- token-watch .github`.
**CI:** `9fc98626e` run 43831628880 and `05d9d5171` run 43833014800, each 4/4 green per job (TypeScript Check, Test Suite, Build, Docker Build). `06df4bee5` run 43833658758 queued at writing (test + document only).
**Nothing is installed.** The controller, its timer and `state/birthcap.enabled` do not exist on staging; births run uncapped.

## THE THREE HEADER FIELDS

**(i) DECLARED CHANGE-CLASS:** `non_architecture` (scope header, `ad55cb91e`).

**(ii) THAT CLASS'S DOC SET, ROW BY ROW**

| document | class says | state at this ref |
|---|---|---|
| scope | REQUIRED | present — `Scope Files/B_TOKEN_WATCH_BIRTH_CAP_SCOPE.md` (r2 `ad55cb91e`) |
| pre-audit | REQUIRED | present — `Scope Files/B_TOKEN_WATCH_BIRTH_CAP_PRE_AUDIT.md` (r2 `b0fef6aef`) |
| completion report | REQUIRED | absent — Step 11 (a progress report first: OBJ-2 is a 7-day observation) |
| `BATCH_CATALOG.md` | REQUIRED | absent — Step 10 |
| `PHASE_HISTORY.md` | REQUIRED (C-9) | absent — Step 10 |
| `SYSTEM_MANUAL.md` | judged | judged N/A at Step 10 unless you rule otherwise: token-watch is a co-tenant study, no trading architecture |
| `SYSTEM_IMPACT_MAP.md` | judged | applicable — Step 10: the controller becomes the only writer of external subscription state |
| `CHANGES_AND_FIXES.md` | judged | judged at Step 10 |
| `RUNNING_ISSUES.md` | judged | applicable — `#1247` gets the cap's switch-on; Step 10 |
| `POST_AUDIT_ROADMAP.md` | judged | N/A — no roadmap item |
| `DELETED_COMPONENTS_LOG.md` | judged | N/A — nothing deleted |
| `ADJUSTMENT_FRAMEWORK.md` | judged | N/A — no trading parameter |
| `PHASE_19_PLAN.md` | not P19-* | N/A — no row there |
| `SPRINT_TO_LIVE_PLAN.md` (row) | REQUIRED if a row | present — rows 5a/5b placed at `308ad04ac` (your r2-7) |
| memory (shared + `MEMORY_CC_INFRA.md` + Langston's) | REQUIRED | Step 10 |
| task list | REQUIRED | Step 10 |
| pre-registration AMENDMENT 18 (+ AMENDMENT 17 rider, + new rider) | scope OBJ-6 | present — `9fc98626e`, rider `06df4bee5` |
| `DEPLOY_WINDOWS.jsonl` open row | C-10 | present (`102940515`, detail pointer per [L-12]) |

**(iii) STEP-2 REFERENCE:** `Scope Files/B_TOKEN_WATCH_BIRTH_CAP_PRE_AUDIT.md` at `b0fef6aef` — PROCEED by you, Discord `1571714674742005820`, with r2-1..r2-7 owed.

---

## 1. YOUR r2 ITEMS — WHERE EACH LANDED

| item | landed | where |
|---|---|---|
| **r2-1** carve | Superseded by your carve ruling (A) (`1571799979847057452`): carve **0**, liquidity leg suspended. (a) the producer is named: the follow-up's liquidity leg (pool_sol reads), confirmed by the LIQ-SHED hotfix run 8 — every pool read shed, vendor `rpc` flat at 35,751 from 05:36 to 08:29Z. (b) `rpc` joins the hourly cross-check. (c) the mid-cycle trigger: any hour with `rpc` > 1.25 × allowance + 50 pages and sets `replan`. | `config.py` split block; `birthcap.py` `_hourly_crosscheck`; AMENDMENT 18 item 4 and (iii) |
| **r2-2** headroom | `headroom = MONTHLY_CREDIT_CAP - BIRTHS_RESERVED - SWITCH_RESERVED` (7,000) | `budget.py:491` |
| **r2-3** pass band | coverage-weighted expected shares; ±1.5 pp or 30 % relative, whichever is wider | AMENDMENT 18 "The verification this batch pre-registers" |
| **r2-4** failed-OFF floor | rolling over the whole off window, any minute after off + 60 s with rows ≥ max(4, 0.25 × the last 5 on-minutes' rate); published minimum below | `birthcap.py` `failed_off_minutes`; §3 here |
| **r2-5** breaker fails open | an unreadable `switches.jsonl` forces ON, refuses every OFF, pages; plus the hard ceiling and the state counter (§2); midnight phase jump tested | `birthcap.py` tick; `test_birthcap.py` |
| **r2-6** wording | the tail figures in the plan dict are computed (`switching_per_day`, `floor_binds`, `rule_windows`), not stated | `plan_cycle` |
| **r2-7** plan rows | rows 5a/5b | `SPRINT_TO_LIVE_PLAN.md` at `308ad04ac` |

## 2. ADDED SINCE STEP 2 — A HARD DAILY CEILING ON EVERY VENDOR CALL (`05d9d5171`)

The breaker (2W+4) blocked only OFF switches. A GET to re-learn the state, or an ON-PUT that kept failing, could repeat once a minute at 100 credits each — up to 144,000 credits a day, about five days of the full-cycle birth allowance (29,600). Now no vendor call of any kind runs past `ceiling + HARD_MARGIN` (4), and a state-held per-day counter is the floor under the log count, so an unreadable log cannot uncap it.

```python
    ceiling = birthcap_switch_ceiling(int(plan.get("windows", 0)) if plan else 0)
    hard = ceiling + HARD_MARGIN                              # beyond this, NO vendor call of any kind today
    # the log is the count; a state-held counter is its floor, so an unreadable log cannot uncap the calls
    calls = st.setdefault("calls", {})
    for d in sorted(calls)[:-3]:
        del calls[d]
    used = max(switches_on_day(records or [], today), int(calls.get(today, 0)))
    if applied is None and used >= hard:
        pages.append(_page("birthcap-hard-ceiling-%s" % today, "critical", ...))
    elif applied is None:
        # the applied state is lost: ONE GET learns it, and it counts against the breaker
        ...
        calls[today] = int(calls.get(today, 0)) + 1
    ...
    if applied != want and applied is not None:
        used = max(switches_on_day(records or [], today), int(calls.get(today, 0)))
        if used >= ceiling and want == "off":
            pages.append(_page("birthcap-breaker-%s" % today, ...))       # feed left ON
        elif used >= hard:
            pages.append(_page("birthcap-hard-ceiling-%s" % today, ...))  # even a switch back ON stops
        elif records is None and want == "off":
            pass                                              # already paged; never switch OFF blind
        else:
            rec = do_switch(want, now, put=put)
            calls[today] = int(calls.get(today, 0)) + 1
            _append(BIRTHCAP_SWITCHES, rec)
```

Tests: a failing ON-PUT stops at the hard ceiling; the same with the switch log persistently unparseable. Mutants: the hard ceiling removed; the counter not incremented on a PUT. The first version of the second test deleted the log, which the next PUT recreated, so its mutant survived; it now writes an unparseable line that persists.

## 3. r2-4 — THE PUBLISHED MINIMUM

**Object:** `births/*.jsonl` on staging, bucketed by `first_seen_at` UTC hour. **Population:** the 66 full reference days (09-01 → 10-17, 10-28 → 11-15), 1,578 day-hours (1,584 − the 6 zero-row hours of the 09-26 gap). Instrument: `/root/birthcap/hr.py` on staging, read-only.
- **Minimum** 7.03 rows/min (2026-09-05 h09); then 7.27 (09-06 h07), 8.43, 8.70, 9.10. **p1** 10.38 · **p5** 13.33 · **median** 25.35.
- At the minimum, the threshold is the floor of 4 (0.25 × 7.03 = 1.76). Poisson P(a minute < 4 | feed fully on) = **8.0 %**. The detector is rolling, so P(the first two minutes after the grace both miss) ≈ 0.64 %, three minutes ≈ 0.05 %.
- Control: the six zero-row day-hours are 09-26 h18–h23, exactly inside the recorded gap 09-26T17:20:49Z → 09-27T00:03:47Z (`provenance/gaps.jsonl`), so the instrument does see an absence when there is one.
- `NOT RE-READ` by a fresh reader.

## 4. A FINDING FROM MEASURING r2-4 — THE OBJ-2 REFERENCE HELD AN OUTAGE DAY

AMENDMENT 18's reference (09-01 → 10-17, 10-28 → 11-15) includes 09-26, which holds the 24,179 s gap above. Excluding 09-26 and 09-27 raises the reference share of hours 18–23 by 0.05–0.07 pp each; the result is 64 days, 2,454,978 rows, spread 0.49 pp. Separately, the amendment's parenthetical "2,636,112 rows over 71 days" is the C-7 coverage check over every file, not the reference (66 days, 2,521,575 rows). Both are written as an **AMENDMENT 18 rider** at `06df4bee5`, before the first capped birth, **for your ruling**.
DISPOSITION: folded into this batch (rider, pending your ruling). `NOT RE-READ`.

**Folded in from the hotfix review (Langston, `1571814422937075815`):** an observation row's `observed_at` is a per-RUN stamp (three distinct values in the 70,722-row 11-16 file), so observation rows can never time an event inside a run. This batch's timing reads use only per-row clocks: the census `first_seen_at` (failed-OFF detector, weights, OBJ-2), the switch log's requested and response times, and the vendor counter. No observation-row timestamp is read anywhere in `birthcap.py` or the planned-window logic.

## 5. DEVIATIONS FROM THE PRE-AUDIT PLAN (each with its reason)

1. **The known-good body is a constant without `authHeader`** (`config.BIRTHCAP_WEBHOOK_BODY`), not `/etc/token-watch/webhook-body.json` [L-10]. Your answer 1 confirmed that omitted fields persist on a full-body PUT, so the secret never needs to sit in a second file. The echo check requires `authHeader` set and the URL unchanged, or the switch counts as failed and pages.
2. **Failed-OFF detector** is the r2-4 form, not P4's "≥ 10 rows in (off+60, off+120)".
3. **Split:** births 918,000 · switching 75,000 · carve 0 · separation 7,000 (ruling (A)), not P5's 858,000 / 60,000. `BIRTHCAP_MAX_BIRTHS_PER_DAY = 29,600` (918,000 ÷ 31).
4. **The hard ceiling and the state counter** (§2) are new; P1 had the breaker only.
5. **`rpc_rate_per_day` is never written,** so it is 0: with carve 0 any RPC spend is unplanned, pages, and replans from the vendor's remaining count. P3 wrote the RPC term both inside the reserve's max and as a separate per-day deduction; that double count is kept and is inert at 0.

## 6. THE REST OF THE CHANGE SET (by file)

- **`birthcap.py`** (new, 501 lines): `plan_cycle` (pure; W = min(12, max(4, floor(0.08 × gross ÷ 200))); refuses if the on-window ≤ 900 s at every W down to 1), `desired` (phase rotates 0.618 of a block per day), `read_new_births` (incremental census read), `failed_off_minutes`, `handshake_ok`, `do_switch` (one full-body PUT; the response is the read-back), `tick`, `_hourly_crosscheck`, `trailing_launch_rate`, `mint` (alerts), `main`. Acts only while `state/birthcap.enabled` exists; when disabled it restores ON.
- **`liveness.py`**: `PLANNED_OFF_READER`, `SWITCHES_PATH`, `planned_windows` (confirmed OFF → next confirmed ON + 90 s grace; an OFF with no ON is bounded at max(next midnight, off + 21,600 s) + 210 s), `planned_overlap`; covered silence writes `planned_off.jsonl`, uncovered silence still opens a gap.
- **`config.py`**: AMENDMENT 18 split with asserts; `BIRTHCAP_*` constants; `birthcap_switch_ceiling(w) = 2w + 4`; `CREDITS["switch"] = 100`; `NEVER_SHED` gains `switch`; `UNPACED_HOSTS` gains the Helius RPC and admin hosts.
- **`budget.py`**: headroom (r2-2); `allowed()` docstring rewritten.
- **`providers.py`**: `webhook_put`, `webhook_get`, `helius_usage`, all through `_request`; key from `/etc/token-watch/helius.env`, sent in the `X-Api-Key` header, never argv.
- **`follow_up.py`**: liquidity comment (carve 0 means it always sheds).
- **systemd**: `token-watch-birthcap.service` (user `tokenwatch`, `ProtectSystem=strict`, `MemoryMax=192M`; `--mint` as `ExecStartPost=+`) and `.timer` (every minute at :20).
- **`deploy/install_storage.sh`**: ships `providers.py` and `birthcap.py` and the two units; import check `import config, budget, liveness, birthcap` in the stage; `systemd-analyze verify` on the service.
- **Tests**: `test_birthcap.py` 43/0; `mutate_birthcap.py` 18/18 killed (exit-code judged; NOT-APPLIED counts as a failure); both in `ci.yml`. `test_collector`, `test_wiring`, `test_mutations` use a 5,000 carve to keep exercising the shed mechanism; `test_due_storage` expects the new files and units; `tools/measure_followup_memory.py` restores the 190,000 carve in its live arms.

## 7. JUDGEMENT CALLS — PLEASE ATTACK THESE

1. **HARD_MARGIN = 4.** At W=12 the worst bad day is 32 calls = 3,200 credits against a switch reserve of 2,419/day (75,000 ÷ 31); the excess comes out of the 7,000 separation, so about eight bad days a cycle are absorbable. Too loose, too tight?
2. **The state counter keeps 3 days and is a floor, not the authority.** If the state file itself is lost, the count restarts from the log; if both are lost on the same day, the hard ceiling can be exceeded once. I judged that double loss out of scope.
3. **A replan changes the duty mid-cycle** (r2-1 (c)). The weights read measured on-time from `switches.jsonl`, so they stay correct, but "duty fixed once per cycle" is then true only between replans. AMENDMENT 18 (iii) says the replan happens; it does not say the duty may change. Should the amendment say so?
4. **The rider in §4**: exclude whole days 09-26 and 09-27, or only the gap span? I chose whole days because the hour-share is a per-day construct and both days are partial.

## 7b. THE CALLS AS RULED AT GATE D (Langston, `1571833133165445181`)
1. **HARD_MARGIN 4 — approved.** Worst bad day at W=12 is **32 calls / 3,200 credits** (`hard = 2·12+4+4`, both guards block at `used >= hard`). Cycle slack in the switch reserve is **600 credits** (75,000 − 74,400) — six calls for the whole cycle; past that it is separation. Too tight would strand the feed OFF until the next UTC day (a data cost, not a credit cost).
2. **State counter — approved, on a stronger argument:** `read_switches` raises on an ABSENT log too, and that forces `want = "on"`, so a lost log can only spend on a restore-ON and stops at `applied == "on"` — at most 2 calls per loss event. The double loss is a bounded exposure, not an unbounded one.
3. **Replan → rider item 3,** plus a divergent hour as its own stratum (A-1).
4. **Whole days — approved,** on the pooled construct the reference uses (keeping a gap day's unaffected hours would inflate their pooled share as the hole deflates the gap hours). The exclusion is now every day touched by a recorded gap (C-1): 63 days.
**For the report:** the failed-OFF grace is a 61 s margin over **one** observed 49 s tail (n=1), not a guarantee; E[minutes to detection] = 1.09 at the published worst hour.
**Step 10 (C-2):** the reviewer ACL on `provenance`, `births`, `state`, `observations`, `study` is masked to nothing (`mask::---`); `setfacl -m m::r-x` makes the OBJ-2 legs auditable by Langston. Needed before the OBJ-2 adjudication.

## 8. INSTALL ORDER AFTER YOUR PROCEED (Steps 5-6)

`install_storage.sh <sha>` → create an empty `provenance/switches.jsonl` (an absent log forces ON, by design) → enable the timer → first ticks run disabled (restore-ON only) → `touch state/birthcap.enabled`. OBJ-1's verification is the vendor counter's delta across an off window against an on-window control the same day.

`REVIEWER:` none spawned for this list. Load-bearing claims routed to no reader and labelled `NOT RE-READ`: §3, §4.

## 9. STEPS 5-9 RECORD (install, switch-on, first-hour fixes)
- **Step 4 Approved** (gates A-D, Langston `1571833133165445181` → Review set after C-1/A-1). **Step 5:** CI run 43849031520 at `70d56bba3`, 4/4 per job.
- **Step 6 — install 1:** `install_storage.sh 70d56bba3…` 2026-11-16T10:34:05Z (previous `953ce3af5`); receiver restarted 10:34:18Z (config/budget in its import closure; +18 births in the next 45 s). `provenance/switches.jsonl` created empty (tokenwatch 0640) 10:35; one disabled tick 10:35:14Z → `disabled-restored-on`, one ON-PUT echoed (active, authHeader set, URL unchanged). Timer enabled 10:36; a disabled tick made no call. `state/birthcap.enabled` touched 10:37:12Z.
- **First enabled tick, 10:37:20Z:** plan W=4, `births_allowance_per_day` 10,493.7, duty 0.2709, `on_s` 5,850.4, launch rate 38,743.1 (no OFF time yet, so the de-censoring divides by 1.0), remaining 126,981, days left 10.557. **2026-11-16 TRUNCATED** (12,095 recorded ≥ 10,493.7) → OFF 10:37:20Z, vendor echo `disabledAt` 10:37:22.421Z. The timetable starts at 00:00Z 11-17.
- **OBJ-1, OFF leg (measured, staging `/root/birthcap/obj1_off_20261116.jsonl`):** vendor `webhooks` 837,420 and census births 12,111 unchanged from 10:40:44Z to 11:19:21Z (39 min); `rpc` flat at 35,751. The on-window control is the first window on 11-17. To be committed as evidence at Step 7 (Langston's condition: reviewer-readable).
- **Step 9 — two first-hour findings, fixed at `896df3e30`, Langston PROCEED `1571846571056701471`, installed 11:17:37Z:** (1) a mid-hour first snapshot (10:37:20) was compared against the whole hour → false divergence and a **FALSE REPLAN at 11:01:22Z**: allowance 10,493.7 → 10,497.2. ⛔ **Recorded so nobody reads that plan as a response to a real divergence:** the plan in force from 11:01:22Z was computed off a false signal (the difference is 3.5 births/day); `st["hours"]["2026-11-16T10"]` holds the false 148-vs-924 row for three days and nothing reads it. (2) the mint's node process aborted under `TasksMax=32` (rc 134; measured minimum 48; now 64). The aborted mint DISCARDED the false divergence page — it never reached the queue (Langston's census: one birthcap row existed). Unit-failed alarm `b8b9a527` (11:00:24Z) caught the unit; resolved 11:18Z on a measured successful mint: drill `cba8b255` minted rc 0 under `TasksMax=64`/`MemoryMax=192M` and was resolved against `896df3e30`. The next regular tick (11:19:21Z) succeeded.
- **§9.4, both folded into this batch (Langston §13):** (i) unminted pages are carried forward in state, bounded, so a failed mint re-offers them (the hourly cross-check pages are otherwise minted once); (ii) the installer's cap-pairing guard extends from `MemoryMax` to `TasksMax`.

## 9b. THE FOUR SPEND-MISMATCH ALERTS, 11-17/11-18 (read 2026-11-19T23:3xZ, after the usage stop)

- **The alerts:** `7bb05e9e` (hour 11-17T17: vendor +339 vs census 283 + switch 100 = 383), `8855bdbd` (11-17T18: +272 vs 232), `00911bb6` (11-18T07: +396 vs 532), `ddb2c888` (11-18T09: +302 vs 225). All from `_hourly_crosscheck` (`birthcap.py:457-490`): \|vendor − census\| / max > 10 % on an hour of ≥ 200.
- **Population:** every hour in `state/birthcap.json` `hours` (the 72 the state keeps, 11-17T00 → 11-19T23), read on staging as root. 1-hour rule: 4 trips. **Cumulative over all non-empty hours: the vendor billed 350 credits LESS than the census counted** (the running vendor − census difference drifts from −65 to −350 over ~35,000 credits, ≈ −1 %). No hour, run of hours or day shows the vendor billing MORE than we record.
- **Mechanism (hypothesis, consistent with every row; NOT RE-READ):** the four hours are all partly-on hours where a switch's 100 credits are a large share, and each over- is matched by an under- in the next non-empty hour: 11-17T17+T18 = 611 vs 615; 11-18T07+T08 = 1,655 vs 1,749 (5.4 %); 11-18T09 + the next non-empty hour T12 = 1,510 vs 1,485. Spend that lands either side of the hour edge — a switch PUT or in-flight deliveries billed in a different hour from the one the census records them in. **Pairing each hour with the next NON-EMPTY hour clears all four**; pairing with the next clock hour does not (3 of 71 still trip, because the next clock hour is often an OFF hour of zeros).
- **Consequence of each false trip:** the alert page, and `st["replan"] = True` (`:486`) — the next tick re-plans from the vendor's own usage (`:329-338`), i.e. from the authoritative meter. **No spend effect.**
- **DISPOSITION:** folded into this batch (Step 9, iterate): the check compares each ON window (switch ON to the next OFF, plus the measured in-flight tail) and keeps the hourly rows as a record, or pairs with the next non-empty hour — to be settled with Langston as its own gate after the `:565` fix. The four alerts are resolved with this section as evidence; until the fix lands, a new trip on a partly-on hour is this pattern.

## 9c. DEFECT: THE FREE FOLLOW-UP HAS BEEN SHED SINCE 2026-11-16 ~10:53Z (found 2026-11-19 23:4xZ; Step 9)

- **Symptom (measured):** every hourly follow-up run since 11-16 10:53Z logs `observed 0` and sheds every due checkpoint (e.g. 23:02:59Z: due 8,530, observed 0, shed 6,466), with `BURN critical … shedding=['liquidity', 'follow_up']`. The summary unit has exited 4 every hour since (alert `a299883c`: *"the follow-up has observed nothing for a whole window: job shedding, timer enabled"*) — the alarm was right.
- **Cause (live, as `tokenwatch` on staging, 2026-11-19 ~23:45Z):** `budget.allowed("follow_up")` → False. Month 2026-11: liquidity 35,771, follow-up 0, total 678,976 of 1,000,000. Bound (b) `remaining > 0` holds (321,024). Bound (a) `non_birth < headroom` fails: headroom = 1,000,000 − 918,000 − 75,000 = 7,000 under AMENDMENT 18, and the 35,771 liquidity credits were spent BEFORE that change cut the headroom. The month key is the calendar month, so it would have stayed shed until 12-01. NOT RE-READ by a fresh reader; every figure is from one live call and the state file.
- **Intent it breaks:** the pre-registration's AMENDMENT 17 note — *"the follow-up is not expected to shed in November"* — and plan row 5a's *"everything already tracked keeps being tracked"*. `budget.py`'s own reachability note assumed the liquidity carve is always ≤ the headroom, so bound (a) could only bind a re-homed (paid) follow-up; a carve cut MID-MONTH below spend already made breaks that assumption.
- **Loss:** follow-up checkpoints due between 11-16 ~10:53Z and the fix install are not observed (study data, not trading; not retakeable at their checkpoint times). The shed counts per run are in the follow-up journal.
- **Fix (this commit):** bound (a) applies to the follow-up only while it costs credits — `(CREDITS["follow_up"] == 0 or non_birth < headroom) and remaining > 0`. Bound (b) unchanged. Tests: the free follow-up allowed with liquidity spent past the headroom (test_collector §4, injection 1b, with controls); a credit-costing follow-up refused by the reserve clause (test_mutations M4). Mutants: both new ones killed, P14 re-anchored and killed; `mutate_p5_p6_p14.py` 57 of 57 on staging, after re-anchoring the indented-cap mutant that `6194cd4ba` had left pointing at text no longer in the installer.
- **DISPOSITION:** folded into this batch (Step 9). Gate order with Langston: this fix first (it is losing data hourly), then the `:565` fix, then the spend-check pairing (§9b).

## 9d. INSTALLED `cde88cc02` 2026-11-20T00:03:59Z (Langston PROCEED `1573123563844538452`; CI `44640384871` 4/4 at `ecbdf882e`)

- `install_storage.sh cde88cc02…` as root: `INSTALLED` previous `eb20f86f6` → `cde88cc02`; `budget.py` sha256 `32750f86…`, `birthcap.py` `dd667503…`. Live, as `tokenwatch`, 00:04Z: `allowed("follow_up")` True, liquidity False, `shed_now` = `["liquidity"]`, spent 679,148. Cap ticks at 00:04:20Z and after: `action None, pages 0`. No receiver restart (it never calls `allowed()`, Langston). A follow-up run started by hand at ~00:05Z rather than waiting for 01:01Z.
- **Langston C-1 (the summary alert `a299883c`):** the two runs the row quotes, 11-15T18:12Z and 19:12Z, exited **75 TEMPFAIL**, not 4: *"another periodic job holds the lock — summary build SKIPPED (held by: follow_up …)"* then *"published summary is 2:07 old (past 2:00:00)"*. That is the long-run lock finding already recorded in B-TOKEN-WATCH-FOLLOWUP-MEMORY (the 93-minute run; summary page `e1836e17`), a distinct fault. Exit 75 continued hourly to 11-16T10:12Z; exit **4** (job `shedding`) from 11-16T12:12Z. The alert is resolved only on a measured exit 0, and the exit-75 class may return now that the follow-up runs again.
- **Langston C-3:** the 2,064 in *"due 8,530, observed 0, shed 6,466"* are `requeued_not_yet_due` — a third state in the same result line.
- **Langston C-4 (his own):** the 7,000 headroom comes from his r2-2 ruling, which was right; bound (a) gating a free leg on other legs' spend was the error, fixed here.
- **OBJ-5 is affected too:** its follow-up counts against the pre-cap baseline were zero from 11-16 ~10:53Z because of this defect, so OBJ-5 is read from the install, not from the switch-on.

## 9e. THE DIVERGENCE PAGE MOVES FROM THE CLOCK HOUR TO THE ON WINDOW (§9b's fix; Langston design, Discord `1573176718766637057`)

**READY-AT (this gate):** `1b4825d654cef4db5072e332011be2d6739906d2` on `origin/migration/aws-supabase`. Read the diff as `git diff cde88cc02 1b4825d65 -- token-watch` (the installed sha to the head; this batch's commits in that range are `4b6606813` → `52164f0d5` → `1b4825d65`; `config.py` +8, `birthcap.py`, `tests/test_birthcap.py`, `tests/mutate_birthcap.py`). Not in this gate: `.github/workflows/ci.yml` and `comms-infra/security/reviewer-staging-access/` in the same range belong to B-WORKFLOW-IMPROVE and B-CREW-ACCESS-HARDEN F-2. CI: run `44712789063` at `1b4825d65` — TypeScript Check success, Test Suite success, Build success, Docker Build success.

- **Why:** §9b — four false divergence pages in 72 h, every one an hour-edge split on a partly-on hour. A clock hour cuts through live deliveries; an ON window does not: it starts at a vendor usage snapshot taken just BEFORE the ON switch is charged, and ends at one taken after the OFF once the census has had a full quiet minute. Both ends are quiescent, so the delivery lag has nowhere to land.
- **Window lifecycle (`birthcap.py`):**
  - `_window_open` — at a confirmed ON switch (snapshot first, so the switch's own credits fall inside the window), or `adopt` when the feed is ON with no window (install, state restore). A failed usage read starts no window (logged). A window still waiting after its OFF when the feed switches straight back ON is compared first against the same snapshot (`reopened`), so no window is lost; the new one counts births from the next minute.
  - A failed ON switch drops the window; a confirmed OFF stamps `off_at` on it.
  - `_window_close_check` — after the OFF: waits `BIRTHCAP_OFF_PROOF_S`, then for a full quiet minute after the in-flight grace (`_quiet_minute`); an OFF that never goes quiet is compared anyway at `BIRTHCAP_WINDOW_QUIET_MAX_S` = 900 s, marked `off-not-quiet`. With no OFF (always-on, breaker-forced ON, refused plan) the window is cut at two plan blocks (`_window_bound_s`; always-on/refused take the `W_MIN` block, so 12 h) and a new one continues from the same snapshot. A failed usage read at close defers to the next tick.
  - `_window_compare` — vendor webhook delta against census births in the window plus switch credits requested inside it; base = the larger side. Verdicts `small` / `ok` / `divergent` (page + replan, > 10 % on ≥ 200) / `frozen` (vendor +0 against ≥ 200 expected: its own key and title — a dead meter is not a billing disagreement). Every compared window is kept 72 h (`BIRTHCAP_WINDOWS_KEEP_S`) in `windows_checked`.
- **The cumulative leg (Langston condition 3):** one-sided, the money direction — summed over the kept windows, the vendor billing MORE than the census by > 3 % (`BIRTHCAP_CUMULATIVE_OVER_SHARE`) on ≥ 2,000 expected credits (`BIRTHCAP_CUMULATIVE_MIN`) pages CRITICAL, one key per day. This is what makes not paging a single noisy hour safe: a slow over-bill too small for any one window still accumulates. Billing BELOW the census does not page (§9b measured the vendor ~1 % under over 72 h).
- **The hourly rows stay** as the record and still drive the replan (the replan re-derives from the vendor meter, the authority, so a noisy trigger is near a no-op — Langston condition 1), but **no longer page a divergence.** Each row now carries `share`, `verdict` and `paged`. A frozen hourly meter still pages, under its own key (condition 4). `st["replan"]` now records its reason (`divergence-hour:…`, `divergence-window:…`, `frozen-meter:…`, `rpc-overrun:…`) instead of `True`, and **every replan is recorded** (`st["replans"]`, last 100) with its reason and the allowance before and after (Langston condition 1: the loop trip -> replan -> new block boundaries -> more partly-on hours was unmeasured).
- **Tests (Linux, staging copy, authoritative for the POSIX-only cases):** `test_birthcap.py` 105 passed, 0 failed. `mutate_birthcap.py`: every mutant KILLED (judged by exit code plus its FAIL line), `MUT_RC=0`, including 13 new and 1 re-anchored for this change (1 superseded mutant retired) — window snapshot after the ON credits; a divergent hour not replanning; a frozen meter (hour or window) reported as a divergence; a replan not recorded; quiet check ignoring a post-grace birth; a never-quiet window never compared; a wall-clock no-OFF bound; the cumulative leg two-sided, never paging, or keeping rows past 72 h; a reopened window lost; the hour row without a verdict; the hourly divergence never evaluated (re-anchored: it now replans and records, the window pages).
- **Not proven by this commit:** the live behaviour of a real window — that rides the install and Step 7 (OBJ-1).
- **Billing-cycle reset (found while preparing the Step-4 dispatch, folded in before it):** Helius's usage counter resets at its billing-cycle boundary (the next one is the 27th). *(Corrected in the follow-up commit below: this line first said the usage read carries no cycle fields — wrong; it carries `creditCycle {start, end}`, which `plan_cycle` already reads.)* Before this fix a window or hour spanning the reset read as a huge under-bill: a false `divergent` page and replan, and its large negative vendor delta in the cumulative sums would cancel every over-billed window for the next 72 h — blinding the one-sided money leg exactly when a new cycle starts. Now `dv < 0` (window) and `dv_web < 0` (hour) give verdict `reset`: no page, no replan; the row is kept in `windows_checked` as the record but excluded from the cumulative sums (`st["cumulative"]` gains `reset_windows`; `windows` counts the summed rows). The frozen checks became `elif` so a reset is never also judged frozen.
- **Tests for the reset (same Linux run):** `test_birthcap.py` **108 passed, 0 failed** (105 + 3: hourly reset → verdict `reset`, no replan, no page; window reset → verdict `reset`, no page, no `divergence-window` replan; a reset window among over-billed ones → the cumulative page still fires, `windows` 5, `reset_windows` 1). `mutate_birthcap.py` `MUT_RC=0`, every mutant KILLED, none NOT-APPLIED: **3 new** (window reset not detected; reset row kept in the cumulative sums; hourly reset not detected) and **2 re-anchored** (the two frozen-meter mutants, now on the `elif` lines).
- **Billing-cycle IDENTITY (follow-up commit, before the Step-4 dispatch):** a reset is now detected EXACTLY — two usage reads whose `creditCycle.start` differ straddle the boundary — with the negative delta kept as the fallback for a snapshot recorded before this change (or a read missing the field). Why it matters: a quiet cycle followed by a reset can read as a small POSITIVE delta, which the negative-only test scored as spend (a false `divergent`, or worse, counted in the money leg). `_cycle_of(usage)` and `_is_reset(delta, cycle_then, cycle_now)` are shared by the hour and the window; the hour snapshot, the ON window and a cut's continuing window each record their cycle. The hourly rpc-overrun check is now skipped on a reset hour (the rpc counter resets too, and can rise across it).
- **Tests for the cycle identity (Linux, staging copy):** `test_birthcap.py` **113 passed, 0 failed** (108 + 5: hourly cycle change with a positive delta → `reset`, no replan, no page; the rpc counter rising across it → no overrun; a window whose cycle changed with +400 over the census → `reset`, no page; that window kept out of the cumulative leg, `windows` 5, `reset_windows` 1; a cut's continuing window carries its cycle). `mutate_birthcap.py` `MUT_RC=0`, **60 KILLED**, none NOT-APPLIED: **6 new** (cycle check dropped; negative fallback dropped; ON window, cut window, hourly snapshot each not recording the cycle — the hourly one sets `None` so it dies on behaviour, not a missing key; rpc guard dropped) and **4 re-anchored** (window-snapshot, window reset, hourly reset, RPC-overrun).

### §9e round 2 — Langston's Part A changes answered (2026-11-20)

Part A verdict: CHANGES NEEDED (Discord msg 1573311142691078216). Each item and what answers it, all in `token-watch/birthcap.py` at the new READY-AT:

| Part A item | answer |
|---|---|
| **BLOCKER-1** (frozen read as "vendor delta is zero", which a feed with switch credits only never satisfies) | frozen now = `dv - switch_cr <= 0` (the vendor moved no more than the switch charges alone explain), gated on **births** ≥ `BIRTHCAP_DIVERGENCE_MIN`; same rule in the hourly cross-check and the ON-window compare |
| **(a)** reset test opaque; same-cycle negative delta read as a reset | `_is_reset` → `_reset_test`, returning `"cycle"` / `"negative-delta"` / `None`, recorded on every hour row and window row as `reset_test`. Both cycles known and EQUAL with a negative delta is **not** a reset: new verdict `backwards`, own page key `birthcap-vendor-meter-backwards-*`; the hourly arm also replans (`backwards-meter:<hour>`) |
| **(c)** concurrent replan reasons overwrote each other | `_flag_replan` joins reasons with `+`; `--replan` records `manual`; a legacy `True` reads as `manual`. An rpc overrun now sets `paged=True` (it pages, so the row says so) |
| **RIDER-1** meter faults inside the money leg | `frozen` and `backwards` windows are excluded from the 72 h cumulative sum and counted aside as `meter_fault_windows` |
| **RIDER-2** no way to read state without the file | `--status` prints plan, cumulative, pending replan and the last `STATUS_TAIL`=12 replans / hours / windows |

**Diff:** `git diff 1b4825d65 62a64bc2f -- token-watch` (one commit, `62a64bc2f`, 317+/52-; birthcap.py, tests/test_birthcap.py, tests/mutate_birthcap.py). `token-watch/` is unchanged from `62a64bc2f` to the branch head at `948c90529` (`git diff --quiet` rc 0).

**READY-AT: `62a64bc2f096406683dff3206df9e0995bc4e205`.** CI: runs at 62a64bc2f and the three heads after it were each cancelled by a newer push; the run that grades this is cited in the dispatch (the first 4/4-green run whose head contains 62a64bc2f).

**Tests (Linux, staging copy of `token-watch/` at origin head, authoritative for the POSIX-only cases):** `test_birthcap.py` **135 passed, 0 failed** (132 on Windows; 3 are posix-gated). `mutate_birthcap.py` `MUT_RC=0`, **81 KILLED**, none SURVIVED, none NOT-APPLIED. 21 new mutants: frozen ignoring the switch credits (hour, window); frozen gated on births + switches (hour, window); same-cycle backwards not detected (hour, window); same-cycle negative delta read as a reset; hourly backwards not replanning; frozen / backwards window kept in the cumulative leg; meter-fault windows not counted aside; a second replan reason overwriting the first; a reason raised twice repeated; a legacy True not read as manual; reset_test not recorded (hour, window); `--replan` recording True; an rpc overrun recorded as not paged; `--status` reading through `load_state`; `--status` printing the whole history; `--status` omitting the pending replan. The two that first CRASHED the suite instead of failing it (same-cycle negative delta; `--status` via `load_state`) now fail with FAIL lines — the refusal test captures a raise as a result (`_status_run`).

**JUDGEMENT CALLS — please attack these:**
1. **Frozen is gated on births, not on expected.** A window with switch credits but no births can no longer read frozen; a feed that birthed nothing and was charged only the switch is `small`/`ok`, not a meter fault.
2. **`--status` false-absence fix (beyond RIDER-2):** it reads `state_path(STATE)` directly and **refuses** (rc 1, one stderr line) on a missing-but-expected, unreadable or unparseable file. Before, it went through `load_state`, which returns an empty state on any failure, so a broken file printed `null` as if no plan existed.
3. **An rpc overrun now sets `paged=True`.** It always paged; the row said it had not.
4. **The C-2 ACL moves to install** (`install_storage.sh`), not this diff.
5. **`--status` writes nothing into `public/`** — it prints to stdout only, so the tracking page does not gain a state dump.

**NOT RE-READ (no fresh reader):** that `dv - switch_cr <= 0` is the right frozen boundary when a switch charge and a real birth land in the same minute; that excluding meter-fault windows cannot hide a genuine over-bill that coincides with a frozen read.
**Not proven:** a real window's live behaviour — rides `install_storage.sh <sha>` and Step 7 OBJ-1.

### §9e Part B — the ON window, and Part A's three Part-B obligations (2026-11-20)

Part A verdict: **PROCEED** (Discord `1573344383842132081`). His two record corrections are taken: CI `44745580867` graded `b6428d6ef`, not the ref; the leg stands on `c0a82132e`'s own run `44749286952` 4/4 plus `token-watch/birthcap.py` byte-identical (sha256 content prefix `76a83f61…`) between `62a64bc2f` and `c0a82132e`. And `62a64bc2f`'s parent is `e1a989fa0`.

**READY-AT: `abf12999730a53c3f76b91a5e82a8132bdb81d2d`.** Diff: `git diff c0a82132e abf129997 -- token-watch` — two commits (`git log c0a82132e..abf129997 -- token-watch`): `a0d2a36ca` (the fix, `birthcap.py` + both test files) and `abf129997` (test file only: five older mutants re-anchored, below). `token-watch/birthcap.py` is byte-identical at both (git blob sha1 `5785d0b4…` — a different function from the sha256 prefix above, so the two labels do not mean the files differ). Line numbers below are at the READY-AT.

| Part-B obligation | answer at the READY-AT |
|---|---|
| **The compare-instant switch** (his hypothesis) | **Real.** A GET or PUT made in the tick that takes a meter read carries that read's own timestamp, so `opened <= requested_at < now` put it on the wrong side: a test of it failed 3 checks before the fix. **Fix: pair by CODE ORDER.** `_charge_switch` (`:590-596`) charges the budget ledger AND a running counter `st["switch_charged"]` in one place; every window snapshots the counter as `sw` at its meter read (open `:616`, cut-reopen `:677`); the compare uses `switch_charged - w["sw"]` (`:693-694`). `records` is no longer passed through the window functions. Tests `:692-716`: a GET charged before the adopt snapshot is not counted; a GET in the cut's own tick is in the delta and is counted (500 = 400 + 100); the reopened window does not count it again. |
| **The small-window dilution** (named check, no change) | `tests/test_birthcap.py:783-806`: a window with 150 births and a dead meter, driven through the production tick (adopt → births → cut), is verdict `small`, pages nothing, and stays in the cumulative leg. **Threshold, corrected at Part B (condition 2):** the fixture's 9 % overbill (vendor 6,000 against census 5,500 with the run's closing window) drops under the 3 % line at **326 census-only births — three such rows mask it, two (+3.45 %) still page**; both sides are now checked (`tests/test_birthcap.py:782-816`). Five would also mask, but five is not the line. On the live path an ON window always holds two switch charges (base ≥ 200), so `small` arises only in an adopted or cut window. |
| **Literal `100` in the window fake** | `config.SWITCH_CREDITS` in `tests/test_birthcap.py` at `:546, :573, :599, :622, :638`. **Not total, deliberately:** `:158`'s literal `credits == 100` stays — it pins the documented price beside `config.py:497`'s assert. |

**Found by mutation, fixed:** the billed restore while DISABLED charged the ledger and no test saw it. New check `:253-255`: one `"switch"` journal row AND the counter moved by its credits.

**Install transition — CORRECTED at Part B (condition (a), refuted on its premise):** the live controller `cde88cc02` (`/opt/token-watch/birthcap.py` sha256 `dd667503…`) has **no window machinery at all** (Langston measured: 0 `"window"` state key, no `_window_open` / `windows_checked` / `cumulative`; positive control `birthcap_switch_ceiling` 3 hits). So the install finds **no** window and opens a fresh one with `sw` on the adopt path (`birthcap.py:461`). **Pre-registered Step-7 expectation: `unpaired_windows == 0`, and the first window row carries `reason: "adopt"` and `sw`. An `unpaired` row at install means something other than the installed controller wrote that state — a finding, not a tick.** The real install transition is `cde88cc02`'s `usage_snap` carrying no `cycle`, covered by `_reset_test`'s negative-delta fallback and the partial-hour skip. The `unpaired` branch below is KEPT for a rollback-then-forward pair landing mid-window. As first written: a window with no `sw` its first compare would raise `KeyError`, and on the switch-ON path (outside the `try`) that fails the tick with the feed off. Such a window closes as verdict `unpaired` (`:703-707`): `switch_credits` None, never paged, never a replan, kept out of the 72 h sum (`:744`), counted aside as `unpaired_windows` (`:749`). Test `:572-587`. At most one window, once.

**Mutation:** 8 new mutants (counter never advances; open / cut not snapshotting; GET charging the ledger only; disabled restore uncharged; compare dropping the credits; pre-counter window compared as paired; unpaired window summed). Local suite **141 passed, 0 failed** (Windows; 3 POSIX-only checks skipped there). Each new mutant KILLED run alone. **Five older mutants pointed at text `a0d2a36ca` had changed and read NOT-APPLIED in CI `44762091037`** (every applied mutant was KILLED there); `abf129997` re-anchors them: the reset branch is now `elif row["reset_test"]:`, the cumulative-leg exclusion tuple now carries `"unpaired"` (each of the reset / frozen / backwards mutants removes only its own verdict), and the window-row-records-reset-test mutant drops the assignment and tests `_reset_test(...)` in the `elif`. Full local run at `abf129997`: 84 KILLED, 0 NOT-APPLIED, 5 SURVIVED — 3 POSIX-only timeout mutants (checks skipped on Windows, rc 0) and 2 rc 1 with no FAIL line (an rpc overrun across a reset; the counter never advancing) — **all five KILLED on Linux in `44762091037`; the Windows cause is not proven.** The CI run on Linux is the record for the committed state.

**JUDGEMENT CALLS — please attack these:**
1. **REFUTED ON ITS PREMISE at Part B — see the corrected install-transition paragraph; the branch stays for rollback-then-forward.** `unpaired` for the install-transition window rather than reading its credits from the switch log by timestamp (the defect this batch just removed) or dropping the window silently.
2. **The hourly arm still pairs by hour prefix** (`:505`). Left unchanged: since §9e it pages only `frozen` (births ≥ 200 and `dv - switch_cr <= 0`) and `backwards`; a switch misplaced across an hour edge moves `dv - switch_cr` by 100, which can turn a frozen hour into a miss (the window arm still sees it) or make a near-dead hour (vendor ≤ 100 against ≥ 200 births) read frozen — which is a meter fault anyway. **The arm named at Part B (condition (b)):** one misplaced switch over a base of 200-1,000 is a 10-50 % disagreement, so it flips the hour to `divergent` and flags a replan — no page by design, but the replan re-derives W and phase and so changes the switch schedule (the `:342` comment calls that effect unmeasured). Bounded and accepted. A false `frozen` needs two switches misplaced inside the boundary.
3. **900 s as the never-quiet maximum, and two plan blocks as the no-OFF cut** — both my numbers, not derived (carried from the first Part B draft). **Successor folded into Step 7 (Part B condition (c)):** if window rows close `end: "off-not-quiet"`, the 900 s is binding and is re-derived from the measured quiet-lag.

**NOT RE-READ (no fresh reader):** that every vendor call that bills goes through `_charge_switch` (three call sites, `:312, :401, :432`, found by grep for `record_pending("switch"`); that both window ends are quiescent so delivery lag cannot land.
**Not proven:** a real window's live behaviour — rides `install_storage.sh <sha>` and Step 7 OBJ-1.

**Part B verdict: PROCEED** (Discord `1573388184308555899`; Review = Approved). Conditions (a), (b), (2), (3), (c) and the hash labels are folded above; the test fold pins the dilution threshold on both sides (suite 142 passed, 0 failed). Owed at Step 10/11: `SPRINT_TO_LIVE_PLAN.md` row 5a (stale), a routing-doc row for the `birthcap-*` keys, a completion report whose basename carries COMPLETION, or a declared-`open` row if it goes to observation on a PROGRESS report.

## 9f. STEP-10 C-2 REVIEWER READ GATE — the directory-only ACL instruction was insufficient (2026-11-24)

**READY-AT (C-2 implementation):** `93d2e7094bf2d0eceb558ee1aa968a55f7819ad4` on `review/b-token-watch-birth-cap-c2-infra-codex-v2`. Read the implementation diff as `git diff 3be35d3da 93d2e7094 -- token-watch .github/workflows/ci.yml`; the progress report and this §9f carry the record changes in the same commit. Nothing in this gate is installed.

- **Live discriminator:** as `deploy`, `provenance/switches.jsonl`, `births/2026-11-17.jsonl` and `state/birthcap.json` all return unreadable; the public summary is the positive control and is readable. The five named directories carry `user:deploy:r-x` but `mask::---`; the birth and state files also carry a masked deploy entry, while `switches.jsonl` has no deploy entry at all. Therefore the earlier `setfacl -m m::r-x` instruction on the directories cannot make the objects auditable.
- **First correction rejected before review:** `install_storage.sh` recursively grants `deploy` read/traverse and checks the whole tree immediately. A fresh reader found that production's post-write hardening restores 0700/0600 and collapses those ACL masks again. Re-derived on staging with a private temporary tree: the recursive grant made a 0600 object readable as `deploy`; the same hardening then made it unreadable. The temporary tree was removed in the same command. The immediate check proves only that instant, not a durable boundary.
- **Tests at the rejected ref:** `test_due_storage.py` 121 passed / 0 failed. `mutate_due_storage.py` 17 of 17 killed, including the directory-mask-only regression, but neither suite drove a production writer after the grant. Their pass therefore did not test the durability claim.
- **Coltrane design ruling (2026-11-24T01:02:03Z):** SEND BACK the recursive live-store ACL; PROCEED with a separate read-only reviewer snapshot. The snapshot population is exactly the seven closed birth files (11-17 through 11-23) plus a complete, unfiltered byte prefix of `switches.jsonl` starting before the window. `state/birthcap.json` is excluded because it is not an OBJ-2/OBJ-8 close input. The manifest must bind every source/copied path, byte count, row count, SHA-256, prefix length/hash, capture time and observation window; it must pin the reference artifact and `on_fraction` analysis to the installed repo ref. `deploy` must read every object and must fail write, replace and delete. The externally retained manifest SHA binds the manifest itself. Deletion is explicit after his adjudication ruling and records its own evidence.
- **Corrected implementation:** `tools/export_birthcap_review.py` builds the fixed root-owned snapshot outside the live store, verifies complete JSONL/final newlines and source-prefix equality before exposure, leaves the seven closed files immutable while allowing only a later switch-log append, and refuses an unpinned live producer/reference/analysis set. It produces the external receipt, proves the live `deploy` boundary, refuses overwrite, and accepts deletion only with that receipt's full manifest SHA. `install_storage.sh` installs the producer and contains no C-2 `setfacl` or live-store widening. CI now runs the producer and mutation suites.
- **Verification:** existing due/storage suite 120 passed / 0 failed and 17/17 mutants killed. Snapshot suite 12 passed / 0 failed and 2/2 mutants killed on Windows; the same 12/0 + 2/2 passed on staging Linux with the real `deploy` account, including read of all 8 data objects plus MANIFEST and actual write/create-replace/delete refusals. One changed copied byte, one omitted switch row relabelled in the manifest, one changed live-prefix byte, and one post-receipt MANIFEST byte each turn their relevant check red; a later live switch append leaves the fixed snapshot unchanged and valid.
- **State:** pending Coltrane's exact-ref implementation review. No install, snapshot creation or OBJ-2 adjudication occurs before PROCEED.

`REVIEWER: claim-only · name the objects that settle whether the recursive grant is sufficient and the other states consistent with them · HIT — later production writes collapse the ACL masks, so the immediate whole-tree check is not durable · re-derived y`

`REVIEWER: claim-only · name the objects that settle whether the fixed snapshot is faithful and reviewer-immutable and the other states consistent with them · LIMIT — byte fidelity is not semantic completeness; retain the manifest SHA outside the snapshot and exercise the real Linux deploy boundary · re-derived y`
