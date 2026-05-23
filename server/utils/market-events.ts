/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4H.5 Task 3 — Market Event Intelligence
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Generates system events when Global Regime or Global Friction shifts categories.
 * Events are displayed in the Trading & Market Events tab in the UI.
 * Events persist for 7 days via file-based storage.
 * 
 * Event Types:
 * - REGIME_TRANSITION: Global regime changed (e.g., Bull Stable → Low Vol Chop)
 * - FRICTION_TRANSITION: Global friction band changed (e.g., Moderate → High Liquidity)
 * 
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { MarketRegime } from '../services/market-indicators.js';
import * as fs from 'fs';
import * as path from 'path';

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

interface PersistedMarketEvent {
  id: string;
  type: 'REGIME_TRANSITION' | 'FRICTION_TRANSITION' | 'SYSTEM_ALERT';
  message: string;
  explanation: string;
  previousValue?: string;
  newValue?: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
}

const MAX_EVENTS = 500;
const RETENTION_DAYS = 7;
const EVENTS_DIR = path.join(process.cwd(), 'logs', 'market_events');
const EVENTS_FILE = path.join(EVENTS_DIR, 'events.json');

let events: MarketEvent[] = [];
let eventIdCounter = 0;

let lastRegime: MarketRegime | null = null;
let lastFrictionBand: string | null = null;

const REGIME_DISPLAY_NAMES: Record<string, string> = {
  // Phase 14 canonical regime names
  TREND_FRIENDLY_STABLE: 'Trend-Friendly Stable',
  HIGH_VOLATILITY_UNSTABLE: 'High-Volatility Unstable',
  RANGE_BOUND_STABLE: 'Range-Bound Stable',
  IMPULSE_EXPANSION: 'Impulse Expansion',
  STRUCTURAL_TRANSITION: 'Structural Transition',
  // Legacy names (backward compat for stored events)
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

const FRICTION_BAND_ORDER = [
  'High Liquidity / Low Cost',   // best
  'Moderate Liquidity',
  'Low Liquidity / High Cost'    // worst
];

function ensureEventsDir(): void {
  if (!fs.existsSync(EVENTS_DIR)) {
    fs.mkdirSync(EVENTS_DIR, { recursive: true });
  }
}

function loadEventsFromFile(): void {
  try {
    ensureEventsDir();
    
    if (!fs.existsSync(EVENTS_FILE)) {
      events = [];
      return;
    }
    
    const data = fs.readFileSync(EVENTS_FILE, 'utf-8');
    const parsed: PersistedMarketEvent[] = JSON.parse(data);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    
    events = parsed
      .map(e => ({
        ...e,
        timestamp: new Date(e.timestamp),
      }))
      .filter(e => e.timestamp >= cutoffDate);
    
    if (events.length !== parsed.length) {
      saveEventsToFile();
      console.log(`[11.4H.5][MarketEvent] Pruned ${parsed.length - events.length} events older than ${RETENTION_DAYS} days`);
    }
    
    if (events.length > 0) {
      const lastEvent = events[events.length - 1];
      const match = lastEvent.id.match(/_(\d+)$/);
      if (match) {
        eventIdCounter = parseInt(match[1], 10);
      }
      
      const lastRegimeEvent = events.find(e => e.type === 'REGIME_TRANSITION' && e.newValue);
      if (lastRegimeEvent && lastRegimeEvent.newValue) {
        lastRegime = lastRegimeEvent.newValue as MarketRegime;
      }
      
      const lastFrictionEvent = events.find(e => e.type === 'FRICTION_TRANSITION' && e.newValue);
      if (lastFrictionEvent && lastFrictionEvent.newValue) {
        lastFrictionBand = lastFrictionEvent.newValue;
      }
    }
    
    console.log(`[11.4H.5][MarketEvent] Loaded ${events.length} events from disk (7-day retention)`);
  } catch (error: any) {
    console.error('[11.4H.5][MarketEvent] Error loading events:', error.message);
    events = [];
  }
}

function saveEventsToFile(): void {
  try {
    ensureEventsDir();
    
    const toSave: PersistedMarketEvent[] = events.map(e => ({
      ...e,
      timestamp: e.timestamp.toISOString(),
    }));
    
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
  } catch (error: any) {
    console.error('[11.4H.5][MarketEvent] Error saving events:', error.message);
  }
}

loadEventsFromFile();

function generateEventId(): string {
  return `mkt_evt_${Date.now()}_${++eventIdCounter}`;
}

function explainRegimeChange(prev: string, next: string): string {
  const prevDisplay = REGIME_DISPLAY_NAMES[prev] || prev;
  const nextDisplay = REGIME_DISPLAY_NAMES[next] || next;
  
  const isBullish = (regime: string) => regime.includes('BULL') || regime.includes('TREND_FRIENDLY');
  const isBearish = (regime: string) => regime.includes('BEAR') || regime.includes('HIGH_VOLATILITY_UNSTABLE');
  const isChoppy = (regime: string) => regime.includes('CHOP') || regime.includes('NOISE') || regime.includes('RANGE_BOUND');
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
  
  saveEventsToFile();
  
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
      // B-NEW-43 chunk 8 (2026-05-23): the prior `newRegime === 'EXTREME_NOISE'`
      // ternary was always-false (TS2367) — EXTREME_NOISE is a vol-noise veto
      // state, NOT a member of CanonicalRegimeType, so a regime-transition event
      // can structurally never report EXTREME_NOISE. The behavior collapses to
      // always-'info' (which is what the runtime already produced). If/when
      // EXTREME_NOISE warning surfacing is wanted, the signal has to come from
      // the veto path, not the regime path — Phase 19 territory.
      severity: 'info',
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
  saveEventsToFile();
  console.log('[11.4H.5][MarketEvent] Events cleared');
}

export function getLastKnownState(): { regime: MarketRegime | null; frictionBand: string | null } {
  return { regime: lastRegime, frictionBand: lastFrictionBand };
}

// ══════════════════════════════════════════════════════════════════════════════
// Directive 11.4H.5-Fix: Background Market Event Scheduler
// ══════════════════════════════════════════════════════════════════════════════
// 
// Problem: Market events were only logged when UI called /api/market-indicators
// Solution: 
//   1. Initialize lastRegime/lastFrictionBand on startup (no event emitted)
//   2. Subscribe to CentralClockService for periodic checks (every 30 ticks = 30s)
//   3. Ensure events.json is created and persisted
// 
// ══════════════════════════════════════════════════════════════════════════════

let isSchedulerInitialized = false;
let ticksSinceLastCheck = 0;
const CHECK_INTERVAL_TICKS = 30; // Check every 30 seconds (30 x 1s ticks)

/**
 * Initialize market state on startup WITHOUT emitting events.
 * This ensures the first actual regime/friction change is logged.
 */
export async function initializeMarketState(): Promise<void> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getMarketIndicators } = await import('../services/market-indicators.js');
    const indicators = getMarketIndicators();
    
    // Initialize lastRegime and lastFrictionBand without triggering events
    // We set these directly rather than calling checkRegimeTransition/checkFrictionTransition
    // to avoid logging a "transition" on startup
    if (lastRegime === null) {
      lastRegime = indicators.marketRegime;
      console.log(`[11.4H.5][Init] Initialized lastRegime: ${lastRegime}`);
    }
    
    if (lastFrictionBand === null && indicators.frictionDescription?.status) {
      lastFrictionBand = indicators.frictionDescription.status;
      console.log(`[11.4H.5][Init] Initialized lastFrictionBand: ${lastFrictionBand}`);
    }
    
    // Ensure events file exists
    ensureEventsDir();
    if (!fs.existsSync(EVENTS_FILE)) {
      fs.writeFileSync(EVENTS_FILE, '[]', 'utf-8');
      console.log(`[11.4H.5][Init] Created empty events file: ${EVENTS_FILE}`);
    }
    
    console.log(`[11.4H.5][Init] ✅ Market state initialized - regime=${lastRegime}, friction=${lastFrictionBand}`);
  } catch (error: any) {
    console.error('[11.4H.5][Init] Error initializing market state:', error.message);
  }
}

