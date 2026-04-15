# BATCH 61 — Pre-Audit (Sub-Phase A: DBS Validation)

**Phase:** 15b — Regime / DBS / Strategy / Filter Restructure
**Sub-Phase:** A — DBS Validation
**Date:** 2026-04-14
**Author:** Claude Code
**Status:** DRAFT — pending Langston review (Thread 21)
**Scope doc:** `Claude Comms and Packages/Scope Files/BATCH_61_SCOPE.md` (approved 2026-04-14)
**Freeze status:** Regime/DBS code FROZEN except the instrumentation spec locked below.

---

## 1. Purpose

Per Phase 2 of the canonical workflow and CLAUDE.md §9 ("Always consult SIM in pre-audit"), this document:

1. Consults `SYSTEM_IMPACT_MAP.md` and `SYSTEM_MANUAL.md` for every component B61 touches.
2. Traces upstream dependencies, downstream consumers, shared state, background execution, and blast radius.
3. Locks the instrumentation footprint (fields, rotation, retention, sampling, timing budget) before implementation begins.
4. Surfaces any governance gaps discovered during the review.

If the SIM/SYSTEM_MANUAL consult surfaces contradictions, ambiguities, or silent-zero burials not yet documented, they are flagged here and addressed either before implementation or as Phase 10 governance deliverables.

---

## 2. SIM + SYSTEM_MANUAL Consult

### 2.1 Components Touched by B61

| Component | File | Touch Type | SIM §  |
|---|---|---|---|
| DBS module | `server/core/metrics/directional-bias.ts` | READ-ONLY | 5.1b |
| DBS types | `server/types/directional-bias.types.ts` | READ-ONLY | 5.1b |
| Regime classifier | `server/core/metrics/market-regime.ts` | READ-ONLY (cross-ref) | 5.1 |
| MCE | `server/services/market-context-engine.ts` | **INSTRUMENTATION** (add JSONL emit) | 5.2.5 |
| Market context types | `server/types/market-context.ts` | READ-ONLY | — |
| VTS trade logs | `logs/virtual_trades/YYYY-MM-DD.json` | READ-ONLY | — |
| Regime archive | `logs/regime_archive/` | READ-ONLY (secondary, sparse) | — |
| New telemetry log | `logs/phase15b_dbs_telemetry/YYYY-MM-DD.jsonl` | **NEW FILE (write)** | Added in §6 |
| Analysis scripts | `scripts/phase15b/*.ts` | **NEW FILES (read-only consumers)** | Added in §6 |

No other files are modified.

### 2.2 Per-Component Analysis

#### 2.2.1 `directional-bias.ts` (SIM §5.1b — CORRECTED 2026-04-15, FROZEN)

- **Upstream dependencies (from SIM):** OHLC candles (60-min), ATR (from MCE), EMA chain (computed internally from OHLC).
- **Downstream consumer sites (corrected 2026-04-15 post-Phase-3a-grep):** Two references exist in source. Both were initially misread as active consumers by CC + Langston during the halt-gate escalation; the corrected classification is "dormant wire on orchestrator, no-op half-wire on VTS, both buried under ambiguous orphan language":
  - **`server/services/signal-orchestrator.ts:454` — dormant consumer wire.** Imports `computeBiasConfidenceModifier` (L89). At L448–467 it computes `dbsModifier`, multiplies `extendedMetrics.confidence` by `dbsModifier`, and recomputes `finalScore`. Shipped 2026-03-05 22:08 UTC in commit `c28f0df`, same day as `directional-bias.ts` creation (commit `5bfa63b` 11:56 UTC). **Never executed against any captured cycle** — active trading has been continuously OFF since at least 2026-01-12 (zero rows in `trades`, `paper_trades`, `paper_sim_trades`; audit_log latest timestamp 2026-01-12 19:05 UTC, seven weeks before DBS integration). The L448 comment `// (parity with VTS path)` is doubly incorrect — VTS has no applying behavior and the orchestrator path has not run at all.
  - **`server/services/vts-runner.ts:877` — half-wired dead code.** Imports `computeBiasConfidenceModifier` (L67). At L875–877 computes `biasModifier = computeBiasConfidenceModifier(biasCategory)`. **The result is never referenced again anywhere in the file.** Every VTS-emitted trade across the 15-day audit window has `biasModifier` computed and immediately discarded.
