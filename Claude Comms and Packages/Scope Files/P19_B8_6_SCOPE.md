# P19-B8.6 — MAKER TARGET-EXITS (paper fill model)

change-class: architecture

> **Step-1 scope, rev1 (2026-07-15).** Kyle directive (verbatim-in-substance, 2026-07-15): observing
> entry-only maker economics "doesn't make any sense" — the measurement window must measure the exit
> side too, with urgency. Crew debate converged same day; Langston pre-blessed the design cut with
> three data-honesty conditions (ACs 5–7 below). Owner: CC-B. Full 11-step workflow.
>
> **BOUNDARY — this is NOT the Phase-21 live venue lifecycle.** This batch extends the B7.2c PAPER
> fill model (the honest internal rest-and-fill mechanics entries already use) to TARGET exits.
> Real-venue resting-order concerns — queue position, partial fills, cancel-replace latency, live
> order management — are explicitly OUT OF SCOPE and remain Phase-21 items. The checker and any
> reader should grade this as the paper-side fill-model extension it is, not a live pull-forward.

## Objectives

1. **OBJ-1 — Rest the target exit as a maker order.** When an open paper position's exit evaluation
   would take profit at the target, the exit is placed as a RESTING maker sell at the target price
   (the B7.2c pending pattern, direction inverted), not an immediate taker market order.
2. **OBJ-2 — Honest trade-through fills only (Langston condition 1).** The resting exit fills ONLY
   on genuine trade-through of the target price by the live Kraken feed — no optimistic same-bar or
   touch fills. Fill books the maker fee (0.40%) at the target price. Fill-rate realism is the
   point of the exercise; an optimistic fill model would manufacture exactly the "sped-up garbage"
   Kyle excluded.
3. **OBJ-3 — STOPS STAY MARKET/TAKER (hard carve-out, non-negotiable).** A stop's job is immediacy;
   a resting stop that might not fill converts small losses into large ones. No change to the stop
   exit path. Paper rehearses live behavior.
4. **OBJ-4 — Tiered timeout + convert-to-taker.** A resting target exit that ages past the tiered
   timeout (per-class DB knobs, B7.2c-pattern) converts: re-evaluated at the then-current price and
   exited as taker if the exit condition still holds. No immortal resting exits.
5. **OBJ-5 — Book the convert friction (Langston condition 2).** When a resting target exit
   converts to taker, the taker fee + slippage of the conversion land in the trade's realized
   friction columns. Measuring maker economics means measuring the misses, or the savings are
   overstated.
6. **OBJ-6 — Report the denominator (Langston condition 3).** Every maker-exit savings figure the
   system reports (dashboards, completion evidence, Phase-25 reads) carries: fills vs
   didn't-fill-and-converted counts, and a sample-size caveat on short windows. Maker exit fills
   are conditional on continuation — the magnitude reported is the one measured, not hoped for.
7. **OBJ-7 — Cohort stamping.** Exit-side fields on the closed-trade record: exit fee mode
   (maker/taker), rested-at price, fill-vs-convert outcome, rest duration — KEEP-AS-DATA, the same
   pattern as the entry-side chosen_entry_mode fields (B7.2b), so Phase-25 separates maker-exit
   economics cleanly.
8. **OBJ-8 — Sanity-gate compatibility.** The resting-exit fill detection consumes the SAME
   sanity-gated price the exit monitor uses (the P19-B8.5 fallback-price gate sits upstream) — a
   phantom high must not phantom-fill a resting target exit.

## Verification criteria (Step-7/8)

- A live paper position whose target is reached shows: rest placed (log + position state), genuine
  trade-through fill at target + maker fee on the closed-trade row — verified in DB and on the
  staging UI (Closed Trades exit-fee-mode column).
- A resting exit that ages out shows the convert path: taker exit + conversion friction booked.
- Stop exits verified UNCHANGED (taker, immediate) on a live stop event.
- The denominator surfaces: fills and converts both countable from the stamped rows.
- CI 4-green; Langston Step-4 diff pre-push + Step-8 independent pass.
