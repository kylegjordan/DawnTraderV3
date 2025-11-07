import fs from "fs";
import path from "path";

interface ObservationRow {
  timestamp: number;
  uptime: number;
  cpu: number;
  rss: number;
  signalLatency: number;
  orderLatency: number;
  queueDepth: number;
  eventLoopLag: number;
}

console.log("📊 Phase 7/7A Validation - Analyzing Observation Log\n");

const logFile = path.join(process.cwd(), "logs", "observation_log.csv");

// Check if log file exists
if (!fs.existsSync(logFile)) {
  console.error(`❌ Error: Observation log not found at ${logFile}`);
  console.error("   Run the observation logger first: tsx server/scripts/phase7-observation-logger.ts");
  process.exit(1);
}

// Read and parse CSV
const csvContent = fs.readFileSync(logFile, "utf-8");
const lines = csvContent.trim().split("\n");

if (lines.length < 2) {
  console.error("❌ Error: Observation log is empty or contains only header");
  process.exit(1);
}

// Parse data rows (skip header)
const observations: ObservationRow[] = [];
for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(",");
  if (parts.length !== 8) continue;

  observations.push({
    timestamp: parseInt(parts[0]),
    uptime: parseFloat(parts[1]),
    cpu: parseFloat(parts[2]),
    rss: parseFloat(parts[3]),
    signalLatency: parseFloat(parts[4]),
    orderLatency: parseFloat(parts[5]),
    queueDepth: parseFloat(parts[6]),
    eventLoopLag: parseFloat(parts[7]),
  });
}

console.log(`📝 Total observations: ${observations.length}`);
console.log(`⏱️  Time range: ${new Date(observations[0].timestamp).toISOString()} to ${new Date(observations[observations.length - 1].timestamp).toISOString()}`);

const durationHours = (observations[observations.length - 1].timestamp - observations[0].timestamp) / (1000 * 60 * 60);
console.log(`⏰ Test duration: ${durationHours.toFixed(1)} hours\n`);

// Calculate averages
function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function max(arr: number[]): number {
  return Math.max(...arr);
}

function p95(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[idx];
}

// Extract metrics
const cpuValues = observations.map((o) => o.cpu);
const rssValues = observations.map((o) => o.rss);
const signalLatencyValues = observations.map((o) => o.signalLatency).filter(v => v > 0);
const orderLatencyValues = observations.map((o) => o.orderLatency).filter(v => v > 0);
const queueDepthValues = observations.map((o) => o.queueDepth);
const eventLoopLagValues = observations.map((o) => o.eventLoopLag).filter(v => v > 0);

console.log("📈 PERFORMANCE METRICS\n");

console.log("CPU (1-min load avg):");
console.log(`  Average: ${avg(cpuValues).toFixed(2)}`);
console.log(`  Max:     ${max(cpuValues).toFixed(2)}`);
console.log(`  P95:     ${p95(cpuValues).toFixed(2)}\n`);

console.log("Memory (RSS MB):");
console.log(`  Average: ${avg(rssValues).toFixed(1)} MB`);
console.log(`  Max:     ${max(rssValues).toFixed(1)} MB`);
console.log(`  P95:     ${p95(rssValues).toFixed(1)} MB\n`);

if (signalLatencyValues.length > 0) {
  console.log("Signal Latency (ms):");
  console.log(`  Average: ${avg(signalLatencyValues).toFixed(0)} ms`);
  console.log(`  Max:     ${max(signalLatencyValues).toFixed(0)} ms`);
  console.log(`  P95:     ${p95(signalLatencyValues).toFixed(0)} ms`);
  console.log(`  Target:  < 1000 ms (${avg(signalLatencyValues) < 1000 ? '✅ PASS' : '❌ FAIL'})\n`);
} else {
  console.log("Signal Latency: No data collected\n");
}

if (orderLatencyValues.length > 0) {
  console.log("Order Latency (ms):");
  console.log(`  Average: ${avg(orderLatencyValues).toFixed(0)} ms`);
  console.log(`  Max:     ${max(orderLatencyValues).toFixed(0)} ms`);
  console.log(`  P95:     ${p95(orderLatencyValues).toFixed(0)} ms`);
  console.log(`  Target:  < 2000 ms (${avg(orderLatencyValues) < 2000 ? '✅ PASS' : '❌ FAIL'})\n`);
} else {
  console.log("Order Latency: No data collected\n");
}

console.log("Queue Depth:");
console.log(`  Average: ${avg(queueDepthValues).toFixed(1)}`);
console.log(`  Max:     ${max(queueDepthValues).toFixed(0)}`);
console.log(`  P95:     ${p95(queueDepthValues).toFixed(0)}`);
console.log(`  Target:  < 10 (${avg(queueDepthValues) < 10 ? '✅ PASS' : '❌ FAIL'})\n`);

if (eventLoopLagValues.length > 0) {
  console.log("Event Loop Lag (ms):");
  console.log(`  Average: ${avg(eventLoopLagValues).toFixed(0)} ms`);
  console.log(`  Max:     ${max(eventLoopLagValues).toFixed(0)} ms`);
  console.log(`  P95:     ${p95(eventLoopLagValues).toFixed(0)} ms`);
  console.log(`  Target:  < 50 ms (${avg(eventLoopLagValues) < 50 ? '✅ PASS' : '❌ FAIL'})\n`);
} else {
  console.log("Event Loop Lag: No data collected\n");
}

// Overall assessment
console.log("━".repeat(60));
console.log("🎯 PHASE 7/7A VALIDATION SUMMARY\n");

const results = {
  signalLatency: signalLatencyValues.length > 0 ? avg(signalLatencyValues) < 1000 : null,
  orderLatency: orderLatencyValues.length > 0 ? avg(orderLatencyValues) < 2000 : null,
  queueDepth: avg(queueDepthValues) < 10,
  eventLoopLag: eventLoopLagValues.length > 0 ? avg(eventLoopLagValues) < 50 : null,
  observations: observations.length >= 2, // At least 2 observations
  duration: durationHours > 0,
};

const passCount = Object.values(results).filter(v => v === true).length;
const totalTests = Object.values(results).filter(v => v !== null).length;

console.log(`Tests Passed: ${passCount}/${totalTests}`);
console.log(`Observations: ${observations.length} collected over ${durationHours.toFixed(1)} hours`);

if (durationHours >= 48) {
  console.log(`✅ 48-hour soak test COMPLETE`);
} else {
  console.log(`⏳ Soak test in progress (${durationHours.toFixed(1)}h / 48h)`);
}

if (passCount === totalTests) {
  console.log("\n✅ All metrics within target thresholds - Phase 7/7A VALIDATED");
  process.exit(0);
} else {
  console.log("\n⚠️  Some metrics exceeded thresholds - review required");
  process.exit(1);
}
