import { promises as fs } from 'fs';
import { marketDataService } from './market-data';

interface HealthCheckResult {
  timestamp: string;
  symbol: string;
  coinGeckoStatus: 'success' | 'failed';
  coinGeckoLatency?: number;
  coinGeckoError?: string;
  krakenStatus: 'success' | 'failed';
  krakenLatency?: number;
  krakenError?: string;
  cacheHitRatio?: number;
  lastKnownWorking?: string;
}

interface HealthCheckSummary {
  timestamp: string;
  overallStatus: 'healthy' | 'degraded' | 'critical';
  results: HealthCheckResult[];
  cacheStats: {
    hits: number;
    misses: number;
    hitRate: string;
    cacheSize: number;
  };
  issues: string[];
}

export class MarketDataHealthCheck {
  private readonly TEST_SYMBOLS = ['BTC', 'ETH', 'SOL', 'SUI'];
  private readonly LOG_FILE = '/home/runner/workspace/reports/daily_market_data_health.log';
  private readonly CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  private intervalId?: NodeJS.Timeout;
  private lastWorkingTimestamps: Map<string, string> = new Map();

  async startDailyHealthChecks(): Promise<void> {
    console.log('[MarketDataHealthCheck] Starting daily health checks...');
    
    // Run immediately on startup
    await this.runHealthCheck();
    
    // Schedule daily checks
    this.intervalId = setInterval(async () => {
      await this.runHealthCheck();
    }, this.CHECK_INTERVAL);
    
    console.log('[MarketDataHealthCheck] Daily health checks scheduled (every 24 hours)');
  }

  async runHealthCheck(): Promise<void> {
    console.log('[MarketDataHealthCheck] Running health check...');
    const startTime = Date.now();
    
    const results: HealthCheckResult[] = [];
    const issues: string[] = [];

    // Test each symbol
    for (const symbol of this.TEST_SYMBOLS) {
      const result = await this.testSymbol(symbol);
      results.push(result);

      // Track issues
      if (result.coinGeckoStatus === 'failed' && result.krakenStatus === 'failed') {
        issues.push(`CRITICAL: Both APIs failed for ${symbol}`);
      } else if (result.coinGeckoStatus === 'failed') {
        issues.push(`WARNING: CoinGecko failed for ${symbol}, Kraken fallback working`);
      } else if (result.krakenStatus === 'failed') {
        issues.push(`WARNING: Kraken failed for ${symbol}, CoinGecko working`);
      }

      // Check latency spikes (>2 seconds)
      if (result.coinGeckoLatency && result.coinGeckoLatency > 2000) {
        issues.push(`LATENCY: CoinGecko response time for ${symbol}: ${result.coinGeckoLatency}ms`);
      }
      if (result.krakenLatency && result.krakenLatency > 2000) {
        issues.push(`LATENCY: Kraken response time for ${symbol}: ${result.krakenLatency}ms`);
      }
    }

    // Get cache statistics
    const cacheStats = marketDataService.getCacheStats();
    const hitRateNum = parseFloat(cacheStats.hitRate.replace('%', ''));
    
    if (hitRateNum < 70 && hitRateNum > 0) {
      issues.push(`CACHE: Hit ratio ${cacheStats.hitRate} is below 70% threshold`);
    }

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const criticalIssues = issues.filter(i => i.startsWith('CRITICAL'));
    const warningIssues = issues.filter(i => i.startsWith('WARNING') || i.startsWith('LATENCY'));
    
    if (criticalIssues.length > 0) {
      overallStatus = 'critical';
    } else if (warningIssues.length > 0) {
      overallStatus = 'degraded';
    }

    const summary: HealthCheckSummary = {
      timestamp: new Date().toISOString(),
      overallStatus,
      results,
      cacheStats,
      issues
    };

    // Write to log file
    await this.writeHealthLog(summary);

    const duration = Date.now() - startTime;
    console.log(`[MarketDataHealthCheck] Health check completed in ${duration}ms - Status: ${overallStatus.toUpperCase()}`);
    
    if (issues.length > 0) {
      console.warn(`[MarketDataHealthCheck] Issues detected: ${issues.length}`);
      issues.forEach(issue => console.warn(`  - ${issue}`));
    }
  }

