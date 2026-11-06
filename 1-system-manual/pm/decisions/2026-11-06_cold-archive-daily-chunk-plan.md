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

## 4. Round 2 — Langston's ruling (Discord 2026-11-06 ~05:2xZ, "CHANGE, on one lever. The diagnosis I confirm.") + the measurements he asked for
**Confirmed by him, re-derived at `c10fbdeb`:** warm is Supabase Storage (`storage-client.ts:6/14/70`); B2 appears only in the cold methods; the DB warning does not touch Backblaze. **A1 then A3: confirmed**, with the bar-partition census owed first.

### Plan B, changed — verify without downloading the object
- **His finding:** `uploadCold` sends `X-Bz-Content-Sha1` computed from the same buffer, and B2 refuses a body that does not hash to it — so an accepted upload IS a server-side proof of the stored bytes. The rotator then re-downloads the whole object to compare SHA-256 (`b75-cold-rotator.ts:290`) — **that re-download is ~100 % of the rotation's B2 download use** and the only reason a month's worth would exhaust the cap.
- **NOW:** verify by **upload acceptance + `b2_get_file_info`** (returns `X-Bz-Content-Sha1` and size — metadata, a Class-B transaction, no file bytes); store `sha1` beside `sha256` in `data_archive_manifest`, forward-only (the 4 existing cold objects, 0.12 GB: verify once or re-derive from warm). The weekly canary stays the one real round-trip. This is a remote attestation of the stored object, so it meets the rotator's own fence against a local-checksum-only basis. **The design no longer waits on Kyle's dashboard.**
- **The daily byte budget stays, as a safety belt:** the skip line carries the remaining budget and the declined object's bytes (a gate that logs only when it releases ships untunable); a **"no progress for N consecutive days" page**, because a rotator that stops on an absent constant would otherwise turn an egress problem into silent warm growth; and **B2's own `download_cap_exceeded` / `transaction_cap_exceeded` is the authoritative back-off** — a local counter cannot see another consumer on the account.
- **Placement:** folds into B-DISK-FILE-TIERING OBJ-3 beside the streaming path (§9.4 disposition 1 — smaller than the chunking it replaces). No new batch.

### Plan A — the measurements (staging, 2026-11-06 ~05:30Z)
- **The 51 GB released on 2026-10-01 is ATTRIBUTED** (`/var/log/dawntrader/b75-retention.log`, `bytes_hot` per dropped partition, summed per table for that run): `signal_eval_archive` **40.9 GB** · `pair_scan_archive` 5.6 · `signal_eval_provenance` 5.4 · `crypto_spot_ticker_snap` 2.2 (run total 57.6 GB freed). `signal_eval_archive` was still MONTH-partitioned then; it is DAY-partitioned now (partitions run `…_2026_10_07` → `…_2026_11_20`, trimmed nightly — `2026-09-30`, `10-01`, `10-02` dropped at ~1.5 GB each). **So September's 51 GB swing does not recur.** The **2026-10-31** run freed 22.3 GB: `pair_scan_archive` 6.9 · `signal_eval_provenance` 6.1 · `crypto_spot_ticker_snap` 3.6 + the daily trims — the current monthly amplitude.
- **The one-minute bars, per month** (`pg_total_relation_size` per partition): `xstock_spot_ohlc_1m` May 4.67 · Jun 1.90 · Jul 1.85 · Aug 1.76 · Sep 1.77 · Oct 2.14 GB; `crypto_spot_ohlc_1m` May 2.94 · Jun 1.38 · Jul 1.20 · Aug 1.34 · Sep 1.95 · Oct 1.67; `xstock_perp_ohlc_1m` ~0.18/month (May 0.92). **≈ 4 GB/month accumulates now; May 2026 is the outlier (~8.5 GB).** Roll-off at 365 days begins with the May-2026 partitions in **May 2027**, releasing ~8.5 GB, then ~4 GB/month out against ~4 GB/month in (Oct-2026 ≈ Sep-2026 + ~0.3 GB) ⇒ **the bars stop accumulating around May-June 2027, measured — not ≫ growth**; A3 stays an audit, not a must.
- **The trough rise, labelled:** the +6.8 GB/month was ONE difference of two daily maxima (Oct 1 → Nov 1), n=1. Per table it decomposes as **bars ≈ 4 GB/month (measured above)** + the monthly tables' own growth (`pair_scan_archive` 5.6 → 6.9, `signal_eval_provenance` 5.4 → 6.1 between the two boundaries) ≈ +1-2 GB/month; the remainder is unattributed and small.
- **Cap date, second correction.** **PREVIOUSLY (this pack, §2):** ~March 2027 at November's rate, ~May 2027 at October's. **NOW:** **not before ~May 2027 even at the fastest measured rate, and later at October's** — the peak is trough + ~28 GB (Oct, measured), not trough + a 45 GB month, because the 41 GB monthly swing of `signal_eval_archive` is gone; and the trough's main driver (the bars) levels off from May 2027. The fastest case uses November's first four days (1.54 GB/day, n=1); **the decider is the 2026-11-30 peak**, read from `database_size_logs`, with a stated threshold: a November peak above ~170 GB (83 %) means A1 is needed before the spring; below it, A1 is relief, not rescue. **REASON:** the first pass priced September's one-off 41 GB release as a recurring amplitude.

### What is asked now
- **Kyle (via PM):** the B2 dashboard read — the daily **download** cap, the daily **transaction** cap, and the free-egress rule. No longer blocking: Plan B's design stands without it; it sets the safety-belt number.
- **Coltrane:** confirm or change §4. **Langston:** confirm §4 discharges his ruling.
