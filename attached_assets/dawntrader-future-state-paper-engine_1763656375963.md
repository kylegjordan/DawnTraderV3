DawnTrader Future-State Architecture Blueprint

(Paper Trading Engine, Real-Time Pipeline, and Beyond)

Audience: Replit agent, future ChatGPT sessions, and human collaborators
Scope: Defines the intended architecture and contracts for the scanner, Stage 3, strategy layer, trading engine, guardrails, and future Lottie/Walter integration.
Purpose: Prevent accidental drift. All audits and fixes (especially in Phase 8.8) should move the system toward this blueprint, not away from it.

1. Phase Roadmap Context (Where This Fits)

This blueprint is aligned with the agreed roadmap:

Phase 8 — Paper Trading Engine (End-to-End Fix)

8.1–8.7: Done (FX5 accounting, cadence, filters, breakdown, batch selection, rotation, filter cleanup)

8.8 — Real-Time Data Pipeline & Engine Audit

8.8.1: Scanner output audit ✅

8.8.1A: Stage-3 verification & scanner alignment (information-only)

8.8.2+: Signal engine & trading engine audits, wiring fixes

8.9 — Increase scanner batch size (60 → 300–500)

8.10 — Minimum strategy engine fix (strategies actually fire correctly)

8.11 — Execute real simulated trades end-to-end

8.12 — Role / permissions stabilization (Filter Insights, user mode cleanup)

Phase 9 — Full Strategy Engine Rebuild

Phase 10 — Full Lottie Restore

Phase 11 — Live Execution Engine (Kraken)

Phase 12 — AWS + Supabase Migration

Phase 13 — Restore Walter (long-horizon analytics)

This doc defines the target architecture that Phases 8.8–11 should converge toward.

2. High-Level Architecture: Data Flow

Conceptually, the system should look like this:

[Kraken Market Data]
        |
        v
[Scanner + FX5 Filters]  (Stage 1/2)
        |
   (Eligible batch)
        |
        v
[Stage 3 State Cache]  <---->  [Guardrails State]
        |   ^
        |   |
        v   |
[Signal Engine]  (Phase 8.8/8.10/9)
        |
        v
[Strategy Engine] (heuristics; later: rebuilt strategies)
        |
        v
[Ready-To-Buy Pool]
        |
        v
[Trading Engine (Paper)]
        |
        v
[Portfolio, Positions, PnL, Cooldowns]
        |
        v
[UI: Trading Page, Filter Insights, Dashboard, Reports]


Key design points:

FX5 Scanner is the only producer of filtered candidate pairs.

Stage 3 is the single source of truth for current cycle state (eligible counts, active pool, ready-to-buy signals, etc.).

WebSockets (scan_tick and related events) are the real-time “heartbeat” of the system.

Diagnostics (paper-sim endpoints, audit logs) are heavier, slower, and used for debugging & analytics, not the main loop.

Guardrails are explicit and limited to the four user-visible guardrails; no secret backdoor filters.

3. Components & Responsibilities (Future-State)
3.1 FX5 Scanner + Filters

Goal: Evaluate a universe of symbols (e.g., 1,500+ pairs) in batches and decide which pass all filters.

Input: Kraken tickers, volumes, prices, spreads, historical candles.

Core output (per batch):

evaluatedCount (e.g., 60 or 300)

eligibleSymbols[] (symbols that passed all FX5 filters + cooldown)

ineligibleCount

filterBreakdown (diagnostics)

Filters (post–Phase 8.7):

Active failure categories:

failed_min_volume

failed_spread

failed_daily_range

failed_min_price

failed_stablecoin

failed_quote_currency

failed_history

failed_market_cap (placeholder, currently logs “unavailable” if no data)

failed_guardrail_risk (guardrails-based risk gating)

failed_universe_size

Plus two non-fail categories:

already_active (dedupe: symbol already in active pool)

passed_all_filters (survived all checks this cycle)

Truth constraint (diagnostic level):

For a given batch:

evaluatedCount
  = sum(all failure counts)
  + already_active
  + passed_all_filters


Where:

eligibleCount (for trading) = passed_all_filters minus cooldown-based exclusions

