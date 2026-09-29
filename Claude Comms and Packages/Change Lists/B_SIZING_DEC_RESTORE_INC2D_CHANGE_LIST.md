# B-SIZING-DEC-RESTORE — increment 2d change list (Step 4): the legacy sweep

## Dispatch header (the three fields)
| # | field | value |
|---|---|---|
| i | **Declared change-class** | `architecture` (`B_SIZING_DEC_RESTORE_SCOPE.md` header, unchanged at r8) |
| ii | **That class's doc set** | scope — present (r8) · pre_audit — present (`B_SIZING_DEC_RESTORE_PRE_AUDIT.md` **§18** audit + plan, **§18.5** your ruling, **§18.6** as built) · completion_report — due at batch close · batch_catalog — due at close · phase_history — due at close · system_manual — **due at Step 10** (with 2c's rules section + its `sections/PHASE4_…` mirror: the sizing chapter loses the clamp-bind input, the cooldown reads one table in both modes, the per-underlying cap fails closed) · sim — **due at Step 10** (the deleted modules and routes, the retired stream, `:95`'s Phase-25 note, the refusal at execution entry against the `:81` invariant) · running_issues — present (`#1108`, `#1109`, `#1110` new; notes on `#1089`, `#664`, `#297`, `#1096`, `#399`) · deleted_log — present (2d entry) · changes_and_fixes — judged at Step 10 · roadmap — N/A · phase_19_plan — N/A (history; the active plan's rows 9c, 9d, 9e added) |
| iii | **Step-2 reference** | `B_SIZING_DEC_RESTORE_PRE_AUDIT.md` §18 (at `758794487`) and your ruling §18.5 (19:40Z) |

**tsc baseline:** 372 → 367 (reason in §18.6; plus one pre-existing TS2345 on the manual-close payload re-worded by its new `assetClass` field — re-synced, net zero, your P-14 note) · **graded ref:** the commit carrying this list · CI stated in the dispatch · **P-6 (`never_filled`) is not in this change** — it waits on Kyle.

## What 2d is
The rule-18 sweep of what increment 2's census found, plus three silent fallbacks turned into loud refusals, and the clamp-bind stream retired per your blocker.

## Deletions (full table, census and archive paths: `DELETED_COMPONENTS_LOG`, 2d entry)
- `getEffective` + its two dead consumers + the widget (`#1089`); **the low-price values stay in the DB and `#518` still owns the protection** (your P-1 condition).
- `POST /orchestrator/updateGuardrail` + its schema + the AI Transparency branch (`#1090`; 0 `guardrail_update` rows on staging).
- Both AJ18 modules, their 5 routes, the engine's 3 calls — **state-write census: in-memory only; readers were the uncalled routes.** A boot-clean check follows the deploy.
- `POST /test/attempt-trade`; the M5E harness and its 5 routes (**armed**: `disablePassiveLearning()` then `startActiveEngine('m5e-validation', { startingBalance: 827 })`).
- The clamp-bind stream and the sizer's `wasClamped` / `effectiveRiskFractionRatio` (your BLOCKER; `#1110`, row 9e).

## P-5 — the live cooldown (`trade-safety.ts`)
BEFORE: `if (mode === 'paper') { … getLastClosedAtForSymbol(mode, …) } else { const lastTrades = await storage.getTrades(mode, { symbol, status: 'closed', limit: 1 }); … }`
AFTER: `const closedAt = await storage.getLastClosedAtForSymbol(mode, trade.symbol, trade.assetClass ?? null);` — both modes.

## P-7 — the stamp (`active-execution-engine.ts`, `ready_to_buy_service.ts`)
```ts
// processSignal, execution entry
const _amrStamp = asValidAssetClass(signal.metadata?.assetClass);
if (!_amrStamp) {
  console.error(`[B-SIZING-DEC-RESTORE][STAMP_MISSING_REFUSED] …`);
  rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'UNCLASSIFIABLE', 'no valid asset-class stamp at execution entry');
  return { opened: false, stage: 'UNCLASSIFIABLE', reason: '…' };
}
const _amrClass = _amrStamp;              // was: _amrStamp ?? safeResolveAssetClass(signal.symbol, 'kraken') + a warn
// queueSQESignal
const resolvedAssetClass = asValidAssetClass(input.assetClass);   // was: input.assetClass (any string)
if (!resolvedAssetClass) throw new Error(`[B-SIZING-DEC-RESTORE][STAMP_INVALID] …`);
```
No ladder deleted (your P-7 ruling); the signal-side set is named left-intentionally.

