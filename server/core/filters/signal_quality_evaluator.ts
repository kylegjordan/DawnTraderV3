/**
 * Directive 11.0E — Signal Quality Evaluator (SQE)
 * 
 * Final gatekeeper that evaluates signal quality based on FinalScore and RegimeWeight.
 * Thresholds are read from the screener_filters table (configurable via UI screeners tab).
 * 
 * FinalScore and RegimeWeight are the SOLE determinants for signal quality.
 * 
 * Exposure, correlation, and cooldown checks are handled by the Signal Orchestrator.
 */

import { storage } from '../../storage.js';
import { performanceMonitor } from '../diagnostics/performance_monitor';
import { normalizeInternal } from '../../markets/kraken-symbol-resolver';
import { diagnosticTrace } from '../diagnostics/trace_service';
import { dataAggregator } from '../../services/data-aggregator.js';
import { calculateFinalScore, calculateRegimeWeight } from '../utils/score-calculator.js';
import { isSignalProfitable, getMinROIForRegime, getDynamicROIThreshold } from '../calculations/expectancy.js';
// B-4.5: per-class fee resolution for the ROI gate (DB-governed, fail-hard).
import { getFrictionForAssetClass } from '../math/cost-model.js';
import { getPredictiveConfidence } from '../utils/score-calculator.js';
import { logSkippedSignal } from '../logging/skipped-signals-logger.js';
import { emitSqeShadow } from '../../services/data-archive/switch-on-evidence-sink.js';
// Phase 14.1 HF8 (B3): Confidence floor imports for centralized mode-based qualification

import type { RegimeStability } from '../../config/strategy-governance.js';
// HF9 Item B: Governance gate imports (migrated from active-execution-engine)
import { isStrategyEligible } from '../governance/strategy-eligibility.js';
import { getStrategyDependency } from '../../config/strategy-governance.js';
// B79.0n.ORCHESTRATOR (2026-05-27): per-asset-class pattern pool guardrails
// dispatcher. Replaces direct PATTERN_POOL_GUARDRAILS import — xstock pattern
// signals now route through XSTOCK_PATTERN_POOL_GUARDRAILS (DB-resolved 0.45
// floor) instead of crypto's 0.45 literal. Same value today (placeholder-clone)
// but per-class plumbing operational for future xstock calibration via
// module_constants.pattern_pool_gates.xstock_spot.pattern_final_score_min UPDATE.
import { getPatternPoolGuardrailsForAssetClass } from '../../asset_classes/pattern-pool-dispatch.js';
// B72 (2026-05-05): SQE default thresholds migrated to module='sqe_config'.
// Three-layer precedence preserved (Langston cc-inbox #906 + #910):
//   1. screener_filters row (mode-specific runtime authority — DB-overridable per paper/live)
//   2. module_constants ('sqe_config' — DB fallback default, B72-migrated)
//   3. Hardcoded mirror in SQE_DEFAULT_THRESHOLDS object below — kept ONLY for the
//      narrow case where module_constants warmup hasn't completed and a non-runtime
//      consumer (test/audit script) imports the const for static reference.
import { getCachedNumberRequired } from '../../services/module-constants-service.js';
// B79: xstock_spot weekend-pause + per-asset-class strategy whitelist.
// safeResolveAssetClass returns null on unknown — we treat null as
// crypto_spot back-compat to keep existing behavior identical.
import { asValidAssetClass, safeResolveAssetClass, type AssetClass } from '../../../shared/asset-classes.js';
import { isXstockMarketOpenUTC } from '../../asset_classes/xstock_spot/market-hours.js';
import { isStrategyEnabledForAssetClass } from '../../config/canonical-regime-strategy-map.js';

let _b79WeekendSkipCount = 0;
let _b79StrategyDisabledCount = 0;

// B79.0n.SCORING (2026-05-26 OBJ-4): static-mirror fallback observability counter.
// Fires when getSQEModuleDefaults() throws (module_constants cold cache or
// missing row). Used to verify the 48h gate before B79.0n.SCORING.b wildcard
// retirement — counter MUST stay at 0 across at least one weekend + one full
// UTC-day-cycle post-deploy. See pre-audit §6 + §7 §4.15 onboarding entry.
let _b79nScoringStaticMirrorFallbackCount = 0;
let _b79nScoringStaticMirrorLastFireMs = 0;
const SQE_STATIC_MIRROR_LOG_EVERY = 100;

/**
 * B79.0n.SCORING diagnostic accessor. Returns counter snapshot for
 * `/api/diagnostics/sqe-fallback-counter` route + tests.
 */
export function getSQEStaticMirrorFallbackStats(): { count: number; lastFireMs: number } {
  return {
    count: _b79nScoringStaticMirrorFallbackCount,
    lastFireMs: _b79nScoringStaticMirrorLastFireMs,
  };
}

const _SQE_GK = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };

/**
 * B72 sync resolver. Live runtime callers prefer this — reads the
 * module_constants row that was seeded by migration. Throws on cold cache.
 */
