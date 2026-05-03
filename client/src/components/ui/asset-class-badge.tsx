/**
 * B69 — Asset Class Badge component
 *
 * Renders a compact colored badge for the asset class of a trade/signal/position.
 * Imports display metadata from the shared registry so display names + colors
 * are consistent server-side and client-side from one source of truth.
 */

import { Badge } from "@/components/ui/badge";
import { ASSET_CLASS_REGISTRY, type AssetClass } from "../../../shared/asset-classes";

interface AssetClassBadgeProps {
  assetClass: string | null | undefined;
  className?: string;
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