  private async testSymbol(symbol: string): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      timestamp: new Date().toISOString(),
      symbol,
      coinGeckoStatus: 'failed',
      krakenStatus: 'failed'
    };

    // Test CoinGecko
    try {
      const coinGeckoStart = Date.now();
      await this.testCoinGecko(symbol);
      result.coinGeckoLatency = Date.now() - coinGeckoStart;
      result.coinGeckoStatus = 'success';
      this.lastWorkingTimestamps.set(`${symbol}-coingecko`, new Date().toISOString());
    } catch (error) {
      result.coinGeckoError = error instanceof Error ? error.message : 'Unknown error';
      const lastWorking = this.lastWorkingTimestamps.get(`${symbol}-coingecko`);
      if (lastWorking) {
        result.lastKnownWorking = lastWorking;
      }
    }

    // Test Kraken
    try {
      const krakenStart = Date.now();
      await this.testKraken(symbol);
      result.krakenLatency = Date.now() - krakenStart;
      result.krakenStatus = 'success';
      this.lastWorkingTimestamps.set(`${symbol}-kraken`, new Date().toISOString());
    } catch (error) {
      result.krakenError = error instanceof Error ? error.message : 'Unknown error';
      const lastWorking = this.lastWorkingTimestamps.get(`${symbol}-kraken`);
      if (lastWorking) {
        result.lastKnownWorking = lastWorking;
      }
    }

    return result;
  }

  private async testCoinGecko(symbol: string): Promise<void> {
    const coinGeckoIds: Record<string, string> = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'SOL': 'solana',
      'SUI': 'sui'
    };

    const coinId = coinGeckoIds[symbol];
    if (!coinId) {
      throw new Error(`Symbol ${symbol} not supported by CoinGecko`);
    }

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const coinData = data[coinId];

    if (!coinData || !coinData.usd) {
      throw new Error(`No data returned from CoinGecko for ${symbol}`);
    }
  }

  private async testKraken(symbol: string): Promise<void> {
    const krakenPairs: Record<string, string> = {
      'BTC': 'XBTUSDT',
      'ETH': 'ETHUSDT',
      'SOL': 'SOLUSDT',
      'SUI': 'SUIUSD'
    };

    const krakenPair = krakenPairs[symbol];
    if (!krakenPair) {
      throw new Error(`Symbol ${symbol} not supported by Kraken`);
    }

    const url = `https://api.kraken.com/0/public/Ticker?pair=${krakenPair}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Kraken API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error && data.error.length > 0) {
      throw new Error(`Kraken API error: ${data.error.join(', ')}`);
    }

    const pairData = data.result[krakenPair];
    if (!pairData) {
      throw new Error(`No data returned from Kraken for ${symbol}`);
    }
  }

  private async writeHealthLog(summary: HealthCheckSummary): Promise<void> {
    try {
      // Ensure reports directory exists
      await fs.mkdir('/home/runner/workspace/reports', { recursive: true });

      // Format log entry
      const logEntry = this.formatLogEntry(summary);
      
      // Append to log file
      await fs.appendFile(this.LOG_FILE, logEntry + '\n', 'utf-8');
      
      console.log(`[MarketDataHealthCheck] Health check logged to ${this.LOG_FILE}`);
    } catch (error) {
      console.error('[MarketDataHealthCheck] Failed to write health log:', error);
    }
  }

  private formatLogEntry(summary: HealthCheckSummary): string {
    const separator = '='.repeat(80);
    const lines: string[] = [
      separator,
      `MARKET DATA HEALTH CHECK - ${summary.timestamp}`,
      `Status: ${summary.overallStatus.toUpperCase()}`,
      separator
    ];

    // Cache Statistics
    lines.push('\nCACHE STATISTICS:');
    lines.push(`  Hits: ${summary.cacheStats.hits}`);
    lines.push(`  Misses: ${summary.cacheStats.misses}`);
    lines.push(`  Hit Rate: ${summary.cacheStats.hitRate}`);
    lines.push(`  Cache Size: ${summary.cacheStats.cacheSize} entries`);

    // API Test Results
    lines.push('\nAPI TEST RESULTS:');
    summary.results.forEach(result => {
      lines.push(`\n  ${result.symbol}:`);
      lines.push(`    CoinGecko: ${result.coinGeckoStatus.toUpperCase()} ${result.coinGeckoLatency ? `(${result.coinGeckoLatency}ms)` : ''}`);
      if (result.coinGeckoError) {
        lines.push(`      Error: ${result.coinGeckoError}`);
        if (result.lastKnownWorking) {
          lines.push(`      Last Working: ${result.lastKnownWorking}`);
        }
      }
      lines.push(`    Kraken: ${result.krakenStatus.toUpperCase()} ${result.krakenLatency ? `(${result.krakenLatency}ms)` : ''}`);
      if (result.krakenError) {
        lines.push(`      Error: ${result.krakenError}`);
        if (result.lastKnownWorking) {
          lines.push(`      Last Working: ${result.lastKnownWorking}`);
        }
      }
    });

    // Issues
    if (summary.issues.length > 0) {
      lines.push('\nISSUES DETECTED:');
      summary.issues.forEach(issue => {
        lines.push(`  ⚠️  ${issue}`);
      });
    } else {
      lines.push('\n✅ No issues detected');
    }

    lines.push('');
    return lines.join('\n');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      console.log('[MarketDataHealthCheck] Daily health checks stopped');
    }
  }
}

export const marketDataHealthCheck = new MarketDataHealthCheck();
