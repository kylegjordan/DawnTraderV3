import fs from "fs";
import os from "os";
import path from "path";
import { metricsService } from "../services/metrics-service";

console.log("📓 Starting Observation Logger (Phase 7A)");

const logsDir = path.join(process.cwd(), "logs");
const logFile = path.join(logsDir, "observation_log.csv");

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

// Helper function to get most recent metric value
function getRecentMetric(metrics: any[], defaultValue: number = 0): number {
  if (!metrics || metrics.length === 0) return defaultValue;
  return metrics[metrics.length - 1]?.value || defaultValue;
}

// Collect and log metrics every 5 minutes
function logObservation() {
  try {
    const systemMetrics = metricsService.getSystemMetrics();
    const subsystemMetrics = metricsService.getSubsystemMetrics();

    const timestamp = Date.now();
    const uptime = Math.floor(process.uptime());
    const cpuLoad = os.loadavg()[0].toFixed(2);
    const rssMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    
    const signalLatency = getRecentMetric(subsystemMetrics.signalLatency);
    const orderLatency = getRecentMetric(subsystemMetrics.orderLatency);
    const queueDepth = getRecentMetric(subsystemMetrics.queueDepth);
    const eventLoopLag = systemMetrics.eventLoopLag;

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
    console.error("❌ Error logging observation:", error.message);
  }
}

// Log initial observation immediately
console.log("📊 Logging initial observation...");
logObservation();

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