- **Other DBS references (all classified benign):** `directional-bias.ts` + `directional-bias.types.ts` (emitters/types); `market-context-engine.ts` (computes and caches DBS on the MCE cycle — expected emitter); `market-indicators.ts` L291–305 (reads MCE DBS, caches `globalDBS` category, written to VTS trade metadata only); `vts-runner.ts` L1128/1409/1466/2668 (writes `pairDirectionalBias`/`globalDirectionalBias` into openTrade metadata — passthrough); `telemetry-repository.ts` L246–299 (persists trade metadata — passthrough); `routes.ts` L7474–7476 (API response display); `analytics.tsx`, `machine-learning.tsx` (UI display); `export-csv.ts`, `shared/schema.ts`, `frictionColor.ts` (metadata/display helpers).
- **15-day VTS audit window is DBS-clean.** Because vts-runner.ts:877 never applies the modifier and signal-orchestrator.ts:454 has never been exercised, no captured VTS trade has been modified by DBS. The ~960 closed VTS trades with `pairDirectionalBias` metadata between 2026-03-31 and 2026-04-14 are raw observations of the scoring path without applied DBS modulation. **B61 measurement integrity is intact.**
- **Shared state:** none — `directional-bias.ts` is a pure function on OHLC + ATR.
- **Background execution:** called synchronously from `MCE.computeContext()` on every cycle.
- **Blast radius of B61 action:** **ZERO** on `directional-bias.ts` (read-only). Instrumentation is added at three sites (MCE, signal-orchestrator, vts-runner) — all observational, feature-flagged, and constrained by the same timing-budget + try/catch rules locked in §6.
- **Governance-failure framing (corrected):** This is neither "DBS is orphaned" (B59 framing, ambiguous and partly false — the imports existed) nor "DBS has been silently shaping signals" (first-draft B61 framing, also false because active trading has been off). It is **"dormant wire on orchestrator, no-op half-wire on VTS, both buried under ambiguous orphan language."** Specific factual corrections needed in existing governance docs (tracked separately in §4 below):
  - SIM §5.1b says `Downstream consumers: NONE. Officially orphaned.` — **operationally true for captured decisions during the DBS era, but false as a code-path inventory claim**, because one dormant consumer wire (signal-orchestrator.ts:454) and one half-wired dead-code path (vts-runner.ts:877) both exist in source.
  - SYSTEM_MANUAL Layer 1b says `biasConfidenceModifier defined but never imported anywhere` — **objectively false.** Imported at `server/services/signal-orchestrator.ts:89` and `server/services/vts-runner.ts:67`.
  - The `// (parity with VTS path)` comment at `signal-orchestrator.ts:448` is a **false parity claim** — it asserts consistency with a sibling path that is itself dead code. This is a burial pattern worth naming in SYSTEM_MANUAL Layer 1b as a case study: future reviews should specifically flag comments that assert parity with another code path without verifying the other path actually does what the comment claims.

#### 2.2.2 `market-regime.ts` (SIM §5.1 — ACTIVE, FROZEN)

- **Upstream:** OHLC price data (60-min, aligned via HF8).
- **Downstream:** VTS Runner, Signal Orchestrator (via MCE).
- **Blast radius of B61 action:** ZERO — we read `volatility`, `momentum`, `adx`, and `regime` fields from the returned `regimeResult` object **via the MCE's existing `computeContext()` path**. No new call sites. No new imports into market-regime.ts.
- **Phase 15b audit finding (already in SIM):** 54.5% false-range contamination. This is exactly what A.2 Final's neutral-zone drift-contamination overlap metric quantifies.

**SIM entry is correct and current.** No update needed for B61.

#### 2.2.3 `market-context-engine.ts` (SIM §5.2.5 — ACTIVE, HIGH blast radius)

This is the **only file where code is modified** in B61.

