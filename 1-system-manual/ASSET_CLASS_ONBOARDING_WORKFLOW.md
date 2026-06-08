# Asset Class Onboarding Workflow

**Tier 2 governance document. Mandatory pre-read before any new asset class enters DawnTrader.**

Created in B79 (Phase 24) with `xstock_spot` as the canonical worked example. **Rebuilt + FINALIZED 2026-06-08** (Phase-24→19 plan, item 1; Langston-reviewed, approve-with-revisions → all revisions applied → R-reference graph verified clean in both directions) into a single source-of-truth playbook: every Phase-24 sub-batch learning was mined, de-duplicated, and folded into one ordered sequence. The trial-and-error narrative of *how* each learning was discovered still lives in the per-batch completion reports under `Claude Comms and Packages/Batch Completion/`; this doc carries the distilled *what-to-do / what-to-watch-for*.

> **Governance note:** the CLAUDE.md §3.3 Phase-24 learning-capture rule (mandatory "Asset-class onboarding workflow learnings" section in every Phase-24 completion report) stays ACTIVE through the final Phase-24 governance close, then converts to "ad-hoc update when a substantive learning surfaces" per its own "after Phase 24 closes" wording.

---

## Part 0 — How to use this playbook

**The lens.** Read this as: *"I am a future Claude Code session onboarding a NEW asset class. What do I do, step by step, and what must I watch for because of what bit us in `xstock_spot`?"* Every step carries its watch-fors inline — "when you do X, watch for Y, because Z happened to us."

**The bar.** By the time you finish Part 1, you should be **90–95% prepared** for the real work — you know the order, the traps, and where the detailed template lives for each step. The remaining 5–10% is the new class's genuinely-novel substrate (a different exchange API, a funding-rate dimension, an options-greeks input) that no prior class exercised.

**The structure — one step-order, no competing lists.**
- **Part 1 is THE sequence.** It is the single, ordered, numbered step-list (`Step 0.1` … `Step 9.x`, grouped by onboarding lifecycle phase). There is no second step-order anywhere in this doc. Earlier revisions had two competing ones (a "procedural checklist 0–11" table and a "corrected order of operations") plus a colliding `4.15` number — all removed in the 2026-06-08 rebuild.
- **Part 2 is the reference library.** Detailed code templates and patterns, each with a semantic ID (`R-STORAGE`, `R-MCE`, …). Steps in Part 1 point to these by ID for the *HOW*. A pointer to `R-STORAGE` is **not** an empty pointer — the full template is present in this same doc. Where a learning is short, it is written inline in the step itself; where it is a long code template reused by several steps, it lives once in Part 2 and is referenced by ID.
- **Part 3 is the worked example** (`xstock_spot`) — a concrete, filled-in instance of the whole sequence, including the actual code-surface inventory and the 18-stage walkthrough table.
- **Part 4 holds the empty slots** for future classes (`crypto_perp`, etc.) — intentionally blank until each ships.

**Relationship to the 11-step batch workflow.** This onboarding sequence is the *domain content*; the CLAUDE.md §2 eleven-step batch workflow is the *process wrapper*. Every onboarding step in Part 1 is itself shipped as one or more Step-1-through-11 batches (scope → pre-audit → implement → Langston review → CI → deploy → verify → Langston second-pass → iterate → governance → completion report). When a Part-1 step says "seed the rows," that still means a full batch with a scope file, a Langston-reviewed diff, green CI, and a completion report.

**External pointers in this doc are resolved, never bare.** Every "see `<file>`" names the specific file AND states what you will find there. If a referenced thing is short enough to state, it is stated here inline instead.

---

## Standing invariants (bind every phase — Kyle directives, do not violate)

These are the cross-cutting rules. They are not a step you do once; they constrain every step below.

