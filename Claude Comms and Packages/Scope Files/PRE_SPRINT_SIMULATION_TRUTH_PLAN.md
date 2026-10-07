# PRE-SPRINT SIMULATION-TRUTH FIXES — DRAFT r1 for Langston and Coltrane (CC-C, 2026-10-07)

**Kyle's directive, 2026-10-07 (Desktop), condensed:** every *system error* found in the first 30 paper closes after the $820 reset — and the others found while fixing them — is fixed **before the sprint starts**, so the sprint begins on what we all agree is an accurate simulation. Calibration (stop and target distances, strategy timing, scores) stays in the sprint where it is. **Group by the part of the system, not by the existing rows:** where one batch working one part of the system fixes several items, it is one batch. When the groups below are done and deployed: **reset paper to $820 again and clear the dashboard metrics**, exactly as on 2026-10-06. **Langston and Coltrane review this grouping; Kyle asked for both.**

## What started it — the first 30 closes after the 2026-10-06 reset (all `stop_hit`, −$29.42)
Measured on staging 2026-10-07 (`closed_trades` since 15:52:58Z, the logs, the code, Kraken's own one-minute bars, the Paper Trading page). **No trade's price ever came near its target** (best: LCID +0.96% against +2.07%), so no target was missed. The losses split three ways:
| | trades | lost | cause | kind |
|---|---|---|---|---|
| A | 5 (STZ, CEG, INTC, CRCL, L) | ~$1.20 | signals waited 1.5–8.5 h in the RTB pool on levels frozen at queue time; the refresh re-scored them on those levels (its SQE pass sees no price); they opened at the live ask with the stop already above the entry | **system error** |
| B | 7 (DLR, PPG, NVT, TMO, NWL, ARKK, INVH) | ~$17 | after the 20:15Z / 00:15Z session handoffs the xStock book went near-empty; the stop fired on the **midpoint** of that book (five of them never traded as low as the stop in the one-minute bars) and filled at the far-off bid | **system error** |
| C | ~16 xStock + 2 crypto | ~$11 | price drifted straight into stops 0.5–1% away, most from the first minute | **calibration** — stays in the sprint |
Also seen: CORZ's exit was booked at $16.80 from a 4.3 s-old depth snapshot while the live bid was $16.68 (a loss shown smaller than it was); the main Dashboard showed 0 trades and $0 while the Paper Trading page showed 30 and −$29.42.

## The proposed groups (each one batch, or one batch in increments)
### P1 — ENTER AT THE RIGHT PRICE (signal birth → RTB refresh → open)
One subject: *the price a trade enters at, and whether its levels still make sense at that price.*
- **Row 59 `B-ENTRY-LEVEL-RECHECK`** (CC-B; `PHASE_19_PLAN` 3n.u2; `#915`, and `#1168` folded into it today): no stop-breached check at open, no entry-overshoot bound, no reward-to-risk at the fill price, no signal age; the RTB refresh re-scores on frozen levels with no price input, unbounded since R9.3-C.
- **Row 41 `B-XSTOCK-ENTRY-COMPARATOR`** (CC-C) — the xStock entry-price cross-check.
- **Row 39a `B-CRYPTO-BIRTH-FEED`** (CC-B; `#1060` am. 4) — the quote that sets a crypto signal's levels is 30-45 s old.
- **Row 40 `B-XSTOCK-SESSION-FRESHNESS`, its entry half** (CC-C; `#684`) — the uncalibrated 15,000 ms entry-fill age limit.
- **Row 53 `B-TARGET-FABRICATION`** (CC-C) — default targets the strategy never chose (levels at birth). *Langston: in or out of P1?*
- **The design question for Langston and Kyle (Kyle's own words):** *"there needs to be some mechanism for our entry that's similar to how we are filling on exits"* — fill at or near the planned entry, or let the levels move with the fill so the stop keeps its distance. Options: (i) refuse when the live ask is past a bound from the planned entry; (ii) a resting buy at the planned entry (a maker entry, which the engine already supports); (iii) re-derive stop and target from the fill at the same relative distances. They differ in how many trades open and in what the strategy's stop means.
### P2 — EXIT AT THE RIGHT PRICE, NO MIDPOINT ANYWHERE (xStock trigger and fill)
- **Row 2 `B-XSTOCK-BID-TRIGGER-RELAND` increment 3** (CC-C) — the xStock stop/target trigger back on the bid, with the `spread_blown` refusal so a handoff book cannot fire it (`#1065`). Increments 1-2 are instruments only. ⚠️ Its plan waits on a 21-day window from 10-02; **ask: release that wait, given cause B.** Brings Kyle the overnight-hold policy with numbers.
- **Row 64 `B-EXIT-TRIGGER-FILL-PARITY`** (CC-C; `#959`) — the fill must be priced from the same book as the trigger (the CORZ $16.80 vs $16.68 case).
- **Row 65 `B-EXIT-TICKER-LEG-ADAPTER-SIDES`** (CC-C; `#952`) — the exit path sees both sides.
- **Row 66 `B-BOOK-STATE-RING-INDEPENDENT-BOUND` + the duration alarm** (CC-C; `#1066` amendment) — the plausibility bound, and an alarm on how long an open position's exits stay refused (HUT and ALB this week).
- **Row 8b `B-STALE-BOOK-DEPTH-REFUSAL`** (CC-C; `#1085`) — depth refusals from our own stale book cache.
- **Row 113 `B-EXIT-DECISION-RUNG-STAMP`** (CC-C) — record which price rung an exit used.
- **Row 3c `B-DISPLAY-TRIGGER-PRICE`** (CC-B; `#1152`) — the screen shows the price that decides the exit.
- Closing **row 17 `B-PRICE-SIDE-BY-JOB`**: it closes when this group lands (Kyle 2026-09-28: no trigger, fill or booking left on the midpoint).
### P3 — THE xSTOCK FEED TELLS THE TRUTH
- **Row 31 `B-XSTOCK-LIVE-FEED`** (CC-C; `#960`) — the xStock feed became our trading feed without a decision.
- **Rows 32/33 `B-PRICE-STALENESS-BOUND`** (CC-C) — a last-known-good price is re-served with no age bound.
- **Row 14a `B-KRAKEN-PRIMARY-KEY-RESOLUTION`** (CC-C; `#1076`, `#1146`).
- **`#1047`** (CC-C, row 17) — the Kraken WS adapter drops ~11 messages a day on a parse error.
- **NEW investigation** — CORZ 2026-10-06 19:00–19:36Z: the quote stream's mid ran ~0.1–0.2 above the same stream's one-minute trade bars for 36 minutes. Which one was wrong is not known.
- *Row 37 `B-BOOK-SUBSCRIPTION-REACH` (crypto order books for the whole pool) — Langston: in P3 or after?*
### P4 — PAPER RESULTS TELL THE TRUTH, AND THE RESET IS SAFE
- **Row 183b `B-LOSS-WINDOW-OPERATOR-CLOSES`** (CC-C; `#1154`) — must land BEFORE the next reset, or the reset's own closes count against the kill switch after any restart (it forced a 24 h no-restart hold this week).
- **NEW** — the main Dashboard showed 0 trades / $0 against the Paper Trading page's 30 / −$29.42 (2026-10-07 08:47Z). Cause not yet read.
- **Row 86 fill-integrity detector** (CC-C) and **row 8a `B-OPEN-REFUSAL-DURABLE-ROW`** (CC-C; `#1083`) — *Langston: needed before the reset, or sprint?*
### P5 — THE RESET
After P1-P4 are deployed and verified: the `PAPER-RESET-3000` procedure at $820 (5% = 20 slots, kill 15%), and the dashboard metrics cleared (a new epoch). The script exists and ran 2026-10-06.

## Already pre-sprint, not regrouped here
CC-B's Wave 0 rows deploying today (2a `B-ATR-BAD-PRINT` — one bad print must not set a stop and target; 2a0, 2a0h, 2a0b) and CC-C's rows 4a / 4a2 / the sizing increment ride the 15:53Z deploy.

## Not in this list (calibration — stays in the sprint, Kyle)
Stop and target distances, strategy entry timing, confidence and prediction scores, pFill, the 25-x rows.

## Ownership
Most items are CC-C's; rows 59, 39a and 3c are CC-B's. Grouping P1 across two owners needs one owner per batch — **proposed: P1 led by CC-B (row 59 is its spine), CC-C's rows 41 / 40-entry / 53 folded in; P2, P3, P4 CC-C.** Langston settles it; any session that disagrees says so.

## What I am asking each reviewer
**Langston:** is this grouping right — what is missing, what is wrongly in, what is calibration in disguise; one owner per batch; the order (proposed P4's `#1154` first as it is small, then P1 and P2 in parallel, P3, then P5); and the row-2 window release. **Coltrane:** an independent read of the same question from the code — are there system errors on the entry, exit, fill or feed paths that this list misses?
