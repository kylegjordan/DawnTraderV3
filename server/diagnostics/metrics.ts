import os from 'os';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    load: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  latency: {
    database: number;
    api: number;
  };
  apiHealth: {
    status: string;
    lastCheck: Date;
    responseTime: number;
  };
}

export interface TradingEngineStatus {
  activeMode: 'live' | 'paper' | 'stopped';
  ordersQueue: number;
  executionLatency: number;
  lastActivity: Date | null;
}

export interface DatabaseHealth {
  connectionStatus: string;
  recordCounts: {
    users: number;
    trades: number;
    aiOpportunities: number;
    watchlistPairs: number;
  };
  errorRate: number;
  averageQueryTime: number;
}

/**
 * Get CPU metrics
 */
function getCPUMetrics() {
  const cpus = os.cpus();
  const load = os.loadavg();
  
  // Calculate average CPU usage
  let totalIdle = 0;
  let totalTick = 0;
  
  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });
  
  const usage = 100 - ~~(100 * totalIdle / totalTick);
  
  return {
    usage,
    cores: cpus.length,
    load: load
  };
}

/**
 * Get memory metrics
 */
function getMemoryMetrics() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const usagePercent = (used / total) * 100;
  
  return {
    total,
    used,
    free,
    usagePercent
  };
}

/**
 * Get database latency
 */
async function getDatabaseLatency(): Promise<number> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return Date.now() - start;
  } catch (error) {
    console.error('Database latency check failed:', error);
    return -1;
  }
}

/**
 * Get API health metrics (placeholder for now)
 */
async function getAPIHealth() {
  // This would typically check Kraken API health
  // For now, return placeholder data
  return {
    status: 'healthy',
    lastCheck: new Date(),
    responseTime: 50 // ms
  };
}

/**
 * Aggregate system metrics
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  const dbLatency = await getDatabaseLatency();
  const apiHealth = await getAPIHealth();
  
  return {
    cpu: getCPUMetrics(),
    memory: getMemoryMetrics(),
    latency: {
      database: dbLatency,
      api: apiHealth.responseTime
    },
    apiHealth
  };
}

/**
 * Get trading engine status
 */
export async function getTradingEngineStatus(): Promise<TradingEngineStatus> {
  // Get active trades count as proxy for orders queue
  const activeTrades = await db.execute(sql`
    SELECT COUNT(*) as count FROM trades WHERE status = 'open'
  `);
  
  const count = (activeTrades.rows[0] as any)?.count || 0;
  
  // Get most recent trade activity
  const lastActivity = await db.execute(sql`
    SELECT MAX(entry_time) as last_activity FROM trades
  `);
  
  const lastActivityDate = (lastActivity.rows[0] as any)?.last_activity;
  
  return {
    activeMode: 'stopped', // This would come from trading engine state
    ordersQueue: parseInt(count.toString()),
    executionLatency: 0, // Placeholder - would track actual execution times
    lastActivity: lastActivityDate ? new Date(lastActivityDate) : null
  };
}



/**
 * Get database health metrics
 */
export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  try {
    // Get record counts
    const [users, trades, opportunities, watchlist] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) as count FROM users`),
      db.execute(sql`SELECT COUNT(*) as count FROM trades`),
      db.execute(sql`SELECT COUNT(*) as count FROM ai_opportunities`),
      db.execute(sql`SELECT COUNT(*) as count FROM watchlist_pairs`)
    ]);
    
    const recordCounts = {
      users: parseInt((users.rows[0] as any)?.count || '0'),
      trades: parseInt((trades.rows[0] as any)?.count || '0'),
      aiOpportunities: parseInt((opportunities.rows[0] as any)?.count || '0'),
      watchlistPairs: parseInt((watchlist.rows[0] as any)?.count || '0')
    };
    
    // Get error rate from error logs (last hour)
    const lastHour = new Date(Date.now() - 60 * 60 * 1000);
    const errors = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM error_logs 
      WHERE timestamp >= ${lastHour.toISOString()} AND resolved = false
    `);
    
    const errorCount = parseInt((errors.rows[0] as any)?.count || '0');
    
    return {
      connectionStatus: 'connected',
      recordCounts,
      errorRate: errorCount, // errors per hour
      averageQueryTime: await getDatabaseLatency()
    };
  } catch (error) {
    console.error('Database health check failed:', error);
    return {
      connectionStatus: 'error',
      recordCounts: {
        users: 0,
        trades: 0,
        aiOpportunities: 0,
        watchlistPairs: 0
      },
      errorRate: 0,
      averageQueryTime: -1
    };
  }
}