- **Current behavior (market-context-engine.ts:103-178):** `computeContext(symbol, ohlcData, currentPrice, volume24h, smaPeriod?)` computes indicators + regime + directional bias in a single pass and caches the result for 60s. At line 170-175 it emits a console.log line `[Phase14][MCE] <symbol>: regime=... vol=... dbs=... bias=...`.
- **Upstream (from SIM):** OHLC data (from caller), `calculatePairRegime()`, `CANONICAL_REGIME_STRATEGY_MAP`.
- **Downstream (from SIM):** Signal Orchestrator, VTS Runner, `market-indicators.ts` `getMarketIndicators()`, `getDominantRegime()`.
- **Shared state:** per-symbol context cache (60s TTL), singleton.
- **Execution:** synchronous, called per symbol per cycle (60s) by both orchestrator and VTS.
- **Blast radius of B61 action:** **LOW-to-MEDIUM.** We add a structured JSONL emission *after* the cache write and *after* the existing console.log. The emission is fire-and-forget, guarded by a feature flag, and measured against the +1 ms ceiling locked in §6. The cache behavior, return value, and synchronous contract are unchanged. If the emission path throws, it is caught and the exception is swallowed with a rate-limited warning — **we do not let the telemetry breach fail regime computation.**
- **Cascade check:**
   - Signal Orchestrator — consumes `context`, unaffected.
   - VTS Runner — consumes `context`, unaffected.
   - `getMarketIndicators()` / `getDominantRegime()` — iterate the cache, unaffected.
- **Timing budget:** §6 locks a +1 ms per-pair ceiling. If exceeded in A.4 latency measurement, the emission is redesigned (async write queue) before merge.

**SIM entry needs a pointer to the B61 instrumentation** once merged. That is a Phase 10 deliverable, not a pre-audit action.

#### 2.2.4 VTS trade logs (`logs/virtual_trades/YYYY-MM-DD.json`)

- Read-only consumer. 15-day window (2026-03-31 → 2026-04-14, ~960 trades with `pairDirectionalBias`).
- No SIM entry needed (file is a data artifact, not a runtime component).
- Used for A.2 Provisional, A.1 edge-case sampling, A.4 component-sanity spot checks.
- **Known bias:** trade-sampled only, selection-biased by signal/filter survival. Already bounded by the A.2 Provisional / Final split locked in the scope.

#### 2.2.5 `logs/regime_archive/` (sparse, secondary)

- ~5 daily snapshots since B59 fix. Read-only, secondary.
- A.3 regime-boundary analysis treats this as supporting, not authoritative — explicit in scope §4 A.3 sub-item 4.

### 2.3 Shared State & Background Execution

- **MCE singleton cache:** 60s TTL per symbol. B61 does not modify cache contents. We only read the cached result and emit it.
- **No new timers, intervals, or background jobs.** The telemetry emission rides on the existing MCE cycle.
- **No DB writes.** File-only.
- **No schema changes.**

### 2.4 Blast Radius Summary

| Risk | Rating | Mitigation |
|---|---|---|
| Breaking regime computation for active trading | **VERY LOW** | emission is post-cache, fire-and-forget, caught; feature-flag gated |
| Breaking VTS passive learning | **VERY LOW** | same path, same mitigation |
| Distorting MCE cycle timing | LOW | +1 ms per-pair ceiling, regression check in A.4 |
| Disk/log pressure | LOW | 50 MB/day ceiling, daily rotation, Phase-15b-only retention, deletion plan on phase close |
| Silent-zero pollution of analysis outputs | LOW | `SENTINEL_ZERO` tagging locked in scope §4 across A.1/A.2/A.3/A.4 |
| Analysis drift from trade-sampled bias | LOW | A.2 Provisional explicitly non-gating, A.2 Final gates B62 |

**Overall B61 blast radius: LOW.** The instrumentation is observational, idempotent, file-only, and guarded.

### 2.5 SYSTEM_MANUAL Consult

