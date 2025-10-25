/**
 * Alerts Service
 * Manages system alerts for operational notifications
 */

import { db } from '../db';
import { systemAlerts } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export interface ActionButton {
  label: string;
  action: string;
  variant: 'default' | 'destructive' | 'outline' | 'secondary';
  requiresConfirmation?: boolean;
}

export interface CreateAlertInput {
  userId: string;
  mode: 'live' | 'paper';
  alertType: string;
  severity: 'critical' | 'warning' | 'info';
  category?: 'informational' | 'actionable' | 'critical';
  message: string;
  metadata?: any;
  actionButtons?: ActionButton[];
}

export class AlertsService {
  /**
   * Creates a new system alert
   */
  static async createAlert(input: CreateAlertInput) {
    // Auto-categorize if not provided
    let category = input.category;
    if (!category) {
      if (input.severity === 'critical') {
        category = 'critical';
      } else if (input.actionButtons && input.actionButtons.length > 0) {
        category = 'actionable';
      } else {
        category = 'informational';
      }
    }

    const [alert] = await db.insert(systemAlerts).values({
      userId: input.userId,
      mode: input.mode,
      alertType: input.alertType,
      severity: input.severity,
      category,
      message: input.message,
      metadata: input.metadata || {},
      actionButtons: input.actionButtons || null,
      acknowledged: false,
    }).returning();

    // Phase 27.F.14.J: Broadcast alert creation to all clients with enhanced debug logging
    try {
      const { contextBridge } = await import('./context-bridge.js');
      const broadcastPayload = {
        type: 'alerts_updated' as const,
        payload: {
          action: 'created',
          alertId: alert.id,
          severity: alert.severity,
          category: alert.category,
          userId: input.userId,
          mode: input.mode,
          timestamp: new Date().toISOString()
        }
      };
      
      console.log('[Phase-27.F.14.J][AlertSync] 📡 Broadcasting alert creation:', {
        alertId: alert.id,
        severity: alert.severity,
        category: alert.category,
        connectedClients: contextBridge.getClientCount(),
        timestamp: new Date().toISOString()
      });
      
      await contextBridge.broadcast(broadcastPayload);
      console.log('[Phase-27.F.14.J][AlertSync] ✅ Alert broadcast sent successfully');
    } catch (error: any) {
      console.error('[Phase-27.F.14.J][AlertSync] ❌ Failed to broadcast alert creation:', error.message);
    }

    return alert;
  }

  /**
   * Gets unacknowledged alerts for a user and mode
   */
  static async getUnacknowledgedAlerts(userId: string, mode: 'live' | 'paper') {
    const alerts = await db
      .select()
      .from(systemAlerts)
      .where(
        and(
          eq(systemAlerts.userId, userId),
          eq(systemAlerts.mode, mode),
          eq(systemAlerts.acknowledged, false)
        )
      )
      .orderBy(desc(systemAlerts.timestamp))
      .limit(50);

    return alerts;
  }

  /**
   * Gets all alerts for a user and mode (including acknowledged)
   */
  static async getAllAlerts(userId: string, mode: 'live' | 'paper', limit = 100) {
    const alerts = await db
      .select()
      .from(systemAlerts)
      .where(
        and(
          eq(systemAlerts.userId, userId),
          eq(systemAlerts.mode, mode)
        )
      )
      .orderBy(desc(systemAlerts.timestamp))
      .limit(limit);

    return alerts;
  }

  /**
   * Acknowledges a specific alert
   */
  static async acknowledgeAlert(alertId: string, userId: string) {
    const [alert] = await db
      .update(systemAlerts)
      .set({ acknowledged: true })
      .where(
        and(
          eq(systemAlerts.id, alertId),
          eq(systemAlerts.userId, userId)
        )
      )
      .returning();

    return alert;
  }

  /**
   * Acknowledges all unacknowledged alerts for a user and mode
   */
  static async acknowledgeAll(userId: string, mode: 'live' | 'paper') {
    const result = await db
      .update(systemAlerts)
      .set({ acknowledged: true })
      .where(
        and(
          eq(systemAlerts.userId, userId),
          eq(systemAlerts.mode, mode),
          eq(systemAlerts.acknowledged, false)
        )
      )
      .returning();

    return result;
  }

  /**
   * Acknowledges all low severity (info) alerts for a user and mode
   */
  static async muteLowSeverity(userId: string, mode: 'live' | 'paper') {
    const result = await db
      .update(systemAlerts)
      .set({ acknowledged: true })
      .where(
        and(
          eq(systemAlerts.userId, userId),
          eq(systemAlerts.mode, mode),
          eq(systemAlerts.severity, 'info'),
          eq(systemAlerts.acknowledged, false)
        )
      )
      .returning();

    return result;
  }

  /**
   * Deletes old acknowledged alerts (older than specified days)
   */
  static async cleanupOldAlerts(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await db
      .delete(systemAlerts)
      .where(
        and(
          eq(systemAlerts.acknowledged, true),
          sql`${systemAlerts.timestamp} < ${cutoffDate.toISOString()}`
        )
      )
      .returning();

    return result.length;
  }

  /**
   * Phase 27.F.21.FINAL: Acknowledge all feed-health alerts for a user
   * Used during auto-clear on trading stop
   */
  static async acknowledgeFeedHealthAlerts(userId: string) {
    const result = await db
      .update(systemAlerts)
      .set({ acknowledged: true })
      .where(
        and(
          eq(systemAlerts.userId, userId),
          sql`${systemAlerts.alertType} LIKE '%feed%'`,
          eq(systemAlerts.acknowledged, false)
        )
      )
      .returning();

    return result;
  }

  /**
   * Phase 27.F.21.FINAL: Cleanup old feed-health alerts
   * Deletes feed-health alerts older than specified minutes
   * @param minutesOld - Age threshold in minutes (default: 30)
   */
  static async cleanupOldFeedAlerts(minutesOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setMinutes(cutoffDate.getMinutes() - minutesOld);

    const result = await db
      .delete(systemAlerts)
      .where(
        and(
          sql`${systemAlerts.alertType} LIKE '%feed%'`,
          sql`${systemAlerts.timestamp} < ${cutoffDate.toISOString()}`
        )
      )
      .returning();

    return result;
  }
}

export default AlertsService;
