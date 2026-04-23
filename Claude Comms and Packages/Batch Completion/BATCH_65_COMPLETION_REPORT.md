# BATCH 65 — Completion Report (B65.1 + B65.2)

**Status:** SHIPPED 2026-04-23. B65.3 (paper percentage-trailing migration onto ATR-based TEC state machine) deferred as separate regression surface; not blocking B66.
**Scope:** `Claude Comms and Packages/Scope Files/BATCH_65_SCOPE.md`
**Pre-audit:** `Claude Comms and Packages/Scope Files/BATCH_65_PRE_AUDIT.md`
**Commits (migration/aws-supabase branch):**

| Commit | Label | What |
|---|---|---|
| `8b8172f4` | B65.1 main | `module_constants` table + `moduleConstantsService.ts` + 3 migrations + 1 rollback + schema changes (`exchange`, `assetClass` on 4 tables; `baseCurrency` NOT NULL on trades + paper_sim_trades) + 2 unit tests. |
| `37784fa7` | B65.1-HF | JSDoc regime-literal scrub to pass `regime_mapping_integrity` test. |
| `a129e567` | B65.1-HF2 + HF3 | 3 baseCurrency insert fixes (trade-executor, paper-execution-engine, routes) + new `scripts/db-migrate.ts` file-based migration runner replacing `drizzle-kit push`. |
| `b98fd288` | B65.1-HF3b | pg ESM default-import fix. |
| `31013517` | B65.1-HF3c | dotenv loading in db-migrate runner. |
| `dd1f5372` | **B65.2** | **TEC exit-evaluator: centralized `evaluateTECExit()` consumed by VTS + paper.** 7-scenario parity test. |

---

## 1. Executive summary

B65 replaces hardcoded exit-decision constants and scattered SL/TP inline branches with a **DB-governed parameter surface** (B65.1) and a **single shared exit-decision primitive** (B65.2). The two layers combine to make trailing-exit tuning an operational knob rather than a code change, while preventing VTS/paper divergence at the exit layer.

Behavior on day 1 is bit-identical to pre-B65 because:
- B65.1 seed migration writes the 4 TEC defaults (`break_even_trigger_r=1.0`, `target_lock_r=1.5`, `trail_distance_atr_multiplier=1.0`, `persistence_debounce_ms=5000`) that match what was hardcoded in `trailing-exit-controller.ts`.
- B65.2's `evaluateTECExit()` falls back to the same numeric constants if the DB read returns undefined.
- VTS preserves `useTrailing:false` (simple SL/TP + MAX_HOLD_MS); paper preserves "exit at currentPrice" fill convention; paper's metadata-driven percentage-trailing stays inline.

The centralization makes **B66 recalibrations and future asset-class/exchange expansions** a matter of writing DB rows rather than code.

---

## 2. B65.1 objectives — checklist

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | `module_constants` table + 60s-cached service with most-specific-wins resolution | ✅ | `shared/schema.ts :: moduleConstants`; `server/services/module-constants-service.ts` exports `getConstant`, `getModuleConstants`, `setConstant`, `invalidateModuleCache`, `clearModuleConstantsCache`. Resolution weights regime=8, strategy=4, assetClass=2, exchange=1. |
| 2 | 4 TEC seed rows (module_name='trailing_exit') | ✅ | `drizzle/migrations/2026-04-23-b65-create-module-constants.sql`. Ledger confirms applied on staging. |
| 3 | `exchange` + `assetClass` columns on watchlist_pairs, trading_signals, trades, paper_sim_trades | ✅ | `drizzle/migrations/2026-04-23-b65-add-exchange-asset-class.sql` + `shared/schema.ts`. Defaults kraken / crypto_spot. |
| 4 | `baseCurrency` NOT NULL on trades + paper_sim_trades + derivation from symbol at migration time | ✅ | `drizzle/migrations/2026-04-23-b65-add-base-currency-to-trades.sql` via `COALESCE(NULLIF(SPLIT_PART(symbol, '/', 1), ''), symbol)`. HF2 fixed 3 insert call sites to derive `baseCurrency` identically at runtime. |
| 5 | Rollback migration | ✅ | `drizzle/migrations/2026-04-23-b65-rollback.sql`. |
| 6 | Unit tests for resolution hierarchy + migration integrity | ✅ | `server/tests/unit/b65-module-constants-resolution.test.ts`, `server/tests/unit/b65-migration-validation.test.ts`. |
| 7 | No workaround for `drizzle-kit push` ARRAY-default introspection bug | ✅ | New `scripts/db-migrate.ts` (HF3+HF3b+HF3c) replaces `db:push` for deploys. File-based runner tracks applied migrations in `_migrations` ledger table, skips rollback files, uses `pg` Client directly, self-loads `.env`. `npm run db:migrate` is the canonical deploy-time path; `db:push` retained as dev-only tool. |
| 8 | No new TypeScript errors from schema changes | ✅ | HF2 fixed the 3 errors I introduced by making `baseCurrency` NOT NULL. Remaining ~600 errors are pre-B64 legacy (verified against B63-close CI + B64a HF CI) — Phase 16 scope. |

---

