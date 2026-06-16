# P19-B5a — Pre-Audit (active-path reject/admit capture hooks; §19.0.5, the HARD 19-3 precondition)

**Batch:** P19-B5a · **Date:** 2026-06-16 · **Author:** Claude New (CC-B) · **For:** Langston Step-2 review.
Anchored to the 5 Step-2 asks you listed. Recon done by a read-only `server/`-scoped pass; **exact line numbers below are Step-3-confirmable** (a few sites the recon flagged "estimate" are called out — I'll pin them with verify-before-edit at implementation).

## Anchor 1 — the B70 writer + the row schema (Q3)
- **Writer:** `archiveSignalEval(input: SignalEvalArchiveInput)` — `server/services/data-archive/signal-eval-archiver.ts:182`. Fire-and-forget, internally enqueued, try/catch-safe; already used by the admitted hooks.
- **Table `signal_eval_archive` ALREADY carries `reject_stage`** with the enum **`'admitted' | 'pre_filter' | 'sqe' | 'rtb' | 'tcl' | 'strategy_internal'`** — the reject stages we need are pre-defined. The **admit-only fields (`final_score`, `confidence_modulated`) are already written via `?? null`** and are only populated when `rejectStage==='admitted'`.
- **⇒ Q3 RESOLVED in your direction: reuse the schema 1:1, no new variant.** **Likely NO migration** — Step-3 confirms the DB column constraints on `final_score`/`confidence_modulated` are nullable (the writer already treats them as optional, so they almost certainly are; if any admit-only column is `NOT NULL`, a one-line `ALTER … DROP NOT NULL` migration is added, per your caveat).
- Sibling `signal_eval_provenance` is admit-only (skipped for reject rows via the `wantProvenance` guard) — reject rows write the archive row only. Correct as-is.

## Anchor 2 — the paper-active gate (Q4a) — and the ONE exception (the design question)
- The admitted active hook (`signal-orchestrator.ts:~1126-1160`) does NOT read a standalone "is-active" boolean — it tags `mode: tradingModeToRunMode(this.mode)` and fires **whenever the active orchestrator emit path runs**. That active path (orchestrator → SQE → RTB → TCL → paper-execution-engine) is itself **DORMANT until paper-active turns on** (it's exactly what B7b switches on). So co-locating the SQE/RTB/TCL/paper-open reject+admit hooks on that same active path makes them dormant **by construction** — no new boolean, same `this.mode` SoT. **⇒ Q4a satisfied for OBJ-2 + OBJ-3.**
- **⚠️ The exception = OBJ-1 (FX5 pre-filter).** The scanner (`fx5-scanner.ts` / `market-scanner.ts`) runs **CONTINUOUSLY today** (it feeds VTS), so a pre-filter reject hook placed there fires **always**, not dormant — and adds always-on write volume (every rejected pair, every cycle). **DESIGN QUESTION FOR YOU (Q-A):** gate the FX5 pre-filter capture on the active-mode predicate (so it only fires when paper-active — keeps B5a's zero-live-risk/dormant profile + bounds write volume, matches the §19.0.5 intent "when paper-active runs, we want explicit rejection rows") **[my recommendation]**, vs fire it always (more data, but a continuous writer — closer to the always-on Q-D probe profile we just carved out to B5c). I lean **gate-on-active** so all of B5a stays one coherent dormant unit.

## Anchor 3 — the FX5 reject sites (OBJ-1)
Recon enumerated ~10 candidate pre-strategy reject points in `fx5-scanner.ts` (incomplete-metrics, stablecoin, IMF LQ/VN core, per-family IMF, pattern-global, already-active, low-volume, high-spread, pattern-history, xStock-benchmark-bypass). **Caveat the recon raised + I'm flagging:** crypto FX5 rejection is **partly in `market-scanner.ts` global filters**, not all in `fx5-scanner.ts`. **Q-B for you:** scope OBJ-1 to the `fx5-scanner.ts` classifiedSurvivors reject points only, or also the upstream `market-scanner.ts` global-filter rejects? I'll bring the exact enumerated site list (file:line + stage label) as the Step-3 chunk-A artifact before writing any hook.

## Anchor 4 — the three later reject branches (OBJ-2)
- **SQE floor:** cleanest hook point is **`signal-orchestrator.ts:~664` where `sqeResult.passed === false`** is observed on the active path (the orchestrator already sees the verdict) → `reject_stage='sqe'`. (The evaluator file itself, `signal_quality_evaluator.ts`, the recon couldn't pin — hooking at the orchestrator's observation point is better anyway: one active-path site, mode in scope.)
- **RTB drop:** TTL was REMOVED (R9.3-C); signals now drop on **SQE-revalidation confidence-fail (`confidence < min_queue_confidence`) at `ready_to_buy_service.ts:~1605`** → `reject_stage='rtb'`. (The roadmap's "stale/TTL" wording predates R9.3-C; the real drop is the revalidation fail — I'll hook the actual drop.)
- **TCL:** dedup / capacity block. The VTS path already has a `tcl` reject hook (`vts-runner.ts:~3686`); the **active-path** equivalent site (dedup/capacity on the orchestrator→paper-engine active flow) is **Step-3-confirm** — I'll pin it before hooking.

## Anchor 5 — paper-engine open + close (OBJ-3) + the #94 finding (B5b)
- **Close (exists):** `paper-execution-engine.ts:1297-1359` writes `archiveExitDecision(...)` (a separate exit-capture function) — unchanged.
- **Open (NEW admit hook):** right after `storage.createPaperSimOpenPosition(...)` at **`paper-execution-engine.ts:~2341-2383`** → `archiveSignalEval({rejectStage:'admitted', source:'paper-execution-engine', mode: tradingModeToRunMode(this.mode), …})`. Dormant (engine open only runs when paper-active). try/catch.
- **#94 dormancy answer (your Q4b — belongs to B5b, recording here):** the xStock eval-cycle's existing archive hooks **fire EVERY cycle TODAY in the VTS/passive path** (not gated by paper-active). So bolting the VIX+DXY macro snapshot onto the xStock decision record is **ADDITIVE and starts writing on merge — NOT dormant.** Low-risk (one nullable JSONB field on an existing write) but must be declared non-dormant in B5b's §9.1.

## SIM content update (your Step-2 ask 5)
`SYSTEM_IMPACT_MAP.md:1735-1803` (the B70 data-capture section); specifically the deferred bullet at **:1794** ("reject-stage capture — admitted-only in v1") gets a real content update enumerating the 4 new active-path reject/admit hooks. This is a §17/§18 SIM **content** update, not a state-doc bump.

## Proposed Step-3 chunking
- **A** — (if Q-A=gate-on-active) the FX5 pre-filter reject hook(s) + the active-mode gate; bring the exact site list first.
- **B** — the 3 active-path reject hooks (SQE @ orchestrator:664, RTB @ ready_to_buy:1605, TCL active site).
- **C** — the paper-engine open admit hook.
- **D** — synthetic-fire unit tests (each hook fires `archiveSignalEval` with the right `reject_stage` + nulls the admit-only fields on a crafted input) + the (likely-zero) migration + SIM update.

## Questions for you
- **Q-A:** FX5 pre-filter capture — gate-on-active (my rec) vs always-on?
- **Q-B:** OBJ-1 scope — `fx5-scanner.ts` reject points only, or also `market-scanner.ts` global-filter rejects?
- **Q-C:** confirm hooking SQE-reject at the orchestrator's `sqeResult.passed===false` observation point (vs inside the evaluator) is the right call.
- **Q-D:** any objection to the A/B/C/D chunking?

---

## ★ STEP-2 RESOLVED (Langston APPROVE-to-Step-3, 2026-06-16)
- **Chunk-0 schema check DONE — ZERO MIGRATION.** `signal_eval_archive.final_score NUMERIC(8,6)` + `confidence_modulated NUMERIC(8,6)` are both **nullable** (confirmed in `drizzle/migrations/2026-05-05-b70-data-archive-tables.sql:96-97` AND the `2026-04-22-initial-schema.sql` partitions); `reject_stage TEXT NOT NULL` with the enum already defined. No `ALTER` needed.
- **★ SCORE-FIELDS DECISION ADOPTED (Langston headline catch — NO PATCHES):** do NOT force-null `final_score`/`confidence_modulated` on reject rows where the value is in scope. **`pre_filter` → null** (never scored). **`sqe` → capture the failing FinalScore** (the below-floor score is the most analytically valuable number). **`rtb` → capture `confidence_modulated`** (it IS the value tested at the drop). **`tcl` → capture both** (fully scored, dropped on dedup/capacity). Columns already nullable → still zero-migration, NOT a schema change; pass actuals at the hook instead of the writer's blanket `?? null`.
- **Q-A = GATE-ON-ACTIVE** (confirmed). Verify-before-edit: the scanner is upstream of the orchestrator + may not have `this.mode` in scope — the gate MUST read the same canonical mode SoT, NO parallel is-active boolean. Pin the SoT read path before writing the gate.
- **Q-B = capture by stage SEMANTICS, not file boundary.** Include `market-scanner.ts` global-filter TRUE decision-rejects (IMF/LQ/VN/per-family-IMF/volume/spread/pattern → CAPTURE); SKIP eligibility-exclusions (incomplete-metrics / stablecoin / already-active / benchmark-bypass — "never was a candidate"). **DELIVERABLE before any hook: the enumerated reject-site list tagged `{capture | skip-eligibility}` + stage, for Langston's Step-3 sign-off.**
- **Q-C = YES**, hook SQE-reject at the orchestrator `sqeResult.passed===false` chokepoint (mode in scope, dormant-by-construction; the evaluator runs continuously in VTS so hooking inside it would fire non-dormant). Verify `:664` is on the active-only emit branch.
- **Q-D chunking OK + 2 refinements:** (1) chunk-0 schema pre-check done up front (above); (2) chunk-D tests MUST include a **NEGATIVE/dormancy assertion** — in non-active (VTS / paper-inactive) mode the reject/admit hooks do NOT fire — that's what substantiates the zero-live-risk claim, not synthetic-fire alone.
- **Governance:** SIM content update at `:1794` (correct, a content update). **System Manual: state EXPLICITLY in the completion report WHY it's out of scope** — these are observe-only instrumentation hooks (no signal/regime/filter/math change), SIM-only is defensible but must be stated, not silently omitted (2026-06-16 rule).
- **#94/B5b:** non-dormant confirmed (rides the every-cycle xStock eval write) → B5b declares dormancy=false in §9.1 + a write-volume note.

**★ IMMEDIATE NEXT (Step-3 chunk-A artifact): the tagged reject-site enumeration (fx5-scanner + market-scanner) → Langston sign-off → THEN write the hooks (chunks A→B→C→D).**
