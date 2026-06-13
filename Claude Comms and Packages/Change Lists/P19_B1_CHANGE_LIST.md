# P19-B1 CHANGE LIST — Test-Suite Cleanup (Step 4 review package)

**Commits:** `cc5f6d627` (Buckets B + C-fix + A-artifact) · `a27432f38` (pre-audit) · `5a4926062` (Buckets D + E + A-completion) — all on `migration/aws-supabase`, both-direction sync 0/0.
**FINAL VERIFICATION (bench, parity DB, strict mode live):** `1880 passed (1880) | 161/161 files | 0 failed | 0 skipped` + tsc baseline OK ("no regressions above baseline"). Headline trajectory: 12 failed / 141 skipped (this morning) → **0 / 0**.
**INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git on the gdrive mount. Use `ssh staging` for repo inspection.**

---

## Bucket A — bench/CI environment parity ✅

**NEW `docker-compose.test-db.yml`** (repo root): pgvector/pg17 mirror of ci.yml:65-83, test/test/test conforming to the vitest.config.ts:10 URL (bench conforms to config, never vice versa — your Step-1 note), runbook in header incl. `COINGECKO_API_TIER=demo` on the vitest line (mirrors ci.yml:115 — `external-macro-feed.ts:248` hard-fails at import without it; the last collapsing file, `market_indicators_narrative`, was THIS, not DB).

**MODIFIED `scripts/db-migrate.ts:43-47`** — genuine Windows bug found activating the bench (script had never run on Windows):
```ts
// BEFORE
const MIGRATIONS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
// AFTER (+ import { fileURLToPath } from 'node:url')
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
```
`URL.pathname` yields `/C:/...` on Windows → `path.resolve` doubles to `C:\C:\...`. `fileURLToPath` is behavior-identical on the Linux CI/staging runners. Evidence: all 97 migrations applied cleanly to the bench container post-fix.

**Kyle decisions in this bucket:** Docker Desktop install approved + executed (winget; WSL2 enabled via elevated `wsl --install --no-distribution`; one reboot).

## Bucket B — regime-scan test fix (2 bugs, test-only) ✅

