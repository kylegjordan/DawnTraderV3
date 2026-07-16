# P19-B8.5d (sizing tune-3) — completion (CC-A, 2026-07-16)

**change-class: non_architecture** (config-only through governed machinery; rides the open P19-B8.5 batch). Kyle-specced + ratified ($145.58 buffered); Langston Step-1 PROCEED + rev-2 APPROVED-AS-WRITTEN (independently re-derived; his gap (c) closed by measured read: paper max_open_positions=15) + direct PROCEED on (a)-(d).

## Root cause (measured)
The $209 uniform sizing was the per-trade CLAMP, not risk%: `maxNotional = portfolioValue × maxTotalExposurePct × maxPositionPercentPct × 0.97 buffer` (`active-position-sizing.ts:190-198`); 2394×45%×20%×0.97=$209.02 = all 13 open to the cent. Tune-1/2 turned risk% — a lever that never binds. SECOND mechanism: rtb_signals rows carry QUEUE-TIME sizing; promotion opens at the stored size (measured: ZEC opened 11:19Z at $208.70 from a pre-tune-2 row while fresh ZEC signals sized $347.84 post-tune-2). Tune-2 had accidentally RAISED new sizing to $347.84 (exposure 45→100 with position% still 20).

## Applied (all four, Langston-approved)
(a) guardrails_v2 paper `max_position_percent_pct` 20→6.67 (exposure already 100, slots 15; `last_updated_by` stamped). (b) `pattern_pool_gates.pattern_max_position_pct` 0.15→0.0667 BOTH class rows. (c) anchor $2,400→$2,250 via `b8-5-tune3-anchor.ts` (executeReanchor sole-writer, anchorVersion=3, note recorded; commit `114a42166`). (d) one-time RTB `clearQueue('paper')` — 5 stale-sized signals flushed.

## Verification (Step-7 + Kyle's §9.3 UI directive)
- **DB/log proof:** first post-change signals size `sized_notional=$144.52`, `max_position_usd=$148.99` = live portfolioValue $2,233.79 × 6.67% × 0.97 (the $1 below the $145.58 projection = portfolio $16 under anchor after realized losses — "100% of portfolio value" semantics, correct).
- **§9.3 STAGING UI WALK (browser, 13:41-13:44Z):** paper page renders "Starting — Paper: $2,250.00" (anchor live); Open Trades tab renders 11 rows incl. a PENDING maker row — NO crash (see below); existing $209/$210 positions intentionally NOT resized (lifecycle drains them).
- Known display note (CC-B B8.7, not chased): slots renders 14 (floor(100/6.67) in dynamic-slots.ts) until B8.7 re-keys it to max_open_positions=15.

## Rode along (verified, not built here)
The Open Trades toFixed crash: CC-B's `d1742f0a1` fix confirmed LIVE + working by the same UI walk (11 rows, pending-maker included, hasError=false) — the crash Kyle screenshotted at 21:05Z predated the rebuilt client bundle (~10:35Z today).

## Governance
This report + PHASE_19_PLAN §5 row + RUNNING_ISSUES sizing-mechanism note (queue-time sizing = a named B8.5 soak consideration). SIM/SysManual N/A (no component/math change — config values through existing governed paths).
