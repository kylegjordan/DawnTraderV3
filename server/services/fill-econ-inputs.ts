/**
 * `B-ENTRY-GATE` (`#1224`) — the ONE resolver of the economic test's inputs, shared by the open (increment A, P4, the
 * engine's `_resolveFillEconInputs`) and the queue refresh (increment B, P6). Moved here from the engine so the two
 * sites cannot drift: the same settings rows, the same keys, the same cost read the birth decision uses.
 *
 * Every read is FAIL-HARD (`getCachedNumberRequired`): a missing row throws, and each caller turns that into its own
 * counted refusal or logged non-decision — never a default.
 */
import { getFrictionForAssetClass, getCachedCostMetrics } from '../core/math/cost-model.js';
import { entryUrgencyClassForFamily } from '../core/math/maker-taker-decision.js';
import type { FillEconInputs } from '../core/trading/fill-economics.js';
import { STRATEGY_FAMILY_MAP, normalizeStrategy } from '../config/canonical-regime-strategy-map.js';
import { getCachedNumberRequired } from './module-constants-service.js';
import { resolveMakerTakerHaircut } from './maker-taker-config.js';
import type { AssetClass } from '../../shared/asset-classes.js';

/** What a signal must carry: a promoted signal (engine) or a queue row (refresh). Prices may arrive as strings. */
export interface FillEconSignal {
  symbol: string;
  strategy: string;
  stopPrice: number | string;
  targetPrice: number | string | null | undefined;
  diAtQueue?: number | string | null;
  dbsScoreAtQueue?: number | string | null;
  sourcePool?: string;
  metadata?: unknown;
}

export function resolveFillEconInputs(signal: FillEconSignal, assetClass: AssetClass): FillEconInputs {
  const fr = getFrictionForAssetClass(assetClass);
  const gk = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };
  const ck = { exchange: '*', assetClass, strategy: '*', regime: '*' };
  const di = signal.diAtQueue != null && Number.isFinite(Number(signal.diAtQueue)) ? Number(signal.diAtQueue) : undefined;
  const dbs = signal.dbsScoreAtQueue != null && Number.isFinite(Number(signal.dbsScoreAtQueue)) ? Number(signal.dbsScoreAtQueue) : undefined;
  const base = getCachedNumberRequired('scoring_base', 'flat_pwin_base', ck);
  return {
    stopPrice: Number(signal.stopPrice),
    targetPrice: signal.targetPrice == null ? Number.NaN : Number(signal.targetPrice),
    costs: getCachedCostMetrics(signal.symbol, assetClass),
    feeRateMaker: fr.feeRateMaker, feeRateTaker: fr.feeRateTaker,
    DI: di, sourcePool: signal.sourcePool ?? (signal.metadata as any)?.sourcePool, dbsScore: dbs,
    minPWin: getCachedNumberRequired('expectancy_kernel', 'pwin_floor', gk),
    maxPWin: getCachedNumberRequired('expectancy_kernel', 'pwin_ceiling', gk),
    diPWinFactor: getCachedNumberRequired('directional_integrity', 'di_pwin_factor', gk),
    signalStrength: base,
    urgencyClass: entryUrgencyClassForFamily(STRATEGY_FAMILY_MAP[normalizeStrategy(signal.strategy)]),
    haircut: resolveMakerTakerHaircut(assetClass),
    measuredBasePWin: base,
  };
}