- `SYSTEM_MANUAL.md:1297-1307` — Layer 1b DBS section already captures the orphan status, formula, categories, and the explicit governance-failure framing ("*This orphan state is the governance failure that Phase 15b exists to correct*"). No contradictions.
- `SYSTEM_MANUAL.md:88` — `calculatePairRegime()` row in the regime classifier table. Consistent with SIM §5.1.
- **Gap flagged (non-blocking for B61):** SYSTEM_MANUAL's DBS section does not document:
  1. The **early-return silent-zero path** (`score: 0` when OHLC length is insufficient or ATR ≤ 0). This is a behavior the audit needs to surface and the manual should mention. Candidate for a Phase 10 add under SYSTEM_MANUAL Layer 1b.
  2. The **ATR normalization specifics** — the scope A.1 subitem 3 is going to generate the first empirical data on whether cross-pair comparability actually holds. If A.1 exposes that ATR normalization is under- or over-compensating, SYSTEM_MANUAL Layer 1b must be updated.
- Neither gap blocks B61 implementation. Both are candidates for Phase 10 governance deliverables depending on audit findings.

---

## 3. Cross-Check Against Scope §1.2 Desired Outcome

For each desired outcome locked in the scope:

| Desired outcome | Evidence path | Deliverable |
|---|---|---|
| Formula + weights empirically validated | A.1 correlation, weight perturbation, ATR buckets | `BATCH_61_A1_FORMULA_REVIEW.md` |
| Thresholds behaviorally meaningful OR replaced | A.2 Final forward-return-by-category | `BATCH_61_A2_THRESHOLD_REVIEW_FINAL.md` |
| Global DBS methodology understood + stable basket | A.3 pair-universe analysis + industry cross-ref | `BATCH_61_A3_GLOBAL_DBS_METHODOLOGY.md` |
| DBS cycle-to-cycle stable + low latency + sane components | A.4 flicker + latency + component sanity | `BATCH_61_A4_DATA_QUALITY.md` |
| SENTINEL_ZERO quantified and excluded from analysis | A.4 silent-zero count + tagging rule in A.1/A.2/A.3 | all four deliverables |
| Cycle-sampled evidence authoritative, trade-sampled provisional | A.2 two-pass structure | Provisional + Final deliverables |

No gaps.

---

## 4. Governance Gaps Surfaced During Pre-Audit

1. **SYSTEM_MANUAL silent-zero documentation gap** — see §2.5. Non-blocking. Phase 10 candidate.
2. **SYSTEM_MANUAL ATR normalization specifics gap** — see §2.5. Non-blocking. Phase 10 candidate depending on A.1 findings.
3. **SIM §5.2.5 MCE entry will need a pointer to B61 instrumentation** after merge. Non-blocking. Phase 10 deliverable.
4. **No existing `scripts/phase15b/` directory** — will be created as part of implementation. Non-blocking.
5. **No existing `logs/phase15b_dbs_telemetry/` directory** — will be auto-created by the MCE emitter on first write. Non-blocking.

None of these block B61 implementation. All are tracked here so Phase 10 governance updates catch them.

---

## 5. Phase 15b Freeze Compliance Check

Per scope §1 and POST_AUDIT_ROADMAP.md:478, the following are **FROZEN** during Phase 15b and must not be modified in B61:

- [x] `server/core/metrics/directional-bias.ts` — formula, weights, thresholds, classification logic → **READ-ONLY in B61**
- [x] `server/core/metrics/market-regime.ts` — thresholds, formula, classifier logic → **READ-ONLY in B61**
- [x] `server/types/directional-bias.types.ts` — `DEFAULT_DBS_CONFIG`, `DEFAULT_BIAS_CONFIDENCE_MODIFIER`, `DIRECTIONAL_BIAS_CATEGORIES` → **READ-ONLY in B61**
- [x] No new consumer of DBS is introduced (no classifier routing change, no strategy gate, no filter, no sizing, no TEC early exit) → **CONFIRMED out of scope**

The only code change B61 makes is adding an emission call site in `market-context-engine.ts` (§6 below). That site does not read from or write to any frozen surface — it reads the already-computed `directionalBias` and `regimeResult` objects and writes them to a file.

**Freeze compliance: GREEN.**

---

## 6. Instrumentation Spec (LOCKED — no change without Langston re-approval)

### 6.1 Emission Point

**File:** `server/services/market-context-engine.ts`
**Location:** inside `computeContext()`, after line 175 (immediately after the existing `[Phase14][MCE]` console.log, after the cache write).
**Trigger:** every `computeContext()` call where a fresh (non-cached) result is produced. Cached-hit calls do not re-emit (prevents duplicate rows within the 60s TTL window).
**Gating:** environment variable `DT_PHASE15B_DBS_TELEMETRY=1`. When unset, emission is a no-op. Default unset outside staging.

