# B79.0m.b2 — Step 4 (Code Review) Ask

> **From:** Claude Code
> **To:** Langston
> **Workflow step:** Step 4 (Code-level diff review BEFORE push to GitHub) per CLAUDE.md §2.
> **Created:** 2026-05-11
> **Files staged at:** `/home/langston/inbox/b79_0m_b2/step4_diff/`
> **Reply file:** `Claude Comms and Packages/Langston Design Asks/B79_0m_b2_step4_code_review_reply.md`

---

## What landed

Per rev2 sign-off ("Clear to write code"), I've implemented all 5 objectives + your 8 rev1 pre-audit edits.

**Diff summary** (from `git diff HEAD --stat`):

```
Claude Comms and Packages/Scope Files/BATCH_79_0m_b2_PRE_AUDIT.md   | 395 ++++++++----
drizzle/migrations/2026-05-11-b79-0m-b2-xstock-pattern-rows.sql     |  90 +++ (NEW)
drizzle/migrations/...-rollback.sql                                  |  24 + (NEW)
server/asset_classes/xstock_spot/eval-cycle.ts                       | 699 +++++ --- (heavy refactor)
server/asset_classes/xstock_spot/pattern-filter.ts                   | 270 + (NEW)
server/config/canonical-regime-strategy-map.ts                       |   6 + (orb: 'breakout')
server/services/exit-strategy-replay-service.ts                      |  55 + (B73 asset-class branch + error counter)
server/services/vts-runner.ts                                        |   5 + (thread assetClass into replayAndPersist)
server/services/vts-service.ts                                       |   7 + (assetClass on tradeData)
server/strategies/orb.ts                                             |  32 +/- (LONG-only)
server/tests/unit/b79-0d-orb.test.ts                                 |  29 +/- (test c updated)
server/tests/unit/b79-0m-b2-lane-eligibility.test.ts                 | 113 + (NEW)
server/tests/unit/b79-0m-b2-pattern-filter.test.ts                   | 134 + (NEW)
server/tests/unit/b79-0m-b2-pattern-strategy-constants-fallback.test.ts | 115 + (NEW)
shared/schema.ts                                                     |  11 +/- (drift fix)
```

12 files modified + 7 new files. ~943 / -457 lines.

## Critical paths to review (priority order)

### 1. `eval-cycle.ts` — the central refactor (HIGH priority)

The lane × strategy fan-out is the structural change. Key things to verify:

- **`isStrategyEligibleForLane`** (private helper) — implements the per-lane gate. Pattern lane admits ONLY `STRATEGY_FAMILY_MAP[s] === 'pattern'`. Family lane admits primary-family-match OR hybrid-eligible (via HYBRID_FAMILY_ELIGIBILITY) OR multi-family-eligible (via MULTI_FAMILY_ELIGIBILITY). Pattern-only strategies do NOT fire in family lanes.
- **Lane composition** at the bottom of step 3 — builds `lanes: EvalLane[]` from `imfResult.passedFamilies` (each fan-out separately) plus a single pattern entry if `patternResult.passed`. Empty lanes → return.
- **`patternRejectByMinHistory` counter increment** — triggered when `patternResult.failureReason?.startsWith('pattern_history_')` (matches the pattern-filter.ts failure shape; see test (c)). Per your rev1 edit #7, this is the §-1.1 tripwire.
- **Strategy iteration is NESTED**: `for (lane of lanes) { for (strategy of regimeStrategies) { ... } }`. A pair surviving 3 family lanes + pattern emits up to `4 × |regimeStrategies|` `signal_eval_archive` entries. This is the intentional fan-out shape per Q-L1 confirm.
- **sourcePool tagging**: `lane.sourcePool` is threaded into all 4 archive writes (strategy_internal, sqe, tcl, admitted) AND into `registerOpenVtsTrade` + `computeNetExpectancyKernel`. Confirm no spot reverts to the old `xstock-${family}` hardcoded format.

### 2. `pattern-filter.ts` (NEW module, MEDIUM priority)

- 60-bar floor at line ~155 — matches `global-filter.ts:109` per §-1.1.
- DI computed inline (same proxy as imf-evaluator.ts:70-81). Returns `null` when `ohlc.length < 20`.
- Failure-reason strings used by the tripwire counter: `pattern_history_<N>_lt_60` (caller startsWith match).
- Pattern-pool guardrails (`pattern_pool_gates.xstock_spot.*`) are NOT enforced here per scope §1.2 (consumed downstream; out of scope this batch).

### 3. `orb.ts` LONG-only fix (MEDIUM priority)

- File header updated `Direction: BUY only` with comment pointing to `inside-bar-reversal.ts:131-134` as the reference pattern.
- The down-break branch returns `null` with `setNullReason('sell_disabled_long_only')`.
- New import `setNullReason from '../utils/null-reason-tracker.js'`.
- Pre-deploy crypto baseline captured (per §-1.7): admitted=0, total=77,919/24h all `strategy_internal`. Post-deploy expectation: admitted stays 0; total invocations drop because family-gate filters out non-breakout-family crypto pairs.

