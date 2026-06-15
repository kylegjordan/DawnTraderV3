# P19-B4a — Step-4 code review (full implementation) — change list

**From:** Claude New (CC-B) · **To:** Langston · **Date:** 2026-06-14
**Decision:** APPROVE / APPROVE-WITH-CONDITIONS / CHANGES on the B4a implementation + ratify 3 decisions (C5 default-open, C7 deferral, C8 cap-correction).

> INFRA NOTE: the B4a commits are LOCAL-only (not pushed — that's the plan: push after your Step-4). So you can't `git show` them on staging/GitHub. The load-bearing NEW code is embedded below. Don't cd /mnt/gdrive or git the mount.

**Bench evidence (every chunk):** `node scripts/check-tsc-baseline.mjs` → "no regressions above baseline" after each chunk; full `npx vitest run` → **168 files / 1932 passed** after C3, C4, and C5 (the +23 over the pre-B4a 1909 = the new C3 tests). 19 local commits `origin..HEAD`.

## Chunks (C1–C8)

**C1 (resolver-backed RTB write spine) + C2 (xStock wire-in)** — already in your prior reviews; pushed-HEAD `d9b312780` predates these. Unchanged.

**C3 (freshness + liquid-fill-window + silent-stall watchdog)** — landed exactly per your APPROVE-WITH-CONDITIONS. All 4 conditions met: (1) watchdog gates on `!isInXstockWeekendClose` (24/5 feed-live), two-tier DB threshold rth 75s / offrth 750s; (2) holiday/half-day hole homed → **#236 → P19-B6.6, B7b hard-gated**; (3) freshness DB-resolved via the same `xstock_fill_safety` module; (4) index `xstock_spot_ticker_snap_sym_time (symbol, captured_at DESC)` confirmed already present. 2 new test files (10 + 11 tests).

**C4 (classify hardening)** — landed exactly per your APPROVE-WITH-CONDITIONS. (C1) prefer-stamp validated via NEW `asValidAssetClass` (present-but-invalid → null → fallback → skip); (Q2) `feePercentFor` = assert-unreachable throw (sites 7/8/9 skip upstream); (Q3) validator explicit-block + catch-all kept; (Q4) #230 hard-skip — all 5 vts-runner sites reuse the function-entry guard's non-null `_assetClass` (no mislabeled sample can form); (Q5) stale RTB comments fixed to point at the stamp. Hook registered at boot (active-only alerts). 10 sites converted.

**C5 (DB-resolved active strategy gate + dispose hardcoded list)** — embedded below. **DECISION TO RATIFY: option (a) DEFAULT-OPEN** — "fail-hard" satisfied by deleting the hardcoded list (the DB resolver is sole authority + throws on cold cache); explicit-allowlist (b) would black out ALL crypto until a crypto_spot seed migration (out of C5 scope, homed as a follow-up if you want it). Disposed: 2 inline `enabledStrategies:[9]` literals + the orchestrator Set machinery (config field, Set+default, 2 dead public methods `isStrategyEnabled`/`getEnabledStrategies` — zero live callers, sweep-verified, log/stat/telemetry re-sourced to `STRATEGY_DISPLAY_NAMES`). **Blast-radius catch: the `/reb-2-12F/strategy-health` diagnostic (routes.ts:10617) regex-parsed the orchestrator SOURCE TEXT for the deleted Set — re-pointed at `STRATEGY_DISPLAY_NAMES` (a fragile source-text coupling removed).** DELETED_COMPONENTS_LOG entry added (inline → documented + git-ref, no `.removed` file).

```ts
// signal-orchestrator.ts — gate at buildSizedSignalForStrategy, right after the stamp-missing throw:
const _canonicalStrategy = strategyId === 'range_trading' ? 'range_trade' : (strategyId as string);
if (!isStrategyEnabledForAssetClass(_canonicalStrategy, _stampedAssetClass)) {
  console.log(`[P19-B4a][C5][STRATEGY_GATE] blocked ${rawSignal.symbol}/${_canonicalStrategy} — disabled for assetClass=${_stampedAssetClass} (strategy_gates DB).`);
  return null;
}
// site E disposal: const activeStrategies = new Set([...this.enabledStrategies].filter(...)) → new Set(regimeStrategies);
// reb-2-12F: const sourceStrategies = Object.keys(STRATEGY_DISPLAY_NAMES); const dhmaWired = 'dhma' in STRATEGY_DISPLAY_NAMES;
```

**C6 (A7 calibration_state)** — migration adds `calibration_state TEXT NOT NULL DEFAULT 'pre_calibration_xstock_2026_05'` to `paper_sim_trades` + `paper_sim_open_positions` (Postgres fast-default auto-backfills every existing row → no stranded null). Mirrors F-NOW's VTS-side tag. Manifested. No write-path code (default tags everything).

**C8 (A6 / #153 pattern cap)** — **DECISION TO RATIFY.** Honest finding: a shadow-evidence validation of the cap *binding* is impossible pre-activation (active-paper dormant since Phase 8 → no xStock active position sizes exist; cap non-binding today). The 0.50 is an admitted placeholder, 3.3× crypto's validated 0.15, and points the WRONG direction — xStock is LESS liquid than crypto (C3 measured thinner books), so its single-position concentration cap should be ≤ crypto's, not higher. **Interim correction: UPDATE xstock_spot pattern_max_position_pct 0.50 → 0.15** (risk-reducing, crypto-aligned, DB-adjustable). Final per-class evidence-calibrated value stays a Phase-25 / B7b pre-flight item (#153 open).

```sql
-- C8 migration:
UPDATE module_constants SET value = '0.15'::jsonb, updated_by = 'p19-b4a-c8'
 WHERE module_name='pattern_pool_gates' AND asset_class='xstock_spot' AND strategy='*' AND regime='*'
   AND constant_name='pattern_max_position_pct';
```

**C7 (A4 RTB SET NOT NULL) — DECISION TO RATIFY: DEFERRED (#237).** Per your decision-6 ordering (resolver-backed write → real soak → flip), the soak CANNOT run in B4a: the only `rtb_signals` writer is the active orchestrator path, which is dormant (C2 gated off, crypto off, VTS never touches RTB) → zero writes → a 48h zero-null soak is vacuous, and the scope itself says a vacuous soak must not gate the flip. The substantive A4 deliverable — the resolver-backed write (C1) — is shipped. The flip is homed to the B7b post-activation soak (#237). This is consistent with your decision-6; just confirm you agree the flip waits for real writes.

## Migrations applied at deploy
C3 fill-safety seed (`xstock_fill_safety`) + C6 calibration_state + C8 cap-correction. C7 NOT applied (deferred).

## Ask
APPROVE the B4a implementation, and ratify: **C5 default-open**, **C7 SET-NOT-NULL deferral (#237)**, **C8 0.50→0.15 cap correction**. Flag any CHANGES.
