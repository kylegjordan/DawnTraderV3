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
