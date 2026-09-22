# B-PRICE-SIDE-BY-JOB rows `8a-P3` + `8a-P4` — PROGRESS REPORT — OPEN: waiting on `8a-P4c` (VTS xStock) and the xStock trigger re-land

**Status:** `STEP: 10 of 11` (governance landed 2026-09-22) · `NEXT STEP: 11 of 11`, as an honest progress report. **This is not a completion report.** Kyle, 2026-09-15: the exit/fill-side work is one batch in two halves and is not presented as complete until both land. The crypto half (`8a-P3`) and the paper xStock half (`8a-P4a`, `8a-P4b` with C1) are live; `8a-P4c` (VTS xStock) is not built. *(Until 2026-09-22 this line read "STEP 8 … the xStock half has not started"; the file keeps its `8A_P3` name because every citation points at it.)*
**Scope / audit / plan:** `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P3_SCOPE_AUDIT_AND_PLAN.md` (r4 approved `0b6c93d20`, OBJ-6 restated at Step 4 r3). **Change list:** `Change Lists/B_PRICE_SIDE_BY_JOB_8A_P3_CHANGE_LIST.md` (§6-§7 carry every review round).

---

## 1. WHAT IS LIVE

| deploy | sha | pm2 restart | `pm_uptime` (the anchor) | what it carried |
|---|---|---|---|---|
| 1 | `7e3d64c842becab7d1ad7395919ceae02477e80d` | #622 | 2026-09-15T11:59:22.448Z | the seven crypto cells, the refusal rails, the epoch migration |
| 2 | `91647c9b99e2c0c1c548bab6127134301fd5f6a0` | #623 | **2026-09-15T12:15:04.144Z** | twin log lines tagged with asset class and a literal reason token (`af86443ad`); the VTS no-decision rail made crypto-only (`91647c9b9`) |

**Reviews:** Langston Step 4 approved `aecb8b15d`, cleared `68b270867` and `7e3d64c84`, approved `af86443ad` + `91647c9b9` together. **CI, per job, all four green:** `16ab0293b` run 34962177445 · `57d89095e` 34963990727 · `aecb8b15d` 34965015133 · `68b270867` 34965361128 · `7e3d64c84` 34965754189 · `af86443ad` 34966716982 · `91647c9b9` 34967136817.
**Rollback:** `66ff8d70299fde2ff2a9e4cd050b460739d78f4d`, after running `2026-09-15-b-price-side-8a-p3-vts-crypto-epoch-rollback.sql` by hand.

⛔ **EVERY `8a-P3` MEASUREMENT WINDOW ANCHORS ON `pm_uptime` OF DEPLOY 2 — 2026-09-15T12:15:04.144Z** — not on `deployed_at` (a post-check stamp that runs late), and not on deploy 1: between the two, the twin lines were class-blind.

**`pm_uptime` IS THE CODE-LIVENESS BOUNDARY, NOT THE DATA-VALIDITY BOUNDARY (Langston).** State that cold-starts after boot gets its own, separately named instant, and a row is cited only from it:
| state | data-validity instant | read |
|---|---|---|
| VTS crypto touch sides (the `vtsSimulation` bucket) | first `[PriceCache][vtsSimulation] refreshed` after boot: **2026-09-15 12:16:07Z** | out.log; the first `[8a-P3][VTS_TOUCH]` after boot is the same second (`exitLooks=39`, `exitNoTransactableSide=0`) |
| paper crypto entry-fill sides (the `openTrade` lane) | first `[PriceCache][openTrade] refreshed` after boot: **none yet** — no crypto position is held, so the lane has no members | read per window at Step 7 |
| book state, per xStock symbol | the first frame with `validated=true` after that symbol's seed. MDB/USD seeded 12:15:12.373Z and read `validated=false framesSinceSeed=0` at 12:15:13Z | read per symbol at Step 7. ⚠️ No `8a-P3` crypto figure reads book state; this row exists so a book-state window never cites seeded frames |

## 2. THE DEPLOY-TIME RECORD (Langston's carries, written at the deploy, not afterwards)

**Carry 1 — the stale alert.** `651193b5-ca7d-4782-b2b8-3199615f8125` (`book-state-hollow-paper-MDB/USD`) resolved 2026-09-15T12:00:05.932Z by `cc-c` with the deployed sha as evidence, freeing the dedupe key so MDB/USD can mint the corrected body (`68b270867`).

**Carry 2 — a population boundary.** Deploy 2's `pm_uptime` (12:15:04.144Z) splits every window whose instrument reads book-state. Deploy 1 (11:59:22.448Z) is a second boundary inside a 16-minute pre-window that nothing in this batch is measured across.

**Carry 3 — what the cold seed is NOT.** MDB/USD re-seeded at 12:15:12.373Z (`mid=377.25 spread=0.00663`) on an empty retained-spread ring, i.e. **vacuously plausible**. That clears the absorbing state without exercising any clear path. ⛔ **Post-deploy quiet on MDB/USD is not evidence that `B-BOOK-STATE-RESEED-ESCAPE` (`3b.f-e`) is unneeded, and may not be cited for it.** The same held at deploy 1: 0 `REFUSE unvalidated` lines on MDB/USD in the five minutes after 11:59:22Z, against 1,481 frames before it.
⚠️ **MDB/USD is simultaneously in the exit freshness-skip class** (alert `02944001`, mark 360 s against a 300 s ceiling, still active). No MDB cold-seed observation is read without saying so.

## 3. WINDOW-OPEN STATE (Langston's `af86443ad` conditions)

**Excluded pre-window, 11:59:22.448Z → 12:15:04.144Z — counted, not assumed empty.** Instrument: `grep` over staging `out.log` + `error.log`, whose reach starts 06:55:26Z and therefore covers the window; `TWIN_SKIPPED` returning 2 is the positive control that the pattern matches.

| line | count in the excluded window |
|---|---|
| `[VTS][TWIN_OPENED]` | 0 |
| `[VTS][TWIN_SKIPPED]` | **2 — per class: xStock 2, crypto 0.** 12:07:57Z `MARA/USD/sma_trend_ride` and 12:08:27Z `OKLO/USD/sma_trend_ride`. ⚠️ The class is read from the SYMBOL against the xStock universe, not from the line (the line carried none) — an out-of-band reading, stated as such |
| `[VTS][TWIN_FAIL]` | 0 |
| `[VTS][TWIN] … not in openVirtualTrades` | 0 |
| `MAKER_RESTED` (paper + VTS) | 0 (crypto 0, xStock 0) |
| `[8a-P3][VTS_TOUCH]` passes (deploy-1 code) | 6 in 12:03:25-12:08:25Z, crypto `exitLooks=39` each — excluded from every window, cited only in §4 as path evidence |

For the OBJ-5 and OBJ-6 lines, every other excluded count is 0 in both classes, so their exclusion cannot correlate with what they measure at a size that matters.
⚠️ **OBJ-2 IS DIFFERENT: its own population WAS excluded** — about **234 VTS crypto exit looks** (6 passes × `exitLooks=39`) ran on deploy-1 code in the span. They are OBJ-2's measured population, not an adjacent one, and they are excluded from both of OBJ-2's windows.

**Twin switch at window open** — read site `module_constants` (`module_name='maker_taker'`, `constant_name='twin_enabled'`), by psql on staging at **2026-09-15 12:15:55Z**: `crypto_spot` = 1, `xstock_spot` = 1, both `updated_by p19-b7-2c` 2026-07-02. **Re-read at the same site at window close.**
⛔ **FLIP RULE, pre-registered before any data:** a flip on either class mid-window **splits** the window at the flip instant; if either side of the split is below its n-floor, the twin arm is **void** for that window (the F-G-2 A4 precedent). Neither side alone may claim a result below its n-floor.

**n-floors, named before the window collects anything:**

