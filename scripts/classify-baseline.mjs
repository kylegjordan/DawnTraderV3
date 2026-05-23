#!/usr/bin/env node
// scripts/classify-baseline.mjs
// B-NEW-43 chunk 6 (2026-05-23): audit + populate per-file phase_tag + context
// in .tsc-baseline.json.
//
// Outputs:
//   - .tsc-baseline.json updated in place (per-file phase_tag + context filled).
//   - Console summary by phase_tag bucket.
//
// Classification buckets:
//   Phase 19              — active-trading-path latent bugs / dormant code.
//                           Phase 19 restoration walkthrough (active-trading
//                           piece-by-piece) decides each cluster.
//   Phase 16              — legacy / dead code. Removal candidate. Some are
//                           already on the RUNNING_ISSUES #136 register.
//   Phase 19 or B-NEW-43  — could be either; chunk 7+ triage if VTS-current
//                           and confidently clean, else Phase 19.
//   B-NEW-43              — confidently clean current code; pick off in a
//                           future B-NEW-43 chunk (count drops from baseline).
//   TBD                   — genuinely uncertain; honest placeholder.
//
// Discipline (CC + Langston consensus 2026-05-23): per-file classifications
// are TRIAGE STARTING POINTS for Phase 19's walkthrough — not final calls.
// Specific known overrides come from B-NEW-43 chunks 3-5 investigation and
// RUNNING_ISSUES #136. The rest applies path-pattern rules. Files that
// don't match any rule fall to TBD (no confabulating buckets — Langston).
//
// Re-running this script is safe; it overwrites phase_tag + context but
// preserves frozen_at_commit / frozen_at_iso / frozen_by_batch (the
// chunk-5 freeze provenance is the durable record).

import { readFileSync, writeFileSync } from 'node:fs';

const BASELINE_PATH = '.tsc-baseline.json';

function total(errors) {
  return Object.values(errors).reduce((s, n) => s + n, 0);
}

