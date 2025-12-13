# DawnTrader — System Invariants & Design Guarantees

**Document Type:** System Constitution  
**Created:** December 12, 2025  
**Purpose:** Define non-negotiable invariants that must remain true regardless of refactors, optimizations, or feature additions

---

# Preamble

This document defines the **invariants** of the DawnTrader system — rules that must never be violated. These are not implementation details or execution flows. They are **guarantees** that the system must uphold at all times.

Any proposed change that violates an invariant in this document requires explicit review and justification before implementation.

---

# 1. Trading & Risk Invariants

## 1.1 Stop-Loss Requirement

**INVARIANT T1:** Every trade MUST have a stop-loss price below the entry price.

- No trade may be executed without a defined stop-loss
- Stop-loss must be strictly less than entry price for long positions
- This rule applies to both paper and live modes
- There are no exceptions to this rule

## 1.2 One Position Per Symbol

**INVARIANT T2:** Maximum one open position per symbol at any time.

- A new trade for symbol X cannot be opened if symbol X already has an open position
- This applies per-mode (paper mode and live mode are isolated)
- Manual close must complete before a new position in the same symbol can open

## 1.3 Balance Usage for Risk Calculation

**INVARIANT T3:** Guardrail risk calculations MUST use Current Balance (realized only), not Portfolio Value.

- Current Balance = Starting Balance + Realized P/L
- Portfolio Value = Current Balance + Unrealized P/L
- Risk calculations (position sizing, max exposure) use Current Balance
- This prevents unrealized gains from inflating risk allowances

## 1.4 Kill Switch Authority

**INVARIANT T4:** When kill switch is tripped, ALL new trades MUST be blocked.

- Kill switch takes immediate effect
- No signal, regardless of source, may bypass the kill switch
- Open positions may still be monitored and closed
- Only explicit user action can reset the kill switch

## 1.5 Symbol Cooldown Enforcement

**INVARIANT T5:** After closing a position in symbol X, no new position in symbol X may open until cooldown expires.

- Cooldown duration is defined in guardrails_v2
- Cooldown timer starts at position close time
- Cooldown applies per-symbol, per-mode

## 1.6 Max Open Positions Limit

**INVARIANT T6:** The system MUST NOT exceed the configured maxOpenPositions limit.

- If maxOpenPositions = 5 and 5 positions are open, all new signals are blocked
- This limit is enforced at trade-safety check time, not at signal generation time
- Manual trades are subject to the same limit

## 1.7 Mode Isolation

**INVARIANT T7:** Paper mode and Live mode MUST operate with complete data isolation.

- Paper trades do not affect live balances
- Live trades do not appear in paper trade history
- Guardrails are configured independently per mode
- Engine state is tracked separately per mode

---

# 2. Financial Invariants

## 2.1 Gross P/L Definition

**INVARIANT F1:** Gross P/L is calculated as price difference times quantity, using actual execution prices.

```
grossPnl = (actualExitPrice - actualEntryPrice) × quantity
```

- actualEntryPrice includes entry slippage
- actualExitPrice includes exit slippage
- Gross P/L does NOT include fees

## 2.2 Cost Component Definitions

**INVARIANT F2:** Total cost includes exactly four components.

| Component | Rate | Calculation |
|-----------|------|-------------|
| Entry Slippage | 0.15% | Added to entry price |
| Exit Slippage | 0.15% | Subtracted from exit price |
| Entry Fee | 0.10% | entryPrice × quantity × 0.001 |
| Exit Fee | 0.10% | exitPrice × quantity × 0.001 |

- These rates are constants, not configurable
- Total round-trip cost is approximately 0.50% of position value

## 2.3 Net P/L Calculation

**INVARIANT F3:** Net P/L equals Gross P/L minus Total Cost.

```
totalCost = entryFee + exitFee + entrySlippage + exitSlippage
netPnl = grossPnl - totalCost
```

- Net P/L is the only value used for balance updates
- Net P/L is what gets added to realized P/L

## 2.4 Slippage Direction

**INVARIANT F4:** Slippage MUST always work against the trader.

- Entry: Actual price is HIGHER than signal price (buy at worse price)
- Exit (stop-loss): Actual price is LOWER than trigger price (sell at worse price)
- Exit (take-profit): Actual price is LOWER than trigger price (sell at worse price)
- There is no "positive slippage" in the simulation model

## 2.5 Balance Reconciliation

**INVARIANT F5:** The sum of all net P/L values MUST equal realizedPnl in portfolio.

```
Σ(trade.netPnl for all closed trades) = portfolio.realizedPnl
```

- Any discrepancy indicates a system error
- This invariant is verifiable via diagnostic endpoints

## 2.6 No Phantom Trades

**INVARIANT F6:** Every closed trade MUST have corresponding entry and exit records.

- A trade cannot be "closed" without an exit price and exit timestamp
- A trade cannot have exit data without having entry data
- No trade record may be partially populated

## 2.7 Real Pricing Only

