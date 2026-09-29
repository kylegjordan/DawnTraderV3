# B-SIZING-DEC-RESTORE — increment 2a change list (Step 4): retire `max_open_positions`, derive the slot count

## Dispatch header (the three fields)
| # | field | value |
|---|---|---|
| i | **Declared change-class** | `architecture` (`B_SIZING_DEC_RESTORE_SCOPE.md` header, unchanged at r8) |
| ii | **That class's doc set** | scope — present (`Scope Files/B_SIZING_DEC_RESTORE_SCOPE.md`, r8) · pre_audit — present (`Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md`, §14 census + D1-D9, your §14.4 ruling folded at `232cd3e5b`) · deleted_log — present (`DELETED_COMPONENTS_LOG.md`, new 2026-09-29 entry, this commit) · completion_report — absent, Step 11 · batch_catalog — absent, Step 10 · phase_history — absent, Step 10 · system_manual — absent, Step 10 (the slot derivation replaces a stored setting; the coherency rule set loses 002/008) · sim — absent, Step 10 (four views and two columns gone; `deriveSlotCount` / `resolveEffectivePositionPct` become shared by five readers) · conditional: running_issues — present (no new issue; a one-line note on `#578` for R5) · pre_audit §14.5 — present (the second reader's table) · phase_19_plan — unchanged (placement `:19` stands) · changes_and_fixes / roadmap — N/A |
| iii | **Step-2 reference** | `B_SIZING_DEC_RESTORE_PRE_AUDIT.md` §14 (census and design calls) + §14.4 (your ruling on it, graded ref `a8b20eba9`) |

**Code commits:** `e41359ee8` (CI `36561934311`: TypeScript Check, Test Suite, Build, Docker Build all success) + the commit carrying this list (second-reader fixes R1-R3, below) · **tsc baseline:** 377 → 377

