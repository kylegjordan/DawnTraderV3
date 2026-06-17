# P19-B6.5c — PRE-AUDIT (Step 2)

> Resolves the gates Langston set in his Step-1 ACK (D1 DB-dep check, D2 caller enumeration, D3 no-fallback design, D4 coverage proof + dedup). Grounded in the live staging DB, the SSOT code, and the two orchestrator call sites. A/EUR (old D5) is **out of scope** — owned by Claude Old's B6.5d.

## D1 — cwqi DROP COLUMN: dependency check (CLEAN)

Live staging DB checks (`information_schema` + `pg_*`):
- **Views referencing `rtb_signals.cwqi`:** none.
- **Constraints (CHECK/FK) referencing cwqi:** none.
- **Triggers on `rtb_signals`:** none.
- **Generated columns / defaults referencing cwqi:** none.
- **Indexes on cwqi:** `rtb_signals_cwqi_idx` — Postgres auto-drops a single-column index with `DROP COLUMN`, so no separate handling needed (documented).
- **Row count:** `rtb_signals` has **0 rows** (every insert was rejected by the two breaks — direct confirmation nothing reached the queue).
- **Code sweep (repo-wide):** `cwqi` appears only in `server/legacy/metrics_archive.ts` (archival constants/comments) + unit tests asserting its removal. Nothing reads/writes it.

**Plan:** migration `ALTER TABLE rtb_signals DROP COLUMN IF EXISTS cwqi;` (idempotent — a fresh box built from current `schema.ts` never had it). Rollback `ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS cwqi numeric;` (**nullable** — documented asymmetry: the original `NOT NULL`-no-default state was itself the drift bug and is deliberately not restored as NOT NULL, which would re-break inserts and cannot be added to a populated table). `git add -f` the migration + register in `drizzle/migrations/MANIFEST.txt` (rollback file stays out). `DELETED_COMPONENTS_LOG.md` entry.

## D2 — patternToTradeSignal drops the `strategy` field: caller enumeration (COMPLETE)