| quantity (crypto only, from deploy 2's `pm_uptime`) | n-floor below which only counts are published, never a ratio |
|---|---|
| OBJ-6 primary rests, per lane — numerator `MAKER_RESTED … ask=none` | denominator A (all `MAKER_RESTED`) ≥ **30**; denominator B (+ `MARKETABLE_TAKER_FALLBACK` + `MAKER_MARKETABLE_DROPPED`) ≥ **30** |
| OBJ-6 twins — numerator `TWIN_OPENED` maker `ask=none` | denominator (`TWIN_OPENED` maker + `TWIN_SKIPPED … reason=marketable_maker`) ≥ **30** ⚠️ at the ~5-hour base rate of 3 opens / ~26 skips across BOTH classes, this may take days |
| OBJ-5 honest crypto maker fill rate | ≥ **30** post-epoch crypto maker placements |
| OBJ-2 REAL-LANE VTS crypto exit rate per open position-hour, split by close reason — see the OBJ-2 window rule below | Per reason arm, per window: ≥ **30** real-lane crypto closes; AFTER also ≥ **1,000** exit looks. Shadow lane: counts only. ⚠️ The look floor binds AFTER only: `[8a-P3][VTS_TOUCH]` has one emit site and did not exist before deploy 1, so BEFORE is closes over open position-hours. Below any floor, both windows publish counts only and no rate comparison is made |

**OBJ-2 WINDOW RULE — fixed before the data (Langston's objections folded; the r1 clock-keyed burst rule is WITHDRAWN).**
- **The population is keyed on the LANE, not on the clock.** The VTS crypto close population holds two lanes: `context->>'shadow' = 'true'` is the **reorg-B4 shadow lane** marker (`vts-runner.ts:1006`, the flag that splits boot rehydration), NOT F-G-2's shadow arm. Langston's read of BEFORE (`vts_open_trades` closed crypto, 12:36:07Z): **1,107 closes, 1,056 shadow-lane, 51 real-lane**, and the shadow lane's mass arrives in bursts unrelated to the clock (125 closes in 7 seconds at 12:32:07Z). ⇒ **OBJ-2 is measured on the REAL lane** (`context->>'shadow'` absent); **the shadow lane is published as its own arm, counts only.** A clock burst rule would have removed 94% of BEFORE and still left a residue 61% shadow. *Withdrawn with it, one line each: the bursts were "scheduled at 00:00, 07:00 and 19:00Z" — one day read as a pattern; "both spans contain a 00:00Z hour, so it bites symmetrically" — false, BEFORE holds that hour whole and AFTER holds 16 minutes of it.*
- **Split by close reason, not pooled.** A bid trigger moves stop-outs and target-hits in opposite directions, so a pooled rate can read flat while both legs move. Real-lane reasons come from `[11.6][Exit] … closed via <reason>` (`vts-runner.ts:3984`, `resolveOpenVirtualTrades`); `vts_open_trades` and its `context` carry no close reason. That line carries no asset class and no trade id, so reasons reach the real-lane crypto rows only through a join.
  - ⛔ **THE JOIN RULE, pre-registered.** Key = (`symbol`, `closed_at` truncated to the second) on `vts_open_trades` real-lane crypto rows, against (`symbol`, log timestamp second) on `[11.6][Exit]` lines. A key with exactly one row and one line is **matched**. A key whose row count and line count differ, or whose lines disagree on reason, is **ambiguous**: its rows get a reason only if every line in the group carries the same one, otherwise they stay unassigned. A row with no line at its key is **unmatched**. **Matched, ambiguous-group and unmatched counts are published beside the reason split, on both windows.** ⛔ **Ambiguity is directional** (a group's majority reason is `stop_hit` almost every time, so assigning it can only pad the leg that moves), so OBJ-2 is published twice from the same counts: **PRIMARY = matched rows only; SENSITIVITY = matched + ambiguous-assigned**, each with its n. Different sign ⇒ the read is published as **not comparable** and superseded onto `B-EXIT-LINE-IDENTITY`. ⚠️ The preserved BEFORE file's 101 lines (97 / 4) span BOTH classes: they are never set beside the real-lane crypto denominator (51 in BEFORE).
  - **The UNMATCHED FRACTION is published per window, side by side.** Unmatched rows leave the reason numerators but stay in the open-position-hours denominator, so they bias every arm down; if the fraction differs BEFORE vs AFTER, the comparison is confounded in a direction nothing else here catches.
  - ⛔ **WHAT INCONCLUSIVE-EXTEND BUYS, SAID NOW:** with `target_hit` at about 1 real-lane crypto close per 12 hours, a 30-floor on that arm needs roughly 15 days PER WINDOW. So "stop leg moves, target leg below floor" is the near-certain outcome, and a longer clock is not the instrument that fixes it. ⇒ **OBJ-2 is published at the fixed extract as a descriptive read — both legs' counts, the stop-leg rate pair, the unmatched fractions — and is NOT the batch's verdict on the bid switch.** ⛔ **That includes the stop-leg rate pair:** it is computed off the same symbol-and-second join, so it may not be quoted anywhere as a partial verdict — the extract says so in its own words when it is published. That verdict rests on OBJ-1 (divergent fixtures plus stamped decision prices) and OBJ-3 (booking at the bid). The target-leg comparison is not extended inside `8a-P3`: a multi-day real-lane read of both legs starts once `B-EXIT-LINE-IDENTITY` puts the trade id on the reason line, and it is not held against this batch's close. *(The key is not 1:1 — Langston measured on BEFORE's 51 real-lane crypto rows: 6 duplicate groups, e.g. CRV/USD 09:12:23 with 3 rows and 2 lines; three groups with 2 rows and 1 line; AKE/USD 10:34:23 with no line. The emitter is NOT changed mid-window, which would split it; its fix is homed below.)*
  - ⛔ **THE TARGET LEG CANNOT BE READ, SO THE SPLIT CANNOT BE EXERCISED, AND THAT IS PRE-REGISTERED.** On BEFORE's 51 real-lane crypto closes the split is about **49 `stop_hit` / 1 `target_hit`** (Langston, first-match). The target leg is the countervailing signal a bid trigger would move the other way, so at n = 1 it is unreadable. ⇒ **`target_hit` publishes counts only; if the stop leg moves while the target leg is below its floor, the read is published as not comparable and superseded onto `B-EXIT-LINE-IDENTITY`** (no clock is extended inside this batch). A stop-leg-only move is not this batch's answer.
- ⛔ **BEFORE's reasons are preserved NOW, not at extraction** (`out.log` rotates on a ~2-day floor): all 101 `[11.6][Exit]` lines in 2026-09-14 23:59:22.448Z → 2026-09-15 11:59:22.448Z, from `out__2026-09-15_00-00-00.log`, `out__2026-09-15_06-55-22.log` and `out.log`, saved at 12:38Z (file mtime) to staging **`/home/deploy/8ap3_before_exit_lines_2026-09-15.txt`** (outside the deploy worktree). Both classes, by reason: `stop_hit` 97, `target_hit` 4. The shadow lane has no per-close reason line (`[9.2][EXIT]` is per tick; `[reorg-B4][SHADOW_RESOLVE]` is a per-pass count), so its arm has **no reason split**.
- **Spans, equal and fixed:** BEFORE = 2026-09-14 23:59:22.448Z → 2026-09-15 11:59:22.448Z; AFTER = 2026-09-15 12:16:07Z → 2026-09-16 00:16:07Z; **extracted at 2026-09-16 00:16:07Z.** BEFORE crosses no restart (pm2 `restart_time` 621 at the 09-14T21:33:29Z deploy, 622 at deploy 1, 623 at deploy 2 per Langston's read).
- ⛔ **RESTART RULE, for every `8a-P3` window:** any restart or deploy inside a window **splits** it at that restart's `pm_uptime`; neither side below its n-floor may claim a result.
- **Window ends are fixed instants only.** OBJ-2 as above; OBJ-5 and OBJ-6 end at **2026-09-22 12:16:07Z**. If Step 11 would land before an end, the objective is published as-of that moment with its n and marked **INCONCLUSIVE-EXTEND** — except OBJ-2, whose below-floor and different-sign outcomes take the not-comparable, superseded-onto-`B-EXIT-LINE-IDENTITY` wording above, never this marking — the author does not get to choose the stop either.

**Reading rules carried from review:** `TWIN_FAIL` and the not-in-openVirtualTrades warn are published beside every twin figure, even at zero; the twin numerator is read as a ratio only once at least one crypto `ask=none` line exists in the window, otherwise it is "0 of N with no observed positive"; and every figure here is `console.log` in `out.log` (rotates several times a day, ~2-day floor), so lines are **extracted inside the window as it runs**, not looked back at.

**Pre-registered, from the plan:** VTS exit touch refusal ≈ 0 with the `vtsSimulation` bucket at 157-159 symbols per pass; paper entry-fill STEADY-STATE refusal ≈ 0 while the `openTrade` lane is healthy (FIRST-LOOK refusals are expected and are counted separately).

## 4. STEP 7 EVIDENCE SO FAR

- **The new code is the running code.** `EVAL_EXIT` prints the new `entryFillLooks / entryFillRefusedFirstLook / entryFillRefusedSteady` fields after deploy 1 (fields that do not exist in the prior build).
- **Epochs moved exactly as asserted** (read after deploy 1): `vts/crypto_spot` 5 → **6**; `paper_sim/crypto_spot` **created at 3** (= `paper_sim/*` 2 + 1); every other epoch row unchanged (`*/live` 2, `*/paper_sim` 2, `*/vts` 3, `xstock_spot` live 3 / paper_sim 4 / vts 7).
- **VTS crypto exits are being decided on the bid, with no refusals, between the deploys:** `[8a-P3][VTS_TOUCH]` 12:03:25-12:08:25Z, six passes, `exitLooks=39` each, `exitNoTransactableSide=0`, `bookedNoBidClamp=0`. Shadow lane `looks≈990`, `noTransactableSide=0`. ⚠️ **Pre-window evidence, deploy 1 — cited only as "the path runs and does not refuse", never as a window figure.**
- **No VTS no-decision escalation fired** (0 lines, and 0 `no-trigger-vts-*` alert rows, read 12:16:37Z). ⚠️ That is because deploy 2's restart reset the streaks before any reached 10 minutes, not because the rail was quiet on its merits.
- **UI (Claude-in-Chrome, `/paper-trading`, 12:04Z):** the Paper Trading page renders — open trades 5 / 15, realized balance, activity, per-class and per-strategy tables. ⚠️ No crypto close has happened since the deploy, so OBJ-7's "new crypto closes render with sane exit prices" is **not yet verifiable**; the tab-level check waits for one.
- **Deploy-drift rung 2 (`87b7b591`) cleared on its own after deploy 2** — absent from the active, unacknowledged set at the next read, as expected with staging at the branch head.
- **Not caused by this batch, measured:** the KrakenWS `Cannot read properties of undefined (reading 'toUpperCase')` parse error ran 4 times today before deploy 1 and once after.

## 5. STEP 7 FINDING — THE VTS NO-DECISION RAIL PAGED ON THE WRONG POPULATION (fixed in deploy 2)

After deploy 1 the rail's open-streak map grew 0 → 53 → 55 → 60 between 12:04:25Z and 12:08:25Z while crypto `exitLooks` held at 39 and `exitNoTransactableSide` at 0. The rail keyed on every trade the evaluator could not decide, whatever its class, so it was heading for pages at ~12:15Z on a population this crypto batch never scoped — including, possibly, the off-hours xStock staleness case Kyle's `#994` ruling says must not page.
⛔ **THE CLASS MIX OF THOSE STREAKS IS UNMEASURED, AND NOW UNRECOVERABLE (Langston Step-4 C1).** `no_usable_mark` fires before `no_transactable_side` in the evaluator, so BOTH classes can produce it; `exitNoTransactableSide = 0` bounds crypto's no-side count and says nothing about the mix. Langston asked for the streaks to be enumerated by class before deploy 2; his condition arrived at 12:16:51Z, after deploy 2 had reset the map at 12:15:04Z. ⇒ **If any were crypto `no_usable_mark`, a crypto page after deploy 2 is the rail working, not the fence failing** — pre-registered here. The `vts-runner` code comment beside the fence still says the extra streaks "were xStock"; it is corrected with the `8a-P4` twin-line edits (a comment-only change is not worth a runtime file sitting undeployed and re-arming the drift rung). **Fix (`91647c9b9`):** the streak opens only for `crypto_spot` trades; crypto `no_usable_mark` still counts, as Langston's r2 ruling requires. An xStock no-decision rail belongs to `8a-P4` under the `#994` notify rules.
*Correction, one line:* I first wrote that at least 21 of the 60 streaks were xStock; that was an inference, not a measurement. The map size prints before the pass-end prune, so it gives no floor at all; only a post-prune count is citable.
⚠️ **FROM DEPLOY 2, `openNoTriggerStreaks` IS A CRYPTO-ONLY GAUGE (Langston C2).** It is never set beside the pre-fence 53-60: two populations across a deploy boundary.

## 5b. THE EXTRACT — 2026-09-16 00:16:07Z, run to the pre-registration

**Window integrity:** pm2 `restart_time` 623 and `pm_uptime` 2026-09-15T12:15:04.144Z at the extract — unchanged, so **no restart split either window**. `twin_enabled` re-read at close: `crypto_spot` 1, `xstock_spot` 1, `updated_by p19-b7-2c` — **unflipped, so the flip rule has nothing to split.** Epochs at close: `vts/crypto_spot` 6, `paper_sim/crypto_spot` 3.

### OBJ-2 — real-lane VTS crypto exits (DESCRIPTIVE, not the verdict; the stop-leg pair rides the same join and may not be quoted as a partial verdict)

| | BEFORE (12h to 11:59:22.448Z) | AFTER (12h from 12:16:07Z) |
|---|---|---|
| real-lane crypto closes | **51** | **63** |
| open position-hours (real lane) | 655.2 | 302.8 |
| closes per open position-hour | **0.078** | **0.208** |
| matched / ambiguous groups (rows) / unmatched | 37 / 6 (13) / 1 | 34 / 14 (28) / 1 |
| **unmatched fraction** | **0.020** | **0.016** |
| PRIMARY (matched only) | stop 36 · target 1 | stop 32 · target 2 |
| SENSITIVITY (+ambiguous-assigned) | stop 49 · target 1 | stop 56 · target 4 · timeout 2 |
| exit looks (floor binds AFTER only) | n/a by construction | **18,032** ≥ 1,000 ✔ |

⛔ **The target leg is below floor on both sides (1 and 2 against 30), so OBJ-2 is published as NOT COMPARABLE and superseded onto `B-EXIT-LINE-IDENTITY`.** The stop leg is above floor on both PRIMARY and SENSITIVITY and both move the same direction with the rate, but per the pre-registration that is a descriptive read only. The unmatched fractions are close (2.0% vs 1.6%), so the denominator bias does not differ materially between windows.
**Shadow lane, counts only:** BEFORE 1,056 closes, AFTER 433.

### OBJ-3 — VTS crypto booked exits (`exit_decision_archive`, `mode='vts'`)
AFTER: 45 `SL_hit`, 3 `TP_target_hit`, 2 `time_stop`, **all 50 with a booked exit price**; BEFORE: 44 `SL_hit`, 1 `TP_target_hit`. Stop-leg average R: **−1.0762 AFTER vs −1.0777 BEFORE**. ⚠️ **LIMIT, STATED: the archive does not record the bid**, so "booked at the bid" is not directly readable from it. What is readable: **`bookedNoBidClamp = 0` over 720 passes** — no crypto close fell to the clamp arm — plus the resolver's own fence. OBJ-3 is therefore **partially verified**: the arm that would show a failure is silent and proven live by its unit fence, but no row-level bid comparison exists in the DB.

### OBJ-5 and OBJ-1's paper legs — NO POPULATION, and the instrument is proven live
The paper crypto lane **opened nothing in the window**. Controls: `closed_trades` opened since the cutover = **10 rows, all xStock**; closed inside AFTER = **11, all xStock**; the newest crypto paper row opened **2026-09-14 23:29:25Z**, ~13 h before the cutover; open positions at the extract = **4, all xStock**. The same queries return xStock rows, so this is a real **0 of 0**, not a dead instrument. ⇒ **OBJ-5 (honest crypto maker fill rate) and OBJ-1's paper entry/exit legs are UNMEASURED for this window and carry forward.**

### OBJ-6 — the permissive no-ask arm, crypto only
| arm | window count |
|---|---|
| numerator `ask=none` (rests and twins, all lanes) | **0** |
| denominator A — crypto `MAKER_RESTED` | 16 (paper 9, VTS 7) |
| denominator B — A + crypto `MARKETABLE_TAKER_FALLBACK` 4 + `MAKER_MARKETABLE_DROPPED` 34 | 54 |
| twins — `TWIN_OPENED` 16 + `TWIN_SKIPPED reason=marketable_maker` 9 | 25 |
| `TWIN_FAIL` · not-in-`openVirtualTrades` | 0 · 0 |
⛔ Every denominator is **below its 30-floor except B (54)**, and the numerator is 0 with **no observed positive anywhere in the window** — so this is "**0 of N with no observed positive**", never a rate. xStock twins in the same window: 139 `marketable_maker`, 9 `degenerate_fallback` — the class tags work, and pooling them would have been the contamination Step 4 r3 CONDITION-1 caught.

### The rails, over 720 VTS passes and 28,783 paper frames
`exitLooks` 18,032 · `exitNoTransactableSide` **72 (0.40% of looks)** · `entryFillLooks` 156 with **0** first-look and **0** steady-state refusals · `bookedNoBidClamp` 0 · **0** escalations · **0** `ENTRY_FILL_RECORD_FAILED` · paper `noTriggerRefusals` 0 · **`exitEvalHit` 15 — the first non-zero hit count on this path, which `8a-P2` closed without.**
⚠️ The 72 no-transactable-side refusals sit **above** the pre-registered "≈ 0" for the VTS exit ceiling. They are 0.40% of looks and produced no escalation (no single trade reached 10 minutes), but the pre-registration said ≈ 0 and this is not 0: **carried to Step 8 as an open question for Langston, not explained away here.**

## 5c. STEP 8 — LANGSTON CONFIRMED THE EXTRACT (2026-09-16 00:33:51Z) ON TWO CONDITIONS, DISCHARGED 2026-09-18

**Read state:** pm2 `restart_time` **623**, `pm_uptime` **2026-09-15T12:15:04.144Z** — unchanged, so every in-memory counter below is deploy 2's LIFETIME, not the §3 window. Funnel snapshots on staging: `/home/deploy/8ap3_funnel_20260918T190235Z.json`, `…_20260918T190309Z.json` (T2), `…_T3.json` (T3, 19:04:46Z) — `/api/xstocks/filter-diagnostics` → `vtsEvaluation.levelBasisFunnel`.

### C1 — the 72 by reason
| cell (crypto, lifetime to T3) | attempted | accepted | refused | refusals by reason |
|---|---|---|---|---|
| `vts_exit_trigger` **ladder** (the decision) | 463,596 | 462,259 | **1,337** | **`implausible_ticker_spread` 1,337** · `stale_ticker` **0** · every other reason 0 |
| `vts_exit_trigger` book rung (NOT summed with the ladder) | 463,062 at T2 | 21,870 | 441,192 | `no_book` 396,691 · `stale_book` 44,493 · `implausible_spread` 8 — each falls through to the ticker rung |

⇒ **The 90,000 ms age ceiling refused nothing in ~79 hours: its pre-registered ≈ 0 holds.** **Every refusal is the 0.02 spread ceiling — 0.29% of looks.** The pre-registration and the measurement are now in contact on both ceilings.
**Control.** The lifetime check (`ladder.attempted` = lifetime Σ `exitLooks`) is **NOT REACHABLE**: `out.log` now rotates roughly hourly at ~1 GB and keeps 14 files, so its reach on 2026-09-18 starts 06:43:11Z. **The 72 are a subset of the 1,337 by construction** — same process (`restart_time` 623), and the correspondence is mechanical: `tec-evaluator.ts:317` (predicate) / `:322` (reason literal) returns `no_transactable_side` exactly when `triggerPrice === null`, i.e. on the ladder's own refusal, and `vts-runner.ts:3364` increments `exitNoTransactableSide` only on that reason. So `stale_ticker = 0` over the superset means none of the 72 was an age refusal. *(A delta control was also run, T2 → T3: Δ`attempted` 534 = Σ `exitLooks` 267 + 267 carries a positive; its refusal leg was 0 = 0 and is UNEXERCISED.)*
**The entry-fill pointer:** `vts_entry_fill` ladder 4,839 / **9** refused, all `ticker_age_unknown` (not `stale_ticker`); `active_entry_fill` 542 / 0.

### C2 — the rail fired at least four times; four is a floor · **Step 8: C1 and C2 DISCHARGED by Langston 2026-09-18 19:38Z (re-derived at `efd3820e0`)**
- Langston's measurement, 12-hour extract window: longest unbroken run **9 passes, 22:17:07Z → 22:25:07Z, 8 minutes**, against `VTS_NO_TRIGGER_ALERT_AFTER_MS` = 10 minutes.
- ⛔ **The escalation branch has fired live FOUR times, on two symbols** (`created_at`; each `no_transactable_side`, i.e. the 0.02 spread ceiling):
  | id | symbol | created | resolved by |
  |---|---|---|---|
  | `97b42aac` | KII/USD | 09-16 06:49:08.307Z | `langston` |
  | `4c78851e` | FOLD/USD | 09-17 00:57:09.234Z | `langston` |
  | `21c7e12e` | FOLD/USD | 09-17 07:05:09.546Z (`fired_at` 07:07:26.966Z), trade `vts_FOLD_USD_strong_bull_trend_1789598409624` | `cc-c`, after 36 h active |
  | `11b62e77` | KII/USD | 09-17 23:32:10.704Z | `langston` — *"CONDITION STILL LIVE at resolve time"* |
- ⛔ **FOUR IS A FLOOR, NOT A COUNT.** The dedupe key is per SYMBOL (`no-trigger-vts-${symbol}`) while the streak is per TRADE, and a non-resolved row blocks every later mint on that symbol — so the rail reports at most one event per symbol per human resolve.
- **The cost is per-trade minutes, not per-look percentage:** ≥ 4 crypto VTS trades went more than 10 minutes with no exit evaluation in ~79 h, and a refused cycle is a dropped observation — high-water mark, latches, rung ladder and the 2-tick detector do not advance — the early return at `tec-evaluator.ts:317-324` sits above `tecUpdatePosition` (`:401`) and `tecShouldClose` (`:475`).
- **0.02 is KEPT (Langston agrees), because it fails safe:** a stop booked off a spread wider than 2% is a price nobody would take.
- **§9.4 dispositions (Langston):** (1) **added to `8a-P4`** — key the rail's dedupe on the trade id, and give it a re-arm that does not depend on a human resolving a row; (2) **`HOME: B-VTS-NO-DECISION-VALVE, owner CC-C, placed in PHASE_19_PLAN at 3n, after 8a-P4`** — a refusal has no time bound, and the trade ages toward the 7-day max-hold, which books a timeout at the mark. A policy decision, not a fix.
- Retained reach, 2026-09-18 06:43:11Z → 19:06:13Z, **744 passes**: `exitNoTransactableSide` **103 / 185,720 looks (0.055%)** · longest run **8 passes, 15:36:13Z → 15:43:13Z, 7 minutes** · max `openNoTriggerStreaks` 4 · `bookedNoBidClamp` 0.
- `openNoTriggerStreaks = 1` is the simplest reading of a line that carries no trade id, **not a measurement** — it cannot tell one 8-minute trade from eight 1-minute ones. **§9.4 disposition 2: the trade id on the streak line is ADDED to `B-EXIT-LINE-IDENTITY`.**
- ✅ **`openNoTriggerStreaks` = `exitNoTransactableSide` in all 720 extract passes and all 744 retained passes ⇒ ZERO crypto `no_usable_mark` in both.** Every crypto no-decision was a no-side. This discharges the §5 carry in the negative.
- **The SENSITIVITY `timeout 0 → 2` row is fenced:** both are `VVV/EUR` and `VVV/USD`, `duration_min` 10,080.52 — seven days to the second — both booked 23:40:07Z. A max-hold cohort clock landing inside AFTER, **not an exit mode the bid switch created.**

## 5d. THE PAPER CRYPTO POPULATION ARRIVED — read 2026-09-18 ~19:00Z

Since deploy 2: **15 paper crypto opens, 12 closes** (8 `target_hit`, 4 `stop_hit`), 3 still open.

### OBJ-1, paper legs — PASS on the legs the DB can read
| leg | post-deploy | pre-deploy control (crypto, 2026-09-01 → deploy 2) |
|---|---|---|
| **C2** rested target exits: `exit_decision_price` **strictly below** `exit_book_mid` | **8 / 8**, and ≥ the rested limit 8 / 8 | **0 / 18** below; **18 / 18 equal the mid** ⇒ the criterion fails on old rows, as required |
| **C1** maker entry fills: `entry_decision_price` **below the limit** (the ask) | **4 / 4** | **29 / 29 equal the limit** |

⚠️ **C1's "strictly above the mid" leg is NOT READABLE** — no entry-side mid is persisted (metadata keys checked on `05b66d74…`). Stated as unmeasured.
**VTS C3:** `[P19-B7.2c][VTS][MAKER_FILLED]` over the retained reach — **52 crypto fill lines, ask ≤ limit in 52 / 52.** *(The line was missing from the collector's patterns until this read; backfilled from all 14 retained files.)*

### The taker stops — `8a-P2`'s trigger, not an `8a-P3` cell, reported because the question was whether the closes were right
4 `stop_hit`. `exit_decision_price` is the **mark** (`aee` `:2661` `decisionPrice: currentPrice`) and equals `exit_book_mid` on 4 / 4. **In 3 / 4 (CRV, INJ, FOLD) that mark was still ABOVE the stop when the stop fired ⇒ the trigger was not the mid.** Fills walk the book: CRV 0.007%, INJ 0.08%, FOLD 0.13% below the stop; **WLD 0.90% below** — its mark was already below the stop at the decision (gapped between ticks), book 13 ms old, depth 4 ms.
⚠️ The comment at `aee` `:2656-2658` says the decision price *"IS the exit price … by construction"*; on crypto the fill walks the book (CRV 0.30636 vs 0.306605). A label, not behaviour. **Disposition: added to `8a-P4`**, which reworks this path for xStock.

### OBJ-5 — counts only
- **Exit rests:** **8 fill / 0 convert** post-epoch (n = 8, below the 30-floor).
- **Entry rests:** 4 fills over the whole window (DB). Placements are readable only in the retained reach: **77 paper crypto `MAKER_RESTED` lines = 2 real placements (USELESS, AERO — both filled) + 75 PHANTOM rests** (RAY 61, UAI 11, VVV 3) whose position insert then failed on **`#1063`** (`pattern_type` `"ABCD"`), joined by symbol within 3 s in `error.log`. ⛔ **A `MAKER_RESTED` line is printed BEFORE the insert commits, so a line is not a placement.** **Disposition: the rest line moves after the insert — added to `8a-P4`** (it already owns the no-ask placement policy on both lanes). The `ABCD` failure itself is `#1063`, placed at `3m-ENUM`; still firing — 392 to 2,486 failed inserts a day on 09-14 → 09-17 (one log line per failure, read by file date).
- **Age refusals beside the rate:** `active_entry_fill` 542 / 0 · `vts_entry_fill` 4,839 / 9 (`ticker_age_unknown`) · VTS pass counters in reach `entryFillLooks` 1,399, refused first-look 2, steady 2.

### OBJ-6 — retained reach 2026-09-18 06:43:11Z → 19:06:13Z
Numerator `ask=none` **0 on every lane.** Paper A = **2** real rests (77 lines − 75 phantom) · B ≤ **66** (2 + fallback 53 + dropped 11; the fallback lines were not joined to `#1063` failures, so B is an upper bound) · VTS A 5, B 8 · **twins, crypto: `TWIN_OPENED` maker 63 + `TWIN_SKIPPED reason=marketable_maker` 46 = 109 ⇒ 0 / 109**, above its floor. The paper dropped-arm count excludes 11 untagged `[OPEN_FAILED] stage=MAKER_MARKETABLE_DROPPED` companion lines, one per drop.
⛔ **EXCLUDED SPAN, counted as UNKNOWN, not assumed empty: 2026-09-16 00:16:07Z → 2026-09-18 06:43:11Z** — the lines were not extracted while retained. `MISTAKE: skipped-the-gate [B-PRICE-SIDE-BY-JOB 8a-P3] — §3 pre-registered extraction inside the window; I did not keep it running and the rotation (now ~hourly) took the span.` The collector `/home/deploy/8ap3_collect.sh` now greps each rotated file once into `/home/deploy/8ap3_lines/`.

### OBJ-7 — UI PASS
Claude-in-Chrome, staging → Paper Trading → **Closed Trades**, 2026-09-18 ~19:07Z: all 12 post-deploy crypto closes render with entry, exit, target and stop equal to the DB rows (e.g. AERO 0.6299 → 0.6589 TAKE PROFIT; WLD 0.4352 → 0.4186 STOP LOSS), and the 8 rests show "MAKER — rested, filled".

## 5e. THE xSTOCK HALF, PART 1 — `8a-P4a` + `8a-P4b` DEPLOYED, STEP 7 (CC-C first pass, 2026-09-19)

**Deploy (joint, with CC-B's `B-FEED-MISMATCH-FIX`, which sits under `8a-P4b` in the branch — no sha carries one without the other):** `dt-deploy 323ae277641368acb057e8ffa7643894aa1c2799 --by cc-b`, record `deployed_at` 2026-09-19T00:02:43Z. `_migrations`: `2026-09-18-b-price-side-8a-p4b-paper-xstock-epoch.sql` 00:02:32.734Z, then CC-B's `2026-09-19-b-feed-mismatch-fix-close-fill-contract.sql` 00:02:32.797Z. **Engine restart `pm_uptime` 2026-09-19T00:02:33.231Z — the anchor for every `8a-P4` window.** Previous good sha `91647c9b99e2c0c1c548bab6127134301fd5f6a0`. Reviews: `8a-P4a` Step 4 APPROVED at `82a55bd00` (nits folded `e413c0983`); `8a-P4b` Step 4 APPROVED at `00ba34873` (r2), residuals `323ae2776`; CI 4/4 per-job on each graded head (runs `35406705232`, `35407191468`, on a temporary branch because every push cancels the review branch's in-progress run).

| check | object · population | result |
|---|---|---|
| **Epoch bump** | `module_constants` `calibration_epoch`, the 8 `*`-keyed rows, read 00:06Z | `xstock_spot/paper_sim` **4 → 5**, `xstock_spot/vts` **7 → 8**; the other six unchanged (`*/live 2`, `*/paper_sim 2`, `*/vts 3`, `crypto_spot/paper_sim 3`, `crypto_spot/vts 6`, `xstock_spot/live 3`). **PASS.** |
| **The stranded chains end** | `error.log` from the restart; the four held paper xStock positions | every chain cold-seeded at 00:02:42.9Z (`REFUSAL_BASIS seedImplausible=false … retainedMedianNow=none`, all four: LOW, AMC, ANET, MDB), refused `no_comparator` then `validated=false framesSinceSeed=0`, then acted. ⚠️ **This is the RESTART, not the escape** (plan §A8: the deploy cold-seeds the live locks) — `SEED_ESCAPED` is 0 lines so far and is read at Step 8 against §A8, from the Monday 00:00Z reopen. |
| **X3 — the stop fires on the BID** | the one xStock close since the restart | **LOW/USD `stop_hit` at 00:02:47.144Z**, 4 s after the restart (the two refused ticks FINDING-3 predicted, then action). Log: `EXIT_TRIGGER symbol=LOW/USD type=stop_hit trigger=192.5 mark=192.915` — **the trigger is the bid, not the mark.** Row: `exit_ticker_bid` 192.50, `exit_ticker_ask` 193.33, stop 193.4709, `exit_price` 192.50, net −$5.35. ⚠️ Not discriminating on its own (the mark 192.915 was also below the stop); the discriminating fact is `trigger=` ≠ `mark=`. ⚠️ `exit_decision_price` on the row is 192.915 — the MID: the exit seam does not record the decision basis. That is `#1064` (row `3n.q6`), homed, not a defect in the price. |
| **LOW/USD — AFFECTED, recorded** | the position the lock held | held below its 193.4709 stop by the seed-implausible lock since the 09-17 20:23Z alert (`ef81571d`, 39 of 40 ticks refused); on 09-18 its captured ticker read 192.32 (below the stop). It closed at the first acting tick after the restart. **The lock's cost is the distance from where the stop would have filled, at its first bid below 193.4709, to the 192.50 fill; that first-crossing bid is not reconstructed here.** |
| **P2 — the per-class refusal counter** | `EVAL_EXIT` lines after the restart | live: `noTriggerByClass=crypto:0/5,xstock:0/3,other:0/0` (8 positions: 5 crypto, 3 xStock after LOW closed). **PASS** (present, additive). |
| **J5 — lane contradiction** | `SENTINEL_LANE` in both logs since the restart | 0. Per Langston: a contradiction would show ONLY on the per-position catch line; zero is expected wiring, not a tested fire. |
| **BLOCKER-1 — crossed books** | `CROSSED_NOT_CAPTURED` / `SIDES_NOT_CAPTURED` since the restart | 0 / 0. ⛔ **PENDING CONTROL, NOT A PASS** (#661 leg 3): the refusal arm is live-unexercised at both sites; silence means no crossed frame reached a decision. |
| **Alert keys re-armed** | `3a85ba22` ANET · `c50238db` AMC · `ef81571d` LOW · `f248f7f0` MDB | all four **RESOLVED** by cc-c 00:03:36-38Z, evidence the deploy sha; never acked. The next stuck chain can now mint the new named alert. |
| **Windows split** | `#1010` P8 and Arm B (CC-B) | one post to CC-B at 00:05Z naming the instant (plan §K). |
| **UI** | Claude-in-Chrome, Paper Trading page → Closed Trades tab | LOW/USD renders top of 808: entry $198.80 / exit $192.50, target $207.541 / stop $193.4709, `STOP LOSS`, net −$5.35 (−3.37%), duration 1d 10h. Header: 8 of 15 slots, matching the engine's 8. Times render in the browser's zone (Asia/Dubai, UTC+4), so 04:02 is 00:02Z. **PASS.** |
| **Not ours** | `TypeError … reading 'toUpperCase'` in the Kraken WS system-message parser, once at 00:02:37Z | pre-existing: 15 / 11 / 15 / 14 on the 09-15..09-18 daily `error` logs. Not introduced by this deploy. |

**Still to read (Step 8, from the Monday 00:00Z xStock reopen — the weekend closed the feed at Sat 00:00Z):** §A8 escapes (`[8a-P4a][BOOK_STATE] … SEED_ESCAPED`, framesHeld vs the prediction); §A9 FINDING-1 (`COMPARATOR_CLEARED reason=seed_escape_recovered` followed by the symbol's next `COMPARATOR_CLEARED` with `ringAfter=false`); `REFUSAL_BASIS` filtered to `seedImplausible=true`; X1 on the first xStock rest fill (`MAKER_FILLED … ask`, `entryPriceSource` `kraken_equities_ws:raw_ask`); X2 on the first xStock rest exit (`EXIT_REST_FILLED … bid`); the hollow-book alerts `b9d7c2bc` / `d262fc8a` / `748f2ba6` re-read now that the chain has a second end.

## 5f. THE xSTOCK HALF, PART 2 — STEP 8 READINGS FROM THE 2026-09-21 SESSION (CC-C, read 2026-09-22 ~06:30Z)

**Anchor:** the live build is CC-B's `40f22a1bb` (contains C1 `084e6605f`; `git merge-base --is-ancestor` true), restart `pm_uptime` **2026-09-20T21:19:29.674Z** — the guard's in-memory state starts there. The xStock feed reconnected at 00:12:32Z 09-21 (watchdog: `open socket silent 9624536ms`, i.e. **~2.7 h measured from the 21:19Z restart**, not a weekend-length silence; alert `eadde564`). **Population: every paper xStock position opened after the restart — three** (`closed_trades`, `opened_at > 2026-09-20 21:19:29`), all closed on 09-21.

| cell | object · population | result |
|---|---|---|
| **X2 — a resting target sells on the BID** | the two `target_hit` rows with `exit_fee_mode=maker`, `exit_rest_outcome=fill` — SPCE/USD (target 3.25573857, closed 17:23:08.494Z) and AMC/USD (target 2.92340000, closed 17:52:42.651Z) · `xstock_spot_ticker_snap` frames around each | ✅ **DISCRIMINATING PASS on AMC:** the captured book sat at 2.92/2.93 from 17:51:04Z (mid 2.925 ≥ 2.9234) for ~95 s with **no fill**; it filled only when the bid reached the limit — `exit_decision_price` **2.93**, which is the BID (X2's decision price is `_restFillPrice = xsBid`). A mark-based fill would have closed ~95 s earlier. ⚠️ **Addition 4, the trap stated:** 2.93 also equals the ASK of the 2.92/2.93 witness frame. It is NOT the ask: X2 has no ask arm on a sell (`_restFillPrice` is `xsBid`), and a 2.93 ask stood for ~95 s without filling. The 2.93 is the bid of the frame that stepped through (the next captured frame is 2.94/2.95). **SPCE:** consistent — `exit_decision_price` 3.26 = the bid of the crossing frame (3.26/3.27, mid 3.265); bid and mark crossed on the same tick, so SPCE alone does not discriminate. ⚠️ Each row's `exit_ticker_bid` (3.25 / 2.92) is the ticker WITNESS from an earlier instant, not the decision frame — do not read it as the fill basis. |
| **X1 — a resting entry fills on the ASK** | the one maker entry: AMC/USD opened 15:50:40.851Z, limit 2.7678, `never_filled` at 16:50:41.295Z · the 854 captured frames in its resting hour | ✅ **DISCRIMINATING PASS (the no-fill arm):** the MID reached ≤ 2.7678 in **21** frames (min 2.765) while the ASK **never** did (min 2.77, **0** frames ≤ limit). A mark-based fill would have filled it; the ask rule correctly held it. ⚠️ The FILL arm (`entryPriceSource kraken_equities_ws:raw_ask`) is **not exercised**: no maker xStock entry filled; the two filled entries were takers — **by `chosen_entry_mode` (`maker` / `taker` / `taker`)**. ⛔ *Corrected (Langston): `entry_price_producer` reads `xstock_ticker_snap_walk` on ALL THREE rows, the maker included, so it is not the taker marker.* **Invocation control (addition 3):** the SAME `evaluatePendingMaker` call returned `drop` at 16:50:41.295Z = placement + 3,600.44 s — the comparator whose fill arm is tested demonstrably ran the whole hour; "the ask never crossed" is not "nothing was evaluated". |
| **The two-tick seed cost (FINDING-3)** | `REFUSE unvalidated` in `error__2026-09-22_00-00-00.log` (covers 09-21 00:00-23:59Z) | 4 lines = 2 per position (AMC, SPCE): `no_comparator`, then `validated=false framesSinceSeed=0`, then acted. Exactly the predicted cost. |
| **§A8 escapes / §A9 `ringAfter` / `REFUSAL_BASIS seedImplausible=true`** | the same file (all three emitters are `console.warn`, so the zeros are on the right stream) | **0 / 0 / 0 — COULD NOT OCCUR, and more days will not discharge them (Langston).** Only AMC and SPCE emitted seed lines all day, and both `REFUSAL_BASIS` lines read `seedImplausible=false … seedRetainedMedian=none retainedMedianNow=none` — the vacuous seed is MEASURED, not inferred. Every restart re-vacates the retained ring, so these need **a window that carries a retained ring across a seed** (a moving chain yields, then a later seed is judged against its ring, with no restart between) **or a constructed exercise**. ⇒ **a forward condition on `8a-P4a`'s own close (row `3n.q2`), made reachable by row `3n.q8` (the restart-durable ring).** |
| **X3 bid-divergence instrument / `CROSSED_NOT_CAPTURED`** | the same file | **0 / 0 — UNEXERCISED (discharges with time):** the opportunity existed and did not arise. Both exits were X2 rest fills, not X3 triggers; no stop was approached. ⚠️ `EXIT_TRIGGER` (with the frame tag) and `COMPARATOR_SEEDED` are `console.log` ⇒ `out.log`, which now rotates every ~20 min (~4.5 h reach) — **the 09-21 copies are gone**; the DB rows and captured frames are the evidence above. |

**⚠️ A COLLECTION GAP I CAUSED, stated (OBJ-5/6 of `8a-P3`):** the line collector ran as a loop in my laptop session and **stopped with it at 2026-09-19 03:24Z**; I did not restart it after the session restart. Collected `out.log` lines run to the rotated file `out__2026-09-19_02-27-58`; the oldest still on disk is `out__2026-09-22_01-12-02` ⇒ **~70 h of `[8a-P3]` / `TWIN_*` / `MARKETABLE_*` lines are unrecoverable** (they are log-only). The loop now runs ON STAGING (`/home/deploy/8ap3_collect_loop.sh`, hourly, self-terminating after 12:30Z) so it cannot die with a session. ⇒ **OBJ-6 is published on the collected reach with the gap named, never as a continuous window. OBJ-5 (maker fill rate) is re-derivable from `closed_trades` (placements and fills are persisted) and is read there.**

## 5g. OBJ-5 AND OBJ-6 AT THE WINDOW END — 2026-09-22 12:16:07Z (CC-C, read 12:17-12:25Z; OBJ-6 REWRITTEN and OBJ-5's age refusals ADDED 12:37-12:50Z on Langston's 12:32:52Z ruling)

**The window and its splits, per the pre-registered RESTART RULE:** 2026-09-15 12:16:07Z → 2026-09-22 12:16:07Z, split at each restart's `pm_uptime`: **S1** → 09-19 00:02:33.231Z · **S2** → 00:54:06.306Z · **S3** → 09-20 21:19:29.674Z · **S4** → window end. **Twin switch** re-read at window close at the same site (`module_constants` `maker_taker/twin_enabled`): `crypto_spot` 1, `xstock_spot` 1, `updated_by p19-b7-2c` 2026-07-02 — unchanged from the window-open read, so **no flip split**.

### OBJ-5 — honest crypto maker fill rate: COUNTS ONLY (every segment below the 30-floor)
Read from `closed_trades` ∪ `active_open_positions` (placements and fills are persisted, so the log gap does not touch this objective), crypto, `chosen_entry_mode='maker'`, `opened_at` in the segment:

| | S1 | S2 | S3 | S4 | window |
|---|---|---|---|---|---|
| **entry rests: placements / filled / never_filled** | 6 / 6 / 0 | 1 / 1 / 0 | 11 / 9 / 2 | 2 / 2 / 0 | **20 / 18 / 2** |
| **exit rests: fill / convert** (`exit_rest_outcome`, by `closed_at`) | 9 / 0 | 1 / 0 | 9 / 0 | 7 / 0 | **26 / 0** |

⇒ **INCONCLUSIVE — below floor in every segment; no rate is published.** ⚠️ `#1063` phantom rests (insert failed) never reach the DB, so these are REAL placements only.

**Age refusals beside the fill counts** (scope OBJ-5: *"without them the rate measures the ceiling, not the market"*):
- **S4 — the level-basis funnel, cumulative since the process start 2026-09-20 21:19:29.674Z** (`pm2 jlist` re-read 12:37Z: unchanged, `restart_time` 626), **read 12:37:12Z**. ⚠️ **It OVERSHOOTS the window end by 21 min 05 s** — the cell is in-memory, cumulative and carries no timestamp, so the overshoot cannot be subtracted. **Ladder rung (the final say):** `active_entry_fill` crypto **472 attempted / 0 refused**; `vts_entry_fill` crypto **2,094 / 31, all `ticker_age_unknown`**. Book rung, context only — a book refusal falls through to the ticker rung and is not a refusal of the fill: VTS 1,191 = `no_book` 995 + `stale_book` 196; active 0. Endpoint: `/api/xstocks/filter-diagnostics` → `levelBasisFunnel`.
- **VTS per-cycle `[8a-P3][VTS_TOUCH]` lines** (reset every resolve pass, `vts-runner.ts:3526-3528`), summed over the COLLECTED reach only — looks · refused first-look · refused steady: **S1** (09-18 06:43:11Z → 09-19 00:02:13Z) 1,588 · 3 · 3 · **S2** 76 · 1 · 0 · **S3** (to 02:27:09Z) 59 · 1 · 0 · **S4** (09-22 00:56:35Z → 12:15:37Z) 210 · 0 · 2.
- ⛔ **S1–S3 funnel cells: UNKNOWN** — in-memory, wiped by the 09-19 00:02Z, 00:54Z and 09-20 21:19Z restarts and never read before them; the per-cycle lines above cover only the collected reach (the same gap as OBJ-6). The paper lane's own per-cycle `entryFill*` fields (`EVAL_EXIT`, reset every cycle at `aee:2837`) were outside the collector's pattern and are not recoverable for any segment; the funnel's `active_entry_fill` cell carries S4.

### OBJ-6 — the permissive no-ask arm, crypto only: THE PAPER LEGS ARE UNREACHABLE BY CONSTRUCTION; THE OBJECTIVE RESTS ON THE MAKER TWIN
⛔ **Paper lane, both classes — `ask=none` CANNOT occur** (Langston, re-derived at the ref; re-read by me at `4e9fcea04`). The paper rest line (`aee:5122`) is reachable only past `_evaluateOpenDepthGate` (`:5061`), which returns early unless `pass && snapshot` and refuses a cold ask side first (`assessWarmth(snapshot, 'asks', …)`, `:670-671`). Crypto's snapshot is `getBookForFill` (`kraken-websocket-adapter.ts:3567-3578`): it keeps only `p > 0 && q > 0` and returns `null` when `asks.length === 0`. xStock's producer requires `ask > 0 AND ask_qty > 0` (`depth-source.ts:55`, re-checked `:64`). ⇒ `_gate.snapshot.asks[0].price` is a positive number on every path that reaches `:5105`, and **the `?? 'none'` on the paper line is dead.** **The paper zeros (165 / 55 / 72 / 157) are STRUCTURAL, not observations — more reach would change nothing (`#661` leg 3, a never-armed path).** *This section's first version called them "0 observed, on a stated partial reach", which read the collector gap as what held the arm down.*
**Where the arm IS live:** VTS placement (`placementAsk = transactableSide(selectCryptoTouch(…))`, `vts-runner.ts:2258-2265`, can be null) and the maker twin, which reads the same value (`_twinGapNote`, `:4730-4732`).

**Numerator `ask=none` = 0** across the whole collected corpus (Langston's own grep and mine). **Reach**, log-only lines, unchanged: collected 09-18 06:43:11Z → 09-19 02:27:43Z and 09-22 00:56:35Z → 12:15:37Z (~31 h of 168 h); the rest is UNKNOWN, not empty (§5d, §5f).

| crypto, collected reach | S1 | S2 | S3 | S4 |
|---|---|---|---|---|
| VTS `MAKER_RESTED` (A) · + fallback + dropped (B) | 5 · 9 | 0 · 1 | 0 · 1 | 2 · 8 |
| **OBJ-6 denominator — maker twins OPENED** (the only rows that can carry `ask=none`) | **70** | 6 | 9 | 13 |
| *volume, not the denominator: + `TWIN_SKIPPED reason=marketable_maker` (zero by construction)* | *70 + 65 = 135* | *6 + 4 = 10* | *9 + 3 = 12* | *13 + 21 = 34* |
| *excluded: `TWIN_OPENED` taker — prints no `ask=` at all* | 5 | 0 | 0 | 2 |

**Reading, by the pre-registered rules:** VTS is below the 30-floor everywhere ⇒ counts only. **Maker twins: a `marketable_maker` skip requires a non-null ask (`pending-maker-logic.ts:147-152`), so every skip row is ZERO BY CONSTRUCTION and can only dilute — it stays out of the denominator the floor is judged against. ⇒ only S1 clears: "0 of 70" maker-twin placements, no observed positive** (no ratio until one exists). S2 6, S3 9, **S4 13 — below the floor, counts only.** `TWIN_FAIL` = 0. **"0 of 70" in S1 is the one reading that carries OBJ-6.** **Its bound, not a bare zero: 0 of 70 ⇒ the arm's rate is under ~4.2% at 95% (`1 − 0.05^(1/70)`).** **Why this zero is not the paper lane's structural zero (Langston r4, 12:47:35Z):** on VTS a refused touch selection returns `null` (`transactableSide`, `crypto-touch.ts:128-131`), and `planTwin`'s skip needs a non-null ask, so a null ask reaches `TWIN_OPENED` and prints `ask=none`. **That the reader set CAN refuse is shown at a SIBLING call site, not the placement site:** OBJ-5's funnel above has `vts_entry_fill` crypto refusing **31 times, all `ticker_age_unknown`**, on the same `VTS_CRYPTO_TOUCH_READERS` — the fill rung, cited as support that a null is producible, **not** as a positive control on the placement rung. *(r2 of this section judged the floor against 135 / 34, skips included, while stating in the same paragraph that the skips cannot carry the numerator; Langston caught it at `fc936aa9a`. The 135 / 34 stay above as twin VOLUME.)*
**Population corrected from the first version, which counted `TWIN_OPENED` in both modes (75 / 6 / 9 / 15):** a taker twin cannot carry the numerator — `_twinGapNote` is `''` off the maker branch (`vts-runner.ts:4730-4732`). Window totals now **98 maker / 7 taker opened, 93 skipped**. Langston counted 8 taker over the whole corpus; the 8th (`APT/USD`, 2026-09-22 12:22:38Z) is after the window end.
**Paper A's concentration, stated although the arm is unreachable there:** the 449 in-window paper crypto rest lines sit on **11 symbols — RAY 129, USELESS 100, VVV 80, UAI 71 = 380**, the `#1063` retry mass (Langston's 455 / 386 is the whole corpus, 6 lines past the window end). Not 449 independent placement decisions.
**Exclusions**, unchanged: lines de-duplicated on the full text; 196 unlabelled `MAKER_MARKETABLE_DROPPED` companion lines excluded; 277 `xstock_spot`-labelled lines excluded, some carrying crypto pairs (`#1068`). Scripts on staging: `/home/deploy/8ap3_obj6.py` (v1), `/home/deploy/8ap3_obj6_v2.py` (maker/taker split); inputs `/home/deploy/8ap3_lines/`.

### ★ THE FINDING WORTH MORE THAN THE OBJECTIVE — THE TWO LANES ARE NOT SYMMETRIC AT THIS SEAM (Langston)
Same input, no usable ask: **paper refuses the open upstream** (`no_book` / `thin_book` → `DEPTH_GATE`, a non-trade); **VTS rests a position.** So VTS takes opens paper structurally cannot — exactly what the `aee:5117-5118` comment was written to prevent (*"opposite policies on one seam would make the comparison meaningless"*). Exposure in the collected reach is nil (0 of 7 VTS rests carried `ask=none`), but the asymmetry is real.
**DISPOSITION (§9.4 #2): added to `8a-P4`'s existing "no-ask placement policy on both lanes" item** (the `8a-P4c` row of the `8a-P4` scope and `PHASE_19_PLAN` row `3n.q2`), owner CC-C — the lane asymmetry and the dead `?? 'none'`. No new batch.

## 6. WHAT REMAINS *(rewritten 2026-09-22 at Step 10; the HOME lines below are unchanged)*

- **Step 11 — an honest progress report, NOT a close.** The window-end objectives are recorded (§5g, accepted by Langston at `7ae429f81`): OBJ-5 counts only (below the floor), OBJ-6 "0 of 70" maker twins. **What is NOT done:**
  - **`8a-P4c` — VTS xStock** (row `3n.q2`): the xStock no-decision instrument FIRST (Langston C2), VTS xStock trigger + booking, the VTS hollow-book guard, C8, the no-ask placement policy on both lanes (now with the §5g lane asymmetry and the dead `?? 'none'`), the no-decision rail keyed on the trade id, an epoch migration that also re-stamps the two stale `updated_at` rows (`ADJUSTMENT_FRAMEWORK` epoch rule 7), and the `aee:2806` comment beside the decision-price stamp, which still says xStock triggers on the bid (stale since C1).
  - **The paper xStock bid trigger** — withdrawn by C1; re-land `3n.q7`, after `3n.q8` `B-BOOK-STATE-RESTART-DURABLE` (`#1066`).
  - **Unexercised live arms, discharging with time:** the X3 bid-divergence instrument, `CROSSED_NOT_CAPTURED`, and `8a-P4a`'s escape legs (the last unreachable until `3n.q8`, because a restart re-vacates the ring they need).
  - **`8a-P2`'s open gate is now met on its own evidence:** 3 of 4 paper crypto stops since `8a-P3` deploy 2 fired while the mark was still above the stop (§5d) — the bid trigger has produced output. Its conversion folds into this batch's single completion report.
- **Carry to Langston:** which arm booked `vts_KII_USD_strong_bull_trend_1789490949547` (a `bookedNoBidClamp` increment or a bid booking), read after 2026-09-22 16:49:09Z.
- **`HOME: B-VTS-NO-DECISION-VALVE, owner CC-C, placed in PHASE_19_PLAN at 3n, after 8a-P4`** — a time bound on a refused VTS exit, before the 7-day max-hold books a timeout at the mark (§5c).
- **`HOME: B-EXIT-LINE-IDENTITY, owner CC-C, placed in PHASE_19_PLAN at 3n, after 8a-P3`** — put the trade id (and asset class) on the `[11.6][Exit]` line **and on the VTS no-decision streak line (added 2026-09-18, Langston Step 8 C2)**, the only close-reason carrier, so OBJ-2-style reads stop needing a symbol-and-second join. Not done in this batch because changing the emitter mid-window splits the window. The plan rows for this, `8a-P4` and `3b.f-e` are written at Step 10.
- **Placed elsewhere:** `B-BOOK-STATE-RESEED-ESCAPE` (built as `8a-P4a`, row `3n.q2`, owner CC-C — ⛔ this line read `3b.f-e` until 2026-09-22; that row is `B-EQUITY-RECONNECT-STALL-TIMER`) — the `seedImplausible`-terminal absorbing state, plus the D3 date consistency in that region.
  ⛔ **LIVE ON 2026-09-18, IN US REGULAR HOURS:** all three held paper xStock positions are locked in it — ANET/USD (seed 09-18 00:16:40Z, `seedSpread` 0.01000 vs retained median 0.00253), AMC/USD (09-17 00:16:33Z, 0.02256 vs 0.00374), LOW/USD (09-17 20:16:31Z, 0.01461 vs 0.00026), each `SEED_IMPLAUSIBLE … chain can never validate` (`book-state-tracker.ts:172-203`), each refusing exit evaluation every tick since (396 `REFUSE unvalidated` lines per symbol in the 10 minutes to 19:27Z; no other symbol). Every seed landed off-hours, when a wide spread is normal; a chain ends only at a yield (`book-state-tracker.ts:252-273`), and a book that stays two-sided never yields — so nothing re-seeds it. **Exposure at 19:36Z, from the captured ticker (`xstock_spot_ticker_snap_2026_09_18`, last row per symbol):** **LOW bid 192.32 vs stop 193.47 — 0.6% BELOW its stop, a stop that cannot fire**; AMC bid 2.71 vs target 2.7081 — at its target; ANET bid 198.18 vs stop 193.66 — 2.3% above. *(The REST last-known-good marks first read for this — LOW 194.17, AMC 2.905 — were stale and are not used.)* **The books have recovered:** last-60-minute median spreads AMC 0.00368 (retained 0.00374), ANET 0.00086 (0.00253), LOW 0.00062 (0.00026, 2.4× — under `kRel` 3), so by the guard's own test a fresh seed now would be plausible on all three; only the missing re-seed holds them. ⇒ **pulled forward as the FIRST item of the xStock half.** No restart: Langston measured that a restart clears the lock without fixing it, and it would also zero this batch's in-memory counters.

## 7. GOVERNANCE FILES CHANGED — STEP 10, 2026-09-22 (transcribed from the governance commit message, not from memory)

CHANGE-CLASS: architecture (`8a-P3`, `8a-P4`, `8a-P4b`; `8a-P4a` is `sub_batch`)

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | New entry for `8a-P3` + `8a-P4` (OPEN): shas, CI, reviews, evidence, the two false-stop rows and the recorded mistakes. |
| T1 | `PHASE_HISTORY.md` | ✅ | Plain-language entry for the exit and fill side, `8a-P2` → `8a-P4`. |
| T1 | `PHASE_19_PLAN.md` | ✅ | Dated status on rows `3n.q` and `3n.q2`; the `8a-P4c` remainder gains the lane asymmetry and the epoch re-stamp; `#1073` added to `3n.q3`. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_C.md` | ✅ | Shared: two of my entries rewritten current and shorter (the file was over its cap before this edit, now under); mine: position moved to Step 10 done, next Step 11. |
| T1 | the batch `SCOPE` | ✅ | `8a-P4` scope row `8a-P4c`: the no-ask lane asymmetry and the epoch re-stamp added. |
| T1 | the batch `PRE_AUDIT` | ✅ | Present: `8A_P3_SCOPE_AUDIT_AND_PLAN`, `8A_P4A_AUDIT_AND_PLAN`, `8A_P4B_AUDIT_AND_PLAN` (Step 2); nothing in them changed at Step 10. |
| T1 | the `COMPLETION_REPORT` | ✅ | Batch is open, so the progress report: §5g window-end record (r4), §6 rewritten, §7 this ledger. |
| T1 | the four session task lists | ✅ mine / N/A ×3 | Mine re-dated 2026-09-22, open-and-stalled rewritten, 17 `3n` rows added; the other three are not mine. |
| T1 | Langston's `MEMORY.md` | ⏳ **BLOCKED, not done** | The writer REFUSED (exit 4): his `MEMORY.md` was edited outside the composer. Reconciliation is Infra Claude's (`#1057`), asked 2026-09-22; my edit is staged and re-applied after. |
| T2 | `SYSTEM_MANUAL.md` | ✅ | §3.5.1a re-seed judgement, escape and restart hole; §3.5.1b xStock side capture; §18.0.1 per-lane price table; fill-test pointers in B7.2c and B8.6. |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | S25, S25b and S27 re-censused; the VTS booking line superseded for crypto; pending-maker, book-state and exit-path entries for `8a-P3`/`8a-P4`. |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#741` annotated (bucket 2 implemented); `#1073` filed — a price refusal suspends a resting order's deadline, homed on `3n.q3`. |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | New entry: four fixes, one same-night withdrawal, stated residuals. |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | No phase-level change; the work sits inside Phase 19 row `3n`. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | ✅ | Calibration-epoch rule 7 (a bump sets `updated_at`) and the `8a-P3`/`8a-P4b` precedents. |
| T2 | `AUTHORITY_BASELINE.md` | N/A | No risk limit, gate or constitutional value moved. |
| T2 | `STORAGE_POLICY.md` | N/A | No table, column or retention changed; the only data writes are three `module_constants` epoch rows. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | ✅ | Working-list review: no A–F status change; two xStock epoch boundaries to split at. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | ✅ | New `R-SIDES`: which price each job reads, and the post-close symmetric widening. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | No role, gate or method changed. |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | His model, runtime, invocation and files are unchanged. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No stable rule changed. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | No `CLAUDE.md` change. |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A | Nothing removed; the dead `?? 'none'` is homed at `8a-P4c`, not deleted. |
| T2 | `MISTAKE_PATTERNS.md` | ✅ | `wrong-object` ×3 instance: denominator rows that could not carry the numerator. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | No exception granted. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | The ack/resolve process did not change. |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | The board's columns, fields and ownership did not change. |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | The daily model check did not run inside this batch. |
| + | `XSTOCK_PRICING_PLAN.md` | ✅ | Row P6 marked superseded for triggers, fills and bookings (delegated 2026-09-03). |
| + | `ACTIVE_PATH_FLOW.md` | ✅ | §6.3: "every exit decision reads a midpoint" superseded; the midpoint-stop question answered. |

`REVIEWER r1: object (the System Manual + System Impact Map diff) · what else is consistent with the code · 12 hits; the load-bearing ones re-derived at the code (capture sites log only, VTS fallback books the evaluator's exit price, resting entries pass the guard) · corrected; one side-finding filed as #1073 · re-derived y`
`REVIEWER r2: object (the corrected diff) · were r1's twelve points met, and what else is unsupported · 11 of 12 met; point 4 left in two phrases; 4 new (J2 silent drop, the paper booking clamp parenthetical, S25b "refreshed every frame", a stale code comment at aee:2806) · corrected; the comment homed in 8a-P4c · re-derived y`
`REVIEWER r3 (cap round): object (the re-corrected diff) · were r2's points met, and what else is unsupported · all five met; three residual wordings (the J2 logging scope, VTS xStock no-mark timing, 'VTS exit rest') · corrected directly, no fourth round · re-derived y`