function getSQEModuleDefaults(): { minFinalScore: number; minRegimeWeight: number } {
  return {
    minFinalScore:    getCachedNumberRequired('sqe_config', 'min_final_score',   _SQE_GK),
    minRegimeWeight:  getCachedNumberRequired('sqe_config', 'min_regime_weight', _SQE_GK),
  };
}

/**
 * Directive 11.0B + B72: SQE Thresholds — static-import mirror of the seeded
 * module_constants row. Live runtime path is `getSQEThresholdsFromConfig(mode)`
 * which prefers screener_filters → module_constants → this constant.
 */
export const SQE_DEFAULT_THRESHOLDS = {
  MIN_FINAL_SCORE: 0.35,    // mirrors module_constants 'sqe_config.min_final_score'
  MIN_REGIME_WEIGHT: 0.30,  // mirrors module_constants 'sqe_config.min_regime_weight'
};

console.log(`[11.0B][SQE_CONFIG] Defaults (module_constants mirror): FinalScore>=${SQE_DEFAULT_THRESHOLDS.MIN_FINAL_SCORE} RegimeWeight>=${SQE_DEFAULT_THRESHOLDS.MIN_REGIME_WEIGHT}`);

export interface SQEInput {
  signalId: string;
  symbol: string;
  strategy: string;
  mode: 'paper' | 'live';
  // B79.0n.STORAGE (2026-05-21): assetClass is REQUIRED. Routes Layer 1 (screener_filters)
  // lookup to the correct per-class row instead of silently reading crypto thresholds.
  assetClass: AssetClass;
  finalScore?: number;
  regimeWeight?: number;
  confidence?: number;
  trendStrength?: number;
  volatility?: number;
  entryPrice?: number;
  targetPrice?: number;
  regime?: string;
  signalType?: string;
  regimeStability?: RegimeStability;  // Phase 14.1 HF8 (B3): For confidence floor check
  sourcePool?: string;  // Batch 37: Family-qualified source pool
  // P19-B8.5a (OBJ-3): the best-of-both chosen-mode net expectancy, COMPUTED UPSTREAM by
  // decideMakerTaker (signal-orchestrator.ts — runs just BEFORE the SQE per Kyle's P19-B7.2b
  // calc-free placement) and passed in for a pure SIGN CHECK. The SQE performs NO EV math here
  // (gate-inside, calculation-outside — same pattern as gating on the pre-computed finalScore).
  // ABSENT (legacy queued rows at deploy / a caller without a snapshot) → the check SKIPS
  // (fail-open, Langston Step-2 ratified) — the [11.8B] open-gate still nets every lifecycle:
  // it falls back to the taker-leg recompute when chosen_net_ev is null (active-execution-
  // engine.ts:2230), so no ungated path exists.
  chosenNetEv?: number;
  chosenEntryMode?: 'maker' | 'taker';  // logging/telemetry only — never gated on
}

export interface SQEOptions {
  skipDecay?: boolean;
  skipConfidenceFloor?: boolean;  // Phase 14.1 HF8 (B3): VTS cold-start bypass
  skipGovernanceGate?: boolean;   // HF9 Item B: VTS bypass (VTS has own inline governance)
  // P19-B8.5 OBJ-6 (Langston-approved design): ACTIVE-path callers set this to retire
  // the HF8 confidence floor + HF9 governance gate from BLOCKING duty — both gates
  // still EVALUATE and emit a decision-reconstructable shadow log, but never push a
  // failure. Rationale: on the active path both gates key off a regimeStability that
  // signal-orchestrator computes from HARDCODED cold-start defaults (driftScore=0.5,
  // volZ=0 — the real wiring doesn't exist there), so they were confidence wearing a
  // regime hat — the same contaminated axis B8.5a severed from ranking/sizing/the
  // finalScore gate. Admission stays governed by the honest gates: netEV>0 in-SQE +
  // the [11.8B] backstop + exploration-lane evidence admission. Bury-or-resurrect
  // decision homed at RUNNING_ISSUES #514 (precondition: real active-path drift/volZ
  // stability wiring). VTS callers keep their skip* flags — semantics unchanged.
  gateShadowMode?: boolean;
}

export interface SQEResult {
  passed: boolean;
  signalId: string;
  symbol: string;
  strategy: string;
  metrics: {
    finalScore: number;
    regimeWeight: number;
  };
  thresholds: {
    finalScoreMin: number;
    regimeWeightMin: number;
  };
  failures: string[];
  reason?: string;
}

export interface SQEBatchResult {
  passed: SQEResult[];
  rejected: SQEResult[];
  totalEvaluated: number;
  passRate: number;
}

/**
 * Directive 11.0B: Get SQE thresholds from screener config
 * Reads finalScoreMin and regimeWeightMin from screener_filters table
 *
 * B79.0n.STORAGE (2026-05-21): assetClass is REQUIRED. Layer 1 (screener_filters) now
 * routes per-class; Layer 2 (module_constants 'sqe_config') stays wildcard for this
 * batch (per-class deferred to SCORING — see RUNNING_ISSUES module_constants asymmetry).
 */