### 6.2 Log File

- **Path:** `logs/phase15b_dbs_telemetry/YYYY-MM-DD.jsonl`
- **Rotation:** daily, keyed on UTC date at write time. New file auto-created on first write of the day.
- **Format:** JSONL (one JSON object per line, newline-delimited).
- **Write mode:** append-only. No in-process buffering beyond standard Node `fs.appendFile` (or an async write queue if §6.5 timing check fails).
- **Concurrency:** single writer per process. MCE is a singleton.

### 6.3 Field Schema (LOCKED)

Each line MUST contain exactly these fields:

```json
{
  "ts": "2026-04-14T20:57:47.123Z",
  "cycleId": "<string or numeric id tied to MCE cycle>",
  "symbol": "XXBTZUSD",
  "dbs": {
    "score": 0.342,
    "category": "UP_MODERATE",
    "slopeComponent": 0.148,
    "returnComponent": 0.111,
    "emaComponent": 0.083,
    "sentinelZero": false
  },
  "classifier": {
    "vol": 0.0087,
    "adx": 34.2,
    "mom": 0.0041,
    "regime": "RANGE_BOUND_STABLE"
  },
  "ohlc": {
    "len": 120
  },
  "atr": 145.3
}
```

**Rules:**
- `dbs.sentinelZero` is `true` iff the input to `computeDirectionalBias()` satisfies the early-return guard: `ohlcData.length < Math.max(DEFAULT_DBS_CONFIG.lookbackPeriod, DEFAULT_DBS_CONFIG.emaPeriods.slow + 1) || atr <= 0`. The emitter MUST import `DEFAULT_DBS_CONFIG` from `server/types/directional-bias.types.ts` and derive the guard from its live values — **no hardcoded `30` / `21` literal clone in the emitter.** Single source of truth with the DBS module. Computing this flag in the emitter rather than modifying `directional-bias.ts` preserves the freeze, but it does NOT permit a second definition of "silent zero."
- `cycleId` — derived from the MCE call context. If no natural ID exists, a monotonic counter on the MCE instance is acceptable (created as a private field in `market-context-engine.ts`).
- No field is optional. If a value is unavailable, emit `null`, not omit.
- No extra fields. Additions require pre-audit amendment.

### 6.4 Disk Budget

- **Estimated line size:** ~350 bytes compact JSON.
- **Pair universe:** ~88 pairs (FX5-scanned set).
- **Cycle frequency:** 60s → 1440 cycles/day per pair.
- **Projected daily volume:** 88 × 1440 × 350 B ≈ **44 MB/day**. Under the 50 MB/day ceiling.
- **Action if actual > 50 MB/day:** **STOP and re-approve.** Sampling cadence (every-2-cycles, pair subsets, etc.) is a **methodological change** to the A.2 Final evidence model, NOT an operational tweak. It cannot be applied unilaterally. CC must post the observed disk rate to Thread 21, propose a specific sampling strategy, and wait for Langston re-approval before applying. Until re-approved, instrumentation remains at full sampling or is disabled entirely.

### 6.5 Timing Budget

- **Ceiling:** +1 ms per `computeContext()` call on average across the full ~88-pair FX5 universe.
- **Measurement:** A.4 data-quality task includes a before/after `computeContext()` timing comparison using `performance.now()` sampling over a 10-cycle window.
- **Action if exceeded — automatic (operational, preserves evidence model):**
  1. Switch `fs.appendFile` to an async write queue (collect N lines, flush every 500ms or on N ≥ 100). Write queue preserves full sampling; it only defers the write cost. Applied automatically.
  2. Re-measure after async queue is in place.
- **Action if still exceeded after async queue — requires re-approval (methodological):**
  - Sampling reduction (every-2-cycles, odd/even pair, top-N by volume, etc.) is a methodology change to A.2 Final's evidence model and MUST be approved by Langston on Thread 21 before being applied. CC proposes a specific strategy with bias analysis; Langston approves or counters.
