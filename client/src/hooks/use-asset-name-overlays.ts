/**
 * P19-B8.7 Step-9 — the asset-name overlay loader as a SHARED hook (root-cause fix
 * for the broken stacked names Kyle reported 2026-07-17).
 *
 * History: B-NAMES (2026-06-15) fetches the server-resolved name overlays (the
 * xStock universe names + the crypto backfill from the 6-hourly resolver sweep)
 * and feeds getAssetName()'s client-side overlay maps. That loading lived ONLY in
 * machine-learning.tsx — so when P19-B8.1 moved the VTS tables onto the Virtual
 * Simulations / mode pages, every table rendered there without the overlays ever
 * being fetched: curated-map names still resolved (Lido DAO, Filecoin, …) while
 * ALL xStock names and resolver-backfilled crypto names went blank. The fix is
 * structural, not a re-fetch patch: every component that renders getAssetName
 * mounts this hook and owns its name data (the B8.1 self-fetching doctrine);
 * react-query dedupes by key, so N mounts still make ONE request per interval.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { setXstockNameOverlay, setCryptoNameOverlay } from "@shared/asset-names";

export function useAssetNameOverlays(): void {
  useQuery<{ ok: boolean; count: number; names: Record<string, string> }>({
    queryKey: ['/api/xstocks/asset-names'],
    queryFn: async () => {
      const data = await apiFetch('/api/xstocks/asset-names');
      if (data && data.names) setXstockNameOverlay(data.names);
      return data;
    },
    refetchInterval: 60 * 60 * 1000,
    staleTime: 30 * 60 * 1000,
  });

  useQuery<{ ok: boolean; count: number; names: Record<string, string> }>({
    queryKey: ['/api/crypto/asset-names'],
    queryFn: async () => {
      const data = await apiFetch('/api/crypto/asset-names');
      if (data && data.names) setCryptoNameOverlay(data.names);
      return data;
    },
    refetchInterval: 60 * 60 * 1000,
    staleTime: 30 * 60 * 1000,
  });
}
