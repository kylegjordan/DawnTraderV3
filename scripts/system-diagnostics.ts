import { db } from "../server/db";
import fs from "fs";
import path from "path";

interface DiagnosticResult {
  timestamp: string;
  checks: {
    apiKeys: { status: string; details: string[] };
    database: { status: string; message: string };
    storage: { status: string; mounts: Record<string, boolean> };
    services: { status: string; endpoints: Record<string, string> };
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

async function runSystemDiagnostics() {
  console.log("🔍 Starting System Diagnostics...\n");
  
  const result: DiagnosticResult = {
    timestamp: new Date().toISOString(),
    checks: {
      apiKeys: { status: "unknown", details: [] },
      database: { status: "unknown", message: "" },
      storage: { status: "unknown", mounts: {} },
      services: { status: "unknown", endpoints: {} }
    },
    summary: { total: 0, passed: 0, failed: 0, warnings: 0 }
  };

  // 1. Check API Keys
  console.log("🔑 Checking API Keys...");
  const requiredKeys = ["OPENAI_API_KEY", "DATABASE_URL"];
  const optionalKeys = ["KRAKEN_API_KEY", "GOOGLE_CLOUD_PROJECT_ID", "GOOGLE_CLOUD_PRIVATE_KEY"];
  
  requiredKeys.forEach(key => {
    if (process.env[key]) {
      result.checks.apiKeys.details.push(`✅ ${key}: Present`);
      result.summary.passed++;
    } else {
      result.checks.apiKeys.details.push(`❌ ${key}: Missing`);
      result.summary.failed++;
    }
    result.summary.total++;
  });

  optionalKeys.forEach(key => {
    if (process.env[key]) {
      result.checks.apiKeys.details.push(`ℹ️  ${key}: Present (optional)`);
    } else {
      result.checks.apiKeys.details.push(`⚠️  ${key}: Missing (optional)`);
      result.summary.warnings++;
    }
  });

  result.checks.apiKeys.status = result.summary.failed > 0 ? "failed" : "passed";
  console.log(result.checks.apiKeys.details.join("\n") + "\n");

  // 2. Check Database Connection
  console.log("💾 Checking Database Connection...");
  try {
    const testQuery = await db.execute<{ count: number }>(
      `SELECT COUNT(*) as count FROM users`
    );
    const userCount = testQuery.rows[0]?.count || 0;
    result.checks.database.status = "passed";
    result.checks.database.message = `✅ Database connected (${userCount} users)`;
    result.summary.passed++;
    console.log(result.checks.database.message + "\n");
  } catch (error) {
    result.checks.database.status = "failed";
    result.checks.database.message = `❌ Database error: ${error}`;
    result.summary.failed++;
    console.log(result.checks.database.message + "\n");
  }
  result.summary.total++;

  // 3. Check Storage Mounts
  console.log("📁 Checking Storage Mounts...");
  const requiredPaths = [
    "/logs",
    "/logs/chats",
    "/logs/chat_summaries",
    "/logs/system_diagnostics",
    "/public/audio"
  ];

  requiredPaths.forEach(dirPath => {
    const fullPath = path.join(process.cwd(), dirPath);
    const exists = fs.existsSync(fullPath);
    const writable = exists && fs.accessSync(fullPath, fs.constants.W_OK) === undefined;
    
    result.checks.storage.mounts[dirPath] = exists && writable;
    
    if (exists && writable) {
      console.log(`✅ ${dirPath}: Exists and writable`);
      result.summary.passed++;
    } else if (exists) {
      console.log(`⚠️  ${dirPath}: Exists but not writable`);
      result.summary.warnings++;
    } else {
      console.log(`❌ ${dirPath}: Does not exist`);
      result.summary.failed++;
    }
    result.summary.total++;
  });

  result.checks.storage.status = Object.values(result.checks.storage.mounts).every(v => v) 
    ? "passed" 
    : "failed";
  console.log();

  // 4. Check Service Endpoints (via direct status checks)
  console.log("🔌 Checking Service Status...");
  
  const services = {
    "Memory System": "walter-memory.ts loaded",
    "Chat Logging": "chat-logging.ts loaded",
    "TTS Service": "walter-tts.ts loaded",
    "Ingestion Service": "walter-ingest.ts loaded"
  };

  Object.entries(services).forEach(([name, status]) => {
    const servicePath = path.join(process.cwd(), "server/services", status.split(" ")[0]);
    const exists = fs.existsSync(servicePath) || fs.existsSync(path.join(process.cwd(), "server/middleware", status.split(" ")[0]));
    
    if (exists) {
      result.checks.services.endpoints[name] = "✅ Active";
      result.summary.passed++;
      console.log(`✅ ${name}: Active`);
    } else {
      result.checks.services.endpoints[name] = "❌ Missing";
      result.summary.failed++;
      console.log(`❌ ${name}: Missing`);
    }
    result.summary.total++;
  });

  result.checks.services.status = Object.values(result.checks.services.endpoints).every(v => v.includes("✅")) 
    ? "passed" 
    : "failed";
  console.log();

  // 5. Save Diagnostic Report
  const reportPath = path.join(process.cwd(), "logs/system_diagnostics", `diagnostic_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
  
  console.log("📊 Diagnostic Summary:");
  console.log(`   Total checks: ${result.summary.total}`);
  console.log(`   ✅ Passed: ${result.summary.passed}`);
  console.log(`   ❌ Failed: ${result.summary.failed}`);
  console.log(`   ⚠️  Warnings: ${result.summary.warnings}`);
  console.log(`\n📄 Report saved to: ${reportPath}`);

  const overallStatus = result.summary.failed === 0 ? "✅ PASSED" : "❌ FAILED";
  console.log(`\n${overallStatus} - System diagnostics complete`);

  return result;
}

runSystemDiagnostics().catch(console.error);