export async function getSQEThresholdsFromConfig(mode: 'paper' | 'live', assetClass: AssetClass): Promise<{ finalScoreMin: number; regimeWeightMin: number }> {
  // B72 precedence chain: screener_filters → module_constants → static mirror.
  // Layer 2 (module_constants) is the new B72-introduced authority: when
  // screener_filters has no row OR has a missing field, the seeded
  // 'sqe_config' module rows are used as the DB fallback default.
  let mcDefaults: { minFinalScore: number; minRegimeWeight: number };
  try {
    mcDefaults = getSQEModuleDefaults();
  } catch (err) {
    // module_constants not warm or row missing — fall back to static mirror.
    // This is the only place in SQE where the static const is consulted at runtime.
    //
    // B79.0n.SCORING (2026-05-26 OBJ-4): observable counter. The 48h verify-gate
    // before B79.0n.SCORING.b wildcard retirement REQUIRES this counter to stay
    // at zero across at least one weekend transition + one full UTC-day cycle.
    // Any non-zero count is a signal that the per-class resolver chain has a
    // gap (cache-key bug, asset-class string mismatch, dropped param) — investigate
    // before retiring the wildcard safety net.
    _b79nScoringStaticMirrorFallbackCount++;
    _b79nScoringStaticMirrorLastFireMs = Date.now();
    if (_b79nScoringStaticMirrorFallbackCount % SQE_STATIC_MIRROR_LOG_EVERY === 1) {
      console.warn(
        `[B79.0n.SCORING][SQE_STATIC_MIRROR_FALLBACK] count=${_b79nScoringStaticMirrorFallbackCount} ` +
        `mode=${mode} assetClass=${assetClass} — module_constants cache cold or row missing. ` +
        `48h verify-gate REQUIRES this counter to stay at 0 before wildcard retirement.`,
        err,
      );
    }
    mcDefaults = {
      minFinalScore: SQE_DEFAULT_THRESHOLDS.MIN_FINAL_SCORE,
      minRegimeWeight: SQE_DEFAULT_THRESHOLDS.MIN_REGIME_WEIGHT,
    };
  }

  try {
    const filters = await storage.getScreenerFilters({ mode, assetClass });
    if (filters) {
      return {
        finalScoreMin: parseFloat(filters.finalScoreMin || String(mcDefaults.minFinalScore)),
        regimeWeightMin: parseFloat(filters.regimeWeightMin || String(mcDefaults.minRegimeWeight)),
      };
    }
  } catch (err) {
    console.warn(`[SQE][CONFIG] Failed to load screener config for ${mode}, using module_constants defaults:`, err);
  }

  return {
    finalScoreMin: mcDefaults.minFinalScore,
    regimeWeightMin: mcDefaults.minRegimeWeight,
  };
}

/**
 * Directive 11.0B: Evaluate a single signal against SQE thresholds
 * ONLY evaluates FinalScore and RegimeWeight - no legacy metrics
 * 
 * @param input - Pre-computed signal metrics (must include finalScore and regimeWeight)
 * @param options - Optional evaluation settings
 * @returns SQEResult with pass/fail status and any failures
 */
