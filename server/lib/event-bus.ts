import { EventEmitter } from 'events';

/**
 * Global Event Bus for inter-service communication
 * 
 * Used for event-driven architecture across services:
 * - Introspection events (bias detection, confidence drift)
 * - Mitigation events (bias corrections applied)
 * - System events (health checks, status changes)
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    // Increase max listeners to prevent warnings for many subscribers
    this.setMaxListeners(50);
  }

  /**
   * Emit an introspection event (bias detected, drift observed, etc.)
   */
  emitIntrospectionEvent(event: {
    type: string;
    userId?: string;
    timestamp?: string;
    [key: string]: any;
  }): void {
    this.emit('introspection_event', event);
  }

  /**
   * Emit a mitigation event (correction applied, weights adjusted, etc.)
   */
  emitMitigationEvent(event: {
    type: string;
    userId?: string;
    timestamp?: string;
    [key: string]: any;
  }): void {
    this.emit('mitigation_event', event);
  }
}

// Export singleton instance
export const eventBus = new EventBus();
