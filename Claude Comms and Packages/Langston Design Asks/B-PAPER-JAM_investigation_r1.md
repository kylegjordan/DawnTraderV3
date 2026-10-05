# Paper mode has stopped opening and closing trades — investigation for Langston (r1)

**From:** NEW Claude (CC-B) · **Asked by:** Kyle, 2026-10-05 ~10:15Z — *"work with Langston to figure this out. This is a top priority ... as part of the pre-sprint start."* · **Status:** investigation, no batch yet, no code changed.

## 1. The symptom (measured)
- **Seven paper positions open, none has closed since 2026-10-02 18:47Z** (last close). Ages 2.5 to 11.5 days. Six crypto, one xStock (MGM).
- **Paper opens:** ~8-9 a day through 09-30 (09-29: 9, 09-30: 8), then **2 on 10-01, ~2 on 10-02, 0 since.** (`closed_trades` ∪ `active_open_positions`, mode paper.)
- **Seven positions older than 48 h at once is the most ever** (weekly max of concurrent paper positions aged > 48 h: July 6, Aug 1-4, Sep 3-6, now 7; hourly series from 07-15).
- **The VTS keeps opening and closing** (Kyle's observation).
- **Kyle's second symptom:** the Paper Trading Earnings card's two *Lifetime* rows show "—".

## 2. What is ruled out (measured, with the instrument)
- **Price feed:** our live price matches Kraken's public ticker for all six crypto positions (2026-10-04 11:16Z).
- **Exit checks run:** every open position is evaluated every ~1.5 s (`[EXIT_EVAL]`, 1,679 evaluations per symbol in 42 min, max gap 2 s).
- **Exit trigger side:** crypto triggers on the bid (`active-execution-engine.ts:3081` → `tec-evaluator.ts:366,:375`); `[EVAL_EXIT]` counters over ~4.5 h: 99.2 % of 39,000+ evaluations had a fresh bid (`ladderAccepted`), 0.8 % deferred one cycle (`noTriggerRefusals`), never a midpoint fallback.
- **No level was reached while open:** Kraken's own 5-minute candles 10-02 20:35Z → 10-04 11:15Z: no position's low reached its stop or its high its target after its open. (ZEC's 1205 low was 22:35Z, six minutes **before** its 22:41Z open; LIGHTER's 3.100 at 10-03 06:22:07.396 was one market sell sweeping the book for ~15 ms — our snapshot recorded `last=3.10` with `bid=3.445`, so the bid never crossed.)
- **⚠️ HONEST LIMIT:** no paper position has closed since deploy A (10-02 20:38Z), so the paper exit path has **no runtime positive control since A**. CI covers it (`b-price-side-8a-p1-exit-fence.test.ts`) and the VTS shares `evaluateTECExit`, but the paper caller path has not fired live since A. ZEC is ~1.6 % below its target and is the nearest natural control.

## 3. The *Lifetime* rows are a consequence, not a second fault
`/active-engine/trades/analytics` (`routes.ts:12880`) omits `lifetime` only on its empty-window early return (`:12990`); the main return carries it (`:13216`). Measured on staging: `range=24h` → no `lifetime`; `7d`/`30d`/`all` → present. **So the rows blank exactly when no trade closed in the selected window** — i.e. *because* of the jam. Fixed in hotfix `B-DASHBOARD-STATS-BLANK` (you approved 10-04 10:54Z, `8e165d1d6`; rides deploy B). The defect dates from `567385eae` (08-21) and would also have blanked during the earlier 30-41 h no-close gaps (09-11→13, 09-15→16, 10-01→02).

## 4. What changed (measured)
**4a — Target distance has grown ~7x.** Crypto paper, by open week, median target distance / median stop distance / p90 hold:
| week | n | stop | target | p90 hold |
|---|---|---|---|---|
| 07-13 | 118 | 1.13 % | 1.35 % | 20.2 h |
| 08-17 | 48 | 2.77 % | 6.73 % | 28.8 h |
| 09-21 | 42 | 4.52 % | 8.07 % | 50.6 h |
| 09-28 | 20 | 5.66 % | 10.01 % | 37.2 h |
Median reward/risk stepped from 1.11 to ≥ 1.67 from ~08-18 (`P19-B-FEEVIABILITY`, deliberate, so targets clear fees).

**4b — `strong_bull_trend` began trading 2026-09-20 21:43Z**, 24 minutes after `B-REACH-BASELINE-ADJUST` (`3n.v`, `40f22a1bb`) deployed. Its targets are ~6 hourly ATRs (median 13-18 %), median hold 31-40 h. 24 closed + 3 open (XDC, GRASS, PHA). The pre-registered crowding arm fired at 25.5 %; Kyle overrode it 09-29.

**4c — A single off-market print can set a trade's stop and target (`#1153`, new).** The crypto ATR is a plain 14-bar true-range mean on 60-min candles (`fx5-scanner.ts:72-84`, fed at `:1217`), no single-bar guard. Our `atr_at_open` matches Kraken's own hourly ATR14 at open within 1.0-1.2x for all six crypto positions. **GBP/USD** (opened 09-23 21:12Z): the 20:00Z candle's high is **1.70000** vs ~1.324; ATR 2.17 % where the 13 clean bars give ~0.17 % ⇒ target 5.42 %. **LIGHTER** (09-30 06:14Z): the 04:00Z candle's low is **0.110** vs ~3.7 ⇒ ATR 11.95 %, target 30.1 %. Since 09-06: **6 of 163** crypto paper opens followed such a bar (≥ 40 % of the ATR sum, ≥ 4x the median of the rest) vs a **1.2 %** hourly base rate (671 / 53,827); those 6: 0 targets, 4 stops, 2 still open. n = 6 — the over-representation is a lead.

**4d — The exposure cap has been binding continuously for two weeks.** `GUARDRAIL_BLOCK: Max Total Portfolio Exposure exceeded ... (100% limit)` on `[RTB-Promotion:paper]` in the daily error logs: **09-21 6,513 · 09-22 7,842 · 09-23 7,074 · 09-24 3,008 · 09-25 4,691 · 09-26 4,415 · 09-27 3,043 · 09-28 1,964 · 09-29 3,110**, and every hour 09-29 → 10-02 (09-21 is the oldest log kept). Today: `$955.71 > $824.11`. ⇒ since at least 09-21 **a new paper trade can open only when an open one closes.**

**4e — Deploy A is not the trigger:** opens fell to 2 on 10-01 and the last close was 10-02 18:47Z, ~2 h before deploy A (20:38Z). Staging ran one commit (`bc199185e`) from 09-22 to 10-02, so no code changed during the onset.

## 5. My working hypothesis — *a clog*, NOT established
With the cap binding, each close frees room that the next top-ranked RTB signal takes. Over 09-21 → 10-02 the positions that stayed open were the slow ones (far `strong_bull_trend` targets, plus the two bad-print geometries), the fast ones kept closing and being replaced, and by 10-02 all seven open positions were slow ⇒ no closes ⇒ no opens. **Unproven leg:** that the RTB ranking *prefers* far-target signals (it would explain SBT's rising share: every 10-01 open was SBT). `rtb_signals` keeps only live rows (2 now), so the promoted-vs-queued comparison cannot be made from it.

## 6. What I am asking you
1. **Re-derive, don't accept:** §2's ruling-out (especially the exit path with no post-A positive control) and §4d.
2. **Kyle's "why now" challenge:** the reach batch was 09-20 and Kyle saw no problem until recently. Is the clog (§5) a sufficient explanation for an onset ~10-01, or is there a **second change near 10-01** I have not found? Specifically: the exposure arithmetic (what the guardrail counts — entry vs mark value, pending/maker orders, xStock in the one pot, the balance/anchor it divides by — the balance fell `$859.84` (09-29) → `$794.38` (09-30) → `$831.02` (10-01) → `$826.39` (10-02)), and whether ranking favours far targets.
3. **Dispositions:** `#1153` (bad-print ATR) is placed first in my queue at row 2a; the far-target question sits at row 132 (`B-TARGET-MULTIPLE-VS-HORIZON`). Kyle wants this treated as **pre-sprint, top priority** — tell me if any of it should move ahead of deploy B or into it.

*Fresh-reader round on §5 is running in parallel; its alternatives will be added as r2.*

---

## 7. r2 — after a fresh-reader round (claim-only) and the checks it pointed to
`REVIEWER r1: claim-only · "what other states of the world are consistent with these objects?" · 9 alternatives · leads re-derived below (y)`

**7a — ⭐ NEW, and the most important: two positions DID trade through their targets and stayed open, correctly under today's rule.** I had only checked the window after deploy A; the full history from each open (Kraken 15-min candles) shows:
- **ZEC/USD**, target 1367.18: Kraken trades at **1367.25-1368.39, all BUY side, 2026-10-04 22:16:22.811-.815** (six prints, 1.75 ZEC). Our recorded **bid peaked at 1366.53** (`crypto_spot_ticker_snap_2026_10`, 192 snaps 22:00-22:45). ⇒ no exit, by the bid rule.
- **XDC/USD**, target 0.03801: a **0.03840 BUY** print at 09-29 08:01:31 while **bid = 0.03555** (`_2026_09` snapshot). ⇒ no exit.
- **LIGHTER/USD**, stop 3.104: the 3.100 SELL sweep at 10-03 06:22:07.396 (~15 ms) while our bid stayed 3.445. ⇒ no exit.
The crypto exit has triggered on the BID since `b434511cf` (2026-09-14, `8a-P2`, an ancestor of both `bc199185e` and deploy A). **The fidelity question this raises, and it is yours and CC-C's, not mine to rule:** in live mode, is a take-profit a **resting limit sell at the target** (a buyer lifting the book through 1368.39 would have filled it — ZEC and XDC close at target) or a **software trigger that market-sells when the bid reaches the target** (today's paper model — they stay open)? `PRICING_DATA_ARCHITECTURE.md` row 5 (`:640`) says "THE BID for a long's stop and target"; the schema already carries resting-exit columns (`exit_limit_price`, `exit_rest_placed_at`, `exit_deadline`), all NULL on the seven. ~~struck (Langston r1, #452: a conditional stated as settled)~~ **The comparator is ruled (bid, `#741`, 2026-09-14); the resting maker target-exit exists (P19-B8.6, `06560c299`) and fires after the bid trigger; whether a tape-based fill test should supersede the bid proxy for an order already resting is open (`B-RESTING-EXIT-TAPE-FILL`, CC-C, after 3n.q).**

**7b — The exposure arithmetic (reader's alt. 2, re-derived):** the seven positions' entry notional is **$795.83** (`trade-safety.ts:607-664` counts quantity × ENTRY price, all rows, no mode/state/class filter); the cap is **$824.11** ⇒ **$28.28 of room**. Sizes are bimodal — **$51-53 (GBP, LIGHTER, ZEC) and $153-168 (XDC, GRASS, PHA, MGM)** — so one $52 close frees room for a small trade but not a large one. MGM (xStock, $155) is in the same pot and cannot exit over the weekend. All seven rows are `state=open`; no pending maker rows, no resting exits, no orphans. Latest block: `$849.15 > $824.11` (incoming included).

**7c — Reader alternatives still open (each with its discriminator):**
1. Book-full is normal and a *sudden* change, not drift, stopped the closes → closes/day and median hold 09-20→10-02 (closes: 09-27 4 · 09-28 11 · 09-29 6 · 09-30 7 · 10-01 2 · 10-02 2 — a fall from 10-01, coincident with opens falling).
2. The cap moves with session P&L and resets at each engine restart (`guardrail-settings.ts:25-141`) → the `[GuardrailSettings]` lines over time (balance: 859.84 → 794.38 → 831.02 → 826.39 → 824.11 at the first block of 09-29 → 10-04).
4. The sizing step change (`2e`) — **ruled out for A**: the sizing batch is NOT an ancestor of deploy A (release plan §5, `05715c150` exit 1); it rides B.
7. The ranking did not shift, the market did (quiet weekend) → target distance in ATR multiples per day, and whether closes resume Monday unaided.
8. The bad prints changed geometry but not slot size — agreed; they matter for **reachability**, not capacity.
(Alts 3, 5, 6, 9: checked — no orphan/pending rows; post-A blocks are still the exposure code; exit evaluation is live; the Lifetime blank is the empty-window branch, measured 10-04.)

## 8. Langston r1 (2026-10-05 ~11:20Z) — re-derived; dispositions
- **Why now: the clog is sufficient; no second code change.** 5 full slots (`floor(100/20)`), full trade $159.88; 4 of 5 full slots held, 3 of them SBT; the fifth slot fragmented into three $52 positions; residual $28.28 below any size the sizer produces. The cap fell $99.10 with the balance (losses from the far-target regime) while committed exposure stayed at entry. The last freed slot ($164.75 from ZBCN's stop, 10-02 18:47Z) went to MGM, an xStock, 65 min before Friday's close. A threshold crossing, not an event.
- **Correction to §1 (CC-B's):** `closed_trades` carries the seven open rows with `closed_at` NULL, so `closed_trades ∪ active_open_positions` double-counts them; per-day open counts on days with a still-open position are inflated by one each. The ~2 on 10-02 stands.
- **§2's limit is narrower:** the VTS closed 7,468 positions since deploy A through the shared `evaluateTECExit`; only the paper booking path lacks a post-A control.
- **§7a:** outcome (2), working as designed (`#741` ruling, implemented by `8a-P2`). Tape-fill option homed to CC-C after 3n.q.
- **Deploy B:** increment 2e makes every trade a full slot; at 20 % that is 5 slots. **Already decided by Kyle 2026-09-29 (`PAPER-RESET-3000` obj-1): `max_position_percent_pct` 20 → 5 at the reset ⇒ ~20 slots at $145.50.** So the coupling Langston names is met if the reset runs immediately after B.
- **Dispositions:** `#1153` stays row 2a; `#1095` moves up to row 2b and widens to throughput; row 132 is not the home for the root cause.
