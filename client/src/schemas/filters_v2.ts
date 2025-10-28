/**
 * Phase 3: Filters V2 Schema with Manual Override Support
 * 
 * This schema extends existing screener filters with control metadata
 * to support Lottie-managed vs Manual override modes.
 * 
 * NO ALGORITHMIC CHANGES - This is purely a metadata upgrade for control visibility.
 */

import { z } from "zod";

// Filter parameter with control metadata
export interface FilterParamV2 {
  name: string;
  value: number | string | boolean | string[];
  managedByLottie: boolean;      // true = LATTI controls this filter
  manualOverrideEnabled: boolean; // true = user has unlocked for manual editing
  displayName: string;            // Human-readable name for UI
  category: string;               // Group category (e.g., "volume", "price", "risk", "universe")
  description?: string;           // Tooltip description
}

// Filters V2 structure (all screener filters with metadata)
export interface FiltersV2 {
  mode: "paper" | "live";
  
  // Volume & Liquidity
  minVolume: FilterParamV2;
  minLiquidity: FilterParamV2;
  
  // Price Range
  minPrice: FilterParamV2;
  maxPrice: FilterParamV2;
  
  // Risk & Volatility
  maxBidAskSpread: FilterParamV2;
  volatilityMin: FilterParamV2;
  volatilityMax: FilterParamV2;
  
  // Market Filters
  minMarketCap: FilterParamV2;
  excludeStablecoins: FilterParamV2;
  allowRegulatedOnly: FilterParamV2;
  
  // RSI Range
  rsiMin: FilterParamV2;
  rsiMax: FilterParamV2;
  
  // Universe & Signal Controls (Phase 27.F.14)
  universeSize: FilterParamV2;
  quoteCurrencies: FilterParamV2;
  activeTimeframes: FilterParamV2;
  confidenceThreshold: FilterParamV2;
  
  // Metadata
  lastUpdated: string;
}

// Filter categories for UI grouping
export const FILTER_CATEGORIES = {
  VOLUME: "Volume & Liquidity",
  PRICE: "Price Range",
  RISK: "Risk & Volatility",
  MARKET: "Market Filters",
  TECHNICAL: "Technical Indicators",
  UNIVERSE: "Universe & Signal Controls"
} as const;

// Filter metadata definitions (used by UI to render controls)
export const FILTER_METADATA: Record<string, Omit<FilterParamV2, "value" | "managedByLottie" | "manualOverrideEnabled">> = {
  minVolume: {
    name: "minVolume",
    displayName: "Min Volume ($)",
    category: FILTER_CATEGORIES.VOLUME,
    description: "Minimum 24h trading volume in USD"
  },
  minLiquidity: {
    name: "minLiquidity",
    displayName: "Min Liquidity ($)",
    category: FILTER_CATEGORIES.VOLUME,
    description: "Minimum liquidity depth for entry/exit"
  },
  minPrice: {
    name: "minPrice",
    displayName: "Min Price ($)",
    category: FILTER_CATEGORIES.PRICE,
    description: "Minimum asset price in USD"
  },
  maxPrice: {
    name: "maxPrice",
    displayName: "Max Price ($)",
    category: FILTER_CATEGORIES.PRICE,
    description: "Maximum asset price in USD"
  },
  maxBidAskSpread: {
    name: "maxBidAskSpread",
    displayName: "Max Bid-Ask Spread (%)",
    category: FILTER_CATEGORIES.RISK,
    description: "Maximum allowed spread percentage"
  },
  volatilityMin: {
    name: "volatilityMin",
    displayName: "Min Volatility (%)",
    category: FILTER_CATEGORIES.RISK,
    description: "Minimum price volatility percentage"
  },
  volatilityMax: {
    name: "volatilityMax",
    displayName: "Max Volatility (%)",
    category: FILTER_CATEGORIES.RISK,
    description: "Maximum price volatility percentage"
  },
  minMarketCap: {
    name: "minMarketCap",
    displayName: "Min Market Cap ($)",
    category: FILTER_CATEGORIES.MARKET,
    description: "Minimum market capitalization"
  },
  excludeStablecoins: {
    name: "excludeStablecoins",
    displayName: "Exclude Stablecoins",
    category: FILTER_CATEGORIES.MARKET,
    description: "Filter out stablecoin pairs"
  },
  allowRegulatedOnly: {
    name: "allowRegulatedOnly",
    displayName: "Regulated Only",
    category: FILTER_CATEGORIES.MARKET,
    description: "Only include regulated assets"
  },
  rsiMin: {
    name: "rsiMin",
    displayName: "Min RSI",
    category: FILTER_CATEGORIES.TECHNICAL,
    description: "Minimum RSI indicator value"
  },
  rsiMax: {
    name: "rsiMax",
    displayName: "Max RSI",
    category: FILTER_CATEGORIES.TECHNICAL,
    description: "Maximum RSI indicator value"
  },
  universeSize: {
    name: "universeSize",
    displayName: "Market Universe Size",
    category: FILTER_CATEGORIES.UNIVERSE,
    description: "Number of top pairs to evaluate (25-150)"
  },
  quoteCurrencies: {
    name: "quoteCurrencies",
    displayName: "Quote Currencies",
    category: FILTER_CATEGORIES.UNIVERSE,
    description: "Allowed quote currencies (USD, EUR, USDT, etc.)"
  },
  activeTimeframes: {
    name: "activeTimeframes",
    displayName: "Active Timeframes",
    category: FILTER_CATEGORIES.UNIVERSE,
    description: "Trading timeframes to monitor (5m, 15m, 1h, 4h)"
  },
  confidenceThreshold: {
    name: "confidenceThreshold",
    displayName: "Confidence Threshold (%)",
    category: FILTER_CATEGORIES.UNIVERSE,
    description: "Minimum signal confidence percentage (40-90)"
  }
};

