# B-SIZING-DEC-RESTORE — increment 2a change list (Step 4): retire `max_open_positions`, derive the slot count

## Dispatch header (the three fields)
| # | field | value |
|---|---|---|
| i | **Declared change-class** | `architecture` (`B_SIZING_DEC_RESTORE_SCOPE.md` header, unchanged at r8) |
| ii | **That class's doc set** | scope — present (`Scope Files/B_SIZING_DEC_RESTORE_SCOPE.md`, r8) · pre_audit — present (`Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md`, §14 census + D1-D9, your §14.4 ruling folded at `232cd3e5b`) · deleted_log — present (`DELETED_COMPONENTS_LOG.md`, new 2026-09-29 entry, this commit) · completion_report — absent, Step 11 · batch_catalog — absent, Step 10 · phase_history — absent, Step 10 · system_manual — absent, Step 10 (the slot derivation replaces a stored setting; the coherency rule set loses 002/008) · sim — absent, Step 10 (four views and two columns gone; `deriveSlotCount` / `resolveEffectivePositionPct` become shared by five readers) · conditional: running_issues — present (no new issue; a one-line note on `#578` for R5) · pre_audit §14.5 — present (the second reader's table) · phase_19_plan — unchanged (placement `:19` stands) · changes_and_fixes / roadmap — N/A |
| iii | **Step-2 reference** | `B_SIZING_DEC_RESTORE_PRE_AUDIT.md` §14 (census and design calls) + §14.4 (your ruling on it, graded ref `a8b20eba9`) |

**Code commits:** `e41359ee8` (CI `36561934311`: TypeScript Check, Test Suite, Build, Docker Build all success) + the commit carrying this list (second-reader fixes R1-R3, below) · **tsc baseline:** 377 → 377

## What this increment is
Kyle's corrected `PAPER-RESET-3000` retires the open-slots guardrail. How many positions can be open is now **derived**: `floor(100 / effectiveP)`, from ONE function reading the sizer's own resolver. Nothing trades differently until deploy; after deploy paper's count becomes `floor(100 / 20)` = **5** (today's `p` = 20) instead of the setting's 15 — exposure already binds paper at about that — and it becomes **20** when the reset sets `p` = 5. Live derives **3**. ⛔ **2a deploys only together with 2b** (your D4 condition: `p` = 0.5 derives 200 slots until 2b's `p`-entry guard).

## Your §14.4 conditions — where each landed
| condition | landed |
|---|---|
| **BLOCKER-1** one derivation | `deriveSlotCount` exported from `active-position-sizing.ts`; called by `buildSettingsFromGuardrails`, m5e `getDynamicSlots`, `state-awareness`, the routes config snapshot and the new GET field. m5e's `floor(e/p)` and `Math.max(…, 1)` deleted |
| **BLOCKER-2** same `effectiveP` | the sizer's pattern-cap logic became `resolveEffectivePositionPct`, and the sizer itself now calls it; every slot reader passes its output. Docblock names the coupling: obj-5's posture term goes INTO the resolver |
| ×1.25 invariant test | `b-sizing-inc2a-derived-slots.test.ts`: `slots × effectiveP ≤ 100` for every `p` 0.5-100 at ×1 and ×1.25 (see judgement call 5 for what this does and does not prove) |
| D1 key kept, screen refused | key `maxOpenTrades` kept internally; the settings screen's input is gone, replaced by a read-only line `N slots — p% per position` served from the SERVER (`derivedSlots` on GET) so the client carries no second formula |
| D2 + fence names the constant + b72 check + registries | `checkMaxOpenTrades` / `getMaxOpenTradesDefault` / `MAX_TRADES` gone; the constant row goes in the migration; `b72-warmup.ts:187` checks only for a ZERO-row module and `guardrail_defaults` keeps one row; `CURRENT_SETTINGS_REGISTRY.md` + `LEVER_INVENTORY.md` annotated (the registry is auto-generated; annotated, regenerate after deploy) |
| D4 + unbounded-`p` condition | one migration (below); 2a/2b single deploy stated in the migration header, the deletion-log entry and as a TEST (`p` = 0.5 ⇒ 200, loops do not halt — named as the known gap) |
| D7 successor named | RULE_002 + RULE_008 deleted from YAML, policy code and the rules tab in one commit; the successor is increment 1's RULE_012 + 2b's guard |
| D8 criteria-limiter + comment; config/staging.json | file deleted + archived; comment at `ready_to_buy_service.ts:997` fixed; `config/staging.json` untouched (no reader) |
| D9 fence + `p`=0 leg + positive control | fence extended with 8 names; `p` = 0 ⇒ Infinity ⇒ HALT leg; positive control = the scan must SEE `maxOpenPositions` in `routes.ts` code (the 422 guard) before masking |

## The load-bearing hunks