- **Hard stop:** if neither async queue NOR an approved sampling strategy brings emission under the ceiling, instrumentation is **disabled** and the pre-audit is **reopened** for a redesign round (e.g. move emission out-of-process, batch at the orchestrator level, etc.).

### 6.6 Retention

- **Retention window:** Phase 15b only.
- **Deletion trigger:** Phase 15b close (end of B65 or earlier if Sub-Phase E collapses).
- **Deletion owner:** CC as part of the Phase 15b closing completion report.
- **Backup:** none required. This is audit evidence; the deliverables (A.1–A.4 reports) are the long-term artifact, not the raw log.

### 6.7 Error Handling

- Emission is wrapped in `try/catch`. Any thrown error is caught and logged via a rate-limited `console.warn` (max 1/minute per error type).
- **Critical rule:** a failed emission MUST NOT fail `computeContext()`. The return value, cache write, and regime computation proceed normally regardless of emission outcome.
- If the log directory cannot be created or written, emission short-circuits silently after the first warning.

### 6.8 Analysis Scripts

**Location:** `scripts/phase15b/`
**Files to be created:**
- `analyze-a1-formula.ts` — A.1 formula review (consumes telemetry JSONL, no VTS dependency for correlation/perturbation/ATR bucket analysis).
- `analyze-a2-provisional.ts` — A.2 Provisional (consumes VTS trade logs).
- `analyze-a2-final.ts` — A.2 Final (consumes telemetry JSONL once forward window matures).
- `analyze-a4-data-quality.ts` — A.4 (consumes telemetry JSONL for flicker/latency/component sanity).
- Shared helpers as needed.

**Scripts are pure read-only consumers.** They produce Markdown deliverables into `Claude Comms and Packages/Scope Files/`. No DB writes. No staging-server-side artifacts.

### 6.9 Consumer-Site Observational Emitters (added 2026-04-15 per Phase-3a grep amendment)

Two additional feature-flagged emitters added to capture the dormant consumer wire and half-wired dead-code paths empirically. **No behavior change.** Both use the same gating env var `DT_PHASE15B_DBS_TELEMETRY=1`, the same try/catch + rate-limited warn error handling as the MCE emitter, and the same +1 ms/call timing ceiling.

**File path:** `logs/phase15b_dbs_telemetry/consumer_sites/YYYY-MM-DD.jsonl` — separate from the MCE telemetry path to keep consumer-site and MCE streams cleanly separated during analysis. Same daily rotation, append-only JSONL, same retention rules.

**Field schema (LOCKED):** each line MUST contain exactly these fields:

```json
{
  "ts": "2026-04-15T20:57:47.123Z",
  "cycleId": "<string or numeric id tied to MCE cycle>",
  "site": "signal-orchestrator.ts:454" | "vts-runner.ts:877",
  "symbol": "XXBTZUSD",
  "strategy": "<strategy id when available, null otherwise>",
  "dbsCategory": "UP_MODERATE",
  "dbsModifier": 1.0,
  "confidencePreDBS": 0.672,
  "confidencePostDBS": 0.672,
  "finalScorePreDBS": 0.481,
  "finalScorePostDBS": 0.481,
  "dbsApplied": false
}
```

**Rules:**
- `dbsApplied` is `true` iff the modifier actually changes confidence in the live execution path (i.e. `dbsModifier !== 1.0` AND the code path that applies it runs). At `vts-runner.ts:877`, `dbsApplied` MUST be `false` on every cycle — empirical confirmation of the dead-code status. At `signal-orchestrator.ts:454`, `dbsApplied` reflects whether the L456 branch `if (dbsModifier !== 1.0)` is taken (always false during B61 because active trading is off and the path does not execute).
- `confidencePreDBS` captured before the multiplication; `confidencePostDBS` after. At `vts-runner.ts:877`, `confidencePostDBS === confidencePreDBS` always.
- `finalScorePreDBS` is the FinalScore value prior to any DBS-triggered recomputation; `finalScorePostDBS` is the value after, when applicable. At `vts-runner.ts:877` they are equal.
- No field is optional. Missing values emit `null`, not omit.
- Additions require pre-audit amendment.

