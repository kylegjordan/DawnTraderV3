/**
 * P19-B8.3 (OBJ-7) — disposition-aware aggregate columns for the RR/reachability
 * gate table. Pure + framework-free so the column contract is directly
 * unit-testable (Langston Step-4 condition: the "Rejected" column must be
 * structurally unreachable in any VTS ('tag') context).
 *
 * Semantics (reorg-B3.3 / strategy-helpers.ts applyGlobalGuards):
 *  - enforce (Paper/Live): EVERY guard fail rejects → one honest total,
 *    Rejected = Evals − Passed ≡ the four reason columns summed (the function
 *    is pass XOR exactly-one-of-4, sequential early returns — the identity is
 *    asserted by test against the real applyGlobalGuards).
 *  - tag (VTS learning path): quality flags (RR Too Low, Target Unreachable)
 *    do NOT reject — the signal is TAGGED and still simulated (the un-strangle);
 *    only data-validity failures (Bad Stop, No ATR) drop. So the VTS table
 *    shows Dropped vs Tagged, never "Rejected".
 */

export type GateDisposition = 'enforce' | 'tag';

export interface GateCounts {
  evals: number;
  passes: number;
  rrDrops: number;
  reachDrops: number;
  stopDrops: number;
  atrDrops: number;
}

export interface GateAggregateColumn {
  key: 'rejected' | 'dropped' | 'tagged';
  label: string;
  title: string;
  /** 'reject' cells use the rejection heat color; 'info' cells render blue. */
  tone: 'reject' | 'info';
  value: (s: GateCounts) => number;
}

export function gateAggregateColumns(disposition: GateDisposition): GateAggregateColumn[] {
  if (disposition === 'enforce') {
    return [{
      key: 'rejected',
      label: 'Rejected',
      title: 'Total rejected = Evals − Passed = the four reason columns summed',
      tone: 'reject',
      value: (s) => s.evals - s.passes,
    }];
  }
  return [
    {
      key: 'dropped',
      label: 'Dropped',
      title: 'Data-validity failures (Bad Stop + No ATR) — dropped on every path',
      tone: 'reject',
      value: (s) => s.stopDrops + s.atrDrops,
    },
    {
      key: 'tagged',
      label: 'Tagged',
      title: 'Quality flags (RR Too Low + Target Unreachable) — NOT rejected on the VTS learning path: tagged and still simulated',
      tone: 'info',
      value: (s) => s.rrDrops + s.reachDrops,
    },
  ];
}
