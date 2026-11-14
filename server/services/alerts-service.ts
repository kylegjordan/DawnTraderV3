/**
 * Alerts Service
 * Manages system alerts for operational notifications
 */

import { db } from '../db';
import { systemAlerts, users } from '@shared/schema';
import { eq, and, desc, asc, or, getTableColumns } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

/**
 * B-ALERT-INSERT-CONTRACT (#1255): the `metadata` key that marks a feed-health EPISODE as closed. Stamped by
 * `acknowledgeFeedHealthAlerts` (a healthy cycle, or a trading stop); a refresh re-raises a row ONLY when it carries it.
 */
export const EPISODE_CLOSED_KEY = 'episodeClosedAt';

/**
 * B-ALERT-INSERT-CONTRACT (#1255, P6): the feed-health check-failed text. The alert banner renders only `message`, so the
 * cause stays in it: the error's first line, capped at 200 characters, with digit runs replaced by `#`, so one KIND of
 * failure keeps one row (refreshed in place) instead of a row per cycle when the error text embeds a count or a time.
 */
export function formatCheckFailedMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'unknown error');
  const firstLine = (raw.split(/\r?\n/)[0] ?? '').replace(/\d+/g, '#').trim();
  const cause = firstLine.length > 200 ? `${firstLine.slice(0, 200)}…` : firstLine;
  return `Feed Health Check Failed: ${cause || 'unknown error'}`;
}

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
   * Writes a system alert. B-ALERT-INSERT-CONTRACT (#1255): `system_alerts` holds ONE row per `(mode, alert_type,
   * message)` (`unique_global_alert`, declared in `shared/schema.ts`), so a repeat REFRESHES that row instead of throwing
   * into the caller. The refresh moves `timestamp` to now and takes the caller's severity, category and metadata; it
   * keeps `user_id` and `action_buttons` (no writer sets buttons, so a refresh could only erase them). It does NOT
   * un-dismiss: `acknowledged` returns to false only when the stored row carries `metadata.episodeClosedAt`, which only
   * the feed-health episode close writes — so a person's dismissal holds until the condition has cleared and returned.
   * ⚠️ The conflict target covers `unique_global_alert` ONLY; a collision on `system_alerts_user_mode_timestamp_idx`
   * still throws (needs the same user, mode and transaction clock — not produced by any caller today).
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

    const metadata = input.metadata || {};
    const [alert] = await db.insert(systemAlerts).values({
      userId: input.userId,
      mode: input.mode,
      alertType: input.alertType,
      severity: input.severity,
      category,
      message: input.message,
      metadata,
      actionButtons: input.actionButtons || null,
      acknowledged: false,
    }).onConflictDoUpdate({
      target: [systemAlerts.mode, systemAlerts.alertType, systemAlerts.message],
      set: {
        acknowledged: sql`CASE WHEN (system_alerts.metadata ->> ${EPISODE_CLOSED_KEY}) IS NOT NULL THEN false ELSE system_alerts.acknowledged END`,
        timestamp: sql`now()`,
        severity: input.severity,
        category,
        metadata,
      },
    }).returning({ ...getTableColumns(systemAlerts), inserted: sql<boolean>`(xmax = 0)` });

    if (!alert.inserted) {
      console.log(`[AlertsService] refreshed ${alert.id} mode=${alert.mode} type=${alert.alertType} acknowledged=${alert.acknowledged}`);
    }

    // Phase 27.F.14.J: Broadcast alert creation to all clients with enhanced debug logging
    try {
      const { contextBridge } = await import('./context-bridge.js');
      const broadcastPayload = {
        type: 'alerts_updated' as const,
        payload: {
          action: alert.inserted ? 'created' : 'refreshed',
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
        connectedClients: contextBridge.getStats().connectedClients,
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
   * Gets unacknowledged alerts for a mode (GLOBAL - shared across ALL users)
   * Phase 27.F.14.J-POST: Alerts are now global per mode, not per user
   */
  static async getUnacknowledgedAlerts(userId: string, mode: 'live' | 'paper') {
    // NOTE: userId parameter kept for API compatibility but NOT used in query
    // All users see the same alerts for each mode
    const alerts = await db
      .select()
      .from(systemAlerts)
      .where(
        and(
          eq(systemAlerts.mode, mode),
          eq(systemAlerts.acknowledged, false)
        )
      )
      .orderBy(desc(systemAlerts.timestamp))
      .limit(50);

    return alerts;
  }

  /**
   * Gets all alerts for a mode (GLOBAL - shared across ALL users, including acknowledged)
   * Phase 27.F.14.J-POST: Alerts are now global per mode, not per user
   */
  static async getAllAlerts(userId: string, mode: 'live' | 'paper', limit = 100) {
    // NOTE: userId parameter kept for API compatibility but NOT used in query
    // All users see the same alerts for each mode
    const alerts = await db
      .select()
      .from(systemAlerts)
      .where(eq(systemAlerts.mode, mode))
      .orderBy(desc(systemAlerts.timestamp))
      .limit(limit);

    return alerts;
  }

  /**
   * Acknowledges a specific alert (GLOBAL - affects all users)
   * Phase 27.F.14.N: Alerts are truly global now - userId optional for API compatibility
   */
  static async acknowledgeAlert(alertId: string, userId?: string) {
    // Dismissing an alert dismisses it for ALL users globally
    const [alert] = await db
      .update(systemAlerts)
      .set({ acknowledged: true })
      .where(eq(systemAlerts.id, alertId))
      .returning();

    if (!alert) {
      console.warn(`[AlertSync][Backend] ⚠️  Alert ${alertId} not found`);
      return null;
    }

    // Phase 27.F.14.N: Broadcast alert dismissal to all clients
    try {
      const { contextBridge } = await import('./context-bridge.js');
      const stats = contextBridge.getStats();
      
      console.log(`[AlertSync][Backend] ✅ Global alert dismissed → broadcasted to ${stats.connectedClients} clients`, {
        alertId: alert.id,
        alertType: alert.alertType,
        mode: alert.mode,
        clientCount: stats.connectedClients,
        timestamp: new Date().toISOString()
      });
      
      await contextBridge.broadcast({
        type: 'alerts_updated',
        payload: {
          action: 'dismissed',
          alertId: alert.id,
          mode: alert.mode,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('[AlertSync][Backend] ❌ Failed to broadcast alert dismissal:', error.message);
    }

    return alert;
  }

  /**
   * Acknowledges all unacknowledged alerts for a mode (GLOBAL - affects all users)
   * Phase 27.F.14.N: Alerts are truly global now - userId optional for API compatibility
   */
  static async acknowledgeAll(userId: string | undefined, mode: 'live' | 'paper') {
    // Clearing alerts clears them for ALL users in this mode
    const result = await db
      .update(systemAlerts)
      .set({ acknowledged: true })
      .where(
        and(
          eq(systemAlerts.mode, mode),
          eq(systemAlerts.acknowledged, false)
        )
      )
      .returning();

    // Phase 27.F.14.N: Broadcast clear all to all clients
    if (result.length > 0) {
      try {
        const { contextBridge } = await import('./context-bridge.js');
        const stats = contextBridge.getStats();
        
        console.log(`[AlertSync][Backend] ✅ Global clear all (${result.length} alerts) → broadcasted to ${stats.connectedClients} clients`, {
          mode,
          count: result.length,
          clientCount: stats.connectedClients,
          timestamp: new Date().toISOString()
        });
        
        await contextBridge.broadcast({
          type: 'alerts_updated',
          payload: {
            action: 'cleared_all',
            mode,
            count: result.length,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error: any) {
        console.error('[AlertSync][Backend] ❌ Failed to broadcast clear all:', error.message);
      }
    }

    return result;
  }

  /**
   * Acknowledges all low severity (info) alerts for a mode (GLOBAL - affects all users)
   * Phase 27.F.14.J-POST: Alerts are now global per mode
   */
  static async muteLowSeverity(userId: string, mode: 'live' | 'paper') {
    // NOTE: userId parameter kept for API compatibility but NOT used in query
    const result = await db
      .update(systemAlerts)
      .set({ acknowledged: true })
      .where(
        and(
          eq(systemAlerts.mode, mode),
          eq(systemAlerts.severity, 'info'),
          eq(systemAlerts.acknowledged, false)
        )
      )
      .returning();

    return result;
  }

  // B-ALERT-INSERT-CONTRACT (#1255, P7): `cleanupOldAlerts` DELETED (rule 18) — zero callers, and it aged rows by the
  // `timestamp` a refresh now moves. Record: DELETED_COMPONENTS_LOG.

  /**
   * B-ALERT-INSERT-CONTRACT (#1255, P4): the ONE user an operational alert row is written under. Alerts are global per mode
   * (`aa9fefb57`) and every reader except the action route's ownership check ignores `user_id` — which is the only reason a
   * single fixed owner is tolerable. Deterministic: `users.is_admin = true`, ordered by `created_at` then `id` (a bare
   * `getAllUsers()` returns heap order, which has moved). `null` when there is no admin: the caller logs and skips.
   */
  static async getAlertOwner(): Promise<{ id: string; tradingMode: 'live' | 'paper' | null } | null> {
    const [owner] = await db
      .select({ id: users.id, tradingMode: users.tradingMode })
      .from(users)
      .where(eq(users.isAdmin, true))
      .orderBy(asc(users.createdAt), asc(users.id))
      .limit(1);
    return owner ?? null;
  }

  /**
   * Closes the feed-health EPISODE: acknowledges every `feed_health` row (all users — alerts are global per mode) and stamps
   * `metadata.episodeClosedAt`, so the next recurrence of the same text re-raises (B-ALERT-INSERT-CONTRACT #1255, A.9).
   * Runs on every healthy cycle and on a trading stop. Idempotent: it selects only rows not yet closed (unacknowledged, or
   * acknowledged without the stamp), so a closed table returns nothing. Returns `{id, mode}` only — the callers count, and
   * the first run after the batch touches every historical row (whose messages carry the full issue list).
   * B-FEED-HEALTH-GRADE-ARM (row 3a): exactly the type both feed-health mint paths write; a pattern would silently
   * acknowledge any future type that merely contains "feed".
   */
  static async acknowledgeFeedHealthAlerts(): Promise<Array<{ id: string; mode: 'live' | 'paper' }>> {
    return db
      .update(systemAlerts)
      .set({
        acknowledged: true,
        metadata: sql`coalesce(${systemAlerts.metadata}, '{}'::jsonb) || jsonb_build_object(${EPISODE_CLOSED_KEY}::text, now())`,
      })
      .where(
        and(
          eq(systemAlerts.alertType, 'feed_health'),
          or(
            sql`${systemAlerts.acknowledged} IS NOT TRUE`,
            sql`(${systemAlerts.metadata} ->> ${EPISODE_CLOSED_KEY}) IS NULL`,
          ),
        ),
      )
      .returning({ id: systemAlerts.id, mode: systemAlerts.mode });
  }

  // B-FEED-HEALTH-GRADE-ARM (#1123, Langston Step-1 fold): `cleanupOldFeedAlerts` DELETED (rule 18) — zero callers, and it
  // DELETED every `%feed%` row older than 30 min; armed as "the clear" it would destroy history instead of acknowledging
  // it. The clear is `acknowledgeFeedHealthAlerts` on recovery. Record: DELETED_COMPONENTS_LOG.
}

export default AlertsService;