export async function evaluateSignalQuality(input: SQEInput, options: SQEOptions = {}): Promise<SQEResult> {
  const failures: string[] = [];

  const canonicalSymbol = normalizeInternal(input.symbol);

  // ───── B79: per-asset-class gates ──────────────────────────────────────
  // P19-B6.5d (OBJ-3 + OBJ-5): the SQE gate decides the xstock-vs-crypto path, so it
  // MUST honor the CARRIED stamp (input.assetClass, REQUIRED at the SQEInput interface)
  // — re-deriving from the symbol misroutes a collision ticker (a plain-kraken collision
  // resolves crypto, silently skipping every xStock gate). asValidAssetClass guards a
  // runtime-missing stamp (a caller that bypassed the REQUIRED type); a truly-absent
  // stamp on this active money gate FAILS CLOSED — no silent crypto_spot default
  // (Langston OBJ-5, rule #10). The safe-resolve fallback fires the central
  // classify-fall-through alarm if it too cannot classify.
  const resolvedAssetClass = asValidAssetClass(input.assetClass) ?? safeResolveAssetClass(input.symbol, 'kraken');
  if (resolvedAssetClass === null) {
    return {
      passed: false,
      signalId: input.signalId,
      symbol: canonicalSymbol,
      strategy: input.strategy,
      metrics: { finalScore: 0, regimeWeight: 0 },
      thresholds: { finalScoreMin: 0, regimeWeightMin: 0 },
      failures: ['unclassifiable_asset_class'],
      reason: 'unclassifiable_asset_class',
    };
  }

  if (resolvedAssetClass === 'xstock_spot') {
    // (a) Weekend-pause — ARCA hours. B79.0c: per-symbol — 24/7 names
    // (Kraken Phase 1) bypass the ARCA gate.
    if (!isXstockMarketOpenUTC(canonicalSymbol)) {
      _b79WeekendSkipCount++;
      if (_b79WeekendSkipCount % 50 === 1) {
        console.log(`[B79][XSTOCK_WEEKEND_PAUSE] skipping ${canonicalSymbol}/${input.strategy} — ARCA closed (count=${_b79WeekendSkipCount})`);
      }
      return {
        passed: false,
        signalId: input.signalId,
        symbol: canonicalSymbol,
        strategy: input.strategy,
        metrics: { finalScore: 0, regimeWeight: 0 },
        thresholds: { finalScoreMin: 0, regimeWeightMin: 0 },
        failures: ['xstock_weekend_closure'],
        reason: 'xstock_weekend_closure',
      };
    }
    // (b) Strategy whitelist — only the 6 well-understood, regime-based
    // strategies are enabled for xstock_spot in B79 (Langston Q2 conservative ship).
    // B79.0b N3 cleanup: dropped redundant `input.strategy &&` truthy guard —
    // SQEInput.strategy is typed `string` non-optional (line 75), so the
    // truthy check was dead code (TS guarantees it's never undefined; an
    // empty-string strategy name would be a type-violation upstream, not a
    // runtime contingency this gate needs to handle).
    if (!isStrategyEnabledForAssetClass(input.strategy, resolvedAssetClass)) {
      _b79StrategyDisabledCount++;
      if (_b79StrategyDisabledCount % 50 === 1) {
        console.log(`[B79][XSTOCK_STRATEGY_DISABLED] skipping ${canonicalSymbol}/${input.strategy} — not in xstock_spot whitelist (count=${_b79StrategyDisabledCount})`);
      }
      return {
        passed: false,
        signalId: input.signalId,
        symbol: canonicalSymbol,
        strategy: input.strategy,
        metrics: { finalScore: 0, regimeWeight: 0 },
        thresholds: { finalScoreMin: 0, regimeWeightMin: 0 },
        failures: ['asset_class_disabled'],
        reason: `asset_class_disabled:${resolvedAssetClass}`,
      };
    }
  }
  // ───────────────────────────────────────────────────────────────────────
  
  // Phase 14: FinalScore and RegimeWeight must be pre-computed by extended metrics
  // Backfill removed — callers must provide these values
  const finalScore = input.finalScore ?? 0;
  const regimeWeight = input.regimeWeight ?? 0;

  if (input.finalScore === undefined || input.finalScore === null) {
    console.warn(`[SQE][MISSING] FinalScore not pre-computed for ${canonicalSymbol}/${input.strategy} — defaulting to 0`);
  }
  if (input.regimeWeight === undefined || input.regimeWeight === null) {
    console.warn(`[SQE][MISSING] RegimeWeight not pre-computed for ${canonicalSymbol}/${input.strategy} — defaulting to 0`);
  }
  
  // Load thresholds from screener config (configurable via UI).
  // B79.0n.STORAGE (2026-05-21): assetClass plumbed from input.
  const thresholds = await getSQEThresholdsFromConfig(input.mode, input.assetClass);
  
  // Phase 14.5: Pattern pool signals use elevated quality floor
  // B79.0n.ORCHESTRATOR (2026-05-27): per-class dispatcher resolves the
  // pattern pool floor. Crypto returns 0.45 literal; xstock returns 0.45
  // DB-resolved (same value today, plumbing live for future xstock divergence).
  // input.assetClass is REQUIRED on SQEInput per B79.0n.STORAGE — no fallback.
  const effectiveMinFinalScore = input.sourcePool === 'pattern'
    ? getPatternPoolGuardrailsForAssetClass(input.assetClass).FINAL_SCORE_FLOOR
    : thresholds.finalScoreMin;                    // 0.35 for quant (default)

  // P19-B8.5a (OBJ-5): the finalScore GATE is RETIRED (Kyle-ratified crew consensus 2026-07-13,
  // P25_SCORING_STACK_PRESTUDY §7: intent REDUNDANT — composites feed EV gates, never replace
  // them; finalScore measured anti-predictive r=−0.140). finalScore keeps being COMPUTED and its
  // would-have-rejected verdict is SHADOW-LOGGED through the paper period — the formal field-kill
  // ruling comes post-paper on this log's evidence. The thresholds stay resolvable as shadow-only
  // knobs (getSQEThresholdsFromConfig unchanged); NOTHING is pushed to failures here.
  if (finalScore < effectiveMinFinalScore) {
    console.log(`[P19-B8.5a][SQE][FINALSCORE_SHADOW] ${canonicalSymbol}/${input.strategy}: would-have-rejected — FinalScore ${finalScore.toFixed(4)} < ${effectiveMinFinalScore} (${input.sourcePool === 'pattern' ? 'pattern' : 'quant'} threshold; gate retired, log-only)`);
    // B-EVIDENCE-SINK: durable capture of the would-have-rejected shadow (dual-write; the console.log
    // above is the evidence-of-last-resort). Fire-and-forget, degrades on failure, never throws here.
    emitSqeShadow(
      { symbol: canonicalSymbol, strategy: input.strategy, assetClass: input.assetClass ?? 'unknown', regime: input.regime, sourcePool: input.sourcePool, mode: input.mode },
      { finalScore, threshold: effectiveMinFinalScore },
    );
  }

  // P19-B8.5a (OBJ-3): NET-EXPECTANCY ADMISSION GATE — the number we rank on is the number that
  // admits (Kyle directive 2026-07-13: the net-EV gate belongs in the SQE). Pure sign check on the
  // UPSTREAM-computed best-of-both chosenNetEv (calc-free preserved — see SQEInput.chosenNetEv).
  // SQE = the admission AUTHORITY; the [11.8B] open-gate remains STILL-BLOCKS as the drift
  // backstop (Kyle default — its reject counter is the GATES-DRIFTED alarm, expected ~0).
  // ABSENT chosenNetEv → skip (fail-open, Langston-ratified; [11.8B]'s taker-leg fallback still
  // nets legacy rows — no ungated lifecycle).
  if (input.chosenNetEv != null && !(input.chosenNetEv > 0)) {
    failures.push(`NetEV ${input.chosenNetEv.toFixed(6)} <= 0 (chosen ${input.chosenEntryMode ?? 'taker'} mode — non-positive net expectancy after friction)`);
  }

  // Directive 11.0B: RegimeWeight check
  if (regimeWeight < thresholds.regimeWeightMin) {
    failures.push(`RegimeWeight ${regimeWeight.toFixed(4)} < ${thresholds.regimeWeightMin}`);
  }
  
  // Directive 11.7C Task 5: Regime-Aware ROI Gate with PredictiveConfidence (SQE parity with VTS)
  // Only apply if entry/target/regime are provided
  if (input.entryPrice && input.targetPrice && input.regime) {
    // B79.0n.SCORING (2026-05-26): assetClass threaded for per-class cache-key isolation
    const predictiveConf = getPredictiveConfidence(input.assetClass, canonicalSymbol, input.regime, input.strategy);
    // B-4.5: fee is REQUIRED — resolved per-class (DB-governed taker, fail-hard).
    const _b45Fee = getFrictionForAssetClass(input.assetClass).feeRateTaker;
    if (!isSignalProfitable(input.entryPrice, input.targetPrice, input.regime, input.assetClass, predictiveConf, _b45Fee)) {
      const expectedROI = (input.targetPrice - input.entryPrice) / input.entryPrice;
      const dynamicROI = getDynamicROIThreshold(input.regime, input.assetClass, predictiveConf);
      failures.push(`ROI ${(expectedROI * 100).toFixed(2)}% < ${(dynamicROI * 100).toFixed(2)}% for ${input.regime} (conf=${predictiveConf.toFixed(2)})`);
      logSkippedSignal({
        symbol: canonicalSymbol,
        reason: 'Low_ROI',
        regime: input.regime,
        expectedROI,
        minROI: dynamicROI,
        signalType: input.signalType,
        strategy: input.strategy,
        finalScore,
        regimeWeight,
        source: 'SQE'
      });
      console.log(`[11.7C][SQE][ROI_Gate] Skipping ${canonicalSymbol}: ROI ${(expectedROI * 100).toFixed(2)}% < min ${(dynamicROI * 100).toFixed(2)}% (conf=${predictiveConf.toFixed(2)}) for ${input.regime}`);
    }
  }
  
  // Phase 14.1 HF8 (B3): Confidence floor check (Directive 11.7S)
  // Centralized here so both VTS and active trading use the same qualification gate.
  // VTS signals pass skipConfidenceFloor=true for cold-start bypass (no data -> no confidence -> no trades loop).
  // ══════════════════════════════════════════════════════════════════════════
  // 11.7S CONFIDENCE FLOOR DELETED — B-SIZING-DEC-RESTORE obj-10 (Kyle, 2026-08-07)
  // ══════════════════════════════════════════════════════════════════════════
  // This gate derived its floor from the class-less stability→posture overlay, which
  // is deleted. It was ALREADY non-blocking in practice: VTS bypassed it via
  // skipConfidenceFloor (the cold-start paradox), and the live path ran it in
  // gateShadowMode — logging "would-REJECT" and never rejecting (P19-B8.5 OBJ-6,
  // Langston-approved, #514). So removing it changes NO admission decision today.
  //
  // Posture-derived floors return only with the AMR's per-class dials, through
  // meetsConfidenceFloorForClass — which survives and is class-correct. Reinstating
  // a class-less floor here would rebuild exactly what obj-10 deleted.

  // B-5 AMR (Obj-5, F1): per-class AMR admission gates — UNCONDITIONAL (no
  // skip option) and SELF-SOURCING (the gate resolves flag/mode itself; the
  // RTB refresh path re-runs SQE with partial inputs, so caller-injected
  // context would silently skip gating there). disabled → no-op; shadow →
  // dry-run onto the decision ledger; active → real blocks. Pause precedence
  // (F3) holds because killSwitch checks upstream and TCL checks downstream
  // remain independent ANDs around this one.
  {
    const { evaluateAmrGates } = await import('../governance/amr-gates.js');
    const amr = evaluateAmrGates({
      assetClass: input.assetClass,
      site: 'sqe_admission',
      strategy: input.strategy,
      sourcePool: input.sourcePool, // B2 (Langston Step-4): SQE has it — shadow evidence must not be pool-blind
      confidence: input.confidence,
    });
    if (!amr.allowed) {
      for (const b of amr.blocks) failures.push(`AMR ${b.gate}: ${b.reason}`);
      console.log(`[B-5][SQE][AMR_GATE] BLOCK ${canonicalSymbol}: ${amr.blocks.map(b => b.gate).join(',')} (mode=${amr.mode})`);
    }
  }

  // HF9 Item B: Governance gate (migrated from active-execution-engine Directive 11.7R-E)
  // Checks strategy eligibility based on regime stability and dependency level.
  // VTS signals pass skipGovernanceGate=true (VTS has its own inline governance checks).
  // B79.0b N3 cleanup (Langston Q1 revise): dropped `input.strategy &&` from
  // the &&-chain — same dead-truthy reasoning as line 199 (input.strategy is
  // typed `string` non-optional). `input.regimeStability` truthy IS
  // load-bearing (typed `RegimeStability?` optional at line 86); leave that.
  if (!options.skipGovernanceGate && input.regimeStability) {
    const dependency = getStrategyDependency(input.strategy);
    if (!isStrategyEligible(input.strategy, input.regimeStability, dependency)) {
      if (options.gateShadowMode) {
        // P19-B8.5 OBJ-6: shadow, never block (see SQEOptions.gateShadowMode).
        // Decision-reconstructable: strategy + dependency + the stability that would block.
        console.log(`[P19-B8.5][GOV_GATE_SHADOW] ${canonicalSymbol}/${input.strategy}: would-BLOCK — ${dependency} dep in stability=${input.regimeStability} (class=${input.assetClass})`);
      } else {
        failures.push(`Governance: ${input.strategy} (${dependency} dep) blocked in ${input.regimeStability}`);
        console.log(`[11.7R-E][SQE] GOVERNANCE BLOCK: ${canonicalSymbol} ${input.strategy} (${dependency} dep) in ${input.regimeStability}`);
      }
    }
  }

  const passed = failures.length === 0;
  
  const status = passed ? 'PASS' : 'FAIL';
  const reason = passed ? 'thresholds_met' : failures[0]?.split(' ')[0] || 'unknown';
  // B79.0n.SCORING (2026-05-26 R-5): include assetClass tag so Step 7 resolver-
  // consumption probe can confirm per-class threshold resolution via log-tail.
  console.log(`[11.0B][SQE_EVAL] ${status} symbol=${canonicalSymbol} strategy=${input.strategy} assetClass=${input.assetClass} finalScore=${finalScore.toFixed(4)} regimeWeight=${regimeWeight.toFixed(4)} thresholdFinalScoreMin=${thresholds.finalScoreMin} thresholdRegimeWeightMin=${thresholds.regimeWeightMin} reason=${reason}`);

  performanceMonitor.recordSQEEvaluation(passed);

  dataAggregator.capture('SQE_EVAL', {
    symbol: canonicalSymbol,
    strategy: input.strategy,
    finalScore: finalScore,
    regimeWeight: regimeWeight,
    sqeScore: passed ? 1 : 0,
    passed
  }).catch(() => {});
  
  diagnosticTrace.traceSQE(
    canonicalSymbol,
    input.strategy,
    {
      finalScore: finalScore,
      regimeWeight: regimeWeight,
    },
    passed,
    true
  );
  
  const clampedMetrics = {
    finalScore: Math.max(0, Math.min(1, finalScore)),
    regimeWeight: Math.max(0, Math.min(1, regimeWeight)),
  };
  
  return {
    passed,
    signalId: input.signalId,
    symbol: canonicalSymbol,
    strategy: input.strategy,
    metrics: clampedMetrics,
    thresholds,
    failures,
    reason: passed ? undefined : failures.join('; '),
  };
}

