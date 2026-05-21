# B79.0n.STORAGE — Step 1 scope (sub-batch 3 of 18 in B79.0n umbrella arc)

> **Parent umbrella:** `B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` rev 3.
> **Position:** sub-batch 3 of 18 (post-UNIVERSE-DISCOVERY-insert). Foundational. Every Tier 1 sub-batch after this one (MCE / STRATEGY / PATTERN-DETECT / CONFIDENCE-CHAIN / SCORING / TEC / TELEMETRY / RTB / RTB-REFRESH / POOL / ORCHESTRATOR / EXECUTION / WIRE-IN) inherits the REQUIRED-assetClass discipline this batch establishes.
> **Depends on:** UNIVERSE-DISCOVERY (just closed; storage audit reads against the dynamic registry shape).
> **Phase:** Phase 24 multi-asset onboarding. CLAUDE.md §3.3 learning-capture rule applies.
> **Active trading status:** stays OFF (architecture-only; live enablement is the Phase 19 gate).

---

## §1 — Objective

**Convert the storage API surface from "optional `assetClass?:` with silent default to `'crypto_spot'`" to "REQUIRED `assetClass:` with TypeScript compile-error if omitted."** Eliminate the systemic silent-crypto-fallback pattern at its root in `server/storage.ts` so every downstream sub-batch in this umbrella (MCE, STRATEGY, SCORING, etc.) inherits the discipline rather than re-introducing it. Also fix the one production-active instance of the bug — the SQE config lookup at `server/core/filters/signal_quality_evaluator.ts:143` that returns crypto thresholds for xStock cycles regardless of which asset class is evaluating.

**Why this matters architecturally.** The umbrella v3 §1 row for STORAGE called this out: "Codebase-wide silent-crypto-fallback audit + SQE bug fix + storage API REQUIRED-assetClass refactor (Langston rev2 §11.4). Root-cause fixes the systemic pattern before downstream batches inherit it." Today, `storage.getScreenerFilters({ mode })` is called from 25+ sites; ~21 of them omit `assetClass` and silently get crypto thresholds. Some of those sites are diagnostic endpoints (acceptable — they read the canonical crypto baseline for display); others are runtime decision paths feeding xStock cycles with crypto data (production bug). The audit must enumerate every call site, classify intent (crypto-intentional / xStock-intentional / asset-class-aware-needs-routing), then make `assetClass` REQUIRED so the next person who adds a caller can't silently fall through.

**Identity invariant unchanged from UNIVERSE-DISCOVERY:** the storage API stores configuration per `(mode, asset_class, filter_path)`. Identity of WHICH config is loaded is now explicit at every call site instead of implicit-via-default.

---

## §2 — Pre-audit checklist (Step 2 — runs before any code edits)

### §2.1 — Standard 11-step disciplines (CLAUDE.md §2 + umbrella §2.1)

- [ ] Read `1-system-manual/SYSTEM_IMPACT_MAP.md` entries for every component touched: `server/storage.ts` (the API surface itself), `server/core/filters/signal_quality_evaluator.ts` (the SQE bug call site), `server/index.ts` (boot-time filter loads at 993 + 1074), `server/routes.ts` (8 call sites at 2199, 2361, 2536, 3389, 3510, 12499, 13858, 20817), `server/routes/vts.ts` (13 call sites at 1445-1457), `server/asset_classes/xstock_spot/{pattern-filter,imf-evaluator,global-filter,eval-cycle}.ts` (4 already-correct xStock-explicit sites that serve as proof-by-existence the API supports the discipline).
- [ ] Read `1-system-manual/SYSTEM_MANUAL.md` chapters on signal-quality evaluation + filter pipeline to verify SQE is the only consumer that mis-routes asset-class today.
- [ ] Document analysis in `B79_0n_STORAGE_PRE_AUDIT.md`.

### §2.2 — Step 4.5 — Writer-side asset-class threading audit (BATCH_82 standing rule)

This batch IS the writer-side audit for one specific API. Every call site of `storage.getScreenerFilters()` MUST be enumerated and each one categorized as:

