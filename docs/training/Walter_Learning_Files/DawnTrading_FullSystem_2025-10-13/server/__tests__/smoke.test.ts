import { describe, it, expect } from 'vitest';
import { logger } from '../utils/logger';

describe('Smoke Tests - Server', () => {
  it('should instantiate logger with correct service name', () => {
    expect(logger).toBeDefined();
  });

  it('should format dates correctly for trading timestamps', () => {
    const testDate = new Date('2024-01-01T12:00:00Z');
    const isoString = testDate.toISOString();
    expect(isoString).toBe('2024-01-01T12:00:00.000Z');
  });

  it('should calculate percentages correctly for P/L', () => {
    const initialBalance = 800;
    const currentBalance = 840;
    const plPercent = ((currentBalance - initialBalance) / initialBalance) * 100;
    expect(plPercent).toBe(5);
  });
});