**INVARIANT F7:** Production trading decisions MUST use only real market data.

- Mock pricing is prohibited in production
- If no real price is available, the operation must fail or wait
- Price source must be traceable (kraken_ws, kraken_rest, binance, coingecko)
- "no_reliable_price" is an explicit failure state, not a fallback

---

# 3. Architectural Invariants

## 3.1 Engine Responsibilities

**INVARIANT A1:** Each engine has a single, defined responsibility.

| Engine | Responsibility |
|--------|----------------|
| FX5 Scanner | Market scanning and filter application |
| Active Filter Pool | Symbol eligibility tracking (in-memory) |
| Signal Orchestrator | Strategy evaluation and signal generation |
| Strategy Engine | Pure strategy detection (no side effects) |
| Trade Safety | Pre-trade risk validation |
| Paper Execution Engine | Trade execution and position monitoring |

- Engines MUST NOT reach into other engines' domains
- Engines communicate via defined interfaces, not shared state

## 3.2 Strategy Engine Purity

**INVARIANT A2:** The Strategy Engine MUST be a pure function.

- Given the same inputs, it MUST produce the same outputs
- It MUST NOT make database calls
- It MUST NOT maintain state between invocations
- It MUST NOT modify any external state

## 3.3 Position Sizing Purity

**INVARIANT A3:** The Position Sizing Helper MUST be a pure function.

- Input: portfolio value, guardrails, entry price, stop price
- Output: quantity, estimated value
- No database calls, no external dependencies
- Deterministic calculation

## 3.4 Single Source of Truth for Guardrails

**INVARIANT A4:** GuardrailPolicy Service is the ONLY authoritative source for guardrail values.

- All components must read guardrails through GuardrailPolicy
- No component may cache guardrails locally for extended periods
- Manual vs LATTI resolution happens only in GuardrailPolicy

## 3.5 Trade Safety as Final Gate

**INVARIANT A5:** Trade Safety is the ONLY gate between signals and execution.

- All signals MUST pass through Trade Safety before execution
- No alternative path to execution may exist
- Trade Safety checks are not bypassable

## 3.6 No Cross-Layer Database Access

**INVARIANT A6:** Engines MUST NOT directly access tables owned by other engines.

- Execution Engine owns: paper_sim_trades, paper_sim_open_positions
- Portfolio Manager owns: paper_sim_portfolio
- Filter systems own: screener_filters, active filter pool
- Cross-engine data access must go through storage layer interfaces

## 3.7 WebSocket Price Pipeline Integrity

**INVARIANT A7:** Price updates MUST flow through the defined pipeline.

```
Kraken WebSocket → LivePricingAdapter.priceCache → Engine consumption
```

- No component may fetch prices directly from Kraken bypassing the cache
- Price cache is the single source of truth for current prices
- All price consumers use getPriceWithFallback()

## 3.8 Execution Engine Monitoring Frequency

**INVARIANT A8:** Position monitoring MUST run at least every 2 seconds.

- Current implementation: 1.5 seconds
- Slower monitoring risks missing exit triggers
- This frequency is critical for stop-loss protection

---

# 4. AI & Agent Governance Invariants

## 4.1 Walter's Role

**INVARIANT G1:** Walter is an OBSERVATIONAL and ANALYTICAL agent only.

Walter MAY:
- Analyze market conditions
- Interpret user intent
- Provide commentary and insights
- Recommend actions

Walter MUST NOT:
- Execute trades directly
- Modify guardrails without user confirmation
- Override safety checks
- Access trading engine internals

## 4.2 LATTi's Role

**INVARIANT G2:** LATTi is a TUNING agent with bounded authority.

LATTi MAY:
- Adjust guardrail parameters within defined bounds
- Optimize strategy parameters
- Learn from historical performance

LATTi MUST NOT:
- Execute trades directly
- Disable safety guardrails
- Modify parameters beyond configured bounds
- Operate on user-locked parameters

## 4.3 AI Execution Authority

**INVARIANT G3:** NO AI agent has direct trade execution authority.

- All trades must flow through the standard pipeline
- AI-generated signals are treated as any other signal
- AI cannot bypass Trade Safety checks
- Human user is ultimate authority

## 4.4 Phase-Gated AI Reintegration

**INVARIANT G4:** AI capabilities are reintroduced only after core trading is stable.

Current Phase Order:
1. Paper trading engine stable (Phase 8.8.3)
2. Live trading engine validated (Phase 11)
3. Walter observational features (future)
4. LATTi tuning features (future)

- No AI feature may be added that destabilizes core trading
- Each phase must be explicitly completed before next begins

## 4.5 AI Diagnostic Access

**INVARIANT G5:** AI agents have READ-ONLY access to diagnostics.

- AI may observe system telemetry
- AI may analyze trade history
- AI may NOT modify diagnostic data
- AI may NOT clear diagnostic buffers

---

# 5. Process & Change Management Invariants

## 5.1 Phase Enforcement

