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
| **upper bound on DIRECT refusals** (+arm_floor) — NOT a bound on blind-if-ON (see the cascade below) | **148.94** | **26.66%** |

⚠️ `arm` and `arm_floor` are sub-labels of `ok`, not disjoint rows (they add to BLIND TODAY without double counting). Same-second ties sort `ok` last, so a tied second carries `ok` forward — a bias that lowers blind time.

Positions the arm touches: 37 of 78 (floor bound 41). Longest single blind episode — today: HUT 17.8 h, ALB 5.5 h, GLW 4.0 h, HUM 2.8 h, CAG 1.6 h · ON (measured thr): unchanged · ON (floor): HUT 17.8 h, HUM 17.5 h, CAG 7.2 h, ALB 5.5 h, NET 4.4 h.
Before deploy B (4 segments, 17.2 h): too small to read; MGM 13.8 h blind on stale marks.

## Reading
Today an open paper xStock position goes unwatched ~16% of its holding time, mostly on stale marks overnight. ON adds between +0.3 h (+0.05 points) and +60 h (+10.7 points). ⚠️ SUPERSEDED by the ruling below: the +60 h figure bounds only direct refusals, and the yield/re-seed cascade adds hours per yield on top. **INTERIM: may not be cited as the 21-day window's read** (`GOVERNANCE_EXCEPTIONS.md:41`).

## Langston's ruling (2026-10-08 07:27Z, at `68b298dbb`, re-derived by him)
- **Method APPROVED** (all three streams are the active path's own stderr lines; the 5 s cover is validated by HUT's one refuse line per 1.80 s; `unknown` 0.04%).
- **The 26.7% is an upper bound on DIRECT refusals only.** A `hollow` streak reaching `hollow_skip_cap` = 60 YIELDS: the yield refuses too, and `clearBookStateComparator` destroys the reference; the re-seed then meets the `validated` gate. A re-seed taken inside a blowout is implausible and holds the position unvalidated until `SEED_ESCAPED`. **Blind-if-ON is therefore NOT bounded by 26.7%.**

## The cascade term — measured with the arm OFF, every yield in the retained corpus (`error__2026-10-03…08` + `error.log`)
| symbol | yield (UTC) | re-seed | blind until | hours |
|---|---|---|---|---|
| MGM/USD | 10-03 00:16:29 | implausible | yield again 10-05 00:17:32 (spans the weekend) | 48.02 |
| MGM/USD | 10-05 00:17:32 | implausible | `seed_escape_recovered` 10-05 13:45:37 | 13.47 |
| HUT/USD | 10-06 20:16:36 | implausible | `seed_escape_recovered` 10-07 14:03:43 | 17.79 |
| ALB/USD | 10-07 02:01:47 | implausible | yield again 07:11:36 | 5.16 |
| ALB/USD | 10-07 07:11:36 | implausible | `seed_escape_recovered` 07:27:45 | 0.27 |
| GLW/USD | 10-07 20:16:32 | implausible | `seed_escape_recovered` 10-08 00:12:18 | 3.93 |
| STZ/USD | 10-08 00:16:31 | implausible | still unvalidated at 07:30Z | ≥ 7.2, open |
**Every one of the 7 yields re-seeded implausibly**, and 5 of the 7 fall at 20:16Z or 00:16Z — the 4:15 pm and 8:15 pm ET handoffs. With the arm OFF this channel is rare (7 yields in ~5 trading days) but each costs hours. With the arm ON, ~60 h of frames would feed it (Langston: order 2,400 yields at ~90 s per run). ⇒ **ON is not safe to switch on before row 66 (`B-BOOK-STATE-RING-INDEPENDENT-BOUND`) gives an implausible re-seed a way out that does not wait on the spread returning to its daytime level.**

## Owed by the FINAL read (window day 21), not the interim
(a) union the still-open positions from `active_open_positions` (13 open at 07:27Z, the oldest 10-06 16:13:29Z — survivors, blind-heavy by selection); (b) split `arm_floor` by cash session vs off-hours (Kyle's 2026-09-03 ruling settles the off-hours posture); (c) the cascade term above, per yield.

## KYLE'S DECISION (2026-10-09 ~00:10Z)
**`spread_blown` stays OFF.** Row 66 (`B-BOOK-STATE-RING-INDEPENDENT-BOUND`) moves up the pre-sprint exit stage to run right after row 64; 3a is reconsidered only after 66 lands and the window's final read.
