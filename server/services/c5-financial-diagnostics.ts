/**
 * Phase 8.8.3-C5 — Financial Integrity Verification & Diagnostic Validation
 * 
 * SCOPE LOCK: This is a verification-only service.
 * - NO modifications to trading logic
 * - NO modifications to execution engine behavior
 * - NO modifications to guardrail thresholds
 * - NO modifications to balances or P/L formulas
 * 
 * ALLOWED: Logging, Diagnostics, Assertions, One-time validation checks
 */

import { storage } from '../storage.js';

const TAG_BALANCE = '[C5-BALANCE-CHECK]';
const TAG_GUARDRAIL = '[C5-GUARDRAIL-CHECK]';
const TAG_PNL = '[C5-PNL-RECON]';
const TAG_ANALYTICS = '[C5-ANALYTICS-SCOPE]';

/**
 * B-COST-MATH-CONSOLIDATION Step-4: extracted from the retired `BalanceReconciliationData`.
 * That interface's other five fields (`startingBalance`, `realizedNetPnlTotal`,
 * `calculatedCurrentBalance`, `displayedCurrentBalance`, `mismatch`) lost their last writer when
 * site 5 stopped computing a mismatch from a fabricated input — they existed to carry a
 * comparison that no longer happens. Keeping a six-field interface alive to host one string
 * union is precisely the lingering-legacy shape rule 18 forbids, so it is deleted rather than
 * left "in case". Nothing else referenced it (grep: 2 hits, both in this file).
 */
type BalanceReconciliationTrigger = 'session_start' | 'trade_close' | 'manual_close' | 'stop_reset';

interface GuardrailInputData {
  balanceUsedForGuardrails: number;
  startingBalance: number;
  realizedNetPnl: number;
  openUnrealizedPnl: number | null;
  symbol: string;
  strategy: string;
  mode: 'live' | 'paper';
  timestamp: string;
}

interface PnlReconciliationData {
  tradeId: string;
  symbol: string;
  grossPnl: number;
  entryFee: number;
  entrySlippage: number;
  exitFee: number;
  exitSlippage: number;
  calculatedNetPnl: number;
  engineNetPnl: number;
  dbNetPnl: number | null;
  apiNetPnl: number | null;
  tolerance: number;
  matched: boolean;
  mode: 'live' | 'paper';
  timestamp: string;
}

interface AnalyticsScopeData {
  mode: 'live' | 'paper';
  timeRange: 'current_simulation' | 'last_hour' | 'last_24h';
  filtersApplied: string;
  tradeCount: number;
  netPnlUsed: number;
  winCount: number;
  lossCount: number;
  sessionId: string | null;
  timestamp: string;
}

class C5FinancialDiagnostics {
  private isEnabled: boolean = true;

