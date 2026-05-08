# BATCH 79.TEC — Per-asset-class TEC configuration architecture (COMPLETION REPORT)

**Status:** DRAFT — to be finalized after Step 6/7/8 deploy + verify.
**Phase:** 24 (Multi-Asset VTS Onboarding).
**Workflow:** 11-step canonical (full).
**Companion docs:** `BATCH_79_TEC_SCOPE.md` rev 2 + `BATCH_79_TEC_PRE_AUDIT.md` rev 1 + `BATCH_79_TEC_b_VERIFY_CHECKLIST.md`.

---

## §1 — Numbered objectives — outcomes (per scope §1)

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | Cache structure refactored: `cachedConfig` → `Map<AssetClass, TrailingExitConfig>` | YES | `trailing-exit-controller.ts` lines ~93-180 (new Map + TTL Map); grep `cachedConfig` returns 1 comment hit only |
| 2 | `resolveTECConfig` signature simplified: optional args removed, sync | YES | `trailing-exit-controller.ts` line ~190 (`resolveTECConfig(assetClass: AssetClass): TrailingExitConfig`); all call sites pass exactly one arg |
| 3 | `updatePosition` plumbs `assetClass` non-optional, no fallback | YES | `PositionUpdate.assetClass: AssetClass` (TS-enforced); runtime `[TEC_UPDATE_MISSING_ASSET_CLASS]` guard at top of `updatePosition`; 3 hardcoded `'crypto_spot'` literals fixed (paper-execution-engine:927, vts-runner:1962, tec-evaluator:273); vts-runner line 3604 also fixed |
| 4 | `primeTECConfig` wired into bootstrap BEFORE `loadTrailingStates` AND `server.listen` | YES | `server/index.ts` boot block (await primeTECConfig before listen) |
| 5 | HARD-FAIL on bootstrap failure | YES | server/index.ts try/catch → `[TEC_BOOTSTRAP_FAIL]` + `process.exit(1)`; aggregate error with per-class failures |
| 6 | `TEC_DEFAULTS.breakEvenEnabled = false` | YES | trailing-exit-controller.ts line ~99; documented as intentional fail-closed safe-state |
| 7 | Per-class DB rows seeded for crypto_spot + xstock_spot | YES (extended to ALL 4 active classes) | `drizzle/migrations/2026-05-08-b79-tec-per-class-be-rows.sql` seeds crypto_spot + crypto_perp + xstock_spot + xstock_perp |
| 8 | Cache-miss path THROWS `[TEC_CACHE_MISS_FATAL]` | YES | resolveTECConfig throws on miss (scope §1 #8) |
| 9 | Health endpoint reflects boot state | YES | `GET /api/diagnostics/tec-bootstrap` returns `{ready, perClassStatus, bootstrapStartedAt, bootstrapCompletedAt}` |
| 10 | Wildcard-removal Step 2 script committed (NOT executed) | YES | `scripts/b79-tec-remove-wildcard-be-row.sql` + `BATCH_79_TEC_b_VERIFY_CHECKLIST.md` |
| 11 | Verification gate instrumentation: `[TEC_RESOLVE_AGGR]` per-minute + `[TEC_FIRST_WILDCARD_HIT]` early-warn | YES | trailing-exit-controller.ts `bumpResolveCounter` + `startResolveAggregator` |
| 12 | No-touch fence on crypto_spot factor cadence holds | TBD | post-deploy SQL on `regime_factor_alternates` ±10% — to be verified at Step 7 |
| 13 | 4 zombie BE-latched trades behave correctly under new architecture | TBD | post-deploy verification at Step 7 |
| 14 | Zero new BE-latch on POST-deploy crypto_spot trades | TBD | 24h post-deploy archive query |
| 15 | `ASSET_CLASSES` SSOT iteration | YES | `primeTECConfig` iterates `getActiveAssetClasses()` from `shared/asset-classes.ts` — adding a new active class (xstock_perp.active=true e.g.) is automatically picked up at next deploy |
| 16 | TS Check CI gate GREEN on push | TBD | Step 5 CI run |

---

## §2 — Files changed

### Modified (8)

| File | Change |
|---|---|
| `server/services/trailing-exit-controller.ts` | Per-class cache Map + sync resolveTECConfig + retry/backoff primeTECConfig + TEC_DEFAULTS flip + assetClass non-optional + instrumentation logs |
| `server/services/module-constants-service.ts` | New `hasExplicitAssetClassRow` helper |
| `server/services/tec-evaluator.ts` | TECExitContext.assetClass non-optional; sync moonbag gates; assetClass plumbed into PositionUpdate |
| `server/services/paper-execution-engine.ts` | Hardcoded literal at 927 → `position.assetClass` |
| `server/services/vts-runner.ts` | OpenVirtualTrade.assetClass field; resolveAssetClass at trade open; hardcoded literals at 1962 + 3604 fixed |
| `server/index.ts` | primeTECConfig wire-in BEFORE server.listen with HARD-FAIL handler |
| `server/routes.ts` | New `/api/diagnostics/tec-bootstrap` endpoint |
| `server/tests/unit/b65-tec-parity.test.ts` | beforeEach prime; per-class BE rows seeded; getResolvedTECConfig signature update |

### Added (4)

| File | Purpose |
|---|---|
| `drizzle/migrations/2026-05-08-b79-tec-per-class-be-rows.sql` | Migration 1: 4 per-class BE rows |
| `drizzle/migrations/2026-05-08-b79-tec-per-class-be-rows-rollback.sql` | Rollback |
| `scripts/b79-tec-remove-wildcard-be-row.sql` | B79.TEC.b script (DO NOT EXECUTE in this batch) |
| `server/tests/unit/b79-tec-per-class-cache.test.ts` | 7 unit tests covering the architectural fixes |

### Documentation

| File | Change |
|---|---|
| `Claude Comms and Packages/Scope Files/BATCH_79_TEC_b_VERIFY_CHECKLIST.md` | NEW — 48h gate verify checklist |
| `Claude Comms and Packages/Langston Design Asks/B79_TEC_step3_code_review.md` | NEW — Step 4 review ask to Langston |

---

## §3 — Governance updates (Step 10)

- [ ] `1-system-manual/BATCH_CATALOG.md` — add B79.TEC entry
- [ ] `1-system-manual/PHASE_HISTORY.md` — Phase 24 sub-batch closed
- [ ] `1-system-manual/SYSTEM_IMPACT_MAP.md` — TEC-related entries updated for per-class cache + new endpoint
- [ ] `1-system-manual/SYSTEM_MANUAL.md` — TEC architecture section updated
- [ ] `1-system-manual/RUNNING_ISSUES.md` — close #79 + #82 + #83 references
- [ ] `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — §9 + §12 Phase 24 update
- [ ] `1-system-manual/CHANGES_AND_FIXES.md` — entry for the BE-latch silent-fallback root-cause fix
- [ ] `.claude/memory/MEMORY.md` — close B79.TEC entry, update next pickup
- [ ] `/home/langston/MEMORY.md` — Hetzner sync per CLAUDE.md §2 Step 10.b

---

## §4 — Step 7+8 verification — RESULTS

| Criterion | Status | Evidence |
|---|---|---|
| HTTP 200 staging | ✅ PASS | curl to /api/diagnostics/tec-bootstrap returned 200 with body |
| Bootstrap diagnostic | ✅ PASS | `{ready: true, perClassStatus: {crypto_spot, crypto_perp, xstock_spot, xstock_perp all ready:true, refreshFailCount:0, error:null}, bootstrapStartedAt → bootstrapCompletedAt: 31ms}` |
| No `[TEC_BOOTSTRAP_FAIL]` on clean boot | ✅ PASS | pm2 logs --err clean before hostile sim |
| Migration 1 applied | ✅ PASS | psql shows 5 rows: 4 explicit per-class + 1 wildcard (preserved per scope §1c) |
| No-touch fence SQL | ✅ PASS (window filling) | regime_factor_alternates: 3 emissions/factor in last hour at +3min post-restart; consistent with fresh restart, will normalize as window fills |
| Hostile sim — DELETE crypto_spot row | ✅ PASS | PM2 restart loop fired (185→186→187 in 20s); pm2 logs --err showed `[TEC_BOOTSTRAP_FAIL] primeTECConfig failed for 1/4 active asset classes. Failures: crypto_spot: module_constants is missing an explicit per-class row...` with explicit Migration 1 reference; `[TEC_BOOTSTRAP_FAIL] App must not start with a partial TEC config cache. Exiting.` |
| Hostile sim — RESTORE row | ✅ PASS | psql INSERT (updated_by='B79.TEC.hostile_sim_restore') + PM2 restart → ready:true at PM2 #190; staleness=9.7s indicates fresh warmup |
| CI 4 checks | 3 of 4 GREEN | Build ✅ Docker ✅ Test Suite (B79.TEC tests 7/7 + b65-tec-parity 20/20 + trailing-exit all pass; 59 pre-existing legacy failures unchanged at 1059 → 1066 total = +7 new tests passing). TS Check ❌ (pre-existing legacy baseline #39, no new server/* errors). Per Kyle directive "Deploy after Test+Build+Docker pass — don't wait on legacy TS baseline." |
| Langston second-pass | PENDING | watchdog v2 in flight |

**PM2 deploy chain:** #185 (clean boot post-deploy) → #186-188 (hostile-sim crash loop) → #190 (clean boot post-restore). Stable on staging.

---

## §5 — Plain-language summary (Kyle)

**What broke before B79.TEC:** when xstock_spot wired live in B79, the trailing-exit-controller (TEC) was still hardcoding `assetClass: 'crypto_spot'` for every config lookup, AND `primeTECConfig()` (the cold-start cache warmup function) was never actually called by the app at boot. So the BE-latch (break-even-protect stop) fired for new VTS trades despite the global `break_even_enabled = false` DB setting — the cache was sitting at default `true` until first async caller refreshed it, and crypto_spot's per-class settings would have been ignored anyway.

**What B79.TEC fixes:** the entire TEC config lookup is now per-asset-class. Each active class (crypto_spot, crypto_perp, xstock_spot, xstock_perp) has its own immutable `TrailingExitConfig` snapshot in a `Map<AssetClass, TrailingExitConfig>`. `primeTECConfig` runs at boot BEFORE `server.listen()` and BEFORE `loadTrailingStates()` — if any active class's per-class kill-switch row is missing, the app refuses to start with `[TEC_BOOTSTRAP_FAIL]`. No degraded boot, no env-flag override. Same in production AND development. CLAUDE.md §5 #15 NO PATCHES doctrine — this is the long-term structural fix.

**Three load-bearing call sites fixed:**
- `paper-execution-engine.ts:927` (TEC eval) — was hardcoded `'crypto_spot'`, now reads `position.assetClass`
- `paper-execution-engine.ts:2085` (paper trade INSERT) — was hardcoded `'crypto_spot'`, now reads `resolveAssetClass(symbol, 'kraken')` (caught by Langston Finding 2 — would've made the new dispatch a silent no-op for any non-crypto symbol entering paper)
- `vts-runner.ts:1962` (TEC eval) + `:3604` (UI return) — were hardcoded, now read `trade.assetClass`

**Four extra protections shipped this batch (all from Langston Q1+Q3 review):**
1. **Refresh coalescing** — only one in-flight TTL refresh per class at a time, via `tecConfigRefreshInFlight: Map<AssetClass, Promise>`. Without this, DB slowness would stack N concurrent refreshes per class.
2. **Max-staleness ceiling** — if last successful refresh is >5min ago, `resolveTECConfig` throws `[TEC_STALE_FAIL_CLOSED]` instead of silently returning stale snapshot. Break-even is a kill-switch — silently honoring stale "enabled=true" while operator is trying to flip to "false" is exactly the failure we don't want.
3. **Refresh-fail counter exposed** — per-class `refreshFailCount` and `stalenessMs` surfaced via `/api/diagnostics/tec-bootstrap`. Console-only logging would have meant finding out from a P&L surprise.
4. **`loadTrailingStates` moved BEFORE `server.listen`** — was inside listen callback, race window where a paper-fill could land before its TEC state was rehydrated → engine would treat as new position (lose latched flags) or skip it.

**Comms-infra fix shipped jointly (RUNNING_ISSUES #84):** Langston watchdog v1 used `--output-format text` which doesn't flush stdout during tool-use cycles — a 30-200s tool-heavy review looked identical to a 240s API hang. v2 uses `--output-format stream-json --verbose --include-partial-messages` to a sidecar NDJSON file; watchdog tails sidecar size for liveness; on clean exit `jq -r 'select(.type=="result") | .result'` extracts assistant text. Original B79.TEC review prompt that hung 4× under v1 succeeded under v2 (47min review, 477KB sidecar streamed). Diagnosed with Langston via §6.7 peer-to-peer.

**Hostile-sim PASSED:** deleted crypto_spot's break_even_enabled row → PM2 entered crash loop (185→186→187 within 20s) with `[TEC_BOOTSTRAP_FAIL]` log identifying the missing row + naming Migration 1 as the fix; restored row → clean boot at PM2 #190.

**One follow-up tracked (RUNNING_ISSUES #85):** Langston Q2 — extend the per-class HARD-FAIL assertion to ALL behavioral TEC keys (target_lock_r, trail_distance_atr_multiplier, moonbag knobs) once B79.4 ablation evidence shows any specific knob differs across asset classes. Currently only `break_even_enabled` is per-class-required; others fall back to wildcard. Per CLAUDE.md §8 #11 wildcards are "starting placeholders only." B79.x scope.

**Next sub-batches in Phase 24:** B79.TEC.b (wildcard row removal, 48h verify gate per `BATCH_79_TEC_b_VERIFY_CHECKLIST.md`) → B79.0a (live xstock scanner via centralClock) → B79.4 (B73 exit-strategy ablation extended to xstock_spot) → B79.1/.2/.3/.5/.6/.x (observation-triggered).

---

*End BATCH_79_TEC_COMPLETION_REPORT.md (DRAFT — Step 6/7/8 outcomes pending).*
