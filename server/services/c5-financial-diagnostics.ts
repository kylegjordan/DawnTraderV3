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

interface BalanceReconciliationData {
  startingBalance: number;
  realizedNetPnlTotal: number;
  calculatedCurrentBalance: number;
  displayedCurrentBalance: number;
  mismatch: number;
  trigger: 'session_start' | 'trade_close' | 'manual_close' | 'stop_reset';
  mode: 'live' | 'paper';
  timestamp: string;
}

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
   * C5-1: Balance Reconciliation Diagnostics
   * Verifies: STARTING_BALANCE + SUM(realized net P/L) = CURRENT_BALANCE
   */
  async logBalanceReconciliation(
    mode: 'live' | 'paper',
    trigger: BalanceReconciliationData['trigger']
  ): Promise<void> {
    if (!this.isEnabled) return;

    try {
      const portfolioState = await storage.getPortfolioState({ mode });
      const displayedCurrentBalance = portfolioState ? parseFloat(portfolioState.balance) : 0;
      const portfolioAny = portfolioState as any;
      const startingBalance = portfolioAny?.startingBalance 
        ? parseFloat(portfolioAny.startingBalance) 
        : displayedCurrentBalance;

      const closedTrades = await storage.getPaperSimTrades(mode);
      const realizedNetPnlTotal = closedTrades.reduce((sum, trade) => {
        const netPnl = trade.netPnl ? parseFloat(trade.netPnl) : (trade.pnl ? parseFloat(trade.pnl) : 0);
        return sum + netPnl;
      }, 0);

      const calculatedCurrentBalance = startingBalance + realizedNetPnlTotal;
      const mismatch = Math.abs(calculatedCurrentBalance - displayedCurrentBalance);

      const data: BalanceReconciliationData = {
        startingBalance,
        realizedNetPnlTotal,
        calculatedCurrentBalance,
        displayedCurrentBalance,
        mismatch,
        trigger,
        mode,
        timestamp: new Date().toISOString()
      };

      if (mismatch > 0.01) {
        console.warn(`${TAG_BALANCE} MISMATCH DETECTED`, JSON.stringify(data));
      } else {
        console.log(`${TAG_BALANCE} VERIFIED`, JSON.stringify(data));
      }
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
      const portfolioState = await storage.getPortfolioState({ mode });
      const portfolioAny = portfolioState as any;
      const startingBalance = portfolioAny?.startingBalance 
        ? parseFloat(portfolioAny.startingBalance) 
        : 0;
      const currentBalance = portfolioState ? parseFloat(portfolioState.balance) : 0;

      const closedTrades = await storage.getPaperSimTrades(mode);
      const realizedNetPnl = closedTrades.reduce((sum, trade) => {
        const netPnl = trade.netPnl ? parseFloat(trade.netPnl) : (trade.pnl ? parseFloat(trade.pnl) : 0);
        return sum + netPnl;
      }, 0);

      const data: GuardrailInputData = {
        balanceUsedForGuardrails,
        startingBalance,
        realizedNetPnl,
        openUnrealizedPnl: null,
        symbol,
        strategy,
        mode,
        timestamp: new Date().toISOString()
      };

      const usesCurrentBalance = Math.abs(balanceUsedForGuardrails - currentBalance) < 0.01;
      const usesStartingBalance = Math.abs(balanceUsedForGuardrails - startingBalance) < 0.01;
      const hasClosedTrades = closedTrades.length > 0;

      if (hasClosedTrades && usesStartingBalance && !usesCurrentBalance) {
        console.warn(`${TAG_GUARDRAIL} WARNING: Using starting_balance instead of current_balance after trades closed`, JSON.stringify(data));
      } else {
        console.log(`${TAG_GUARDRAIL} VERIFIED`, JSON.stringify({
          ...data,
          usesCurrentBalance,
          currentBalance
        }));
      }
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
      const calculatedNetPnl = grossPnl - entryFee - entrySlippage - exitFee - exitSlippage;
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

      if (!allMatched) {
        console.warn(`${TAG_PNL} MISMATCH DETECTED`, JSON.stringify(data));
      } else {
        console.log(`${TAG_PNL} VERIFIED`, JSON.stringify(data));
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
      if (data.timeRange === 'current_simulation' && !data.sessionId) {
        console.warn(`${TAG_ANALYTICS} WARNING: Current Simulation query missing session_id filter`, JSON.stringify(data));
      } else {
        console.log(`${TAG_ANALYTICS} SCOPE`, JSON.stringify(data));
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
