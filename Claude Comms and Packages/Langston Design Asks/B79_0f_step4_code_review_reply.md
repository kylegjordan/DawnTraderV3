# B79.0f Step 4 review

## Verdict
approved

## Findings
- F1 (minor, non-blocking): standing-rule at `shared/asset-classes.ts:251` references `MULTI_ASSET_VTS_EXPANSION_PLAN.md §10c.X` with `X` as a literal placeholder. Resolve to real `§10c.<n>` during Step 10 governance — not a code defect, just don't ship the placeholder long-term.
- F2 (minor, non-blocking): WARN fires unconditionally on every collision call. Acceptable: resolver is INSERT-site (docstring `:320`) and B79.0g removes the UI re-resolve hot path. If logs spike between B79.0f and B79.0g deploys, consider once-per-process dedup then — do not gate B79.0f on it.
- F3 (informational): backfill header says "NOT idempotent" but re-running post-deploy would update 0 rows. Wording fine; safe to re-run if needed.

## Specific checks
- Collision set 17 entries (9 USD + 8 EUR pre-emptive): yes. `shared/asset-classes.ts:254-277`. EUR is 8 (no BDX/EUR — Kraken doesn't list it per provenance snapshot). Test `:329` asserts size=17.
- Resolver order (display-x → collision crypto-WARN → non-collision membership → crypto patterns): yes. `:355-392` walks `kraken-equities` short-circuit → `XSTOCK_SPOT_DISPLAY` x-suffix → `XSTOCK_SPOT_KRAKEN_COLLISIONS` (crypto+WARN) → `XSTOCK_SPOT_SYMBOLS` → crypto canonical/raw1/raw2.
- WARN log on collision path: yes. `:373-377`, prefix `[B79.0f][COLLISION_RESOLVE]`, drift-watch hint points back to provenance.
- Provenance comment present: yes. `:231-253` cites Kraken `/0/public/AssetPairs` 2026-05-10, names canonicalization-collapse (`SUIxUSD` vs `SUIUSD` both → `SUI/USD`), embeds quarterly re-audit standing rule.
- Backfill scope correct (only signal_eval_archive, 4862 rows): yes. Audit confirmed 0 mis-tagged in `trading_signals`, `regime_factor_alternates`, `exit_strategy_alternates`, `paper_sim_trades`. Backfill `scripts/b79-0f-collision-backfill.sql:234-237` touches only `signal_eval_archive` for DASH/MET/OPEN/SUI — 337+1598+44+2883=4862 reconciles. Verification SELECT included.
- B79.0d F1/F2/F3 doc-fix re-apply acceptable (or split): acceptable to bundle. F1/F2/F3 are pure JSDoc/inline-comment edits to `server/strategies/orb.ts` (no behavior change); `b79-0d-orb-thresholds-seed.sql` force-add fixes a gitignore miss (B79.0a/B79.TEC.b precedent). Splitting = governance churn for zero behavioral surface. Note in completion report that they landed under B79.0f sha and update CHANGES_AND_FIXES so BUG-2026-05-06-A attribution stays clean.

## Ship recommendation
ship as-is

F1/F2 are follow-up notes (Step 10 §10c.<n> backfill; B79.0g log-volume re-eval). Neither blocks push. Tests lock the regression; backfill verified zero-residual on staging.