/**
 * Synchronous version for backward compatibility during transition
 * Uses default thresholds - for full config support use async version
 */
export function evaluateSignalQualitySync(input: SQEInput, thresholds?: { finalScoreMin: number; regimeWeightMin: number }): SQEResult {
  const failures: string[] = [];
  
  const canonicalSymbol = normalizeInternal(input.symbol);
  
  const config = thresholds || {
    finalScoreMin: SQE_DEFAULT_THRESHOLDS.MIN_FINAL_SCORE,
    regimeWeightMin: SQE_DEFAULT_THRESHOLDS.MIN_REGIME_WEIGHT,
  };
  
  // Directive 11.0E: Dynamic backfill for sync version - no legacy metrics
  let finalScore = input.finalScore;
  let regimeWeight = input.regimeWeight;
  
  if (finalScore === undefined || finalScore === null) {
    finalScore = calculateFinalScore({
      confidence: input.confidence ?? 0.5,
      regimeWeight: input.regimeWeight ?? 0.5,
    });
  }
  
  if (regimeWeight === undefined || regimeWeight === null) {
    // ⚠️ COMPILE-COMPATIBILITY ONLY — NOT a hardening of this function (B-REGIME-INPUTS-LIVE).
    // `calculateRegimeWeight` now returns `{ok,value,reason}` instead of a bare number, so this
    // call site must unwrap or it throws (`regimeWeight.toFixed is not a function`).
    //
    // ★ THIS FUNCTION IS DEAD ON THE PRODUCTION PATH — `evaluateSignalQualitySync` has ZERO
    // non-test callers (verified repo-wide: only its own definition + one unit test). The LIVE
    // active path is the ASYNC `signalQualityEvaluator.evaluate()` (signal-orchestrator.ts:864,
    // ready_to_buy_service.ts:1005/:1327), which this batch does NOT touch.
    //
    // ★ WHY IT IS ONLY PATCHED, NOT FIXED-PROPERLY OR DELETED HERE: an earlier cut of this batch
    // rewrote this function with the full reject-on-absence treatment. That was MISDIRECTED
    // EFFORT on dead code (Langston Step-4) and it was reverted — hardening a 0-caller function
    // makes the corpse look maintained and makes the diff overstate live coverage. Per §15 /
    // rule 18 a 0-caller function is a DELETION candidate, not an edit target.
    // ⇒ Deletion is HOMED TO #546's sweep, deliberately kept with that gate's `?? 0` /
    //   `regimeWeight: 0` findings so a reviewer opening either finds both facts in one place
    //   (CC-B + Langston concurred, 2026-07-20). Do NOT invest in this body meanwhile.
    const _rw = calculateRegimeWeight({
      trendStrength: (input as any).trendStrength ?? 0.5,
      volatility: (input as any).volatility ?? 0.3,
    });
    regimeWeight = _rw.ok ? _rw.value : 0.5;  // preserves the PRE-EXISTING substitute behaviour
  }
  
  // P19-B8.5a (OBJ-5): finalScore gate RETIRED in the sync variant too (semantic parity with the
  // async path) — shadow-log only. See the async block for the full rationale + consensus cite.
  if (finalScore < config.finalScoreMin) {
    console.log(`[P19-B8.5a][SQE][FINALSCORE_SHADOW] ${canonicalSymbol}/${input.strategy}: would-have-rejected — FinalScore ${finalScore.toFixed(4)} < ${config.finalScoreMin} (gate retired, log-only; sync)`);
    // B-EVIDENCE-SINK: durable capture (sync-path parity with the async block above).
    emitSqeShadow(
      { symbol: canonicalSymbol, strategy: input.strategy, assetClass: input.assetClass ?? 'unknown', regime: input.regime, sourcePool: input.sourcePool, mode: input.mode },
      { finalScore, threshold: config.finalScoreMin },
    );
  }

  if (regimeWeight < config.regimeWeightMin) {
    failures.push(`RegimeWeight ${regimeWeight.toFixed(4)} < ${config.regimeWeightMin}`);
  }

  // P19-B8.5a (OBJ-3): net-expectancy admission gate — sync-variant parity (pure sign check on the
  // upstream-computed chosenNetEv; absent → skip, fail-open per Langston Step-2).
  if (input.chosenNetEv != null && !(input.chosenNetEv > 0)) {
    failures.push(`NetEV ${input.chosenNetEv.toFixed(6)} <= 0 (chosen ${input.chosenEntryMode ?? 'taker'} mode — non-positive net expectancy after friction)`);
  }
  
  // Directive 11.7A Task 3: Regime-Aware ROI Gate (SQE parity with VTS) - Sync version
  if (input.entryPrice && input.targetPrice && input.regime) {
    // B-4.5: fee REQUIRED; `undefined` keeps the predictiveConfidence default (0.5).
    if (!isSignalProfitable(input.entryPrice, input.targetPrice, input.regime, input.assetClass, undefined, getFrictionForAssetClass(input.assetClass).feeRateTaker)) {
      const expectedROI = (input.targetPrice - input.entryPrice) / input.entryPrice;
      const minROI = getMinROIForRegime(input.regime, input.assetClass);
      failures.push(`ROI ${(expectedROI * 100).toFixed(2)}% < ${(minROI * 100).toFixed(2)}% for ${input.regime}`);
      logSkippedSignal({
        symbol: canonicalSymbol,
        reason: 'Low_ROI',
        regime: input.regime,
        expectedROI,
        minROI,
        signalType: input.signalType,
        strategy: input.strategy,
        finalScore,
        regimeWeight,
        source: 'SQE'
      });
    }
  }
  
  const passed = failures.length === 0;
  
  const status = passed ? 'PASS' : 'FAIL';
  const reason = passed ? 'thresholds_met' : failures[0]?.split(' ')[0] || 'unknown';
  // B79.0n.SCORING (2026-05-26 R-5): include assetClass tag in sync path too.
  console.log(`[11.0D][SQE_EVAL] ${status} symbol=${canonicalSymbol} strategy=${input.strategy} assetClass=${input.assetClass} finalScore=${finalScore.toFixed(4)} regimeWeight=${regimeWeight.toFixed(4)} reason=${reason}`);
  
  performanceMonitor.recordSQEEvaluation(passed);
  
  return {
    passed,
    signalId: input.signalId,
    symbol: canonicalSymbol,
    strategy: input.strategy,
    metrics: {
      finalScore: Math.max(0, Math.min(1, finalScore)),
      regimeWeight: Math.max(0, Math.min(1, regimeWeight)),
    },
    thresholds: config,
    failures,
    reason: passed ? undefined : failures.join('; '),
  };
}

