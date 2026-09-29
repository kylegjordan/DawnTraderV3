# B-SIZING-DEC-RESTORE — increment 2c change list (Step 4): Portfolio Risk per Trade retired, in paper AND live

## Dispatch header (the three fields)
| # | field | value |
|---|---|---|
| i | **Declared change-class** | `architecture` (`B_SIZING_DEC_RESTORE_SCOPE.md` header, unchanged at r8) |
| ii | **That class's doc set** | scope — present (r8, obj-3) · pre_audit — present (`B_SIZING_DEC_RESTORE_PRE_AUDIT.md` **§17** audit A1-A13 + plan P-1..P-12, **§17.4** your ruling C1-C6, **§17.5** as built) · completion_report — absent, due at batch close (Step 11) · batch_catalog — absent, due at close · phase_history — absent, due at close · system_manual — absent, **due at Step 10** (the sizing chapter loses the risk % as an input; the one-formula statement goes in) · sim — absent, **due at Step 10** (guardrails_v2 column set, the two deleted routes, `config-update-service` gone, `tradeNotional` as a shared component) · running_issues — present (**`#1106` new**; `#1105` from the §17 ruling) · deleted_log — present (2c entry, 2026-09-29) · changes_and_fixes — judged at Step 10 · roadmap — N/A (no roadmap item moves) · phase_19_plan — N/A (history since 2026-09-28; the active plan is `SPRINT_TO_LIVE_PLAN.md`, row 9b added) |
| iii | **Step-2 reference** | `B_SIZING_DEC_RESTORE_PRE_AUDIT.md` §17 (audit + plan), §17.4 (your PROCEED with C1-C6) |

