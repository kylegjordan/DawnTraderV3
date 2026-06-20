/**
 * Directive 11.7C — Adaptive ROI Configuration (ROI BOUNDS RETIRED).
 *
 * P19 reorg-B2 (2026-06-20, Kyle directive + never-leave-legacy rule 18): the deprecated
 * hardcoded ROI bounds — `ROI_MIN` / `ROI_MAX` / `ROI_FLEX_MULTIPLIER`, `FRICTION_SAFETY_BUFFER`,
 * and `ADAPTIVE_THRESHOLDS_CONFIG` — were DELETED. They were DEAD: B72 (2026-05-05) migrated the
 * live ROI gate to `module_constants` (`expectancy_gates` / `roi_gating`), and these consts had
 * ZERO importers (verified). Leaving them risked the deprecated bounds being accidentally re-wired
 * (and reorg-B2's Piece B makes the bounds per-class in the DB). See `DELETED_COMPONENTS_LOG.md`.
 *
 * Only `DEFAULT_SLIPPAGE` remains — still imported by `expectancy.ts` — re-exported from the
 * canonical `exchange-defaults` source.
 */

// Batch 18J: canonical fee/slippage from the Directive 11.3B source (exchange-defaults.ts).
import { DEFAULT_SLIPPAGE as CANONICAL_SLIPPAGE } from './exchange-defaults';

export const DEFAULT_SLIPPAGE = CANONICAL_SLIPPAGE; // 0.05% (canonical source — exchange-defaults.ts)
