# B-XSTOCK-BID-TRIGGER-RELAND — objective 6: ARMING `spread_blown` — r1 (CC-C, 2026-10-16; for Langston AND Coltrane)

**Decider (Kyle 2026-10-16):** CC-C + Langston + Coltrane, by consensus; Kyle only on no consensus. Record: scope §MERGED objective 6 "THE DECIDER CHANGED". His principle is fixed (design r5, 2026-10-09): *no forced exit and no time limit; if live could not sell, paper does not sell, however long that lasts* and *"only trade when there's certainty that it could be done in reality."*

## The question
When should a paper xStock stop or target be allowed to DECIDE on a wide book, and what is "wide" measured against?

Today `spread_blown` is built and OFF (`book-state.ts:279`, `spreadBlownEnabled: false` as a code constant). Its yardstick is the chain's OWN trailing spread: `threshold = max(kRel × trailing median spread, floorPct)` (`book-state.ts:224-226`, `kRel` 3). **On a name whose overnight book is always wide, that yardstick is the overnight book itself, so the arm cannot fire.** PCAR 2026-10-13 00:37Z: spread 12.29%, `thr` 0.39879 (= 3 × trailing 13.29%) — would not have been refused (`LIVE_CASES.md` row 1). So arming it AS BUILT changes almost nothing for the case that costs us.

## The evidence (measured; script `scripts/analysis/xstock-wide-book-stop-vs-next-open.py`, rerunnable)
**Population:** every paper xStock `stop_hit` close since 2026-09-19 whose exit book (`exit_ticker_bid`/`exit_ticker_ask`) was >= 3% wide, outside the US regular session (Mon-Fri 09:30-16:00 ET): **22 closes**. For each: the fill vs the stop, and the next regular session's open (median mid of <1%-wide snaps, 09:35-10:00 ET) vs the stop and vs the fill.
**Control (same query, the regular session):** 86 regular-session stop exits since 09-19, 85 on a <1% book and 1 on 1-3%, average fill 0.03% under the stop; none filled 3%+ under.

| | n | opened ABOVE the stop | opened above the fill | avg open vs fill |
|---|---|---|---|---|
| all 22 (21 with an open read) | 21 | **17** | 20 | +6.38% |
| inside today's pause windows (9: 10-06/07 at 16:15-16:33 and 20:15, before the pause existed) | 9 | 5 | 8 | — |
| **outside the pause windows — the residual the pause cannot cover** | **12** (CCI: no open read) | **12 of 12** | **12 of 12** | **+7.17%** |

The residual 12 (symbol, ET time, spread, fill vs stop, open vs stop): ANET 09-18 20:54 7.8% −0.09% +4.57% · GILD 10-07 23:45 6.1% −3.62% +1.98% · HUM 10-08 08:58 11.3% −5.06% +1.29% · BDX 10-09 05:35 7.9% −2.35% +2.04% · PCAR 10-12 20:37 12.3% −6.37% +0.47% · APO 10-14 00:53 13.7% −5.79% +0.68% · DXCM 10-14 04:15 5.9% −3.06% +3.42% · CBOE 10-14 17:10 3.6% −1.75% +3.15% · WAT 10-14 19:52 5.8% −2.75% +1.27% · EWC 10-15 03:18 14.1% −6.03% +0.91% · GRMN 10-15 04:15 29.0% −14.30% +6.64% · INVH 10-15 04:42 7.7% +0.02% +2.57%.
**Reading:** on every residual case the stock was back above its stop at the next open; selling into the overnight book locked in a loss the regular-session market did not confirm, by 7.17% on average against the fill.
**Limits, stated:** (i) n = 12, one month, one class; (ii) hindsight — a stop exists for the night the price does NOT come back, and none of the 12 is such a night, so this window cannot show the cost of holding through a real overnight crash; (iii) "opened above the stop" is judged on a <1%-wide regular-session mid, the fair-price yardstick, not a fill a stop order would have had; (iv) the 4 cases that opened BELOW the stop (PPG −0.34%, NVT −0.90%, ARKK −1.92%, ROK −0.17%) are all inside today's pause windows, so the pause now holds them anyway.

## The options
**A — arm it with a yardstick that does not move overnight (CC-C recommends).** A stop or target may not DECIDE on a book wider than an absolute ceiling tied to the symbol's own regular-session norm (the session where 85 of 86 exits were on a <1% book) — not the trailing overnight spread. While the book is wider, the position is HELD (the refusal-duration report records it; no page — objective 9). It decides as soon as the book is plausible. *For:* matches Kyle's principle (paper does not decide where a sensible trader would not), and on the residual it would have kept 12 of 12 positions that recovered. *Against:* the overnight-crash case is unmeasured here; a position can sit past its stop until the book narrows, and on a genuine collapse the eventual exit is worse. Bounded today by the plan's design: no forced exit (Kyle).
**B — leave it off.** *For:* never holds a loser; a real bid is a real fill (live would get it with a stop-market order). *Against:* on this window it sold 12 of 12 positions that were back above the stop at the open, 7.17% under the open price on average.
**C — arm it as built (trailing yardstick).** Changes almost nothing (PCAR is not caught); not recommended.

## What A needs before it ships (technical, ours)
1. The yardstick: the ceiling's form and its per-symbol basis (regular-session spread percentile per symbol, or the class's absolute 1% — `ri_abs_spread_ceiling_pct` 1.0 is already the release ceiling, `book-state-config.ts`), decided by us at Step 2 with its own measured fit.
2. The objective-6 forward-binding note (scope): the entry seam's `_noUsableRef` carve-out becomes a whitelist of the reference-relative reasons in the same commit.
3. The order stays A → 6 → B (Langston's 10-10 BLOCKER): the bid trigger (B) ships only with this arm live.
4. A tripwire for the case this window cannot see: a held position whose regular-session open is BELOW its stop is recorded with the loss holding cost (vs the overnight bid), so the overnight-crash cost becomes measured rather than assumed.

## Ask (one gate, each reviewer separately)
Rule on: (a) A, B or C; (b) if A, whether the yardstick is per-symbol regular-session or the class's absolute ceiling, or left to Step 2; (c) anything in the evidence you would count differently (re-derive it with the script).
