/**
 * Alerts Service
 * Manages system alerts for operational notifications
 */

import { db } from '../db';
import { systemAlerts } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export interface CreateAlertInput {
  userId: string;
  mode: 'live' | 'paper';
  alertType: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  metadata?: any;
}

export class AlertsService {
  /**
   * Creates a new system alert
   */
  static async createAlert(input: CreateAlertInput) {
    const [alert] = await db.insert(systemAlerts).values({
      userId: input.userId,
      mode: input.mode,
      alertType: input.alertType,
      severity: input.severity,
      message: input.message,
      metadata: input.metadata || {},
      acknowledged: false,
    }).returning();

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
}

export default AlertsService;
