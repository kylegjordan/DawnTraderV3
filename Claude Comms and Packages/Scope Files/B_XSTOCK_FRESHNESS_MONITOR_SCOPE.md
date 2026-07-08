# B-XSTOCK-FRESHNESS-MONITOR — Scope (Step-1)

change-class: non_architecture
**Owner:** CC-A · **Reviewer:** Langston · **Date:** 2026-07-08 · **RUNNING_ISSUES:** #441
**Trigger:** Kyle's CONDITION for accepting the B-STORAGE-HARDEN Wave D conservative capture rate (4000 ms): *"add in some monitoring system that tracks the opportunities we lose out on and whether or not there are other unintended consequences… an analysis task and report run once per week until we are satisfied we're not losing out on opportunities."*

> Read-only analysis + weekly report over existing data. NO change to the trading engine, strategy logic, regime, filter, signal pipeline, or schema of any live table. It only READS `xstock_spot_ticker_snap` / `xstock_spot_ohlc_1m` (+ later the signal/RTB/fill telemetry) and WRITES a report + a §10.5 alert. Hence `non_architecture`.

## Background (what we're watching, and why)
Wave D slowed xStock quote capture to ~every 4 s. Clean-RTH measurement: this occasionally pushes ~10 mid/high-volume xStock names (Cardinal Health, Danaher, Paccar, Chubb, NetApp, ResMed, UHS, STRC, Fox, + the small ETF EWN) past the 15 s fill-freshness gate — but only in their **rare native tick-pauses** (their median tick is 1.5–2 s = fresh most of the time). A separate ~83 names are natively >15 s at ANY cadence (#440). Kyle accepted the conservative rate on the condition we **watch** what it actually costs, weekly, until satisfied.

## Objectives
- **OBJ-1 — Weekly freshness-breach exposure report.** Over the past 7 days of xStock RTH captures, per symbol compute: the count + fraction of a symbol's captures whose gap-to-next exceeded the 15 s freshness gate (a "would-block-a-fill" moment); the worst N names; and the week-over-week trend of the total breach-moment count + the affected-name count. Split the affected names into (a) throttle-caused (fast native median, occasional tail — the Wave-D-introduced cost) vs (b) natively-slow (#440 — throttle-independent) so the report never conflates the two.
- **OBJ-2 — Unintended-consequence checks.** (a) **Depth-median sample adequacy:** the scanner's 20-min rolling-median top-of-book depth window still has ample samples per symbol at 4000 (the audit's granularity-sensitive consumer — flag any symbol/window that drops below a safe sample floor). (b) **Decision-bar integrity:** `xstock_spot_ohlc_1m` bar coverage stays full (per-symbol bars/day ≈ expected) — catches any regression + overlaps the #439 OHLC-stall watch.
- **OBJ-3 — Weekly automated delivery.** A cron on staging (proposed `0 6 * * 0` — Sunday 06:00 UTC) runs the analysis, writes a dated report artifact, and fires a §10.5 informational alert whose body is a PLAIN-LANGUAGE summary (auto-posts to Discord via the alerts webhook + surfaces to a CC to relay/interpret to Kyle). Recurring until Kyle says stop (a simple DB flag or the alert's own cadence controls "keep running").
- **OBJ-4 — Forward hook (scaffold now, wire when active trading is ON).** Once active trading is live (Phase 19+), cross-reference the freshness-breach moments against ACTUAL signal-emit / RTB-promotion / fill-attempt events for the affected names — i.e. did the system actually WANT to trade a name at a moment its quote was stale? That is the TRUE opportunity-loss measure. Until active trading is on, the report is exposure-only (potential, clearly labeled) and OBJ-4 is a documented seam, not built live.

## Verification (Step-7)
- The analysis script runs on staging over real 7-day data and produces a correct, readable report (spot-check the breach counts against a hand query for 2–3 names).
- The throttle-caused-vs-natively-slow split is correct (the 10 vs 83 buckets reconcile with the Wave-D measurement).
- The weekly cron is installed (root crontab) + fires the §10.5 alert with the plain-language summary; first run posts to Discord.
- Depth-median sample-floor + OHLC-coverage checks produce sane numbers.
- CI 4-green; governance (SIM component entry + this scope + pre-audit + completion + RUNNING_ISSUES #441 + BATCH_CATALOG + a weekly-report artifact location). SysManual likely N/A (analysis/observability, not architecture) — judged at pre-audit.

## ★ Step-1 APPROVED (Langston 2026-07-08) — locked decisions folded in
- **Q1 delivery:** §10.5 alert path (reuses infra + ack tracking; no parallel webhook).
- **Q2 flag:** `module_constants` `xstock_freshness_monitor.enabled` (cold-start default = enabled). **Fail-LOUD (rule 10):** a missing/unreadable flag does NOT silently no-op — the run still fires and the alert states the flag was unreadable.
- **Q3 report table:** **BUILD the `xstock_freshness_report` table** as the durable week-over-week trend SSOT (file-only would force re-parsing prior artifacts). Keep the dated file as the human-readable artifact. Table written/read ONLY by this job.
- **Q4 class:** `non_architecture` holds (read-only over live tables + report + alert). The new table is observability-scope → **SIM observability-component entry (NOT System Manual).**
- **Q5 EXTRA CHECK (folded into OBJ-2):** add a **per-symbol pre-vs-post-Wave-D 1-min bar HIGH-LOW RANGE comparison** — the 4000 ms cadence reduces ticks-per-bar, which can COMPRESS the 1-min bar's high-low range (fewer samples → understated intraday range). That range feeds ATR / volatility-regime inputs = **Net-Expectancy-relevant**, not just data-quality. This covers sample-BIAS; depth-median + OHLC-coverage cover sample-COUNT.
- **★ OBJ-3 ALERT-FRAMING LOCK:** the Kyle-facing summary MUST say, in plain language, **"this is what COULD have been blocked, not what we actually lost — true loss isn't measurable until active trading is live."** Reading potential-loss as actual-loss would defeat the condition Kyle set.

## Open questions for Langston (Step-1) — RESOLVED above
1. Delivery: §10.5 info-alert-with-plain-language-body (auto-posts Discord + CC relays) vs a direct staging→Discord webhook post. I lean the alert path (reuses existing infra + a CC turns numbers into Kyle-plain-language). Agree?
2. "Until satisfied" control: a `module_constants` flag (`xstock_freshness_monitor.enabled`) the cron checks, so we can stop it without touching cron. Agree?
3. Report artifact home: a dated file under `/var/log/dawntrader/` + optionally a small `xstock_freshness_report` table for trend history. Table worth it for week-over-week, or keep it file-only v1?
4. Is `non_architecture` right (read-only analysis + report; no engine/schema/pipeline change)?
5. Anything else you'd want watched as an "unintended consequence" beyond freshness-breach exposure + depth-sample adequacy + OHLC-coverage?