## P-9 — the per-underlying cap (`per-underlying-cap.ts`, both callers)
**The premise, as you asked:** the comment above the reads said *"If a row is missing … default to safe values"* and did the opposite — `?? false` on `b67_3_enabled` DISABLED the cap on a missing row, and `?? 2` invented a cap.
```ts
const enabledRaw = await getConstant<unknown>('per_underlying_cap', 'b67_3_enabled', GLOBAL_KEY);
if (typeof enabledRaw !== 'boolean') throw new PerUnderlyingCapConfigError('b67_3_enabled', enabledRaw);
// … the split row (boolean) and the cap row (a positive integer) the same way
// signal-orchestrator catch (was: log "allowing through", fall through)
const why = classifyPerUnderlyingCapFailure(err);          // 'config_missing' | 'lookup_failed'
if (_fClass) recordActivePostSqeReject(sizingContext.mode, _fClass, `position_cap_${why}`);
return null;
// vts-runner catch (was: log "allowing through", fall through)
setNullReason(`per_underlying_cap_unavailable_${why}`);   // distinct from 'per_underlying_cap' (a real cap reject)
return null;
```
Staging's rows are JSON `true` / `true` / `2` (`jsonb_typeof`, measured), so the strict checks pass on live values. **Ships unexercised; the tests are the evidence, and post-deploy silence is not.**

## Folded after the fresh-reader round (§18.6.1)
- **The active lane's per-underlying cap counted the legacy `trades` table** (0 rows on staging), so it never limited an active signal. It now counts `storage.getActiveOpenPositions(mode)`. **A restored risk control — it changes what opens after the deploy.**
- **Manual and stranded closes carry `position.assetClass`** (they took the `crypto_spot` default; 0 such rows to date).

## Folded after the object round (§18.6.2)
- **`queueSQESignal` checks the class FIRST** — it sat below the tiebreak, which expires the incumbent before the throw.
- **The fence stripper strips full-line comments first** (all six copies) — a `/api/*` line comment hid ~500 lines of `routes.ts` from every fence scan; a positive control now asserts that stretch is scanned.

## Folded after Langston's Step-4 ruling (§18.7)
- **The cap counts SAME-CLASS opens only** (FINDING-1) — inside `checkPerUnderlyingCap`, for both callers; the VTS had the same collision.
- **The VTS counts all three cap refusals as post-signal rejections at `tcl`** (FINDING-3) — one table, `classifyVtsNullReason`.
- **`STAMP_MISSING` stage** (nit a); **the fence pins false block openers** (nit b, wider: in-string openers too).
- **Not folded:** the cohort split (FINDING-2) is Kyle's — row 9f, `#1111`; M5D — row 9g, `#1112`.

## Tests and mutations
⚠️ **Corrected at Step 4 (§18.7): of the 10 below, SIX are source-text assertions and FOUR drive the cap module; nothing drives the orchestrator catch or the count switch.** See §18.6 and §18.6.1: 10 new tests (the two folds each fail when reverted) (pre-2d cap file fails 3, pre-2d orchestrator fails 1), 2 new live cooldown tests (pre-2d `trade-safety` fails both), the fence's 2d section (a planted route string fails exactly 1).

## Judgement calls to attack
1. The P-9 refusal on the VTS reason names: one per failure class (`…_config_missing`, `…_lookup_failed`) rather than the single `per_underlying_cap_unavailable` you wrote — your "distinct reasons, never collapsed" applied to the VTS too.
2. `ready_to_buy_service.ts:~2127` (the blocked-signal log's class ladder) left, like the engine's signal-side set.
3. The M5D harness beside M5E: untouched and unaudited — a census, or leave it?
