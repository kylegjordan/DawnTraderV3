# B-SIZING-DEC-RESTORE — Pre-Implementation Audit (Step 2)

**Audits against scope r4 (`ffdeef959`/`3d130b516`, Kyle-ratified table). Kyle's Step-2 directive 2026-08-06: "no assumptions — review, understand, verify everything in the history, code, and runtime logs… verify on staging too." Every claim below states its instrument. Owner CC-C.**

---

## 1. ★★ HEADLINE FINDING — THE ×0.6 DOES NOT COME FROM THE AMR. THERE ARE TWO POSTURE WRITERS, AND THE LIVE ONE IS THE CLASS-LESS STABILITY DAMPER.

**Verified on staging DB:** `module_constants` `amr_runtime.mode` = **`"shadow"` for BOTH `crypto_spot` and `xstock_spot`** (direct row read). **Code:** `getActiveModeForClass` returns **null unless the flag is `active`** (`amr-weather-report.ts:615-621`), and the engine's overlay resolution (`active-execution-engine.ts:3884-3900`) applies the AMR per-class overlay **only when that returns non-null** — otherwise `strategyMode = resolveStrategyMode(regimeStability)` and the overlay is the **class-less `STRATEGY_MODE_OVERLAYS` literal** (`strategy-modes.ts:68-96`).
⇒ **Today's ×0.6 is the 11.7S stability damper's hardcoded DEFENSIVE literal — the AMR DB dials are consulted by NOTHING on the live path while shadow.** The equality (both = 0.6) made the dials look live; they are not. **Runtime confirmation (staging logs, 2026-08-06):** `[11.7S][Paper] Mode: DEFENSIVE | Size×0.6` ×156 on the active path (plus VTS-side DEFENSIVE ×900 / SURVIVAL ×741 — the overlay also modulates VTS sizing, out of this batch's surface but recorded).
**CONSEQUENCE FOR OBJECTIVE 5:** the single-application-point design (`effectiveP = p × multiplier`) must take its multiplier from **whichever resolver governs** (AMR-if-active, else stability — today's precedence, kept), and **the invariant test must pass under BOTH writers.** The aggressive posture is **unreachable until the AMR flag flips active** (the stability path never emits AGGRESSIVE — `strategy-modes.ts:37-39` comment + the class-less AGGRESSIVE getter THROWS by design). The 125% breach is therefore armed-but-unreachable today; the fix must land before any flag flip.

## 2. ★★ NEW WRITER FOUND — `adaptive-guardrails.ts` AUTO-TUNES BOTH RETIRING FIELDS.

`adaptive-guardrails.ts:229-230` enumerates `portfolioRiskPerTradePct` and `maxOpenPositions` as tunable parameters; `:293-296`/`:331-335` **WRITE proposed new values back to the guardrails row.** ⇒ deleting the columns without dispositioning this tuner leaves a writer proposing adjustments to dropped fields. **Disposition required at Step-3: remove both from the tunable set in the SAME commit as the schema drop** (whether the tuner should instead tune `p`/`e` is a separate Kyle decision, NOT smuggled in). This is the §9.5(a-ii) class the census exists to catch — found, not assumed.

## 3. ★ SILENT-SURVIVOR SITES — fallbacks/defaults that outlive the deletion tsc-clean (each gets a fence or dies):

| site | shape | disposition |
|---|---|---|
| `core/criteria-limiter.ts:31,58` | `guardrails?.maxOpenPositions ?? this.config.maxOpenPositions` (default **10**) | re-point at derived slots; kill the fallback (B8.8 loud-refuse) |
| `vts-runner.ts:175` | literal default `maxOpenPositions: 5` | VTS-side settings object — re-point/rename with the derived value |
| `signal-orchestrator.ts:1771` | literal default `5` | same |
| `utils/numeric-normalizer.ts` | field-name normalization | fence (Langston's named site) |
| `m5e-validation-service.ts:118+` | **`getDynamicSlots` REINCARNATED** — post-B8.8 version reading guardrails (slots/maxExposure/maxPosition), null-refusing | the scope's "twin": re-point at the batch's derived-slots function or delete with its consumers — enumerate its callers at Step-3 |

## 4. §9.5(a-ii) STATE-WRITE CENSUS — what the RISK PATH writes that survives it:

- **`sizingDetails.effectiveRiskFractionRatio` + `wasClamped`** (`active-position-sizing.ts:239-299`) → consumed by `rtbMetricsService.recordSizingClampSample` (`rtb-metrics-service.ts:101`, called at `active-execution-engine.ts:4034-4040`) → **the P19-B7.1 clamp-bind watch whose `boundRate` feeds a PHASE-25 GO/NO-GO** (ranker switch at >~15-20% bind). **Deleting risk sizing voids the ratio's denominator (`riskAmount`).** Disposition required: retire the sample stream explicitly OR redefine it for the fixed-notional world (e.g. posture/clamp telemetry) — **a decision, not a casualty; Phase-25 consumers must be told either way.**
- `correlationScale` (`risk-concentration.ts:412`) survives (KEEP-BUT-SURFACED per scope; must flip `wasClamped` per Langston's ratification — note `wasClamped`'s meaning is changing in the same batch, so the flag's semantics get ONE definition, written down).

## 5. FULL READER CENSUS — verified counts (grep, tests excluded):

**`portfolioRiskPerTradePct` — 19 files** incl. beyond the scope's list: `goal-feasibility.ts` (:20,:57,:61 — feasibility math reads risk%; re-point or delete with field), `index.ts` (:1131-:1282 payloads), `routes.ts` (8 sites + :21673/:21726), `config-update-service.ts`, `guardrail-policy.ts`, `kill-switch-adjacent reads in active-execution-engine.ts:2997`, UI `core-four-guardrails.tsx`. **`maxOpenPositions` — the 19 files as scoped** (counts: routes 14 · adaptive-guardrails 9 · guardrail-policy 7 · schema 4 · index 4 · UI 4+1+1 · others 1-3). Per-site read at Step-3 against this table; every site gets one of the five dispositions in the change list.

## 6. STAGING VERIFICATION (Kyle's directive — live reads, not memory):

- `guardrails_v2` **paper**: 1.95 / 20.00 / 100.00 / 15 (`last_updated_by: p19-b8-5-sizing-tune-2`). **live**: **4.00 / 30.00 / 25.00 / 12** — a live row EXISTS with its own values; under the new model live per-trade = $824×30% ≈ **$247**, NOT Kyle's $200-at-25% example ⇒ **live values are part of the Step-3 values decision** (wiring in this batch, values Kyle's).
- `amr_response_dials` live rows **match the seeds exactly** (multipliers 1.0/1.25/0.6/0.25 both classes; slot caps crypto 10/12/6/3, xstock 8/10/5/2) — **no operator re-tune has occurred** (Langston's live-rows requirement discharged with the population named).
- `active_sizing.max_position_buffer_factor` = 0.97 (the field the batch deletes). `portfolio_state`: paper 2250.00, live 824.11.
- Runtime logs as §1. **§9.3 UI verification applies at Step-7** (guardrails tabs, sizing line, AMR panel) — pre-implementation has no UI surface to verify beyond the tab state Kyle already screenshotted (matches the DB rows above).

## 7. KNOWN COUPLINGS CARRIED (not new, restated so Step-3 can't miss them):

Sizer `portfolioValue` inherits **#618**'s capped session-scoped balance (`guardrail-settings.ts:105`) — the dashboard batch precedes this one in Kyle's build order, which resolves the coupling if honored. The exposure-enforcement quirk (budget only derives the per-trade cap; totals enforced at execution) is REPLACED by the scope's invariant + derived slots.

## 8. VERDICT REQUESTED

Pre-audit finds the scope BUILDABLE with **three Step-3 additions**: (a) the two-writer posture design + invariant-under-both-resolvers test (§1); (b) `adaptive-guardrails` tunable-set removal in the schema-drop commit (§2); (c) the clamp-watch stream's explicit disposition (§4). None contradict the ratified shape; (a) strengthens it. **Langston Step-2 review requested.**
