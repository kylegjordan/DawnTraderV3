import { db } from "../db";
import {
  clusterBusEvent,
  type InsertClusterBusEvent,
  type ClusterBusEvent,
  type BusEventTopic,
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { EventEmitter } from "events";

/**
 * Phase 17.0: ClusterBus
 * 
 * Lightweight pub/sub for cluster coordination
 * - In-memory event emitter for speed
 * - Persists critical events to database for audit
 */
export class ClusterBus extends EventEmitter {
  private readonly persistTopics: Set<BusEventTopic> = new Set([
    "node_status_change",
    "rebalance_triggered",
    "circuit_breaker",
    "health_alert",
    "learning_delta", // Phase 18: Multi-domain learning
    "model_sync", // Phase 18: Model synchronization
    "task_completed", // Phase 22: Autonomous execution audit trail
  ]);

  constructor() {
    super();
    this.setMaxListeners(100); // Allow many subscribers
  }

  /**
   * Publish an event to the bus
   */
  async publish(
    topic: BusEventTopic,
    payload: Record<string, any>,
    sourceNode?: string
  ): Promise<void> {
    // Emit to in-memory subscribers immediately
    this.emit(topic, payload, sourceNode);

    // Persist critical events to database for audit
    if (this.persistTopics.has(topic)) {
      try {
        await db.insert(clusterBusEvent).values({
          topic,
          sourceNode: sourceNode || "unknown",
          payload,
          metadata: {
            publishedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error("[ClusterBus] Failed to persist event:", error);
      }
    }
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

  // B-ENGINE-HEARTBEAT-DEAD-PATHS (rule 18): getRecentEvents() and cleanup(olderThanHours) DELETED — zero callers
  // each. cluster_bus_event retention is owned by b75-retention-sweep.ts (PLAIN_RETENTION_TABLES,
  // data_lifecycle / cluster_bus_event.hot_retention_days) — one retention path, not two.
}

// Singleton instance
export const clusterBus = new ClusterBus();
