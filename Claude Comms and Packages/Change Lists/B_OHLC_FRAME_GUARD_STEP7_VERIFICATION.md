# B-OHLC-FRAME-GUARD (`#1028`) — STEP 7 FIRST-PASS VERIFICATION (CC-C)

**Deployed:** `29cce1076de1130793bafc2eb5ef8fc4701ff118` at **2026-09-11T11:19:37Z** by `dt-deploy --by cc-c` — *"OK — 29cce1076… live, engine resumed, identity asserted"*; `migrate_ran_at=11:19:26Z`; the running build's `dist/BUILD_SHA` is the same sha. **Rollback sha:** `c52c577fd841e4a129257360c8e0852c2d59e781` (the previous record).
**Compare range deployed:** `c52c577fd..29cce1076` carries three runtime-touching commits, all this batch's (`c0b102ebf`, `12d1bd1cd`, `29cce1076`). No other session's runtime work rode along.
**Status:** every check below is done **except the on-screen panel (§5)**, which is held on a decision put to Kyle (`#1037`).

---

## 1. The guard admits live traffic — the SAME instrument before and after the restart
**Instrument:** staging `out.log`, the batch writer's `[B74][batch-writer] <class> upserted N rows` lines, summed per minute. **Population:** every flush of the four OHLC classes, 11:13 → 11:22Z.

| minute (UTC) | crypto_spot | xstock_spot | crypto_perp | xstock_perp |
|---|---|---|---|---|
| 11:14 | 285 | 28 | 181 | 10 |
| 11:15 | 403 | 158 | 189 | 10 |
| 11:16 | 270 | 117 | 179 | 10 |
| 11:17 | 283 | 86 | 187 | 10 |
| 11:18 | 240 | 98 | 185 | 10 |
| **11:19** *(restart at :37)* | 4,178 | 520 | 118,161 | 20,000 |
| **11:20** | 292 | 86 | 250,128 | 10 |
| **11:21** | 256 | 88 | 161 | 10 |

⇒ **after the restart both spot classes and the xStock perp leg land at their pre-restart rates, and crypto perps return to theirs once the start-up re-read ends.** The 11:19–11:20 perp spike is the futures poller re-reading up to 2,000 candles per symbol because its in-memory mark resets on restart — pre-existing, the territory of `#1030`, not this batch.
**Health lines after the restart (11:21:31–36Z), all non-zero:** equity-spot `rows_persisted_60s=120` · crypto-spot shard0 `190`, shard1 `262` · crypto-perp `155` · equity-perp `10`.

## 2. The knob landed
`module_constants`: `passive_archive · * · * · * · * · ohlc_frame_skip_alert_streak = 10 · updated_by b-ohlc-frame-guard`. **Control:** the pre-existing `b74_equity_capture_enabled = true` row read by the same query.

## 3. The bootstrap warm-up did not fail
`error.log` lines matching `passive_archive prefetch failed`: **0**. **Reach and liveness control:** the current `error.log` runs from 2026-09-11 00:00:01Z to at least 11:29:17Z, and holds 3,975 `EQUITY_MARK` lines — the file is being written after the restart, so its silence covers the boot. The bootstrap's start line is in `out.log` at 11:19:36Z.

## 4. The guard's reject path — no malformed bar arrived
`error.log` lines matching `B-OHLC-FRAME-GUARD` since the restart: **0** (to 11:29Z). **What that silence is worth:** the pattern matches the emitted format — the watchdog unit test's stderr shows `[B-OHLC-FRAME-GUARD][equity-spot][xstock_spot] bar skipped: symbol=AAPL/USD field=close reason=not_decimal (+0 suppressed since last line)` — so a skip in this window would have been seen. ⛔ It says nothing about how often a bad bar arrives; the reject path itself is proven by the 38 unit cases and the 29-mutation proof, not by production traffic.

