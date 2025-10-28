import { z } from 'zod';

export const TradingMode = z.enum(['live', 'paper']);
export type TradingMode = z.infer<typeof TradingMode>;

export const GuardrailsSchema = z.object({
  portfolioRiskPerTradePct: z.coerce.number().min(0.10).max(5.00),
  dailyLossKillSwitchPct: z.coerce.number().min(1.00).max(20.00),
  symbolCooldownMinutes: z.coerce.number().int().min(1).max(90),
  maxOpenPositions: z.coerce.number().int().min(1).max(20)
});

export type Guardrails = z.infer<typeof GuardrailsSchema>;

export const FiltersSchema = z.object({
  minVolume: z.coerce.number().min(0),
  minLiquidity: z.coerce.number().min(0),
  minPrice: z.coerce.number().min(0),
  maxPrice: z.coerce.number().min(0),
  minMarketCap: z.coerce.number().min(0),
  maxBidAskSpread: z.coerce.number().min(0).max(100),
  rsiMin: z.coerce.number().int().min(0).max(100),
  rsiMax: z.coerce.number().int().min(0).max(100),
  volatilityMin: z.coerce.number().min(0).max(100),
  volatilityMax: z.coerce.number().min(0).max(100),
  excludeStablecoins: z.boolean(),
  allowRegulatedOnly: z.boolean(),
  universeSize: z.coerce.number().int().min(25).max(150),
  quoteCurrencies: z.array(z.string()),
  activeTimeframes: z.array(z.string()),
  confidenceThreshold: z.coerce.number().int().min(40).max(90)
});

export type Filters = z.infer<typeof FiltersSchema>;

export const GoalsSchema = z.object({
  targetDailyAvgEarningPct: z.coerce.number().min(0).max(100),
  tradesPerDayEst: z.coerce.number().min(0).max(1000),
  activePreset: z.enum(['conservative', 'baseline', 'optimistic', 'maximum', 'custom'])
});

export type Goals = z.infer<typeof GoalsSchema>;

export const ConfigSnapshotSchema = z.object({
  mode: TradingMode,
  timestamp: z.string(),
  guardrails: GuardrailsSchema,
  filters: FiltersSchema,
  goals: GoalsSchema,
  portfolioValue: z.number(),
  provenance: z.object({
    guardrails_source: z.literal('guardrails_v2'),
    filters_source: z.literal('screener_filters'),
    goals_source: z.literal('goals_presets'),
    portfolio_source: z.literal('portfolio_balances')
  })
});

export type ConfigSnapshot = z.infer<typeof ConfigSnapshotSchema>;

const LEGACY_GUARDRAIL_KEYS = [
  'maxDailyLoss',
  'maxDrawdown',
  'maxPositionSize',
  'riskPerTrade',
  'cooldownMinutes',
  'priceDeltaTrigger'
] as const;

const LEGACY_FILTER_KEYS = [
  'avgVolumeRatio',
  'atrThreshold',
  'earningsBlackout'
] as const;

export const LEGACY_KEYS = [...LEGACY_GUARDRAIL_KEYS, ...LEGACY_FILTER_KEYS];

export class LegacyFieldError extends Error {
  constructor(
    public readonly fieldName: string,
    public readonly replacement: string | null
  ) {
    super(
      replacement
        ? `Legacy field "${fieldName}" is deprecated. Use "${replacement}" instead.`
        : `Legacy field "${fieldName}" is deprecated and has no replacement.`
    );
    this.name = 'LegacyFieldError';
  }
}

export function validateNoLegacyKeys(data: Record<string, any>): void {
  const foundLegacy = Object.keys(data).filter(key => 
    LEGACY_KEYS.includes(key as any)
  );

  if (foundLegacy.length > 0) {
    const legacyMap: Record<string, string | null> = {
      maxDailyLoss: 'dailyLossKillSwitchPct',
      maxDrawdown: 'dailyLossKillSwitchPct',
      maxPositionSize: 'maxOpenPositions',
      riskPerTrade: 'portfolioRiskPerTradePct',
      cooldownMinutes: 'symbolCooldownMinutes',
      priceDeltaTrigger: null,
      avgVolumeRatio: 'minVolume',
      atrThreshold: 'volatilityMin/volatilityMax',
      earningsBlackout: null
    };

    throw new LegacyFieldError(
      foundLegacy[0],
      legacyMap[foundLegacy[0]]
    );
  }
}

export function validateGuardrails(data: unknown): Guardrails {
  validateNoLegacyKeys(data as Record<string, any>);
  return GuardrailsSchema.parse(data);
}

export function validateFilters(data: unknown): Filters {
  validateNoLegacyKeys(data as Record<string, any>);
  return FiltersSchema.parse(data);
}

export function validateGoals(data: unknown): Goals {
  return GoalsSchema.parse(data);
}

export function getPortfolioRiskPct(guardrails: Guardrails): number {
  return guardrails.portfolioRiskPerTradePct;
}

export function getKillSwitchPct(guardrails: Guardrails): number {
  return guardrails.dailyLossKillSwitchPct;
}

export function getSymbolCooldown(guardrails: Guardrails): number {
  return guardrails.symbolCooldownMinutes;
}

export function getMaxPositions(guardrails: Guardrails): number {
  return guardrails.maxOpenPositions;
}

export function getMinVolume(filters: Filters): number {
  return filters.minVolume;
}

export function getConfidenceThreshold(filters: Filters): number {
  return filters.confidenceThreshold;
}

export function getTargetDailyReturn(goals: Goals): number {
  return goals.targetDailyAvgEarningPct;
}