## 3. B65.2 objectives — checklist

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | `evaluateTECExit()` as shared primitive | ✅ | `server/services/tec-evaluator.ts`. Inputs: symbol, entry/stop/target, currentPrice (nullable), atr, holdDurationMs, maxHoldMs, context (exchange/assetClass/strategy/regime), useTrailing, DI, volNoise. Output: `TECExitDecision { shouldExit, exitReason, exitPrice, newStopPrice?, modeChanged?, resolvedConstants? }`. |
| 2 | Consumes `module_constants` for TEC parameters | ✅ | Loads 4 constants per decision via `getModuleConstants('trailing_exit', key)`. Falls back to seed-migration-matching defaults on DB failure. Resolved constants surface in `decision.resolvedConstants` for diagnostics + parity tests. |
| 3 | VTS delegates exit decisions | ✅ | `server/services/vts-runner.ts` L1453-1490 refactored. `useTrailing:false`. Preserves Batch-18I stale-cleanup (stale_timeout + timeout both normalize to legacy `'timeout'` exit-reason), Directive-11.6 SL/TP level-clamping, B64b 7-day MAX_HOLD_MS (passed as `maxHoldMs`). |
| 4 | Paper delegates SL/TP decisions | ✅ | `server/services/paper-execution-engine.ts :: checkExitConditions` L860-944 refactored. Preserves paper's "exit at currentPrice" fill convention for the returned `ExitCondition`. Metadata-driven percentage-trailing + `maxHoldingPeriod` stay inline (tracked for B65.3). |
| 5 | 7-scenario parity test | ✅ | `server/tests/unit/b65-tec-parity.test.ts`. Covers: (1) simple stop clamp, (2) simple target clamp, (3) break-even lock (trailing path), (4) target-lock trailing with mode flip to TRAILING_TAKE, (5) MAX_HOLD_MS timeout with live price, (6) cost-aware breakeven floor close via TEC state machine, (7) stale-price force-close to entryPrice. Plus: resolved-constants smoke test + no-price within-hold no-decision case. DB and `trailing-exit-controller` are mocked so the test runs hermetically. |
| 6 | Preserve B64b MAX_HOLD_MS safety valve | ✅ | VTS caller passes `MAX_HOLD_MS = 7 * 24 * 60 * 60 * 1000`. Evaluator evaluates MAX_HOLD branch before SL/TP; stale-price branch fires before any price-based check. |
| 7 | No regression to fill conventions | ✅ | VTS clamps to stop/target level (as pre-B65). Paper returns exit-at-currentPrice (as pre-B65). Exit-reason taxonomy unchanged from paper/VTS consumers' perspective. |

---

## 4. What B65.2 does NOT do (by design)

- **Paper's metadata-driven percentage-trailing** (`trailingStopPercent` + `highWaterMark` in position metadata) stays inline in `paper-execution-engine.ts :: checkExitConditions`. Migrating this onto the ATR-based TEC state machine in `trailing-exit-controller.ts` is a separate regression surface tracked as **B65.3**. The logic difference is substantial (percentage-from-HWM vs ATR-multiple-from-HWM with cost-aware floors), so mixing it into B65.2 would have inflated test surface area and review burden.
- **TEC state-machine persistence debounce** (5000ms) is still hardcoded inside `trailing-exit-controller.ts`. The `persistence_debounce_ms` constant IS seeded and readable via `moduleConstantsService`, but re-wiring the module's timer through the service requires injecting the resolved constant into module-scoped state — also best done in a follow-up to keep B65.2 surgical.
- **Live executor** (`LiveTradeExecutor` in `trade-executor.ts`) is unchanged — it's a stub.

---

## 5. Governance files changed

| Tier | File | Reason |
|---|---|---|
| 1 | `1-system-manual/BATCH_CATALOG.md` | Replaced single Batch-65 queued row with two shipped rows (B65.1 + B65.2) with commit chain, surface area, and follow-up pointer. |
| 1 | `Claude Comms and Packages/Batch Completion/BATCH_65_COMPLETION_REPORT.md` | This file. |
| 1 | `.claude/memory/MEMORY.md` | Volatile state updated (commit chain, next work = B66 or B65.3 depending on Kyle direction). |
| 2 | `1-system-manual/PHASE_HISTORY.md` | Phase 15c progression: B65 SHIPPED. |
| 2 | `1-system-manual/SYSTEM_IMPACT_MAP.md` | New service `tec-evaluator.ts` added. VTS exit loop + paper checkExitConditions now downstream of it. Module-constants-service upstream of it. |
| 2 | `1-system-manual/SYSTEM_MANUAL.md` | TEC exit-evaluation is now an architectural component — update the exit-decision pipeline section. |

---

## 6. Deploy verification

Deploy to Hetzner staging is the next step after CI green. Verification commands:

```bash
# Deploy
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && git pull origin migration/aws-supabase && npm run build && npm run db:migrate && pm2 restart dawntrader'"

# Verify:
# 1. db:migrate reports 0 pending (B65.2 has no new migrations)
# 2. HTTP 200 on staging
# 3. PM2 log shows no TEC evaluator errors in a cycle or two
# 4. VTS closed-trade rows still produce stop_hit / target_hit / timeout exit-reasons
# 5. Paper closed-trade rows still produce the 4 legacy exit types
```

---

## 7. Next-session picks

- **B66 (SQE recalibration)** — scope is written in `BATCH_66_SCOPE.md`. 6 formula const promotions, PredConf rolling window, per-underlying limits, realized-EV-adaptive floor, rankingScore logging. 3 sub-deploys.
- **B65.3 (optional follow-up)** — migrate paper's percentage-trailing onto ATR-based TEC state machine via `useTrailing:true` path of `evaluateTECExit()`. Includes wiring `persistence_debounce_ms` through `moduleConstantsService` inside `trailing-exit-controller.ts`.
- **B63 Item 13 final close gate** — 2026-04-28. Evidence script ready.