/**
 * Evaluate a batch of signals
 */
export async function evaluateSignalBatch(inputs: SQEInput[]): Promise<SQEBatchResult> {
  const passed: SQEResult[] = [];
  const rejected: SQEResult[] = [];
  
  for (const input of inputs) {
    const result = await evaluateSignalQuality(input);
    if (result.passed) {
      passed.push(result);
    } else {
      rejected.push(result);
    }
  }
  
  return {
    passed,
    rejected,
    totalEvaluated: inputs.length,
    passRate: inputs.length > 0 ? passed.length / inputs.length : 0,
  };
}

/**
 * Get the primary failure reason for a signal
 */
export function getPrimaryFailureReason(result: SQEResult): string | null {
  if (result.passed || result.failures.length === 0) {
    return null;
  }
  
  if (result.metrics.finalScore < result.thresholds.finalScoreMin) {
    return 'LOW_FINAL_SCORE';
  }
  if (result.metrics.regimeWeight < result.thresholds.regimeWeightMin) {
    return 'LOW_REGIME_WEIGHT';
  }
  
  return 'UNKNOWN';
}

/**
 * Check if a signal is marginally safe (close to thresholds)
 */
export function isMarginallySafe(result: SQEResult): boolean {
  if (!result.passed) return false;
  
  const marginThreshold = 0.05;
  
  const finalScoreMargin = result.metrics.finalScore - result.thresholds.finalScoreMin;
  if (finalScoreMargin < marginThreshold) return true;
  
  const regimeMargin = result.metrics.regimeWeight - result.thresholds.regimeWeightMin;
  if (regimeMargin < marginThreshold) return true;
  
  return false;
}