1. **NO PATCHES.** Every fix and feature is long-term, sustainable, stable, scalable. No duct tape, no "good enough for now." A surfaced bug triggers root-cause → design → document-before-implement → Langston review → proper batch. Cold-start warmup is acceptable (1–5 min deterministic startup beats instant-on with a stale-cache race). (CLAUDE.md §5 #15.)
2. **Per-asset-class configuration is the default for every behavioral knob.** Regime thresholds, SQE gates, strategy gates, friction, TEC/BE/trailing, confidence floors, freshness windows — all DB-resolved with `asset_class` as a first-class scoping dimension. A wildcard `*` row is acceptable ONLY when the value is genuinely identical across all classes; the moment any class needs a different value, the wildcard is replaced with explicit per-class rows. **No silent fallbacks** — if a DB-governed row is missing, HARD-FAIL at boot, never run on a hardcoded default.
3. **Backpressure is never asset-class shedding.** Resource ceilings trigger vertical-scale (Hetzner/Supabase tier) or a computational-distribution refactor — never drop-cycles or throttle a live class. The pre-deploy load test is a sizing decision-gate.
4. **Both ablation frameworks run during VTS observation** — factor-calibration (B67.0) AND exit-strategy (B73), in parallel, each asset-class-scoped, each feeding Layer-3 evidence. Replacing an existing class's ablation is never the answer; parallel observation is. The Layer-1/2/3 discipline and the **Layer-3 promotion gate** these frameworks feed — tertile-monotonic WR + ≥7pp HIGH-LOW gap + p<0.05 + n≥150/bucket, the threshold the HCE "selectivity is the lever" finding is judged against — are in `R-LAYERS`.
5. **Each new class gets its OWN dedicated observation UI tab** — a full mirror of the incumbent's rich panels, not a thin one. Never stack a new class's panels under an existing tab. (See `R-UITAB`.)
6. **Terminology:** "**VTS Observation**", never "shadow-mode" (Kyle directive). Use the system's canonical terms — *regime* (not "market condition"), *xStock* (not "stock"), IMF / DBS / LQ / VN / DI / MCE as-is.
7. **The incumbent class is byte-identical-protected.** Every onboarding change must leave the existing class's behavior provably unchanged — the no-touch fence (see `Step 8.1`). Value-identical promotions (in-code default → DB row at the SAME value) are inside the fence.
8. **Governance is updated the same session as the decision.** Verbal "we'll document it later" is rejected — the project is too large and runs over too many phases for unwritten commitments to survive. Update RUNNING_ISSUES + the relevant governance docs before/with implementation, not after deploy.
9. **Langston review is a non-negotiable gate** at scope, pre-audit, code-diff (before push), and second-pass verification. Use the file-first + embedded-diff dispatch protocol (CLAUDE.md §6.5.0.a): no-gdrive instruction at the TOP, load-bearing diff inline, `bypassPermissions`. The independent Step-2 pre-audit and Step-4 review have historically caught the highest-value bugs (TEC silent-no-op, await-before-Map.set, close-cascade re-run).
10. **Ticker-collision re-audit is quarterly and standing** (see `Step 0.2` + `R-COLLISION`). A symbol becomes a collision the moment either side lists a new pair.

---

## Part 1 — THE unified onboarding sequence

Execute strictly in phase order (0 → 9). Within a phase, the steps are ordered but several can ship in one batch when their surfaces overlap. Each step states WHAT, embeds its watch-fors, and points to the Part-2 reference (`R-*`) for the detailed HOW.

### Phase 0 — Pre-flight (before any code)

**Step 0.1 — Fill the operational profile.** Populate the 10-field operational profile (`R-PROFILE`): trading hours, settlement, geography/regulatory, fees, custody, WS endpoint, REST endpoint, symbol form on each endpoint, universe size/dynamism, tick/lot/fractional. Then answer the **monolithic-vs-heterogeneous** question explicitly: are all symbols in this class operationally identical, or does the exchange treat some differently (24/7 names inside a 24/5 class, halt-able names, pre/post-market windows)? *Watch for:* if non-monolithic, every market-state predicate (`isMarketOpen`, freshness gate, TEC stop-freeze) must take a **REQUIRED symbol argument from Day 1** — an optional-with-silent-default signature is a silent-bug class (Langston). [B79, A.0]

**Step 0.2 — Ticker-collision check FIRST — the #1 Phase-24 learning.** Before any architecture decision, intersect the new class's symbol set against the exchange's LIVE pair list (e.g. Kraken `AssetPairs`). Store the result as a `<CLASS>_<EXISTING>_COLLISIONS` constant with a provenance comment (endpoint, date, quarterly re-audit cadence). Full recipe in `R-COLLISION`. *Watch for:* skipping this produced a live mis-display bug — `SUI/USD` (Sui Network crypto) rendered as an xStock because Sun Communities equity `SUI` collided. xstock_spot hit **9 USD collisions** (BDX/CVX/DASH/EDU/MET/OPEN/PEP/SUI/T) + 8 EUR pre-locked. [B79.0f]

**Step 0.3 — Exchange list-all-instruments check.** Determine whether the exchange exposes a public list-all REST endpoint for this class. Crypto auto-discovers (Kraken REST `AssetPairs`, ~1544 pairs); xStock does NOT (Kraken public REST does not index xStocks — WS-equities only), which forced a whole dynamic-discovery build; crypto-perp HAS one (Kraken Futures `/derivatives/api/v3/instruments`). *Decision rule:* **if there is no list-all endpoint, scope dynamic discovery as a FIRST-TIER batch, not a follow-up** — a hardcoded registry is a compounding structural cost (every new instrument becomes manual maintenance with zero operator visibility). Build pattern in `R-DISCOVERY`. [B79.0n.UNIVERSE-DISCOVERY]

**Step 0.4 — Log non-existent API names as you probe.** While confirming endpoints/channels/symbol forms, any name that turns out NOT to exist on the exchange goes into `KNOWN_NONEXISTENT_NAMES` in `server/services/utils/symbol-canonicalizer.ts` (exchange, type, failing name, context, correct alternative, date, reason) — CLAUDE.md §5 #14. *Watch for:* xStock has no public REST — `AssetPairs` returns 0 xStock pairs, `OHLC?pair=AAPLxUSD` returns `EGeneral:Invalid arguments`, `api-equities.kraken.com` does not resolve. REST-polling is a DEAD PATH for xStock; the feed is WS-only. [B79.0c, B79.0k]

### Phase 1 — Discovery + universe

**Step 1.1 — Build the three-service discovery chain with strict role separation.** Prime-mover (cheap public by-issuer catalog: "what instruments exist in this family?") → ground-truth (exchange accept/reject probe, binary: "does the exchange actually stream/trade this right now?") → enrichment (per-symbol metadata only — sector/GICS/flags — never decides existence). xStock: CoinGecko `xstocks-ecosystem` (126) → Kraken WS subscription probe (479 accept / 2 reject) → Finnhub `/stock/profile2` sector. Detailed shape + per-leg rules in `R-DISCOVERY`. *Watch for:* never conflate "discovered" with "tradeable" — the prime-mover list being larger or smaller than the final tradeable universe is BY DESIGN. [B79.0n.UNIVERSE-DISCOVERY]

**Step 1.2 — Keep universe-discovery and per-symbol metadata as separate layers.** The exchange gives the symbol LIST; metadata (GICS sector, ADR/crypto-adjacent flags, fundamentals) needs an external source. Do not couple them. [HYGIENE]

**Step 1.3 — Wire the 5-layer boot fallback chain** (live discovery → DB snapshot `initializeFromDB()` → file cache → hand-curated ~20-symbol bootstrap → fail-fast `process.exit(1)`). Each layer covers a distinct failure mode. Full schema (3-table) + lifecycle in `R-DISCOVERY`. [B79.0n.UNIVERSE-DISCOVERY]

**Step 1.4 — Add the overrides table and apply it LAST.** `<class>_universe_overrides` with explicit `override_*` columns, applied after source-chain fields are set, so curator decisions (delisted, sector fix) survive every re-discovery. [B79.0n.UNIVERSE-DISCOVERY]

**Step 1.5 — Anchor the stale→delisted lifecycle on `last_seen_at` (actual data arrival), NOT on subscription-accept.** Some symbols accept a WS subscribe but never stream (delisted underlying / suspended). xStock: >7d no-data → stale (log-only); >30d → auto `is_delisted=true`. This is the only reliable "the feed says yes but no data flows" detector. [B79.0n.UNIVERSE-DISCOVERY]

**Step 1.6 — Add the `discovery_runs` forensic audit table** (one row per cycle: run_id, `triggered_by` CHECK in cron_daily/manual/boot, counts, `source_chain_status` JSONB, error_log). Ship the daily node-cron `0 6 * * *`, the manual `POST /api/internal/universe-discovery/refresh`, and a health endpoint. *Watch for:* every node-cron schedule needs the audit-row + poll-reconcile safety net of `R-SCHEDTASK` — node-cron can silently fail to fire with no exception and no log line. [B79.0n.UNIVERSE-DISCOVERY]

**Step 1.7 — Treat classification heuristics as fragile.** `string.includes()` has substring-collision ORDERING bugs (`MRNA` classified XLK-not-XLV because `includes('technology')` matched `Biotechnology` first). Order SPECIFIC before general; give every heuristic parameterized regression-lock tests on empirically-probed boundary + collision pairs; gate UNCATEGORIZED ≤20%; use VARCHAR+CHECK (not a PG ENUM) for the sector column so you avoid the `ALTER TYPE` same-transaction restriction. [B79.0n.UNIVERSE-DISCOVERY]

**Step 1.8 — Give every WS/REST discovery call an explicit timeout + deterministic partial-response abort.** A Kraken WS open-handshake can hang on stuck DNS/TLS. On timeout, write a `partial=true` audit row and do NO DB writes (the fallback chain covers). [B79.0n.UNIVERSE-DISCOVERY]

**Step 1.9 — Consolidate parallel registries to ONE SSOT with type-REQUIRED fields.** Two parallel files DRIFT — xStock's universe-symbols + display-names were collapsed into one `XSTOCK_SPOT_REGISTRY` with `name` REQUIRED so a missing display-name is a COMPILE error (derived Sets stay back-compat). If you must keep two, assert both sizes match as a hard invariant. [Diagnostics-Tab, HYGIENE]

**Step 1.10 — Size the tiers at pre-audit and shock-test universe growth.** Budget ≈ N symbols × 4.6 KB/sec WS during active hours (~86 KB/symbol/hr). The measured xStock 260→489 (+88%) jump: OHLC/24h work 1.86×, WS-subs 1.87×, bias-store memory ~2×, scanner cycle UNCHANGED (cursor-rotated 75-cap batches). Run a +50-symbol shock test and assert cycle/mem/write-rate stay within ±10%. *Watch for:* a static-subscribe-at-boot OHLC WS adapter will NOT pick up dynamically-discovered symbols — it needs a refresh hook, or you document a "PM2 restart to pick up new symbols" gap. [B79.0n.UNIVERSE-DISCOVERY]

### Phase 2 — Schema + config

**Step 2.1 — Add `asset_class` as a first-class column on every shared-state table; no price cap if the incumbent has none.** ("We don't cap BTC, we don't cap AAPLx.") Symbol allow-list in canonical `BASE/USD` form. Tables to audit for the column: `screener_filters`, `paper_sim_trades`, `paper_sim_open_positions`, `signal_eval_archive`, `regime_factor_alternates`, `exit_strategy_alternates`, `vts_open_trades`. [B79]

**Step 2.2 — When you add `asset_class`, UPDATE THE UNIQUE INDEX too (recurring half-job).** `screener_filters` had `UNIQUE(mode, filter_path)`; new-class seeds collided on identical `(paper, vts_trend)` tuples and `ON CONFLICT DO NOTHING` silently skipped them all (`INSERT 0 0`). Fix: drop → `UNIQUE(mode, asset_class, filter_path)` + update the storage upsert's WHERE clause. *Watch for:* `\d <table>` shows column shape but NOT the constraint — pre-audit MUST also paste `pg_indexes WHERE tablename='<x>'`. Audit EVERY table that gains `asset_class` for stale unique indexes AND for the storage upsert WHERE clause (the upsert was `(mode, filterPath)`-only → after a dual-class seed it matched BOTH rows → unique-violation / cross-class corruption). [B79.0m.a, B79.0n.STORAGE]

**Step 2.3 — Add composite `(asset_class, <time-col> DESC)` indexes on aggregator-read tables.** Every aggregator-read table with `asset_class` + time filtering (`regime_factor_alternates`, `exit_strategy_alternates`, `signal_eval_archive`) needs `idx_<table>_asset_<timecol>` or the aggregator's `WHERE asset_class=$X AND <time> >= …` does a full-window scan with a post-bitmap `Filter` on asset_class — 32+ s on 24k-row tables; sub-ms with the index. If the query has `AND <pred> IS NOT NULL`, make the index partial with the same predicate. **Verify with `EXPLAIN ANALYZE` that `Index Cond` (not `Filter`) carries the asset_class predicate BEFORE the new class starts emitting** — the 38–133 s endpoint timings in B-NEW-28 came from skipping this. `CREATE INDEX CONCURRENTLY` cannot run inside a Drizzle BEGIN/COMMIT — use a raw `psql` script under `server/migrations/manual/` with an `IF NOT EXISTS` guard + co-located rollback. [BATCH_82]

**Step 2.4 — Seed `module_constants` rows per-class for EVERY behavioral knob, and DELETE the code constants.** Regime, SQE, MCE, strategy_gates, pattern_pool_gates, trailing_exit, market_data freshness. DB is the SSOT — `XSTOCK_SPOT_ENABLED_STRATEGIES` was deleted; gating reads `strategy_gates.<class>.<strat>.enabled` (19 rows = 10 allow + 9 block). Add the module to the boot PREFETCH list with a HARD-FAIL on rowCount=0. A code+DB dual SSOT violates the no-silent-fallback invariant. [B79.0m.a, B79]

**Step 2.5 — Use the SAME `constant_name` across classes; `asset_class` is the ONLY differentiator.** xStock `pattern_pool_gates` was seeded with different field names than crypto (`final_score_floor` vs `pattern_final_score_min`) → required a forward-converge migration. Before seeding, grep the incumbent's `constant_name`s and match them exactly; add a naming-convergence regression test. Convergence recipe in `R-PATTERN` (naming-convergence sub-pattern). [B79.0n.PATTERN-DETECT]

**Step 2.6 — Clone Layer-1 thresholds from the incumbent, tagged with provenance — but treat the numbers as DEBT, not truth.** Tag cloned rows `last_updated_by='cloned-from-crypto'`. Scale the class-specific primitives (e.g. TFS vol/mom scales HALVED for an equity ATR baseline); keep the scale-free agnostic primitives (DI, DBS, regime_age, volume_regime) on the wildcard `*` with an inline justification comment. These cloned values are explicit calibration debt resolved in Phase 7 — see `Step 7.2` carryover audit. [B79.0m.a]

**Step 2.7 — Understand Layer-1 vs Layer-2 scope before scoping the work.** Layer-1 (primary, UI-overridable, per-class-scoped rows) is the primary onboarding seed work; Layer-2 (`module_constants` fallback, often wildcard) usually DEFERS to a later batch with explicit promote-to-active triggers. Half-routed (L1 per-class + L2 wildcard) is acceptable. The API-side reads (`getCachedNumberRequired` / `getCachedNumbersForModule`, hard-fail-on-missing) were already wired in B72 — so per-class work SHRINKS to seed rows + REQUIRED-typing. Enumerate "what B72 already did vs what remains" from CODE/DB, not from stale BATCH_CATALOG planning rows. [STORAGE, MCE]

**Step 2.8 — Retire a wildcard only via an EXISTS-gated, no-orphan-window migration.** Add crypto row → add new-class row → DELETE the wildcard `(*,*,*,*)` ONLY `WHERE EXISTS` both, all in one `BEGIN/COMMIT` + `ON CONFLICT DO NOTHING` + exact-`constant_name` scoping + a sibling `*-rollback.sql`. Ship the resolver-key tightening and the seed migration in the SAME commit. For a high-blast lever, use the **promote-then-retire two-step** (`R-WILDCARD`): batch 1 seeds per-class rows + an observable fallback counter while PRESERVING the wildcard; batch 2 (after a 48h verify-gate with the counter at zero) does the EXISTS-gated DELETE. The 48h gap verifies RESOLVER correctness, not just DELETE safety. [B79.0n.MCE, B79.0n.SCORING]

**Step 2.9 — Make the keep-vs-retire decision per lever.** Genuinely cross-class (math constants, governance caps) → KEEP wildcard + justification comment. Asset-class-meaningful → retire to per-class. The fix for a buggy wildcard is always at the DATA layer, never the resolver — wildcard support is a correct feature. [MCE]

**Step 2.10 — Keep DB flags NUMERIC (1/0), never string.** The resolver drops non-numeric values → a string flag silently re-enables the thing it was meant to disable (e.g. `volume_confirmation_enabled`). [B3.1b]

**Step 2.11 — No silent fallbacks for DB-governed settings, with one nuance.** A try/catch returning a hardcoded default (`sector_coverage_floor=7`) is WRONG — an operator deleting a seeded row must HALT, not silently run on a default. Use strict `getCachedNumberRequired`. The nuance: when you ADD a new signal to a hot path, PRESERVE a genuinely-graceful degrade (insufficient archive / ATR=0 / missing-sector → neutral multiplier), which is different from silently defaulting a governance knob. [B-PHASE-A2]

### Phase 3 — Code surface (the REQUIRED-`assetClass` master pattern)

This is the single most reused discipline in the whole onboarding. The detailed per-surface templates are in `R-STORAGE` (storage/data-access), `R-MCE` (compute/math + fail-hard switch + wildcard-retirement), `R-PATTERN` (pattern-recognition + naming-convergence + capture-and-reuse), and `R-CHAIN` (confidence-modulator chain). The steps below are the order and the watch-fors.

**Step 3.1 — Capture-the-compiler: promote `assetClass?: string = 'crypto_spot'` → REQUIRED `assetClass: AssetClass` at every surface API.** TS then compile-fails every caller — 100% coverage by construction, which beats grep. Apply at storage, compute/math, strategy-detect (`_SE_KEY` factory + `callStrategyDetect` + the 19 detect methods), pattern primitives, and the modulator chain (16 sites). **Treat ANY `assetClass?:` optional-with-default as a DEFECT to convert.** Lock each surface with a `@ts-expect-error` type test so a regression shows up as an "unused directive" error. *Real bug this caught:* SQE was evaluating xStock against crypto's `finalScoreMin`. [STORAGE/MCE/STRATEGY/PATTERN-DETECT/CONFIDENCE-CHAIN]

**Step 3.2 — Enumerate callers by compile, not grep — grep is a ~20% undercount AND has false positives.** Probe: edit ONE signature to add the REQUIRED param → `npx tsc --noEmit` → capture the errors → REVERT before commit. Measured undercounts: STORAGE 32→38; STRATEGY "2 files"→7-file/66-call. Grep false-positive example: `assetClass:'*'` matched `directional-bias-store.ts:59`, which was already a per-class variable (not a wildcard literal) — always open the file before scoping work to a grep hit. Categorize each hit: crypto-intentional (`'crypto_spot' as const`) / asset-class-aware (context-routed) / diagnostic (helper-routed) / already-correct — the categorization itself is a maintenance asset. [STRATEGY, STORAGE, MCE]

**Step 3.3 — Centralize the dispatcher; share the methods; vary only the DATA — never fork LOGIC.** Threading happens AT the dispatcher (`callStrategyDetect`, `storage.getScreenerFilters`, `mce.computeContext`). Per-class code under `server/asset_classes/<class>/` is ONLY pure helpers (lane-eligibility, market-hours, regime-thresholds, friction) and is bound by LOCATION, not by an optional param — an `assetClass?:` on a file that is already asset-class-bound by its folder is a silent-fallback magnet. [STRATEGY, MCE, UNIVERSE-DISCOVERY]

**Step 3.4 — Use a per-class factory dispatch + `assertNever` exhaustive switch for any component going multi-class.** Arm one instance per active class; throw `[CLASS_NOT_WIRED]` (DISTINCT from `[CLASS_INVALID]`) for reserved-future classes; terminate with `assertNever(assetClass)` so the file compile-fails when the `AssetClass` union grows; give the function an explicit return type. Full template in `R-INSTANCE` (telemetry triad) and `R-DISPATCH` (domain dispatcher). [TELEMETRY, ORCHESTRATOR, MCE, STRATEGY]

**Step 3.5 — Co-locate domain dispatchers; do NOT build a central SSOT dispatch file.** `getFrictionForAssetClass` lives in `cost-model.ts`; `getPatternPoolGuardrailsForAssetClass` in `pattern-pool-dispatch.ts`. A central `dispatch.ts` forces every domain to import from every other domain. The consumer-site swap pattern for authoring one such domain dispatcher (when the per-class module already exists) is `R-DISPATCH`. [ORCHESTRATOR, MCE]

**Step 3.6 — Capture-and-reuse the resolution once at function/loop entry, with `safeResolveAssetClass` + skip-on-null.** Resolve ONCE into `_assetClass`, reuse downstream, and skip cleanly on null instead of throwing. This eliminates throw-amplification on unregistered symbols and dedupes the per-call `[COLLISION_RESOLVE]` WARNs. Template + rationale in `R-PATTERN` (capture-and-reuse). [PATTERN-DETECT origin, CONFIDENCE-CHAIN 16 sites]

**Step 3.7 — No silent fallback at a REQUIRED-`assetClass` boundary.** Use deterministic `resolveAssetClass(symbol,'kraken')`, NOT `metadata.assetClass || 'crypto_spot'` — a disagreement between the two is a real bug you WANT surfaced at the boundary, not silently reconciled. Where a fallback must remain, add an inline WARN so un-threaded callers are observable. Distinguish belt-and-suspenders (defensive, backs an existing invariant — OK) from load-bearing (the only net — a smell). [ORCHESTRATOR, RTB, EXECUTION]

**Step 3.8 — Extend the cache key to `${primaryId}:${assetClass}`.** STORAGE keyed `${mode}`, MCE keyed `${symbol}`, SCORING's `getPredictiveConfidence` was cross-contaminating `${regime}:${strategy}`. Memory cost is O(k), k = number of (id, class) combos. Ship a cache-isolation regression test. *Watch for:* a subsystem can own MULTIPLE cache layers (MCE has 3: per-symbol context, module-constants rowset, 9-group config refresh) — extend the RIGHT one and document the inventory so the next onboarding does not conflate them. [STORAGE, MCE, SCORING]

**Step 3.9 — Preserve a wildcard under a per-class refactor; diverge ONLY with EXISTS-gated explicit-row evidence first.** `_RTB_GK` was kept at 8 sites rather than prematurely seeded per-class. Prevents "we're in here, let's also seed per-class" divergence with no evidence. [RTB, ORCHESTRATOR]

**Step 3.10 — Replace local `export type AssetClass = 'crypto_spot'` re-declarations with the shared import.** A local literal re-declaration silently NARROWS the union (`pattern-pool-filters.ts:76`) — use `export type { AssetClass } from '@shared/asset-classes'`. Note TS1016: a REQUIRED param cannot follow an optional one → re-order to required-but-nullable. [PATTERN-DETECT, MCE]

**Step 3.11 — Extend `resolveAssetClass` itself for the new class.** Branch order matters: exchange-first → display-form → collision-gate → membership → fall-through to existing patterns. Full template in `R-RESOLVE`. The persistence-at-open table (`vts_open_trades`) is already class-agnostic — future classes inherit it with no new persistence code (see `Step 4.8`). [Section D.1 origin]

### Phase 4 — Scanner + pipeline wire-in

**Step 4.1 — Two-batch split: dormant scaffold FIRST, live activation SECOND.** Keeps "no signals → no contamination of the incumbent's pooled aggregates until calibrated." The arc was B79 scaffold → B79.0a live scanner; B79.0m.a inert thresholds → B79.0m.b2 functional pipeline. Day-1 verification is a boot-log line + a no-touch fence SQL only. If a sub-batch ships scaffold without making the capability functional, declare it in BOLD at the top of the completion report (CLAUDE.md §9.1). [B79, B79.0a, B79.0m]

**Step 4.2 — Subscribe the new scanner to `centralClock`, import ONLY the new class's instances.** Never `setInterval` (drifts, non-deterministic load). Import `getXstockSpotInstances`-style accessors, never the global `getTelemetryAggregator()` on the new path (grep-verify). Constructor-inject telemetry into ARM with a back-compat fallback `(config?, telemetry?)`. [B79.0a]

**Step 4.3 — Implement all 12 crypto-parity scanner defenses from day one** (`R-SCANNER`). Missing any one produces the exact "scanner wedges, UI shows zeros forever, every cycle times out" failure xStock hit: (1) cycle-scoped config cache, (2) `SCAN_TIMEOUT_MS`+`Promise.race`, (3) pair-batch rotation, (4) pinned-benchmark sanity, (5) constant-name canonicalization, (6) bid/ask spread filter source, (7) OHLC pre-warm batched/TTL, (8) NO silent fallbacks, (9) symbol-normalization consistency, (10) connection-pool sizing, (11) central-clock not setInterval, (12) `isScanning` early-return. [Step 2b origin]

**Step 4.4 — Add a per-class freshness window, empirically derived, stored in `module_constants`.** xStock `data_freshness_window_ms=90000` from the p99 inter-tick gap of low-liquidity names; class-aware `isPairDataFresh(symbol, assetClass, lastTickMs, now)` with a closed-market belt-and-suspenders. *Watch for:* do not claim you converted every freshness caller — the incumbent admission-path callers were deliberately left for a later batch; say so. [B79.0a]

**Step 4.5 — Market-hours: DST-aware tz math, never UTC-day/hour arithmetic.** Use `Intl.DateTimeFormat('America/New_York')` — old UTC-day code reopened at Sun 22:00 UTC = 6 PM EDT, 2 h early. The market-hours checklist also covers: a REQUIRED symbol arg on every predicate (an optional arg is a silent-bug class — Langston); the symbol-normalizer regex needs a MANDATORY disambiguating suffix (a greedy `[A-Z]+x?` consumed the disambiguating `x` so `TSLAxUSD`→`TSLAx/USD` fell through); `/USD` vs `/USDC` membership; empty-universe `IN ()` short-circuit before the DB read; DST-boundary tests. **xStock is 24/5 (Fri-20:00-ET → Sun-20:00-ET unified close), NOT 24/7 and NOT US RTH; US holidays PAUSE the cadence** (CLAUDE.md §5 #17). The scanner runs a RESTRICTED universe when the regular session is closed (it does not skip the cycle); surface `lastUniverseSize` on diagnostics. [B79.0c, B79.0L, B-NEW-36]

**Step 4.6 — Probe the upstream feed empirically BEFORE declaring "live."** A 60-s WS probe returned 201 messages but ZERO ticker/OHLC — the feed is silent on weekends for ALL names. Distinguish "correctly-closed market" from "broken feed." A combined investigation batch whose output is a DECISION MATRIX (not code) is legitimate. Escalate any recurring paid-feed cost to Kyle. [B79.0c, B79.0k]

**Step 4.7 — Make the collision resolver context-sensitive: no unconditional membership fast-path that wins regardless of context.** A collision ticker arriving on the plain exchange path WITHOUT the disambiguating suffix returns the INCUMBENT class + a `[COLLISION_RESOLVE]` WARN; the display-form (`SUIx/USD`) resolves to the new class. WARN-and-prefer-incumbent, never throw. If the collision bug ever shipped, backfill historical mis-tags (audit script first with the UPDATE commented out; xStock flipped 4862 rows) and log it in CHANGES_AND_FIXES. Recipe in `R-COLLISION`. [B79.0f]

**Step 4.8 — Persist `asset_class` at trade-OPEN into a dedicated table, and never re-resolve downstream.** `vts_open_trades` holds the row; downstream reads it, making the collision-display bug structurally impossible. CRITICAL ordering: `await` the INSERT BEFORE the in-memory `Map.set` (no fire-and-forget — that creates a Map-has/DB-doesn't window); trade-open returns null cleanly on persist failure. On rehydrate, RE-RESOLVE via the safe resolver (to defeat legacy bad values) and update BOTH DB and Map. At close: `Map.delete(id)` FIRST (sync gate against re-running the non-idempotent close cascade), THEN `await markOpenTradeClosed` in a try/catch with NO re-throw (soft-delete `closed` boolean, not a forced full-tx — a forced tx with no shared surface turns a recoverable ghost-row into an unrecoverable double-write). `CREATE INDEX CONCURRENTLY` cannot run in BEGIN/COMMIT. [B79.0f, B79.0g, B79.0g-tx]

**Step 4.9 — Hunt the "crypto-first / asset-class-lost" bug class — it recurred 5+ times in 24–48 h.** Any serialization/dispatch/registry site predating asset-class-awareness DROPS the dimension: an exit-cycle missing a `db` import silently swallowed `db is not defined` every minute → xStock `currentPrice=null`, open 20+ h (B-NEW-20); open-context fields empty (B-NEW-22); price dispatch read the crypto-only cache (B-NEW-25); `assetClass` never written to closed-trade JSON + readback `|| 'crypto_spot'` MISLABELED every closure (B-NEW-26/27); a writer-side `'crypto_spot'` literal mis-tagged every emit (BATCH_82). **Structural fix: centralize resolution at the ENTRY point (default-resolve context fields INSIDE `registerOpenVtsTrade`) + make `assetClass` type-REQUIRED so a dropped dimension is a COMPILE error.** The writer/reader enumeration audit is `R-WRITER`. [Diagnostics-Tab, B79.TEC]

**Step 4.10 — Mirror the incumbent's pipeline architecture EXACTLY; differences live in DB rows + substrate-forced params, never in code shape.** Same filter paths, TRUE family fan-out (`for lane { for strategy }` → N+1 lanes/pair), parallel pattern global+IMF gate (survivors tagged `sourcePool='pattern'`), post-detect math, exit TEC. *Watch for:* `sourcePool` lives in `features` JSONB (`features->>'sourcePool'`), not a top-level column. The B73 replay must branch on assetClass to read the RIGHT OHLC table (it was silently fetching crypto REST OHLC, empty for xStock). Enforce LONG-only explicitly (an ORB down-break returned SELL → null on `sell_disabled_long_only`). Add the family-map entry (`orb:'breakout'`) or the family-gate is bypassed. Extract lane-eligibility into its own file for testability. [B79.0m.b2, Diagnostics-Tab]

### Phase 5 — Telemetry / observability

**Step 5.1 — Build a per-class instance triad via factory, NOT param-plumbing.** Each class gets its own `TelemetryAggregator` + `ARM` + `PairFailureTracker` + `AdaptiveScanManager` from `getAssetClassInstances(class)`. Keep the new class's instance IN-MEMORY only on Day 1 (Variant C default) to avoid contaminating the incumbent's pooled aggregates. Full factory + `assertNever` template in `R-INSTANCE`. The Layer-1/2/3 observation framing these instances emit into — and why Variant C (in-memory-only) is the Day-1 default — is in `R-LAYERS`. *Watch for:* the persist-timer hazard may already be structurally impossible (gated inside the singleton accessor) — check before adding a flag. [B79, TELEMETRY]

**Step 5.2 — Ship the `peek<X>` non-arming-read companion WITH the construction API, same batch.** A verify-gate stats accessor must NOT accidentally ARM persistence (timers/disk). The `peek*` prefix returns whatever module-level instance is held (may be null), with no construction side-effect; a caller that needs to arm uses a distinctly-named `getOrCreate*`. Template in `R-INSTANCE` (Shape 2). [TELEMETRY]

**Step 5.3 — Lazy-init every per-symbol map/counter/bucket** (`bucket.get(symbol) ?? createBucket(symbol)`), NEVER a boot-time `SYMBOLS.forEach()` alloc. A symbol discovered AFTER boot won't have a bucket → writes silently no-op or throw. [UNIVERSE-DISCOVERY]

**Step 5.4 — Stand up a FULL mirror observation UI tab (standing invariant #5), not a thin one.** REUSE the incumbent's rich components via an optional `endpointBase` prop (byte-identical for legacy callers) + an explicit REQUIRED `assetClass` prop; parameterize shared backend aggregators with an OPTIONAL `assetClass` (append `AND asset_class=$X` ONLY when provided; default = byte-identical legacy behavior) + a SQL-string-equivalence test; cache-key isolation via `{asset_class}` in `queryKey`. The full 6-step recipe is `R-UITAB`. *Watch for:* factor-calibration is JSONB (`(real_decision->>'confidence')::numeric`) — run `\d` first. The G3 Claude-in-Chrome walkthrough is NON-waivable (CLAUDE.md §9.3). Terminology: "VTS Observation," never "shadow-mode." [B79.0i.a/b]

**Step 5.5 — Know that a VTS observability field has a 5-SITE plumbing chain; missing any one silently degrades to "—" with NO tsc error** (the persisted closed-trade record is cast `as any`). The sites: capture-at-open / open read-feed type+push / close-copy (field-MAPPING not spread) / JSONL persist-write / closed read-feed whitelist. Full chain + detection technique in `R-5SITE`. Verify via the LIVE feed; detect via a scoped before/after tsc diff. [B.2.UI]

### Phase 6 — Strategy activation

**Step 6.1 — Activating a strategy has SIX wire-in points; missing ANY one silently nulls it.** (1) real `detectX()`; (2) register in `strategy-engine.ts` dispatch (import + enum + wrapper); (3) register the `signal-orchestrator.ts` dispatch block + asset-class guard; (4) add to `canonical-regime-strategy-map.ts` for the right regimes; (5) SQE whitelist entry; (6) seed Layer-1 thresholds + flip the DB gate. Template in `R-STRATEGY6`. [B79.0d]

**Step 6.2 — THE highest-cost gap of the whole arc: a new strategy needs BOTH dispatch sites — `strategy-engine.ts` direct AND `vts-runner.ts:callStrategyDetect` switch — plus a VTS-path integration test through `callStrategyDetect`.** B79.0d updated only the strategy-engine path; because active trading is OFF, the ONLY path that runs is VTS → ORB was silently 100%-nulled and flooded `[HF6][VTS] Unknown strategy: orb` for THREE batches until someone grepped for "orb." The unit tests passed because they tested the wrapper in isolation. **Always add the VTS-path integration test.** [B79.0d→B79.0j]

**Step 6.3 — Skip the incumbent via triple-defense** (detect early-return + dispatch guard + SQE whitelist); the DB gate flip (`strategy_gates.<class>.<strat>.enabled=false`) is the rollback. A new PG enum value (`strategyTypeEnum` 'orb') needs a SEPARATE migration ordered FIRST in MANIFEST (`ALTER TYPE ADD VALUE` cannot co-tx). Name constants for what they ARE (`risk_reward_ratio` was a misnomer → `target_range_multiple`). The B73 ablation auto-includes new strategies (it is strategy-agnostic) — don't claim you "registered" it there. [B79.0d, B79.0j, STRATEGY]

**Step 6.4 — Classify every lever F-1 vs F-2 BEFORE scoping seeds.** F-1 = class-invariant-by-construction (the DOMINANT outcome — STRATEGY had 222 wildcard levers ALL F-1, zero seeds); F-2 = per-class-behavior-required. CONFIDENCE-CHAIN was 4 F-2 / 5 F-1, which cut the refactor surface ~50%. Do not over-scope per-class seeds. [STRATEGY, CONFIDENCE-CHAIN]

**Step 6.5 — Use idempotent seed semantics — the seed-target may have DRIFTED between scope-draft and deploy.** `ON CONFLICT DO NOTHING` preserves actual state; scope enabled-counts are predictions (ORB was disabled by B-NEW-34 between the STRATEGY scope and its deploy). [STRATEGY]

**Step 6.6 — Make a per-class NO-OP/disabled lever DB-seeded AND function-enforced AND metadata-stamped — all three.** xStock's b67_1 macro NO-OP = `modifier_min=max=1.0` + `assetClassNoOpActive=true` + a short-circuit + a stamped row; b68_3 pair-correlation = `compute_correlation_enabled=false` + `SPY/USD` reference. Verify reference-symbol tickers against the DB (`SPY/USD`, not `SPYx/USD`). Use an atomic Map-replace for per-class config refresh (`ReadonlyMap` so in-place mutation is a TS error). Full chain-plumbing pattern in `R-CHAIN`. [CONFIDENCE-CHAIN]

### Phase 7 — Calibration (the "numeric carryover ≠ valid carryover" arc)

**Step 7.1 — Build a PRE-CALIBRATION BASELINE first — it is itself a major step.** Before tuning, capture, for EVERY tunable: current value + current result as a **rolling-window rate WITH raw counts** (never a single-cycle snapshot — a single xStock scan flashed spread-reject 16% vs the rolling-24h truth 2.3%; CLAUDE.md #13), plus regime mix, strategy mix, throughput, overlaid with an **operational-event timeline** (outages, holidays, feed go-lives) so distorted windows are excluded, plus a "definitely off NOW" list. Seed it ALL into a **Calibration Scoreboard** (`calibration_ledger` table + the Analytics "Calibration" tab; num/den is SSOT, pct derived in a pure tested formatter). The scoreboard must enumerate the ENTIRE surface — **64 settings across 8 categories** (Regime, IMF, Global gates, Strategy gates, Friction, TEC priors, Sector, Macro), grouped — not just the pre-flagged knobs (cherry-picked reads as hiding whole groups). Full method in `R-BASELINE`. [B-CALSCORE, B.0]

**Step 7.2 — Run the CARRYOVER AUDIT — "the single biggest Phase-24 onboarding trap": a numeric carryover is NOT a valid carryover.** Every cloned setting/gate/strategy/component needs: (a) re-derivation against the NEW class's actual data; (b) a layer-placement check (is it where canonical architecture says?); (c) a wired-not-stub check (does it actually FIRE?). Proven by: `lq_min=43` (a crypto VOLUME-era value) silently became a ~$19,950 ask-DEPTH bar rejecting ~70% of names when liquidity switched to order-book depth; a correlation gate that was BOTH mis-placed (bundled INTO the xStock IMF family filter; canonical IMF = LQ/VN/DI only) AND dead (no benchmark → constant 0.5 → 0 rejections of 283,625); wrong-volume-data confirmation gates; trend+breakout IMF thresholds IDENTICAL because cloned from one crypto baseline (they should differ); crypto-tuned strategies LOSING on the 24/5 equity tape. *Watch for:* two gates can measure different STATISTICS, not just different levels (xStock LQ screens ask-only depth; `min_depth_usd` screens min(ask,bid)) — coordinating them means reconciling WHAT they measure. Checklist in `R-BASELINE` (carryover sub-section). [B-CALSCORE, B.1.5, B3.1b, Diagnostics-Tab]

**Step 7.3 — Put the liquidity gate on a metric the class actually HAS.** Switch the carried-over 24h-volume gate to live order-book DEPTH (`calculateXstockDepthLQ`); use a rolling-MEDIAN over a 20-min window, not an instantaneous snapshot; use the 3-state graceful pattern (`lqComputable` + sentinel `-1` skip + try/catch = "no opinion this cycle," not a cascading rejection). Protect the crypto path with golden-value regression-lock tests. [B.1.5]

**Step 7.4 — Remove a broken gate rather than keep it as duct tape (NO PATCHES).** xStock volume-confirmation used underlying-EQUITY volume (not token volume); the depth-delta replacement carried no signal → REMOVE on the xStock path via a per-class NUMERIC flag (crypto keeps it), and document the honest gap (no token-volume feed; RUNNING_ISSUES #199). Verify a backend-only gate via a runtime LOG that PROVES the running process resolved + applied the flag (`volume<threshold` but `confirmed=true` because `volGateEnabled=false`). [B3.1b]

**Step 7.5 — Treat BAR-FREQUENCY as a first-class onboarding decision — MEASURE it, accept "no change," and treat a switch as a multi-week FOUNDATION effort.** A cloned class inherits the incumbent's interval (xStock inherited crypto's 60-min); that interval may not fit. Run a bar-frequency study (`scripts/b4-bar-frequency-study.ts`): per candidate interval measure pattern/setup availability, forward-EXCESS-return edge (de-meaned vs the cross-sectional universe), regime-read STABILITY (flip-rate), and bars-per-intended-hold. xStock chose 15-min over 60-min on structure + stability + ORB-revival (edge was weak at every interval — the choice is rarely made on edge). The CRYPTO study said NO change (trend setups were marginally BETTER at COARSER bars — opposite of "switch finer"; never generalize one class's answer). The full blast-radius + the realized recalibration method (replay-driven, percentile-preserving, regime-label parity exit gate) is `R-BARFREQ`. *Key watch-outs:* changing the interval silently shortens every bar-COUNT lookback's wall-clock window; VN is bar-invariant but DI CONTRACTS toward 50 (so IMF needs a DIFFERENT recalibration shape than regime); the EXIT GATE is a regime-label PARITY report (max mix |Δ| ≤ ~1.3pp) judged clean-old → clean-new; deploy is an ATOMIC ACTIVATION at restart (you cannot let old code read new-interval thresholds); a parked equity-native strategy (ORB) can be UNLOCKED by a finer interval, but "unlocked" ≠ "activated" (plumb it ready, leave `enable=false` until edge-validated — RUNNING_ISSUES #203). [B.4, crypto study]

**Step 7.6 — Run the MANDATORY 3-sub-cycle calibration cycle before "production-ready."** (1) Regime-classifier calibration (replay archived bars through the production classifier; validate-and-document if in-envelope; tuning needs out-of-envelope signal OR trade-outcome evidence = a LATER phase; query the INTERSECTION of joined sources first — overlap is narrower than modeled). (2) Filter-threshold reality check. (3) Strategy-gate testing (every DB-enabled strategy fires ≥1, or its dormancy has a documented gating reason). Exit criteria + the per-sub-cycle anti-patterns are in `R-CALCYCLE`. **Calibration moves forward ONLY after the diagnostics UI shows TRUSTWORTHY numbers** — you cannot calibrate against a panel you don't trust. *Watch for:* filter generosity ≠ signal generosity (lenient gates admit pairs; strategies still null on absent geometry — 99.8% detect-nulls were calibration territory, not a bug; give EVERY silent-skip a counter + null reason before concluding); a multiplicative confidence formula compresses toward its floor BY DESIGN (not a bug — but a factor capped at mom≥1% while p95 mom=6% IS a real Phase-25 input). Once the 3 sub-cycles pass, the class moves to Layer-3 live VTS observation, whose promotion gate + per-class observation-period sizing are in `R-LAYERS`. [B.1, Diagnostics-Tab]

**Step 7.7 — Extend DBS to the new class: math byte-identical first.** Equity-style classes aggregate the market-wide directional signal RESPECTING SECTOR boundaries (index proxies SPY/QQQ get per-pair scores but are EXCLUDED from the aggregate). The two-singleton store takes a constructor-option DISCRIMINATOR `{mode, assetClassForKnobs}`, NOT a partition-key. High-judgment data (the 265-entry GICS map) needs a companion reference doc + an independent spot-check pause BEFORE commit (TS catches MISSING entries, not WRONG ones — make the field REQUIRED). Cold-start: the scanner short-circuits during the weekend (universe=0) → schedule a system-alert ~5 min post-open as the live gate; backfill offline via idempotent `ON CONFLICT DO NOTHING`. [B-PHASE-A2]

**Step 7.8 — Capture data for future calibration with discipline.** Tag every trade with `calibration_state` (pre/post), a DB fast-default back-stamp, and forward-propagation through the close-writer. *Watch for:* "the obvious key isn't the join key" — the replay writer's `tradeId` is RECONSTRUCTED (symbol+exit-time) ≠ the open id (which survives as `originalSignalId`); a `WHERE id=tradeId` sub-select matches ZERO rows. (This was the trigger for the B-NEW-53 decision-provenance capture — when a backward-replay can't reach ≥99% parity because the forming bar / stop-anchor was never persisted, the fix is FORWARD capture, not chasing the replay.) [F-NOW, B-NEW-53]

**Step 7.9 — A scoped filter on a SHARED aggregator silently changes the live UI.** One aggregator can feed a live UI panel AND a future eval path; an unconditional scoped filter EMPTIES the live panel (every existing xStock trade was pre-calibration → an unconditional pre-calibration exclusion would have emptied the live xStocks ablation panel). **Make it OPT-IN (default-off, applied only by the eval caller); enumerate EVERY consumer of a shared surface — including BOTH the `/api/analytics/*` and `/api/xstocks/*` siblings — and state each one's post-change behavior BEFORE writing code; presume a shared aggregator feeds a live UI until proven otherwise.** Recipe in `R-SHARED`. [F-NOW, B.2.UI]

**Step 7.10 — Don't build gates/code that can't FIRE (NO PATCHES).** A depth-cap that can't bind (per-trade <1% of median depth) or a filter with no caller is dead code — build the mechanism, gate it at its real future consumer, and declare the inert state in BOLD (CLAUDE.md §9.1). [B.1.5, F-NOW]

### Phase 8 — Verification + forward-watch

**Step 8.1 — Run the no-touch fence on the incumbent class on EVERY sub-batch — the universal safety gate.** Verify the incumbent's `regime_factor_alternates` emission/factor stays within ±10% (≥80% floor) of the pre-deploy baseline. Pattern:
```sql
SELECT factor_name, COUNT(*) FROM regime_factor_alternates
WHERE asset_class = 'crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name;
```
Value-identical promotions (in-code default → DB row at the SAME value) are WITHIN the fence. [every batch]

**Step 8.2 — Hostile-sim the failure paths before deploy.** Boot-fail: delete a required row → confirm the crash loop NAMES the missing row + the fix migration; restore → clean boot. Backpressure: drive cycles to ~28 s under the 30 s tick → confirm BOTH cycles keep emitting AND `[BACKPRESSURE_OBSERVED]` fires. Staging runs `NODE_ENV=production` → use the double-flag escape (`BACKPRESSURE_TEST_MODE=1` + `HOSTILE_SIM_OVERRIDE=1`). Backpressure is NEVER asset-class shedding (standing invariant #3) — the load test is a SHIP-vs-scale sizing gate run BEFORE deploy. [B79.TEC, B79.0a]

**Step 8.3 — Grep the PM2 ERROR log for accumulated noise on any batch touching a shared utility/detector/boot path.** 64,494 `setNullReason is not defined` errors sat silent for months inside catch-blocks (stderr-only). Add a boot-time round-trip smoke test (set→get→assert-literal→reset, `process.exit(1)` on failure) + an import-hygiene test for heavily-imported shared helpers. **Step-7 first-pass verification MUST include a PM2-log spot-check, not just HTTP 200** (the CONFIDENCE-CHAIN esbuild `Dynamic require of "path"` bug hid inside a try/catch). [HYGIENE, CONFIDENCE-CHAIN]

**Step 8.4 — Use the right verification surface for the change type, and verify per-class knobs against the LIVE DB, not code comments.** UI changes → live Claude-in-Chrome (CLAUDE.md §9.3); backend-only → a runtime-LOG proof; per-class behavioral knobs → the live DB (BE-protect/trailing were deliberately TRUE for xStock; comments saying "starts false" were aspirational). Re-measure before accepting a perf-cost claim (a `max_bid_ask_spread` revert was driven by a 130× claim that was a measurement artifact — a fresh test showed 40–43 ms either way). Endpoint query shape matters at universe scale (a freshness endpoint went 13,794 ms → 88 ms via `unnest+LATERAL`; a `COUNT(DISTINCT date_trunc(...))` over millions hit a 60 s timeout → in-memory reads in 0.94 s). [Diagnostics-Tab, B79.0m.b2]

**Step 8.5 — For a market-hours class, verify cold-start via a scheduled system-alert.** You cannot live-verify during a weekend close → schedule an alert ~5 min post-open as the gate; verify offline meanwhile. A dormant-runtime caveat is acceptable when emission depends on system-state CC can't manufacture (no active trading, empty `paper_sim_trades`): build-parity = the deploy gate, runtime = the steady-state gate, and you defer runtime witnesses to wire-in with a scheduled alert. The per-class observation-period sizing that this cold-start window opens — how many days/samples accrue before the Layer-3 gate can be judged (≥150 samples/regime/bucket, ≥ one full weekly cycle, the 24/5≈80hr vs 24/7=168hr wall-clock math) — is in `R-LAYERS`. [B-PHASE-A2, SCORING, TEC, TELEMETRY, EXECUTION]

**Step 8.6 — Add a per-class diagnostic endpoint as the Step-8 verify-gate target.** `/api/diagnostics/<batch>-per-class-state` (no-auth public, ~40 LOC, mechanical `curl`), returning the dispatcher's output for all active classes. v1→v2 keeps the URL when callers are zero; carry an inline `_meta.knownGaps` registry + always-bump `_meta.lastReviewed`; anchor gap entries by function-NAME, not line numbers. Registry-closure discipline in `R-GAPREG`. [ORCHESTRATOR, EXECUTION]

### Phase 9 — Cross-cutting engineering disciplines (apply throughout, not a final phase)

These are not sequential steps — they apply to every batch in every phase above. They live here so the sequence above stays readable.

**Step 9.1 — The production ESM bundle is a verification surface CI does NOT cover.** Two failure modes, both pass tsc + vitest + CI Build + Docker and THEN crash-loop at boot: (a) module-init ORDERING — a new import shifts esbuild's topological order so a consumer reads a hand-authored canonical JSON while it is still partial (B.1.5 `No canonical regime-strategy map for 'crypto_spot'` even though nothing touched the map); (b) a NAMED import of a CJS-only dep (`import { parseExpression } from 'cron-parser'`) is unresolvable under `--format=esm` (B-NEW-50, ~3-min outage). **Default-import CJS deps + destructure; validate against Node's ESM loader with a 5-line `.mjs` before deploy; add a production-bundle boot smoke; never inline `require()` in esbuild-shipped code.** Full rule in `R-ESM`. [B.1.5, B-NEW-50, CONFIDENCE-CHAIN]

**Step 9.2 — Audit the producer-consumer contract for every canonical artifact the batch's code reads at runtime** (`bridge/canonical/*.json`, generated configs, schema-gen types) — even when the batch doesn't touch the producer or consumer. A hand-edited canonical JSON masks generator drift; a bundler module-init shift then promotes the latent drift to a deploy crash. Verify producer + consumer agree on shape, or add a CI contract test (the lighter, durable option). Template in `R-CONTRACT`. [B.1.5]

**Step 9.3 — Migration mechanics (the recurring foot-guns).** Never `INSERT INTO _migrations` from a file (the runner auto-inserts; the column is `name`). Validate assembled SQL with `psql -f <mig> -1` against an empty schema (duplicate statements fail in tx order). Use `const result: any = await db.execute(...)`, not `db.execute<T>()` (TS2344). Register EVERY migration in `drizzle/migrations/MANIFEST.txt` in the SAME commit (CI-only catch; rollback companions stay OUT; `git add -f` past the `*.sql` gitignore). Put `import 'dotenv/config'` at the top of every standalone CLI that imports `server/db.ts` (this bit THREE separate batches). `CREATE INDEX CONCURRENTLY` cannot run in BEGIN/COMMIT. Close drizzle schema-TS drift the moment a hotfix bypasses drizzle-kit. The 4-phase production-safe ADD-COLUMN pattern (for a column added to a hot-written table) is `R-ADDCOL`. [UNIVERSE-DISCOVERY, STRATEGY, RTB, CONFIDENCE-CHAIN, B79.0m.a]

**Step 9.4 — Verify the deployed SHA — commit+push ≠ deployed.** CI-green does not propagate to staging; after the Step-6 `git pull`, verify staging HEAD == the intended commit; if a follow-up lands between Step 6 and Step 8, re-deploy + re-verify; cite the actual SHA CHAIN in the completion report. The CI initial-schema pg_dump can diverge from accumulated staging — include idempotent `ON CONFLICT DO NOTHING` backfill blocks so CI's fresh-DB baseline matches staging (and count ALL per-class rows in the verification assertion, not just `updated_by`-stamped, so the backfill block doesn't trip it on staging). [SCORING, TEC]

**Step 9.5 — A table/namespace rename cascades far wider than the parent tables.** `equity_*`→`xstock_*` touched 172 objects (4 parents + 52 partition children + 4+108 indexes + 4 `module_constants` retention-key STRINGS that embed the old name and break the retention sweep). Drizzle parents don't auto-rename children. `ALTER RENAME` is metadata-only sub-second; choose fail-loud over a compat view; make the rollback symmetric (Langston caught an omitted reverse-sweep). [B79.0e]

**Step 9.6 — Run the dead-code "awakens / lingers" check + a consumer-grep before any file deletion.** A REQUIRED-assetClass refactor leaves orphan code + orphan DB rows + orphan prefetch entries (MCE's dead `cost-metrics` chain — the file was NOT deletable because of 6+ live consumers; back "delete whole file" with a grep). Light dead code → flag to RUNNING_ISSUES #136 (Phase-16 legacy register), don't fix mid-batch. BUT a placeholder-clone DB value that becomes a live param (xStock `pattern_max_position_pct=0.50` = 3.3× crypto) is a HARD pre-condition gate for the active-trading flip (#153), not deferrable. [MCE, PATTERN-DETECT, ORCHESTRATOR]

**Step 9.7 — Test discipline.** Use key-aware DB mocks (differentiate returns by `_KEY.assetClass`) to catch the DANGEROUS "wrong-value-threaded-correctly" class that presence-assertions miss. Run the local tsc+vitest gate BEFORE the Step-4 change-list (fix in Step 3, not Step 9). Source-file regex regression-lock tests (`readFileSync`) give fast coverage without DB fixtures (weaker than functional — pair with integration). Prefer RANGE-based drift guards (`>=MIN && <=MAX`) over exact-equality (a `size===265` test broke on every universe change). Use the captured-queue mock when you need both call-capture AND per-call return control (`mockImplementationOnce` bypasses a default-mock's `.push` capture). [ORCHESTRATOR, RTB, HYGIENE, B79.0b, B79.0g-tx]

**Step 9.8 — Process patterns.** Combine adjacent sub-batches when surface overlap is total (RTB #11+#12); skip a sub-batch that builds unused infra (POOL — a 489-pair universe has no M:N selection problem); use the LOCKED-module override protocol (`R-LOCKED`) for any touch of a fenced module; land EVERYTHING that ships in the reviewed HEAD before Step 5 (no "CC will handle X pre-deploy" footnotes); a Step-6 trivial hotfix rebases on the reviewed HEAD (non-trivial → abort + new Step-4); pick implementation order B→A→C (SSOT cleanup before the emit site); do the Step-1.a architectural read (SIM + System Manual, not grep/memory) UPFRONT — the after-Kyle-pushback read consistently found undercounts (RTB 1→4 files, 7→25 callers). [RTB, ORCHESTRATOR, EXECUTION]

**Step 9.9 — Comms/governance honesty.** The §6 governance-files-changed list must reflect what was ACTUALLY committed (Kyle caught PATTERN-DETECT claiming 5 unedited files). Use the §9.1 SCAFFOLDING-VS-FUNCTIONAL bold banner + the §9.2 PREVIOUSLY/NOW/REASON block for any changed number. State red-on-red CI baselines explicitly. The file-first + embedded-diff + verification-anchor Langston dispatch (no-gdrive at the TOP, `bypassPermissions`) returns clean ACKs vs the 30–49-min FUSE hangs; the independent Step-2 pre-audit + Step-4 review caught the highest-value bugs — treat review as non-negotiable (standing invariant #9). [PATTERN-DETECT, B79.0m.a, all]

**Step 9.10 — Every in-process scheduled task needs an audit row + a poll-reconcile safety net + a system-alert on catch-up.** node-cron / setInterval / setTimeout can silently fail to invoke a callback with no exception and no log line (a Fri 8PM-ET weekend-shutdown cron did exactly this). Write an audit row on every fire (success OR error) with a `trigger_source` discriminator; ride an independent tick (centralClock / boot-reconcile) that detects state drift and catches up; fire a `severity=warning, category=breakage` system-alert when the net catches a missed fire so it surfaces via the §10.5 per-turn check. When one timer is found to have failed, audit every OTHER timer using the same library. Full rule in `R-SCHEDTASK`. [B-NEW-36, B-NEW-49]

---

## Part 2 — Reference library (the HOW for Part-1 steps)

Each entry has a semantic ID (no numbers, so no collisions). Part-1 steps point here by ID. These are the durable templates; the per-batch completion reports named at the end of each entry carry the commit-level detail.

### R-PROFILE — Operational profile table (used by Step 0.1)

Populate BEFORE anything else; downstream architecture keys off these facts.

| Field | What to capture |
|---|---|
| Trading hours | 24/7? 24/5? Session-bound (RTH only)? Weekend gap? Pre/post-market? |
| Settlement | Centralized book? On-chain? Custodial broker? T+0 / T+1 / T+2? |
| Geography / regulatory | Restricted jurisdictions? KYC? Sanctioned-country considerations? |
| Fees (maker/taker) | Volume tiers? Stablecoin discounts? |
| Custody | Self-custody? Exchange-custody only? On-chain wallet for withdrawal? |
| Exchange WS endpoint | Path + protocol version + heartbeat cadence + reconnect semantics |
| Exchange REST endpoint | Path + auth model + rate limits (or "none for this class") |
| Symbol form on each endpoint | Canonical / display / WS-feed forms — are they identical? |
| Universe size + dynamism | Static? Growing? Frequent listings/delistings? |
| Tick / lot / fractional | Price + quantity precision. Minimum order size. |
| **Monolithic?** | Are all symbols operationally identical, or are some treated differently (24/7 inside a 24/5 class, halt-able, pre/post-market)? If non-monolithic, market-state predicates take a REQUIRED symbol arg from Day 1. |

`xstock_spot` filled instance: see Part 3, H.1.A.

### R-RESOLVE — `resolveAssetClass` extension template (used by Step 3.11, Step 4.7)

```ts
// shared/asset-classes.ts
// Branch order matters: exchange-first → display-form → collision-gate → membership → patterns
if (exchange === '<new-exchange-tag>') return ASSET_CLASSES.<NEW_CLASS>;
if (<NEW_CLASS>_DISPLAY.test(symbol)) return ASSET_CLASSES.<NEW_CLASS>;
if (<NEW_CLASS>_<EXISTING>_COLLISIONS.has(symbol)) {
  console.warn(`[<batch>][COLLISION_RESOLVE] ${symbol} on plain exchange path → incumbent`);
  return ASSET_CLASSES.<EXISTING>;          // collision without disambiguation → incumbent
}
if (<NEW_CLASS>_SYMBOLS.has(symbol)) return ASSET_CLASSES.<NEW_CLASS>;
// fall through to existing class patterns
```
Use `safeResolveAssetClass(symbol, exchange)` (returns null + WARN) at capture sites that may hit unregistered symbols; the strict `resolveAssetClass` throws.

### R-COLLISION — Ticker-collision recipe (used by Step 0.2, Step 4.7)

Mandatory pre-implementation gate when the new class shares an exchange with an existing one. A single base-symbol can exist in BOTH universes with identical canonical form (`SUI/USD` = Sun Communities equity AND Sui Network crypto on Kraken); without a gate, any downstream consumer that re-resolves from canonical form misclassifies every signal on the collision tickers.

1. **Discover the collision set at scope time** — live API intersection:
   ```python
   existing_class_bases = {<every base the existing class trades on this exchange>}
   new_class_bases      = {<every base the new class trades on this exchange>}
   collisions = sorted(existing_class_bases & new_class_bases)
   ```
   Store in `shared/asset-classes.ts` as `<NEW>_<EXISTING>_COLLISIONS` with a provenance comment: endpoint queried (e.g. `https://api.kraken.com/0/public/AssetPairs`), date run, re-audit cadence (default quarterly).
2. **Gate the resolver** — the new class's membership fast-path is gated on collision-set NON-membership (see `R-RESOLVE`). Collision tickers reach the new class only via a different `exchange` value or an explicit disambiguating display form.
3. **WARN on collision-without-disambiguation** — `[<batch>][COLLISION_RESOLVE]` once per occurrence, so any future loss of the disambiguating suffix in transit is observable.
4. **Regression-lock tests** — one per collision ticker, pinning the resolved class; fail if a future commit drops the gate.
5. **Backfill historical mis-tags IF the bug ever shipped** — read-only audit script over every `asset_class` table, UPDATE statements commented out, per-table counts paper-trailed in CHANGES_AND_FIXES (xStock flipped 4862 rows).

**Standing rule:** quarterly re-audit — re-run the intersection when the provenance date is >90 days old (a symbol becomes a collision the moment either side lists a new pair). Worked origin: `B79_0f_COMPLETION_REPORT.md` (the SUI/USD bug).

### R-DISCOVERY — Dynamic universe discovery (used by Step 0.3, Steps 1.1–1.10)

Three-service chain (role separation is the whole point):

| Role | Answers | xstock_spot | Generalization |
|---|---|---|---|
| **Prime mover** | "what instruments exist in this family?" (cheap, public, by-issuer) | CoinGecko `xstocks-ecosystem` (126, no key) | crypto-perp: Kraken Futures REST `/derivatives/api/v3/instruments` |
| **Ground truth** | "does the exchange stream/trade this right now?" (binary) | Kraken WS subscribe probe `wss://ws-equities.kraken.com` (chunk 100 + 500 ms sleep + 15 s window + 10 s open-timeout) | the exchange's accept/reject mechanism (REST `info`, WS subscribe) |
| **Enrichment** | per-symbol metadata (does NOT decide existence) | Finnhub `/stock/profile2` sector (~75 substring patterns / 11 GICS sectors + 3 special + UNCATEGORIZED) | funding/mark-price metadata, etc. |

5-layer boot fallback: live discovery → DB snapshot `initializeFromDB()` → file cache (`${HOME}/.dawntrader-cache/<class>-universe-cache.json`, HOME-relative per RUNNING_ISSUES #126) → ~20-symbol hand-curated bootstrap (`server/asset_classes/<class>/universe-bootstrap.ts`) → `process.exit(1)`.

3-table schema: `<class>_universe` (PK symbol; sector VARCHAR+CHECK not ENUM; `is_delisted BOOLEAN`; `last_seen_at`/`first_seen_at`; flags; `source_chain JSONB`) + `<class>_universe_overrides` (PK symbol; `override_*` cols; applied AFTER source-chain so curator decisions survive) + `discovery_runs` (BIGSERIAL run_id; `triggered_by` CHECK cron_daily/manual_endpoint/boot_smoke; counts; `source_chain_status JSONB`; `error_log`; indexed by `started_at`).

Lifecycle: re-discovery un-delists (`ON CONFLICT (symbol) DO UPDATE SET … is_delisted=false`); >7d since `last_seen_at` → `[STALE_SYMBOL]` log; >30d → `is_delisted=true`. **Anchor on `last_seen_at` (data arrival), not WS-accept.**

Per-leg mandatory rules: explicit timeout + deterministic partial-response abort on every WS/REST call (WS-open 10 s + collection 15 s; on fire → `partial=true` audit row, NO DB writes); parameterized regression-lock tests on every classification heuristic (specific-before-general ordering; biotech-vs-technology was the obvious collision, gas-vs-utility the next likely) + a post-cycle UNCATEGORIZED-≤20% gate; `const result: any = await db.execute(...)` (not `db.execute<T>()` — TS2344); components under `server/asset_classes/<class>/` bound by LOCATION not an optional param; range-form test asserts (`size >= MIN && size <= MAX` with growth headroom). Two API routes (`POST …/refresh`, `GET …/health`) + daily node-cron `0 6 * * *` in try/catch + the `R-SCHEDTASK` audit-row safety net. Worked origin: `B79_0n_UNIVERSE_DISCOVERY_COMPLETION_REPORT.md` (full code paths + 10-section retrospective).

### R-STORAGE — REQUIRED-`assetClass` on storage/data-access APIs (used by Steps 3.1, 3.2, 3.8)

```ts
// BAD — optional + defaulted = silent footgun
getScreenerFilters(p: { mode: 'live'|'paper'; filterPath?: string; assetClass?: string }): Promise<ScreenerFilters|null>;
// GOOD — REQUIRED, TS compile-error if omitted
getScreenerFilters(p: { mode: 'live'|'paper'; assetClass: AssetClass; filterPath?: string }): Promise<ScreenerFilters|null>;
```
Composes with three elements:
1. A **dedicated canonical-baseline helper** for UI/diagnostic display where the intent is genuinely "show the crypto baseline": `getCanonicalScreenerConfig({mode, filterPath?})` → calls `getScreenerFilters({..., assetClass:'crypto_spot'})` with a banner-style **"NEVER use this for runtime routing"** docstring. The uppercase NEVER caught 3 misclassified runtime sites at Langston's Step-4 review.
2. **Cache-key extension** `cache.set(`${mode}:${assetClass}`, value)` (O(k)), with a cache-isolation regression test (warm `paper:crypto_spot`, read `paper:xstock_spot`, assert distinct storage calls).
3. **`@ts-expect-error` regression-lock test** so re-introducing the optional shape turns the directive "unused" and breaks CI.

Why load-bearing: pre-audit grep undercounts ~20% (32→38 sites — treat grep as a LOWER bound; the compiler finds the rest); same-batch migrations + WHERE clauses must be co-audited (a seed creating 2 rows per `(mode, filter_path)` against a `(mode, filterPath)`-only UPDATE WHERE silently cross-corrupts). Worked origin: `B79_0n_STORAGE_COMPLETION_REPORT.md` §10 (deploy `ab3153ce5`).

### R-MCE — REQUIRED-`assetClass` on compute/math + fail-hard switch + wildcard-retirement (used by Steps 3.1, 3.4, 2.8)

**Fail-hard exhaustive switch** (not a warn-once-fallback):
```ts
function getFrictionForAssetClass(assetClass: AssetClass): FrictionModel {
  switch (assetClass) {
    case 'crypto_spot': return CRYPTO_SPOT_FRICTION;
    case 'xstock_spot': return XSTOCK_SPOT_FRICTION;
    case 'crypto_perp':
    case 'xstock_perp':
      throw new Error(`[cost-model] assetClass='${assetClass}' has no friction model wired — file RUNNING_ISSUES + add to scope`);
    default: {
      const _exhaustive: never = assetClass;   // compile-fails if AssetClass gains a value
      throw new Error(`[cost-model] unreachable assetClass=${String(_exhaustive)}`);
    }
  }
}
```
Buys: a compile-time tripwire (`never`) when the union grows + a forcing-function throw when an unwired class is consumed.

**Cache-key extension at compute singletons** `${symbol}` → `${symbol}:${assetClass}` — but a subsystem can own MULTIPLE cache layers (MCE owns 3: per-symbol context, module-constants rowset, 9-group config refresh) — extend the RIGHT one and document the inventory.

**Wildcard-retirement migration** (a wildcard `(*,*,*,*)` row consumed by an asset-class-aware caller is a silent-fallback footgun; fix at the DATA layer, never the resolver): (1) add explicit `crypto_spot` row cloning the wildcard byte-for-byte; (2) add explicit new-class row; (3) retire via an **EXISTS-gated DELETE** that fires only after both class rows exist (no orphan window). Wrap in one `BEGIN/COMMIT`; `ON CONFLICT DO NOTHING`; scope every WHERE to the exact `constant_name` (so a sibling constant under the same module isn't collaterally retired); ship a manual-only `*-rollback.sql`; ship resolver-tightening + migration in the SAME commit. For a high-blast lever use the two-step `R-WILDCARD`. Net row delta for a single-constant retirement is +1.

Watch: grep false-positives on `assetClass: <var>` (already-correct per-class sites read like candidates — open the file); dead inline chains awaken latent bugs (the orphan `cost-metrics` chain + its stale `module_constants` row + stale prefetch entry). Worked origin: `B79_0n_MCE_COMPLETION_REPORT.md` §10 (deploy `aa0564107`); SYSTEM_MANUAL Configuration Surface appendix (wildcard-retirement + the MCE 3-cache model).

### R-PATTERN — Pattern-recognition REQUIRED-`assetClass` + naming-convergence + capture-and-reuse (used by Steps 2.5, 3.1, 3.6)

**REQUIRED-`assetClass` plumbing:** every entry point gains `assetClass: AssetClass` — the fan-out (`scanPatterns(candles, symbol, assetClass)`), every internal detect (`detectPinbar`/`detectEngulfing`/…), the converter (`patternToTradeSignal(..., assetClass)`), the singleton wrapper, the picker (`selectContextAwareStrategy(..., assetClass)`). **Body branching is NOT introduced by the plumbing batch** — all hardcoded thresholds stay byte-identical; per-class numeric tuning is a later evidence-gated batch. **F-1 invariance lock-down:** the taxonomy map (`PATTERN_TO_CANONICAL`) + the canonical types enum MUST NOT gain `assetClass` (a PINBAR is a PINBAR) — lock with an F-1 invariance regression test. Note: replace any local `export type AssetClass='crypto_spot'` with the shared import (it silently narrows the union); TS1016 means re-order a required-after-optional param to required-but-nullable.

**Naming-convergence** (Step 2.5): if you see `pattern_pool_gates.crypto_spot.pattern_final_score_min` AND `pattern_pool_gates.xstock_spot.final_score_floor` (same semantic, different name), that's F-2 drift onto the `constant_name` column. Forward-converge: idempotent UPDATE renaming the divergent name to the canonical one (WHERE fully scoped: module+exchange+asset_class+strategy+regime+constant_name); update the consumer's `getCachedNumberRequired(...)` keys; grep-before-rename to confirm zero current DB-string-literal readers; a test asserting the getter calls the converged key.

**Capture-and-reuse** (Step 3.6): resolve ONCE at function/loop entry into `_assetClass = safeResolveAssetClass(symbol,'kraken')`, skip-on-null, reuse downstream:
```ts
const _assetClass = safeResolveAssetClass(symbol, 'kraken');
if (_assetClass === null) return null;       // graceful skip; no throw
const mceContext = mce.computeContext(symbol, ohlc, ..., _assetClass);
const patterns   = scanPatterns(candles, symbol, _assetClass);
```
Why: the strict resolver throws on unregistered symbols (N call sites = N throw points) and WARNs once per call on collision symbols (N sites = N WARNs); capture-and-reuse collapses both to 1 per function-entry and gives the future per-class branch a single injection point. The smell: 3+ identical `resolveAssetClass(symbol, exchange)` calls in one body. Worked origin: `B79_0n_PATTERN_DETECT_COMPLETION_REPORT.md` (deploy `c0479b2`); the Step-9 H/USD throw narrative consolidated 6 throwing sites → 2 capture calls (remaining ~10 elsewhere in vts-runner filed as RUNNING_ISSUES #139).

### R-CHAIN — Confidence-modulator chain per-class plumbing (used by Steps 6.6, 3.1)

The largest single per-class threading surface (~50 caller sites, 9 modulator modules, 16 chain-composition push sites, 2 trade-close hooks). Four sub-patterns:
- **A — per-class DB seed.** Each modulator module gets `asset_class=<new-class>` rows. For a behavioral no-op (crypto-native inputs meaningless for an equity-style class), add an explicit flag (`b67_1_asset_class_no_op_active`) checked at the top of the compute; seed wildcard `flag=false` + new-class `flag=true`. (F-1 modulators just clone crypto values.)
- **B — function signatures REQUIRED-`assetClass`.** Every `compute<Modulator>` + `build<Modulator>Alternate` gains `assetClass: AssetClass` (used for short-circuit OR metadata-stamping into `metadata.asset_class`). F-1 modulators thread it for uniformity even when math is class-invariant.
- **C — MCE per-class refresh + accessor.** For F-2 modulators, refresh enumerates `ASSET_CLASSES` → builds a per-class `Map<AssetClass, Config>` → atomic single-assignment swap; field type `ReadonlyMap` so in-place mutation is a TS error; new `get<Modulator>ConfigForClass(assetClass)` returns null on cold-start/missing; legacy `getCurrent<Modulator>Config()` stays returning crypto_spot for back-compat.
- **D — chain-composition consumer threading.** At every `alternateInputs.push({...})` site (~8/file × 2 files), thread the captured `_pairAssetClass` into the discriminated-union arm's `assetClass: AssetClass` field; the `FactorAlternateInput` exhaustiveness check enforces it.

**Trade-close hook special case (silent-corruption risk):** the close-hook writes `outcomeFeedbackStore.updateEma(assetClass, regime, strategy, ...)` where `assetClass` MUST resolve from `position.symbol` via **safeResolveAssetClass + skip-on-null** (NOT the strict throw — close-hooks are non-critical-path). Miss it and crypto outcomes write correctly but xStock outcomes write to the GLOBAL crypto key — silent corruption with no compile or runtime error. The `OutcomeFeedbackStore` key shape changes `<regime>_<strategy>` → `<assetClass>_<regime>_<strategy>`; the persistent-state path moves out of `/tmp/` (purged on restart) into `/home/deploy/dawntrader/data/` with **HARD-FAIL on corrupt new-path data** (no silent fallback to legacy `/tmp/`). Worked origin: `B79_0n_CONFIDENCE_CHAIN_COMPLETION_REPORT.md` (deploy `b6e45a8`); SYSTEM_MANUAL per-modulator F-1/F-2 disposition matrix.

### R-WRITER — Writer/reader asset-class threading audit (used by Step 4.9)

Run at pre-audit on every onboarding: `grep -rn "asset_class" server/services/ server/scripts/ server/tests/ shared/`. For every hit verify:
1. **Schema** — column exists NOT NULL.
2. **Writer (INSERT/UPDATE)** — value comes from a typed REQUIRED parameter, NOT a hardcoded literal or `?? 'crypto_spot'`. Refactor to caller-resolves so TS compile-fails any caller that forgets.
3. **Reader (SELECT in WHERE/GROUP BY)** — function accepts `assetClass`, or is implicitly crypto-only (every panel/aggregate then breaks silently when the new class arrives).
4. **Downstream consumer (ML pipeline, digest, export)** — any implicit `WHERE asset_class='crypto_spot'` that would silently exclude the new class?

Writer recipe: `function emitWriter(..., assetClass: AssetClass)` (REQUIRED, no default). Reader recipe (legitimately wants an "all" default): `function computeAggregate(window, assetClass: AssetClass | null = null)` — null = no filter = all classes; never a hardcoded primary-class default. Document the inventory in `BATCH_N_PRE_AUDIT.md` §"Writer/reader asset-class enumeration." This collapses the 5 reactive crypto-first incidents (B-NEW-20/22/25/26/28) into one proactive grep. Related: when renaming a for-loop variable inside a shared-engine file, TS does NOT enforce block-scope visibility — a same-named outer identifier silently resolves and throws `ReferenceError` only when the loop body runs; audit the loop body before committing (the B83 24-h silent pipeline stall).

### R-SCANNER — 12 crypto-parity scanner defenses (used by Step 4.3)

Every dedicated scanner implements all 12 from day one (missing any → "scanner wedges, UI shows zeros, every cycle times out"):
1. **Cycle-scoped config cache** — load all 7 `screener_filters` rows (1 global + 1 pattern + 5 family) ONCE at the top of `runCycle`; pass as a bundle. NEVER `storage.getScreenerFilters` inside the per-pair loop (the N+1 that saturates the pool). Ref `fx5-scanner.ts:737-815`; xstock `eval-cycle.ts:loadXstockFilterConfigs`.
2. **`SCAN_TIMEOUT_MS` + `Promise.race`** — timeout strictly < scan interval (25 s for a 30 s tick); on timeout force-reset `isScanning=false` in `.catch`. Without it, one slow cycle wedges the scanner forever.
3. **Pair-batch rotation when universe > budget** — fixed batch (75), `rotationCursor` advances over cycles; ALWAYS pin index benchmarks every cycle.
4. **Pinned-benchmark sanity** — verify each pinned symbol exists in the universe (xStock pinned IWM/DIA which aren't tokenized → silently filtered out).
5. **Constant-name canonicalization** — grep code + DB for the canonical `constant_name` before writing any `getCachedNumberRequired` call (a `di_to_pwin_scaling_factor` typo vs `di_pwin_factor` cost hours of log spam).
6. **Bid/ask spread filter source** — separate small batched query keyed by symbol AFTER the freshness gate (adding bid/ask to the main snap SELECT blew the query plan 130×); see `R-SCANREAD`.
7. **OHLC pre-warm batched OR per-symbol TTL** — pre-warm `SELECT … WHERE symbol=ANY([survivors])` (own DB) or `OHLCCache` Map+TTL (rate-limited external; TTL < candle close interval). Never per-pair sequential reads inside the loop.
8. **NO silent fallbacks** — batched query failure hard-fails loud; never fall back to per-symbol (re-introduces N+1). Add a test that breaks if a fallback path appears.
9. **Symbol-normalization consistency** — byte-identical key format across archiver writes → snap rows → OHLC rows → cache keys → eval comparisons → detect calls (log a symbol's hex bytes at each boundary to confirm).
10. **Connection-pool sizing for worst case** — count queries per cycle × concurrent scanners; verify pool size > peak (xStock saw `pool slot timeout (5s)` under N+1 + heavy ticker writes).
11. **Central-clock subscription, gate on `tick.tickNumber % SCAN_INTERVAL === 0`** — never an independent `setInterval`.
12. **`isScanning` early-return** — set true before `runCycle`, reset in `finally`; every tick handler `if (this.isScanning) return;`.

### R-SCANREAD — Scan-cycle read-side data-completeness audit (used by Step 4.3 #6, Step 4.5)

The snap table is populated by a background job capturing EVERY field the exchange returns; the scan's read query only SELECTs the subset the first scanner iteration needed. A later-added threshold whose source column isn't in the SELECT silently no-ops while the DB row misleads anyone reading it. Mandatory check: (1) list every column in the snap table; (2) list every `screener_filters` threshold for the class with a non-null/non-zero value; (3) map each threshold to the column it needs; (4) verify the scan SELECT reads every such column; (5) add any missing column BEFORE shipping the filter (cost ≈ zero — empirically 40–43 ms whether bid/ask is included or not on 25–75-symbol IN-clauses). Standing rule: "every DB threshold must have its source column read by the scan SELECT; a threshold without a matching column read is a silent no-op gate — forbidden." Mirror semantically for live-ticker feed sources. Origin: B-NEW-14 (`max_bid_ask_spread` inert ~3 days).

### R-INSTANCE — Per-class instance factory + non-arming peek + Variant C (used by Steps 3.4, 5.1, 5.2)

**Shape 1 — factory dispatch with `assertNever`** (`server/services/asset-class-instances.ts`):
```ts
import { assertNever } from '@shared/assert-never';
let _xstockSpotInstance: TelemetryAggregatorService | null = null;   // module-level lazy cache per active class
export function getTelemetryAggregatorInstance(assetClass: AssetClass): TelemetryAggregatorService | null {
  switch (assetClass) {
    case 'crypto_spot': return null;                       // no-touch fence → caller falls back to the global singleton
    case 'xstock_spot':
      if (!_xstockSpotInstance) _xstockSpotInstance = bootstrapXstockSpotTelemetry();
      return _xstockSpotInstance;
    case 'crypto_perp': case 'xstock_perp':
    case 'forex_spot':  case 'forex_perp': case 'equity_spot': case 'equity_perp':
      throw new Error(`[CLASS_NOT_WIRED] assetClass=${assetClass}`);   // valid-future enum, onboarding work required
    default: return assertNever(assetClass);               // compile-fails if a class is added without a case
  }
}
```
Rules: the switch is ALWAYS terminated by `assertNever` even when every arm returns/throws; reserved-future classes get explicit `[CLASS_NOT_WIRED]` (distinct from `[CLASS_INVALID]`); the canonical class (18mo+ live disk-persist state at the global singleton) flows through the **no-touch fence** (factory returns null, callers fall back) so its asymmetric mature state is never disrupted.

**Shape 2 — non-arming `peek*` companion** (ship in the SAME batch as the construction API):
```ts
export function peekTelemetryInstance(assetClass: AssetClass): TelemetryAggregatorService | null {
  switch (assetClass) {
    case 'crypto_spot': return peekGlobalTelemetrySingleton();
    case 'xstock_spot': return _xstockSpotInstance;        // module-level state, NO construction
    default: return null;
  }
}
```
The `peek*` prefix = "non-arming, may be null." A caller that needs to arm uses a distinctly-named `getOrCreate*`. Conflating the two under one name is how verify-gate stats accessors accidentally arm persist-timers/disk.

**Variant C (in-memory-only) is the right default.** New per-class instances are in-memory only by construction; the persist-timer code path is structurally gated inside the global-singleton accessor only, so direct `new XxxService()` at the factory does not invoke it — safe by structure, not policy. The persist-by-class follow-up lands when the first non-canonical class flips to active trading. Origin: `B79_0n_TELEMETRY` (deploy `02bad33a6`); SYSTEM_MANUAL §10.9.

### R-DISPATCH — Per-class consumer-site swap dispatcher (used by Steps 3.4–3.5, ORCHESTRATOR-class work)

Use when the per-class module ALREADY exists with a compatible shape (cheap, mechanical). If it doesn't exist or the divergence needs evidence-gated promotion, use the full F-1 resolver-with-EXISTS-gate at the calibration/observability phase instead — don't compress F-1 work into this.

Decision tree: per-class module exists + shapes match → this pattern; exists + shapes diverge → harmonize via `R-PATTERN` naming-convergence first; doesn't exist → `R-ADDCOL` (if DB-backed) or build the module first.

Steps: (1) `grep -rn "from .*asset_classes/crypto_spot/<module>" server/` and categorize each hit (true class-bound = swap target / already-dispatcher = skip / dead-import = delete / type-only re-export = skip / legacy shim = Phase-16 removal candidate). (2) Author a DOMAIN-specific dispatcher at `server/asset_classes/<domain>-dispatch.ts` (NOT central) with the exhaustive-switch + `[CLASS_NOT_WIRED]` activation-breadcrumb throws + `_exhaustive: never` + explicit return type. (3) Swap each true consumer (replace import, replace `<EXPORT>.<KEY>` → `getXForAssetClass(assetClass).<KEY>`, thread `assetClass` as REQUIRED via deterministic `resolveAssetClass` not metadata-fallback). (4) Tests: dispatcher unit (active return / perp + reserved throw / shape contract) + consumer-swap source-string locks + an **integration test with a key-aware DB mock** that drives DIFFERENT values per class to catch wrong-value-threaded-correctly. (5) If >1 consumer, add the per-class diagnostic endpoint (`R-GAPREG`). Origin: `B79_0n_ORCHESTRATOR` (deploy `5e08568`, `pattern-pool-dispatch.ts`; xStock pattern signals corrected from crypto-bound 0.15 → DB-resolved 0.50 MAX_POSITION_PCT).

### R-STRATEGY6 — Six strategy-activation wire-in points (used by Steps 6.1–6.3)

(This is strategy-onboarding, which can happen during OR after asset-class onboarding.) Template = `server/strategies/orb.ts` (B79.0d):
1. **detect logic** — `server/strategies/<name>.ts`.
2. **strategy-engine dispatch** — import + `'name'` in the `StrategySignal.strategy` enum + a thin wrapper in `server/services/strategy-engine.ts`.
3. **VTS dispatch** — `vts-runner.ts:callStrategyDetect` switch arm. **THIS IS THE MOST-MISSED ONE** — with active trading OFF, the VTS path is the ONLY path that runs; skip it and the strategy is silently 100%-nulled (the ORB 3-batch miss). Add a VTS-path integration test through `callStrategyDetect`, not just a wrapper-in-isolation unit test.
4. **signal-orchestrator dispatch** — block gated on `activeStrategies.has + assetClass match`.
5. **canonical map** — `CANONICAL_REGIME_STRATEGY_MAP` regime entries + the family-map entry (`orb:'breakout'`) or the family-gate is bypassed + `STRATEGY_DISPLAY_NAMES`.
6. **SQE whitelist + seed** — `module_constants` `strategy.<name>` thresholds + `strategy_gates.*.<class>.<name>.enabled`.

New PG enum value (`strategyTypeEnum 'orb'`) = a SEPARATE migration ordered FIRST in MANIFEST (`ALTER TYPE ADD VALUE` can't co-tx). Skip the incumbent via triple-defense (detect early-return + dispatch guard + SQE whitelist); the DB gate flip is the rollback. Name constants for what they ARE (`risk_reward_ratio` → `target_range_multiple`). Origin: `B79_0d` + the `B79_0j` VTS-path fix.

### R-ADDCOL — 4-phase production-safe ADD-COLUMN migration (used by Step 9.3)

For an `asset_class VARCHAR(32)` column on a hot-written table (a naive `ADD COLUMN NOT NULL DEFAULT` locks the table during a full rewrite AND fails incoming inserts between apply and the new-code restart):
- **Phase 1** — `ADD COLUMN … NULL` (transactional, idempotent) + seed any `module_constants` rows the boot HARD-FAIL gate expects (`ON CONFLICT DO NOTHING`) + a `DO $$` block that `RAISE EXCEPTION` if the seed count ≠ expected (fails-loud at apply, not at boot). Writer code then dual-writes the column + the legacy metadata jsonb during the deploy window.
- **Phase 2** — idempotent dual-path backfill script: `import 'dotenv/config'` at the TOP (a standalone CLI doesn't auto-load `.env` — this bit B79.0n.RTB); path 1 = jsonb `metadata->>'assetClass'`, path 2 = `resolveAssetClass(symbol,'kraken')` in try/catch; `WHERE asset_class IS NULL` makes it re-runnable.
- **Phase 3** — precondition `DO $$` (RAISE if any null remain) + `CHECK (asset_class IS NOT NULL)` constraint + `CREATE INDEX IF NOT EXISTS` (composite hot-read key), all transactional.
- **Phase 4** — deferred `SET NOT NULL`, ships as a 1-row DB-only migration after a 48h zero-null soak gate (the CHECK already enforces writes; Phase 4 is for ORM type-level enforcement). File it as a RUNNING_ISSUES entry.

Empty-table special case: Phase 3 trivially passes with 0 nulls and the backfill is a NO-OP — but it still exercises the script path; schedule a first-non-empty verification gate because the dual-path code is un-exercised until first rows. MANIFEST + `git add -f` (the `*.sql` gitignore). Origin: `B79_0n_RTB` (deploy `6fd6bcac6`).

### R-LOCKED — LOCKED-module override (used by Step 9.8)

For a per-class touch of a fenced/LOCKED module, prevent drift into "algorithmic redesign while we're in here": (1) Kyle-authorized scope expansion via an umbrella-row directive; (2) an explicit IN-scope / OUT-of-scope §-block in the scope doc BEFORE implementation (if a drift is observed mid-implementation, STOP and re-scope or defer); (3) Langston's Step-4 review explicitly confirms the diff matches the IN-scope enumeration (lines outside = flagged drift); (4) the completion report + SIM/System Manual document what was LOCKED, what override was authorized, the override scope, and what stayed untouched. Origin: `B79_0n_RTB` `rtb-refresh-service.ts` (846-LOC module untouched since B65.1; per-class bucket allocation authorized, the ACT pool / cadence / `refreshModeSignals` algorithm all preserved); RUNNING_ISSUES #152.

### R-GAPREG — Per-class diagnostic endpoint + deferred-gap registry (used by Steps 8.6, R-DISPATCH)

A per-class diagnostic endpoint (`/api/diagnostics/<batch>-per-class-state`, no-auth public, ~40 LOC) is the Step-8 verify-gate target. Carry an inline `_meta.knownGaps` array so operators see what's promised-vs-deferred without consulting docs:
```jsonc
{ "_meta": { "schemaVersion": 2, "coverage": ["orchestrator","execution"], "lastReviewed": "<YYYY-MM-DD>",
  "knownGaps": ["<gap> (<function-name>); <defer-to phase or trigger>"] } }
```
Closure rule: a gap-closure batch MUST delete the matching string AND bump `lastReviewed` AND cross-reference the removal in its CHANGES_AND_FIXES entry. Always-bump rule: ANY batch touching per-class state at this layer bumps `lastReviewed` even if `knownGaps` is unchanged (touching = a review event). Anchor gaps by function-NAME, not line numbers (which drift). Origin: `B79_0n_EXECUTION` v2 schema.

### R-CONTRACT — Producer-consumer canonical-artifact contract audit (used by Step 9.2)

For every JSON / generated artifact the batch's code reads at runtime (`bridge/canonical/*.json`, generated configs, schema-gen types) — even when the batch touches neither producer nor consumer — verify shape agreement: (a) read the consumer's parse + the producer's emit and diff; OR (b) run the producer dry-run and diff against the on-disk artifact; OR (c) confirm a CI contract test exists. If no CI contract test exists, do NOT mark "verified" — flag a governance gap. Why: a hand-edited canonical JSON masks generator drift; a bundler module-init shift then promotes the latent drift to a deploy crash with no code change to the drift surface (B.1.5: the canonical regime-strategy JSON was hand-authored to a new shape in B79.0n.STRATEGY without updating `sync-canonical-bridge.ts`; it crashed 7 days later when B.1.5's import reordered esbuild's module init). CI contract-test template: assert `generateArtifact()` output passes the consumer's read path for every expected input. Origin: B.1.5 redeploy unblocker (`sync-canonical-bridge.test.ts`, 9 tests).

### R-SCHEDTASK — Scheduled-task audit-row + poll-reconcile (used by Steps 1.6, 9.10)

Every in-process scheduled task (node-cron/setInterval/setTimeout) with side-effects: (1) writes a `scheduled_tasks_audit` row on EVERY fire (success OR error) — absent rows = missed fires; (2) the row's `meta` carries a `trigger_source` discriminator (`'cron'|'poll'|'boot'|'manual'`); (3) a separate poll-based "did we fire?" verifier rides an independent tick (centralClock / boot-reconcile) and catches up on detected state drift (canonical: `xstockSpotScanner.clockTickHandler.reconcileWindowState`); (4) a `severity=warning, category=breakage` system-alert fires when the net catches a missed primary fire, surfacing via the §10.5 per-turn check. Why: in-process timers can silently fail to invoke a callback with no exception and no log line. When one timer is found failed, audit every OTHER timer on the same library (RUNNING_ISSUES #164). Never rely on log-grep as the canonical evidence trail. Origin: B-NEW-36 (Fri 8PM-ET weekend-shutdown cron silently failed) + B-NEW-49.

### R-ESM — Production-ESM-bundle verification for a NEW external dependency (used by Step 9.1)

The production bundle is `esbuild --format=esm --packages=external`; a NAMED import of a CommonJS-only package (`import { parseExpression } from 'cron-parser'`) passes tsc + vitest + CI Build + CI Docker (vitest synthesizes CJS↔ESM named exports; CI only bundles, never boots) then HARD-CRASHES at boot (`SyntaxError: Named export … not found`). Rule: (1) default-import CJS packages then destructure (`import pkg from 'cjs-pkg'; const { fn } = pkg;`) unless the package ships real ESM named exports; (2) validate against Node's ESM loader with a 5-line `.mjs` that imports/calls exactly as the code does, BEFORE deploy; (3) never inline `require()` in esbuild-shipped code (the CONFIDENCE-CHAIN `Dynamic require of "path"` hid in a try/catch). Structural backstop (RUNNING_ISSUES #168): a CI step that boots the actual production bundle headless and requires it to reach "listening" before green. Also covers the module-init ORDERING crash (a new import shifts esbuild topo order so a consumer reads a still-partial canonical JSON — pair with `R-CONTRACT`). Origin: B-NEW-50 (~3-min outage) + B.1.5 + CONFIDENCE-CHAIN.

### R-5SITE — VTS observability-field 5-site plumbing chain (used by Step 5.5)

Adding a per-trade observability field that must appear on BOTH the Open AND Closed Simulated Trades tables touches five sites; missing any one silently degrades to "—" with NO tsc error (the persisted closed record is cast `as any`):
1. **Capture at trade-open** — set the field at each asset-class open site (class-guarded so neither class picks up the other's kind).
2. **Open read-feed** — add it to BOTH the `getOpenVirtualTradesForML` return TYPE and its push object (`vts-runner.ts`).
3. **Close-copy** — copy from the in-memory open trade into the `persistRealPriceTrade({...})` argument.
4. **JSONL persist-write (the load-bearing, easily-missed site)** — `vts-service.persistRealPriceTrade` builds the closed record by EXPLICIT field-mapping (not a spread); add the field to BOTH the param type AND the persisted record (`tradeData.x ?? null`). Without this, site 5 reads nothing.
5. **Closed read-feed whitelist** — add to BOTH the `getClosedVTSTradesFromLogs` return type AND its mapped object (`export-csv.ts`), with `typeof` guards.

Detection: a **scoped before/after tsc diff** (`git stash` to HEAD, capture errors for the changed files, restore, re-capture, `comm` the normalized sets) — a missing site shows exactly one new excess-property error; the whole-project count is otherwise unchanged. Final proof is a LIVE-feed check (a fresh post-deploy open carries a non-null value of the correct kind per asset class; pre-deploy trades correctly read "—" — there is no backfill). Frontend: the cell formatter is asset-aware off the field's KIND (not asset_class alone), and the empty-state `colSpan` bumps per added column. Origin: B.2.UI (`entryLiquidityValue`/`entryLiquidityKind`).

### R-SHARED — Shared-aggregator consumer enumeration before a scoped filter (used by Step 7.9)

When a batch adds a scoped column-read/filter to a SHARED aggregator/endpoint that serves both a live UI panel AND a future eval path, an unconditional scoped filter silently changes the live UI. Discipline: (1) enumerate EVERY consumer including UI panels and BOTH the `/api/analytics/*` (all-asset) and `/api/<class>/*` (scoped) sibling routes — presume a shared aggregator feeds a live UI until proven otherwise; (2) state each consumer's post-change behavior BEFORE writing code (a live-view change is a Kyle decision); (3) default to OPT-IN — a `buildCalibrationClause(assetClass, excludePreCalibration)` parameter, default-off, applied only by the eval caller, so live endpoints stay byte-identical; (4) the audit is code-level (deep SIM + System Manual read + a consumer trace, not a grep-and-cite). This is the second time an xStock-scoped change rode a shared crypto component (first: B79.0i.b reusing `ExitStrategyAblationSection`). Origin: F-NOW (`exit-strategy-ablation-aggregator.ts`).

### R-WILDCARD — Promote-then-retire two-step + all-keys HARD-FAIL (used by Step 2.8)

For a high-blast wildcard retirement, split into two batches with a 48h verify-gate: **Batch X** (promotion + observability) seeds per-class rows for every ACTIVE class + adds an observable fallback counter (`getSQEStaticMirrorFallbackStats()` / `getTECPickFallbackStats()`) that increments when the resolver's safety-net path fires, while the wildcard REMAINS. Wait 48h (one weekend transition + one full UTC day) with the counter at zero. **Batch X.b** (retirement) ships the EXISTS-gated wildcard DELETE only if the counter stayed zero; any non-zero firing means investigate root cause (cache-key bug, asset-class string mismatch, dropped param) BEFORE retiring — the 48h gap buys RESOLVER correctness, not just DELETE safety. All-keys HARD-FAIL coverage: every key in the surface gets explicit per-class rows for every active class; a boot-time primer iterates `getActiveAssetClasses()` and HARD-FAILs on any missing row; NO `pick(key, DEFAULT)` runtime fallback (DEFAULTS const is a TYPE template only); the companion evaluator READS from the per-class cache, never re-resolves async. Origin: `B79_0n_SCORING` + `B79_0n_TEC`.

### R-BASELINE — Pre-calibration baseline + carryover audit + data-availability map (used by Steps 7.1, 7.2)

**Data-availability map FIRST** (before promising any number): classify each needed metric — CLEAN (archived + timestamped, queryable over the window) / REPLAY (reconstruct by re-running the production formula over archived raw inputs) / FORWARD-ONLY (short retention → accumulate forward) / STALE (writer stopped; only a fixed past window exists). xStock taught: order-book depth was ~1-day hot retention (FORWARD-ONLY → calibrate the depth number off ≥5 sessions, not 1 day); the DBS backfill was STALE (05-05→15 only); scan-funnel reject counts were in-memory-only (REPLAY). Promising numbers before this map = promising numbers you can't get.

**Pre-calibration baseline** (a read-only numbers report before any tuning): for every setting you're about to change, capture current value + current result as a **rolling-window rate WITH raw counts** (never a single-cycle snapshot — a single xStock scan flashed spread-reject 16% vs the rolling-24h truth 2.3%; CLAUDE.md #13), plus regime mix / strategy mix / throughput, overlaid with an **operational-event timeline** (outages, holidays, feed go-lives) so distorted windows are excluded before averaging, plus a "definitely off NOW" list. Seed it all into a **Calibration Scoreboard** (`calibration_ledger` table + Analytics "Calibration" tab; num/den is SSOT, pct derived in a pure tested formatter). The scoreboard enumerates the ENTIRE surface — **64 settings / 8 categories** (Regime, IMF filters, Global gates, Strategy gates, Friction, TEC priors, Sector, Macro), grouped — not just the pre-flagged knobs (a cloned class's strategy gates are NOT set up exactly as crypto's, so every range gets re-derived, not only the obviously-broken ones; EXCLUDE only later-phase categories like Phase-25 correlation benchmark + P&L/win-loss).

**Carryover audit** ("the single biggest Phase-24 onboarding trap" — a numeric carryover is NOT a valid carryover): for every cloned setting/component verify (a) **re-derive** the threshold against the NEW class's actual data; (b) **layer-placement** check (correlation was wrongly bundled INTO the xStock IMF; canonical IMF = LQ/VN/DI only); (c) **wired-not-stub** check (that same correlation returned a constant 0.5, rejecting 0 of 283,625). And remember two gates can measure DIFFERENT STATISTICS not just levels (LQ ask-only vs `min_depth_usd` min(ask,bid) — they diverge on thin-ask books, the names a liquidity gate most needs to catch). Reinforced disciplines: read against operational events (a 3-week regime average masked HVU drifting ~5%→23%); date-segment before declaring anomalies (gate-change dates vs trade dates); verify the external-feed inventory (CoinGecko = symbol DISCOVERY, Finnhub = SECTOR tags, NO sector-ETF price feed wired). Full numbers: `B_XSTOCK_CALIB_BASELINE_REPORT.md`; tooling: `B_CALSCORE_COMPLETION_REPORT.md`.

### R-CALCYCLE — Mandatory 3-sub-cycle calibration (used by Step 7.6)

Initial Layer-1 seeds are domain-knowledge STARTERS, not production-tuned. Three sub-cycles run post-deploy before the class is "production-ready," each with an observation window + tuning step + exit criterion:
- **Sub-cycle 1 — Regime-classifier.** Monitor the class's regime distribution across the universe 24–72 h. Anti-pattern: heavy concentration in 1–2 regimes. Tuning surface: `regime_classifier.<class>.*`. Exit: no regime > 70% of population unless deliberate.
- **Sub-cycle 2 — Filter-threshold reality check.** Examine the class's Filter Diagnostics panel over 24 h. Anti-pattern: most filters at 0% rejection (too permissive — xStock's $1 min_price for $200 TSLAx) OR one filter > 70% (too tight). Exit: each filter's failure % is defensible (zero-by-design OR explainable rejections).
- **Sub-cycle 3 — Strategy-gate testing.** Monitor the By-Strategy panel over a multi-day window. Anti-pattern: IE-mapped strategies stay 0 even when IE hits other strategies (an IE-routing audit). Exit: each enabled strategy fired ≥1 OR has a documented gating reason (regime never hit / market-hours / family eligibility).

Calibration moves forward ONLY after the diagnostics UI shows TRUSTWORTHY numbers. Each sub-cycle produces a deltas log; every threshold change is a DB UPDATE with `last_updated_by='<batch>-calibration-N'`. Watch: filter generosity ≠ signal generosity (lenient gates admit pairs; strategies still null on absent geometry — give every silent-skip a counter + null reason); a multiplicative confidence formula compresses toward its floor by design.

### R-BARFREQ — Bar/tick-frequency foundation change (used by Step 7.5)

Bar frequency is a first-class onboarding decision — evaluate it explicitly, don't inherit it. Run a study (`scripts/b4-bar-frequency-study.ts`): per candidate interval measure pattern/setup availability, forward-EXCESS-return edge (de-meaned vs the cross-sectional universe), regime-read STABILITY (flip-rate), bars-per-intended-hold. Decide a single shared interval. The choice is rarely made on edge (xStock chose 15-min on structure + stability + ORB-revival; edge was weak at every interval). The crypto study said NO change (trend setups were marginally BETTER at coarser bars — never generalize one class's answer).

**Changing the interval is a FOUNDATION change, not a flag.** Blast radius: (1) bar plumbing (aggregator interval branch, a new per-interval snapshot table, the scanner OHLC-fetch flip); (2) ALL time-anchored lookbacks → `module_constants`, because they're bar-COUNT and a finer bar silently SHORTENS the wall-clock window (regime mom 30→120, ADX 14→56, DBS 48→192, EMA 12/26→48/104, ATR 14→56); (3) all 14 regime thresholds recalibrated percentile-preserving; (4) DBS recompute + epoch-stamp + archive-old (re-count archive ≥ live BEFORE any destructive DELETE; sentinel-zero flagged; skip atr≤0); (5) IMF recalibration — **VN is bar-INVARIANT but DI CONTRACTS toward 50 (di_max 30→40.3), so IMF needs a DIFFERENT recalibration shape than regime**; (6) weekend prewarm warms BOTH intervals. The realized method: ONE unified replay engine rebuilds the full bar series at the new interval from the clean 1-minute archive → per-bar regime labels (old vs new = the parity report) + per-bar DBS history + the distribution that derives the new thresholds (chosen **percentile-preserving** + sanity-checked through a CALIBRATION-LENS weighting the clusters/CDF-steepness that matter).

**EXIT GATE = a regime-label PARITY report** judged on the **clean-old → clean-new** comparison (both substrates rebuilt from clean 1-minute data, so the delta is pure bar-size). B.4 result: max mix |Δ| 1.30pp, no collapse, signed off. Watch-outs: percentile-preserving makes the parity delta partly by-construction → also capture the LIVE-new mix once hours accumulate and confirm it lands near the predicted clean-new mix (a substrate-mismatch detector); wall-clock flip-rate intuition is BACKWARDS (15-min flips ~2× MORE per hour); deploy is an ATOMIC ACTIVATION at restart (land schema + inert code first → recompute history offline supervised → in ONE deploy/restart flip the activation switch so new bars + new thresholds go live together — you cannot let old code read new-interval thresholds); a parked equity-native strategy (ORB) can be UNLOCKED by a finer interval but "unlocked" ≠ "activated" (plumb ready, leave `enable=false` until edge-validated — #203); a DB-dynamic universe means a standalone CLI must call `initializeFromDB()` before enumerating symbols (boot does it, the CLI does not — `0bae277e7`). Engines: `scripts/b4-regime-recalib-study.ts`, `b4-regime-parity.ts`, `b4-vndi-recalib-study.ts`, `b4-dbs-15m-recompute.ts`; reference list `B_4_15MIN_RECALIBRATION_LIST.md`. Bar-SENSITIVE (redo) = regime thresholds/lookbacks, MCE indicator periods, DBS, candlestick shapes/tolerances, indicator-based gate bands; bar-INDEPENDENT (sanity-check only) = order-book/depth liquidity, friction, TEC priors, sector, macro.

### R-UITAB — Dedicated observation UI tab recipe (used by Step 5.4)

Every new class gets its own FULL-mirror tab (standing invariant #5). The recipe rests on two patterns: cross-asset UI component reuse via `export` + `endpointBase` prop, and shared-aggregator parameterization via an optional `assetClass`.
1. **Parameterize shared backend aggregators** — add an optional `assetClass` (default preserving legacy behavior) to `computeExitStrategyAblation` / `computeFactorCalibration` / etc.; SQL appends `AND asset_class=$X` ONLY when provided. Crypto regression invariant: the existing `/api/analytics/*` returns byte-identical without changes (curl-diff post-deploy).
2. **Export the rich UI sections** (`FilterDiagnosticsPanel`, `ExitStrategyAblationSection`, `FactorCalibrationSection`) with BOTH an `endpointBase` prop AND an explicit REQUIRED `assetClass: AssetClass` prop (so the component reads the display name from `ASSET_CLASS_REGISTRY[assetClass].displayName` — never URL-string-parsing, which rots as classes come online). The REQUIRED prop blocks the build if any caller (including crypto-side) omits it.
3. **Build sibling endpoints under `/api/<class>/`** that call the parameterized aggregator with the class fixed; build a NEW `/api/<class>/filter-diagnostics` returning the full `FilterDiagnosticsData` shape (honest signaling — funnel-rejection rows the scanner doesn't yet emit stay zero; don't fake them).
4. **Build the tab component** `client/src/components/machine-learning/<class>-tab.tsx`, reusing the exported sections, with cache-key isolation (`queryKey` carries `{asset_class}`); header reads "VTS Observation," NEVER "shadow-mode."
5. **Wire the tab into the Machine Learning Tabs group**, positioned LAST.
6. **Verify via Claude-in-Chrome G3 walkthrough** (NON-waivable): navigate, click the tab, screenshot all 5+ sections, DevTools Network shows no 4xx/5xx on scoped XHR, Console clean, the existing crypto tab is visually unchanged, and a curl of `/api/analytics/<shared-endpoint>` shows an unchanged shape.

Watch: schema-shape — factor-calibration is JSONB (`(real_decision->>'confidence')::numeric`), run `\d` first; reuse the crypto components' honest built-in empty-state messages, don't replace them with lighter custom ones. Origin: B79.0i.b (3 iterations under Kyle pushback before the right design); BATCH_82 (the explicit-prop refinement).

### R-LAYERS — Layer 1/2/3 + the two ablation frameworks + observation sizing (used by Steps 5.1, 7.6, 8.5)

Three-layer calibration discipline: **Layer 1** = domain-knowledge baseline (TS constants → DB rows, tagged `tunable_status='active'` if confident or `'pending_layer_3'` if not); **Layer 2** = cross-asset shadow-classify sanity check (run the new class's pairs through the existing classifier with shared math, verify branch routing makes sense); **Layer 3** = live VTS observation, which promotes `pending_layer_3` → `active` on tertile-monotonic WR + ≥7pp HIGH-LOW gap + p<0.05 + n≥150/bucket.

**Two ablation frameworks run in parallel during Layer 3** (standing invariant #4): (1) **factor-calibration (B67.0)** — per-factor counterfactuals on each chain modulator, stored in `regime_factor_alternates` (asset_class-scoped), drives the confidence-modifier chain decisions; (2) **exit-strategy (B73)** — 12 variants (BE A–F + Trail G–J + Combined K–L) per closed trade, stored in `exit_strategy_alternates`, drives per-class TEC config (should BE / trailing / target_lock_r / moonbag be ON for THIS class? crypto's B73 showed Variant K (BE-off) wins; equity microstructure may differ). For each new class: confirm both hooks emit when `assetClass==='<new>'` + extend the aggregator paths so the class has its own results panel (`R-UITAB`).

**Observation-period sizing is per-class** (no universal "X days"): equities trade 24/5 (~80 hr/wk) vs crypto 24/7 (168 hr/wk), so equivalent sample volume takes longer wall-clock. Declare it at scope-lock from sample-rate-per-day evidence; minimum ≥150 samples/regime/factor-bucket; wall-clock minimum ≥ one full weekly cycle (Mon/Fri intraday variation); maximum: don't observe past the point where regime conditions have shifted enough that early data is no longer comparable. Exit-side metrics calibrated in Layer 3 for a different-volatility class: time-to-target by regime, MAE-before-profit, MFE-at-exit, ATR-vs-%-stop, partial-take P&L impact, hold-time by regime — these feed position-management trigger calibration (BE-stop arming, trailing activation, partial-take fractions). Cold-start verification of a market-hours class goes through a scheduled system-alert ~5 min post-open (`Step 8.5`).

---

## Part 3 — Worked example: `xstock_spot` (B79, Phase 24)

The concrete, filled-in instance of the whole sequence. xStock onboarding ran across ~30 sub-batches; this is the distilled result.

### H.1 Plain-language front-matter

xStocks are tokenized 1:1-backed equities listed on Kraken's Pro venue at `wss://ws-equities.kraken.com`. Each token (e.g. AAPLx) is fully collateralized by an actual share of the underlying stock (AAPL) held by Backed Finance, a regulated Liechtenstein issuer; they settle on Solana (T+0 atomic), trade fractionally with a $1 minimum, and run on US market hours (24/5 — closed Sat/Sun + US holidays + early-close days). Why DawnTrader treats them as a separate class: **hours** (24/5 not 24/7 — the scanner early-returns on weekends, the lifecycle controller freezes stops when the market is closed); **volatility** (crypto 2–8% ATR% vs equities 0.5–2% — regime thresholds halved as the Layer-1 baseline); **microstructure** (equities have a U-shaped intraday volume curve vs crypto's flat 24/7); **macro inputs** (VIX / S&P trend / sector rotation, not BTC dominance / funding); **failure modes** (LULD halts, circuit breakers, dividends, splits, earnings); **sector correlation** (equities cluster by sector harder than crypto); **tokenization-vs-underlying** (AAPLx may or may not track AAPL).

### H.1.A — Operational profile (filled `R-PROFILE`)

| Field | xstock_spot value |
|---|---|
| Trading hours | 24/5. Closed Sat–Sun + US market holidays. Unified close Fri-20:00-ET → Sun-20:00-ET. |
| Settlement | Solana on-chain (1:1-backed, Backed Finance). T+0 spot. |
| Geography/regulatory | Kraken Pro non-US. UAE-resident user → permitted. |
| Fees | Kraken Spot fee table — taker 0.26% / maker 0.16% at base tier. |
| Custody | Kraken-custody on-platform; on-chain Solana wallet for withdrawal (a Phase-19 active-trading concern). |
| Exchange WS endpoint | `wss://ws-equities.kraken.com` (separate from `wss://ws.kraken.com/v2`). |
| Exchange REST endpoint | **NONE for xStock** — public REST returns no xStock tickers; data is WS-only (REST-polling is a dead path — `Step 0.4`). |
| Symbol form | Canonical `<TICKER>/USD`; WS feed same; display `<TICKER>x/USD`. Dispatched via the universe allow-list. |
| Universe size + dynamism | ~489 symbols, DB-dynamic since B79.0n.UNIVERSE-DISCOVERY (daily discovery cron). |
| Tick / lot / fractional | $1 minimum, fractional. |
| **Monolithic?** | Mostly monolithic (all on the same 24/5 calendar), but market-hours predicates still take a REQUIRED symbol arg (a half-day-calendar dimension exists). |

### H.1.B — Architecture decisions (filled)

| Decision | xstock_spot choice | Rationale |
|---|---|---|
| Scanner | DEDICATED | Telemetry isolation + market-hours-aware loop + independent benchmarks + materially different dollar-volume distributions. |
| Family filter path | SHARED taxonomy (TFS/RBS/IE/HVU/ST), per-family IMF thresholds asset-class-scoped | Family taxonomy is regime-based, not class-based. |
| RTB pool | SHARED (per-class bucket allocation added in B79.0n.RTB) | Cross-asset parity via the `expectedNetReturnR` primitive. |
| Live-pricing | WS-equities feed; 15-min bar evaluation | xStock evaluates on 15-min bars (B.4); REST is a dead path. |
| Telemetry isolation | Per-class instance triad via factory (`R-INSTANCE`) | Signal/null distributions differ from crypto. |
| Pattern pool | SEPARATE xstock_spot pattern pool with class-specific guardrails | |
| Quant family paths | SEPARATE per-class SSOT keys | |
| Bar frequency | 15-min (changed from inherited 60-min, B.4 — `R-BARFREQ`) | Longer holds + ORB revival; edge weak at every interval so chosen on structure/stability. |
| Liquidity gate | Order-book DEPTH median (not 24h volume) | xStock per-bar volume = underlying equity, ~4 orders off — wrong data. |

### H.1.C — Schema (filled)

`screener_filters` gained `asset_class` + `tunable_status`; xStock row has NO max_price cap. xStock `module_constants` seeds (asset-class-scoped keys): `regime.*` per `regime-thresholds.ts`; `sqe_config.*` (`confidence_threshold`, `di_min_quant`, `adx_min`, `momentum_min`, `di_min_pattern`); `macro_modifier=1.0` placeholder (b67_1 NO-OP); `strategy_gates.xstock_spot.<strat>.enabled` (10 allow + 9 block); `pattern_pool_gates.xstock_spot.*` (naming-converged with crypto); `trailing_exit.xstock_spot.*`; `market_data.xstock_spot.data_freshness_window_ms=90000`. The 15-min foundation (B.4) added per-class time-anchored lookbacks + recalibrated all 14 regime thresholds + rebuilt DBS (332k 15-min rows). The dynamic-universe schema added `xstock_universe` / `xstock_universe_overrides` / `discovery_runs`. The `equity_*`→`xstock_*` rename (B79.0e) cascaded across 172 objects.

### H.1.D — Code surface (resolved — actual file inventory)

**Per-class module under `server/asset_classes/xstock_spot/`** (location-bound, no optional `assetClass?:` param):

| File | Responsibility |
|---|---|
| `scanner.ts` | The dedicated scanner — centralClock subscription, `CYCLE_BATCH_SIZE=75` rotation, `PINNED_BENCHMARKS`, `SCAN_TIMEOUT_MS`+`Promise.race`, `isScanning` early-return, restricted-universe-when-closed, `reconcileWindowState` (the `R-SCHEDTASK` poll-reconcile). |
| `eval-cycle.ts` | The per-cycle pipeline — `loadXstockFilterConfigs` (cycle-scoped config cache), per-pair detect loop, `signal_eval_archive` write (incl. the B-NEW-53.2 at-entry block), `registerOpenVtsTrade`. |
| `global-filter.ts` | Asset-class global filter on fresh pairs. |
| `imf-evaluator.ts` | The 4 quant family-IMF paths + the pattern path. |
| `imf-liquidity.ts` | Order-book DEPTH LQ (`calculateXstockDepthLQ`, rolling 20-min median, 3-state graceful). |
| `pattern-filter.ts` / `pattern-pool-filters.ts` | Pattern-path filter + pattern-pool guardrails (`max_position_pct=0.50`). |
| `regime-thresholds.ts` | Regime branch-condition constants (15-min-recalibrated). |
| `friction.ts` | Fee/spread/slippage model (`XSTOCK_SPOT_FRICTION`, dispatched via `getFrictionForAssetClass`). |
| `market-hours.ts` + `calendar.ts` + `time-of-day.ts` | DST-aware `isXstockMarketOpen` (REQUIRED symbol arg) + US holiday/half-day calendar + intraday helpers. |
| `ohlc-aggregator.ts` | 15-min bar aggregation + per-interval snapshot. |
| `lane-eligibility.ts` | Extracted lane-eligibility (testability). |
| `universe-service.ts` + `universe-bootstrap.ts` + `sp500-backstop.ts` | Dynamic discovery service (`initializeFromDB`) + ~20-symbol mega-cap bootstrap + S&P-500 backstop. |
| `index.ts` | Public-surface re-exports. |

**Shared wire-ins (dispatch threads `assetClass` at the dispatcher, never forks logic):** `shared/asset-classes.ts` (`resolveAssetClass` + `XSTOCK_SPOT_*` membership + `XSTOCK_SPOT_KRAKEN_COLLISIONS`); `server/asset_classes/pattern-pool-dispatch.ts` (`getPatternPoolGuardrailsForAssetClass`); `cost-model.ts` (`getFrictionForAssetClass`); `market-regime.ts` (`calculatePairRegime` REQUIRED-assetClass); `mce.computeContext`; `signal_quality_evaluator.ts`; `canonical-regime-strategy-map.ts` (byAssetClass nested); `asset-class-instances.ts` (the telemetry triad factory); `strategy-engine.ts` + `vts-runner.ts:callStrategyDetect` + `signal-orchestrator.ts` (the strategy dispatch sites). Per-sub-batch commit hashes are in each `B79_0*_COMPLETION_REPORT.md` (and the BATCH_CATALOG rows); the durable patterns each file embodies are in Part 2.

### H.1.E — 18-stage pipeline walkthrough (resolved — actual per-stage table)

For each pipeline stage: what applies for xStock, whether it is class-scoped or shared, and where the values come from.

| # | Stage | xStock specifics | Scope | Value source |
|---|---|---|---|---|
| 1 | Connection | WS-equities feed; no REST | class | `scanner.ts` / WS adapter |
| 2 | Discovery | 3-service chain (CoinGecko→WS-probe→Finnhub); daily cron | class | `universe-service.ts` + `discovery_runs` |
| 3 | Adaptive batch | 75-pair rotation + pinned benchmarks; restricted universe when closed | class | `scanner.ts` |
| 4 | DBS | Sector-respecting market-wide directional aggregate; index proxies excluded; 15-min epoch | class (math byte-identical) | `directional-bias-store` + `xstock_dbs_backfill` |
| 5 | Global filter | DEPTH-median LQ (not volume); NO max_price cap; volume-confirmation REMOVED (wrong data) | class | `global-filter.ts` + `screener_filters.xstock_spot` |
| 6 | Pattern pool (parallel) | Separate xStock pattern pool; F-1 taxonomy invariant; guardrail `max_position_pct=0.50` | class data, shared logic | `pattern-pool-filters.ts` + `module_constants.pattern_pool_gates.xstock_spot` |
| 7 | Family-IMF | LQ/VN/DI per family, asset-class-scoped; trend≠breakout thresholds (carryover-audited); DI recalibrated at 15-min (contracts toward 50) | class | `imf-evaluator.ts` + `screener_filters` family rows |
| 8 | Regime | All 14 thresholds 15-min-recalibrated, percentile-preserving; parity exit-gate ≤1.3pp | class | `regime-thresholds.ts` + `module_constants.regime_classifier.xstock_spot` |
| 9 | MCE | Time-anchored lookbacks (bar-count → wall-clock per 15-min); per-class context cache key `${symbol}:${assetClass}` | class data, shared engine | `mce.computeContext(..., assetClass)` |
| 10 | Strategy detect | 10 enabled / 9 blocked; ORB plumbed-ready but `enable=false` (#203); shared detect methods, per-class DB thresholds | class data, shared logic | `callStrategyDetect` switch + `module_constants.strategy.*` |
| 11 | SQE | Per-class `sqe_config.xstock_spot` gates; whitelist scoped per class | class | `signal_quality_evaluator.ts` |
| 12 | Cost | `XSTOCK_SPOT_FRICTION` via fail-hard dispatch | class | `getFrictionForAssetClass` |
| 13 | Ranking | Shared RTB pool with per-class bucket allocation | shared + per-class buckets | `rtb-refresh-service.ts` |
| 14 | Portfolio risk | Sector-cluster prevention (sector-aware — future B79.6); `pattern_max_position_pct=0.50` is a HARD active-trading pre-gate (#153) | class | `module_constants` + sector map |
| 15 | Trade entry | `registerOpenVtsTrade` persists `asset_class` at OPEN into `vts_open_trades`; at-entry economics block archived (B-NEW-53.2) | class | `eval-cycle.ts` |
| 16 | Lifecycle | TEC stop-freeze when market closed; exit loop reads the asset-class-correct OHLC table | class | `vts_open_trades` + TEC |
| 17 | Position mgmt | BE-protect/trailing deliberately TRUE for xStock (verify live DB, not comments) | class | `trailing_exit.xstock_spot` |
| 18 | Trade close | `markOpenTradeClosed` (Map.delete first, then await, no re-throw); close-hook resolves assetClass via safeResolve+skip-on-null | class-tagged, shared mechanism | `vts-service` + outcome-feedback store |
| — | Calibration (cross-cutting) | Pre-calibration baseline + carryover audit + the 3-sub-cycle cycle; W2/W3 data-blocked → Phase 25 | class | Calibration Scoreboard (`calibration_ledger`) |

### H.1.F — Layer 1/2/3 status

Layer 1 complete (regime/SQE/friction seeds + 15-min recalibration). Layer 2 cross-asset shadow-classify spot-check done. Layer 3 live VTS observation ongoing — the HCE study (22,810 VTS trades) closed 2026-06-05 with the headline that the lever is SELECTIVITY, not gates or post-entry geometry; per-strategy re-fit (W2) + ORB re-enable (W3) are data-blocked on captured decision-provenance → Phase 25 (25-12/13/14/15).

### H.1.G — Forward-watch

24 h post-deploy: xStock VTS emission confirmed, factor-ablation counts populating in `regime_factor_alternates`, the no-touch fence on crypto still green. 7 d: strategy-gap monitoring (the 5 triggers — fire-rate by regime <50% of crypto baseline, ≥80% concentration in ≤2 strategies, win-rate clustering 40–50%, identifiable no-fire windows, named-pattern recurrence in unfilled opportunities). Cold-start each Monday verified via a scheduled ~5-min-post-open system-alert.

### H.1.x — Phase-24 standing rules → promoted

The four Phase-24 standing rules (ticker-collision at scope time; per-class config HARD-FAIL boot; per-symbol predicates when non-monolithic; telemetry partitioning via factory) are now the **Standing invariants** at the top of this doc + `Step 0.2` / `Step 0.1` / `Step 5.1`. The trial-and-error narrative lives in the `BATCH_79_*` completion reports.

---

## Part 4 — Future asset-class slots

Each new class fills its own H.N block here at T+7d post-go-live with ONLY the genuinely-new standing rules (keep the doc lean), and adds any new patterns to Part 2. These slots are intentionally empty until each class ships — they are placeholders for content that does not exist yet, NOT unresolved pointers.

### H.2 — `crypto_perp` (B80, Phase 25) — NOT YET STARTED

When the crypto_perp implementer begins: walk Part 1 in order. Pre-flight (`Step 0.2`) runs the ticker-collision intersection of the perp universe against BOTH crypto_spot AND xstock_spot. The exchange HAS a list-all endpoint (Kraken Futures `/derivatives/api/v3/instruments`) so dynamic discovery is lighter than xStock's. Perp-specific deltas to expect: funding rate (a per-pair signal, a NEW input to macro-modifier composition), leverage + liquidation, perpetual settlement, 8-hour funding-window clustering (this is the likely "non-monolithic" trigger — `Step 0.1` — if funding timing is per-pair). Confirm telemetry partitioning (`R-INSTANCE`) by comparing perp signal/null distributions against crypto_spot. The reserved-future enum value `crypto_perp` already exists in the `AssetClass` union (it throws `[CLASS_NOT_WIRED]` at every factory/dispatcher today — those throws are the activation breadcrumbs).

### H.3 — further classes (forex, options, …) — NOT YET STARTED

By the time a fourth class lands, this doc is battle-tested against equity, perp, and the crypto-spot baseline. A separate, simpler **exchange-onboarding** doc (adding Binance / Coinbase / Bybit — API auth, symbol normalization, fee schedule, WS protocol differences are mostly mechanical) is to be authored when the second exchange is added; it is out of scope here.

---

*End of ASSET_CLASS_ONBOARDING_WORKFLOW.md. The single onboarding sequence is Part 1; the HOW-detail is Part 2; the worked example is Part 3; future slots are Part 4. Trial-and-error history lives in the per-batch completion reports under `Claude Comms and Packages/Batch Completion/`.*