ineligibleCount = evaluatedCount - eligibleCount

Important: This constraint applies to diagnostic breakdown and any scanner:breakdown-style events, not necessarily to the minimal scan_tick WS payload.

3.2 Stage 3 State Cache

Goal: Hold the current cycle’s view of:

evaluated / eligible / ineligible counts

cycle timestamps

top-of-book candidate list

active pool summary

24h/rolling stats

guardrail status (high-level)

Characteristics:

Updated once per scan cycle.

Serves as the backing store for real-time events:

scan_tick

scanner:breakdown:<mode> (if present)

trading state events (open/closed trades, active positions)

Should be mode-aware (paper, live, etc.).

Future-state expectations:

A dedicated module (e.g. stage3-state-cache.ts) holds this state.

Scanner writes its final results into Stage 3 only once per cycle.

No other subsystem mutates Stage-3 scanner metrics.

3.3 Real-Time Events (WebSockets)

Goal: Provide a lean, robust real-time stream to the UI and other subscribers.

We distinguish two classes of events:

Core heartbeat events (frequent, lean)

scan_tick (or equivalent)

possibly trading_tick for trade/portfolio updates

Analytics / detail events (less frequent, heavier)

scanner:breakdown:<mode>

trading:position_update

portfolio:update

3.3.1 scan_tick (future-state contract)

Purpose: Real-time feedback that a scan cycle completed, with enough information to power the Trading page’s top-level metrics and timers.

Payload (example target shape):

type ScanTickPayload = {
  mode: 'paper' | 'live';
  cycleId: string;
  completedAt: string;      // ISO timestamp
  evaluatedCount: number;   // batch size (e.g. 60, 300, 500)
  eligibleCount: number;    // survivors (passed filters + cooldown)
  ineligibleCount: number;  // evaluated - eligible
  topNCount: number;        // how many were from top-end tier
  tierBCount: number;       // how many were from tier B
  activePoolCount: number;  // how many pairs currently active in pool
  rotation: {
    topEndUniverseSize: number;
    tierBUniverseSize: number;
  };
};


Key points:

scan_tick should not carry full FX5 breakdown or massive symbol arrays.

It’s a lightweight heartbeat for the Trading page and timers.

3.3.2 scanner:breakdown:<mode> (future-state contract)

Purpose: Provide detailed breakdown counts for the Filter Insights UI and audits.

Payload (example target shape):

type FilterBreakdown = {
  failed_min_volume: number;
  failed_spread: number;
  failed_daily_range: number;
  failed_min_price: number;
  failed_stablecoin: number;
  failed_quote_currency: number;
  failed_history: number;
  failed_market_cap: number;
  failed_guardrail_risk: number;
  failed_universe_size: number;
  already_active: number;
  passed_all_filters: number;
};

type ScannerBreakdownEvent = {
  mode: 'paper' | 'live';
  cycleId: string;
  window: 'last_cycle' | '24h';   // context of counts
  evaluatedCount: number;
  eligibleCount: number;
  breakdown: FilterBreakdown;
  truthConstraintOk: boolean;     // derived flag
};


Important:

This is the event that should respect the truth constraint.

It may be emitted less frequently (e.g. once per cycle or on demand).

3.4 Signal Engine (Phase 8.8 / 8.10 / 9)

Goal: Convert filtered scanner output into signals (e.g. “candidate to buy/sell”) consumed by strategies.

Inputs:

Eligible candidates from Stage-3 (not raw scanner output).

Indicator values (RSI, trend, volatility, etc.) if available.

Outputs:

Structured signals with:

symbol

side (long/short or buy/sell)

entry conditions

confidence

time horizon

Phase 8.8:

Audit-only: confirm which of the current signal paths still work, which depend on dead data, and which strategies are effectively no-ops.

Phase 8.10:

Minimum repair so that at least some strategies produce correct, coherent signals end-to-end.

Phase 9:

Full rewrite / redesign of strategy logic.

3.5 Strategy Engine

Goal: Take raw signals and apply strategy-specific rules to decide:

which signals to accept,

position sizing (with guardrails),