## What this increment is
Kyle's corrected `PAPER-RESET-3000` retires the open-slots guardrail. How many positions can be open is now **derived**: `floor(100 / effectiveP)`, from ONE function reading the sizer's own resolver. Nothing trades differently until deploy. **PREVIOUSLY STATED: after deploy paper's count becomes 5 (at today's `p` = 20) instead of 15, "and exposure already binds paper at about that". NOW: that is FALSE — 8 paper positions are open ($753.67, read 2026-09-29 by Langston and re-read by CC-C) and the book has held 7-10 on 23 of the last 31 days (Langston); the stored 15 was binding, not exposure. REASON: correlation scaling shrinks positions below full size, so more of them fit the budget than `floor(100 / p)` counts.** Deploying 2a at `p` = 20 alone would cut the cap 15 → 5 against an 8-deep book: both promotion loops stop at `openSlots ≤ 0` until it drains to 4, and the Open-Trades tab shows `8 / 5` OVER_LIMIT.
**⛔ DEPLOY ORDER, DECIDED: 2a, 2b and increment 3 (the reset) land in ONE window, and the reset runs immediately after the deploy.** The reset closes every open paper position (P1 step 2) and sets `p` = 5 ⇒ **20 slots** — no drain, no freeze. **Stated fallback:** if P1 refuses (it refuses when any held symbol has no observed price, F3), paper runs at 5 slots with no new admissions until the book drains below 5 or the reset completes; that is a tightening, and the Step-7 read-back records it. Live derives **3** (unchanged in practice: live has no positions). ⛔ **2a never deploys without 2b** (your D4 condition: `p` = 0.5 derives 200 slots until 2b's `p`-entry guard).

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
- **R3 — the formula text is fixed; the CSV edit is a safety net with NO effect today (corrected twice):** m5e's summary printed `floor(maxExposure / maxPosition)`; it now states the derivation. The CSV line writes an empty cell for a missing value, but the slot (8) and exposure (40) fills **were already unreachable before 2a** — since P19-B8.8 a snapshot is SKIPPED when `getDynamicSlots` returns null (`m5e-validation-service.ts:172-180`, unchanged by 2a). The made-up values that DO reach the report come from upstream and from the harness's fixed criteria: `riskPerTrade: 3.5` and `cacheHitRate: 0.85` hard-coded per snapshot (`:210-211`), `cacheWindow` 200 at source (`:109`, `:111`), `openPositions` 0 on a read error (`:169-170`), the summary's `|| 200` / `|| 0` (`:428`, `:477`, `:510`), a `riskPerTrade` criterion that always passes (`:448`), and an exposure pass-mark of **≤ 40%** (`:449`, `:487`) that paper's 100% fails by construction. **All → 2b's rule-18 census** (the M5E harness's stale criteria; `riskPerTrade` is obj-3's family).
- **Round record:** `REVIEWER r1: claim-only · 4 in-scope hits, 1 live gate, 8 homed · fixed R1-R3` · `REVIEWER r2: object (commit 22ca63174, the three fixes) · R1 and R2 satisfied; R3 OVERSTATED as "made-up values removed" · claim narrowed here, remainder homed`. `REVIEWER r3: object (f6c959ea1, the R3 text vs the code) · every cited line and value matches; the causal clause "because getDynamicSlots now refuses" is WRONG — the 8/40 fills were unreachable before 2a — and 40 survives as a pass-mark · text corrected above; LOOP CAP REACHED (3 rounds): the corrected text has not had a fourth reader.` R2's other observation — a stored suggestion naming the field would now fail on Approve — has **zero population**: `ai_orchestrator_logs` holds **0** `guardrail_update` rows, against 15,600 rows in its other categories (the query reaches the table).
- **R5, already homed:** the chat live path (`intent-executor.ts:474-487` → legacy `TradingEngine.processSignal`) lost the count leg of `checkGuardrailRisk` with `checkMaxOpenTrades`; exposure stands. `#578` (engine removal) + plan row `3h`; one-line note added on `#578`.
- **R6-R8 → 2b's rule-18 census:** per-underlying cap's hardcoded fallback `2`; per-strategy `maxConcurrentPositions` shown on the strategies screen and enforced nowhere; AJ18 `maxPositions` diagnostics with no callers.

## JUDGEMENT CALL 9 — RULED BY LANGSTON: DELETE THE COUNT LEG (done)
`active-portfolio-manager.ts` `MAX_OPEN_POSITIONS = 10` and both of its legs in `checkPortfolioHealth` (critical at 10, warning at 8) are deleted; the constant name is added to the deletion fence. **Not a loosening (his ruling): it never prevented an open; its only reachable effect was refusing to start the engine that manages stops and the kill switch.** Second census, measured: live engine start is not reachable today at all (`startActiveEngine` hard-codes `mode='paper'`, `active-engine-service.ts:458`), so the leg could only have bitten at go-live. **The 80% exposure and 20% drawdown legs of the same function → 2b's rule-18 census as ONE item** (the 80% leg becomes reachable at go-live: p = 5 / e = 100 ⇒ 97% ≥ 80).

## The rollback, EXERCISED (Langston condition on #2)
Scratch database on the staging cluster, built from `pg_dump --schema-only --schema=public` of the staging database plus the rows of `guardrails_v2`, `goals_presets`, `module_constants`, `guardrails`; the migration files copied were byte-identical to the committed blobs (md5 `5e7f4cf6…` forward, `fc82cbeb…` rollback). Restore errors: 6, all outside the objects under test (5 × `public.vector` / `semantic_memory` — the pgvector extension is not in the scratch database — and 1 × `schema "public" already exists`).
```
PROBE 0 (baseline)   cols ×2, CHECK [1,20], 4 views (md5 d37af49e / 641f14f8 / 68d683c8 / f370b0f5),
                     const max_open_trades_default=5, v2 live 12 / paper 15, presets 3/5/8/12/5 ×2 modes
FORWARD              DROP VIEW ×4, ALTER TABLE ×3, DELETE 1, COMMIT
PROBE 1              columns, CHECK, views, constant row GONE; default_max_total_exposure_pct=0.25 kept
ROLLBACK             ALTER ×4, UPDATE 1, UPDATE 1, UPDATE 10, INSERT 0 1, CREATE VIEW ×4, COMMIT
PROBE 2 vs PROBE 0   IDENTICAL (diff empty) — view definitions by md5, column defs, CHECK, all 12 values
FORWARD again        same statements, COMMIT
PROBE 3 vs PROBE 1   IDENTICAL
DROP DATABASE        scratch databases remaining: 0
```
⚠️ **For 2b (found by its census):** the rollback recreates views that ALSO select `portfolio_risk_per_trade_pct`; once 2b drops that column this rollback fails, so **2b's rollback must run first**. Recorded in PRE_AUDIT §14.6.

## Honest residuals
- Local unit run: 283 of 287 files pass. The 4 failures are this laptop only — 2 need Postgres (`ECONNREFUSED`), 2 fail to parse a line-2 comment under Windows — and none imports a file changed here. CI is the judge.
- The e2e `config-snapshot.spec.ts` change was not run locally.
- `CURRENT_SETTINGS_REGISTRY.md` is annotated, not regenerated (the row still exists on staging until the deploy).
