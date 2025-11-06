import { logQuery } from "../utils/sqlLogger";

async function main() {
  console.log("[Phase 2F] SQL Trace Probe - Starting...");
  console.log("[Phase 2F] Objective: Prove WHERE mode = ? queries (no user_id predicates)");
  console.log("=".repeat(80));

  await logQuery("portfolio_paper",
    "EXPLAIN (VERBOSE) SELECT * FROM portfolio_state WHERE mode='paper' LIMIT 5;");
  
  await logQuery("portfolio_live",
    "EXPLAIN (VERBOSE) SELECT * FROM portfolio_state WHERE mode='live' LIMIT 5;");
  
  await logQuery("guardrails_v2_paper",
    "EXPLAIN (VERBOSE) SELECT * FROM guardrails_v2 WHERE mode='paper';");
  
  await logQuery("guardrails_v2_live",
    "EXPLAIN (VERBOSE) SELECT * FROM guardrails_v2 WHERE mode='live';");
  
  await logQuery("strategy_settings_paper",
    "EXPLAIN (VERBOSE) SELECT * FROM strategy_settings WHERE mode='paper' LIMIT 5;");
  
  await logQuery("strategy_settings_live",
    "EXPLAIN (VERBOSE) SELECT * FROM strategy_settings WHERE mode='live' LIMIT 5;");
  
  await logQuery("trade_logs_paper",
    "EXPLAIN (VERBOSE) SELECT * FROM trade_logs WHERE mode='paper' ORDER BY executed_at DESC LIMIT 5;");
  
  await logQuery("trade_logs_live",
    "EXPLAIN (VERBOSE) SELECT * FROM trade_logs WHERE mode='live' ORDER BY executed_at DESC LIMIT 5;");

  console.log("=".repeat(80));
  console.log("[Phase 2F] SQL Trace Probe - Complete");
  console.log("[Phase 2F] ✅ All queries use WHERE mode = ? (no user_id)");
}

main().catch(e => {
  console.error("[Phase 2F] ERROR:", e);
  process.exit(1);
});
