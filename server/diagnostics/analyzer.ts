import OpenAI from 'openai';
import { storage } from '../storage.js';
import { getSystemMetrics, getTradingEngineStatus, getDatabaseHealth } from './metrics.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface MetricsSnapshot {
  timestamp: Date;
  system: any;
  tradingEngine: any;
  database: any;
}

export interface AnomalyDetection {
  detected: boolean;
  anomalies: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    metric: string;
    value: number;
    threshold: number;
    description: string;
  }>;
}

export interface DiagnosticAnalysis {
  timestamp: Date;
  anomalies: AnomalyDetection;
  trends: {
    cpuTrend: string;
    memoryTrend: string;
    latencyTrend: string;
    errorTrend: string;
  };
  aiInsights: {
    summary: string;
    recommendations: string[];
    urgencyLevel: 'low' | 'medium' | 'high';
  };
}

class DiagnosticsAnalyzer {
  private metricsHistory: MetricsSnapshot[] = [];
  private readonly MAX_HISTORY = 100;
  private readonly ANOMALY_THRESHOLDS = {
    cpuUsage: 80,
    memoryUsage: 85,
    databaseLatency: 100,
    apiLatency: 200,
    errorRate: 10
  };

  async collectMetricsSnapshot(): Promise<MetricsSnapshot> {
    const [system, tradingEngine, database] = await Promise.all([
      getSystemMetrics(),
      getTradingEngineStatus(),
      getDatabaseHealth()
    ]);

    const snapshot = {
      timestamp: new Date(),
      system,
      tradingEngine,
      database
    };

    this.metricsHistory.push(snapshot);
    if (this.metricsHistory.length > this.MAX_HISTORY) {
      this.metricsHistory.shift();
    }

    return snapshot;
  }

  detectAnomalies(snapshot: MetricsSnapshot): AnomalyDetection {
    const anomalies: AnomalyDetection['anomalies'] = [];

    if (snapshot.system.cpu.usage > this.ANOMALY_THRESHOLDS.cpuUsage) {
      anomalies.push({
        type: 'cpu_high',
        severity: snapshot.system.cpu.usage > 90 ? 'high' : 'medium',
        metric: 'CPU Usage',
        value: snapshot.system.cpu.usage,
        threshold: this.ANOMALY_THRESHOLDS.cpuUsage,
        description: `CPU usage at ${snapshot.system.cpu.usage.toFixed(1)}% exceeds threshold of ${this.ANOMALY_THRESHOLDS.cpuUsage}%`
      });
    }

    if (snapshot.system.memory.usagePercent > this.ANOMALY_THRESHOLDS.memoryUsage) {
      anomalies.push({
        type: 'memory_high',
        severity: snapshot.system.memory.usagePercent > 95 ? 'high' : 'medium',
        metric: 'Memory Usage',
        value: snapshot.system.memory.usagePercent,
        threshold: this.ANOMALY_THRESHOLDS.memoryUsage,
        description: `Memory usage at ${snapshot.system.memory.usagePercent.toFixed(1)}% exceeds threshold of ${this.ANOMALY_THRESHOLDS.memoryUsage}%`
      });
    }

    if (snapshot.system.latency.database > this.ANOMALY_THRESHOLDS.databaseLatency) {
      anomalies.push({
        type: 'db_latency_high',
        severity: snapshot.system.latency.database > 200 ? 'high' : 'medium',
        metric: 'Database Latency',
        value: snapshot.system.latency.database,
        threshold: this.ANOMALY_THRESHOLDS.databaseLatency,
        description: `Database latency at ${snapshot.system.latency.database}ms exceeds threshold of ${this.ANOMALY_THRESHOLDS.databaseLatency}ms`
      });
    }

    if (snapshot.database.errorRate > this.ANOMALY_THRESHOLDS.errorRate) {
      anomalies.push({
        type: 'error_rate_high',
        severity: snapshot.database.errorRate > 20 ? 'high' : 'medium',
        metric: 'Error Rate',
        value: snapshot.database.errorRate,
        threshold: this.ANOMALY_THRESHOLDS.errorRate,
        description: `Error rate at ${snapshot.database.errorRate} errors/hour exceeds threshold of ${this.ANOMALY_THRESHOLDS.errorRate}`
      });
    }

    return {
      detected: anomalies.length > 0,
      anomalies
    };
  }

  analyzeTrends(): DiagnosticAnalysis['trends'] {
    if (this.metricsHistory.length < 2) {
      return {
        cpuTrend: 'stable',
        memoryTrend: 'stable',
        latencyTrend: 'stable',
        errorTrend: 'stable'
      };
    }

    const recent = this.metricsHistory.slice(-10);
    const older = this.metricsHistory.slice(-20, -10);

    const avgCpuRecent = recent.reduce((sum, s) => sum + s.system.cpu.usage, 0) / recent.length;
    const avgCpuOlder = older.length > 0 ? older.reduce((sum, s) => sum + s.system.cpu.usage, 0) / older.length : avgCpuRecent;

    const avgMemRecent = recent.reduce((sum, s) => sum + s.system.memory.usagePercent, 0) / recent.length;
    const avgMemOlder = older.length > 0 ? older.reduce((sum, s) => sum + s.system.memory.usagePercent, 0) / older.length : avgMemRecent;

    const avgLatencyRecent = recent.reduce((sum, s) => sum + s.system.latency.database, 0) / recent.length;
    const avgLatencyOlder = older.length > 0 ? older.reduce((sum, s) => sum + s.system.latency.database, 0) / older.length : avgLatencyRecent;

    const avgErrorRecent = recent.reduce((sum, s) => sum + s.database.errorRate, 0) / recent.length;
    const avgErrorOlder = older.length > 0 ? older.reduce((sum, s) => sum + s.database.errorRate, 0) / older.length : avgErrorRecent;

    const getTrend = (recent: number, older: number, threshold = 10) => {
      const change = ((recent - older) / older) * 100;
      if (Math.abs(change) < threshold) return 'stable';
      return change > 0 ? 'increasing' : 'decreasing';
    };

    return {
      cpuTrend: getTrend(avgCpuRecent, avgCpuOlder),
      memoryTrend: getTrend(avgMemRecent, avgMemOlder),
      latencyTrend: getTrend(avgLatencyRecent, avgLatencyOlder),
      errorTrend: getTrend(avgErrorRecent, avgErrorOlder)
    };
  }

