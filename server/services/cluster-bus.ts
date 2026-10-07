import { type BusEventTopic } from "@shared/schema";
import { EventEmitter } from "events";

/**
 * Phase 17.0: ClusterBus — in-memory pub/sub for cluster coordination.
 *
 * B-CLUSTER-BUS-PERSIST-DISPOSITION (#1159, row 2a0c): IN-MEMORY ONLY. The persist branch (a write of seven
 * "audit" topics to `cluster_bus_event`) is removed with the table: zero readers, and ~99.99 % of its rows —
 * of the ACCUMULATED table (269,733 of 269,744 rows on staging, 2026-10-07 — a share of rows, not a rate; the heartbeat wrote ~2,880 a day until B-ENGINE-HEARTBEAT-DEAD-PATHS deployed) — were
 * the deleted engine heartbeat's. The live engine traffic never entered `publish()` anyway — it uses the raw
 * emitter with off-enum topics (`trading-state-sync.ts` `emit('engine_state_changed')` → the feed-integrity job's
 * `on(...)`), which is untouched. Whether the Phase 17-22 layer that still calls `publish()` should exist at all
 * is `#1163` (row 2a0e).
 */
export class ClusterBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Allow many subscribers
  }

  /**
   * Publish an event to in-memory subscribers. Async for its existing callers' `await`; it does no I/O.
   */
  async publish(
    topic: BusEventTopic,
    payload: Record<string, any>,
    sourceNode?: string
  ): Promise<void> {
    this.emit(topic, payload, sourceNode);
  }

  /**
   * Subscribe to a topic
   */
  subscribe(topic: BusEventTopic, handler: (payload: Record<string, any>, sourceNode?: string) => void): void {
    this.on(topic, handler);
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe(topic: BusEventTopic, handler: (payload: Record<string, any>, sourceNode?: string) => void): void {
    this.off(topic, handler);
  }
}

// Singleton instance
export const clusterBus = new ClusterBus();
