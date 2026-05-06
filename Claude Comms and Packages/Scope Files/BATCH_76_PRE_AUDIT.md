# BATCH 76 — Pre-Implementation Audit

**Status:** rev 1 (drafted 2026-05-06 by CC, awaiting Langston Step-2 approval)
**Companion to:** `BATCH_76_SCOPE.md` rev 1 (APPROVED-WITH-REVISIONS by Langston 2026-05-06)
**Scope of audit:** 9 build helpers + 2 orchestrator emit sites + 1 emitter service + 1 dashboard aggregator + 1 nightly replay job + 1 frontend analytics page + Langston's three Step-2 asks.

---

## §A. Consumer grep audit (Langston ask #1)

**Query:** every consumer of `realDecision.confidence` (TS) or `real_decision->>'confidence'` (SQL) from `regime_factor_alternates`.

**Method:** ripgrep across `server/` and `client/` for both the TS field name and SQL JSONB accessor.

| Consumer | Path | Behavior |
|---|---|---|
| **Persister (write)** | `server/services/factor-ablation-emitter.ts:117,144,190` | INSERT path. Today writes whatever the caller passes. Two callers (orchestrator + vts-runner) currently pass raw `predictiveConfidence` / `extendedMetrics.confidence`. POST-B76: callers pass `_modulatedConfChain` (chain-final, post-clamp). Persister itself is **agnostic** — no semantic dependence on raw vs chain-final. |
| **Predictive-lift query** | `server/services/drift-dashboard-aggregator.ts:1048,1056` | `SELECT (real_decision->>'confidence')::float AS realConfidence ... AND real_decision->>'confidence' IS NOT NULL`. Renders the per-tertile WR table that drives the **REAL spread** half of `predictive lift = REAL spread − ALT spread`. POST-B76: needs `WHERE realDecision.metadata.calibrationFrameworkVersion = 'b76_chain_final'` filter ONLY for `b67_1_*` and `b67_2_phase_dimension` factor rows (per Langston's §4 revision). Other 7 factors continue to mix pre/post-B76 rows safely (predictive-lift cancels first-order bias). |
| **Replay-ablation job** | `server/scripts/replay-ablation.ts:4` (header comment only) | Documentation reference; the script reads `regime_factor_alternates` rows but **does NOT read `real_decision.confidence`** — it reads `alternate_decision.regimeLabel` + `alternate_decision.admissionPossible` and replays the alternate against the historical price path to produce `replay_outcome`. Confirmed with grep: zero accessors of `real_decision->>'confidence'` or `realDecision.confidence` in this file's body. **Not affected by B76.** |
| **Frontend analytics panel** | `client/src/pages/analytics.tsx:1414-1418` (header comment only) | UI consumer of `/api/analytics/ablation-comparison` endpoint output (already aggregated by drift-dashboard-aggregator). No direct access to `real_decision.confidence`. Renders panel from server-aggregated columns. **Not affected by B76.** |

**Conclusion:** the back-compat preservation surface is exactly **one production read site** (`drift-dashboard-aggregator.ts:1048`). The `realDecision.metadata.predictiveConfidenceRaw` field that Step-3 will add is sufficient to retrieve raw classifier confidence for any future analytic consumer that wants it — but no current consumer does. Langston's grep ask is satisfied: zero surprise consumers, zero hidden dependencies on raw-classifier semantics in `real_decision.confidence`.

---

## §B. SIM consultation (CLAUDE.md §9 mandatory)

### B.1 Component inventory (B76-touched)

| Path | SIM section | Role | UPSTREAM | DOWNSTREAM |
|---|---|---|---|---|
| `server/services/factor-ablation-emitter.ts` | SIM §B67.0 (L924–947) | INSERT API for ablation rows | signal-orchestrator + vts-runner emit hooks | `regime_factor_alternates` table (drift-dashboard-aggregator + replay-ablation read) |
| `server/services/signal-orchestrator.ts` (lines 682–995) | SIM §3 (multiple sites) | Active-trading emit hook (per-signal) | MCE getCurrent* config snapshots; macro / phase / outcome / volume / correlation / multi-tf / age / B68.5 producers | factor-ablation-emitter |
| `server/services/vts-runner.ts` (lines 1456–1759) | SIM §VTS Runner (L421+) | VTS-mirror emit hook (per-trade) | same set of MCE producers | factor-ablation-emitter |
| `server/core/metrics/macro-modifier.ts` (`buildB67_1Alternates`) | SIM §B67.1 (L971+) | 3-tuple per-input alternate builder | called from both emit hooks | `FactorAlternate` array consumed by emitter |
| `server/core/metrics/regime-phase.ts` (NEW `buildB67_2Alternate`) | (none today — inline in callers) | NEW extracted helper | inline phase-preference computation | same |
| `server/core/metrics/outcome-feedback-store.ts` (`buildB67_4Alternate`) | inferred from B67.4 SIM | divide-out alternate builder | both emit hooks | same |
| `server/core/metrics/multi-tf-agreement.ts` (`buildB68_1Alternate`) | inferred from B68.1 SIM | divide-out alternate builder | both emit hooks | same |
| `server/core/metrics/volume-regime.ts` (`buildB68_2Alternate`) | inferred from B68.2 SIM | divide-out alternate builder | both emit hooks | same |
| `server/core/metrics/pair-correlation.ts` (`buildB68_3Alternate`) | inferred from B68.3 SIM | divide-out alternate builder | both emit hooks | same |
| `server/core/metrics/regime-age-factor.ts` (`buildB68_4Alternate` + `buildB68_5Alternate`) | (B68.4/B68.5 not separately documented in SIM today; same module) | freshness divide-out (B68.4); label counterfactual (B68.5 — special) | both emit hooks | same |
| `server/services/drift-dashboard-aggregator.ts` (lines 504, 510, 1048–1058) | SIM §drift-dashboard-aggregator (L759+) | Predictive-lift + ablation-comparison aggregation | `regime_factor_alternates` table | `/api/analytics/*` endpoints → analytics.tsx |

### B.2 Forward-couples / "If I Change X, Check Y"

- **If I change the chain-final emit pattern** → BOTH orchestrator emit sites must move together; mixing pre/post chain-final values across paths would silently corrupt post-B76 rows. Mitigation: same commit, same PR, both sites in `git diff`.
- **If I rename the cutover marker constant** → 6 read/write sites must update together: emitter (write), aggregator (read for b67_1/b67_2 version-filtered queries), unit test fixtures (assert), JSDoc references (4 sites). Mitigation: export single TS const `CALIBRATION_FRAMEWORK_VERSION` per Langston §6 revision, reference everywhere.
- **If I change `buildXAlternate` signature uniformly** → every caller in both orchestrator paths must update on same commit; existing unit tests in `b68-1`/`b68-2`/`b68-3` need argument-shape updates (no semantic change). TS errors are the gate.
- **If I add the `WHERE calibrationFrameworkVersion = 'b76_chain_final'` filter to b67_1/b67_2 queries** → must apply to BOTH the predictive-lift query (`drift-dashboard-aggregator.ts:1048`) AND any pre-existing b67_1/b67_2 surface in the ablation-comparison endpoint. Step-3 will grep for all `factor_name = 'b67_1_*'` / `factor_name = 'b67_2_phase_dimension'` SQL fragments across drift-dashboard-aggregator.ts.
- **If I touch the inline b67_2 emit block in either orchestrator** → must extract uniformly to `buildB67_2Alternate` in `regime-phase.ts`, NOT leave inline. Keeps the 9-helper invariant clean for future framework versions.

### B.3 Background execution / shared state / startup

- **Background execution:** factor-ablation-emitter persistence is fire-and-forget `void persistRecord(...)`. POST-B76 retains this pattern. No new timers, intervals, or cron jobs.
- **Shared state:** `module_constants.ablation_framework.b67_0_ablation_emit_enabled` gates emit globally. POST-B76: unchanged (no new gate). The `CALIBRATION_FRAMEWORK_VERSION` const is a code-time literal, not DB-governed.
- **Startup:** no changes to MCE warmup, no new module_constants prefetch needs, no new sync-read API consumers. Pure refactor of an in-flight code path.

### B.4 Blast radius rating

**MEDIUM-LOW.** Changes are confined to the calibration framework (1 service + 9 helpers + 2 emit sites + 1 aggregator file + 1 frontend doc-comment). **Zero trading-path consumers** (live trading is OFF; even when ON, factor-ablation-emitter is observability infrastructure, not decision input). Reversibility is pure code revert with no schema migration. The MEDIUM (not LOW) rating reflects that 11 files change in same commit and TS-error blast cascades are possible if signature changes are inconsistent — gated by `tsc --noEmit` on touched files per CLAUDE.md §11.

### B.5 SIM updates required (Step 10)

- **§B67.0** (L924+): document chain-final contract; update emit-hook line numbers; document `CALIBRATION_FRAMEWORK_VERSION` cutover marker.
- **§B67.1** (L971+): update `buildB67_1Alternates` JSDoc reference + signature shape note.
- **NEW §B67.2 / B67.4 / B68.1 / B68.2 / B68.3 / B68.4 / B68.5 helper subsection** if not already present: document uniform `({ realConfidenceFinal, factor, … })` signature.
- **§drift-dashboard-aggregator** (L759+): add note about the b67_1/b67_2 version-filter and the two `factor_name NOT IN (...)` filter removals.

---

## §C. Resolution of Langston Step-1 Q&A flagged items

### C.1 §3 floor wording clarification (Langston ask #2)

**Original scope §3 wording:**
> "Edge case: realConfidenceFinal hit the post-composition floor (`b67_5_post_composition_floor`) → divide-out gives a value > 1.0 for some factors. Acceptable; aggregator already handles >1.0 as informational."

**Confusion source:** the parenthetical name `b67_5_post_composition_floor` reads like a B67.5 lookahead, but B67.5 is the consumer-wiring batch that hasn't shipped yet. Langston correctly flagged ambiguity.

**Resolution — clarified intent:** the reference is to the **existing `[floor, 1.0]` clamp** applied at the END of the orchestrator chain at `signal-orchestrator.ts:972` and `vts-runner.ts:1730`. The floor VALUE comes from `module_constants.regime_classification.b67_5_post_composition_floor` (a DB-governed knob, default 0.20 today per B70.3 close), but the clamp ITSELF has been live since B67.5-prep landed in B70.3 / B72 family — it's not a B67.5 lookahead. The constant name was chosen with B67.5 in mind, but its consumer code is already shipped.

**Action:** scope §3 wording to be tightened in implementation comments to read "post-floor clamp using `b67_5PostCompositionFloor` (currently 0.20, DB-governed)" — no change to the architecture, just clearer code comment.

### C.2 §4.6 A/B split as non-optional for b67_1/b67_2 (Langston ask #3)

**Original scope §4.6 wording:** "Aggregator can optionally split pre-B76 vs post-B76 rows for A/B comparison if desired (NOT required for B76 close — informational only)."

**Resolution given Langston §4 revision:** for `b67_1_macro_modifier`, the 3 factor-name sub-rows (`b67_1_btc_dominance`, `b67_1_funding_rates`, `b67_1_mcap_momentum`) AND `b67_2_phase_dimension`, the version-filter `WHERE realDecision.metadata.calibrationFrameworkVersion = 'b76_chain_final'` is **non-optional**. Without it, post-B76 queries on those factors would mix structurally-biased pre-B76 rows (FIRST-in-chain bug) with clean post-B76 rows, producing aggregator output that's dirtier than the dashboard pre-B76 with-filter state.

**Action:** Step-3 implementation will add the version filter to every aggregator query that surfaces these 4 factor names. The remaining 7 factors (`b67_4_outcome_feedback`, `b68_1_multi_tf_agreement`, `b68_2_volume_regime`, `b68_3_pair_correlation`, `b68_4_regime_age`, `b68_5_path_b_sustainability`, plus B67.3 admission-gating which uses a separate mechanism) are NOT version-filtered — predictive-lift cancels first-order bias on them by construction.

### C.3 Langston revisions to fold into Step 3 (recap)

1. **`CALIBRATION_FRAMEWORK_VERSION` TS const** exported from `factor-ablation-emitter.ts`. Referenced everywhere written/read (emitter, aggregator queries, unit-test fixtures).
2. **Version-filter on b67_1/b67_2 aggregator queries** per §C.2 above.

Both are tracked in the Step-3 todo and will appear in the implementation diff.

---

## §D. Step-3 implementation order (anticipated)

1. `factor-ablation-emitter.ts` — add `CALIBRATION_FRAMEWORK_VERSION` const + JSDoc on chain-final contract (signature unchanged). Update `persistRecord` to inject `calibrationFrameworkVersion` into `realDecision.metadata` before insert.
2. `outcome-feedback-store.ts` / `volume-regime.ts` / `pair-correlation.ts` / `multi-tf-agreement.ts` / `regime-age-factor.ts` (`buildB68_4Alternate`) — refactor each `buildXAlternate` to uniform `({ realConfidenceFinal, factor, ... })` signature. `regime-age-factor.ts` (`buildB68_5Alternate`) keeps label-counterfactual semantics; chain-final reference threaded for completeness.
3. `macro-modifier.ts` (`buildB67_1Alternates`) — accept `realConfidenceFinal` + 3 counterfactual modifiers; return alt.conf via `realConfidenceFinal × (cf/actual)`.
4. `regime-phase.ts` — NEW `buildB67_2Alternate` exported function (extract from inline blocks; uniform signature).
5. `signal-orchestrator.ts` (lines 682–995) — switch from build-at-point-of-fire → stash-inputs-pattern → build-after-final-clamp → emit. Pass chain-final `_modulatedConfChain` (after `Math.max(orchFloor, Math.min(1.0, ...))`) as `realDecision.confidence`. Preserve `predictiveConfidenceRaw` in metadata.
6. `vts-runner.ts` (lines 1456–1759) — same restructure.
7. `drift-dashboard-aggregator.ts` (lines 504, 510, 1048–1058) — remove the two `factor_name NOT IN ('b67_1_macro_modifier', 'b67_2_phase_dimension')` filters; ADD `WHERE realDecision.metadata.calibrationFrameworkVersion = 'b76_chain_final'` to b67_1/b67_2 surfacing queries (grep for all SQL fragments referencing those factor names first).
8. `server/tests/unit/b76-chain-final-emit.test.ts` — NEW unit suite covering all 9 build helpers (table-driven; assert `alt.confidence = realConfidenceFinal / factor`; factor=0 fall-through; factor=1.0 idempotence).
9. `server/tests/unit/b68-1-multi-tf-agreement.test.ts` + `b68-2-volume-regime.test.ts` + `b68-3-pair-correlation.test.ts` — update build helper invocations to new signature (no semantic test changes).
10. `tsc --noEmit` on touched files; CI green; deploy.

---

## §E. Verification plan (Step 7 / Step 9)

1. Live `regime_factor_alternates` row inspection 5–10 minutes post-deploy: confirm `realDecision.metadata.calibrationFrameworkVersion = 'b76_chain_final'` on every new row.
2. SQL spot-check: `SELECT factor_name, COUNT(*), AVG((real_decision->>'confidence')::float) FROM regime_factor_alternates WHERE realDecision->>'calibrationFrameworkVersion' = 'b76_chain_final' GROUP BY factor_name;` — confirm all 10 factor names present (b67_1×3 + b67_2 + b67_4 + b68_1/2/3/4/5).
3. Predictive-lift sanity: re-run the calibration recipe (`GET /api/analytics/factor-calibration?window=rolling_7d`) at +24h and +48h; confirm B68.1 (+5.7), B68.2 (+4.1), B68.3 (+4.1), B67.4 (+3.0) lifts preserve sign and stay within ±1pp of pre-B76 values.
4. **B67.2 + B67.1 unfreezing:** drift-dashboard screenshot at +24h showing those rows with non-zero shift (was zero by construction pre-B76).
5. Replay-ablation job (next nightly run): confirm `replay_outcome` rows continue to populate normally; chain-final shift in `real_decision.confidence` does NOT break the replay path (it doesn't read confidence).

---

## §F. Open asks for Langston Step-2 review

1. Is the consumer grep audit (§A) sufficient evidence that the back-compat preservation is single-site only, or do you want me to additionally grep `analyze*.py` / `notebooks/` / any external scripts before proceeding?
2. SIM updates planned in §B.5 — anything else you'd want documented (e.g., a NEW SIM "Calibration Framework Versioning" subsection)?
3. §C.1 floor-wording clarification accepted, or do you want a separate Step-3 deliverable that touches the constant naming directly (e.g., rename `b67_5_post_composition_floor` → `post_composition_floor`)? (My recommendation: defer naming change — out of scope per §5 single-purpose fence; revisit when B67.5 wires.)
4. §D implementation order — anything to reorder, or any sequencing risk you see?

Standing by. Will proceed to Step-3 implementation upon your sign-off (or with revisions folded if you push back).

---

*End of BATCH_76_PRE_AUDIT.md rev 1.*
