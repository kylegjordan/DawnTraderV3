/**
 * Filters V2 Schema
 * 
 * Directive 11.8B-D1: All filters are user-controlled and manual-only.
 * No AI or automated system may adjust filters prior to Phase 11.8C.
 */

import { z } from "zod";

export interface FilterParamV2 {
  name: string;
  value: number | string | boolean | string[];
  displayName: string;
  category: string;
  description?: string;
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

export const FILTER_METADATA: Record<string, Omit<FilterParamV2, "value">> = {
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

export const updateFiltersV2Schema = z.object({
  mode: z.enum(["paper", "live"]),
  filters: z.record(z.object({
    value: z.union([z.number(), z.string(), z.boolean(), z.array(z.string())]).optional()
  }))
});

export type UpdateFiltersV2Input = z.infer<typeof updateFiltersV2Schema>;

export function toFiltersV2(dbRow: any): FiltersV2 {
  const createParam = (name: string, value: any): FilterParamV2 => ({
    name,
    value,
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
