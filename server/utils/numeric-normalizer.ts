/**
 * Numeric Normalization Utility
 * 
 * Phase 27.F.13.H - Architecture Realignment
 * 
 * Converts all PostgreSQL numeric/decimal/bigint fields from strings to proper
 * JavaScript numbers before JSON serialization. This fixes .toFixed() type errors
 * in the frontend.
 */

/**
 * Recursively converts all string numeric values to numbers in an object or array
 * 
 * Handles:
 * - PostgreSQL decimal types (returned as strings)
 * - PostgreSQL numeric types (returned as strings)
 * - PostgreSQL bigint types (returned as strings)
 * 
 * Preserves:
 * - null and undefined values
 * - boolean values
 * - Date objects
 * - Non-numeric strings (IDs, symbols, etc.)
 */
export function normalizeNumericFields<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => normalizeNumericFields(item)) as T;
  }

  if (data instanceof Date) {
    return data;
  }

  if (typeof data === 'object') {
    const normalized: any = {};
    for (const [key, value] of Object.entries(data)) {
      normalized[key] = normalizeNumericFields(value);
    }
    return normalized;
  }

  // Convert string to number if it's a valid numeric string
  if (typeof data === 'string') {
    // Skip if it's an empty string or non-numeric
    if (data === '' || data.length > 50) {
      return data;
    }

    // Check if it's a valid number string (including decimals and negatives)
    const numValue = Number(data);
    if (!isNaN(numValue) && /^-?\d+(\.\d+)?$/.test(data)) {
      return numValue as T;
    }
  }

  return data;
}

/**
 * Specific normalizer for common API response types
 */
export interface NumericFieldMap {
  [key: string]: boolean | NumericFieldMap;
}

/**
 * Known numeric fields in Dawn Trader database
 */
const NUMERIC_FIELDS: NumericFieldMap = {
  // Price fields
  entryPrice: true,
  stopPrice: true,
  targetPrice: true,
  currentPrice: true,
  exitPrice: true,
  
  // Volume fields
  volume24h: true,
  volume: true,
  volumeUsd: true,
  minVolume: true,
  maxVolume: true,
  minVolumeUsd: true,
  maxVolumeUsd: true,
  
  // Range and volatility
  dailyRange: true,
  minDailyRange: true,
  maxDailyRange: true,
  volatility: true,
  volatilityMin: true,
  volatilityMax: true,
  
  // Technical indicators
  vwap: true,
  sma: true,
  rsi: true,
  confidence: true,
  
  // Risk and PnL
  pnl: true,
  pnlPercent: true,
  unrealizedPnl: true,
  realizedPnl: true,
  totalFees: true,
  maxDailyLoss: true,
  maxDrawdown: true,
  maxPositionSize: true,
  riskPerTrade: true,
  maxRequiredCapital: true,
  maxRiskPerTradeLimit: true,
  
  // Position sizing
  quantity: true,
  positionSize: true,
  maxOpenPositions: true,
  
  // Spread and market cap
  maxBidAskSpread: true,
  maxSpread: true,
  minPrice: true,
  maxPrice: true,
  minMarketCap: true,
  maxMarketCap: true,
  marketCap: true,
  
  // Balances
  balance: true,
  portfolioBalance: true,
  initialBalance: true,
  availableBalance: true,
  
  // Fees and slippage
  entryFee: true,
  exitFee: true,
  entrySlippage: true,
  exitSlippage: true,
  
  // Liquidity
  minLiquidity: true,
  liquidity: true,
};

/**
 * Normalize specific numeric fields in an object
 * More targeted than the recursive normalizer
 */
export function normalizeKnownNumericFields<T extends object>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => normalizeKnownNumericFields(item)) as T;
  }

  const normalized: any = { ...data };

  for (const [key, value] of Object.entries(normalized)) {
    if (NUMERIC_FIELDS[key] && typeof value === 'string') {
      const numValue = Number(value);
      if (!isNaN(numValue)) {
        normalized[key] = numValue;
      }
    } else if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
      normalized[key] = normalizeKnownNumericFields(value);
    }
  }

  return normalized;
}

/**
 * Express middleware to automatically normalize numeric fields in responses
 */
export function numericNormalizationMiddleware(req: any, res: any, next: any) {
  const originalJson = res.json.bind(res);

  res.json = function (data: any) {
    const normalized = normalizeNumericFields(data);
    return originalJson(normalized);
  };

  next();
}