**Expected firing rates during B61:**
- `signal-orchestrator.ts:454` emitter: **zero lines per day.** Active trading is off; the call-site does not execute. This emitter buys measurement capacity for a future audit if active trading resumes; it produces no B61 audit data.
- `vts-runner.ts:877` emitter: one line per VTS strategy evaluation, `dbsApplied=false` on every line. Empirically confirms the dead-code status during the forward collection window.

**Disk budget contribution:** vts-runner emitter ~350 B/line × (strategy evaluations per cycle) × 1440 cycles/day. Rough estimate: ~88 pairs × 3 strategy evaluations × 350 B × 1440 ≈ 130 MB/day worst case. **If projected size exceeds 50 MB/day for this file**, CC posts the observed rate to Thread 21 and proposes a sampling strategy (e.g. 1-in-N cycles) per the §6.4 re-approval rule. The signal-orchestrator emitter is zero-cost during B61.

**Timing budget:** same +1 ms/call ceiling as the MCE emitter. Measured under Phase 3b A.4 data-quality task.

---

## 7. Implementation Plan (authoritative for Phase 3, revised 2026-04-15)

**Phase 3a — Pre-instrumentation checks:**
1. Run the **codebase consumer grep** (§2.2.1) for every plausible DBS consumer token. Attach result to the completion report. If any consumer match is found, halt and escalate to Thread 21 — SIM is incomplete.

**Phase 3b — Instrumentation implementation (expanded 2026-04-15 for consumer-site emitters):**
2. Add `DT_PHASE15B_DBS_TELEMETRY` env var handling + shared emitter helper module (`server/services/phase15b-dbs-telemetry.ts`) with the try/catch guard, rate-limited warn, and file-rotation logic used by all three emission sites.
3. Add private `cycleCounter` field to MCE singleton.
4. Import `DEFAULT_DBS_CONFIG` from `server/types/directional-bias.types.ts` in the MCE emitter (single source of truth for sentinel-zero guard — no hardcoded 30/21).
5. Add `emitDbsTelemetry(context, regimeResult, ohlcLen)` in MCE and invoke it immediately after the existing console.log at `market-context-engine.ts:175`. Writes to `logs/phase15b_dbs_telemetry/YYYY-MM-DD.jsonl` per §6.2.
6. Add consumer-site emitters per §6.9:
   - **`signal-orchestrator.ts:454`** — capture `confidencePreDBS`, `dbsModifier`, `confidencePostDBS`, `finalScorePreDBS`, `finalScorePostDBS`, `dbsApplied`. Emit immediately after the L466 `if (dbsModifier !== 1.0)` branch resolves (regardless of branch taken). Writes to `logs/phase15b_dbs_telemetry/consumer_sites/YYYY-MM-DD.jsonl`.
   - **`vts-runner.ts:877`** — capture `biasCategory`, `biasModifier` (as `dbsModifier`), `predictiveConfidence` (as both `confidencePreDBS` and `confidencePostDBS` since no application), and a computed `finalScorePreDBS`/`finalScorePostDBS` pair derived from the same pre-DBS scoring path VTS uses. Emit immediately after L877. `dbsApplied` always `false`.
7. Smoke-test locally:
   - MCE emitter: one `computeContext()` call with valid OHLC, one with short OHLC (triggers `sentinelZero=true`), one with `atr=0` (also `sentinelZero=true`). Verify JSONL shape and that `classifier.confidence` is NOT present.
   - Consumer-site emitters: verify a VTS run produces `consumer_sites/` lines with `site="vts-runner.ts:877"` and `dbsApplied=false`. Verify signal-orchestrator path is not exercised (zero lines with `site="signal-orchestrator.ts:454"`).
8. **Code review gate.** Generate full `git diff`, post to Thread 21 as a change list, wait for Langston's written approval. No push without his GREEN on the diff.
9. Push to staging. Deploy. Tail both log files for 15 minutes to confirm rotation, shape, and volume match §6.4 + §6.9 estimates.
10. Measure §6.5 timing for each of the three emission sites — record in the B61 completion report.