// Specific overrides from B-NEW-43 chunks 3-5 investigation +
// RUNNING_ISSUES #136 legacy register.
const overrides = {
  'server/routes.ts': {
    phase_tag: 'Phase 19 (majority) + Phase 16 (some) + B-NEW-43 (schema-drift fixable)',
    context:
      'Top-error file (183 errors). Multiple clusters: (a) ~85 TS2339 are active-trading-path latent bugs in route handlers — Phase 19. (req.user.tradingMode subcluster was fixed in chunk 4 redo; remaining = portfolio_state row-property mismatches, scheduled_tasks_audit field reads, intent-task row reads, etc.) (b) ~25 TS2353 + ~10 TS2322 are schema drift — route bodies declaring fields that no longer exist on insert / WS-event types (userId on TradingSettings inserts, custom WebSocket event-type literals not in the canonical enum). These are B-NEW-43-fixable once each schema source-of-truth is confirmed current — chunk 7+. (c) ~25 TS2345 are argument-shape mismatches on storage / service calls — mostly Phase 19. Phase 19 walkthrough owns the active-trading subset; chunk 7+ can pick off the schema-drift fixes after a brief source-of-truth check.',
  },
  'server/routes/vts.ts': {
    phase_tag: 'Phase 19 or B-NEW-43',
    context:
      'VTS route surface (44 errors, mostly TS2345 argument-shape mismatches). VTS is CURRENTLY RUNNING (passive learning) so this file is operational, but the routes entangle with active-trading-path data shapes. Triage in chunk 7+: VTS-only argument mismatches are B-NEW-43-fixable; active-trading-shape mismatches go to Phase 19.',
  },
  'server/services/vts-runner.ts': {
    phase_tag: 'Phase 19',
    context:
      'VTS runner (43 errors). Currently running (passive learning). Phase10TradeRecord cluster (B70.2 at-entry-context archive at lines ~1882-1921 reads ~13 fields the producer at line 1543 never sets — silently archives undefined). Also: regime-confidence reads on a too-narrow type, OHLCResponse-vs-OHLCData[] mismatches, CanonicalRegimeType narrowing. Phase 19 restoration decides which feature wiring stays vs. is superseded by current architecture. The B70.2 archive feature was a Kyle directive (2026-05-05) — Phase 19 either populates the missing fields or replaces the archive mechanism.',
  },
  'server/services/signal-orchestrator.ts': {
    phase_tag: 'Phase 19',
    context:
      'Signal orchestrator (8 errors remaining post-chunks 1-4). Active-trading-path signal evaluation. PredictionInput shape mismatches, missing `../../config/strategy-governance.js` module (TS2307), ExtendedSignalMetrics narrowness (driftScore/volZ/regime). Phase 19 walkthrough.',
  },
  'server/core/rtb/ready_to_buy_service.ts': {
    phase_tag: 'Phase 19',
    context:
      'Ready-To-Buy service (8 errors). Active-trading-path. SQESignalInput latent-bug cluster — `input.ngc` / `input.riskScore` / `input.profitRate` read at lines 1595/1652/1653/1656/1692/1693/1701, never set by the signal-orchestrator producer (~643-669) or declared on the interface (88-114). `input.ngc.toFixed(4)` at line 1595 would throw on undefined; signal-orchestrator wraps the call in .catch() so the throw is silently swallowed — RTB queueing via that path may be silently failing. Phase 19 restoration decides whether ngc/riskScore/profitRate stay in the contract.',
  },
  'server/services/paper-execution-engine.ts': {
    phase_tag: 'Phase 19',
    context:
      'Paper execution engine (7 errors). Active-trading-path. StrategySignal extended-field reads (signalType / patternType / patternStrength) on a too-narrow union, strategy-key narrowing mismatches. Phase 19 restoration owns.',
  },
  'server/services/paper-48hr-simulation.ts': {
    phase_tag: 'Phase 16',
    context:
      'Legacy 48-hour paper simulation harness. Already on Phase-16 legacy register (RUNNING_ISSUES #136a). Deeply userId-coupled, predates mode-based architecture. Removal candidate.',
  },
  'server/services/command-router.ts': {
    phase_tag: 'Phase 16',
    context:
      'Natural-language command router. Already on Phase-16 legacy register (#136). 100% dead — instantiated at routes.ts:103 but `.routeCommand` / `.confirmCommand` never invoked anywhere in server/. Removal candidate.',
  },
  'server/services/stage-b-validator.ts': {
    phase_tag: 'Phase 16',
    context:
      'Stage-B validation harness — tests "8 strategies" but the system now has 18. Already on Phase-16 legacy register (#136). Removal candidate.',
  },
  'server/services/historic-signal-generator.ts': {
    phase_tag: 'Phase 16',
    context:
      'Historic signal backfill tool. Already on Phase-16 legacy register (#136). Removal candidate after Phase 19 confirms unused.',
  },
  'client/src/components/ai/ai-opportunities-tab.tsx': {
    phase_tag: 'Phase 16',
    context:
      'Frontend AI-Opportunities UI calling endpoints that B-NEW-43 chunk 2 deleted (`aiOpportunitiesService` removed in prior cleanup). Already on Phase-16 legacy register (#136c). Removal candidate.',
  },
  'client/src/components/ai/validation-reports-tab.tsx': {
    phase_tag: 'Phase 16',
    context:
      'Same as ai-opportunities-tab.tsx — calls deleted backend endpoints. Already on Phase-16 legacy register (#136c). Removal candidate.',
  },
  'client/src/pages/machine-learning.tsx': {
    phase_tag: 'Phase 16',
    context:
      'Machine-learning page UI (23 errors). Likely UI for a backend feature that was superseded by current architecture. Phase 16 review confirms removal vs. rebuild.',
  },
  'server/services/unified-core.ts': {
    phase_tag: 'Phase 19',
    context:
      'Unified core service (21 errors). Active-trading-path orchestrator. Phase 19 restoration owns.',
  },
  'server/storage.ts': {
    phase_tag: 'Phase 19 (majority) + B-NEW-43 (some)',
    context:
      'DatabaseStorage class (19 errors). Mode-keyed current infrastructure (used by VTS path), but many errors are "Property X does not exist on DatabaseStorage" pointing at internal references to methods removed in prior cleanups (similar to the Phase 41F-L `getTradingSettings` purge handled in chunks 1-3). Per-case investigation: storage-method removal stragglers are typically Phase 19 (the consumer methods are active-trading-path) but some may be cleanable as schema-drift TS2353 in chunk 7+.',
  },
  'server/index.ts': {
    phase_tag: 'B-NEW-43',
    context: 'Server entry point (1 error). Current/operational boot path. Pick off in a future B-NEW-43 chunk.',
  },
  'server/services/asset-capabilities.ts': {
    phase_tag: 'Phase 19 or B-NEW-43',
    context:
      'Asset capabilities service (11 errors). Multi-asset-system support — used by both VTS (current) and active-trading (dormant). Triage in chunk 7+: VTS-current capability resolution is B-NEW-43-fixable; active-trading-specific capability wiring is Phase 19.',
  },
  'server/strategies/inside-bar-reversal.ts': {
    phase_tag: 'Phase 19',
    context: 'Strategy detect method (1 error). Active-trading-path. Phase 19 owns strategy-engine restoration.',
  },
};

