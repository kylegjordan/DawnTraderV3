# B-FEED-HEALTH-GRADE-ARM — SCOPE (Step 1, r1)

change-class: non_architecture

**Issue:** `#1123` (the `feed_health` leg) · **Plan row:** `SPRINT_TO_LIVE_PLAN` 3a — **PAIRED with 3a1 `B-VENUE-QUIET-ALERTING`** and moved up to run right after 2a0b (Kyle, 2026-10-06) · **Owner:** CC-B · **Card:** `PVTI_lAHODmulEM4BfQP4zg-_ZXU`
**Read at:** `origin/migration/aws-supabase` (head `b5b194399`) + staging logs 2026-10-06.

## 0. What is there (measured)
1. **The grade is built and silently disarmed.** `FeedIntegrityMonitorService.computeLiveness` (`server/services/feed-integrity-monitor.ts:269-315`) grades each asset class by its **freshest** symbol's tick age against `feed_health` thresholds (`warning_age_ms`, `critical_age_ms`, xStock `warmup_grace_ms`) read with `getCachedNumberRequired` (`tryGetConfig`, `:318-330`). `feed_health` is **not** in `b72-warmup.ts` `PREFETCH_MODULES`, so the read throws `not warm`, the monitor logs once and returns `healthy` (`:294`). **Live: `2026-10-06 15:45:30Z [FeedIntegrity] feed_health config not warmed yet (warmup_grace_ms/xstock_spot); skipping liveness grade this cycle`** — 30 s after deploy B's restart. The warn is one-shot (`configWarnLogged`), so later cycles are not logged either way.
2. **What it feeds.** `server/jobs/feed-integrity-auto-check.ts` (cron `*/5`, armed at `index.ts:685`; registered in the cron registry as `feed_integrity_cron`) calls `recordSnapshot` + `generateReport`, and on a non-healthy status creates **dashboard alerts** via `AlertsService.createAlert` — one per admin user × `live` and `paper`, `alertType: 'feed_health'`. ⚠️ **These are the user-facing alerts table, NOT `system-alerts.jsonl`** — the crew's §10.5 channel never sees them, Kyle's dashboard does. Also read by `routes.ts:15235/:15362` (feed-health routes) and `parity-gate.ts:95` (the go-live WS-readiness gate).
3. **The weekend is handled; after-hours is not a factor by construction.** xStock symbols are graded only while `isXstockMarketOpenUTC` (weekend-close only, `:276`, `:301`), with a post-open warmup grace. Because the grade is the class's FRESHEST symbol, after-hours thinning on mid-size names does not move it while any name still ticks (measured tonight: NVDA ~775/h, AAPL ~485/h after the close). To be measured over a full overnight at Step 2.
4. **⛔ The clear path is dead — the `#638` shape in a second class.** Recovery is detected only `if (metrics.status === 'healthy' && monitor.getActiveAlertId())` (`auto-check.ts`), but every `updateAlertState(...)` call passes `alertId = null`, so `getActiveAlertId()` is ALWAYS null and the recovery branch never runs; nor does anything resolve the `AlertsService` rows on recovery (only `clearFeedHealthAlertsOnStop` on an engine stop acknowledges them). **Arming the grade as-is would mint dashboard alerts that never clear** — exactly the row's Step-1 question (b).
5. **Provenance (TIER 1):** `P19-B6.7` (`#301`, 2026-06-26, CC-B): *"re-point feed-integrity alarm at primary adapter (per-class freshest-age + xStock market-open gate + warmup grace + DB feed_health config) + DELETE vestigial 2nd-WS subsystem"* (`d0a40fabc`; grade `f9f577fa7`). Intent: a real "is data flowing" alarm, replacing one that graded a dead second socket. The 5 `feed_health` rows were seeded then; the prefetch entry was never added — **disposition (3): disconnected, should be reconnected.** The auto-check job + `AlertsService` path predates it (Phase 27.F.21, Replit era): **(2) relevant, needs updating** (the clear path).
6. **GBP/USD recording gap (row note, 2026-10-04):** the open GBP/USD position was evaluated on a live price, but `crypto_spot_ticker_snap` holds no `GBP/USD` rows — settled in this batch's census (which subscriptions the recorder covers vs which the engine prices).

## 1. Objectives
1. **Arm it:** add `feed_health` to `PREFETCH_MODULES`. *Verify:* after deploy, no `feed_health config not warmed` line; the auto-check's `[FeedIntegrity:auto] … TickAge=` line shows a real per-class age; a unit test that `computeLiveness` grades (not skips) with the module warm.
2. **Clear what it raises:** the recovery path stores and uses the created alert ids, and on a return to `healthy` resolves the `feed_health` dashboard alerts it raised (both modes), logged. *Verify:* a test — non-healthy → alert created → healthy → those rows resolved; and on staging, a forced bad grade (test hook, not production) clears on recovery.
3. **Measure before trusting it:** over one full weekday cycle (regular, after-hours, overnight, pre-market) record the per-class grade and freshest age every cycle; **pre-registered:** zero `warning`/`critical` grades while the feed is demonstrably flowing (any symbol in the class ticking within `warning_age_ms`). A grade that fires on a flowing feed sends the thresholds back before 3a1 relies on them.
4. **Expose the per-class liveness for 3a1:** a read-only accessor (class → freshest age, grade). ⚠️ **Scope of the hand-off, corrected 2026-10-06:** this is FEED-LEVEL liveness — it answers "is the class's feed flowing at all", the whole-feed failure 3a1 must still page on. It is NOT the per-symbol discriminator: telling a quiet symbol from a lost subscription needs the COHORT comparison designed in `PHASE_19_PLAN` 3b.f-d (*"feed-level silence cannot make that split"*), which 3a1 builds.
5. **GBP/USD:** census the recorder's subscription set against the engine's priced set; disposition any gap.

## 2. Out of scope
- The exit-skip alert policy itself (3a1) and its clear path (`#638`, proposed for 3a1).
- `strategy.orb`'s cold module (`#1123`'s third leg) — its own disposition at Step 2 (check whether it is still cold).
- Changing any freshness threshold or any trading behaviour.

## 3. Blast radius
`b72-warmup.ts` (one list entry — a module with zero rows HARD-fails boot at `:193`; **the 5 rows are present on staging, read 2026-10-06 ~22:00Z:** crypto `warning_age_ms` 5,000 / `critical_age_ms` 10,000; xStock 60,000 / 120,000 / `warmup_grace_ms` 120,000), `feed-integrity-monitor.ts` / `feed-integrity-auto-check.ts` (alert-id bookkeeping + resolve), the dashboard alerts table. `parity-gate.ts`'s readiness input is **unaffected — confirmed:** `computeRollingWindowReadiness` (`feed-health-aggregate.ts:116-125`) derives its uptime from per-interval reconnect counts only, never the liveness grade. No signal, sizing, exit or price behaviour.

## 4. Questions for Langston (Step 1)
1. Objective 2 inside this batch (arming a source that cannot clear repeats `#638`), or before it?
2. The pre-registered criterion in objective 3 — sufficient before 3a1 builds on the grade?
3. `#638` (row 166a, the exit-skip alert's dead clear path) folded into 3a1 — it is the same alert class 3a1 re-policies.