## 5. ⏳ THE PANEL ON SCREEN — NOT YET VERIFIED
Claude-in-Chrome, `https://188.245.193.8.sslip.io/analytics` → **Drift Dashboard** tab → the **Passive Archive Capture** card title and its window buttons rendered; **the table did not finish loading within ~50 s** (the card read *"Loading…"*; screenshot taken). While the tab was open the signal-evaluation archive writer dropped 1,015 rows (11:24:47–11:25:07Z), so the tab was closed. **Reopening it may repeat the drop ⇒ put to Kyle; `#1037`.** Still owed here: the four labelled rows (`xStocks (spot)`, `xStock perps`, `Crypto pairs`, `Crypto perps`), the new **"skipped (since PID)"** column, and the legend sentence.

## 6. Warm state this restart reset — readings NOT measured through
The archivers' in-process counters (the panel's "since PID" columns) and the frame-guard tracker's streaks and latches start from zero at 11:19:37Z. The futures polls' in-memory marks reset, which caused the 11:19–11:20 re-read. Other in-memory windows elsewhere (for example the AMR's EV-gap window) re-warm on their own cadence and are outside this batch.

## 7. Out-of-scope finding surfaced by this step
**`#1037`** — the signal-evaluation archive writer dropped 1,015 rows while the Drift Dashboard loaded. Candidate mechanism: the Data Archive panel's untimed full-table counts on the shared pool (`drift-dashboard-aggregator.ts:794-802`). A hypothesis, not established. Home: a review at `3b.h-8` Step 1, owner CC-C.


## 8. r6 (OBJ-3 + OBJ-10) — WHY THE ON-SCREEN CHECK HAS NOT RUN, AND A BOUNDED READ OF THE SAME DATA (2026-11-06, CC-C)
**Why not the tab.** The r6 code is live (it rode release deploy A, 2026-10-02; staging head `0f4835b5a` today). The pre-registered Step-7 claim is a RENDERING claim taken with the tab open and an abort at 7 of 10 pool connections. On 2026-10-02 the abort fired 10 s after opening (`RELEASE_DEPLOY_A_STEP7_CCC.md`), and on 2026-11-04 the same tab tipped the xStock bar-availability transactions into a pool lock-up that needed a restart (`#1037` am.4). The pressure comes from the OTHER panels on that tab (the Data Archive panel's untimed counts), not from this card. ⇒ **I have not opened the tab again.**

**A bounded read of the card's own data, 2026-11-06 10:21Z.** `GET /api/analytics/passive-archive-status?window=rolling_24h` through `dt-api` (HTTP 200), with `pg_stat_activity` for `application_name='dawntrader_main'` sampled before, during and after: **0, 0 → 3, 6, 5, 6, 3 → 3, 3 in use of 10** (peak 6, under the abort line; the in-use count includes normal app work, so it bounds the card's load from above).
| universe | OHLC rows in 24 h | status | `ohlcFramesSkipped` |
|---|---|---|---|
| `xstock_spot` | 233,794 | `COUNT_UNKNOWN` (`timeout`) — the ticker count did not finish | 0 |
| `xstock_perp` | 14,390 | `OK` | 0 |
| `crypto_spot` | `null` | `COUNT_UNKNOWN` (`timeout`) | 0 |
| `crypto_perp` | 264,783 | `COUNT_UNKNOWN` (`timeout`) | 0 |
⇒ **OBJ-10's data contract holds live:** finished counts are real numbers (not the old constant 0), unfinished ones are `null` with reason `timeout`, and the status says `COUNT_UNKNOWN` rather than a false drift. **OBJ-3's field reaches the API on all four classes** (`ohlcFramesSkipped`, 0 each: no malformed bar since the 2026-11-05T14:39:52Z start — zero opportunity, not proof the counter fires; its firing is proved by the unit test).
**The labels at the deployed sha** (`client/src/pages/analytics.tsx` at `0f4835b5a`): the four row labels (`:1892-1895`), the `skipped (since PID)` header (`:1968`), `null` rendered as "—" (`:1912-1913`), and a `COUNT_UNKNOWN` badge (`:1906`).
**What this does NOT establish:** that the card RENDERS — the pre-registered claim. That needs the tab, and the tab is unsafe until `#1037`'s cause (the Data Archive panel's unbounded counts) is fixed at its home. **Open question for Langston: does this bounded read discharge Step 7, or does the on-screen check wait on `#1037`?**