function classifyByPath(path, errors) {
  const t = total(errors);

  // Active-trading-path service patterns (autonomy / ethics / knowledge /
  // memory / reasoning / drift / state / learning / validation / etc).
  // Broadened ruleset to catch more services post-initial-pass.
  if (
    /^server\/services\/(autonomy|ethics|ethical|knowledge|memory|experience-memory|reasoning|reasoner|drift|state-aware|learning|continuous-learning|adaptive|gemini|m5d|m5e|c13|paper_validation|pre-execution-validator|alert-action|strategic-planner|intent-executor|actuation-policy|diagnostic|cle-orchestrator|system-config|auto_test_harness|commitTradeAndUpdatePortfolio|guardrail-policy|telemetry-aggregator|trading-engine|per-underlying-cap|trailing-exit|factor-ablation-emitter|screener-recalibration|narrative-feed|ai-summary-task|run-mode-controller|market-scan-task|system-health-check-task)/.test(
      path,
    )
  ) {
    return {
      phase_tag: 'Phase 19',
      context: `Active-trading-path service (${t} error${t === 1 ? '' : 's'}). Dormant since active trading went off at Phase 8 close (Nov 2025). Phase 19 restoration walkthrough decides each cluster.`,
    };
  }

  // Strategy detect modules — active-trading-path
  if (/^server\/strategies\//.test(path)) {
    return {
      phase_tag: 'Phase 19',
      context: `Strategy detect module (${t} error${t === 1 ? '' : 's'}). Active-trading-path. Phase 19 owns.`,
    };
  }

  // Core risk / strategy-mapper — active-trading-path
  if (/^server\/core\/(risk|strategy)/.test(path)) {
    return {
      phase_tag: 'Phase 19',
      context: `Core risk / strategy infrastructure (${t} error${t === 1 ? '' : 's'}). Active-trading-path. Phase 19 owns.`,
    };
  }

  // Sub-routes (server/routes/*) — mostly mixed
  if (/^server\/routes\//.test(path)) {
    return {
      phase_tag: 'Phase 19 or B-NEW-43',
      context: `Sub-route (${t} error${t === 1 ? '' : 's'}). Routes mix current/operational (VTS-path, calibration, pricing, status) with active-trading-path. Triage in chunk 7+: VTS-path / status-only routes are B-NEW-43-fixable; active-trading-only routes are Phase 19.`,
    };
  }

  // Data-archive — active-trading-path observability
  if (/^server\/services\/data-archive\//.test(path)) {
    return {
      phase_tag: 'Phase 19',
      context: `Data-archive infrastructure (${t} error${t === 1 ? '' : 's'}). Active-trading-path observability (signal-eval archive, partition exports, etc.). Phase 19 owns.`,
    };
  }

  // Replay-ablation scripts — active-trading-path
  if (/^server\/scripts\/(replay-ablation|factor-)/.test(path)) {
    return {
      phase_tag: 'Phase 19',
      context: `Replay/ablation script (${t} error${t === 1 ? '' : 's'}). Active-trading-path post-hoc analysis. Phase 19 owns.`,
    };
  }

  // metrics-core / response-cache — current infrastructure
  if (/^server\/services\/(metrics-core|response-cache)/.test(path)) {
    return {
      phase_tag: 'B-NEW-43',
      context: `Operational infrastructure (${t} error${t === 1 ? '' : 's'}). Current. Pick off in a future B-NEW-43 chunk.`,
    };
  }

  // Signal-pipeline / paper-sim active-trading-path components
  if (
    /^server\/(core\/rtb|services\/(paper-portfolio-manager|paper-position-sizing|paper-sim|signal-eval))/.test(
      path,
    )
  ) {
    return {
      phase_tag: 'Phase 19',
      context: `Active-trading-path signal-pipeline component (${t} error${t === 1 ? '' : 's'}). Phase 19 restoration owns.`,
    };
  }

  // Background jobs (active-trading-path)
  if (/^server\/jobs\//.test(path)) {
    return {
      phase_tag: 'Phase 19',
      context: `Background job — active-trading-path (${t} error${t === 1 ? '' : 's'}). Phase 19 restoration decides.`,
    };
  }

  // Core infrastructure (logging / telemetry / audit / metrics / governance)
  if (/^server\/core\/(logging|telemetry|audit|metrics|governance)/.test(path)) {
    return {
      phase_tag: 'Phase 19 or B-NEW-43',
      context: `Server core infrastructure (${t} error${t === 1 ? '' : 's'}). May be current/operational or active-trading-adjacent. Triage in chunk 7+: if confidently current, fix; otherwise Phase 19.`,
    };
  }

  // Startup / boot — current
  if (/^server\/startup\//.test(path)) {
    return {
      phase_tag: 'B-NEW-43',
      context: `Boot/startup infrastructure (${t} error${t === 1 ? '' : 's'}). Current/operational. Pick off in a future B-NEW-43 chunk.`,
    };
  }

  // Exchanges — current (Kraken VTS path is live)
  if (/^server\/exchanges\//.test(path)) {
    return {
      phase_tag: 'B-NEW-43',
      context: `Exchange integration (${t} error${t === 1 ? '' : 's'}). Current/operational (Kraken VTS path). Pick off in a future B-NEW-43 chunk.`,
    };
  }

  // MCE / scanners / context bridge / VTS service — current with active-trading adjacency
  if (
    /^server\/services\/(market-context-engine|fx5-scanner|context-bridge|paper-sim-diagnostic|vts-service|active-filter-pool)/.test(
      path,
    )
  ) {
    return {
      phase_tag: 'Phase 19 or B-NEW-43',
      context: `Current/operational service with active-trading-path adjacency (${t} error${t === 1 ? '' : 's'}). Triage in chunk 7+: if VTS-path-only / simple type fix, B-NEW-43; if active-trading-only, Phase 19.`,
    };
  }

  // Utilities — current
  if (/^server\/utils\//.test(path)) {
    return {
      phase_tag: 'B-NEW-43',
      context: `Utility (${t} error${t === 1 ? '' : 's'}). Current/operational. Pick off in a future B-NEW-43 chunk.`,
    };
  }

  // Client UI — mostly Phase 16 (UI overhauls happen later)
  if (/^client\/src\//.test(path)) {
    return {
      phase_tag: 'Phase 16',
      context: `Frontend UI (${t} error${t === 1 ? '' : 's'}). UI rewrites/cleanups are Phase 16 territory. Per-file Phase-16 audit may reclassify as B-NEW-43 if confidently current.`,
    };
  }

  // DB / migrations / drizzle — current infrastructure
  if (/^server\/(db|migrations|drizzle)/.test(path)) {
    return {
      phase_tag: 'B-NEW-43',
      context: `DB infrastructure (${t} error${t === 1 ? '' : 's'}). Current. Pick off in a future B-NEW-43 chunk.`,
    };
  }

  // Type definitions
  if (/^(server\/types|shared)\//.test(path)) {
    return {
      phase_tag: 'B-NEW-43',
      context: `Type definitions (${t} error${t === 1 ? '' : 's'}). Current. Likely simple type fixes.`,
    };
  }

  // Default: TBD (no confabulating buckets — honest placeholder)
  return {
    phase_tag: 'TBD — needs investigation',
    context: `Uncategorized file (${t} error${t === 1 ? '' : 's'}). Chunk 7+ audit or Phase 19 walkthrough determines disposition.`,
  };
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
let overrideCount = 0;
let patternCount = 0;
let tbdCount = 0;

for (const f of baseline.files) {
  if (overrides[f.path]) {
    f.phase_tag = overrides[f.path].phase_tag;
    f.context = overrides[f.path].context;
    overrideCount++;
  } else {
    const { phase_tag, context } = classifyByPath(f.path, f.errors);
    f.phase_tag = phase_tag;
    f.context = context;
    if (phase_tag.startsWith('TBD')) tbdCount++;
    else patternCount++;
  }
}

// Update audit metadata (preserves frozen_* — the chunk-5 freeze provenance).
baseline.last_audited_at_iso = new Date().toISOString();
baseline.last_audited_by_batch = 'B-NEW-43 (chunk 6 audit — phase_tag + context populated; Phase-19 intake seed)';

writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');

console.log(
  `[classify] Done. ${overrideCount} overrides, ${patternCount} pattern-classified, ${tbdCount} TBD.`,
);

const byTag = {};
let totalErrorsByTag = {};
for (const f of baseline.files) {
  byTag[f.phase_tag] = (byTag[f.phase_tag] || 0) + 1;
  totalErrorsByTag[f.phase_tag] = (totalErrorsByTag[f.phase_tag] || 0) + total(f.errors);
}
console.log('[classify] Files by phase_tag (file_count / error_count):');
for (const [tag, count] of Object.entries(byTag).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count.toString().padStart(3)} files / ${totalErrorsByTag[tag].toString().padStart(3)} errors  ${tag}`);
}
