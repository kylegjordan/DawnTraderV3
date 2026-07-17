/**
 * P19-B8.9 (OBJ-5) — the venue-quiet Current-price treatment, in ONE portable place.
 *
 * PURELY PRESENTATIONAL: the server decides whether a price is venue-quiet (the single
 * shared notion — non-fresh-venue read: a non-Kraken-venue source OR older than the
 * quiet threshold) and ships a `priceVenueQuiet` boolean on both the Open Trades and
 * Ready-to-Buy payloads. This component only RENDERS that state; it never re-decides
 * quiet client-side (Langston Step-4 item 2 — one notion of quiet, no per-surface drift).
 *
 * When quiet, it shows the last known value muted with an explicit "venue quiet" badge —
 * never a bare number impersonating a live mark, never a third-party number (the fetchers
 * are retired in the same batch).
 *
 * Standalone by design: NEW Claude's B8.7 Step-9 shared-table rewire imports this and
 * carries the behavior over (carry obligation on channel record, 2026-07-17), so the
 * treatment survives the deletion of the old per-tab markup as an import move.
 */
import { cn } from "@/lib/utils";

export function VenueQuietPrice({
  price,
  ageMs,
  decimals = 6,
  className,
  testId,
}: {
  price: number | null | undefined;
  ageMs?: number | null;
  decimals?: number;
  className?: string;
  testId?: string;
}) {
  const ageSec = ageMs != null ? Math.round(ageMs / 1000) : null;
  return (
    <div
      className={cn("font-mono text-sm font-medium text-amber-600 dark:text-amber-500", className)}
      title={`Venue quiet — no fresh Kraken price. Showing last known value${ageSec != null ? ` from ${ageSec}s ago` : ''}.`}
      data-testid={testId ?? "cell-current-venue-quiet"}
    >
      {price != null && !isNaN(price) ? `$${price.toFixed(decimals)}` : '—'}
      <div className="text-[10px] font-sans text-muted-foreground leading-tight">venue quiet</div>
    </div>
  );
}
