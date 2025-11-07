import fs from "fs";
import path from "path";

console.log("📓 Starting Observation Logger (Phase 7A)");

const logsDir = path.join(process.cwd(), "logs");
const logFile = path.join(logsDir, "observation_log.csv");
const API_URL = process.env.API_URL || "http://localhost:5000";
const METRICS_ENDPOINT = `${API_URL}/api/metrics/snapshot`;

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log(`✅ Created logs directory: ${logsDir}`);
}

// Write CSV header if file doesn't exist
const header =
  "timestamp,uptime(s),cpu(1m avg),rss(MB),signalLatency,orderLatency,queueDepth,eventLoopLag\n";
if (!fs.existsSync(logFile)) {
  fs.writeFileSync(logFile, header);
  console.log(`✅ Created observation log: ${logFile}`);
}

// Fetch metrics from running backend
async function fetchMetrics(): Promise<any> {
  try {
    const response = await fetch(METRICS_ENDPOINT);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error: any) {
    throw new Error(`Failed to fetch metrics from ${METRICS_ENDPOINT}: ${error.message}`);
  }
}

// Collect and log metrics
async function logObservation() {
  try {
    const metrics = await fetchMetrics();
    
    const timestamp = metrics.timestamp || Date.now();
    const uptime = metrics.uptime || 0;
    const cpuLoad = metrics.cpuLoad?.toFixed(2) || '0.00';
    const rssMB = metrics.rss?.toFixed(1) || '0.0';
    const signalLatency = metrics.signalLatency || 0;
    const orderLatency = metrics.orderLatency || 0;
    const queueDepth = metrics.queueDepth || 0;
    const eventLoopLag = metrics.eventLoopLag || 0;

    const line = `${timestamp},${uptime},${cpuLoad},${rssMB},${signalLatency},${orderLatency},${queueDepth},${eventLoopLag}\n`;
    
    fs.appendFileSync(logFile, line);
    
    console.log(`📊 [${new Date().toISOString()}] Logged observation:`, {
      uptime: `${uptime}s`,
      cpu: cpuLoad,
      rss: `${rssMB}MB`,
      signalLatency,
      orderLatency,
      queueDepth,
      eventLoopLag,
    });
  } catch (error: any) {
    console.error(`❌ Error logging observation: ${error.message}`);
    console.error(`   Make sure the backend is running at ${API_URL}`);
  }
}

// Log initial observation immediately
console.log(`📡 Connecting to backend at ${METRICS_ENDPOINT}...`);
console.log("📊 Logging initial observation...");
await logObservation();

// Log every 5 minutes (300,000 ms)
const intervalMs = 5 * 60 * 1000;
console.log(`⏰ Setting up 5-minute interval (${intervalMs}ms)...`);

setInterval(logObservation, intervalMs);

console.log(`✅ Observation Logger active. Logging to: ${logFile}`);
console.log(`📈 Metrics will be collected every 5 minutes`);
console.log(`🔄 For 48-hour test, expect ~576 observations`);

// Keep process alive
process.on('SIGINT', () => {
  console.log("\n⏹️  Observation Logger stopped");
  const lineCount = fs.readFileSync(logFile, 'utf-8').split('\n').length - 1;
  console.log(`📝 Total observations logged: ${lineCount - 1}`); // Exclude header
  process.exit(0);
});
