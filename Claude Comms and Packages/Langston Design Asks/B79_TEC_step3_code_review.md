# B79.TEC Step 3 — Code Review (Langston)

**Status:** CC implementation complete. Pre-push code-level review per CLAUDE.md §2 Step 4.
**Diff:** `Claude Comms and Packages/Change Lists/B79_TEC_step3_diff.txt` (8 files, +582/-110)
**New files:** 4 (Migration 1 + rollback + B79.TEC.b wildcard-removal script + b79-tec-per-class-cache.test.ts)

## What this batch does

Replaces single shared `cachedConfig` with `Map<AssetClass, TrailingExitConfig>`, makes `resolveTECConfig` synchronous, wires `primeTECConfig` into boot before `server.listen`, flips `TEC_DEFAULTS.breakEvenEnabled` to false, fixes 3 hardcoded `assetClass: 'crypto_spot'` literal sites, adds `/api/diagnostics/tec-bootstrap` endpoint, seeds per-class break_even_enabled rows for all 4 active asset classes via Migration 1, and stages the wildcard-removal script for B79.TEC.b (48h gate).

## Files modified

| File | Change |
|---|---|
| `server/services/trailing-exit-controller.ts` | Cache → Map; `resolveTECConfig` sync + `[TEC_CACHE_MISS_FATAL]` throw on miss; `primeTECConfig` iterates `getActiveAssetClasses()`, retry-with-backoff (2/4/8s) for transient errors only, aggregate-error report; `[TEC_RESOLVE_AGGR]` per-minute aggregator + `[TEC_FIRST_WILDCARD_HIT]` early-warn; `TEC_DEFAULTS.breakEvenEnabled = false`; `PositionUpdate.assetClass: AssetClass` non-optional; runtime `[TEC_UPDATE_MISSING_ASSET_CLASS]` guard at top of `updatePosition`; all `cachedConfig.*` reads replaced with per-class `cfg`; `getTECBootstrapStatus()` exported. |
| `server/services/module-constants-service.ts` | New `hasExplicitAssetClassRow(module, assetClass, constantName)` helper. |
| `server/services/tec-evaluator.ts` | `TECExitContext.assetClass: AssetClass` non-optional; sync `isMoonbagQualifier` / `canEnterMoonbag` calls (cache pre-warmed); pass `input.context.assetClass` to `tecUpdatePosition`. |
| `server/services/paper-execution-engine.ts` | Line 927 hardcoded literal → `position.assetClass` with `[TEC_PE_MISSING_ASSET_CLASS]` runtime guard. |
| `server/services/vts-runner.ts` | Static-import `resolveAssetClass` + `AssetClass`; `OpenVirtualTrade.assetClass: AssetClass` field added; trade record sets `assetClass = resolveAssetClass(symbol, 'kraken')` at open; line 1962 hardcoded literal → `trade.assetClass` with `[TEC_VTS_MISSING_ASSET_CLASS]` skip-and-log; line 3604 hardcoded literal → `trade.assetClass`. |
| `server/index.ts` | `await primeTECConfig()` BEFORE `server.listen()` with try/catch → `[TEC_BOOTSTRAP_FAIL]` + `process.exit(1)`. |
| `server/routes.ts` | New `GET /api/diagnostics/tec-bootstrap` (no auth, mirrors central-clock pattern) returning `getTECBootstrapStatus()`. |
| `server/tests/unit/b65-tec-parity.test.ts` | Per-class BE rows seeded for all 4 active classes; `_testClearEngineConfigCache + primeTECConfig` in beforeEach; `getResolvedTECConfig` call updated for new sync signature. |

## New files

- `drizzle/migrations/2026-05-08-b79-tec-per-class-be-rows.sql` — 4 rows seeded with `break_even_enabled=false` (crypto_spot, crypto_perp, xstock_spot, xstock_perp), `ON CONFLICT DO NOTHING`, post-INSERT assertion that all 4 false rows exist; loud failure if pre-existing intentional override differs.
- `drizzle/migrations/2026-05-08-b79-tec-per-class-be-rows-rollback.sql` — signature-guarded DELETE.
- `scripts/b79-tec-remove-wildcard-be-row.sql` — B79.TEC.b script; placeholder `<STEP1_DEPLOY_TIMESTAMP>` to be replaced at execution time after 48h gate.
- `server/tests/unit/b79-tec-per-class-cache.test.ts` — 7 unit tests covering: prime success, sync resolve, per-class divergent values, hostile-sim missing-row hard-fail, `[TEC_CACHE_MISS_FATAL]` for unprimed class, `[TEC_UPDATE_MISSING_ASSET_CLASS]` runtime guard, fail-closed default.

## Specific review questions

1. **Cache-miss semantics** — `resolveTECConfig` throws `[TEC_CACHE_MISS_FATAL]` on miss. Per scope rev 2 #8. Reasonable per Q1-Q5 lock. Confirm no implicit code path where this fires unexpectedly (e.g. an ACTIVE class that primeTECConfig skips).
2. **Two reads of `cfg` correctness** — `updatePosition` uses single `cfg = resolveTECConfig(assetClass)` snapshot for the entire cycle (immutable per scope §-1). Background TTL refresh swaps the cache entry, NOT the local `cfg` reference. Concurrent cycles read different snapshots iff scheduler interleaves them across a refresh; per-cycle consistency holds.
3. **Static import of resolveAssetClass in vts-runner** — added at top; was previously `await import()` at 4 call sites (those remain dynamic). Mixed style retained because the existing dynamic-import sites are inside async-only contexts and the change to static would force restructuring; OK to leave for B79.0a cleanup or fold here?
4. **Migration 1 ON CONFLICT DO NOTHING + assertion** — covers Risk 9 (lossy overwrite); assertion fires loud. The scope rev 2 explicitly required this pattern.
5. **`paper-execution-engine.ts:2085`** — second `assetClass: 'crypto_spot'` literal at the trade-INSERT site (NOT TEC eval). Out of B79.TEC scope per scope §0 ("`break_even_enabled` is the one we KNOW we need to flip per-class"). Confirm this stays out of scope; flag if you want it folded.
6. **VTS skip-and-log on missing assetClass at line 1962** — uses `continue` (skip this trade's TEC eval, retry next cycle). Alternative was throw. Skip prevents one bad row from killing all downstream evals; the runtime guard inside `updatePosition` still hard-fails if the path is somehow reached.
7. **Hostile-sim test in b79-tec-per-class-cache.test.ts** — third `it` block validates the missing-row HARD-FAIL pathway in unit form. The Step 7 hostile sim (PM2 staging delete-row test) is the integration version per scope §3.
8. **CI TS Check gate (Objective 16)** — non-optional typing rippled through all PositionUpdate/TECExitContext call sites. Risk: a downstream call site I missed. Did you spot any?

## Process

- Diff is at `Claude Comms and Packages/Change Lists/B79_TEC_step3_diff.txt` (read it via your GDrive mount). Server-side files only — drizzle migrations + new test + wildcard-removal script not in the diff (they're new files; you can read them directly at the paths above).
- Reply via watchdog stdout. CC will relay verbatim to Telegram per CLAUDE.md §6.5 Step 3.
- APPROVE / APPROVE WITH REVISIONS / BLOCK + reasoning on each Q1-Q8 + any other findings.

CC will iterate per §6.7 (peer-to-peer to consensus, escalate to Kyle on deadlock only).