### 4. `canonical-regime-strategy-map.ts` (LOW priority — single-line addition)

- Single line: `orb: 'breakout',` added to STRATEGY_FAMILY_MAP block at line 820. Comment cites your rev1 Q-L2 confirm + the §-1.7 rollback trigger doc.

### 5. `exit-strategy-replay-service.ts` (MEDIUM priority)

- `ReplayContext.assetClass?: string` added (default `'crypto_spot'`).
- `fetchOhlcForReplay` gains `assetClass: string = 'crypto_spot'` parameter. Inside, branches on `assetClass === 'xstock_spot'` → Drizzle query against `xstock_spot_ohlc_1m` over `[entry_time − 14min, exitTime + maxHoldMs]`. Other asset classes fall through to existing `ohlcCache.getOHLCData()` path.
- Module-scoped `_b79XstockReplayErrors` counter, surfaced via `getB73XstockReplayErrorCount()` export per rev1 edit #6.
- Caller threads `assetClass: ctx.assetClass ?? 'crypto_spot'` for back-compat.
- `vts-runner.ts:2337` + `vts-service.ts:957` patch threads `assetClass: tradeData.assetClass` through.

### 6. DB migration (LOW priority)

`drizzle/migrations/2026-05-11-b79-0m-b2-xstock-pattern-rows.sql` seeds 4 rows: `vts_pattern` + `active_pattern` × paper/live, cloned exactly from crypto's psql-verified values (LQ_MIN=43, VN_MAX=0.98, DI_MIN=3/5, min_price=0.05/0.25, etc.). `ON CONFLICT DO NOTHING` for re-run safety. Rollback file present.

### 7. `shared/schema.ts` drift fix (LOW priority)

Single block at lines 480-490: index declaration changed from `(mode, filterPath)` → `(mode, assetClass, filterPath)` with name `screener_filters_mode_class_path_idx` matching production. No DB migration runs because production already has this state.

## Unit tests (4 files)

| Test file | Coverage |
|---|---|
| `b79-0d-orb.test.ts` (updated) | Test (c) flipped from "DOWN generates SELL" to "DOWN returns null with sell_disabled_long_only"; new test (c2) confirms LONG-only path doesn't fire on valid BUY. |
| `b79-0m-b2-lane-eligibility.test.ts` | Per-lane strategy gate — pattern strategies in pattern lane only, ORB in breakout lane (new entry), vwap_pullback in trend AND strong_trend (multi-family), etc. |
| `b79-0m-b2-pattern-filter.test.ts` | Pattern filter happy + 6 unhappy paths (missing config, min_price, min_history, LQ, VN). Test (c) covers the `pattern_history_*` startsWith assertion. |
| `b79-0m-b2-pattern-strategy-constants-fallback.test.ts` | Confirms `getCachedNumbersForModule` resolves wildcard values explicitly for all 3 pattern strategies with `assetClass='xstock_spot'` — no undefined fields (rev1 edit #5 + G12). |

## Things I want your eye on

1. **The fan-out inflation factor.** With a pair admitted to 3 family lanes + pattern, the `signal_eval_archive` insert count grows ~4× relative to the previous single-iteration shape. At ~169 pairs/cycle, fan-out sum of 498, plus pattern admits if pattern path works → potentially ~600-700 evaluations/cycle. Should be safe (crypto runs similar volumes), but flag if you see a storage budget concern I missed.
2. **`pattern-filter.ts` DI computation** — duplicates the proxy from `imf-evaluator.ts:70-81`. I chose duplication over extraction to keep the new module self-contained (Layer-1 simplicity). Acceptable, or should I refactor into a shared util now?
3. **The B73 xstock branch** uses a single Drizzle query for the full replay window (not paginated like the Kraken REST path). Per the EXPLAIN ANALYZE, this is sub-millisecond at the projected close volume — but flag if the unbounded `ASC` ORDER BY needs a LIMIT for safety on really long-held trades.
4. **Schema-file drift fix** — there's no Drizzle migration runtime touching this index. Production already has the desired state. CI build will validate that the schema TS is type-consistent. Anything I missed about drizzle-kit's drift-detection behavior on first push?

## Verification gate status (pre-Step 5)

- G1 (CI) — pending push
- G2 (DB seeds) — migration ready
- G11 (schema drift) — code applied, verifying via CI
- G3, G4, G5, G6, G7, G8, G9, G10, G12 — pending deploy

ORB pre-deploy baseline already captured per §-1.7:
```
A_admitted_24h: 0
B_total_by_reject_stage: strategy_internal | 77919
```

## Asking

(a) Approve diff for push, OR
(b) Specific blocking concerns + line numbers, OR
(c) Non-blocking nits I can address in a follow-up commit.

Reply concisely. Output full reply to stdout — I will verbatim-relay to Telegram.

— Claude Code
