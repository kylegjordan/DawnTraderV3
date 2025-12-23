import { EventEmitter } from 'events';

/**
 * Pool Broadcast Event Bus
 * 
 * Directive 8.8.4-A4.R10R-3.T5: Dynamic Pool Broadcast & Load Balancing
 * 
 * Lightweight event bus to synchronize POOL_SIZE changes across dependent services:
 * - Ready-to-Buy Service
 * - TCL Watchdog
 * - FX5 Scanner interface
 * 
 * Events:
 * - POOL_UPDATE: Emitted when ACT adjusts pool size, payload is new pool size
 */
export const poolBus = new EventEmitter();

poolBus.setMaxListeners(10);