  /**
   * C5-1: Balance OBSERVATION (was "Balance Reconciliation Diagnostics").
   * ⚠️ It NO LONGER verifies `STARTING_BALANCE + SUM(realized net P/L) = CURRENT_BALANCE` — that
   * relationship needs a starting balance this table does not carry and a realized sum this query
   * does not bound. It records what it can see and asserts nothing. See site 5 below and #618.
   */
  async logBalanceReconciliation(
    mode: 'live' | 'paper',
    trigger: BalanceReconciliationTrigger
  ): Promise<void> {
    if (!this.isEnabled) return;

    try {
      // ★★ B-COST-MATH-CONSOLIDATION SITE 5 — THE PHANTOM READ IS GONE (#614).
      // This previously read `(portfolioState as any).startingBalance` — a column that DOES NOT
      // EXIST on `portfolio_state` (`shared/schema.ts`: id · globalContextId · mode · balance ·
      // anchorVersion · lastUpdate · createdAt; the real `starting_balance` is on
      // `active_engine_sessions`). The `as any` cast let it compile, and the `?:` fallback then
      // silently substituted the CURRENT balance for the STARTING one — making `starting` equal
      // `displayed` by construction, so the check degenerated into "is realized P&L zero?", which
      // is false the moment any trade closes. Measured: 339 false alarms since 2026-07-15,
      // `displayed == starting` on 339/339, mismatch magnitude = |realized P&L| exactly.
      //
      // ⚠️ AND THE COMPARISON CANNOT BE REPAIRED INTO CORRECTNESS HERE, which is why this stops
      // short of computing one. `portfolio_state.balance` is an ANCHOR, not a running cash figure
      // (`portfolio-anchor-service.executeReanchor` is its sole runtime writer; it moves only on a
      // re-anchor event). The honest relationship pairs the anchor with the realized P&L accrued
      // SINCE that anchor — and the anchor/session-scope pairing is a live, undecided question
      // filed as #618, sequenced after this batch. Inventing an input to keep a mismatch number
      // flowing is exactly what produced the 339.
      const portfolioState = await storage.getPortfolioState({ mode });
      const anchorBalance = portfolioState ? parseFloat(portfolioState.balance) : null;

      if (anchorBalance === null || !Number.isFinite(anchorBalance)) {
        // DISTINGUISHABLE HARD FAILURE, not a fabricated zero. A diagnostic that cannot obtain its
        // input must say so — it must never invent one and then report the invention as a defect.
        console.warn(`${TAG_BALANCE} INPUT_UNAVAILABLE`, JSON.stringify({
          reason: 'no portfolio_state row or unparseable balance', trigger, mode,
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      const closedTrades = await storage.getClosedTrades(mode, { limit: 100 }); // Step A (#618): codified pre-existing default (100); no behaviour change
      const realizedNetPnlTotal = closedTrades.reduce((sum, trade) => {
        const netPnl = trade.netPnl ? parseFloat(trade.netPnl) : (trade.pnl ? parseFloat(trade.pnl) : 0);
        return sum + netPnl;
      }, 0);

      // OBSERVATION ONLY — deliberately no `mismatch`. Emitted on `warn` (stderr) rather than
      // `log`: staging retention is asymmetric (stdout ~2 days, stderr ~14) and these lines are
      // the evidence #618's pairing decision will be made from. Severity is the wrong reason to
      // pick a stream when the stream determines how long the evidence survives.
      // ⚠️ `realizedNetPnlTotal` here is bounded by `getClosedTrades`' default limit (100, ordered
      // by opened_at) — that silent cap is #618 leg 2 and is NOT fixed in this batch. Recording it
      // beside the number so nobody reads this line as a full-population total.
      console.warn(`${TAG_BALANCE} OBSERVED`, JSON.stringify({
        anchorBalance,
        realizedNetPnlTotalSampled: realizedNetPnlTotal,
        sampledTradeCount: closedTrades.length,
        note: 'anchor vs realized are NOT compared here — the pairing is #618, and the sample is capped',
        trigger,
        mode,
        timestamp: new Date().toISOString(),
      }));
    } catch (error) {
      console.error(`${TAG_BALANCE} ERROR`, error);
    }
  }

  /**
   * C5-2: Guardrail Input Verification
   * Logs balance values used when sizing a new trade
   */
  async logGuardrailInput(
    mode: 'live' | 'paper',
    symbol: string,
    strategy: string,
    balanceUsedForGuardrails: number
  ): Promise<void> {
    if (!this.isEnabled) return;

    try {
      // ★★ B-COST-MATH-CONSOLIDATION SITE 6 — THE ALWAYS-GREEN COUNTERPART TO SITE 5 (#614).
      // Nine lines below the always-RED check sat this always-GREEN one: the same `as any` read of
      // the same non-existent `portfolio_state.startingBalance`, but falling back to **0** instead
      // of to the displayed balance. So `usesStartingBalance` was
      // `|balanceUsedForGuardrails − 0| < 0.01` — true only when the SIZING balance is itself ~zero
      // — and the warning below was unreachable in every funded state, firing only in an unfunded
      // one where it would mean nothing. Falsifiable prediction, tested before this repair:
      // ZERO `[C5-GUARDRAIL-CHECK] WARNING` lines since 2026-07-15, on the error stream AND stdout.
      //
      // ⚠️ A CHECK THAT ALWAYS PASSES IS STRICTLY WORSE THAN ONE THAT ALWAYS FAILS — only the
      // second gets investigated. Sites 5 and 6 are the two POLARITIES of one bug.
      //
      // ★ AND ITS PREMISE DISSOLVED INDEPENDENTLY OF THE BAD INPUT. It was built to police
      // "sizing off the STARTING balance instead of the CURRENT one" — but since P19-B8.2 made the
      // balance model ANCHOR-based, both of those concepts map onto the SAME single column.
      // The distinction this check exists to draw no longer exists on this table.
      // ⇒ It reports an OBSERVATION and deliberately asserts nothing. Re-deriving a discriminating
      // check needs the anchor/session-scope decision in #618; inventing one here would just
      // replace an always-green check with an unproven always-red one, which is the same mistake
      // wearing the opposite sign.
      const portfolioState = await storage.getPortfolioState({ mode });
      const anchorBalance = portfolioState ? parseFloat(portfolioState.balance) : null;

      if (anchorBalance === null || !Number.isFinite(anchorBalance)) {
        console.warn(`${TAG_GUARDRAIL} INPUT_UNAVAILABLE`, JSON.stringify({
          reason: 'no portfolio_state row or unparseable balance',
          balanceUsedForGuardrails, symbol, strategy, mode,
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      const closedTrades = await storage.getClosedTrades(mode, { limit: 100 }); // Step A (#618): codified pre-existing default (100); no behaviour change
      const realizedNetPnl = closedTrades.reduce((sum, trade) => {
        const netPnl = trade.netPnl ? parseFloat(trade.netPnl) : (trade.pnl ? parseFloat(trade.pnl) : 0);
        return sum + netPnl;
      }, 0);

      const data: GuardrailInputData = {
        balanceUsedForGuardrails,
        startingBalance: anchorBalance,   // the honest name for what this column holds
        realizedNetPnl,
        openUnrealizedPnl: null,
        symbol,
        strategy,
        mode,
        timestamp: new Date().toISOString()
      };

      // OBSERVATION ONLY. `sizerMatchesAnchor` is recorded, NOT asserted — the sizer may
      // legitimately use anchor+realized rather than the bare anchor, and which of those is
      // correct is #618's open decision, not something to alarm on today.
      // ⚠️ `realizedNetPnl` is capped by `getClosedTrades`' default limit (100) — #618 leg 2.
      console.warn(`${TAG_GUARDRAIL} OBSERVED`, JSON.stringify({
        ...data,
        sizerMatchesAnchor: Math.abs(balanceUsedForGuardrails - anchorBalance) < 0.01,
        sampledTradeCount: closedTrades.length,
        note: 'observation only — no assertion; the discriminating check awaits #618',
      }));
    } catch (error) {
      console.error(`${TAG_GUARDRAIL} ERROR`, error);
    }
  }

  /**
   * C5-3: Single-Trade P/L Sanity Check
   * Verifies: gross_pnl - entry_fee - entry_slippage - exit_fee - exit_slippage = net_pnl
   */
  logPnlReconciliation(
    mode: 'live' | 'paper',
    tradeId: string,
    symbol: string,
    grossPnl: number,
    entryFee: number,
    entrySlippage: number,
    exitFee: number,
    exitSlippage: number,
    engineNetPnl: number,
    dbNetPnl?: number,
    apiNetPnl?: number
  ): void {
    if (!this.isEnabled) return;

    try {
      // ★ B-COST-MATH-CONSOLIDATION SITE 4 — RE-ANCHORED. This previously computed
      //   grossPnl − entryFee − entrySlippage − exitFee − exitSlippage
      // which is canonical F3's four-component form spelled out longhand. That invariant was
      // RETIRED at B-COST-ACCOUNTING-HONESTY (2026-07-28): gross is now measured on ACTUAL fills,
      // which already contain slippage, so subtracting it again double-counts. The check was left
      // anchored to the retired form and had been reporting MISMATCH on correct trades ever since
      // — 17 logged, including a DXCM close diverging by exactly its exitSlippage ($28.58).
      //
      // ⚠️ WHY IT MATTERS MORE THAN THE NOISE: a self-check that always fires makes a REAL defect
      // indistinguishable from its own noise. That is strictly worse than no check.
      //
      // It now derives from the SAME shared implementation the engine uses, so the check can never
      // again drift from the thing it is checking. A check that can disagree with its subject is
      // not a check.
      // Deliberately written plainly. An earlier draft of this repair routed it through
      // `computeRealizedPnl` with zeroed prices to "share" the implementation — that borrowed one
      // field, passed three meaningless arguments, and obscured a two-term subtraction. Sharing
      // that the reader cannot follow is not sharing. The relationship asserted here is pinned to
      // the shared module by test instead (`net === gross − totalCost`), which is where a drift
      // between the two would actually be caught.
      const calculatedNetPnl = grossPnl - (entryFee + exitFee);
      const tolerance = 0.01;
      
      const engineMatch = Math.abs(calculatedNetPnl - engineNetPnl) <= tolerance;
      const dbMatch = dbNetPnl === undefined || Math.abs(calculatedNetPnl - dbNetPnl) <= tolerance;
      const apiMatch = apiNetPnl === undefined || Math.abs(calculatedNetPnl - apiNetPnl) <= tolerance;
      const allMatched = engineMatch && dbMatch && apiMatch;

      const data: PnlReconciliationData = {
        tradeId,
        symbol,
        grossPnl,
        entryFee,
        entrySlippage,
        exitFee,
        exitSlippage,
        calculatedNetPnl,
        engineNetPnl,
        dbNetPnl: dbNetPnl ?? null,
        apiNetPnl: apiNetPnl ?? null,
        tolerance,
        matched: allMatched,
        mode,
        timestamp: new Date().toISOString()
      };

      // ★★ DEMOTED TO OBSERVED AT STEP-4 — because as constructed this check CANNOT FIRE, and
      // saying so is better than shipping a green light that means nothing (Langston, Step-4).
      // The caller (`active-execution-engine.ts:2268`) destructures `{ grossPnl, totalCost, netPnl }`
      // from ONE `computeRealizedPnl` call and passes `grossPnl` and `netPnl` here, with
      // `dbNetPnl`/`apiNetPnl` OMITTED — so those two comparisons are `undefined ⇒ true`, and
      // `engineMatch` compares `grossPnl − (entryFee + exitFee)` against a `netPnl` that IS
      // `grossPnl − totalCost` where `totalCost === entryFee + exitFee`. **Bit-identical by
      // construction.** Re-anchoring it to the shared model fixed the 17 false MISMATCHes and, in
      // the same stroke, made it unfalsifiable — an always-RED check became an always-GREEN one,
      // which is exactly the failure this batch flagged at site 6, on the worse polarity.
      // ⚠️ THE REAL INVARIANT IS STILL UNCHECKED and is named rather than faked: engine-computed
      // net vs the net actually PERSISTED (the numeric column round-trip, where drift genuinely
      // lives). ★ HOMED AS #620, owner CC-C — an earlier draft said only "a follow-up", which is
      // the vague deferral §13 forbids and pointed an operator at nothing.
      // ★ AND THE BLOCKER IS SCOPE, NOT FLAKINESS — correcting a false constraint this comment
      // previously asserted. `active-execution-engine.ts:1995-2027` writes `pnl` to the row BY
      // `trade.id` BEFORE `:2268` fires, so a re-fetch would be a DETERMINISTIC primary-key read
      // of a row just written — not a second live read that can race. Deferring it is a scope
      // decision, and #620 must not inherit a technical objection that does not exist.
      // ★★ #620 NOW WIRED — this check ASSERTS again, but on the RIGHT comparison.
      // `dbNetPnl` is supplied by the engine from `updateClosedTrade`'s own `.returning()` row,
      // so the PERSISTED net is compared against the ENGINE-COMPUTED net at ZERO extra DB cost.
      // ⚠️ THE OTHER COMPARISON STAYS UNASSERTED AND THAT IS DELIBERATE: `calculatedNetPnl` vs
      // `engineNetPnl` is TAUTOLOGICAL — both descend from ONE `computeRealizedPnl` call, so it
      // can never fail and a green result there means nothing. Reported, never asserted.
      if (dbNetPnl !== undefined) {
        const roundTripOk = Math.abs(engineNetPnl - dbNetPnl) <= tolerance;
        if (!roundTripOk) {
          // THE REAL ALARM: what the engine computed is NOT what the database stored.
          console.warn(`${TAG_PNL} ROUND_TRIP_MISMATCH`, JSON.stringify({
            ...data, engineNetPnl, dbNetPnl, delta: engineNetPnl - dbNetPnl, tolerance,
          }));
        } else {
          // Logged on SUCCESS too, on purpose: without this line a silent check and a passing
          // check are indistinguishable — the exact polarity trap this batch family documents.
          console.warn(`${TAG_PNL} ROUND_TRIP_OK`, JSON.stringify({
            ...data, engineNetPnl, dbNetPnl, delta: engineNetPnl - dbNetPnl,
          }));
        }
      } else {
        console.warn(`${TAG_PNL} OBSERVED`, JSON.stringify({
          ...data, matched: null,
          note: 'dbNetPnl not supplied by this caller — round-trip NOT checked (see #620)',
        }));
      }
    } catch (error) {
      console.error(`${TAG_PNL} ERROR`, error);
    }
  }

  /**
   * C5-4: Analytics Scope Verification
   * Validates analytics queries for each time range
   */
  logAnalyticsScope(data: AnalyticsScopeData): void {
    if (!this.isEnabled) return;

    try {
      // Phase 8.8.3-C6: Retain analytics scope logs until validated in production
      if (data.timeRange === 'current_simulation' && !data.sessionId) {
        console.warn(`${TAG_ANALYTICS} WARNING: Current Simulation query missing session_id filter`, JSON.stringify(data));
      } else {
        // Brief log for analytics scope - retained for production validation
        console.log(`${TAG_ANALYTICS} ${data.timeRange} mode=${data.mode} trades=${data.tradeCount} netPnl=${data.netPnlUsed.toFixed(2)}`);
      }
    } catch (error) {
      console.error(`${TAG_ANALYTICS} ERROR`, error);
    }
  }

  /**
   * Enable/disable C5 diagnostics
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`${TAG_BALANCE} Diagnostics ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current status
   */
  isActive(): boolean {
    return this.isEnabled;
  }
}

export const c5FinancialDiagnostics = new C5FinancialDiagnostics();
