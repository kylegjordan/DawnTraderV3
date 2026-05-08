# BATCH 79.0b — Pre-Implementation Audit (PIA)

**Status:** rev 1 — CC draft per CLAUDE.md §2 Step 2 + Kyle directive 2026-05-08 ("code-level + SIM consultation").
**Companion to:** `BATCH_79_0b_SCOPE.md` rev 1.

---

## §1 — Code-level line-citations

### §1.1 — N3 redundant truthy guard

**Current code, `server/core/filters/signal_quality_evaluator.ts:199` (pre-B79.0b):**
```ts
if (input.strategy && !isStrategyEnabledForAssetClass(input.strategy, resolvedAssetClass)) {
```

**Type guarantee, `signal_quality_evaluator.ts:75`:**
```ts
export interface SQEInput {
  ...
  strategy: string;   // ← non-optional, type-guaranteed string
  ...
}
```

**Behavioral analysis:** `input.strategy && X` evaluates `X` iff `input.strategy` is truthy. Since `strategy: string` is non-optional, the only falsy value possible at this site is empty string `""`. An empty-strategy SQEInput is a type-system violation upstream (no caller would pass it intentionally) AND would not be a "valid signal" semantically. The truthy guard is dead defensive code.

**Post-B79.0b expected:**
```ts
if (!isStrategyEnabledForAssetClass(input.strategy, resolvedAssetClass)) {
```

**Verification at code-review time:** TS compile passes; `b79-0b-*.test.ts` + existing SQE tests still green; line 285 (also has `input.strategy &&` truthy in &&-chain) explicitly LEFT ALONE per scope §7 Q1 — that chain has a needed truthy on `input.regimeStability` (optional field) and removing only the strategy part of the chain is non-essential surgical change.

**Single call-site grep confirmation:**
```
$ grep -nE "input\.strategy && " server/core/filters/signal_quality_evaluator.ts
199:    if (input.strategy && !isStrategyEnabledForAssetClass(...))   ← FIX TARGET
285:    if (!options.skipGovernanceGate && input.strategy && input.regimeStability)   ← LEAVE
```

### §1.2 — N4 boundary-test coverage rationale

**Existing coverage (`server/tests/unit/asset-classes.test.ts`):**
- `B69 asset class registry` (8 IDs, metadata, isValidAssetClass type guard, archive table mappings)
- `B69 resolveAssetClass — crypto_spot` (canonical, raw, USDT)
- `B69 resolveAssetClass — xstock_spot` (canonical, kraken-equities exchange dispatch, display form)
- `B69 resolveAssetClass — crypto_perp` (kraken-futures, non-PF)
- `B69 resolveAssetClass — xstock_perp` (PF_*XUSD)

**Coverage gaps (B79.0b targets):**

| Surface | Existing | B79.0b adds |
|---|---|---|
| `isXstockMarketOpenUTC` | NONE | `b79-0b-market-hours.test.ts` — 12 cases: weekday open/closed; Friday close transition (21:59/22:00/23:00); Saturday all day; Sunday open transition (14:30/21:59/22:00/23:00); default-arg fallback |
| `bootstrapXstockSpotInstances` idempotency | NONE | `b79-0b-asset-class-instances.test.ts` — same-reference on second call; `_testResetXstockSpotInstances` clears cache; `inMemoryOnly:true` flag; `getAssetClassInstances('crypto_spot')` returns null; unsupported class throws |
| `safeResolveAssetClass` null-return | NONE — `asset-classes.test.ts` covers the throwing variant only | `b79-0b-safe-resolve-asset-class.test.ts` — valid pattern returns AssetClass; unknown returns null; empty string returns null; unsupported exchange returns null; emits console.warn (operator visibility) |

**Surface NOT added (out of scope per Langston Q2):**
- `symbol-normalize.ts` — already covered by `B69 resolveAssetClass` chain; idempotency covered by the `normalize → resolve` round-trip in existing tests.
- `orb.ts` Q-D-gated detect path — strategy is dormant Day 1; testing the disabled-by-default path would be testing the obvious (returns null when `enabled=false`); enable-test deferred to whichever B79.x batch flips ORB on with calibrated params.

### §1.3 — Wildcard DELETE preconditions (live signals)

Per scope §4 Q3 + §6 sequencing, the +48h gate uses LIVE signals (mirror of B79.TEC.b Finding 1 fix):