/**
 * Periodic check for regime/friction transitions.
 * Called by CentralClockService subscriber.
 */
async function checkMarketTransitionsInternal(): Promise<void> {
  try {
    const { getMarketIndicators } = await import('../services/market-indicators.js');
    
    // This call will trigger checkRegimeTransition and checkFrictionTransition
    // which compare against lastRegime/lastFrictionBand and log if changed
    const indicators = getMarketIndicators();
    
    // Log only on significant tick intervals for debugging
    if (ticksSinceLastCheck === 0) {
      console.log(`[11.4H.5][Scheduler] Checked: regime=${indicators.marketRegime}, friction=${indicators.frictionDescription?.status || 'unknown'}`);
    }
  } catch (error: any) {
    console.error('[11.4H.5][Scheduler] Error checking transitions:', error.message);
  }
}

/**
 * Start the market event scheduler by subscribing to CentralClockService.
 * Runs every 30 ticks (30 seconds).
 */
export async function startMarketEventScheduler(): Promise<void> {
  if (isSchedulerInitialized) {
    console.log('[11.4H.5][Scheduler] Already initialized');
    return;
  }
  
  try {
    // Initialize market state first (no events emitted)
    await initializeMarketState();
    
    // Subscribe to CentralClockService
    const { centralClock } = await import('../services/central-clock.js');
    
    centralClock.subscribe('MarketEventScheduler', (tick) => {
      ticksSinceLastCheck++;
      
      // Check every 30 ticks (30 seconds)
      if (ticksSinceLastCheck >= CHECK_INTERVAL_TICKS) {
        ticksSinceLastCheck = 0;
        checkMarketTransitionsInternal();
      }
    });
    
    isSchedulerInitialized = true;
    console.log(`[11.4H.5][Scheduler] ✅ Started - checking every ${CHECK_INTERVAL_TICKS}s via CentralClock`);
  } catch (error: any) {
    console.error('[11.4H.5][Scheduler] Error starting scheduler:', error.message);
  }
}

/**
 * Stop the market event scheduler.
 */
export async function stopMarketEventScheduler(): Promise<void> {
  if (!isSchedulerInitialized) {
    return;
  }
  
  try {
    const { centralClock } = await import('../services/central-clock.js');
    centralClock.unsubscribe('MarketEventScheduler');
    isSchedulerInitialized = false;
    console.log('[11.4H.5][Scheduler] Stopped');
  } catch (error: any) {
    console.error('[11.4H.5][Scheduler] Error stopping:', error.message);
  }
}

export function isMarketEventSchedulerRunning(): boolean {
  return isSchedulerInitialized;
}
