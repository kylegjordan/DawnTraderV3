# xStock trading-window + exit-policy notes — FOR LATER DISCUSSION (Kyle, 2026-07-25)

**Status: NOTES ONLY, not a scope.** Captured from Kyle's directive 2026-07-25 so they are not lost. To be discussed and, where agreed, turned into real scoped work. Companion: the one-time `monday-slot-jam-recheck` scheduled task (fires Mon 2026-07-27 10:00 ET) watches whether the slot-jam is re-forming this week — if it is, these are the candidate fixes.

## Why these matter — the finding they come out of

The week of 2026-07-18 to 07-22 the ready-to-buy pool backed up to ~100 and the open-position slots jammed. Verified root cause: slots filled with **xStocks that opened Friday and were held through the weekend** (xStocks are suspended over the weekend) while a **broken time-exit** meant nothing cleared them. With slots full, new signals could not promote and piled up in the pool; it drained 07-23 when the exit path was fixed and turnover resumed. **The max-hold time-exit is PAUSED again as of 07-24, so the jam can re-form.** Kyle's added insight below sharpens *why* xStocks stick: it is not only the weekend — it is any time **outside US trading hours**, when xStock order-book depth thins out.

---

## Idea A — Friday dampening of new xStock entries before the weekend

Reduce or stop opening NEW xStock positions as the Friday close approaches, so Friday's book doesn't fill slots that then cannot clear over the weekend. This is board **item 4 (the pre-weekend entry throttle)** — it stops being a nice-to-have once we understand the weekend jam. Standard practice at trading firms. Decision for Kyle on the exact window and whether it's a hard stop or a taper.

## Idea B — a non-time-based exit policy (clear positions that have gone stale/inactive)

The max-hold is a **time**-based exit (close after N hours), and Kyle has paused it because 24h was never his decision (see the max-hold policy thread). The idea here: an exit that fires not on elapsed time but on a **metric that shows a particular open trade is going to sit longer than we want** — e.g. the position's **order-book / price activity has gone stale for a certain period** (no meaningful movement, thin book). A position that has stopped moving is occupying a slot without progressing toward its target or stop; clear it on that signal rather than on a fixed clock. This complements, and may be better than, a pure time-exit for the stuck-xStock problem.

## Idea C — per-xStock time-of-day gating from order-book activity (Kyle's bigger idea)

**The observation:** xStocks trade 24 hours × 5 days, but their **order-book depth/volume drops significantly outside US trading hours** (overnight, on average). So an xStock position opened overnight often gets stuck — thin book, little movement — and doesn't resume real activity until the next US session, occupying a slot the whole time. This is the *within-week* analogue of the weekend problem.

**The proposed system to study + build:**
1. **Track order-book activity for every scanned xStock pair** — measure each pair's order-book volume/depth **through the day, on each weekday (Mon-Fri; skip Sat/Sun).**
2. **Look for consistent intraday patterns** — does each pair reliably thin out at the same hours (outside US hours) and thicken during US hours?
3. **Categorize the xStocks** by their activity profile — how much each one moves during US trading hours vs outside them. Likely a small number of buckets (e.g. "US-hours-only liquid", "moderately liquid off-hours", "liquid most of the 24h").
4. **Devise a time-of-day entry rule per category** — effectively: *"do not enter trades for this xStock during these hours"* (its low-activity window), only during its healthy window.

**Kyle's open implementation question (to resolve in the discussion):** where does this rule live?
- **(a) A gate INSIDE the SQE** — the signal is rejected at evaluation if the pair is in its low-activity window; OR
- **(b) The signal is allowed through the SQE but then BLOCKED and parked at the BOTTOM of the ready-to-buy queue** until the pair's ideal trading window is in progress, at which point it becomes eligible again.

The (b) variant is interesting because it keeps the candidate alive (doesn't discard it) and lets it promote once its window opens — but it interacts with the queue/annealing/budget mechanics and the promotion logic, so it needs a design pass. Whether the data even shows consistent, per-pair intraday patterns strong enough to categorize on is the **first empirical question** — step 1 (the tracking) has to run before steps 3-4 can be designed.

---

## Suggested sequencing (for the discussion, not decided)

1. Watch the Monday recheck — is the jam re-forming? (scheduled)
2. If yes, the fastest mitigations are Idea A (Friday dampening) and/or Idea B (stale-activity exit).
3. Idea C is the deeper, data-first project: stand up the per-xStock intraday order-book-activity tracking, see if the patterns are real and consistent, then design the categorization + the time-of-day gate (and settle the SQE-gate-vs-park-at-bottom question). Likely a Phase-25-adjacent calibration workstream, not a quick fix.
