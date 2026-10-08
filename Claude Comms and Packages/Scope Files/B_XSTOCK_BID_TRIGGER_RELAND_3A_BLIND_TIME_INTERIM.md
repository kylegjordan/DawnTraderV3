# B-XSTOCK-BID-TRIGGER-RELAND increment 3a — the `spread_blown` ON decision read (INTERIM, day 5 of the 21-day window)

For Kyle's call on turning the `spread_blown` arm ON (Langston 2026-10-07 22:34Z: sound, but a hold-policy decision Kyle reserved). Rebuilt after Langston's 2026-10-08 00:28Z bounce of the frame-only read ("94 runs, max 86 s"), which counted only frames that cleared the EQUITY_MARK freshness gate and the book-state guard and so chopped blind stretches into short runs. **That earlier figure is withdrawn.**

## Method
Extractor `scripts/analysis/xstock-blind-time.py` (committed `f53158742`). Each paper xStock holding period is laid on a timeline and every instant labelled by the symbol's most recent event, each covering up to 5 s:
`ok` = XS_FRAME with spread <= thr · `arm` = XS_FRAME with spread > thr (what ON refuses) · `arm_floor` = XS_FRAME with spread > 1% (the floor of thr = max(kRel*trail, floorPct/100), `book-state.ts:211-214`, floorPct = 1 — ON can never refuse a frame the floor passes) · `mark_skip` = `[EQUITY_MARK] … not actionable this tick` · `book_refuse` = `[BOOK_STATE] REFUSE unvalidated` · `book_hollow` = `[BOOK_STATE] SKIP hollow` · `unknown` = nothing within 5 s.
Population: 79 `closed_trades` rows (mode paper, asset class xstock_spot) held inside 2026-10-02 20:38Z → 2026-10-08 00:30Z, matched to log lines BY SYMBOL (the frame's `pos=` is an `active_open_positions` id, deleted at close). Weekend (2026-10-03 00:00Z → 10-05 00:00Z) excluded. Split at deploy B (2026-10-06 15:45Z). Logs: `error__2026-10-03…07` + `error.log` on staging.

## Result after deploy B (78 position-segments, 558.6 held hours)
Cross-check (Langston's 3): 1,309,274 events in the holds vs 1,340,731 expected at one per 1.5 s — 0.98; `unknown` 0.04%.

| label | hours | share of held time |
|---|---|---|
| ok | 469.70 | 84.08% |
| mark_skip | 67.71 | 12.12% |
| book_refuse | 20.58 | 3.68% |
| book_hollow | 0.42 | 0.08% |
| unknown | 0.22 | 0.04% |
| **BLIND TODAY** (all but ok) | **88.94** | **15.92%** |
| arm (measured thr) | 0.30 | 0.05% |
| **BLIND IF ON — lower bound** (+arm) | **89.24** | **15.97%** |
| arm_floor (spread > 1%) | 60.00 | 10.74% |
| **BLIND IF ON — upper bound** (+arm_floor) | **148.94** | **26.66%** |

Positions the arm touches: 37 of 78 (floor bound 41). Longest single blind episode — today: HUT 17.8 h, ALB 5.5 h, GLW 4.0 h, HUM 2.8 h, CAG 1.6 h · ON (measured thr): unchanged · ON (floor): HUT 17.8 h, HUM 17.5 h, CAG 7.2 h, ALB 5.5 h, NET 4.4 h.
Before deploy B (4 segments, 17.2 h): too small to read; MGM 13.8 h blind on stale marks.

## Reading
Today an open paper xStock position goes unwatched ~16% of its holding time, mostly on stale marks overnight. ON adds between +0.3 h (+0.05 points) and +60 h (+10.7 points). Langston's finding 3 (ON freezes the ring at pre-blowout spreads, so thr drifts toward its floor overnight) puts the likely ON cost toward the upper bound. **INTERIM: may not be cited as the 21-day window's read** (`GOVERNANCE_EXCEPTIONS.md:41`).