- **(a) ASSET-CLASS-INTENTIONAL CRYPTO** — caller is reading crypto config explicitly (e.g., the `fx5-scanner.ts` crypto cycle reading crypto thresholds). Update to pass `assetClass: 'crypto_spot'` explicitly.
- **(b) ASSET-CLASS-INTENTIONAL XSTOCK** — caller is reading xStock config explicitly. Already passing `assetClass: 'xstock_spot'` (the 4 xstock_spot/* sites). Verify no regression.
- **(c) ASSET-CLASS-AWARE-NEEDS-ROUTING** — caller is in a code path that runs per-asset-class and should resolve `assetClass` from its calling context (e.g., SQE called from xStock cycle should resolve xStock; SQE called from crypto cycle should resolve crypto). Most-likely category for the ~21 silent-default sites.
- **(d) ASSET-CLASS-AGNOSTIC** — caller genuinely doesn't care (e.g., a diagnostic endpoint that wants to show crypto's canonical thresholds regardless of any asset-class context). Update to pass `assetClass: 'crypto_spot'` explicitly with an inline comment justifying the choice.

Pre-audit produces a full call-site table in `B79_0n_STORAGE_PRE_AUDIT.md` with each site categorized + the explicit `assetClass` value the implementation will pass.

### §2.3 — Step 4.6 — Block-scope rename / signature-change audit

The storage API signature change from `assetClass?: string` to `assetClass: AssetClass` (where `AssetClass` is the existing enum string-union) is a **breaking type-level change**. Every caller is forced to update by the TypeScript compiler. Pre-audit verifies:

- [ ] Every call site identified in §2.2 has a clear destination for the `assetClass` parameter.
- [ ] No call site is in a code path where `assetClass` is not knowable at compile time (i.e., no caller needs `assetClass` to be optional). If any such caller exists, flag at pre-audit + counter-propose a different solution (e.g., explicit `assetClass: 'all'` value with table-side wildcard handling).
- [ ] The `screenerFilters` table's unique index already includes `asset_class` (verified pre-B79.0m.a hotfix; double-check at pre-audit time via `\d screener_filters` on staging).

### §2.4 — Step 4.7 — Scan-cycle read-side data-completeness audit (B-NEW-14 lesson)

For each call site categorized as (c) ASSET-CLASS-AWARE-NEEDS-ROUTING:

- [ ] Trace what cycle/handler invokes this call site.
- [ ] Verify the calling context has `assetClass` available (either as a parameter, a closure-captured variable, or via a per-cycle context object).
- [ ] If `assetClass` is NOT available in the calling context, the calling context itself needs refactoring — flag at pre-audit + add to the change list.

This is the discipline that catches "we made assetClass REQUIRED but one call site is in code that doesn't even know what asset class it's running for."

### §2.5 — Phase 19 readiness pre-audit (carry-forward from UNIVERSE-DISCOVERY §2.10 lessons)

- [ ] **Step 2.5.a — REQUIRED `assetClass` does NOT bypass `screener_filters` per-class row coverage.** Verify at pre-audit time that EVERY `(mode, asset_class, filter_path)` combination the runtime requires has a row in `screener_filters`. The discipline being added at the type level only catches "caller didn't pass assetClass" — it does NOT catch "caller passed assetClass='xstock_spot' but no xStock row exists." Pre-audit runs `SELECT mode, asset_class, filter_path FROM screener_filters` and cross-references against the call-site categorization table.
- [ ] **Step 2.5.b — `screener_filters` rows for the 4 quant family-IMF paths × 2 modes = 8 rows** must exist for both `crypto_spot` AND `xstock_spot` before this batch's REQUIRED-assetClass change goes live. If missing, the batch ships a migration seed + the REQUIRED-assetClass change together. Pre-audit confirms current row counts.
- [ ] **Step 2.5.c — `screener_filters` rows for `active_quant` + `active_pattern` + `vts_quant` + `vts_pattern` × 2 modes = 8 rows** must exist for both `crypto_spot` AND `xstock_spot`. Verify at pre-audit time.

### §2.6 — Crypto-by-construction-NONE invariant (umbrella §2.3)

Pre-audit explicitly verifies: every code change in this batch is either (1) a signature-change-with-explicit-crypto-passed (crypto callers updated to pass `'crypto_spot'` explicitly; semantically identical to the current silent default), (2) an SQE bug fix that ROUTES xStock-mode SQE calls to read xStock thresholds (changes xStock behavior; does NOT change crypto behavior), or (3) a diagnostic-endpoint update that hardcodes `'crypto_spot'` with comment (semantically identical to current). Crypto cycles see ZERO runtime behavioral change. 24h crypto regression-lock confirms empirically.

### §2.7 — In-passing-bug check (umbrella §2.5)

During the call-site enumeration audit, surface any (c) obvious-bug findings. Common candidates:

- Callers passing string literals other than `'crypto_spot'` / `'xstock_spot'` (typos → silent fallthrough to crypto-default today).
- Callers reading `filters.finalScoreMin` / `regimeWeightMin` with `parseFloat` against `null`-returning DB columns (NaN propagation bugs).
- Callers reading the returned `ScreenerFilters` object and ignoring `null` (would currently crash if a row is missing; after this batch a missing row should fail-loud, not silent-default).

Document in pre-audit. Decide per item: absorb into this batch (small + contained) vs spawn separate task.

---

## §3 — Code changes

### §3.1 — Storage API signature change (the breaking change)

**File:** `server/storage.ts` lines 235 (interface) + 950 (implementation) + ~965 (the `upsertScreenerFilters` caller).

**Before:**
```ts
getScreenerFilters(params: {
  mode: 'live' | 'paper';
  filterPath?: string;
  assetClass?: string;
}): Promise<ScreenerFilters | null>;
```

**After:**
```ts
import type { AssetClass } from '../shared/asset-classes.js';

getScreenerFilters(params: {
  mode: 'live' | 'paper';
  assetClass: AssetClass;      // REQUIRED — no default
  filterPath?: string;
}): Promise<ScreenerFilters | null>;
```

**Implementation change at line 950-962:**
```ts
async getScreenerFilters(params: { mode: 'live' | 'paper'; assetClass: AssetClass; filterPath?: string }): Promise<ScreenerFilters | null> {
  const filterPath = params.filterPath || 'active_quant';
  // NO assetClass default — caller is required to pass it explicitly.
  const [result] = await db
    .select()
    .from(screenerFilters)
    .where(and(
      eq(screenerFilters.mode, params.mode),
      eq(screenerFilters.filterPath, filterPath),
      eq(screenerFilters.assetClass, params.assetClass)
    ));
  return result || null;
}
```

**Internal caller update at ~967:**
```ts
const existing = await this.getScreenerFilters({
  mode: data.mode,
  assetClass: data.assetClass as AssetClass,  // upsertScreenerFilters already has assetClass on its input
  filterPath
});
```

### §3.2 — SQE bug fix (the one production-active silent-fallback)

**File:** `server/core/filters/signal_quality_evaluator.ts` line 143 (the call site) + the surrounding function signature.

**Before (line 143 in the `loadSqeConfig(mode)` function):**
```ts
async function loadSqeConfig(mode: 'live' | 'paper'): Promise<SqeConfig> {
  // ...
  const filters = await storage.getScreenerFilters({ mode });  // silent crypto fallback
  // ...
}
```

**After (assetClass becomes a required parameter; every caller of loadSqeConfig threads it):**
```ts
async function loadSqeConfig(mode: 'live' | 'paper', assetClass: AssetClass): Promise<SqeConfig> {
  // ...
  const filters = await storage.getScreenerFilters({ mode, assetClass });
  // ...
}
```

**Module-constants lookup also routed per asset class** — verify `getSQEModuleDefaults()` at line 131 needs asset-class scoping (most likely yes per umbrella §1 SCORING row, but in-scope for this batch to plumb `assetClass` to it if so).

**Caller chain:** trace `evaluateSignalQuality` / `loadSqeConfig` callers; xStock callers were passing `assetClass: 'xstock_spot'` to the broader SQE call but the inner `loadSqeConfig` was dropping it. Plumb through.

### §3.3 — Caller-side updates (~25 call sites)

For each call site enumerated in pre-audit §2.2, update to pass explicit `assetClass`:

**Category (a) ASSET-CLASS-INTENTIONAL CRYPTO** (~13 sites in `server/routes/vts.ts:1445-1457`):
```ts
// BEFORE
storage.getScreenerFilters({ mode, filterPath: 'active_quant' }),
// AFTER
storage.getScreenerFilters({ mode, assetClass: 'crypto_spot', filterPath: 'active_quant' }),
```

**Category (c) ASSET-CLASS-AWARE-NEEDS-ROUTING** (sites in `server/routes.ts`, `server/index.ts`, SQE): caller resolves `assetClass` from its context and passes through.

**Category (d) ASSET-CLASS-AGNOSTIC DIAGNOSTICS** (some routes.ts UI-feeding endpoints): pass `assetClass: 'crypto_spot'` with inline comment justifying.

### §3.4 — `screener_filters` row coverage (if pre-audit §2.5 finds gaps)

If pre-audit reveals any `(mode, asset_class, filter_path)` combinations missing rows, ship a migration seed alongside the code change. Most likely already-covered post-B79.0m.b2 (xstock_spot family rows seeded then) and post-HYGIENE (no row changes that batch). Verify at pre-audit; do NOT assume.

### §3.5 — Other storage APIs with optional `assetClass?:` — enumerate + REQUIRED-ify in pre-audit (deferred to this batch if small, otherwise to next-touch)

Pre-audit greps for `assetClass\?:` across `server/storage.ts` to find OTHER methods with the same anti-pattern. As of 2026-05-21 the grep returns only `getScreenerFilters` — but the discipline must scan thoroughly. Any other findings get classified:

- Small surface (under 5 callers) → absorb into this batch.
- Large surface (5+ callers) → file as RUNNING_ISSUES + spawn next-touch batch.

---

## §4 — Unit tests

### §4.1 — Storage signature regression test (NEW)

`server/tests/unit/b79-0n-storage-required-assetclass.test.ts`:

- TypeScript compile-time check: `storage.getScreenerFilters({ mode: 'paper' })` (missing `assetClass`) MUST fail to compile. Use `@ts-expect-error` directive to lock the requirement.
- Runtime check: with valid `assetClass` passed, function returns the correct row from a seeded test DB.
- Runtime check: with `assetClass: 'crypto_spot'` AND `assetClass: 'xstock_spot'` on seeded rows, returns different `finalScoreMin` values (proves the parameter is load-bearing).

### §4.2 — SQE per-asset-class routing test (NEW)

`server/tests/unit/b79-0n-storage-sqe-asset-class-routing.test.ts`:

- Seed `screener_filters` with distinct `finalScoreMin` for `crypto_spot` (e.g., 0.4) vs `xstock_spot` (e.g., 0.55).
- Call `loadSqeConfig('paper', 'crypto_spot')` → assert returned `finalScoreMin` is 0.4.
- Call `loadSqeConfig('paper', 'xstock_spot')` → assert returned `finalScoreMin` is 0.55.
- Locks the SQE bug from regressing.

### §4.3 — Existing xStock filter tests stay GREEN

The 4 `xstock_spot/*` call sites already pass `assetClass: 'xstock_spot'`; their existing tests should pass unchanged. Verify in CI.

---

## §5 — Acceptance criteria (Step 7 gates)

| # | Gate | Threshold | Verification method |
|---|------|-----------|---------------------|
| 1 | Storage API signature change ships | TypeScript compile-time enforcement | `tsc --noEmit` passes; `@ts-expect-error`-locked regression test asserts the breaking shape |
| 2 | SQE for xStock returns xStock thresholds | empirical | psql seed crypto vs xStock `finalScoreMin` distinct; pm2 log shows xStock cycle reading xStock value |
| 3 | All ~25 caller sites updated | code review | git diff shows every call site explicitly passing `assetClass`; pre-audit table cross-referenced |
| 4 | `screener_filters` row coverage complete | psql | every `(mode, asset_class, filter_path)` required by runtime has a row |
| 5 | New unit tests GREEN | CI | b79-0n-storage-required-assetclass + b79-0n-storage-sqe-asset-class-routing pass |
| 6 | No new CI failures introduced | CI | baseline red-test set unchanged from B79.0n.UNIVERSE-DISCOVERY post-close |
| 7 | 24h crypto regression-lock | umbrella §2.2 thresholds | scheduled soak alert after deploy |
| 8 | xStock cycle uses xStock SQE thresholds in live PM2 logs | log grep | `[SQE][CONFIG]` lines tagged with asset class show xStock-scoped values during xStock cycle |

---

## §6 — Crypto-regression invariant (by-construction proof for this batch)

- **(a) Signature change** — every existing call site that omitted `assetClass` previously got silent `'crypto_spot'`; the migration to explicit `assetClass: 'crypto_spot'` is semantically identical (same value passed, same query, same result).
- **(b) SQE fix** — only affects xStock-mode SQE calls (which today silently get crypto thresholds). Crypto-mode SQE calls are unchanged (they were already getting crypto thresholds; the routing doesn't change for them).
- **(c) No code path that today reads crypto-intended config can be re-routed by this batch** — REQUIRED-assetClass forces explicit declaration; pre-audit categorization (a/b/c/d) ensures crypto-intentional sites stay crypto.

**Empirical confirmation:** 24h post-deploy crypto regression-lock vs 24h pre-deploy baseline (FX5 pool ±5%, signal-gen ±5%, VTS trade rate ±5%, active-trade ±1-2/day OR ±15% 7d per umbrella §2.2).

---

## §7 — Deferred follow-ups (out of scope this batch; tracked for later)

- **Other `storage.*` APIs with `assetClass?:` optional anti-pattern.** Pre-audit grep determines current count. As of scope draft 2026-05-21, only `getScreenerFilters` has the issue at `server/storage.ts`. If any other instances surface in pre-audit, classify small-surface (absorb) vs large-surface (separate batch).
- **Module-constants `getSQEModuleDefaults()` asset-class routing** (Langston Step 4 may pull this into scope if pre-audit shows it's load-bearing for SQE; otherwise → SCORING batch).
- **Per-asset-class strategy_settings audit** — strategy_settings table per-asset-class enforcement is STRATEGY batch scope.
- **Per-asset-class module_constants audit** — generalized asset-class enforcement on all `module_constants.*` queries is SCORING batch scope.

---

## §8 — Asset-class onboarding workflow learnings (placeholder)

Per CLAUDE.md §3.3 standing rule, this section is filled at completion-report time. Specific items to track during implementation:

- **Pattern: optional → required type-level enforcement of a scoping dimension.** Generalizable to any future asset-class-scoped API surface where the silent-default anti-pattern surfaces.
- **Pattern: enumerate-then-categorize call sites BEFORE signature change.** The pre-audit categorization (a/b/c/d) is what makes the breaking signature change tractable. Document this as a canonical pattern for future onboarding batches that need similar discipline.
- **Pattern: `@ts-expect-error`-locked regression tests.** Locks the breaking shape so a future refactor doesn't accidentally re-introduce the optional parameter.

---

## §9 — Open questions for Langston (Step 1 review)

(Q1) **Type-level enforcement of `AssetClass`** — current `AssetClass` type is a string-union of the 4-entry registry (`'crypto_spot' | 'crypto_perp' | 'xstock_spot' | 'xstock_perp'`). REQUIRED-assetClass enforces presence but not validity. Is that sufficient? Or should we also enforce that the runtime value is from the registry via `AssetClass`-narrowed branding? CC's view: string-union is enough — the registry IS the source of truth for valid values; runtime values come from already-typed sources.

(Q2) **Category (d) ASSET-CLASS-AGNOSTIC diagnostic endpoints** — for routes that display canonical crypto values for UI purposes (e.g., the screener-config UI page that shows the crypto baseline), CC plans to hardcode `assetClass: 'crypto_spot'` with inline comment. Acceptable, or do we want a dedicated `getCanonicalScreenerConfig()` helper that semantically distinguishes "I want canonical crypto" from "I want crypto for this cycle"?

(Q3) **Other storage APIs with `assetClass?:`** — pre-audit grep finds only `getScreenerFilters` today. Should the pre-audit also check the broader pattern (any `params: { ...; assetClass?: string }` shape across ALL `server/services/*` writer APIs, not just `server/storage.ts`)? CC's view: yes — write the pre-audit grep as `\bassetClass\?:` across the full `server/` tree and classify any new findings.

(Q4) **`screener_filters` row coverage migration** — if pre-audit reveals missing `(mode, asset_class, filter_path)` rows for `'xstock_spot'`, the batch ships a seed migration. Where do the seed values come from? CC plan: clone crypto baselines as initial xStock values + flag in completion report that "values are placeholder; xStock-specific calibration is Layer 3 follow-up work" (consistent with `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Layer 1/2/3 protocol).

(Q5) **Step 4 dispatch shape** — should Step 4 code review embed the full diff inline (per CLAUDE.md §6.5.0.a learned during B-NEW-42b)? CC's view: yes — STORAGE changes touch ~25 file:line tuples + the API signature; embedded diff with explicit "DO NOT cd /mnt/gdrive" instruction is the canonical pattern from B79.0n.UNIVERSE-DISCOVERY Step 4 dispatch.

(Q6) **24h crypto regression-lock interpretation** — STORAGE is a pure refactor on the crypto side (every silent default becomes explicit). The expected delta on the 4 metrics is exactly 0. Should we tighten the threshold for this specific batch (e.g., FX5 pool ±1% instead of ±5%) given the by-construction-zero expectation? CC's view: keep umbrella thresholds — tighter thresholds add false-alarm risk; the zero-delta proof is by-construction in §6, not by empirical tightening.

(Q7) **Sub-batch combine/split** — anything in this scope you'd split into a separate sub-batch (e.g., SQE-bug-fix as its own sub-batch separate from the API signature change)? CC's view: keep combined — the SQE bug fix is the production-active instance of the silent-fallback pattern; fixing the pattern without fixing the instance leaves the user-visible bug live. Combined ships as a coherent root-cause+symptom unit.

---

**Reply:** Step 1 ACK / specific concerns / counter-proposals.