**tsc baseline:** 377 → 372 (re-synced, reason in §17.5) · **code commits:** `7219de4c7` (2c) + the commit carrying this revision (the fresh-reader round's fixes, §17.6) · **graded ref:** the commit carrying this list · CI stated in the dispatch

## What 2c is
Kyle (2026-09-29): of Portfolio Risk per Trade and Max Position Percent, the one not used goes — in paper AND live. Paper has sized every trade by the exposure budget × max position % since 2026-08-07. **The active engine's live arm re-sized as balance × risk % ÷ stop distance** — unbounded (200% of the balance at a 2% stop) with nothing after it re-checking exposure or max position (your J-1). ⚠️ **Corrected before this dispatch (§17.6): that arm had NO live instance** — the active engine is only ever started in paper (`active-engine-service.ts:477`, `const mode = 'paper'`), and live mode today opens through the legacy TradingEngine (`trading-engine.ts:265-267`, `$100 ÷ stop`, behind the Phase-21 gate at `routes.ts:3862-3890`, removed by sprint row 79 — PRE_AUDIT A13 already named it). So 2c changes no live trade today; it removes the sizer the Phase-21 live build would have inherited. After 2c the active engine has ONE trade-size formula in every mode; the two openers outside it are the legacy engine (row 79) and `POST /api/paper/trade/test` (`#928`).

## ⚠️ One deviation from the approved plan — P-3 (please rule)
P-3 said: give `buildSettingsFromGuardrails` its real return type. Doing it took tsc 377 → **455**: **24 fields that code reads and the builder never sets** (so they are `undefined` at runtime — engine blacklist/whitelist, AI-prompt strategy parameters, the legacy engine's stop buffer) plus **14 functions still typed on the legacy row**. Each is its own provenance read, so it is homed as **`#1106` `B-SETTINGS-REAL-TYPE`, sprint row 9b**, full field → site list in §17.5. 2c keeps the legacy type; the builder no longer returns `riskPerTradePct`, and the legacy-deletion fence bans `.riskPerTradePct` and the other retired names instead (mutation-proved). **Ask: accept the substitution, or hold 2c for the type.**

## P-1 — the engine takes the fixed-notional quantity in every mode (`active-execution-engine.ts`)
BEFORE:
```ts
if (this.mode === 'paper' && signal.quantity && signal.quantity > 0) {
  quantity = signal.quantity;
  portfolioValue = cycleContext?.portfolioValue || 0;           // cycleContext never passed ⇒ 0
  const riskPct = parseFloat(String(cycleContext?.guardrails?.portfolioRiskPerTradePct || '1.50'));
  riskAmount = (portfolioValue * riskPct) / 100;                 // ⇒ 0
} else {                                                         // LIVE
  const riskPerTradePct = parseFloat(settings.riskPerTradePct || '4.0');
  riskAmount = (portfolioValue * riskPerTradePct) / 100;
  quantity = stopDistance > 0 ? riskAmount / stopDistance : 0;   // unbounded
}
```
AFTER:
```ts
let quantity: number = signal.quantity ?? 0;
if (!(quantity > 0)) {                                           // covers 0, negative, NaN, undefined
  console.error(`[B-SIZING-DEC-RESTORE][UNSIZED_AT_EXECUTION:${this.mode}] ...`);
  rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'SIZING_INVALID', `unsized at execution (quantity=${signal.quantity})`);
  return { opened: false, stage: 'SIZING_INVALID', reason: `unsized at execution (quantity=${signal.quantity})` };
}
const portfolioValue = await getPortfolioBalanceV2(this.mode);  // recorded on the audit row only
```
The `quantity <= 0` re-check that followed is deleted (the refusal above covers it; it could no longer fire). The never-passed `cycleContext` parameter is deleted; the AJ19 dry-run line reads `Number(settings.portfolioValue)`.
**C2 — why an unsized signal cannot reach the refusal by a new path:** `executeSimulatedTrade` has ONE call (comment-stripped source), `processSignal`'s `return await this.executeSimulatedTrade(signal, settings)`, and on every path to it `processSignal`'s B6 block has already run: pre-sized ⇒ trusted (`[B6][TRUST_SIZED]`), else sized by `sizeActivePositionForSignal` (`[B6][FALLBACK_SIZED]`), else it returns `SIZING_INVALID` (zero result, or a balance ≤ 0). Pinned by `b-sizing-inc2c-risk-retired.test.ts` §3 (one call; after B6).
**What the active engine's live arm now takes (it has no live instance today), stated:** the B6 quantity × the posture multiplier `modeOverlay?.positionSizeMultiplier ?? 1`. The overlay is null (AMR inactive), so ×1 (the seeded aggressive dial is 1.25); activation is governed by your C-5 (scope obj-5 — the term moves inside `resolveEffectivePositionPct` first). Pre-sized signals are trusted as they arrive (`TRUST_SIZED`) — RTB entries are sized by the orchestrator's `buildSizedSignalForStrategy` (fixed-notional), and the max-position check re-reads the notional.

## P-2 / C3 — the audit row records the truth
```ts
riskAmount: (quantity * Math.abs(actualEntryPrice - signal.stopPrice)).toFixed(2),   // was riskAmount.toString() ⇒ 0 in paper
```
For a TAKER open, `quantity` is re-set to `_openFill.fillQty` after the depth-walk and before this write (test §4 pins the order), so a partial fill is not overstated. ⚠️ **For a MAKER left resting at its limit nothing has filled yet**: the row records the requested, lot-rounded quantity × |limit − stop| — the risk IF it fills (round 3; the comment now says so). `portfolio_value` is the working balance (was 0 on 52 of 52 paper opens in 7 days).

## P-4 / P-5 — one formula (`active-position-sizing.ts`)
```ts
export function tradeNotional(balance, maxTotalExposurePct, maxPositionPct, bufferFactor) {
  return balance * (maxTotalExposurePct / 100) * (maxPositionPct / 100) * bufferFactor;
}
export function bufferedTradeNotional(balance, maxTotalExposurePct, maxPositionPct) {
  return tradeNotional(balance, maxTotalExposurePct, maxPositionPct, getMaxPositionBufferFactor());
}
```
Users: the sizer (`bufferedMaxNotional`), the paper size band (`tradeNotional`, buffer passed in), the max-position check's unsized-candidate branch and the validator's estimate. **The max-position check** (`trade-safety.ts`, the branch for a candidate with no pre-computed notional — the legacy TradingEngine and the validator): was `risk % (fallback '4') ÷ stop distance`; now `bufferedTradeNotional(portfolioValue, maxTotalExposurePct, maxPositionPercent)`, and an unreadable exposure budget REFUSES (`GUARDRAIL_READ_FAIL`), like the cap above it. **The validator:** the estimate is the same formula, `quantity = estimate ÷ entry`; the throw on a null risk % (which blocked every validation once the column goes) is replaced by a throw on an unreadable balance, exposure or position %. Both use the raw position %, the largest size the sizer can give (the pattern pool only caps it lower — `resolveEffectivePositionPct` takes `min`).

## P-6..P-9 — everything that only served the field (deleted; `DELETED_COMPONENTS_LOG` 2c entry)
- `guardrail-settings.ts`: `getRiskPercentageV2`, `calculateRiskAmount`, the deprecated `getRiskPercentage` + `buildSettingsFromModeLevel`; the builder's `riskPerTradePct`.
- `guardrail-policy.ts` + `audit/coherency_rules.yaml` + the rules tab: **RULE_001** (risk ≤ 50% × kill switch) and **RULE_006** (0.10-5.00 range); `detectOverrideConflict` (0 callers). **What is no longer bounded — one trade's worst-case loss against the kill switch — is `#1105`, Kyle's decision (row 9a).** YAML parses (the app's `yaml`) to RULE_003/004/005/007/009/010/011/012/013; RULE_010's caps and integration lists updated.
- `routes.ts`: **`POST /api/guardrails/test` and `POST /api/test/simulate-loss` deleted** (your J-3; 0 callers in `client/` + `scripts/`, control `guardrails-v2` found in 3 client files). `PUT /api/guardrails-v2` with the field ⇒ **422 `RETIRED_FIELD`** (the 2a pattern). Config snapshot fields and columns list updated.
- `config-update-service.ts` (whole file, 0 importers; moved from 2d).
- Display/pass-through: Core Four panel, config snapshot viewer, state summary, startup `[Audit]` lines, storage update merge, the sizing audit's `riskPct`, the e2e script.
- **Found by the fresh-reader round and deleted in this revision:** in `types/config.ts`, the field in `GuardrailsSchema` (it REQUIRED it), `getPortfolioRiskPct`, and `validateGuardrails` (imported by `routes.ts`, never called); the legacy-key map now points `riskPerTrade` at `maxPositionPercentPct`. In `trade-safety.ts`, `calculatePositionSize` — a risk ÷ stop sizer with 0 callers (`asset-capabilities.ts` has an unrelated method of the same name).
- **Left, named:** the legacy `trading_settings.risk_per_trade*` columns (a different table); the `#518` dormant block in `trade-safety.ts` (its own home); unrelated `riskPerTrade` names (VTS config, strategy params, AI prompts); `command-router.ts:285-297` writes `riskPerTrade` to the legacy settings and is dead (`#136`); the old drizzle-kit folder `migrations/0000_*.sql` + snapshots still declare the column (tooling only — deploys use `db:migrate`, never `db:push`).

## P-10 / C1 / C5 — the migration
`drizzle/migrations/2026-09-29-b-sizing-inc2c-retire-portfolio-risk.sql`: drops the CHECK and both columns (`guardrails_v2`, `goals_presets`) with `IF EXISTS`, **no CASCADE** (2a drops the four views first; if they exist the drop fails loudly), then a `DO` block that raises if the column survives. Rollback beside it, in git: both columns, the CHECK, the default, NOT NULL and every value (paper 1.95, live 4.00, the 10 presets by id). **It runs BEFORE 2a's rollback.** Drizzle declarations removed in the same commit (C1). **Exercised on a scratch database (§17.5):** forward ⇒ gone; the OLD goal-preset select fails, the NEW one works (5 rows); forward again IDENTICAL; 2a's rollback first FAILS (order control); 2c rollback restores values exactly; then 2a's rollback succeeds; forward again IDENTICAL.

## Deploy and rollback properties (stated, from the fresh-reader round)
- **At the deploy:** `dt-deploy` builds, runs `db:migrate`, then restarts. For the seconds between the migration and the restart, the OLD process (which still declares the column) fails its guardrail and goal-preset reads — the guardrail reads are fail-closed, so signals are refused in that window, not sized wrong. Same shape as 2a's drop; not measured.
- **Rollback:** the SQL goes BEFORE the code (the rollback header said the opposite; corrected). **All five of this batch's rollbacks (p5, 2a, 2b, 3, 2c) now delete their forward file's `_migrations` row** (round 2), so a redeploy after a rollback re-applies the forward file instead of skipping it. This rollback, then 2a's, then the older code. It is not re-runnable (`ADD COLUMN` without `IF NOT EXISTS` fails loudly in its transaction) and restores `goals_presets` by the 10 ids read on 2026-09-29 (nothing inserts into that table).
- **The migration's final check** reads the very tables the ALTERs resolved to (`to_regclass` + `pg_attribute`, round 3; it was `current_schema()` after round 1) and raises if either does not resolve — positive-controlled on a throwaway database (present → raises; other schema only → passes; missing → raises): a second `guardrails_v2` table exists in schema `dawntrader_v2` (measured on the live database, without this column). The only objects depending on the column there: its default, its CHECK, and the four views 2a drops (`pg_depend`: 4 rewrite rules, 1 default, 1 constraint; no publication).
- **Re-exercised on a scratch database after the edit**, same run as before and the same results (files run = worktree md5 `49ad6adc` forward, `74132a07` rollback).

## Tests
New `unit/b-sizing-inc2c-risk-retired.test.ts` (11): the formula; the sizer = the helper; the band = the helper; the two unsized callers use it; no mode-conditioned quantity, no risk ÷ stop, no `'4.0'`; the refusal; C2 call graph; C3 audit order; no `cycleContext`. Fence obj-3 section (retired names + a mask for the 422) — **widened at the reader round to shared/, types/ and scripts/** with a positive control that it reaches them, plus whole-word checks for `validateGuardrails` and `calculatePositionSize`; putting the field back into `types/config.ts` fails exactly one check (mutation-proved). Updated: `p19-b8-8-sizing-fail-loud`, `b-sizing-inc2a-derived-slots`, `b-guardrail-fail-closed`, `b-sizing-inc2b-cooldown-exact`, `b79-0n-orchestrator-cascade`. **Mutations:** restoring the paper-only condition fails the mode test; **a wording-independent test pins the two quantity reassignments inside `executeSimulatedTrade` (lot rounding, fill), and two reworded re-size attempts each fail it (round 3)**; the field as a required sizer input fails the sizer tests; a planted `.riskPerTradePct` read fails the fence.

## The fresh-reader round, recorded (PRE_AUDIT §17.6)
`REVIEWER r1: claim-only · "every opener sizes by the fixed notional; no risk ÷ stop; unsized refused" · HITS — the active engine is paper-only, live opens via the legacy engine; a dead risk ÷ stop sizer; the test route's body quantity · re-derived y` — `REVIEWER r1: claim-only · "nothing reads the dropped columns; rollback order" · HITS — types/config.ts requires the field; the rollback header's code-first order; the unscoped final check · re-derived y`. `REVIEWER r2: claim-only · both claims, corrected, at 3b2634e06 · one fold (every rollback of this batch now deletes its forward file's _migrations row); the rest already homed (#1090, #297, #578 / row 79, C-5) or withdrawn on a live-database measurement · re-derived y`. `REVIEWER r3: object · C1-C7 at 026b13226 · behaviour matches; the audit comment was wrong for a resting maker (fixed), the migration check and the quantity test hardened, four claims narrowed · re-derived y` (§17.6.2). **The loop stopped at its cap of three rounds; the round record above is the whole of it.**

## Judgement calls to attack
1. **The P-3 substitution** (above).
2. **Refuse, don't re-size, at execution** — an unsized signal reaching `executeSimulatedTrade` is now a `SIZING_INVALID` open-failure, in every mode. Correct as a safety net given C2, or should it throw?
3. **The unsized-candidate cap check sizes pre-covariance** — so it checks the largest size, and can refuse a candidate the sizer would have shrunk under the cap. Conservative direction; only the legacy engine and the validator reach it.
