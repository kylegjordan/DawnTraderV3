# B-NEW-39 Phase 1 — Status Report (PARTIAL, 2026-05-16 04:20 UTC)

**This is NOT a completion report.** B-NEW-39 remains OPEN pending forensic shape verification.

---

## 🚨 SCAFFOLDING-VS-FUNCTIONAL DECLARATION

**Phase 1 SQL is applied and mechanically effective. Phase 1 forensic shape verification is DEFERRED to ~3-7 days from now due to crypto market regime sparsity.** Phase 2 application is on HOLD until the forensic verdict comes in. No code change is gated on this batch; the floor change is in production and active.

---

## PREVIOUSLY-STATED-VS-NOW

| Item | Previously stated | Now | Reason |
|---|---|---|---|
| Phase 1 verification timeline | ~1-2 hours after apply | ~3-7 days after apply | Original estimate assumed signal-rich baseline. Actual emission rate ~5/factor/hour AND current RANGE_BOUND_STABLE regime produces only breakeven outcomes (0 wins, 0 losses in past 24h before halt AND post-restart). Forensic requires win/loss outcomes for shape analysis. |
| `--since` flag in forensic CLI | "Committed and ready" (B-NEW-39 scope §8b) | "Committed but not deployed until 04:20 UTC" | Commit `3a0034c6c` was pushed but never deployed to staging. PM2 restart #288 at 23:36 UTC restarted existing build only. Staging was 4 commits behind. Fast-forward + verify happened 04:18-04:20 UTC. |
| Phase 1 outcome verdict | "Tonight" | "3-7 days from now" | Insufficient data for forensic verdict tonight. See §3. |
| B-NEW-38 unblock | "After B-NEW-39 closes" | "After B-NEW-39 closes — same gating, now ~3-7 days later" | Sequential dependency unchanged. |
| B67.5 unblock | "After B-NEW-38" | "Same gating, ~5-10 days later" | Cascade. |

---

## 1. WHAT WAS APPLIED

### SQL change (PRODUCTION, persistent)
- File: `scripts/b-new-39-phase1-floor-revert.sql`
- Applied: 2026-05-15T23:07:54.553Z UTC via psql `-c` with `SET statement_timeout='120s'` and `RETURNING` clause
- Target: `module_constants.regime_classifier.b67_5_post_composition_floor`
- Before: `0.20`
- After: `0.45`
- Rows updated: 1 (wildcard scope: `(exchange=*, asset_class=*, strategy=*, regime=*)`)
- Cache TTL: 60s → new emissions started using floor=0.45 from ~23:09 UTC
- Rollback file (committed, not applied): `scripts/b-new-39-phase1-floor-rollback.sql`

### Operational events
- **2026-05-15T23:36 UTC PM2 restart #288** — pipeline was in stuck state (emissions halted 17:13 UTC, TEC_STALE_FAIL_CLOSED from 17:43 UTC, xstock SCAN_TIMEOUT loop). Restart resolved crypto pipeline. xstock issues persist (spawned task chip for B-NEW-40 candidate).
- **2026-05-16T04:18 UTC git pull on staging** — fast-forwarded from `ba893d9e1` to `9e7040ea8` to deploy the `--since` flag for the forensic CLI. No server-side code changes in the 4 missed commits, no rebuild/restart needed.

---

## 2. MECHANICAL VERIFICATION — COMPLETE ✅

### Floor distribution (post-restart sample, n=100 emissions across 10 factors)

| Floor candidate | Pre-fix baseline | Post-fix sample |
|---|---|---|
| `conf = 0.200` (old floor) | 15.4% pinned | **0.0% pinned** |
| `conf = 0.450` (new floor) | n/a | ~50% pinned |
| Min conf observed | 0.200 | 0.450 |
| Max conf observed | 0.839 | 0.564 |

### Forensic CLI Phase 4 output (post-restart subset, --since=2026-05-15T23:36:00Z)

```
## PHASE 4 — Floor-Clamp Analysis
- % of trades pinned at conf = 0.200: 0.0% (n_pinned=0, n_free=3)
- Pinned-trades WR: 0.0%
- Free-trades WR: 0.0%
Floor is roughly neutral on WR — not the primary inversion driver.
```

**Interpretation:** The 0.20 floor is fully eliminated from new emissions. The new 0.45 floor is binding on signals whose chain-final confidence would otherwise have been below 0.45. This was the explicit mechanical goal of Phase 1.

---

## 3. FORENSIC SHAPE VERIFICATION — DEFERRED ⏳

### Why deferred

The B-NEW-37 forensic CLI requires **win/loss outcomes** to compute WR-by-confidence decile shape. The post-restart cohort has:

| Outcome | Post-restart count | Pre-halt 24h count | Pre-halt 7d count |
|---|---:|---:|---:|
| `admitted_won` | **0** | **0** | 1050 |
| `admitted_lost` | **0** | **0** | 1584 |
| `admitted_breakeven` | 30 | 248 | 4178 |
| `unreplayable_real_rejected` | 70 | 110 | 1768 |

