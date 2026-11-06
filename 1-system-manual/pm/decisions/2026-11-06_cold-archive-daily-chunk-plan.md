# Cold-archive daily-chunk plan + the database-size relief (KD-32, amended) — CC-A, 2026-11-06

**Asked by:** Kyle, KD-32 (2026-11-05): don't raise the Backblaze daily download cap; plan cold-archive downloads in daily chunks under the free limit. **Amended the same day:** the database-size warning (alert `c0a0b00d`) is relieved through this plan, and the plan must carry the measured growth rate and the date the cap would be hit.
**Status:** PLAN for review — KD-34 (owner CC-A + Langston + Coltrane), then PM Claude for Kyle. Nothing here is built.

## 1. What was measured (2026-11-06 04:30-05:00Z, staging, each with its instrument)
- **Database size**, `database_size_logs` (the alert's own instrument; its denominator is 204,800 MB — check: 2026-10-31's 133,474 MB / 204,800 = 65.2 %, the alert's figure). Daily max, MB:

  | | Sep 30 | Oct 1 | Oct 30 | Oct 31 | Nov 1 | Nov 5 |
  |---|---|---|---|---|---|---|
  | MB | 176,059 (86 %) | 124,878 | 153,152 (75 %) | 133,474 | 131,684 | 137,839 (67 %) |

  A monthly sawtooth. **Trough rise** Oct 1 → Nov 1: **+6.8 GB/month**. **Within-month rise:** October 0.97 GB/day; Nov 1-5 **1.54 GB/day**.
- **What holds it** (`pg_total_relation_size`, partitions summed, live total 144.6 GB): `signal_eval_archive` 42.6 · `xstock_spot_ticker_snap` 21.2 · `xstock_spot_ohlc_1m` 14.6 · `crypto_perp_ticker_snap` 11.1 · `crypto_spot_ohlc_1m` 10.7 · `signal_eval_provenance` 7.9 · `pair_scan_archive` 7.6 · `xstock_bar_revision_event` 5.1 · the rest < 4 each.
- **Why it moves the way it does** (partition census + `module_constants` `*.hot_retention_days` + root crontab):
  - The export sweep (`b75-retention-sweep.ts`) runs **every night at 02:15 UTC** and moves each partition past its hot window to warm, then drops it.
  - **DAILY-partitioned, 30-day hot** (`signal_eval_archive`, the ticker snaps): a fixed ~30-day window, trimmed nightly — **flat, NOT the sawtooth.** `signal_eval_archive` = 42.6 GB / 30 days ≈ **1.4 GB/day of capture**, the largest single cost.
  - **MONTHLY-partitioned, 30-day hot** (`signal_eval_provenance`, `pair_scan_archive`): a month's partition can only go when its whole month is 30 days old ⇒ the DB carries up to ~2 months of them ⇒ **the monthly sawtooth**.
  - **One-minute bars, MONTHLY partitions, 365-day hot** (`xstock_spot_ohlc_1m`, `crypto_spot_ohlc_1m`, `xstock_perp_ohlc_1m`; first partitions 2026-04): nothing has been old enough to leave yet ⇒ **the trough rises** until the first month turns 365 days, around **May 2027**.
- **Warm tier** = the Supabase Storage bucket `dt-archive` (`data_archive_manifest`, `tier=warm`): **5,879 active objects, 52.3 GB compressed.** Inflow by month archived: Jun 6.7 · Jul 8.0 · Aug 13.3 · Sep 5.4 · Oct 14.9 · Nov (5 days) 4.0 GB.
- **Cold tier** = Backblaze B2 `dt-archive-cold`: **4 objects, 0.12 GB.** Warm objects rotate to cold at `default_warm_retention_days` = 365 after archiving ⇒ **the first real cold rotation is due 2027-05-06** (oldest active warm object). The rotator runs **monthly** (`0 3 1 * *`); the cold canary weekly.
- **The download cap:** blocked 2026-11-05 10:22Z (`download_cap_exceeded` on a 171 MB read-back); **reset — a cold round-trip passed at 2026-11-06T04:52:45Z** (`b75-cold-liveness`, run by hand). The cap's VALUE is an account setting not readable from the server.
  ⚠️ **Backblaze's own documentation disagrees on the free amount:** an older help page says "1 GB of free downloads per day"; the current developer page says free egress "up to three times your average monthly storage". **With 0.12 GB in cold, the second rule allows almost nothing** — which would explain a 171 MB read-back exhausting it. ⇒ the budget below is a formula; its number comes from Kyle's Backblaze dashboard (Caps & Alerts + usage), not from me.
  - ⚠️ HYPOTHESIS, not measured: Infra Claude's token-watch cold store uses a B2 key on the same account, so it may draw on the same daily allowance.

## 2. The finding that reshapes the request
**The database-size warning does not go through Backblaze at all.** Database → warm is an export to Supabase Storage and needs no B2 download. B2 downloads happen only when warm moves to cold (from May 2027), on a restore, and in the canary. So there are TWO plans, not one:

### Plan A — the database size (the near-term pressure)
**Cap date, corrected.** **PREVIOUSLY STATED** (to PM Claude, 2026-11-05 ~20:00Z): "the peak hits the cap around Feb 2027 at 1.7 GB/day." **NOW:** **~March 2027 at November's rate, ~May 2027 at October's.** **REASON:** the earlier figure treated the whole within-month rise as permanent growth. Measured: only the trough rise (+6.8 GB/month, the one-minute bars) carries forward; the rest is the monthly sawtooth and the 30-day window, which do not accumulate. Arithmetic: November's peak ≈ 131.7 + 1.54 × 29 ≈ 176 GB (86 %); each later month adds ~6.8 GB, so the cap (204.8 GB) is reached in ~4 months (~March 2027). At October's 0.97 GB/day the peak is ~160 GB, reaching the cap in ~6-7 months (~May 2027). **The one-minute bars stop accumulating around May 2027 by themselves** (their first months turn 365 days), so the two dates nearly meet. That is too close to leave alone, but nothing breaks this month.
**Levers, cheapest first — none deletes data; every one moves it to warm (never-drop holds):**
- **A1 — shorten `signal_eval_archive`'s hot window (a setting, 30 → 14 days).** Frees ≈ 16 × 1.4 ≈ **22 GB permanently** (the window shrinks), with no code change. **Needs a consumer audit first:** what reads it hot beyond 14 days (calibration and drift lookbacks are the candidates). The same lever exists for the ticker snaps (21 + 11 GB at 30 days).
- **A2 — move `signal_eval_provenance` and `pair_scan_archive` to daily partitions.** Removes their ~1-month overhang (≈ 8 GB off each peak) — schema work, its own batch.
- **A3 — the one-minute bars' 365-day hot window** — the only lever on the rising trough before May 2027; a consumer audit decides whether bars older than N months are read hot (the regime and calibration lookbacks are the candidates).
- **A4 — capture volume** (B-STORAGE-HARDEN OBJ-4): 64 % of `signal_eval_archive`'s rows are crypto paper `pre_filter` evaluations (1,614,203 of 2,520,889 in the 24 h to 2026-11-05 23:00Z). A business-data decision, so Kyle's.
**Recommendation:** A1 after a consumer audit (largest effect, a setting, nothing lost); A3's audit in the same pass. A2 and A4 later, if A1 and A3 are not enough.

### Plan B — the cold rotation in daily chunks (KD-32 proper; due before 2027-05-06)
- **The problem as built:** the rotator runs once a month and verifies every eligible object by downloading it whole. From May 2027 a month's worth is 5-15 GB compressed (the warm inflow above) — **many times any free daily allowance in one run**, so the first real run would exhaust the cap, as on 2026-11-05.
- **The daily chunk:** run the rotator **daily**, with a **byte budget per run** (`cold_rotator_daily_read_bytes`, read from `module_constants`, fail-hard if absent — no hard-coded default), stopping before the next object would cross it. **Budget = the free daily allowance − headroom** for the canary (104 B), one emergency restore, and the token-watch leg if it shares the account.
- **Does it keep up?** With 1 GB/day free and ~0.8 GB budget: ~24 GB/month of capacity against ≤ 15 GB/month of inflow ⇒ yes, the backlog clears each month. Under the "3× stored" rule the allowance starts near zero and grows only as cold fills ⇒ it may NOT keep up early on; that answer needs Kyle's dashboard figure.
- **Prerequisite already in B-DISK-FILE-TIERING:** the streaming cold path (OBJ-3). The rotator measured 1.06 GiB peak memory for a 171 MB object (~6.5×); the largest warm object is 535 MB.

## 3. What is asked of whom
1. **Kyle (via PM):** read the B2 dashboard — the daily download cap's value, and which free-egress rule the account is on. Nothing else is needed from him for Plan B to be designed.
2. **Langston + Coltrane (KD-34):** rule on the A1/A3 ordering and on the Plan-B mechanism.
3. **Placement (proposals for Kyle's list, not slots):** Plan B folds into B-DISK-FILE-TIERING (CC-A, the cold path is already its OBJ-3) = §9.4 disposition 2. A1 + A3's consumer audit is new work = a proposal.
4. `c0a0b00d` stays active until Plan A is relieved (KD-32 amended). Not acked.
