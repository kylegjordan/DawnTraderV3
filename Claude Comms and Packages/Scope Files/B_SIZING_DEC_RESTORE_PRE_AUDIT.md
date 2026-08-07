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


---

## 9. LANGSTON STEP-2 VERDICT — APPROVED (2026-08-07), with every load-bearing claim independently re-derived. TWO ADDITIONS OF HIS, binding on Step-3:

**ADDITION 4 — THE LIVE ROW IS INCOHERENT UNDER THE RATIFIED SHAPE, in-batch not deferrable.** Live has **p=30 > e=25** ⇒ `floor(e/p) = 0` slots — and the m5e twin's live body does exactly the hazardous thing (`floor` + `Math.max(slots,1)`, no posture term): one live trade at 30% would **breach the invariant (≤ B×e = 25%) on live's own current values.** **Step-3 defines p > e behavior explicitly — his leaning, adopted: LOUD REFUSE (a row where one trade exceeds the total budget is a config error, not a sizing input) — and the invariant test carries a p > e case.**
**ADDITION 5 — SIM + SYSTEM MANUAL consultation STATED:** at Step-3 entry, read the SIM cross-cutting registry (engine + AMR shared state) and record it; change-class architecture ⇒ **SYSTEM_MANUAL + SIM CONTENT updates due at Step-10 — on the list now.**
**His ruling on my (c):** RETIRE the clamp-watch stream **with a tombstone**; do NOT re-point `boundRate` onto a new measurand under the old name (#546 class). **Phase-25 is told its go/no-go criterion needs re-derivation.**
**His re-derivations of note:** 157 DEFENSIVE×0.6 lines (mine 156 — one landed between reads); **AMR_ACTIVE=0, AGGRESSIVE=0 same files** (negative with a positive control); all 16 dial rows re-read, match seeds; the stability map verified never-AGGRESSIVE **in the map, not the comment**. His own r3 "has been re-tuned" premise recorded as wrong-in-fact.
**Housekeeping accepted:** next dispatch stages the file per §5.1 or points at repo path + sha explicitly (he read off the ref this time).


---

## 10. SUPPLEMENT (Kyle-directed 2026-08-06) — TWO PROVENANCE QUESTIONS, ANSWERED FROM THE BATCH RECORDS

**Q1 — Is Phase 11 (11.7S) referenced in the AMR for COMBINED use? NO — the AMR was designed to SUPERSEDE it, and says so in its own scope. Kyle's supersession read is CONFIRMED.**
- `SYSTEM_MANUAL:5840`, verbatim: 11.7S *"is the **defensive-only skeleton** of the broader Adaptive Market Response framework."*
- `B_5_AMR_BODY_SCOPE.md` §Why, verbatim: 11.7S's sensor is deficient three ways (*no offensive mode; per-signal stability whose flip-rate input is FROZEN dead (#219) — it classified the hostile 04-22 window as business-as-usual; no per-class awareness*) and *"**AMR replaces the sensor** with a per-class multi-input weather report… ships behind a shadow flag."*
- Scope line 137, verbatim: the legacy stability path *"is the legacy behavior **AMR REPLACES**. Shadow keeps it bit-identical deliberately (parity); **its retirement IS the Phase-19 flip decision**."*
⇒ **Design relationship: the overlay MACHINERY (dials/multipliers) carries forward — promoted per-class by B-5 — but the Phase-11 RESOLVER (the stability sensor) is slated to DIE at flag-flip.** **BINDING ON STEP-3:** the two-writer application point must treat the stability resolver as the deliberately-temporary member — the design must not entrench it (a fence/tombstone marking it retire-at-flip, per B-5's own intent).
**⚠️ OPEN VERIFY ITEM SURFACED BY THE READ (symptom announced, cause NOT asserted — rule 24.a):** B-5 **Obj-9 pinned VTS dials to NORMAL deliberately** (*"letting AMR throttle/resize VTS trades warps the learning substrate"*) — yet today's runtime shows `[11.7S][VTS] Mode: DEFENSIVE | Size×0.6` ×900 and `SURVIVAL ×0.25` ×741, and the code at `vts-runner.ts:1684` sits under a comment *"The mode overlay (position sizing, stops) still applies."* **Either the pin was never shipped, regressed, or means something narrower than the scope reads — if the overlay is genuinely modulating VTS sizing, the learning substrate is being posture-warped against B-5's design.** Needs its own read; NOT this batch's surface; homed to RUNNING_ISSUES at next entry.

**Q2 — Is the adaptive tuner designed to function with the AMR, or vice versa? NEITHER. They are strangers, and the tuner is DORMANT.**
- Origin: `5d3e89caf` **2025-10-29** — *"Add system for adaptive guardrails and learning"* — born the same day as `guardrails_v2` itself, Replit-era (the Latti/Lottie learning apparatus; the `tunedByLatti`/`managedByLottie` guardrail fields are its footprint).
- The AMR corpus **never references it** (grep over the B-5 scope: zero hits for adaptive-guardrails/latti/lottie/tuner). The tuner predates AMR by ~8 months and neither was designed around the other.
- **DORMANT, verified two ways:** its write path `applyAdaptiveAdjustments` has **ZERO callers repo-wide** (only read-only telemetry routes at `routes.ts:21850-21897` are wired), and **zero** `[AdaptiveGuardrails]`/`[Behavioral]` log lines in today's runtime *(this log leg: RULED ON REPORTED FACT per Langston — corroborative only; the structural zero-caller proof carries the weight)*. *(Instrument note: a first count of 12,041 "adaptive" lines was an over-broad grep matching other modules — disclosed and discarded; the tag-scoped count is the population.)*
⇒ **BINDING ON STEP-3:** shrinking the tuner's tunable set (§2) is SAFE — it cannot act today. Whether the dormant tuner is itself a rule-18 removal candidate is a SEPARATE scope decision, flagged not smuggled.

**Kyle 2026-08-06 also directed: LIVE-MODE VALUES are deferred — the FIELDS and their plumbing must be correct in both modes (objective 7 unchanged); values come later.** Addition-4's p>e loud-refuse stands regardless (it is field-correctness, not a value choice).


---

## 11. r5 EXPANSION — LANGSTON'S STEP-1 RE-RULE: APPROVED IN-BATCH, NO SPLIT. HIS THREE CENSUS ADDITIONS (approval conditioned on their landing here) + TWO INTERIM CONDITIONS:

**CENSUS ADD 1 — `routes.ts:2185-2214` is a MISSING 11.7S APPLICATION SITE:** imports `resolveStrategyMode`/`getModeOverlay`/`getModeStats`/`STRATEGY_MODE_OVERLAYS` and enumerates the legacy trio at `:2212-2214`. Obj-10 named engine/VTS/SQE only. **Disposition required for the endpoint AND any UI panel reading it — prove or sever the UI dependency (rule 18).**
**CENSUS ADD 2 — the B72 `governance_modes` linkage:** the `confidenceFloor` getter on the overlays reads `governance_modes` (3 rows; `LEVER_INVENTORY.md:548`). Deleting the literals orphans that table + its seed migration + the lever entry ⇒ **obj-10 gets its OWN §9.5(a-ii) state-write census.** **Scope-level statements required, not implementer picks: the interim NORMAL floor's NAMED source (hardcoded vs the `governance_modes` NORMAL row), and the interim `strategyMode` STAMP VALUE** (so the Phase-25 contamination partition reads clean).
**CENSUS ADD 3 — tests by SUBJECT-vs-PROBE:** `directive-11.7S-strategy-modes.test.ts` dies as a unit (subject = the deleted mechanism); **`b5-amr-body.test.ts:274` uses the dying literal as a PROBE for a surviving B-5 invariant** (no class-less AGGRESSIVE dials) — **disposition each test individually, no blanket delete.**
**INTERIM CONDITION (i):** the **AMR flip decision gets a §13 home at batch close** — dated or named — so NORMAL-everywhere cannot silently become permanent. **Direction stated honestly: the system is measured pinned-DEFENSIVE today, so the interim means sizes UP ~1.67× and narrower stops until the flip.**
**INTERIM CONDITION (ii):** the Step-3 values decision to Kyle carries one plain-language line: *until the new per-class mechanism is switched on, there is no defensive damper — sizing and stops run at normal in all weather.*
**#659 concurrence recorded** (own batch immediately after = the §13 home), with his scope check: if the tuner writes `governance_modes`/overlay values, the one-batch write-into-void ordering is stated explicitly.

---

## 12. r6 AMENDMENT (2026-08-07) — obj-10 DELETE-hardening + obj-11 tuner deletion. §11's binding conditions carry forward UNWEAKENED (Langston, r6).

**12.1 SUBJECT-vs-PROBE still binds under "delete, don't retire" (his condition, restated because the harder verb invites the error):** the DELETION applies to the MECHANISM. A test that PROBES a surviving invariant through the deleted symbol is RE-POINTED, never deleted — deleting a probe destroys the evidence that the invariant still holds.

**12.2 OBJ-11 REACHABILITY (re-derived; Langston independently confirmed all six endpoints + sole-importer status at the ref).** Method-level external call sites, tuner module excluded, tests excluded:
`logBehavior` 0 · `applyAdaptiveAdjustments` 0 · `createSnapshot` 1 · `rollbackToSnapshot` 1 · `getTelemetry` 1 · `getLearningMode` 0 · `setLearningMode` 1 · `getBehavioralLog` 1 · `getLearningHistory` 1 — **every non-zero site is one of the six routes.** ⇒ the module's ENTIRE live reachability is the six endpoints; delete them together.

**12.3 §9.5(a-ii) STATE-WRITE CENSUS — three write targets, each with its reader-grep:**

| the tuner WRITES | readers OUTSIDE the tuner | consequence of deleting the writer |
|---|---|---|
| `behavioral_log` (`:107`) | **none** (server + client grep) | table becomes fully orphaned — **0 rows, never written** |
| `learning_history` (`:422`) | **none** outside the tuner's own reader | orphaned — 2 rows exist |
| **`guardrails_v2` (`:333`, `:345`)** | ★ **LIVE READERS: `active-position-sizing.ts:11`, `reasoning-orchestrator.ts:500-502`, `state-awareness.ts:255-256`** | ⚠️ **the table STAYS — it is the live guardrail store this whole batch is about. Only the tuner's WRITE is removed.** |

**★ 12.4 THE FINDING THAT STRENGTHENS THE DELETION — measured, with a positive control.** The tuner's write path sets **`portfolioRiskPerTradePct` and `maxOpenPositions`** on `guardrails_v2`, stamped `lastUpdatedBy: 'LATTI_ADAPTIVE'` — **the exact two fields this batch exists to fix.** Had it ever been wired, it would have silently overwritten Kyle's guardrail values.
**DID IT EVER RUN? NO — and the instrument is controlled.** Object: `guardrails_v2` on staging; population: ALL rows (2), not a slice. Stamp histogram: `(null)` ×1, `p19-b8-5-sizing-tune-2 (measured iteration)` ×1. **Zero `LATTI_ADAPTIVE`.** The positive control is the p19-b8-5 stamp — the same query demonstrably returns a non-null stamp when one exists, so this absence is evidence, not a broken read. Corroborating: `behavioral_log` = **0 rows** (its writer never fired). ⇒ **no historical contamination of Kyle's values; the deletion removes a loaded-but-unfired path, and the completion report says exactly that — no stronger.**

**12.5 NAMESPACE-SURGICAL CONDITION (Langston's load-bearing correction, accepted and folded into the scope):** `/api/learning` is a SHARED namespace with live client consumers on OTHER paths. The cut is the six routes surgically; **the reappearance fence asserts absence of the six paths/symbols, never a prefix.**

**12.6 ORDER-INVERSION RIDER (his, recorded):** the P19-B6 approval-void leg — the kill-switch DENOMINATOR — **stays open until `B-READER-TRUTH` ships third.** Accepted, and it is Kyle's call to make.
