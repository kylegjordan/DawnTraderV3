import fs from "fs";
import fetch from "node-fetch";

const BASE_URL = "http://localhost:5000";
const TEST_USER = { username: "testuser123", password: "SecurePass123!" };
const REPORT_MD = "./reports/runtime_mode_audit.md";
const REPORT_JSON = "./reports/runtime_mode_audit.json";

let token = null;

async function login() {
  console.log("🔐 Logging in...");
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: TEST_USER.username,
      password: TEST_USER.password,
    }),
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  token = data.token;
  console.log(`✅ Authenticated as ${TEST_USER.username}`);
}

async function api(endpoint, mode) {
  return fetch(`${BASE_URL}${endpoint}?mode=${mode}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "x-app-mode": mode,
      "Content-Type": "application/json",
    },
  });
}

async function verifyAPIModeEndpoints() {
  console.log("\n📡 Checking API mode routing...");
  const endpoints = ["/api/guardrails", "/api/screeners", "/api/goals", "/api/strategies"];
  const results = [];
  for (const ep of endpoints) {
    for (const mode of ["paper", "live"]) {
      const res = await api(ep, mode);
      results.push({
        endpoint: ep,
        mode,
        status: res.status,
        ok: res.ok,
      });
      console.log(`${res.ok ? "✅" : "❌"} ${ep} (${mode}) → ${res.status}`);
    }
  }
  return results;
}

async function verifyDataResponseDifference() {
  console.log("\n🗄️ Verifying mode-specific data responses...");
  const results = [];
  
  // Fetch guardrails for both modes and compare
  const guardrailsPaper = await (await api('/api/guardrails', 'paper')).json();
  const guardrailsLive = await (await api('/api/guardrails', 'live')).json();
  
  const paperRisk = guardrailsPaper?.riskPerTrade || guardrailsPaper?.filters?.riskPerTrade || 'N/A';
  const liveRisk = guardrailsLive?.riskPerTrade || guardrailsLive?.filters?.riskPerTrade || 'N/A';
  
  results.push({
    endpoint: '/api/guardrails',
    paper: { riskPerTrade: paperRisk },
    live: { riskPerTrade: liveRisk },
    isolated: paperRisk !== liveRisk
  });
  
  console.log(`📋 Guardrails: paper(${paperRisk}) vs live(${liveRisk}) → ${paperRisk !== liveRisk ? '✅ ISOLATED' : '⚠️ SAME'}`);
  
  // Fetch screeners for both modes
  const screenersPaper = await (await api('/api/screeners', 'paper')).json();
  const screenersLive = await (await api('/api/screeners', 'live')).json();
  
  const paperMinVol = screenersPaper?.minVolume || screenersPaper?.filters?.minVolume || 'N/A';
  const liveMinVol = screenersLive?.minVolume || screenersLive?.filters?.minVolume || 'N/A';
  
  results.push({
    endpoint: '/api/screeners',
    paper: { minVolume: paperMinVol },
    live: { minVolume: liveMinVol },
    isolated: paperMinVol !== liveMinVol
  });
  
  console.log(`📋 Screeners: paper(${paperMinVol}) vs live(${liveMinVol}) → ${paperMinVol !== liveMinVol ? '✅ ISOLATED' : '⚠️ SAME'}`);
  
  return results;
}

async function verifyRuntimePulls() {
  console.log("\n⚙️ Testing runtime parameter pulls (simulation init traces)...");
  const modes = ["paper", "live"];
  const traces = [];

  for (const mode of modes) {
    const res = await fetch(`${BASE_URL}/api/trading/start?dryRun=true`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "x-app-mode": mode,
        "Content-Type": "application/json",
      },
    });
    const data = await res.text();
    traces.push({ mode, trace: data.slice(0, 500) });
    const snippet = data.match(/risk_per_trade[^,\n]+/i);
    console.log(`🧠 ${mode.toUpperCase()} trace: ${snippet ? snippet[0] : "no trace found"}`);
  }
  return traces;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("🧠  Phase 19 Runtime Parameter Verification");
  console.log("═══════════════════════════════════════════════════════════════");
  await login();

  const apiResults = await verifyAPIModeEndpoints();
  const dataResults = await verifyDataResponseDifference();
  const runtimeTraces = await verifyRuntimePulls();

  const report = {
    timestamp: new Date().toISOString(),
    apiResults,
    dataResults,
    runtimeTraces,
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  const md = [
    "# Phase 19 Runtime Parameter Verification Report",
    `**Date:** ${new Date().toLocaleString()}`,
    "",
    "## 1️⃣ API Verification",
    apiResults.map(
      r => `- ${r.endpoint} (${r.mode}) → ${r.status} ${r.ok ? "✅" : "❌"}`
    ).join("\n"),
    "",
    "## 2️⃣ Mode Isolation - Data Responses",
    dataResults.map(
      r => `- ${r.endpoint}: paper(${JSON.stringify(r.paper)}) vs live(${JSON.stringify(r.live)}) → ${r.isolated ? "✅ ISOLATED" : "⚠️ SAME"}`
    ).join("\n"),
    "",
    "## 3️⃣ Runtime Traces",
    runtimeTraces.map(
      t => `### ${t.mode.toUpperCase()} TRACE\n\`\`\`\n${t.trace}\n\`\`\`\n`
    ).join("\n"),
    "",
    "✅ **Pass Criteria:** API endpoints respond with correct mode, data responses show mode-specific values, runtime traces show distinct parameter loads.",
  ].join("\n");

  fs.writeFileSync(REPORT_MD, md);
  console.log(`\n✅ Reports written:\n- ${REPORT_MD}\n- ${REPORT_JSON}`);
}

main().catch(e => console.error("❌ Diagnostic failed:", e));