Every consumer of `patternToTradeSignal(...).strategy`:
1. `signal-orchestrator.ts:1527/1538` (site 1, pattern-pool path) → **replaced** by the new resolver (D3/D4).
2. `signal-orchestrator.ts:2049/2054` (site 2, evaluateMarket loop) → **removed** with the loop (D4).
3. `server/tests/unit/b79-0n-pattern-detect-byte-identity.test.ts:122,141` → assert `strategy === 'pattern_pinbar' / 'pattern_morning_star'`; **update** to geometry/confidence-only (the test's stated intent — "preserves 1.5×ATR stop + 2.5×ATR target"); assert `strategy` field absent.

VTS (`vts-runner.ts`) and xStock eval-cycle do **not** call `patternToTradeSignal` (they use `selectContextAwareStrategy` directly). So removing the field is safe everywhere. Return type loses `strategy:` → the `as StrategySignal['strategy']` casts at site 1 disappear; tsc stays clean.

## D3 — exact-match-or-drop, without disturbing VTS/xStock (DESIGN)

**Do NOT modify `selectContextAwareStrategy` (shared with VTS + xStock).** Instead add a NEW sibling export in `canonical-regime-strategy-map.ts`:

```
resolvePatternConsumingStrategy(regime, detectedPattern, assetClass)
  -> { strategy, signalType, patternType } | null
```

It performs ONLY the exact-match step: `normalizePatternToCanonical(detectedPattern)` → find the strategy in the per-class materialized tree (`CANONICAL_REGIME_STRATEGY_MAP[assetClass][regime]`) whose `signalType` is PATTERN|HYBRID **and** `patternType === canonicalPattern`. Returns the match, or **null** (no hybrid/pattern/diversity/primary fallback). This is strictly additive — zero blast radius on the shared `selectContextAwareStrategy` contract (safer than an opt-in flag).

**Observable counter (Langston condition 1):** a module-level counter keyed by `(canonicalPattern, regime, assetClass)`, incremented on every null (drop). Exposed via a `getPatternNoMatchDropStats()` peek (mirrors the existing `recordQueueFailure`/`getQueueFailureStats` pattern) so the gate-10 dry-run can read drop rates — no silent caps. A surprisingly high no-match rate is a coverage signal, not a hidden truncation.

## D4 — site 1 canonicalize, site 2 REMOVE (COVERAGE PROVEN)

The orchestrator has TWO pattern emission sites:

- **Site 1 — pattern-pool path** (`~1466-1577`, "Phase 14.5: Process pattern pool — PATTERN + HYBRID strategies only"): iterates `patternSymbols`, scans patterns, and `patternToTradeSignal` is its **sole** signal emitter. There is **no `activeStrategies`/`detect*()` dispatch** in this loop (grep: `activeStrategies.has(...)` appears only at lines 1743–2024, all inside the quant-path `evaluateMarket`). This is the architecturally-intended "pattern-detection-driven strategy selection" path (its own comment). → **CANONICALIZE:** resolve via `resolvePatternConsumingStrategy(context.regime…, patternSig.pattern, 'crypto_spot')`; drop-if-null (+counter); use the resolved canonical strategy for BOTH the signal label and the `buildSizedSignalForStrategy` sizing key.

- **Site 2 — `evaluateMarket` loop** (`~2044-2077`): the `activeStrategies` dispatch directly above it (lines 1689–2040) already evaluates **every** pattern-consuming strategy — morning_star (1934), inside_bar_reversal (1943), support_bounce (1952), pivot_shift (1961), reverse_impulse (1970), defensive_hedge (1979), adaptive_flow (1990), volatility_edge (1999) — each via `detect*()` fed the correct pattern by `buildPatternInputForStrategy` (the B57 per-strategy routing). So the separate loop is **redundant double-emission**, and it is demonstrably incoherent: it sizes under hardcoded `'breakout'` (line 2068) while labeling `pattern_*`. Per Langston: canonicalizing a duplicate emitter is *worse* than the current bug (today the enum rejects it; canonicalized it would pass gate-10 while double-counting). → **REMOVE the loop** (rule 18: full blast-radius trace + DELETED_COMPONENTS_LOG). The proper pattern-driven signal comes from the pattern path (site 1) + the dispatch's `detect*()`.

**RTB dedup interaction (Langston's crux):** `upsertRtbSignal` conflict target is **`(mode, symbol, strategy)`** (storage.ts:4020, on-conflict-do-update). So a pair in BOTH pools that resolves to the same canonical strategy via site-1 (pattern path) and via the quant-path dispatch will **collapse to one row** (last-write-wins) — no double-count. Distinct strategies for the same symbol are legitimately distinct signals (intended). Confirmed safe.

## Implementation chunks (Step 3)

- **A — migration:** `drizzle/migrations/<ts>-b6-5c-drop-rtb-cwqi.sql` (`DROP COLUMN IF EXISTS`) + `.rollback.sql` + MANIFEST + DELETED_COMPONENTS_LOG.
- **B — canonical map:** `resolvePatternConsumingStrategy()` + the `(pattern,regime,class)` no-match counter + `getPatternNoMatchDropStats()` peek.
- **C — recognizer:** remove `strategy` from `patternToTradeSignal` return + return type (geometry/confidence only).
- **D — orchestrator:** site-1 canonicalize (resolve + drop-if-null + counter + size under resolved strategy); site-2 REMOVE the loop; delete the now-dead union casts; DELETED_COMPONENTS_LOG for the removed loop.
- **E — tests:** update byte-identity test (geometry-only); new unit test for `resolvePatternConsumingStrategy` (regime-dependent matches: PINBAR→reverse_impulse [HVU] / support_bounce [RBS]; MORNING_STAR→morning_star [TFS]; ABCD→volatility_edge [IE]; TRI_STAR→adaptive_flow [RBS]; **no-match drop**: PINBAR in TFS → null + counter increments).
- **F — bench:** copy changed files to `C:\dev`, `node scripts/check-tsc-baseline.mjs` + `npx vitest run`.

## Coordination

Files are **disjoint** from Claude Old's B6.5d (`shared/asset-classes.ts`, `server/index.ts`, `server/core/filters/signal_quality_evaluator.ts`). Per the handshake: Claude Old pushes B6.5d first; B6.5c commits (pathspec-limited, never `git add -A`) + pushes on the clean base. Bonus: his widened resolver landing first lets a real A/EUR-class crypto pair classify and flow through the fixed pattern path during gate-10.

## Governance owed at close (Langston's §16 gate)
System Manual + SIM **content** updates: the pattern→strategy routing contract (exact-match-or-drop), the cwqi schema reconciliation, and the stale "17 strategies" → 19 fix (both docs carry it). Plus the per-batch state docs (BATCH_CATALOG / PHASE_HISTORY / PHASE_19_PLAN / RUNNING_ISSUES / completion report) for BOTH B6.5b and B6.5c, and the gate-10 proof that `paper_sim_trades.strategy_name` is canonical end-to-end.