/**
 * Get SQE default thresholds for display/diagnostics
 */
export function getSQEDefaultThresholds(): typeof SQE_DEFAULT_THRESHOLDS {
  return { ...SQE_DEFAULT_THRESHOLDS };
}

/**
 * Directive 11.0B: Export thresholds constant for tests
 */
export const SQE_THRESHOLDS = SQE_DEFAULT_THRESHOLDS;

/**
 * Signal Quality Evaluator service instance
 */
class SignalQualityEvaluatorService {
  private evaluationCount = 0;
  private passCount = 0;
  private rejectCount = 0;
  private cachedThresholds: Map<string, { thresholds: { finalScoreMin: number; regimeWeightMin: number }; cachedAt: number }> = new Map();
  private cacheTTL = 60000; // 1 minute cache
  
  // B79.0n.STORAGE (2026-05-21): cache key extended to `${mode}:${assetClass}` so
  // crypto and xStock cycles do not share cached thresholds. Without this, a crypto
  // cycle's threshold load would return on a later xStock cycle (or vice versa) and
  // silently route the wrong values.
  async getThresholds(mode: 'paper' | 'live', assetClass: AssetClass): Promise<{ finalScoreMin: number; regimeWeightMin: number }> {
    const cacheKey = `${mode}:${assetClass}`;
    const cached = this.cachedThresholds.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
      return cached.thresholds;
    }

