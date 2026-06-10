# B.2 LQ APPLY — Completion Report (2026-06-10)

**The point-tighten step of B.2 (xStock liquidity-floor calibration), executed on Kyle's conditional GO after the ≥5-true-RTH-session recheck confirmed the decision value.** Active trading OFF throughout; effects observed via VTS + would_admit telemetry.

## Objectives → outcomes

| # | Objective | Result |
|---|---|---|
| 1 | Recheck the 06-02 depth replay on ≥5 true-RTH sessions (Langston's apply precondition) | **YES** — window 2026-06-03→10 (5 sessions), 485 symbols, 180,959 symbol×20-min-median observations (55,230 RTH). cand 38: RTH pass 88.60%, names-majority 433/485 (89.28%) vs cand 43: 32.44%, 128/485 (26.39%). Two-day pre-check said 432/485 — stable across the methodology fix. Implied $6,309 floor = RTH p10 = the thin-book lens boundary (axiom 6). First run hit `statement_timeout` (snap table outgrew the default since 06-02); fixed with 600s session timeout + the 06-03-onward window filter (also the methodologically-right denominator). |
| 2 | Apply lq_min 43→38 on the 22 main xstock_spot paths | **YES** — migration `2026-06-10b-b2-lq-apply.sql` (MANIFEST-registered; rollback file alongside, manifest-excluded). Post-deploy psql: 0 rows @43, 22 @38. |
| 3 | strong_trend companion → relational contract `max(30, main−5)` = 33 | **YES** — paper vts_strong_trend 30→33 (tightens, epsilon: B.0 measured 0/56,725 rejects at 30; 96.8% RTH pass at 33), live active_strong_trend 35→33 (loosens). Asymmetry explicitly flagged to + accepted by Langston (sim-to-live-parity argument: sub-$2K books wouldn't fill cleanly live, so VTS learning on them is marginal data). Post-deploy: 2 rows @33. Ordering strong_trend < main preserved. |
| 4 | Calibration scoreboard | **YES** — `imf · 22 paths` proposed→applied; both strong_trend rows planned 33 + applied. `planned_result_num/den` deliberately NULL: fills with the LIVE per-family LQ-reject over a matched eval window (denominator discipline) — scheduled into the 4.6-B soak-analysis touchpoint 2026-06-11T19:00Z. |
| 5 | No calibration-epoch bump | **CORRECT, Langston-confirmed** — lq_min is an admission gate, not shared outcome-math substrate (same class as B3.1b). The population step-change is traceable via the ledger applied-date. |

## Workflow trail
Recheck evidence + migration dispatched to Langston pre-push (Kyle directive this session) — `Langston Design Asks/B2_LQ_APPLY_diff_review_r1.md`, staged to his inbox. **Step-4 review: APPROVE w/ 1 revision (R1: `status <> 'applied'` guard on the two ledger statements — the idempotency claim was false for them; folded), Q2 AGREE (strong_trend 33 unification incl. paper-lane tightening), Q3 AGREE (no epoch bump), + governance ask (relational contract → ADJUSTMENT_FRAMEWORK, done).** Reply relayed verbatim to Telegram t21. CI run `27306029201` all-4-green on `9bcb8e313`. Deploy: git pull + db:migrate + build + pm2 restart; HTTP 200.

## Verification evidence
- psql post-deploy: `lq_min` distribution exactly {33: 2, 38: 22, NULL: 6 (quant-active + blank-path rows, untouched)}; ledger 3 rows status=applied.
- Load sanity (full): admitted-names comparison (~3.4× expected on names basis) + ledger planned_result fill at the **2026-06-11T19:00Z soak touchpoint** (shared with 4.6-B chunk-A analysis — one true-RTH stretch covers both).

## Governance files changed
`drizzle/migrations/2026-06-10b-b2-lq-apply.sql` (+rollback) + MANIFEST.txt · `ADJUSTMENT_FRAMEWORK.md` (lq_min per-class spec + ★relational contract) · `MULTI_ASSET_VTS_EXPANSION_PLAN.md` (working-list lq_min ☑ APPLIED) · `BATCH_CATALOG.md` (this row) · `PHASE_HISTORY.md` · MEMORY 3-way · this report.