**`server/services/active-position-sizing.ts` — the resolver and the derivation**
```ts
export function resolveEffectivePositionPct(maxPositionPct: number, sourcePool: 'quant' | 'pattern', assetClass?: AssetClass): number {
  if (sourcePool !== 'pattern') return maxPositionPct;
  const patternMaxPct = getPatternPoolGuardrailsForAssetClass(assetClass as AssetClass).MAX_POSITION_PCT * 100;
  return Math.min(maxPositionPct, patternMaxPct);
}
export function deriveSlotCount(effectivePositionPct: number): number {
  return Math.floor(100 / effectivePositionPct);
}
// in the sizer — BEFORE: let effectiveMaxPositionPct = safeMaxPositionPct; if (pattern) { …min with the cap… }
// AFTER:
  const effectiveMaxPositionPct = resolveEffectivePositionPct(safeMaxPositionPct, signalSourcePool, params.assetClass);
```
**`server/services/guardrail-settings.ts` — the count the engine's promotion loops read**
```ts
// BEFORE
    maxOpenTrades: guardrails.maxOpenPositions,
// AFTER
    maxOpenTrades: deriveSlotCount(resolveEffectivePositionPct(parseFloat(String(guardrails.maxPositionPercentPct)), 'quant')),
```
**`server/services/m5e-validation-service.ts` — the twin, removed**
```ts
// BEFORE
    const dynamicSlots = Math.floor(maxExposure / maxPosition);
    return { slots: Math.max(dynamicSlots, 1), maxExposure, maxPosition };
// AFTER
    const dynamicSlots = deriveSlotCount(resolveEffectivePositionPct(maxPosition, 'quant'));
    if (!Number.isFinite(dynamicSlots) || dynamicSlots <= 0) { console.error(`…[M5E_SLOTS_UNDERIVABLE]…`); return null; }
    return { slots: dynamicSlots, maxExposure, maxPosition };
```
(`null` was already this function's refusal value for unreadable fields; both callers handle it.)

**`server/routes.ts` — PUT `/guardrails-v2` refuses the retired field**
```ts
      if (rawPayload.maxOpenPositions !== undefined) {
        return res.status(422).json({ ok: false, code: 'RETIRED_FIELD',
          detail: 'maxOpenPositions is retired: how many trades can be open is derived from maxPositionPercentPct (floor(100 / p)). Change the position % instead.',
          fieldName: 'maxOpenPositions' });
      }
```
Both clients that PUT this route send only edited keys (`core-four-guardrails.tsx`, `low-priced-protection-card.tsx`), and the input is gone, so neither can trip it.

**`server/services/trade-safety.ts` — the check that is deleted (archive: `_archive/deleted-code/trade-safety.checkMaxOpenTrades…removed`)**
```ts
  const maxOpenTrades = (settings as any).maxOpenTrades || getMaxOpenTradesDefault();   // silent 5
  if (activePositions.length >= maxOpenTrades) return { ok: false, code: 'MAX_TRADES', … };
```

**`drizzle/migrations/2026-09-29-b-sizing-inc2a-retire-max-open-positions.sql`**
```sql
BEGIN; SET LOCAL lock_timeout = '5s';
DROP VIEW v_guardrails_transitional; DROP VIEW v_guardrails_compliance;
DROP VIEW v_guardrails_active;       DROP VIEW v_goals_active;
ALTER TABLE guardrails_v2 DROP CONSTRAINT guardrails_v2_max_open_positions_check;
ALTER TABLE guardrails_v2 DROP COLUMN max_open_positions;
ALTER TABLE goals_presets DROP COLUMN max_open_positions;
DELETE FROM module_constants WHERE module_name = 'guardrail_defaults' AND constant_name = 'max_open_trades_default';
COMMIT;
```
Read on staging before writing: `pg_depend` lists exactly these four views; the only constraint naming the column is that CHECK (`goals_presets` has none); the constant row is the only one of its name; values live 12 / paper 15, presets 3/5/8/12/5 per mode. All four views and the CHECK are created by `2026-04-22-initial-schema.sql`, so CI's fresh database runs this migration against the same objects.

## Judgement calls — attack these
1. **The rollback RECREATES the views** (your D4 accepted "views not recreated"). I recreated them from `pg_get_viewdef` so the rollback is a full reversal; costs nothing, and a rollback that silently drops four objects is lossy. **Tell me if you want them left out.**
2. **The rollback has never been EXECUTED** — CI applies forward migrations only; there is no local Postgres. It is written from values and definitions read on staging today. Residual stated rather than claimed covered.
3. **Removed the chat command "set max open trades to N"** (`intent-parser.ts`). It fed `command-router`'s generic `storage.updateTradingSettings`, whose implementation is commented out since Phase 41F-L — so it could only fail. The generic path (still fed by the max-exposure command) is left for 2b's `#1090` family.
4. **Removed `logSlotState` + `slotStateSnapshots`** and the diagnostics route's `slotStateSnapshots` field: the writer had no callers, so the route served an empty list. That is an API-shape change on a diagnostics route; no client reads the field (grep `client/src`: 0).
5. **What the ×1.25 invariant test proves, stated narrowly:** `slots × effectiveP ≤ 100` holds BY CONSTRUCTION for any value passed through `deriveSlotCount`. The test records that the construction holds at ×1.25; **the real protection is the source fence that every slot reader goes through `resolveEffectivePositionPct`** — and a fence can only check the call sites that exist today. If obj-5 adds its posture term OUTSIDE the resolver, no test here catches it; the docblock is the only guard.
6. **The screen's derived line shows the SAVED value**, not a live preview while typing — deliberate, so the client holds no second formula. It updates on save.
7. **`types/config.ts` `GuardrailsSchema`** now carries `maxPositionPercentPct` (`> 0`, `≤ 100`) and `derivedSlots` (nullable) — it is the config-snapshot type; `validateGuardrails` has no caller.
8. **Line endings:** `storage.ts` and `schema.ts` mix LF and CRLF; my first edit normalised them (689 changed lines). Rebuilt from the committed blob so only the real hunks remain (41 and 7).

## A second reader on the built code (PRE_AUDIT §14.5 holds the full table)
`REVIEWER: claim-only (two claims + the commit; it chose the objects) · what else is consistent with "nothing reads the dropped objects" and "one slot derivation" · 4 in-scope hits, 1 live start-gate, 8 homed · each hit re-derived at the code before acting`
- **R1, fixed — and 2a had CREATED it:** `POST /orchestrator/updateGuardrail` accepted `field: 'maxOpenPositions'`. Before 2a the storage merge wrote the column; after 2a it would drop it and reply "Guardrail updated successfully". The field leaves the zod enum (`shared/schema.ts`), so it is a 400. Unit leg + control.
- **R2, fixed:** `coherency_rules.yaml` MIG_003 queried the dropped `v_guardrails_transitional`. Nothing executes `migration_rules`; removed with a comment.
- **R3, fixed NARROWLY — corrected after a second round:** m5e's summary printed `floor(maxExposure / maxPosition)`; the text now matches the derivation. The CSV line now writes an empty cell for a missing value, but **that removes almost nothing**: the snapshot builder fills those fields upstream — `riskPerTrade: 3.5` and `cacheHitRate: 0.85` are hard-coded on every snapshot (`m5e-validation-service.ts:210-211`), `cacheWindow` falls back to 200 at source (`:109`, `:111`), `openPositions` becomes 0 on a read error (`:169-170`), and the summary still writes `|| 200` / `|| 0` (`:428`, `:477`). **Only the slot and exposure inventions (8, 40) are truly gone**, because `getDynamicSlots` now refuses. The rest → **2b's rule-18 census** (`riskPerTrade: 3.5` is obj-3's family).
- **Round record:** `REVIEWER r1: claim-only · 4 in-scope hits, 1 live gate, 8 homed · fixed R1-R3` · `REVIEWER r2: object (commit 22ca63174, the three fixes) · R1 and R2 satisfied; R3 OVERSTATED as "made-up values removed" · claim narrowed here, remainder homed`. R2's other observation — a stored suggestion naming the field would now fail on Approve — has **zero population**: `ai_orchestrator_logs` holds **0** `guardrail_update` rows, against 15,600 rows in its other categories (the query reaches the table).
- **R5, already homed:** the chat live path (`intent-executor.ts:474-487` → legacy `TradingEngine.processSignal`) lost the count leg of `checkGuardrailRisk` with `checkMaxOpenTrades`; exposure stands. `#578` (engine removal) + plan row `3h`; one-line note added on `#578`.
- **R6-R8 → 2b's rule-18 census:** per-underlying cap's hardcoded fallback `2`; per-strategy `maxConcurrentPositions` shown on the strategies screen and enforced nowhere; AJ18 `maxPositions` diagnostics with no callers.

## ⛔ JUDGEMENT CALL 9 — RULE ON THIS ONE (R4, not coded)
`active-portfolio-manager.ts:58` hardcodes `MAX_OPEN_POSITIONS = 10` inside `checkPortfolioHealth`. **In live mode the engine START throws when 10 or more positions are open** (`:163-170`; paper only logs it). Unreachable today — live derives 3 — but **reachable at go-live** once live runs the reset sizing Kyle described (5% ⇒ 20 slots): a live restart with 10+ open would refuse to start. It is also a third answer to "how many can be open", which is what BLOCKER-1 exists to prevent.
**My recommendation: delete the count leg in 2a.** A full book is a normal state, not a critical one, and admissions are already capped by the derived count. **Not coded, because it is a LIVE-mode start gate and Kyle's rule is that risk limits never loosen** — I want your ruling that removing a start-time check (not an admission cap) is not a loosening before I touch it. The same function's hardcoded 20% drawdown and 80% exposure legs go to 2b's rule-18 census either way.

## Honest residuals
- Local unit run: 283 of 287 files pass. The 4 failures are this laptop only — 2 need Postgres (`ECONNREFUSED`), 2 fail to parse a line-2 comment under Windows — and none imports a file changed here. CI is the judge.
- The e2e `config-snapshot.spec.ts` change was not run locally.
- `CURRENT_SETTINGS_REGISTRY.md` is annotated, not regenerated (the row still exists on staging until the deploy).
