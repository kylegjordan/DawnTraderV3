/**
 * B-FILTER-DIAG-STANDARDIZE — THE LANE CONTRACT for the six Filter-Diagnostics tabs.
 *
 * WHY THIS TYPE EXISTS (Langston Step-2 condition (a)(i)): Kyle's requirement is that all six tabs
 * (VTS / Paper / Live × crypto / xStock) render the SAME fields and the SAME display, with Paper and
 * Live differing ONLY by added SQE and RTB sections. The shared panel therefore renders ONE structure
 * from ONE shape, and each branch — the VTS ('tag') lane and the active ('enforce') lane — assembles
 * that shape from its own source. **The compiler enforces it. "Untouched by construction" is only
 * structural if the type system says so, not if a convention says so.**
 *
 * ⛔ THE SENTINEL RULE (Langston Step-2 condition (a)(ii); the reason every optional field below is
 * `T | null` and NOT `T | undefined` with a numeric default):
 *   **ABSENT INSTRUMENTATION TRAVELS AS `null` AND RENDERS AN HONEST STATE. NEVER `?? 0`.**
 * A same-shape object is precisely the structure that invites zero-filling a missing field, and an
 * absent value wearing a plausible number's clothes is the #546 absent-as-valid class.
 * ★ THIS FILE'S OWN PRECEDENT, from the code it replaces (`vts-shared.tsx` `tradesOpened24h` comment):
 * the panel's Trades-Opened rows once read keys "the endpoint never carried — so they rendered the
 * `?? 0` fallback FOREVER." That is this rule's origin, in this very component. Do not re-introduce it.
 *
 * NULL MEANS "NOT INSTRUMENTED ON THIS LANE" — a statement about the INSTRUMENT.
 * An empty object/zero count means "instrumented, and it measured nothing" — a statement about the WORLD.
 * The renderer MUST distinguish them; conflating them is what made the previous build unreadable.
 */

/** Which pipeline produced these numbers. `source`, never `mode`, is the lane discriminator —
 *  both pipelines stamp mode='paper' since 2026-07-14. */
export type DiagLane = 'vts' | 'active';

/** The scan-stage population label (Langston Step-2, rider R2 — LOAD-BEARING, not cosmetic).
 *  `getLastScanDiagnostics()` takes no mode argument: it holds the last scan of WHATEVER MODE RAN,
 *  so with paper active the LIVE tab's shared tables show PAPER's scan. The header must say so.
 *  And because the same labels will sit over populations three orders of magnitude apart
 *  (VTS Net-EV 4 vs active 8,529), this is what stops the standardisation being a lookalike. */
export interface DiagPopulation {
  /** The mode whose scan these shared numbers actually came from (may differ from the tab's mode). */
  scanMode: string | null;
  /** True when the tab's own mode differs from `scanMode` — the renderer must surface this. */
  scanModeDiffersFromTab: boolean;
  /** Free-text caveat rendered under the section header, e.g. the 24h aggregate straddling
   *  passive↔active transitions (two filter populations in one aggregate). Null = no caveat. */
  aggregateCaveat: string | null;
}

/** Post-Signal Rejections — the table carrying **"Net EV Below Floor"**.
 *  VTS keys its reason `Net_EV_Negative`; the active lane's equivalent comes from
 *  `signal_eval_archive` gate reasons. **Both render under the identical display label**
 *  (Langston ratified: "same fields, same display is satisfied at the label or not at all"). */
export interface DiagSignalRejections {
  total: number;
  /** Canonical gate id → count. Ids come from the SHARED classifier so UI and engine cannot drift. */
  byReason: Record<string, number>;
  byRegime: Record<string, number> | null;
}

/** Per-strategy evaluation outcomes (the "By Strategy" table). */
export interface DiagByStrategyRow {
  strategy: string;
  evaluated: number | null;
  trueNulls: number | null;
  signals: number | null;
  rejected: number | null;
  trades: number | null;
}

/** The lane object both branches produce. EVERY field that a lane may not instrument is
 *  `| null` — see the sentinel rule above. */
export interface FilterDiagnosticsLane {
  lane: DiagLane;
  /** The TAB's mode (what the user clicked), distinct from `population.scanMode`. */
  tabMode: 'vts' | 'paper' | 'live';
  assetClass: 'crypto_spot' | 'xstock_spot';
  population: DiagPopulation;

  /** Post-Signal Rejections. null = this lane does not instrument it. */
  signalRejections: DiagSignalRejections | null;
  /** By Strategy. null = not instrumented on this lane. */
  byStrategy: DiagByStrategyRow[] | null;
  /** Trades opened, 24h. null = not instrumented (NOT zero — see the `?? 0` precedent above). */
  tradesOpened24h: { total: number; quant: number | null; pattern: number | null } | null;

  /** Setup Nulls (A–F taxonomy). **null on the ACTIVE lane** — no active-path writer exists;
   *  #662 B-ACTIVE-NULL-TAXONOMY fills it. Renders the honest not-instrumented state. */
  setupNulls: Record<string, number> | null;
  /** Pre-Evaluation Skips. **null on the ACTIVE lane** — same reason, same batch. */
  preEvalSkips: Record<string, number> | null;
  /** Last-Cycle funnel. **null on the ACTIVE lane** — the S22 tracker is cumulative-only and a
   *  poll-window delta is NOT a scan cycle unless poll and scan are phase-locked (nothing
   *  guarantees that), so it is not synthesised. #662. */
  lastCycleFunnel: Record<string, unknown> | null;

  /** Why a null field is null, keyed by field name — rendered verbatim in the honest state so the
   *  operator reads a REASON, never a blank. e.g. setupNulls → "no active-path writer emits the
   *  null taxonomy yet (#662)". */
  notInstrumentedReasons: Record<string, string>;
}

/** The Paper/Live-ONLY additions. Kyle: "The only difference is that paper and live mode will have
 *  added sections for the SQE and the RTB." Absent on the VTS lane by construction (not by a flag). */
export interface FilterDiagnosticsActiveExtras {
  sqe: {
    evaluated: number;
    passed: number;
    /** canonical gate id → rejects, from the SHARED classifier (R3). */
    gateRejects: Record<string, number>;
    /** The refresh-phase slice — a SUBSET of gateRejects, never summed with it. */
    gateRejectsAtRefresh: Record<string, number> | null;
  } | null;
  rtb: {
    cyclesRun: number;
    refreshedAttempted: number;
    reconfirmed: number;
    rejectedInRefresh: number;
    droppedError: number;
    promoted: number;
  } | null;
}