timing,

and exit conditions.

Future-state:

Phase 8.8:

Strategy engine is not rebuilt, only audited.

Phase 8.10:

Minimal repairs so trades can actually be opened/closed in paper mode.

Phase 9:

Full strategy engine rebuild, aligning with clean FX5 + Stage-3 abstractions.

3.6 Ready-To-Buy Pool

Goal: Maintain an ordered list of candidates that are “ready to be traded now” based on strategies and signals.

Sits between strategy engine and trading engine.

Applies:

cooldown rules,

max positions,

basic guardrail constraints,

deduping.

Future-state behavior:

Receives new events each cycle from Stage-3/strategy engine.

Updates are reflected both in:

Stage-3 cache

WS events (e.g. ready_to_buy:update)

3.7 Trading Engine (Paper)

Goal: Execute trades in paper mode using the same core logic that will later be wired to Kraken.

Responsibilities:

open trades from ready-to-buy pool

track positions, PnL, and exposure

apply guardrails:

portfolio risk per trade

symbol cooldown (post-trade)

max open positions

daily loss killswitch

close trades based on strategy + risk signals

update portfolio + Stage-3 cache

emit trading WS events (positions created/closed, PnL updates)

Critical requirement:
By the end of Phase 8.11, paper trading must:

open at least one real simulated trade from FX5 data,

close it,

reflect it in portfolio / metrics,

and honor guardrails in real time.

4. Guardrails Contract (Future-State)

Only four guardrails are allowed:

Portfolio Risk per Trade

Single Symbol Cooldown (cooldown after an executed trade, not at filter level)

Max Open Positions

Daily Loss Killswitch

Constraints:

No hidden, hard-coded “secret” guardrails that affect trade decisions.

failed_guardrail_risk in FX5 breakdown should only reflect guardrails rooted in user-configurable guardrail settings.

Any additional guard-type logic should either:

be exposed as a proper guardrail in the UI, or

be moved to strategy logic (Phase 9), not filters.

5. Lottie & Walter (Future Integration)
5.1 Lottie (Phase 10)

Not active in Phase 8.8–8.11 except as a passive observer.

Future role:

Learn from clean strategy outputs and real paper trades.

Suggest decisions, not override guardrails.

Use Stage-3 state as one of its sources of truth.

In 8.x, Lottie must not:

open or close trades

change guardrails

change scanner behavior

modify Stage-3 state

It may observe via Cortex/telemetry for future training.

5.2 Walter (Phase 13)

Long-horizon analytics and advisor.

Plugs into:

historical trades,

performance metrics,

strategy outputs.

Must not alter real-time trading decisions.

6. What Audits (like 8.8.1 / 8.8.1A) Should & Shouldn’t Do
6.1 Allowed in audit phases (8.8.1 / 8.8.1A):

Add temporary audit logging.

Create markdown reports under reports/phase-8.8/.

Call existing APIs with testuser123.

Read WS streams and document payloads.

Identify mismatches between:

actual behavior

this blueprint

6.2 Not allowed in audit phases:

Introduce new Stage-3 event shapes incompatible with this design.

Overload scan_tick with full breakdown + full FX5 data.

Add new filters or re-enable legacy ones (blacklist/whitelist, strategy_none).

Change Lottie/Walter behavior.

Rewrite strategy engine (that’s Phase 9).

7. How To Use This Blueprint (For Future ChatGPT Sessions & Replit)

When Replit reports:

“We didn’t find Stage 3, so we should build XYZ…”

The reviewing ChatGPT session should:

Compare their suggestion to this blueprint.

If they propose a new architecture that conflicts (e.g., pushing full breakdown into scan_tick), reject or redirect it.

Instead, ask them to:

locate existing Stage-3 pieces,

align them to this design,

or document where something went missing (e.g., branch or refactor loss).

When audits surface mismatches (e.g., breakdown truth constraints, missing WS events), the corrections should move the system toward:

Clean FX5 output

Stage-3 cache as single source of truth

Lightweight scan_tick

Detailed but separate breakdown events

Only four guardrails

Strategies audited, then rebuilt in Phase 9