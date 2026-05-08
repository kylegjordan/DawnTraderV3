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

## §4 — Step 7+8 verification (TBD)

To be filled in after deploy:
- [ ] HTTP 200 staging
- [ ] `[TEC_PRIME]` log lines for all 4 active classes BEFORE `[loadTrailingStates]`
- [ ] No `[TEC_BOOTSTRAP_FAIL]` lines
- [ ] `/api/diagnostics/tec-bootstrap` `{ready: true, perClassStatus.<all>: {ready: true}}`
- [ ] No-touch fence SQL: `regime_factor_alternates` cadence on crypto_spot ±10%
- [ ] psql: per-class BE rows present + value=false; wildcard row STILL present
- [ ] `[TEC_RESOLVE_AGGR]` non-zero events for crypto_spot; zero `wildcard:N` for any class
- [ ] 4 zombie BE-latched trades preserved + tracking
- [ ] Hostile-sim: delete crypto_spot row → PM2 restart → app fails to boot with explicit error → restore → boots cleanly
- [ ] Langston second-pass APPROVE

---

## §5 — Plain-language summary (Kyle)

To be filled in after Step 7+8 close.

---

*End BATCH_79_TEC_COMPLETION_REPORT.md (DRAFT — Step 6/7/8 outcomes pending).*