    const thresholds = await getSQEThresholdsFromConfig(mode, assetClass);
    this.cachedThresholds.set(cacheKey, { thresholds, cachedAt: Date.now() });
    return thresholds;
  }
  
  async evaluate(input: SQEInput, options: SQEOptions = {}): Promise<SQEResult> {
    const result = await evaluateSignalQuality(input, options);
    
    this.evaluationCount++;
    if (result.passed) {
      this.passCount++;
    } else {
      this.rejectCount++;
      console.log(`[SQE][REJECT] ${input.symbol}/${input.strategy}: ${result.reason}`);
    }
    
    return result;
  }
  
  async evaluateBatch(inputs: SQEInput[]): Promise<SQEBatchResult> {
    return evaluateSignalBatch(inputs);
  }
  
  getStats(): { evaluations: number; passed: number; rejected: number; passRate: number } {
    return {
      evaluations: this.evaluationCount,
      passed: this.passCount,
      rejected: this.rejectCount,
      passRate: this.evaluationCount > 0 ? this.passCount / this.evaluationCount : 0,
    };
  }
  
  reset(): void {
    this.evaluationCount = 0;
    this.passCount = 0;
    this.rejectCount = 0;
    this.cachedThresholds.clear();
    console.log('[SQE] Stats and cache reset');
  }
}

export const signalQualityEvaluator = new SignalQualityEvaluatorService();
