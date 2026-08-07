/**
 * P19-B8.4 Part-2 — the ACTIVE-path funnel diagnostics envelope (the renderer-facing contract).
 *
 * EXPLICIT, EXPORTED, VERSIONED shape that BOTH the server endpoint (`/api/active-engine/diagnostics/funnel`)
 * and the client FD panel produce/consume against (Langston Q2: a shared type, NOT an implicit copy — so a
 * shape change is a compile event on both sides, never silent drift). Pure types only (client-safe, no
 * server imports). It carries the ACTIVE lane's own stage rows — it deliberately does NOT force-fit the VTS
 * `/api/vts/filter-diagnostics` shape (the two lanes have different stages: VTS skips confidence+governance,
 * the active lane has the RTB double-count). The shared *structure* is the tri-state `{status}` container.
 */

export const ACTIVE_FUNNEL_SCHEMA = 'active-funnel/v3' as const;

export interface ActiveFunnelRtbRefresh {
  cyclesRun: number;
  refreshedAttempted: number;
  reconfirmed: number;
  rejectedInRefresh: number;
  promoted: number;
}

/** The honest SQE double-count (MUST-4): SQE-at-generation vs SQE-during-RTB-refresh — TWO labelled numbers,
 *  never summed. The client renders them as distinct rows. */
export interface ActiveFunnelSqeAttempts {
  atGeneration: number;
  atRefresh: number;
}

export interface ActiveFunnelClassData {
  /** Tri-state (MUST-2 dormant≠zero): `'dormant'` = the counters are WIRED but the active engine has not run
   *  for this (mode, assetClass) yet → the UI renders "awaiting activation", NEVER a bare 0. `'active'` = real
   *  accumulated counts. A 0 under `'active'` genuinely means "evaluated, none rejected" — a different claim. */
  status: 'dormant' | 'active';
  signalsGenerated: number;
  /** UPSTREAM strategy attrition (by strategy) — strategies the family filter excluded in evaluateSymbol
   *  BEFORE any signal was built, so NOT a subset of signalsGenerated. The client renders it as a
   *  pre-generation stage ABOVE the signal funnel, never as a preSqeRejects subset (else the pre-SQE stage
   *  could exceed the denominator and read as a broken funnel — Langston B8.4b). */
  strategyAttrition: Record<string, number>;
  preSqeRejects: Record<string, number>;
  preSqeRejectsByStrategy: Record<string, Record<string, number>>;
  /** POST-SQE, pre-RTB rejects (position_cap, reachability) — signals that passed the SQE but were dropped
   *  before the RTB queue. Kept distinct from preSqeRejects so the funnel order is honest. */
  postSqeRejects: Record<string, number>;
  sqeGateRejects: Record<string, number>;
  /** B-FILTER-DIAG-PAPER OBJ-3 (2026-08-07): the refresh-phase slice of sqeGateRejects —
   *  which gate a signal fell OUT of the RTB refresh cycle at. Subset of sqeGateRejects,
   *  never summed with it. OPTIONAL + ADDITIVE on the v3 shape: a pre-OBJ-3 server emits
   *  no field, the client renders the section only when present. ★ STEP-4 RULING (Langston,
   *  2026-08-07): STAYS v3, no bump. The stamp exists to catch shapes that can MISREAD or break
   *  compile; optional+additive with presence-gated rendering is compatible by construction in
   *  both directions (old client ignores it; new client against an old server renders nothing).
   *  Bumping for a compatible add trains both sides to ignore version bumps. */
  sqeGateRejectsAtRefresh?: Record<string, number>;
  /** B-FILTER-DIAG-STANDARDIZE (Kyle 2026-08-07) — the ACTIVE path's per-strategy DECLINE reasons:
   *  `strategy -> reason -> count`, the same taxonomy the VTS surfaces, now that the active path READS the
   *  reason its strategies were already setting. This is what makes the Paper/Live per-strategy tables real
   *  data rather than an honest placeholder — Kyle: "this batch isn't complete until we have all the data we
   *  need feeding into these tracking metrics."
   *  OPTIONAL + ADDITIVE on v3, same contract reasoning as `sqeGateRejectsAtRefresh` (Langston's ruling:
   *  optional+additive with presence-gated rendering is compatible in both directions; no version bump).
   *  ABSENT (not `{}`) from a pre-wiring server ⇒ the client renders the honest not-instrumented state; an
   *  EMPTY object means wired-and-nothing-declined. The renderer MUST keep those distinct. */
  strategyNullReasons?: Record<string, Record<string, number>>;
  sqeEvaluated: number;
  sqePassed: number;
  rtbRefresh: ActiveFunnelRtbRefresh;
  sqeAttempts: ActiveFunnelSqeAttempts;
}

export interface ActiveFunnelEnvelope {
  schema: typeof ACTIVE_FUNNEL_SCHEMA;
  mode: 'paper' | 'live';
  /** The instant recording began for the current window (restored across restarts); the UI stamps "since
   *  HH:MM" from it so a post-deploy zero reads as "nothing has run yet". `null` = nothing recorded at all. */
  startedAt: string | null;
  byAssetClass: {
    crypto_spot: ActiveFunnelClassData;
    xstock_spot: ActiveFunnelClassData;
  };
}