// Zod schema for filter updates via API
export const updateFiltersV2Schema = z.object({
  mode: z.enum(["paper", "live"]),
  filters: z.record(z.object({
    value: z.union([z.number(), z.string(), z.boolean(), z.array(z.string())]).optional(),
    managedByLottie: z.boolean().optional(),
    manualOverrideEnabled: z.boolean().optional()
  }))
});

export type UpdateFiltersV2Input = z.infer<typeof updateFiltersV2Schema>;

// Helper to convert screener_filters database row to FiltersV2 format
export function toFiltersV2(dbRow: any): FiltersV2 {
  const createParam = (name: string, value: any): FilterParamV2 => ({
    name,
    value,
    managedByLottie: true, // Default: LATTI manages
    manualOverrideEnabled: false, // Default: locked
    displayName: FILTER_METADATA[name]?.displayName || name,
    category: FILTER_METADATA[name]?.category || "Other",
    description: FILTER_METADATA[name]?.description
  });

  return {
    mode: dbRow.mode,
    minVolume: createParam("minVolume", parseFloat(dbRow.min_volume)),
    minLiquidity: createParam("minLiquidity", parseFloat(dbRow.min_liquidity)),
    minPrice: createParam("minPrice", parseFloat(dbRow.min_price)),
    maxPrice: createParam("maxPrice", parseFloat(dbRow.max_price)),
    maxBidAskSpread: createParam("maxBidAskSpread", parseFloat(dbRow.max_bid_ask_spread)),
    volatilityMin: createParam("volatilityMin", parseFloat(dbRow.volatility_min)),
    volatilityMax: createParam("volatilityMax", parseFloat(dbRow.volatility_max)),
    minMarketCap: createParam("minMarketCap", parseFloat(dbRow.min_market_cap)),
    excludeStablecoins: createParam("excludeStablecoins", dbRow.exclude_stablecoins),
    allowRegulatedOnly: createParam("allowRegulatedOnly", dbRow.allow_regulated_only),
    rsiMin: createParam("rsiMin", dbRow.rsi_min),
    rsiMax: createParam("rsiMax", dbRow.rsi_max),
    universeSize: createParam("universeSize", dbRow.universe_size),
    quoteCurrencies: createParam("quoteCurrencies", dbRow.quote_currencies),
    activeTimeframes: createParam("activeTimeframes", dbRow.active_timeframes),
    confidenceThreshold: createParam("confidenceThreshold", dbRow.confidence_threshold),
    lastUpdated: dbRow.updated_at
  };
}