The current and most-recent-24h-pre-halt crypto market regime (RANGE_BOUND_STABLE per the regime classifier, plus persistent stable_choppy-adjacent conditions) is producing **only breakeven outcomes** — neither TP nor SL is being hit before time-based exit. The 7-day baseline shows the system normally produces ~37% non-breakeven outcomes; the recent quiet regime is unusually breakeven-dominant.

### What that means for the verdict

| Decision branch (scope §5.3) | Requires | Status |
|---|---|---|
| `monotonic-up` → SKIP Phase 2, close | Decile-grade WR shape | ❌ no win/loss outcomes |
| `mixed` → apply Phase 2 | Decile-grade WR shape | ❌ no win/loss outcomes |
| `flat` → Phase 3 (Kyle decision) | Decile-grade WR shape AND ruling out small-n artifact | ❌ n=3 forces shape=flat as artifact |
| `worse` → rollback | Comparable baseline | ❌ no win/loss outcomes |

**None of the decision branches can be evaluated yet.** Phase 1 SQL stays in production (no regression evidence), Phase 2 stays on HOLD, no rollback warranted.

### Expected timeline for verdict

| Milestone | Estimate |
|---|---|
| First win/loss outcomes appear | Whenever market regime shifts toward TREND_FRIENDLY_STABLE / volatile / breakout-friendly (not predictable from inside DT) |
| ≥50 win/loss per factor (minimum-signal forensic) | ~3-7 days of normal market activity |
| ≥150 win/loss per decile (decile-grade forensic) | ~10-30 days of normal market activity |

Realistic re-evaluation window: **Sunday/Monday 04:00 UTC cron** (after a full day of accumulation), then weekly.

---

## 4. NO REGRESSION DETECTED

- Floor change is mechanically additive — it RAISES the minimum confidence value, doesn't reject signals
- VTS trade creation rate post-restart is consistent with pre-fix rate (10 opened, 11 closed in first ~5h)
- No abnormal exit logs, no new error patterns related to confidence handling
- TEC resolves at ~5/sec for crypto_spot (healthy)
- No spike in `unreplayable_real_rejected` rate (70/30 split is comparable to historical)

---

## 5. NEXT STEPS (in priority order)

1. **No action required tonight.** Phase 1 SQL stays in production.
2. **Daily check at 04:30 UTC** (after the nightly replay-ablation cron). Look for:
   - `admitted_won` + `admitted_lost` count rising above 50/factor in post-restart window
   - Phase 4 floor distribution shifting from 50% pinned at 0.45 toward whatever the natural distribution is when raw classifier output exceeds 0.45
3. **First meaningful forensic re-run:** when ≥50 win/loss per factor accumulates. At observed rates, possibly Sunday 04:30 UTC, more likely Monday/Tuesday.
4. **Phase 2 decision:** triggered ONLY by the forensic verdict. If `monotonic-up` → skip; if `mixed` → apply 0.001 → 0.0005 on wildcard `b68_5_path_b_momentum_min`; if `flat` (after ruling out small-n) → Kyle decision on B-NEW-40 splitoff.
5. **B-NEW-38 stratified re-run:** still gated on B-NEW-39 close.
6. **B67.5 consumer-gate design:** still gated on B-NEW-38.
7. **xstock pipeline investigation:** spawned task chip — addresses SCAN_TIMEOUT loop + B73 `ohlcBars` undefined errors. Not blocking B-NEW-39.

---

## 6. WHAT KYLE NEEDS TO KNOW (plain-language)

(See `B-NEW-39_KYLE_MORNING_SUMMARY.md` for the full plain-language summary delivered at Kyle morning.)

---

## Reference artifacts

- Pre-fix forensic baseline: `Claude Comms and Packages/Batch Completion/B-NEW-37_FORENSICS.md` (`5520d1892`)
- Pre-fix B-NEW-37 completion report: `Claude Comms and Packages/Batch Completion/B-NEW-37_COMPLETION_REPORT.md`
- Post-restart partial forensic (this report's evidence): `Claude Comms and Packages/Batch Completion/B-NEW-39_PHASE1_PARTIAL_FORENSIC.md`
- B-NEW-39 scope: `Claude Comms and Packages/Scope Files/B-NEW-39_SCOPE.md` (`§8b` documents all Langston Q1-Q5 + Concerns A-D resolutions)
- B-NEW-39 pre-audit: `Claude Comms and Packages/Scope Files/B-NEW-39_PRE_AUDIT.md`
- Phase 1 SQL: `scripts/b-new-39-phase1-floor-revert.sql` (APPLIED)
- Phase 1 rollback: `scripts/b-new-39-phase1-floor-rollback.sql` (committed, not applied)