**INVARIANT P1:** Work MUST be organized into explicit phases.

- Each phase has defined scope and acceptance criteria
- Phases are numbered sequentially
- No work outside current phase scope without explicit approval
- Phase transitions require explicit signoff

## 5.2 Diagnostic-First Requirement

**INVARIANT P2:** Before fixing a bug, diagnostic evidence MUST be gathered.

- Reproduce the issue with logging
- Identify root cause before implementing fix
- Document evidence in issue/phase notes
- Verify fix with diagnostic data

## 5.3 No Silent Failures

**INVARIANT P3:** System errors MUST be logged, never silently ignored.

- Catch blocks must log the error
- Failed operations must return explicit failure states
- "return null" without logging is prohibited
- Error context must be preserved

## 5.4 Schema Migration Safety

**INVARIANT P4:** Schema changes MUST preserve existing data.

- ID column types MUST NOT change
- Existing columns MUST NOT be dropped without migration
- Use `npm run db:push` for schema sync
- New columns must have defaults or be nullable

## 5.5 Configuration Over Code

**INVARIANT P5:** Behavior changes SHOULD be configurable, not hardcoded.

- Trading parameters belong in guardrails_v2
- Filter parameters belong in screener_filters
- System constants are defined in one place with explicit documentation
- Magic numbers are prohibited

## 5.6 Rollback Capability

**INVARIANT P6:** Any change MUST be reversible without data loss.

- Checkpoints are created automatically
- Database state can be rolled back
- Code changes can be reverted via git
- No change may create irreversible state

## 5.7 Test Before Production

**INVARIANT P7:** Paper mode MUST validate changes before live mode deployment.

- All trading logic runs in paper mode first
- Paper mode results inform live mode confidence
- Live mode activation is a separate, explicit step
- Paper mode bugs block live mode deployment

## 5.8 Documentation Currency

**INVARIANT P8:** Core documentation MUST stay current with implementation.

- replit.md reflects current architecture
- Invariant documents are updated when invariants change
- Outdated documentation is corrected, not ignored
- Documentation changes accompany code changes

---

# 6. Paper Trading Specific Invariants

## 6.1 Simulation Fidelity

**INVARIANT S1:** Paper trading MUST simulate real trading conditions.

- Uses real market prices from Kraken
- Applies realistic slippage (0.15%)
- Applies realistic fees (0.10%)
- Follows same execution rules as live trading would

## 6.2 No Real Money

**INVARIANT S2:** Paper trading MUST NOT affect real funds.

- Paper mode never calls Kraken order endpoints
- Paper balances are simulated only
- Paper trades are recorded in paper_sim_* tables only
- No API keys with trading permissions needed for paper mode

## 6.3 Hard Reset Capability

**INVARIANT S3:** Paper trading session MUST be fully resettable.

A hard reset clears:
- All paper_sim_trades
- All paper_sim_open_positions
- Resets paper_sim_portfolio to starting balance
- Clears in-memory caches (Active Filter Pool, price cache)
- Resets engine session state

No ghost data may persist after hard reset.

## 6.4 Session Isolation

**INVARIANT S4:** Each paper trading session is independent.

- Engine start creates new session timestamp
- Metrics count only from session start
- Historical data from previous sessions does not affect current session risk calculations
- Session end clears in-memory session state

---

# 7. Enforcement & Verification

## 7.1 Invariant Verification Points

| Invariant Category | Verification Method |
|-------------------|---------------------|
| Trading & Risk | Trade Safety checks at execution time |
| Financial | Balance reconciliation diagnostics |
| Architectural | Code review, LSP type checking |
| AI Governance | Interface design, capability restrictions |
| Process | Phase documentation, PR review |

## 7.2 Invariant Violation Response

If an invariant violation is detected:

1. **Stop** the affected operation
2. **Log** the violation with full context
3. **Alert** via appropriate channel (console, diagnostic endpoint)
4. **Block** further operations that depend on the violated invariant
5. **Report** to user/developer for resolution

## 7.3 Invariant Evolution

Invariants may only be changed through:

1. Explicit proposal with justification
2. Review of downstream impacts
3. Update to this document FIRST
4. Implementation change SECOND
5. Verification that new invariant holds

---

# Summary

This document defines **42 invariants** across 7 categories:

| Category | Count | Purpose |
|----------|-------|---------|
| Trading & Risk | 7 | Ensure safe, consistent trading behavior |
| Financial | 7 | Guarantee accurate P/L and cost accounting |
| Architectural | 8 | Maintain clean system boundaries |
| AI Governance | 5 | Control AI agent authority |
| Process | 8 | Ensure disciplined development |
| Paper Trading | 4 | Maintain simulation integrity |
| Enforcement | 3 | Define verification and evolution |

These invariants form the **constitution** of the DawnTrader system. They are not suggestions or best practices — they are **guarantees** that the system must uphold.

---

**Document Version:** 1.0  
**Classification:** System Constitution  
**Review Cycle:** On any architectural change