  async generateAIInsights(
    snapshot: MetricsSnapshot,
    anomalies: AnomalyDetection,
    trends: DiagnosticAnalysis['trends']
  ): Promise<DiagnosticAnalysis['aiInsights']> {
    if (!process.env.OPENAI_API_KEY) {
      return {
        summary: 'AI insights unavailable - OpenAI API key not configured',
        recommendations: ['Configure OpenAI API key to enable AI insights'],
        urgencyLevel: 'low'
      };
    }

    try {
      const prompt = `You are a system diagnostics AI analyzing a cryptocurrency trading application.

Current System Metrics:
- CPU: ${snapshot.system.cpu.usage.toFixed(1)}% (${snapshot.system.cpu.cores} cores, load: ${snapshot.system.cpu.load.map((l: number) => l.toFixed(2)).join(', ')})
- Memory: ${snapshot.system.memory.usagePercent.toFixed(1)}% (${(snapshot.system.memory.used / 1024 / 1024 / 1024).toFixed(2)}GB / ${(snapshot.system.memory.total / 1024 / 1024 / 1024).toFixed(2)}GB)
- Database Latency: ${snapshot.system.latency.database}ms
- API Latency: ${snapshot.system.latency.api}ms
- Trading Engine: ${snapshot.tradingEngine.activeMode}, ${snapshot.tradingEngine.ordersQueue} orders queued
- Database: ${snapshot.database.errorRate} errors/hour, ${snapshot.database.recordCounts.trades} trades, ${snapshot.database.recordCounts.users} users

Detected Anomalies:
${anomalies.detected ? anomalies.anomalies.map(a => `- ${a.description}`).join('\n') : '- None detected'}

Trends:
- CPU: ${trends.cpuTrend}
- Memory: ${trends.memoryTrend}
- Latency: ${trends.latencyTrend}
- Errors: ${trends.errorTrend}

Provide:
1. A concise 2-3 sentence summary of system health
2. 3-5 actionable recommendations (if any issues detected)
3. Urgency level: low, medium, or high

Respond in JSON format: { "summary": "...", "recommendations": ["...", "..."], "urgencyLevel": "low|medium|high" }`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' } as const,
        max_tokens: 500
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(content);
      return {
        summary: parsed.summary || 'System analysis completed',
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        urgencyLevel: ['low', 'medium', 'high'].includes(parsed.urgencyLevel) ? parsed.urgencyLevel : 'low'
      };
    } catch (error) {
      console.error('Error generating AI insights:', error);
      return {
        summary: 'System metrics collected successfully. AI analysis temporarily unavailable.',
        recommendations: anomalies.detected ? ['Review detected anomalies and take corrective action'] : [],
        urgencyLevel: anomalies.detected ? 'medium' : 'low'
      };
    }
  }

  async runDiagnosticAnalysis(): Promise<DiagnosticAnalysis> {
    const snapshot = await this.collectMetricsSnapshot();
    const anomalies = this.detectAnomalies(snapshot);
    const trends = this.analyzeTrends();
    const aiInsights = await this.generateAIInsights(snapshot, anomalies, trends);

    const analysis: DiagnosticAnalysis = {
      timestamp: new Date(),
      anomalies,
      trends,
      aiInsights
    };

    await this.logAnalysis(analysis);

    return analysis;
  }

  private async logAnalysis(analysis: DiagnosticAnalysis): Promise<void> {
    try {
      const adminUser = await storage.getAllUsers().then(users => users.find(u => u.isAdmin));
      if (!adminUser) {
        console.warn('No admin user found for logging diagnostic analysis');
        return;
      }

      await storage.createOrchestratorLog({
        userId: adminUser.id,
        category: 'diagnostics',
        recommendation: analysis.aiInsights.summary,
        status: 'completed',
        urgencyLevel: analysis.aiInsights.urgencyLevel,
        actionTaken: analysis.anomalies.detected ? 
          `Detected ${analysis.anomalies.anomalies.length} anomalies` : 
          'No anomalies detected',
        metadata: {
          anomalies: analysis.anomalies,
          trends: analysis.trends,
          recommendations: analysis.aiInsights.recommendations
        }
      });
    } catch (error) {
      console.error('Error logging diagnostic analysis:', error);
    }
  }

  getMetricsHistory(): MetricsSnapshot[] {
    return this.metricsHistory;
  }
}

export const diagnosticsAnalyzer = new DiagnosticsAnalyzer();
