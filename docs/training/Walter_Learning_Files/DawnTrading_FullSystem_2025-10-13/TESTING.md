# Testing Guide

## Overview

This guide explains how to test the trading system, including unit tests with mocks and staging validation procedures.

## Mock Injection Framework (v2.1.0+)

### Dependency Injection Support

The `TradingEngine` now supports dependency injection for testing purposes. This allows you to inject mock implementations of `KrakenService`, `RiskManager`, and `StrategyEngine` to test trading logic in isolation.

### Usage

```typescript
import { TradingEngine, TradingEngineDependencies } from './server/services/trading-engine';
import { KrakenService } from './server/services/kraken';

// Create a mock KrakenService
class MockKrakenService extends KrakenService {
  constructor() {
    super(); // No API credentials needed for mock
  }

  async placeOrder(symbol: string, type: string, price: number, quantity: number): Promise<any> {
    // Return controlled test response
    if (price < 0) {
      throw new Error('INVALID_PRICE'); // Simulate exchange rejection
    }
    return { orderId: 'MOCK-123', status: 'open' };
  }

  async cancelOrder(orderId: string): Promise<any> {
    return { status: 'cancelled', orderId };
  }

  async getOrderStatus(orderId: string): Promise<any> {
    // Simulate partial fill
    return {
      orderId,
      status: 'closed',
      filledQuantity: 0.5, // 50% fill
      requestedQuantity: 1.0
    };
  }
}

// Inject mock into TradingEngine
const mockKraken = new MockKrakenService();
const dependencies: TradingEngineDependencies = {
  krakenService: mockKraken
};

const engine = new TradingEngine('user-123', undefined, undefined, dependencies);

// Test bracket rollback with forced failure
const signal = {
  symbol: 'XXBTZUSD',
  strategy: 'vwap_pullback',
  entryPrice: 50000,
  stopPrice: -100, // Invalid price triggers mock failure
  targetPrice: 51000,
  confidence: 0.85,
  metadata: {}
};

const result = await engine.processSignal(signal, 'paper');
// Assert: result should be null, no orders left on exchange
```

### Creating Test Mocks

#### Mock KrakenService

```typescript
class MockKrakenService extends KrakenService {
  private failureMode: 'none' | 'order_rejection' | 'network_error' | 'partial_fill' = 'none';
  private mockOrders: Map<string, any> = new Map();

  setFailureMode(mode: 'none' | 'order_rejection' | 'network_error' | 'partial_fill') {
    this.failureMode = mode;
  }

  async placeOrder(symbol: string, type: string, price: number, quantity: number): Promise<any> {
    if (this.failureMode === 'order_rejection') {
      throw new Error('EOrder:Insufficient margin');
    }
    if (this.failureMode === 'network_error') {
      throw new Error('ECONNRESET');
    }

    const orderId = `MOCK-${Date.now()}`;
    const order = {
      orderId,
      symbol,
      type,
      price,
      quantity,
      filledQuantity: this.failureMode === 'partial_fill' ? quantity * 0.5 : quantity,
      status: 'closed'
    };
    this.mockOrders.set(orderId, order);
    return order;
  }

  async getOrderStatus(orderId: string): Promise<any> {
    return this.mockOrders.get(orderId) || { status: 'not_found' };
  }

  async cancelOrder(orderId: string): Promise<any> {
    const order = this.mockOrders.get(orderId);
    if (order) {
      order.status = 'cancelled';
    }
    return order;
  }
}
```

### Test Example: Bracket Rollback

```typescript
import { describe, it, expect } from '@jest/globals'; // or your test framework

describe('Bracket Order Rollback', () => {
  it('should rollback all orders when stop order fails', async () => {
    const mockKraken = new MockKrakenService();
    const dependencies = { krakenService: mockKraken };
    const engine = new TradingEngine('user-123', undefined, undefined, dependencies);

    // Simulate: Entry succeeds, Target succeeds, Stop fails
    let orderCount = 0;
    mockKraken.placeOrder = async (symbol, type, price, quantity) => {
      orderCount++;
      if (type === 'stop-loss' && orderCount === 3) {
        throw new Error('EOrder:Invalid stop price');
      }
      return { orderId: `MOCK-${orderCount}`, status: 'open' };
    };

    const cancelledOrders: string[] = [];
    mockKraken.cancelOrder = async (orderId) => {
      cancelledOrders.push(orderId);
      return { status: 'cancelled', orderId };
    };

    const signal = {
      symbol: 'XXBTZUSD',
      strategy: 'vwap_pullback',
      entryPrice: 50000,
      stopPrice: 49500,
      targetPrice: 51000,
      confidence: 0.85,
      metadata: {}
    };

    const result = await engine.processSignal(signal, 'live');

    // Assertions
    expect(result).toBeNull(); // Trade should fail
    expect(cancelledOrders.length).toBe(2); // Entry and Target cancelled
    expect(cancelledOrders).toContain('MOCK-1'); // Entry order
    expect(cancelledOrders).toContain('MOCK-2'); // Target order
  });
});
```

### Test Example: Partial Fill Recovery

```typescript
describe('Partial Fill Recovery', () => {
  it('should scale stops/targets when fill is below threshold', async () => {
    const mockKraken = new MockKrakenService();
    mockKraken.setFailureMode('partial_fill'); // 50% fill
    
    const dependencies = { krakenService: mockKraken };
    const engine = new TradingEngine('user-123', undefined, undefined, dependencies);

    const signal = {
      symbol: 'XXBTZUSD',
      strategy: 'abcd_long',
      entryPrice: 50000,
      stopPrice: 49500,
      targetPrice: 51000,
      confidence: 0.85,
      metadata: {}
    };

    const trade = await engine.processSignal(signal, 'live');

    // Assertions
    expect(trade).not.toBeNull();
    expect(trade?.metadata?.partialFillDetected).toBe(true);
    expect(trade?.metadata?.partialFillAction).toBe('SCALE');
    expect(trade?.quantity).toBeLessThan(1.0); // Original quantity reduced
  });
});
```

## Automated Test Suites

### Running Tests

```bash
# Phase 1: Bracket Order Rollback
NODE_ENV=development tsx server/test-resilience-phase1.ts

# Phase 2: Partial Fill Recovery
NODE_ENV=development tsx server/test-resilience-phase2.ts

# Phases 3-6: Comprehensive Resilience
NODE_ENV=development tsx server/test-resilience-phases3-6.ts
```

### Current Test Coverage

- **Phase 1**: 3 tests (logic verification, requires mock injection for full coverage)
- **Phase 2**: 6 tests (configuration, detection, recovery modes)
- **Phases 3-6**: 11 tests (constraints, rate limiting, retries, circuit breaker)
- **Total**: 20/20 tests passing

### Known Testing Gaps

See `EXECUTION_RESILIENCE_REPORT.md` section "Known Testing Gaps" for detailed information on automated test limitations and staging validation requirements.

## Staging Validation

Before production deployment, manual staging tests must be conducted. See `STAGING_TEST_PLAN.md` for detailed procedures.

### Required Environment

- Kraken test/sandbox API credentials
- Separate staging database
- Reduced position sizes ($10-50)
- Comprehensive logging enabled

## Future Enhancements

1. **Jest/Vitest Integration**: Add proper test runner with assertions
2. **Coverage Reports**: Track code coverage across all modules
3. **CI/CD Integration**: Automated test runs on commits
4. **Deterministic Mocks**: Complete mock implementations for all services
5. **Integration Test Suite**: End-to-end tests with test database
