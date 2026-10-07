# PRE-SPRINT SIMULATION-TRUTH FIXES — r2 (CC-C, 2026-10-07; r1 `9efccfce8` → Langston's ruling 11:12Z folded)

**Kyle's directive, 2026-10-07 (Desktop), condensed:** every *system error* found in the paper closes after the $820 reset — and the others found while fixing them — is fixed **before the sprint starts**, so the sprint begins on what we all agree is an accurate simulation. Calibration (stop and target distances, strategy timing, scores) stays in the sprint. **Group by the part of the system, not by the existing rows.** When the groups below are done and deployed: reset paper to $820 again and clear the dashboard metrics. **Langston and Coltrane review; Kyle asked for both.** Langston ruled r1 at 2026-10-07 11:12Z (re-derived on staging); Coltrane's independent read is pending.

## What started it — measured, and still growing
**33 closes after the 2026-10-06 reset, 33/33 `stop_hit`, −$31.92** (Langston's read 11:12Z, `closed_trades` since 15:52:58Z; r1 said 30 / −$29.42 at 08:47Z — the population is still growing, not a closed set). All 33 ran on deploy B (`3576d3981`, 15:45:04Z), not on the current head. **No trade's price came near its target** (best LCID +0.96% against +2.07%).
| | trades | lost | what the rows show | kind |
|---|---|---|---|---|
| A1 | 4 (STZ, CEG, INTC, CRCL) | ~$0.60 | stop above the fill (+0.10% to +1.49%): signals waited 1.5–8.5 h on levels frozen at queue time; the RTB refresh's SQE pass sees no price; the open fills at the live ask with no check | system error |
| A2 | 1 (L) | $0.14 | stop 0.059% BELOW entry, closed in 4 s — a stop inside the spread. **Hypothesis (Langston): one bad print set it — row 2a `B-ATR-BAD-PRINT`'s case; test L against 2a's fixture.** | system error |
| B | 7 (DLR, PPG, NVT, TMO, NWL, ARKK, INVH) | ~$17 | **mostly the FILL, not the trigger.** Fill below stop = **$12.73 of $17.11 (74%)** in this set, every one on a `walk` / `walk_stale` fill arm, the gap 1.4×–13× the stop distance (DLR 10.32% of entry on a 0.79% stop). Triggers: 5 of 7 fired 0.08%–0.94% through the stop (ordinary); only NWL (2.84%) and INVH (3.20%) are materially through it. **The "midpoint of a near-empty book" mechanism is established for 2 of 7 at most; r1 over-attributed it.** Across all 33, fill-below-stop = **$14.64 of $31.92 (46%)**. | system error |
| C | the rest | the rest | price drifted into stops **0.41%–2.23% (xStock), 2.80%–5.55% (crypto)** away | calibration — stays in the sprint |

## The order (Langston 11:12Z)
**0 → 1 (with P1 in parallel) → 2 → 3 → 4 → 5.**

### Stage 0 — RESET SAFETY (small, first)
- **Row 183b `B-LOSS-WINDOW-OPERATOR-CLOSES`** (CC-C; `#1154`) — the reset's own closes must not count against the kill switch after a restart.
- **Row 173 / `#1067` the engine stop must not throw** (CC-B; built 10-06, deploy + exercise a stop) — the 10-06 reset halted mid-sequence on the integer overflow.

### Stage 1 — FEED TRUTH UNDER THE EXITS (CC-C) — upstream of every P2 refusal
- **Rows 32/33 `B-PRICE-STALENESS-BOUND`** — a last-known-good price is re-served with no age bound.
- **Row 14a `B-KRAKEN-PRIMARY-KEY-RESOLUTION`** (`#1076`, `#1146`) — a phantom cache key has no price at the trigger (`#1056`: `GBP/USD` → `ZGBPZ/USD`).
- **`#1047`** — the Kraken WS adapter drops ~11 messages a day on a parse error.

### P1 — ENTER AT THE RIGHT PRICE — two batches, in parallel with Stage 1
- **P1a (CC-B): row 59 `B-ENTRY-LEVEL-RECHECK` + row 39a `B-CRYPTO-BIRTH-FEED`.** Row 59 (`PHASE_19_PLAN` 3n.u2; `#915`, `#1168` folded): the stop-breached check at open, the entry-overshoot bound, reward-to-risk at the fill price, signal age, and the RTB refresh retiring a signal whose live entry has left its levels. **+ a second bound r1 missed (Langston): a minimum stop distance against the symbol's live spread**, or a stop inside the spread (L) stays admissible. **+ the L/USD question with row 2a.**
- **P1b (CC-C): row 41 `B-XSTOCK-ENTRY-COMPARATOR` + row 40's entry half** (`#684`, the uncalibrated 15,000 ms xStock entry-fill age gate) — kept apart from P1a because row 59's constraints fence it off CC-C's tick gate (`3b.f-c`).
- **The entry design question — Kyle's, with Langston's recommendation.** (i) refuse when the live offer has moved more than a set distance from the planned entry; (ii) a resting buy at the planned price; (iii) move stop and target with the fill. **Langston recommends (i) as the gate now, (ii) as the design to grow into**; (iii) rewrites what the strategy chose.

### Stage 2 — P2, EXIT AT THE RIGHT PRICE (CC-C), in this order
1. **Row 64 `B-EXIT-TRIGGER-FILL-PARITY`** (`#959`) — **FIRST: the largest single dollar item in the set, no window.** The fill must come from the same book, at the same moment, as the trigger (the `walk` / `walk_stale` arms; CORZ booked at $16.80 from a 4.3 s-old snapshot while the live bid was $16.68). **Row 86 (fill-integrity detector) folds into its verification** (§9.4 disposition 1).
2. **Row 65 `B-EXIT-TICKER-LEG-ADAPTER-SIDES`** (`#952`), **row 8b `B-STALE-BOOK-DEPTH-REFUSAL`** (`#1085`), **row 113 `B-EXIT-DECISION-RUNG-STAMP`**, **row 3c `B-DISPLAY-TRIGGER-PRICE`** (CC-B, `#1152`).
3. **Row 2 `B-XSTOCK-BID-TRIGGER-RELAND` increment 3, SPLIT (Langston):** **3a — the `spread_blown` refusal ON + row 66's ring-independent bound**, the 21-day wait **RELEASED for 3a** on three conditions: (i) the window keeps running and becomes 3a's post-deploy verification; (ii) at Step 2, confirm the `[3n.q7][XS_FRAME]` line still emits when the arm refuses a tick; (iii) 3a's verification reads the drop in `feed_burst` / `mark_deviation` counts and the rise in entry refusals on `hollow` as the arm working, not as improvement. **3b — the trigger to the bid — stays gated** on the window's read and Kyle's hold decision: on a collapsing book the bid is below the mid, so a bid trigger alone fires EARLIER (`#1066`: *"the bid was below the stop too"*); 3b lands behind 3a or re-opens `#1065`.
4. **Row 66's duration alarm** (`#1066` amendment; HUT and ALB this week).
- **Row 17 `B-PRICE-SIDE-BY-JOB` closes only when `#567` and `#1047` have ridden too** (its row carries both).

### Stage 3 — FEED DECISION AND THE OPEN INVESTIGATION
- **Row 31 `B-XSTOCK-LIVE-FEED`** (`#950`/`#960`) — **a Kyle DECISION, sent now, in parallel; it does not gate the sprint.** The xStock feed was built as a passive archive meant to share no state with trading, and became the trading feed without a decision (Kraken has no public REST for xStocks); its subscription list is fixed at process start while the trading universe refreshes daily.
- **CORZ 2026-10-06 19:00–19:36Z** — the quote stream's mid ran ~0.1–0.2 above the same stream's one-minute trade bars for 36 minutes. Investigation; which side was wrong is not known.

### Stage 4 — PAPER RESULTS TELL THE TRUTH
- **Row 8a `B-OPEN-REFUSAL-DURABLE-ROW`** (`#1083`) — **IN, before the reset**: we see the opens and not the refusals, so "33 stop-outs" has an unmeasured denominator.
- **The main Dashboard showed 0 trades / $0** against the Paper Trading page's 30 / −$29.42 at 08:47Z — **to CC-B first**: `B-DASHBOARD-STATS-BLANK` (`#903`) closed 10-07 on this symptom; check the 08:47Z read against that fix before scoping new work.

### Stage 5 — THE RESET, BOTH HALVES
- **The balance:** the `PAPER-RESET-3000` procedure at $820 (5% = 20 slots, kill 15%) and a new dashboard epoch — after Stages 0-4 are deployed and verified.
- **The learning record: row 100 / plan row 9, the learning-record restart (CC-B)** — Langston: rows 2, 41, 40, 53, 59, 64, 65, 66 are its named prerequisites, so resetting the balance while the learning system keeps outcomes from the old geometry would leave the deepest half undone. A **scoped partial restart, declared as such**: it applies its own three-case rule, states which populations restart (active paper, VTS, the rejected arm), and names the prerequisites still open outside this set (row 87, `#527`).

## Out of this set, with the reason
- **Row 53 `B-TARGET-FABRICATION`** — 0 of 33 targets at the fabricated +2.000% (range 1.148%–24.260%). Owes one measurement of the live ranking path; back in if that finds fabrication.
- **Row 37 `B-BOOK-SUBSCRIPTION-REACH`** — weeks of unscoped build (36.1 GB/day) against zero evidence in the 33; the book-as-at-the-decision need is served for exits by row 113.
- Calibration: stop and target distances, entry timing, scores, pFill, the 25-x rows.

## Already pre-sprint, riding today's deploy (not regrouped)
CC-B's Wave 0 rows (2a `B-ATR-BAD-PRINT`, 2a0, 2a0h, 2a0b) and CC-C's rows 4a / 4a2 / the sizing increment, at `0c8ef5da2` after 15:53Z.

## Decisions that are Kyle's
1. **The entry design** — (i) / (ii) / (iii) above; Langston recommends (i) now, (ii) later.
2. **Row 31** — keep the archive as the xStock trading feed, declared and hardened, or build a dedicated live feed.
3. **The overnight hold** — already ruled 2026-09-03 (*"we just hold"*); nothing measured argues for relaxing it.
