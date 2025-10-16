# Event Broker Integration Guide
## Phase 8.6.1 - Unified Conversational Walter

### Overview
The Event Broker routes ALL execution events through the Cognitive Interpreter to ensure 100% conversational output. No raw data reaches Walter or users without natural language interpretation.

### Architecture Flow
```
Execution Core (TradingEngine, RiskManager, etc.)
    ↓
Event Broker (event-broker.ts)
    ↓
Cognitive Interpreter (cognitive-interpreter.ts)
    ↓
Natural Language Narrative
    ↓
Walter Memory + WebSocket Events + UI
```

### Integration Examples

#### 1. Trading Engine - Trade Execution
```typescript
// server/services/trading-engine.ts
import { eventBroker } from './event-broker';

async executeTrade(signal: TradeSignal, mode: 'live' | 'paper'): Promise<Trade> {
  // ... execute trade logic ...
  
  // Route through Event Broker for conversational output
  const interpretation = await eventBroker.emitTradeEvent(
    this.userId,
    mode,
    {
      symbol: trade.symbol,
      side: 'buy', // or 'sell' based on trade direction
      amount: positionValue, // Total dollar amount
      price: trade.entryPrice, // Entry price per unit
      strategy: trade.strategy,
      quantity: trade.quantity, // Optional: units purchased
      stopPrice: trade.stopPrice, // Optional: stop loss level
      targetPrice: trade.targetPrice, // Optional: profit target
      tradeType: 'entry' // Optional: entry|exit|stop_hit|target_hit
    },
    {
      portfolioBalance: currentBalance,
      activeStrategies: enabledStrategies
    }
  );
  
  // Interpretation is now stored in Walter's memory and emitted via WebSocket
  console.log(`Trade narrative: ${interpretation.narrative}`);
  
  return trade;
}
```

#### 2. Risk Manager - Kill Switch Trigger
```typescript
// server/services/risk-manager.ts
import { eventBroker } from './event-broker';

async triggerKillSwitch(userId: string, reason: string): Promise<void> {
  // ... close positions and suspend trading ...
  
  // Route through Event Broker
  await eventBroker.emitAnomaly(
    userId,
    mode,
    {
      anomalyType: 'kill_switch_triggered',
      severity: 'critical',
      description: reason,
      affectedComponent: 'risk_manager'
    },
    {
      portfolioBalance: currentBalance,
      dailyPL: pl24h,
      lossPercent: lossPercent
    }
  );
}
```

#### 3. Portfolio Updates - Balance Changes
```typescript
// server/services/portfolio-aggregator.ts
import { eventBroker } from './event-broker';

async updateBalance(userId: string, mode: 'live' | 'paper', newBalance: number): Promise<void> {
  const oldBalance = await this.getCurrentBalance(userId, mode);
  const changeAmount = newBalance - oldBalance;
  const changePercent = (changeAmount / oldBalance) * 100;
  
  // Route through Event Broker
  await eventBroker.emitBalanceUpdate(
    userId,
    mode,
    {
      newBalance,
      oldBalance,
      changeAmount,
      changePercent,
      reason: 'portfolio_sync'
    },
    {
      portfolioBalance: newBalance,
      activeStrategies: await this.getActiveStrategies(userId, mode)
    }
  );
}
```

#### 4. Strategy Engine - Signal Generation
```typescript
// server/services/strategy-engine.ts
import { eventBroker } from './event-broker';

async generateSignal(symbol: string, strategy: string): Promise<TradeSignal | null> {
  const signal = await this.analyzeStrategy(symbol, strategy);
  
  if (signal) {
    // Route through Event Broker
    await eventBroker.emitStrategySignal(
      this.userId,
      this.mode,
      {
        strategy: signal.strategy,
        signal: 'buy',
        symbol: signal.symbol,
        confidence: signal.confidence,
        reason: `Entry at $${signal.entryPrice}, target $${signal.targetPrice}`
      },
      {
        portfolioBalance: await this.getBalance(),
        activeStrategies: [strategy]
      }
    );
  }
  
  return signal;
}
```

#### 5. System Health Monitor - Status Updates
```typescript
// server/services/system-health-monitor.ts
import { eventBroker } from './event-broker';

async checkSystemHealth(): Promise<void> {
  const health = await this.getMetrics();
  
  if (health.riskLevel === 'high') {
    // Route through Event Broker
    await eventBroker.emitRiskReport(
      'default-user',
      'paper',
      {
        riskLevel: 'high',
        exposurePercent: health.exposurePercent,
        activeTrades: health.activeTrades,
        dailyPL: health.dailyPL,
        recommendation: 'Consider reducing exposure'
      }
    );
  }
}
```

### WebSocket Event Handling
```typescript
// server/routes.ts
import { eventBroker } from './services/event-broker';

// Listen for interpreted events
eventBroker.on('interpretedEvent', (data) => {
  // Broadcast to all connected clients
  wsServer.broadcast({
    type: 'execution_event',
    mode: data.mode,
    narrative: data.interpretation.narrative,
    significance: data.interpretation.significance,
    timestamp: data.timestamp
  });
});
```

### Walter Response Integration
Walter automatically has access to interpreted events through:
1. **Memory Injection**: Event Broker stores narratives in Walter's semantic memory
2. **Context Refresh**: interpretations are included in Walter's rehydration
3. **Direct Query**: Walter can ask "what recent events happened?" and get conversational summaries

### Benefits
- ✅ 100% conversational output - no raw data exposed to users
- ✅ Consistent narrative style across all event types
- ✅ Adaptive depth based on event significance
- ✅ Learning fragments automatically stored for analysis
- ✅ Walter has full context in natural language
- ✅ WebSocket events are human-readable
- ✅ Provenance tracking for data integrity

### Migration Checklist
- [ ] Import eventBroker in execution services
- [ ] Replace direct logging with eventBroker.emit* calls
- [ ] Add metadata (balance, strategies) to event payloads
- [ ] Remove raw data from WebSocket broadcasts
- [ ] Test that Walter receives conversational context
- [ ] Verify learning fragments are being stored
