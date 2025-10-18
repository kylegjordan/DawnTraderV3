import { db } from '../db';
import { ethicalPrinciple } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Phase 13.0: Seed default ethical principles
 * Creates 5 foundational principles for autonomous decision-making
 */
export async function seedEthicalPrinciples(): Promise<void> {
  console.log('[Ethics] Seeding default ethical principles...');

  const defaultPrinciples = [
    {
      name: 'transparency',
      type: 'foundational' as const,
      description: 'System actions must be explainable and traceable',
      priority: 1,
      enabled: true,
      constraints: {
        require_reasoning_log: true,
        require_audit_trail: true,
      },
    },
    {
      name: 'harm_prevention',
      type: 'foundational' as const,
      description: 'Prevent actions that could cause financial or operational harm',
      priority: 2,
      enabled: true,
      constraints: {
        max_risk_per_trade_pct: 5.0,
        max_daily_loss_pct: 10.0,
        require_risk_assessment: true,
      },
    },
    {
      name: 'fairness',
      type: 'foundational' as const,
      description: 'Treat all users and data sources equitably',
      priority: 3,
      enabled: true,
      constraints: {
        prohibit_manipulation: true,
        prohibit_front_running: true,
      },
    },
    {
      name: 'autonomy_bounds',
      type: 'operational' as const,
      description: 'Respect user autonomy and system operational boundaries',
      priority: 4,
      enabled: true,
      constraints: {
        require_approval_for_live_trades: true,
        respect_user_preferences: true,
      },
    },
    {
      name: 'accountability',
      type: 'operational' as const,
      description: 'Maintain audit trails for all autonomous decisions',
      priority: 5,
      enabled: true,
      constraints: {
        log_all_decisions: true,
        enable_human_review: true,
      },
    },
  ];

  for (const principle of defaultPrinciples) {
    try {
      // Check if principle already exists
      const existing = await db
        .select()
        .from(ethicalPrinciple)
        .where(eq(ethicalPrinciple.name, principle.name));

      if (existing.length === 0) {
        // Insert new principle
        await db.insert(ethicalPrinciple).values(principle);
        console.log(`[Ethics] ✅ Seeded principle: ${principle.name}`);
      } else {
        console.log(`[Ethics] ⏭️  Principle already exists: ${principle.name}`);
      }
    } catch (error: any) {
      console.error(`[Ethics] ⚠️  Failed to seed principle ${principle.name}:`, error.message);
    }
  }

  console.log('[Ethics] Ethical principles seeding complete');
}