| Signal | Source | Threshold |
|---|---|---|
| ≥48h elapsed since B79.0a Migration 2 | `date -u "+%s"` vs known timestamp | ≥ 1778276280 + 172800 |
| Per-class rows present + values match | psql query on `(sqe_config, *, <crypto/xstock>_spot, *, *, min_final_score/min_regime_weight)` | exactly 4 rows; values 0.35/0.30 |
| Wildcards still present | psql query on `(sqe_config, *, *, *, *, ...)` | exactly 2 rows |
| TEC + xstock-scanner diagnostics | `/api/diagnostics/tec-bootstrap` + `/api/diagnostics/xstock-scanner` | both ready |
| No-touch fence | `regime_factor_alternates` cadence on crypto_spot | ±10% of pre-deploy baseline |
| CI green | `gh run list` | Build + Docker + Test Suite green (TS Check legacy tolerated) |

If ANY precondition fails → STOP. Do NOT execute DELETE.

### §1.4 — SIM consultation per Kyle directive

| File | Layer | B79.0b touch | Blast radius | SIM update at Step 10 |
|---|---|---|---|---|
| `server/core/filters/signal_quality_evaluator.ts` | 4 (Filter) | N3 surgical: drop redundant truthy on line 199 | LOW (no semantic change; `input.strategy: string` type-guaranteed) | NO (no semantic change to log) |
| `server/tests/unit/b79-0b-market-hours.test.ts` | 11 (Tests) | NEW | ZERO at runtime | YES (minor — note coverage expansion) |
| `server/tests/unit/b79-0b-asset-class-instances.test.ts` | 11 (Tests) | NEW | ZERO at runtime | YES (minor) |
| `server/tests/unit/b79-0b-safe-resolve-asset-class.test.ts` | 11 (Tests) | NEW | ZERO at runtime | YES (minor) |
| `scripts/b79-0a-sqe-remove-wildcards.sql` | DB | NEW (committed-not-executed) | LOW (signature-guarded; runs against 2 specific rows) | YES (minor — note Step-2 manual operator action) |
| `Claude Comms and Packages/Scope Files/BATCH_79_0b_VERIFY_CHECKLIST.md` | Governance | NEW | ZERO at runtime | NO (governance doc) |

**Upstream/downstream for `signal_quality_evaluator.ts` (per SIM):**
- Upstream: vts-runner, signal-orchestrator, paper-execution-engine (callers of `evaluateSignalQuality`)
- Downstream: returns SQEResult to callers; affects signal admission gate
- Shared state: `_b79StrategyDisabledCount` module counter (cosmetic)
- Background execution: synchronous per-call
- Blast radius: HIGH for behavioral changes; B79.0b change is a no-op refactor (truthy on type-guaranteed string)

---

## §2 — Implementation sequence (Step 3)

1. ✅ N3 fix at `signal_quality_evaluator.ts:199`
2. ✅ 3 new test files (`b79-0b-market-hours.test.ts`, `b79-0b-asset-class-instances.test.ts`, `b79-0b-safe-resolve-asset-class.test.ts`)
3. ✅ Wildcard-DELETE script `scripts/b79-0a-sqe-remove-wildcards.sql` (committed-not-executed)
4. ✅ Verify checklist artifact `BATCH_79_0b_VERIFY_CHECKLIST.md`
5. Run test suite locally (skip — CI is the verification gate per repo policy)
6. Commit + push
7. Wait for CI green (Test+Build+Docker — TS Check legacy tolerated)
8. Deploy to Hetzner staging
9. Step 7 first-pass verify (HTTP 200, diag endpoints ready, no-touch fence, no new TS errors)
10. Step 8 Langston second-pass
11. Step 10 governance + Step 11 completion report

---

## §3 — Hostile sim plan

Trivial for B79.0b — N3 is a no-op refactor; N4 tests are isolated; wildcard-DELETE has its own integration verify per `BATCH_79_0b_VERIFY_CHECKLIST.md`. No additional hostile-sim required.

---

## §4 — Acceptance for Step 1+2 close

- [x] Scope rev 1 + this PIA committed
- [ ] Langston APPROVE on scope (in flight via watchdog v2 idle-timeout 600)
- [ ] Langston APPROVE on PIA (combined with scope review per file-first protocol)
- [ ] Step 3 implementation already in progress in parallel (committed at the same time as PIA per Langston "merge-eligible" pattern from B79.0a Step 5)

---

*End BATCH_79_0b_PRE_AUDIT.md rev 1.*
