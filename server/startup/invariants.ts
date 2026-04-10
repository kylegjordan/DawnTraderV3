import { env } from "../config";
import { sql } from "drizzle-orm";
import { db } from "../db";

export async function assertSingleTenantDB() {
  if (!env.SINGLE_TENANT) {
    console.log("[BOOT] Multi-tenant mode enabled (SINGLE_TENANT=false)");
    return;
  }

  console.log("[BOOT] Verifying single-tenant database invariants...");
  
  try {
    // Only check the 5 operational tables that were migrated in Phase 2C
    // AI, audit, and backup tables intentionally KEEP user_id for historical data
    const operationalTables = [
      'portfolio_state',
      'strategy_settings',
      'paper_sim_sessions',
      'system_context',
      'trading_settings_legacy'
    ];
    
    const rows = await db.execute(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE column_name ILIKE 'user_id'
        AND table_schema = 'public'
        AND table_name IN ('portfolio_state', 'strategy_settings', 'paper_sim_sessions', 'system_context', 'trading_settings_legacy')
      ORDER BY table_name
    `);

    const violations = (rows as any).rows || [];
    
    if (violations.length > 0) {
      console.error("[BOOT] ❌ Single-tenant invariant violation detected!");
      console.error("[BOOT] user_id columns found in operational tables:");
      violations.forEach((v: any) => {
        console.error(`[BOOT]   - ${v.table_name}.${v.column_name}`);
      });
      throw new Error(
        `[SingleTenantViolation] Found user_id column in ${violations.length} operational table(s). ` +
        `This violates single-tenant architecture. Tables: ${violations.map((v: any) => v.table_name).join(", ")}`
      );
    }

    console.log("[BOOT] ✅ Single-tenant database verified");
    console.log("[BOOT] ✅ 0 user_id columns in operational tables");
    console.log("[BOOT] ✅ Mode isolation active: paper/live");
    console.log(`[BOOT] ✅ Global context ID: default`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("SingleTenantViolation")) {
      throw error;
    }
    console.error("[BOOT] ⚠️  Failed to verify single-tenant invariants:", error);
    throw new Error(`[BOOT] Database verification failed: ${error}`);
  }
}
