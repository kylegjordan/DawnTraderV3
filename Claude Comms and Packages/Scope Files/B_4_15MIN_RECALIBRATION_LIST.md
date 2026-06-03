# Switching xStocks to 15-Minute Bars — What Must Be Reset or Recalibrated (plain-language)

> Kyle 2026-06-03: 15-minute bars APPROVED. This is the master list of everything the switch touches — including things we ALREADY calibrated at 60-minute bars and now have to revisit. Plain-language; the technical file:line detail lives in `B_4_BAR_FREQUENCY_RESULTS_REPORT.md` §3 (architecture pre-audit). Sequencing: **Foundation first → pattern-detection → per-strategy gates → per-strategy trade construction.** Nothing goes live without the regime-label parity sign-off (Langston's #1 gate).

---

## The one-sentence reason this list is long
Almost everything in the system that "remembers" or "measures" recent price was set up counting **bars**, and quietly assumed each bar is 60 minutes. Cut the bar to 15 minutes and every one of those counts now spans a quarter of the time it used to — so the same numbers mean something different, and they have to be re-expressed or re-measured so they keep their intended real-world meaning.

---

## BUCKET 1 — THE FOUNDATION (must change first, before any strategy work)

These are the plumbing + the market-reading math. They have to be correct before anything downstream can be trusted.

1. **The bar plumbing itself.** Teach the system that xStocks can be built at 15 minutes (today it only knows 60 and 240), and create a new place to store the 15-minute bars. xStock-only — crypto's bars are untouched.
2. **The market-condition (regime) memory windows.** The classifier looks back a fixed *number of bars* (e.g. 30 bars for momentum, 14 for trend strength). At 60-min that was 30 hours / 14 hours of memory; at 15-min it becomes 7.5 / 3.5 hours. Re-express these in *time* (or a per-asset-class bar count) so the memory stays the same length of real time. **This is also the fix for the "jumpier read at finer bars" we saw in the study — it's caused by this exact shrinkage, not by 15-minute bars being inherently noisy.**
3. **The market-condition thresholds.** The cutoffs that decide "calm vs volatile vs trending" were hand-set to how much a 60-minute bar typically moves. A 15-minute bar moves about half as much, so those cutoffs must be re-measured against the 15-minute world or the system will mislabel almost everything as quiet/range-bound and pick the wrong strategies — silently, with no error. **This was calibrated in B.1; it must be redone.**
4. **All the indicator settings** (moving averages, volatility/ATR, the trend-strength and momentum measures, VWAP, the "24-hour high/low" window). Each is a bar count today — a "20-bar average" is 20 hours at 60-min but 5 hours at 15-min, a different trading meaning. Re-derive each so it spans the intended real time, per asset class.
5. **The directional-bias system (DBS) + its history.** DBS looks back a fixed number of bars and is scaled by volatility; both change at 15-min. We also have to decide, explicitly, what to do with the stored DBS history: recompute it all at 15-min, or mark a clean "before/after" line so the learning data isn't half-and-half.
6. **The opening-range / ORB plumbing** (see the ORB section below).

> **Exit gate for the whole foundation (Langston's #1 condition):** before we touch any strategy, produce a side-by-side report comparing the OLD 60-minute market-condition labels to the NEW 15-minute labels over the same history, and confirm the shift is understood and intended. Strategy work is held until that's signed off.

---

## BUCKET 2 — THINGS WE ALREADY CALIBRATED THAT MUST BE REVISITED (because they were done on 60-minute bars)

This is the part that directly answers "what do we go back through." Each was tuned during the Phase-24 arc at 60-minute bars:

- **The market-condition thresholds (B.1)** — REDO (same as Foundation #3 above; calibrated on 60-min volatility).
- **The strategy quality gates we audited (B.3 / B3.1a)** — REVISIT. The one gate we proved *works* (pivot-shift's momentum/RSI band, 35–65) was measured on the 60-minute distribution; on 15-minute bars that distribution moves, so the band has to be re-checked and likely re-centered. Same for the trend-strength slope checks.
- **The volatility and directional parts of the quality screen (B.2 — the "VN" volatility-normalization and "DI" directional pieces)** — REVISIT (both are bar-based). **Confirm during the foundation pre-audit which IMF pieces are bar-sensitive.**

### Things we calibrated that DO NOT need redoing (bar-independent — but worth a sanity re-check)
- **The liquidity / order-book-depth screens (the lq_min and min-depth work from B.2)** — STAYS. These read the live order book, not bars, so bar size doesn't change them. (The pending lq_min point-tighten on 06-09 still stands.)
- **The volume-check removal we just shipped (B3.1b)** — STAYS. The volume data is the wrong instrument's at *any* bar size, so removing it holds regardless of frequency.
- The correlation-modulator / sector / macro setup (deferred to Phase 25 anyway) — bar-independent.

---

## BUCKET 3 — THE PATTERN-DETECTION SYSTEM (Kyle: examine this right after the switch, before the strategies)

Candlestick patterns are defined by the *shape* of individual bars (body vs wick, one bar inside another, a three-bar reversal). Those shapes look completely different on 15-minute bars than on 60-minute bars, and the recognizer's tolerances were set with crypto/60-min in mind. After the switch we re-examine the whole pattern-detection service: re-measure how often each pattern appears at 15-min, make its tolerances asset-class-aware (xStock vs crypto judged by their own rules), and decide whether the pattern strategies are even worth carrying at 15-min (the study showed the patterns are weak at every size, so this is an honest "do they earn their place" review, not just a re-tune).

---

## BUCKET 4 — EACH STRATEGY'S OWN SETTINGS (the per-strategy work, after pattern-detection)

For every strategy, two layers:
1. **Its gates** (the accept/reject conditions inside it) — the indicator levels and bands, re-checked at 15-min.
2. **Its trade construction** (never calibrated for xStocks at all): where it enters, how far it sets the stop and target, and how long it holds. **Hold time gets anchored to the clock (a few hours), not a bar count**, so it doesn't silently change when the bar size changes. Stops/targets are sized off volatility, which is itself being re-derived, so these follow.

This is the heart of the strategy-fit effort and is where we actually try to give the strategies an edge — the study confirmed no bar size has a real edge *yet*; building one is this step's job.

---

## ORB — does it get turned back on under 15-minute bars?
**Yes — 15-minute bars are exactly what unlocks ORB.** It was switched off in May for one reason: it needs the first part of the session ("the opening range") to trade a breakout out of, and 60-minute bars collapsed the whole first hour into a single bar, leaving nothing to build a range from. At 15 minutes the first bar (or two) of the session forms a real opening range again, so the concept works.

But it's **not a free flag-flip** — turning it on is part of the foundation/transition work, three pieces:
1. Flip its on/off setting back to on (it's a database value).
2. **Fix a real defect the study surfaced:** ORB is currently being fed the 60-minute bars like everything else, not fine-grained bars — so it must be pointed at the right bar granularity to see an opening range at all.
3. **Re-define its opening-range window in 15-minute terms** (the "first N minutes" window is bar-count-coupled today).

Then it gets validated and re-tuned like the other strategies. So: it comes back **during the transition**, as a deliberate piece, not instantly.

---

## Sequence (how we'll actually do it)
1. **Foundation sub-batch (B.4 first build):** Buckets 1 + the bar-sensitive parts of Bucket 2 (regime thresholds + DBS) + ORB plumbing → **parity-report sign-off gate**.
2. **Pattern-detection review** (Bucket 3).
3. **Per-strategy gates + trade construction** (Bucket 4) — re-tune the live strategies, re-enable + re-fit the deferred equity-suitable ones + ORB.
4. Throughout: asset-class-scoped (crypto never touched), measured by the evidence engine, candidate-settings-confirmed-at-Phase-19.

*Companion: `B_4_BAR_FREQUENCY_RESULTS_REPORT.md` (the study + the technical pre-audit). Active trading OFF — all of this is simulation until Phase 19.*
