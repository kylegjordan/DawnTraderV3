/**
 * Phase 3: Filters V2 Schema with Manual Override Support
 * 
 * Directive 11.8B-B1: Filters are now explicitly manual/system-set.
 * managedByLottie field is FROZEN - preserved for future cleanup but no longer drives UI.
 * 
 * NO ALGORITHMIC CHANGES - This is purely a metadata upgrade for control visibility.
 */

import { z } from "zod";

// Filter parameter with control metadata
export interface FilterParamV2 {
  name: string;
  value: number | string | boolean | string[];
  managedByLottie: boolean;      // FROZEN per 11.8B-B - preserved for future cleanup
  manualOverrideEnabled: boolean; // true = user has unlocked for manual editing
  displayName: string;            // Human-readable name for UI
  category: string;               // Group category (e.g., "volume", "price", "risk", "universe")
  description?: string;           // Tooltip description
}

// Filters V2 structure (active screener filters with metadata)
// Directive 10.9F: Deprecated filters removed (volatility, RSI, quoteCurrencies)
export interface FiltersV2 {
  mode: "paper" | "live";
  
  // Volume & Liquidity
  minVolume: FilterParamV2;
  minLiquidity: FilterParamV2;
  
  // Price Range
  minPrice: FilterParamV2;
  maxPrice: FilterParamV2;
  
  // Execution Quality (10.9F: renamed from Risk & Volatility)
  maxBidAskSpread: FilterParamV2;
  
  // Market Filters
  minMarketCap: FilterParamV2;
  excludeStablecoins: FilterParamV2;
  allowRegulatedOnly: FilterParamV2;
  
  // Universe & Signal Controls
  universeSize: FilterParamV2;
  activeTimeframes: FilterParamV2;
  confidenceThreshold: FilterParamV2;
  
  // Metadata
  lastUpdated: string;
}

// Filter categories for UI grouping
// Directive 10.9F: RISK renamed to EXECUTION_QUALITY, TECHNICAL deprecated
export const FILTER_CATEGORIES = {
  VOLUME: "Volume & Liquidity",
  PRICE: "Price Range",
  EXECUTION_QUALITY: "Execution Quality",  // 10.9F: Renamed from "Risk & Volatility"
  MARKET: "Market Filters",
  UNIVERSE: "Universe & Signal Controls",
  DATA_QUALITY: "Data Quality"
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
    category: FILTER_CATEGORIES.EXECUTION_QUALITY, // 10.9F: Renamed from RISK
    description: "Controls execution quality by filtering pairs with wide bid-ask spreads"
  },
  // Directive 10.9F: volatilityMin/volatilityMax DEPRECATED - removed from active filters
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
  // Directive 10.9E: rsiMin/rsiMax DEPRECATED - removed from active filters
  universeSize: {
    name: "universeSize",
    displayName: "Market Universe Size",
    category: FILTER_CATEGORIES.UNIVERSE,
    description: "Number of top pairs to evaluate (25-150)"
  },
  // Directive 10.9F: quoteCurrencies DEPRECATED - all quote currencies now accepted
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
// Directive 11.8B-B1: managedByLottie field is FROZEN - no longer drives UI authority
export function toFiltersV2(dbRow: any): FiltersV2 {
  const createParam = (name: string, value: any): FilterParamV2 => ({
    name,
    value,
    managedByLottie: false, // FROZEN per 11.8B-B - UI shows "Configured" regardless
    manualOverrideEnabled: true, // All filters are manually editable
    displayName: FILTER_METADATA[name]?.displayName || name,
    category: FILTER_METADATA[name]?.category || "Other",
    description: FILTER_METADATA[name]?.description
  });

  // Directive 10.9F: Deprecated filters removed from output
  return {
    mode: dbRow.mode,
    minVolume: createParam("minVolume", parseFloat(dbRow.min_volume)),
    minLiquidity: createParam("minLiquidity", parseFloat(dbRow.min_liquidity)),
    minPrice: createParam("minPrice", parseFloat(dbRow.min_price)),
    maxPrice: createParam("maxPrice", parseFloat(dbRow.max_price)),
    maxBidAskSpread: createParam("maxBidAskSpread", parseFloat(dbRow.max_bid_ask_spread)),
    minMarketCap: createParam("minMarketCap", parseFloat(dbRow.min_market_cap)),
    excludeStablecoins: createParam("excludeStablecoins", dbRow.exclude_stablecoins),
    allowRegulatedOnly: createParam("allowRegulatedOnly", dbRow.allow_regulated_only),
    universeSize: createParam("universeSize", dbRow.universe_size),
    activeTimeframes: createParam("activeTimeframes", dbRow.active_timeframes),
    confidenceThreshold: createParam("confidenceThreshold", dbRow.confidence_threshold),
    lastUpdated: dbRow.updated_at
  };
}
