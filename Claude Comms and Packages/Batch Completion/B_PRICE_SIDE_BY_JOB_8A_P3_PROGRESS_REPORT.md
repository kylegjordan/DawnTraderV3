# B-PRICE-SIDE-BY-JOB row `8a-P3` — PROGRESS REPORT (crypto half; the batch is OPEN)

**Status:** `STEP: 7 of 11` · `NEXT STEP: 8 of 11`. **This is not a completion report.** Kyle, 2026-09-15: the exit/fill-side work is one batch in two halves and is not presented as complete until both land. The xStock half (`8a-P4`) has not started.
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
| OBJ-2 VTS crypto exit rate per open position-hour — two equal windows: BEFORE ends at deploy 1's `pm_uptime` (11:59:22.448Z), AFTER starts at the VTS sides validity instant (12:16:07Z); the span between is excluded | **each** window ≥ **30** VTS crypto closes **and** ≥ **1,000** exit looks (AFTER, from `VTS_TOUCH`) — below either, both windows publish counts only and no rate comparison is made |

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

## 6. WHAT REMAINS

- **Step 7, inside the window:** OBJ-1 staging legs (crypto maker fills with the ask/bid stamped), OBJ-2 two-window VTS exit rate, OBJ-3 booking spot-check, OBJ-5 fill rate, OBJ-6 rests and twins, OBJ-7 UI on the first crypto close — each at its n-floor.
- **Step 8** Langston's second pass · **Step 10** governance · **Step 11** held for the xStock half.
- **`8a-P4` (xStock half), not started — ITS FIRST ITEM IS AN INSTRUMENT (Langston C2):** since deploy 2, xStock no-decision volume on VTS has **no instrument at all** (the fence excludes it, and so every non-crypto class), and that count is the evidence `8a-P4` needs to size its `#994` notify rules. Then: paper xStock trigger on the bid; VTS xStock trigger and booking; xStock resting fills; the hollow-book guard for VTS; C8 VTS taker entry booking; the no-ask placement policy on both lanes; the VTS xStock no-decision rail under `#994`; the twin `ask=` formatting nit at `vts-runner` `:4700`.
- **Placed elsewhere:** `B-BOOK-STATE-RESEED-ESCAPE` (`3b.f-e`, owner CC-C) — the `seedImplausible`-terminal absorbing state, plus the D3 date consistency in that region.