**Phase 3c — Analyses that can run before window maturity (parallel):**
11. Begin forward cycle-sampled collection.
12. CC runs **A.1 Provisional** on the 15-day VTS window (non-gating, exploratory).
13. CC runs **A.2 Provisional** on the 15-day VTS window (non-gating, exploratory).
14. CC runs **A.4 Provisional** on VTS trade metadata (component sanity spot check + silent-zero count from trade metadata; non-gating).
15. Langston runs **A.3** in parallel (the A.3 industry cross-reference can use external market data from the same 15-day period plus whatever external references Langston surfaces; it does not require cycle-sampled DBS telemetry).
16. After ~6 hours of cycle-sampled data is collected, CC runs **A.0 Baseline** (legacy classifier flicker baseline — prerequisite for A.4 Final).

**Phase 3d — Maturity gate:**
17. When CC believes the cycle-sampled window satisfies the 2-of-3 maturity test (scope §3), CC posts the 3 condition values to Thread 21 and requests Langston maturity confirmation.
18. **Langston confirms or rejects in writing.** No Final pass runs without the written confirmation.

**Phase 3e — Final passes (after maturity confirmation):**
19. CC runs **A.1 Final** on the cycle-sampled telemetry (gating).
20. CC runs **A.2 Final** on the cycle-sampled telemetry (gating).
21. CC runs **A.4 Final** on the cycle-sampled telemetry (gating). Flicker compared against A.0 baseline using the 1.5× relative target.

**Phase 3f — Completion:**
22. Cross-review all 8 deliverables (A.0, A.1 P+F, A.2 P+F, A.3, A.4 P+F).
23. Write `BATCH_61_COMPLETION_REPORT.md` with YES/NO/PARTIAL on each gate condition from scope §6.
24. Governance update pass: SIM §5.2.5 pointer to instrumentation, SYSTEM_MANUAL Layer 1b ATR normalization update IF A.1 Final findings warrant, SYSTEM_MANUAL silent-zero path documentation.
25. Langston final review and GREEN confirmation on Thread 21. Batch closes.

---

## 8. Approval Checklist (before Phase 3 implementation starts)

- [ ] Langston reviews this pre-audit on Thread 21.
- [ ] Instrumentation spec §6 approved as locked.
- [ ] Freeze compliance §5 confirmed.
- [ ] Governance gaps §4 acknowledged and accepted as non-blocking for B61.
- [ ] Three-way written approval.
- [ ] CC implements per §7.

---

---

## 9. Amendment Log

**2026-04-15 — Phase 3a grep amendment (CC + Langston three-way consensus, Kyle-approved framing correction).**

The Phase 3a codebase consumer grep surfaced two previously undocumented references to `computeBiasConfidenceModifier` at `server/services/signal-orchestrator.ts:454` and `server/services/vts-runner.ts:877`. Initial CC + Langston classification misread both as active consumers and concluded DBS had been shaping live signal confidence since Phase 14. That conclusion was factually wrong: active trading has been continuously OFF since at least 2026-01-12 (verified against zero rows in `trades`, `paper_trades`, `paper_sim_trades` and audit_log latest timestamp seven weeks before DBS integration on 2026-03-05). The signal-orchestrator consumer path has never executed against a captured cycle. The vts-runner compute-and-discard path has been running, but the modifier result is never applied.

Corrected framing: **"dormant wire on orchestrator, no-op half-wire on VTS, both buried under ambiguous orphan language."** The 15-day VTS audit window is DBS-clean; B61 measurement integrity is intact.

In-place edits folded into this file:
- §2.2.1 rewritten with corrected classification, all other DBS references inventoried as benign emitters/passthrough/display.
- §6.9 added — consumer-site observational emitter spec (locked).
- §7 Phase 3b step list expanded from 10 to 10 steps with the consumer-site emitter implementation integrated.

Governance-delta corrections logged separately in:
- `1-system-manual/SYSTEM_IMPACT_MAP.md` §5.1b (downstream consumer claim corrected)
- `1-system-manual/SYSTEM_MANUAL.md` Layer 1b (factual error corrected, false-parity-comment burial pattern added as case study)

Gate conditions in scope §6, A.1/A.2/A.4 methodology in scope §4, and the 2-of-3 maturity test in scope §3 are untouched by this amendment.

---

*End of BATCH_61_PRE_AUDIT.md.*
