/**
 * B69 — Asset Class Badge component
 *
 * Renders a compact colored badge for the asset class of a trade/signal/position.
 * Imports display metadata from the shared registry so display names + colors
 * are consistent server-side and client-side from one source of truth.
 *
 * BATCH_80 (2026-05-13): exported `getAssetClassCategory()` derives the
 * underlying-asset category from a full asset class ID. Used in the
 * Open/Closed Simulated Trades tables to render a third line BETWEEN the
 * symbol and the full asset-class badge per Kyle directive 2026-05-13.
 *   crypto_spot / crypto_perp                 → 'crypto'
 *   xstock_spot / xstock_perp                 → 'xstock'
 *   equity_spot / equity_futures              → 'equity'
 *   commodity_futures                          → 'commodity'
 *   fx_spot                                    → 'fx'
 */

import { Badge } from "@/components/ui/badge";
import { ASSET_CLASS_REGISTRY, type AssetClass } from "@shared/asset-classes";

interface AssetClassBadgeProps {
  assetClass: string | null | undefined;
  className?: string;
}

/**
 * BATCH_80: derive the underlying-asset category from a full asset class ID.
 * Robust to future additions (commodity_*, fx_*, ...) because it just splits
 * on the first underscore and returns the leading segment.
 */
export function getAssetClassCategory(assetClass: string | null | undefined): string | null {
  if (!assetClass) return null;
  const parts = assetClass.split('_');
  return parts[0] || null;
}

export function AssetClassBadge({ assetClass, className }: AssetClassBadgeProps) {
  if (!assetClass) return null;

  const meta = ASSET_CLASS_REGISTRY[assetClass as AssetClass];
  if (!meta) {
    return (
      <Badge variant="outline" className={className}>
        {assetClass}
      </Badge>
    );
  }

  return (
    <Badge className={`${meta.badgeColor} text-[10px] px-1.5 py-0 font-medium ${className ?? ''}`}>
      {meta.displayName}
    </Badge>
  );
}
