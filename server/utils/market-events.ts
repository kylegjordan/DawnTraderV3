/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4H.5 Task 3 — Market Event Intelligence
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Generates system events when Global Regime or Global Friction shifts categories.
 * Events are displayed in the Trading & Market Events tab in the UI.
 * 
 * Event Types:
 * - REGIME_TRANSITION: Global regime changed (e.g., Bull Stable → Low Vol Chop)
 * - FRICTION_TRANSITION: Global friction band changed (e.g., Moderate → High Liquidity)
 * 
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { MarketRegime } from '../services/dynamic-strategy-selector.js';

export interface MarketEvent {
  id: string;
  type: 'REGIME_TRANSITION' | 'FRICTION_TRANSITION' | 'SYSTEM_ALERT';
  message: string;
  explanation: string;
  previousValue?: string;
  newValue?: string;
  timestamp: Date;
  severity: 'info' | 'warning' | 'critical';
}

const MAX_EVENTS = 100;
const events: MarketEvent[] = [];
let eventIdCounter = 0;

let lastRegime: MarketRegime | null = null;
let lastFrictionBand: string | null = null;

const REGIME_DISPLAY_NAMES: Record<string, string> = {
  BULL_STABLE: 'Bull Stable',
  BULL_VOLATILE: 'Bull Volatile',
  BEAR_STABLE: 'Bear Stable',
  BEAR_VOLATILE: 'Bear Volatile',
  LOW_VOL_CHOP: 'Low Volatility Chop',
  HIGH_VOL_CHOP: 'High Volatility Chop',
  HIGH_VOL_IMPULSE: 'High Volatility Impulse',
  MIXED_TRANSITION: 'Mixed Transition',
  TRANSITION: 'Transition',
  EXTREME_NOISE: 'Extreme Noise',
};

const FRICTION_BAND_ORDER = ['High Liquidity', 'Moderate Liquidity', 'Limited Liquidity', 'Low Liquidity'];

function generateEventId(): string {
  return `mkt_evt_${Date.now()}_${++eventIdCounter}`;
}

function explainRegimeChange(prev: string, next: string): string {
  const prevDisplay = REGIME_DISPLAY_NAMES[prev] || prev;
  const nextDisplay = REGIME_DISPLAY_NAMES[next] || next;
  
  const isBullish = (regime: string) => regime.includes('BULL');
  const isBearish = (regime: string) => regime.includes('BEAR');
  const isChoppy = (regime: string) => regime.includes('CHOP') || regime.includes('NOISE');
  const isTransition = (regime: string) => regime.includes('TRANSITION');
  
  if (isBullish(prev) && isBearish(next)) {
    return `Market sentiment has shifted from bullish to bearish. Consider reducing exposure and tightening stops. Long-only strategies will be more selective.`;
  }
  if (isBearish(prev) && isBullish(next)) {
    return `Market sentiment has improved from bearish to bullish. Trend-following and momentum strategies may perform better. Consider increasing position sizes.`;
  }
  if (isChoppy(next)) {
    return `Market has entered a choppy phase with unclear direction. Range-based strategies and smaller positions are recommended. Avoid chasing breakouts.`;
  }
  if (isTransition(next)) {
    return `Market is transitioning between regimes. Conditions are uncertain - the system will be more selective until a clear trend emerges.`;
  }
  if (next === 'EXTREME_NOISE') {
    return `Market conditions are extremely noisy and unpredictable. Capital preservation mode is recommended - avoid new entries until conditions stabilize.`;
  }
  
  return `Market regime changed from ${prevDisplay} to ${nextDisplay}. Strategy selection and position sizing will adjust accordingly.`;
}

function explainFrictionChange(prev: string, next: string): string {
  const prevIndex = FRICTION_BAND_ORDER.indexOf(prev);
  const nextIndex = FRICTION_BAND_ORDER.indexOf(next);
  
  if (nextIndex > prevIndex) {
    return `Trading costs have increased and liquidity has decreased. Expect wider spreads and more slippage. The system will favor larger, more liquid pairs.`;
  }
  if (nextIndex < prevIndex) {
    return `Trading conditions have improved with better liquidity. Spreads are tighter and execution costs are lower. More pairs may become eligible for trading.`;
  }
  
  return `Market friction has shifted from ${prev} to ${next}. Execution quality and cost assumptions have been updated.`;
}

export function logMarketEvent(event: Omit<MarketEvent, 'id' | 'timestamp'>): void {
  const newEvent: MarketEvent = {
    ...event,
    id: generateEventId(),
    timestamp: new Date(),
  };
  
  events.unshift(newEvent);
  
  if (events.length > MAX_EVENTS) {
    events.length = MAX_EVENTS;
  }
  
  console.log(`[11.4H.5][MarketEvent] ${event.type}: ${event.message}`);
}

export function checkRegimeTransition(newRegime: MarketRegime): void {
  if (lastRegime !== null && lastRegime !== newRegime) {
    logMarketEvent({
      type: 'REGIME_TRANSITION',
      message: `Global regime changed from ${REGIME_DISPLAY_NAMES[lastRegime] || lastRegime} to ${REGIME_DISPLAY_NAMES[newRegime] || newRegime}`,
      explanation: explainRegimeChange(lastRegime, newRegime),
      previousValue: lastRegime,
      newValue: newRegime,
      severity: newRegime === 'EXTREME_NOISE' ? 'warning' : 'info',
    });
  }
  lastRegime = newRegime;
}

export function checkFrictionTransition(newFrictionBand: string): void {
  if (lastFrictionBand !== null && lastFrictionBand !== newFrictionBand) {
    const isWorsening = FRICTION_BAND_ORDER.indexOf(newFrictionBand) > FRICTION_BAND_ORDER.indexOf(lastFrictionBand);
    
    logMarketEvent({
      type: 'FRICTION_TRANSITION',
      message: `Global friction moved from ${lastFrictionBand} to ${newFrictionBand}`,
      explanation: explainFrictionChange(lastFrictionBand, newFrictionBand),
      previousValue: lastFrictionBand,
      newValue: newFrictionBand,
      severity: isWorsening ? 'warning' : 'info',
    });
  }
  lastFrictionBand = newFrictionBand;
}

export function getMarketEvents(limit: number = 50): MarketEvent[] {
  return events.slice(0, limit);
}

export function clearMarketEvents(): void {
  events.length = 0;
  lastRegime = null;
  lastFrictionBand = null;
  console.log('[11.4H.5][MarketEvent] Events cleared');
}

export function getLastKnownState(): { regime: MarketRegime | null; frictionBand: string | null } {
  return { regime: lastRegime, frictionBand: lastFrictionBand };
}
