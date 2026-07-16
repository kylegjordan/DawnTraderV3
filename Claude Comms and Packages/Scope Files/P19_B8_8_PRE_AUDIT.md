# P19-B8.8 — Step-2 pre-audit: conditions (A)-(E) discharged + final family enumeration

Owner: CC-B · 2026-07-16 · Companion to P19_B8_8_SCOPE.md (Step-1 PASSED w/ conditions).

## (A) DISCHARGED — field-absence IS a fault, with three layers of evidence
1. **Schema:** all three sizing fields are `.notNull()` with DB defaults —
   `portfolioRiskPerTradePct` (schema.ts:316), `maxPositionPercentPct` (:335),
   `maxTotalExposurePct` (:340). A stored NULL is impossible; documented ranges
   (0.10-5.00 / 1.00-100.00 / 10.00-100.00) make zero out-of-range too.
2. **Contract:** `ActivePositionSizingParams.guardrails: GuardrailsV2 | null | undefined`
   (active-position-sizing.ts:57) — a FULL drizzle row or nothing. No partial-object
   path exists. Both live callers fetch via `storage.getGuardrailsV2({mode})`
   (engine :3618, orchestrator :1593→sizingContext:1601→:541).
3. **Production rows (queried live 2026-07-16):** both mode rows exist, all three
   populated — paper 1.95/6.67/100.00 (the tune-3 spec), live 4.00/30.00/25.00.
   No class/mode legitimately runs a null cap. The engine cannot legitimately run a
   mode without its guardrails row → whole-row-missing = fault → refuse-signal is safe.
   (The null→100 branch is unreachable on a healthy DB — it exists only to catch
   exactly the fault it then silently absorbs.)

## (B) DISCHARGED — trio consumers enumerated, and the sweep GREW the family
`buildSettingsFromGuardrails` **already THROWS on a missing row**
(guardrail-settings.ts:152-154) — so its field-level fallbacks are reachable only via
schema drift / projection change: dead-but-dangerous, and they mask exactly that drift.
Consumers of the trio fields, each with its guard status:
- engine promotion loop → maxOpenTrades: LOUD (B8.7 halt-admissions guard). ✓
- routes :13921/:13964/:14698/:14836 maxExposurePercent → reporting/briefing strings
  (NaN renders visibly; acceptable). behavioral-template.ts:445/448 same. ✓
- trade-safety.ts:356 `maxPositionPercent || '10.00'` — **LIVE BLOCKING check**
  (checkPositionSizeCap): swallows NaN silently → IN FAMILY, fix.
- trade-safety.ts:616-618 maxTotalExposurePct → falls back to guardrail_defaults
  (DB-resolved, not hardcoded) — but post-B8.8 the settings field is always present
  (throw upstream), so it's dead: retire to raw + loud consumer.
- trade-safety.ts:788 `? parseFloat : undefined` — undefined flows to a LOG payload
  only. OUT of family (no substitution).
- trade-safety.ts:502-504 LPCP trio re-fallbacks — inside the DORMANT commented-out
  LPCP block (:499 block comment, AJ8 disabled). NOTE-ONLY: annotate for re-enablement.

**Newly surfaced members (same function, same shape, missed at Step-1):**
- guardrail-settings.ts:194 `dailyLossKillSwitchPct ? ... : '7.00'` — the KILL SWITCH
  defaulted. Same dead-but-dangerous class. IN.
- guardrail-settings.ts:168-176 the other two LPCP fallbacks (0.50 / 3.0). IN.

## (C) DISCHARGED — the two classifications, with evidence
- **routes.ts:1336-1359 — IN FAMILY, and the worst single member found:** the config
  GET route FABRICATES AN ENTIRE IN-MEMORY GUARDRAILS ROW (id=nanoid, all fields
  hardcoded, incl. maxTotalExposurePct '25.00' at :1346) when `getGuardrailsV2` returns
  nothing — the UI would render a wholly fictional config as if real. Fix: loud 404
  (`guardrails not configured for mode=X`), no phantom row.
- **routes.ts:14922-14923 — test-only endpoint** (`/test/simulate-loss`): `|| '7.00'`
  kill-switch + `|| '75.00'` warning defaults. Off the live risk path but same hygiene;
  one-line fix, sweep it (cheap) rather than exempt it.
- **ethical-reasoning-engine.ts:66 — OUT of family:** it's SEED DATA
  (`initializeDefaultRules` writes constraintLogic rows to DB), a write-path constant,
  not a read fallback. Noted: the subsystem is userId-coupled (rule-18 posture watch),
  out of B8.8 scope.
- **m5e-validation-service.ts:122-123 — IN:** multi-alias guessing
  (`maxTotalExposurePct || maxExposurePercent || maxExposurePct`) `|| 40` / `|| 12`
  private copy. Fail-loud same design; folds the #515 rider.

## (D) ACCEPTED — §10.5 rail, alert-only, as ruled
Bounded consecutive-refusal counter on the existing `rtbMetricsService` instance;
threshold-crossing emits a system alert (severity warning, category sizing) via the
existing alerts path. No second behavior branch, no new singleton. Threshold proposal:
10 consecutive SIZING_GUARDRAIL_READ_FAIL refusals (one bad tick's worth), reset on
any successful sizing.

## (E) COMMITTED — SIM content note (sizing degrade behavior) lands at close. Also
goal-feasibility.ts:57 `|| '100.00'` unchanged from Step-1 (refuse the feasibility
PASS loudly).

## Final build list (whole-cluster-one-design)
1. active-position-sizing.ts:151-163 → per-field validate; any missing/unparseable/
   non-positive → `[P19-B8.8][SIZING_GUARDRAIL_READ_FAIL field=<x> mode=<m>]` +
   invalidResult + rail counter. Both fallback layers deleted.
2. guardrail-settings.ts:163-181,:194,:168-176 → raw pass-through (throw-on-missing-row
   stays the loud gate; field fallbacks deleted).
3. trade-safety.ts:356 → NaN guard: refuse the check loudly (`ok:false,
   code:'GUARDRAIL_READ_FAIL'`) — a safety check may never pass on a swallowed NaN.
   :616-618 → same treatment, guardrail_defaults leg retired. :502-504 annotate-only.
4. goal-feasibility.ts:57 → refuse feasibility PASS loudly on unparseable cap.
5. routes.ts:1336-1359 → loud 404, phantom row deleted. :14922-14923 → same one-liners.
6. m5e-validation-service.ts:122-123 → fail-loud, alias-guessing removed (#515 rider).
7. Tests: per-field refusal cases (missing/unparseable/zero/negative) + rail counter +
   phantom-row-404 + trade-safety NaN-refusal. Bench probe only, never live sizing.
