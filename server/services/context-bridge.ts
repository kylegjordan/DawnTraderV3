import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface ContextUpdate {
  type: 'state_update' | 'chat_update' | 'config_update' | 'trade_update' | 'safety_event' | 'kill_switch_changed' | 'ethical_event' | 'ethics_federation_sync_complete' | 'ethics_conflict_updated' | 'trading_state_changed';
  payload: any;
  timestamp: string;
  traceId: string;
  userId?: string;
  mode?: 'live' | 'paper';
}

export interface SessionContext {
  sessionId: string;
  userId: string;
  intentHistory: any[];
  validationContext: any;
  lastUpdated: string;
}

interface ClientMetadata {
  ws: WebSocket;
  userId?: string;
  sessionId: string;
  connectedAt: string;
  lastPing: string;
}

class ContextBridge extends EventEmitter {
  private clients: Map<WebSocket, ClientMetadata> = new Map();
  private sessionContexts: Map<string, SessionContext> = new Map();
  private retryAttempts = 3;
  private retryBaseDelayMs = 1000;
  private cleanupIntervalMs = 60 * 60 * 1000; // 1 hour
  private sessionMaxAgeMs = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    super();
    console.log('[ContextBridge] Service initialized');
    
    // Start cleanup scheduler
    this.startCleanupScheduler();
  }

  /**
   * Register a WebSocket client for context updates
   */
  public registerClient(ws: WebSocket, userId?: string): void {
    const metadata: ClientMetadata = {
      ws,
      userId,
      sessionId: nanoid(),
      connectedAt: new Date().toISOString(),
      lastPing: new Date().toISOString()
    };
    
    this.clients.set(ws, metadata);
    console.log(`[ContextBridge] Client registered (userId: ${userId || 'anonymous'}). Total clients: ${this.clients.size}`);

    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`[ContextBridge] Client disconnected. Total clients: ${this.clients.size}`);
    });

    ws.on('error', (error) => {
      console.error('[ContextBridge] WebSocket error:', error);
      this.clients.delete(ws);
    });

    // Send initial session context if userId provided
    if (userId) {
      const sessionContext = this.getOrCreateSessionContext(userId);
      this.sendToClient(ws, {
        type: 'state_update',
        payload: { sessionContext },
        timestamp: new Date().toISOString(),
        traceId: nanoid(),
        userId
      });
    }
  }

  /**
   * Broadcast an update to connected clients (filtered by userId or mode if provided)
   * Phase 27.F.13.O: Added mode-based filtering for global per-mode broadcasts
   */
  public async broadcast(update: Omit<ContextUpdate, 'timestamp' | 'traceId'>): Promise<void> {
    const fullUpdate: ContextUpdate = {
      ...update,
      timestamp: new Date().toISOString(),
      traceId: nanoid()
    };

    // Phase 27.F.13.O: Filter clients by userId OR mode
    const targetClients = Array.from(this.clients.entries()).filter(([ws, metadata]) => {
      // Priority 1: Filter by userId if specified (user-specific updates)
      if (update.userId) {
        return metadata.userId === update.userId;
      }
      
      // Priority 2: For global updates with no userId, broadcast to ALL clients
      // (Mode filtering happens at the application layer - all clients receive mode-scoped updates)
      return true;
    });

    const filterDesc = update.userId 
      ? `userId: ${update.userId}` 
      : update.mode 
        ? `mode: ${update.mode} (global)`
        : 'all';
    
    console.log(`[ContextBridge] Broadcasting ${update.type} to ${targetClients.length}/${this.clients.size} clients (${filterDesc})`);

    // Send to filtered clients with retry logic
    const promises = targetClients.map(([ws, metadata]) => 
      this.sendWithRetry(ws, fullUpdate)
    );

    const results = await Promise.allSettled(promises);

    // Log to database AFTER send attempts complete
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;
    
    // Success only if ALL deliveries succeeded (no failures)
    const allSuccess = failureCount === 0 && targetClients.length > 0;
    
    await this.logBroadcast(fullUpdate, allSuccess, {
      successCount,
      failureCount,
      totalTargets: targetClients.length
    });
  }

  /**
   * Send update to specific client with exponential backoff retry logic
   */
  private async sendWithRetry(
    ws: WebSocket, 
    update: ContextUpdate, 
    attempt: number = 1
  ): Promise<void> {
    try {
      await this.sendToClient(ws, update);
    } catch (error) {
      console.error(`[ContextBridge] Send failed (attempt ${attempt}/${this.retryAttempts}):`, error);

      if (attempt < this.retryAttempts) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = this.retryBaseDelayMs * Math.pow(2, attempt - 1);
        await this.delay(delayMs);
        return this.sendWithRetry(ws, update, attempt + 1);
      } else {
        // Max retries exceeded, remove client
        console.error('[ContextBridge] Max retries exceeded, removing client');
        this.clients.delete(ws);
        // Error will be logged at broadcast level with delivery stats
        throw error;
      }
    }
  }

  /**
   * Send message to a single client
   */
  private async sendToClient(ws: WebSocket, update: ContextUpdate): Promise<void> {
    return new Promise((resolve, reject) => {
      if (ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not open'));
        return;
      }

      ws.send(JSON.stringify(update), (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get or create session context for a user
   */
  public getOrCreateSessionContext(userId: string): SessionContext {
    let context = this.sessionContexts.get(userId);

    if (!context) {
      context = {
        sessionId: nanoid(),
        userId,
        intentHistory: [],
        validationContext: {},
        lastUpdated: new Date().toISOString()
      };
      this.sessionContexts.set(userId, context);
      console.log(`[ContextBridge] Created new session context for user ${userId}`);
    }

    return context;
  }

  /**
   * Update session context
   */
  public updateSessionContext(
    userId: string, 
    updates: Partial<Omit<SessionContext, 'userId' | 'sessionId'>>
  ): void {
    const context = this.getOrCreateSessionContext(userId);
    
    Object.assign(context, updates, {
      lastUpdated: new Date().toISOString()
    });

    this.sessionContexts.set(userId, context);
    
    // Broadcast session update
    this.broadcast({
      type: 'state_update',
      payload: { sessionContext: context },
      userId
    });
  }

  /**
   * Add intent to history
   */
  public addIntentToHistory(userId: string, intent: any): void {
    const context = this.getOrCreateSessionContext(userId);
    context.intentHistory.push({
      ...intent,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 50 intents
    if (context.intentHistory.length > 50) {
      context.intentHistory = context.intentHistory.slice(-50);
    }

    context.lastUpdated = new Date().toISOString();
    this.sessionContexts.set(userId, context);
  }

  /**
   * Get session context for a user
   */
  public getSessionContext(userId: string): SessionContext | undefined {
    return this.sessionContexts.get(userId);
  }

  /**
   * Clear session context
   */
  public clearSessionContext(userId: string): void {
    this.sessionContexts.delete(userId);
    console.log(`[ContextBridge] Cleared session context for user ${userId}`);
  }

  /**
   * Log broadcast to database with accurate success status (after send completion)
   */
  private async logBroadcast(
    update: ContextUpdate, 
    success: boolean,
    metadata?: { successCount: number; failureCount: number; totalTargets: number }
  ): Promise<void> {
    try {
      const payload = {
        ...update.payload,
        deliveryStats: metadata
      };

      // Build error message for partial or total failures
      let errorMessage: string | null = null;
      if (!success && metadata) {
        if (metadata.failureCount === metadata.totalTargets) {
          errorMessage = `Total failure: ${metadata.failureCount}/${metadata.totalTargets} clients failed`;
        } else {
          errorMessage = `Partial failure: ${metadata.failureCount}/${metadata.totalTargets} clients failed (${metadata.successCount} succeeded)`;
        }
      }

      await db.execute(sql`
        INSERT INTO context_bridge_log (
          trace_id,
          event_type,
          payload,
          user_id,
          mode,
          success,
          error_message,
          timestamp
        ) VALUES (
          ${update.traceId},
          ${update.type},
          ${JSON.stringify(payload)},
          ${update.userId || null},
          ${update.mode || null},
          ${success},
          ${errorMessage},
          ${update.timestamp}
        )
      `);
    } catch (error) {
      console.error('[ContextBridge] Failed to log broadcast:', error);
    }
  }

  /**
   * Utility: Delay function for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get statistics
   */
  public getStats() {
    return {
      connectedClients: this.clients.size,
      activeSessions: this.sessionContexts.size,
      sessions: Array.from(this.sessionContexts.values()).map(ctx => ({
        sessionId: ctx.sessionId,
        userId: ctx.userId,
        intentCount: ctx.intentHistory.length,
        lastUpdated: ctx.lastUpdated
      }))
    };
  }

  /**
   * Start cleanup scheduler for stale sessions and disconnected clients
   */
  private startCleanupScheduler(): void {
    setInterval(() => {
      this.cleanupStaleSessions();
      this.cleanupDisconnectedClients();
    }, this.cleanupIntervalMs);
    
    console.log('[ContextBridge] Cleanup scheduler started (runs every hour)');
  }

  /**
   * Cleanup: Remove stale sessions (inactive for > 24 hours)
   */
  private cleanupStaleSessions(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [userId, context] of this.sessionContexts.entries()) {
      const age = now - new Date(context.lastUpdated).getTime();
      if (age > this.sessionMaxAgeMs) {
        this.sessionContexts.delete(userId);
        removedCount++;
        console.log(`[ContextBridge] Removed stale session for user ${userId} (age: ${Math.round(age / 1000 / 60 / 60)}h)`);
      }
    }

    if (removedCount > 0) {
      console.log(`[ContextBridge] Cleanup complete: ${removedCount} stale sessions removed`);
    }
  }

  /**
   * Cleanup: Remove disconnected WebSocket clients
   */
  private cleanupDisconnectedClients(): void {
    let removedCount = 0;

    for (const [ws, metadata] of this.clients.entries()) {
      if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        this.clients.delete(ws);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[ContextBridge] Cleanup complete: ${removedCount} disconnected clients removed`);
    }
  }
}

// Export singleton instance
export const contextBridge = new ContextBridge();