**MODIFIED `server/tests/unit/regime_mapping_integrity.test.ts`:**
```ts
// BEFORE
const pattern = new RegExp(`['"]${regime}['"]`, 'g');
for (const file of files) {
  if (EXCLUDED_PATHS.some(p => file.includes(p))) continue;
// AFTER
const pattern = new RegExp(`['"]${regime}['"]`);            // (2)
for (const file of files) {
  const normalizedPath = file.split(path.sep).join('/');     // (1)
  if (EXCLUDED_PATHS.some(p => normalizedPath.includes(p))) continue;
```
(1) The Windows-path artifact from the scope. (2) **Second, platform-independent bug found during the fix:** the `g` flag makes `.test()` stateful via `lastIndex` — after any match, subsequent lines' scans can start mid-string and silently MISS violations. Removed (single-line membership test needs no global flag). **Guard-the-guard verified:** planted `const bad = "IMPULSE_EXPANSION";` in a scratch file → caught + named; removed → re-green. 7/7 both environments.

## Bucket C-fix — pattern-filter unit-test hermeticity ✅ (your condition 1 resolved)

**Mechanism pinned before implementation:** `_seedModuleCacheForTests` (`module-constants-service.ts:266-271`) writes the SAME `cache` Map that `loadModule` (:77-80) checks before any DB call, and `getConstant` (:142) reads through `loadModule` → the seeder DOES intercept the `pattern-filter.ts:247` call AND exercises the real `scoreRowForKey` resolution. The sibling vi.mock at `b79-0m-b2-pattern-strategy-constants-fallback.test.ts:63` would NOT have worked — its factory only provides `getCachedNumbersForModule`; `getConstant` would be undefined. Your "prefer the seeder if it works" → it works and it's the only correct one of the two.

**MODIFIED `server/tests/unit/b79-0m-b2-pattern-filter.test.ts`:** beforeAll seeds module `xstock_spot` row `min_ohlc_history_bars=24` (mirrors the production seed migration; `cost_cache.test.ts:22-33` precedent), afterAll clears. 9/9 green.

## Bucket D — TEC.b strict restore (#141) ✅ (your condition 3 resolved + ordering honored)

**Pre-conditions established first:** staging `PICK_FALLBACK` grep = 0 (out.log + error.log, full active day) → test-surface-only, no live seeding. Consumer sweep for `getTECPickFallbackStats` / `_tecPickFallbackCount` / `TEC_PICK_FALLBACK` across server/ + client/ + scripts/: **every reference lives inside trailing-exit-controller.ts itself — zero external consumers** (the 48h gate read the counter via logs, not a wired endpoint). Safe-delete proven, per Kyle's certainty-before-deletion directive.

**MODIFIED `server/services/trailing-exit-controller.ts`:**
- DELETED `:362-367` scaffolding (`_tecPickFallbackCount`, `TEC_PICK_FALLBACK_LOG_EVERY`, `getTECPickFallbackStats`).
- `pick<T>(key, fallback)` → `requireKey<T>(key)`:
```ts
// AFTER (core)
const requireKey = <T>(key: string): T => {
  if (rows[key] === undefined) {
    throw new Error(
      `[B79.0n.TEC.b][TEC_MISSING_KEY] module_constants has no row for ` +
      `(module=trailing_exit, asset_class=${assetClass} or wildcard, ` +
      `constant=${key}). Strict resolution (no TEC_DEFAULTS fallback) — ` +
      `seed the row via the B79.0n.TEC per-class migration or psql before boot.`,
    );
  }
  return rows[key] as T;
};
```
- All 11 snapshot fields → `requireKey(...)`; `hasExplicitAssetClassRow` BE-row hard-fail PRESERVED (stricter than requireKey — wildcard doesn't satisfy it); `TEC_DEFAULTS` const KEPT (type-template-only per its own :100 comment — deliberately out of surgical scope); `ALL_TEC_KEYS` exported (was dead code; now the new test's SSOT — see below).

**A-before-D ordering honored — blast radius MEASURED, not estimated:** flip applied to the green parity bench BEFORE mock repair → **50 failed | 1825 passed — exactly the park record's +50.** Repair set: 8 fixture sites across 6 files (the 6 confirmed in pre-audit; the per-class-cache file had 3 sites — one initially missed on indentation, caught by re-run, which is why the bench-measure-then-repair loop exists). Each gets `{ ..., constantName: 'rung_floor_slippage_buffer_multiplier', value: 1.0 }` + a one-line P19-B1 comment. The 2 partial-key files (`b65-migration-validation`, `b65-module-constants-resolution`) — your Step-2 ask — were NOT in the measured blast radius and pass under strict mode (they test the resolver itself, never trigger `refreshTECConfigForClass`); resolved as no-action-needed with run evidence.

**REWRITTEN (not repaired): `b79-tec-per-class-cache.test.ts` "TEC_DEFAULTS.breakEvenEnabled is false (fail-closed)"** — its documented intent was to assert the DEFAULTS-backfill behavior ("Intentionally NO other config keys — TEC_DEFAULTS will be used for those"), i.e., the exact mechanism TEC.b removes. Rewritten to lock the NEW contract at the same site: BE-rows-only rowset must REJECT at boot with TEC_MISSING_KEY.

**NEW `server/tests/unit/b79-0n-tec-b-strict-hardfail.test.ts`** (5 tests, b-new-40 mock pattern): (a) full 11-key boots clean; (b) missing rung-floor key rejects naming it; (c) per-key strictness (moonbag_cap_mode); (d) scaffolding export gone; (e) fixture↔ALL_TEC_KEYS parity = 12th-key tripwire (a future key addition fails THIS test until every fixture updates — the exact stale-mock failure mode this batch repaired).

**Blast-radius note from pre-audit stands:** `cost-model.ts` is a third consumer of the rung-floor key (reads it independently — unaffected by this diff; flagged for your checklist).

## Bucket E — skipped-test audit ✅ (141 → 0)

Enumeration: **134 of the 141 were collection-time skips inside the DB-collapsed files — resolved by Bucket A** (they now RUN and PASS). 12 explicit static skips = 7 parked-stale + 5 `describe.skipIf(!dbAvailable)` in b72 (legitimately conditional; they RUN with the DB present — on both CI and the parity bench, so zero skips in the final count; they skip only on a bench without the container, which the runbook now prevents).

**7 parked-stale DELETED with replacement coverage verified FIRST** (certainty-before-deletion): `b79-0n-universe-service.test.ts` Layer 2 (initializeFromDB population, sector handling, delisted-skip, UNCATEGORIZED coercion) + Layer 4 bootstrap (≥5 distinct sectors) + the daily UNIVERSE-DISCOVERY cron health check (live sector distribution). Deletion sites carry tombstone comments naming the verified destinations. Files: `b-phase-a2-xstock-eval-cycle-dbs.test.ts` (1), `b79-0n-hygiene-registry-trim.test.ts` (1 + the fully-skipped 5-test sector-coverage describe incl. its dead sectorCounts computation).

## Your condition 2 (governance follow-up) — queued for Step 10
Unit/integration tier separation (unit tier runs with no DB reachable so the next unmocked read fails fast in CI too) → RUNNING_ISSUES entry at Step 10, named follow-up, NOT in this batch.

## Step-4 asks
1. Verdict on the requireKey diff + scaffolding deletion (evidence above).
2. The defaults-test REWRITE call (§Bucket D) — lock-new-contract vs delete; I chose rewrite to keep an assertion at the site.
3. The Bucket-E deletions — replacement-coverage evidence sufficient?
4. Anything blocking push-forward to deploy (production files in this batch: trailing-exit-controller.ts + db-migrate.ts; staging TEC boot under strict mode is the Step-7 headline check).
