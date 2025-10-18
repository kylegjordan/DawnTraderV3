import { db } from "../db";
import {
  clusterCircuitBreaker,
  clusterNode,
  type CircuitBreakerState,
  type InsertClusterCircuitBreaker,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { clusterBus } from "./cluster-bus";

/**
 * Phase 17.5: Circuit Breaker Service
 * 
 * Implements circuit breaker pattern for fault tolerance:
 * - CLOSED: Normal operation, failures tracked
 * - OPEN: Too many failures, requests blocked
 * - HALF_OPEN: Testing recovery, limited requests allowed
 * 
 * Features:
 * - Exponential backoff with jitter
 * - Automatic state transitions
 * - Failure threshold monitoring
 * - Auto-recovery on success
 */
export class CircuitBreaker {
  // Thresholds
  private readonly failureThreshold = 5; // Failures before opening
  private readonly successThreshold = 3; // Successes to close from half-open
  private readonly baseRetryDelayMs = 5000; // 5 seconds
  private readonly maxRetryDelayMs = 300000; // 5 minutes
  private readonly halfOpenMaxAttempts = 3;

  /**
   * Record a successful operation
   */
  async recordSuccess(nodeId: string): Promise<void> {
    const breakers = await db
      .select()
      .from(clusterCircuitBreaker)
      .where(eq(clusterCircuitBreaker.nodeId, nodeId))
      .limit(1);

    const now = new Date();

    if (breakers.length === 0) {
      // Create new breaker in CLOSED state
      await db.insert(clusterCircuitBreaker).values({
        nodeId,
        state: "closed",
        successCount: 1,
        failureCount: 0,
        lastSuccessAt: now,
      });
      return;
    }

    const breaker = breakers[0];
    const successCount = breaker.successCount + 1;

    // State transitions based on success
    if (breaker.state === "half_open") {
      if (successCount >= this.successThreshold) {
        // Transition to CLOSED - circuit recovered
        await this.transitionState(nodeId, "closed", "Recovered after successful health checks");
        console.log(`[CircuitBreaker] Node ${nodeId} recovered - HALF_OPEN → CLOSED`);
      } else {
        // Still testing, increment success counter
        await db
          .update(clusterCircuitBreaker)
          .set({
            successCount,
            lastSuccessAt: now,
            updatedAt: now,
          })
          .where(eq(clusterCircuitBreaker.nodeId, nodeId));
      }
    } else if (breaker.state === "closed") {
      // Normal operation, track success and reset failure count
      await db
        .update(clusterCircuitBreaker)
        .set({
          successCount,
          failureCount: 0,
          lastSuccessAt: now,
          updatedAt: now,
        })
        .where(eq(clusterCircuitBreaker.nodeId, nodeId));
    }
  }

  /**
   * Record a failed operation
   */
  async recordFailure(nodeId: string, errorMessage?: string): Promise<void> {
    const breakers = await db
      .select()
      .from(clusterCircuitBreaker)
      .where(eq(clusterCircuitBreaker.nodeId, nodeId))
      .limit(1);

    const now = new Date();

    if (breakers.length === 0) {
      // Create new breaker with initial failure
      await db.insert(clusterCircuitBreaker).values({
        nodeId,
        state: "closed",
        successCount: 0,
        failureCount: 1,
        lastFailureAt: now,
        metadata: { lastError: errorMessage },
      });
      return;
    }

    const breaker = breakers[0];
    const failureCount = breaker.failureCount + 1;

    // State transitions based on failure
    if (breaker.state === "closed") {
      if (failureCount >= this.failureThreshold) {
        // Too many failures - transition to OPEN
        const retryDelay = this.calculateBackoff(0); // First backoff
        const nextRetryAt = new Date(Date.now() + retryDelay);

        await this.transitionState(
          nodeId,
          "open",
          `Threshold exceeded (${failureCount}/${this.failureThreshold} failures)`,
          nextRetryAt
        );

        console.log(`[CircuitBreaker] Node ${nodeId} circuit OPENED - too many failures`);
      } else {
        // Track failure but stay closed
        await db
          .update(clusterCircuitBreaker)
          .set({
            failureCount,
            lastFailureAt: now,
            updatedAt: now,
            metadata: { lastError: errorMessage },
          })
          .where(eq(clusterCircuitBreaker.nodeId, nodeId));
      }
    } else if (breaker.state === "half_open") {
      // Failed during recovery - revert to OPEN
      const retryCount = (breaker.metadata as any)?.retryCount || 0;
      const retryDelay = this.calculateBackoff(retryCount + 1);
      const nextRetryAt = new Date(Date.now() + retryDelay);

      await this.transitionState(
        nodeId,
        "open",
        "Failed during recovery test",
        nextRetryAt,
        retryCount + 1
      );

      console.log(`[CircuitBreaker] Node ${nodeId} recovery failed - HALF_OPEN → OPEN`);
    }
  }

  /**
   * Check if a node is currently allowed to process requests
   */
  async canProcessRequest(nodeId: string): Promise<{
    allowed: boolean;
    state: CircuitBreakerState;
    reason?: string;
  }> {
    const breakers = await db
      .select()
      .from(clusterCircuitBreaker)
      .where(eq(clusterCircuitBreaker.nodeId, nodeId))
      .limit(1);

    if (breakers.length === 0) {
      // No breaker exists - allow request (will create on first success/failure)
      return { allowed: true, state: "closed" };
    }

    const breaker = breakers[0];
    const now = new Date();

    if (breaker.state === "closed") {
      return { allowed: true, state: "closed" };
    }

    if (breaker.state === "open") {
      // Check if retry window has passed
      if (breaker.nextRetryAt && now >= breaker.nextRetryAt) {
        // Transition to HALF_OPEN for testing
        await this.transitionState(nodeId, "half_open", "Retry window elapsed, testing recovery");
        console.log(`[CircuitBreaker] Node ${nodeId} entering recovery mode - OPEN → HALF_OPEN`);
        return { allowed: true, state: "half_open" };
      }

      // Still in backoff period
      return {
        allowed: false,
        state: "open",
        reason: `Circuit open, retry at ${breaker.nextRetryAt?.toISOString()}`,
      };
    }

    if (breaker.state === "half_open") {
      // Limited requests allowed during testing
      return { allowed: true, state: "half_open" };
    }

    return { allowed: false, state: breaker.state };
  }

  /**
   * Calculate exponential backoff with jitter
   */
  private calculateBackoff(retryCount: number): number {
    const exponentialDelay = Math.min(
      this.baseRetryDelayMs * Math.pow(2, retryCount),
      this.maxRetryDelayMs
    );

    // Add jitter (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5) * 2;
    return Math.floor(exponentialDelay + jitter);
  }

  /**
   * Transition circuit breaker state
   */
  private async transitionState(
    nodeId: string,
    newState: CircuitBreakerState,
    reason: string,
    nextRetryAt?: Date,
    retryCount: number = 0
  ): Promise<void> {
    const now = new Date();

    await db
      .update(clusterCircuitBreaker)
      .set({
        state: newState,
        stateChangedAt: now,
        successCount: newState === "closed" ? 0 : undefined,
        failureCount: newState === "closed" ? 0 : undefined,
        nextRetryAt: nextRetryAt || null,
        updatedAt: now,
        metadata: {
          transitionReason: reason,
          retryCount,
          timestamp: now.toISOString(),
        },
      })
      .where(eq(clusterCircuitBreaker.nodeId, nodeId));

    // Publish state change event
    await clusterBus.publish("circuit_breaker", {
      nodeId,
      state: newState,
      reason,
      nextRetryAt: nextRetryAt?.toISOString(),
    });
  }

  /**
   * Get circuit breaker status for a node
   */
  async getStatus(nodeId: string): Promise<{
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    nextRetryAt?: Date | null;
    lastFailureAt?: Date | null;
    lastSuccessAt?: Date | null;
  } | null> {
    const breakers = await db
      .select()
      .from(clusterCircuitBreaker)
      .where(eq(clusterCircuitBreaker.nodeId, nodeId))
      .limit(1);

    if (breakers.length === 0) {
      return null;
    }

    const breaker = breakers[0];
    return {
      state: breaker.state,
      failureCount: breaker.failureCount,
      successCount: breaker.successCount,
      nextRetryAt: breaker.nextRetryAt,
      lastFailureAt: breaker.lastFailureAt,
      lastSuccessAt: breaker.lastSuccessAt,
    };
  }

  /**
   * Get all circuit breaker statuses
   */
  async getAllStatuses(): Promise<Array<{
    nodeId: string;
    nodeName: string;
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    nextRetryAt?: Date | null;
  }>> {
    const breakers = await db
      .select({
        nodeId: clusterCircuitBreaker.nodeId,
        nodeName: clusterNode.name,
        state: clusterCircuitBreaker.state,
        failureCount: clusterCircuitBreaker.failureCount,
        successCount: clusterCircuitBreaker.successCount,
        nextRetryAt: clusterCircuitBreaker.nextRetryAt,
      })
      .from(clusterCircuitBreaker)
      .innerJoin(clusterNode, eq(clusterCircuitBreaker.nodeId, clusterNode.id));

    return breakers;
  }

  /**
   * Reset circuit breaker for a node (admin function)
   */
  async reset(nodeId: string): Promise<void> {
    await this.transitionState(nodeId, "closed", "Manual reset by admin");
    console.log(`[CircuitBreaker] Node ${nodeId} manually reset to CLOSED`);
  }
}

// Singleton instance
export const circuitBreaker = new CircuitBreaker();
