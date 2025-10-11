import { storage } from '../storage.js';
import { diagnosticsAnalyzer } from '../diagnostics/analyzer.js';

interface OptimizationProposal {
  id: string;
  type: 'performance' | 'cost' | 'reliability' | 'scalability';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  complexity: 'low' | 'medium' | 'high';
  estimatedBenefit: string;
  requiredAction: string;
  requiresApproval: boolean;
  approvalAction?: string;
  metadata?: any;
}

interface BottleneckDetection {
  detected: boolean;
  bottlenecks: Array<{
    area: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    metrics: any;
  }>;
}

class OptimizationAnalyzer {
  private lastOptimizationRun: Date | null = null;

  async detectBottlenecks(): Promise<BottleneckDetection> {
    const metricsHistory = diagnosticsAnalyzer.getMetricsHistory();
    
    if (metricsHistory.length < 5) {
      return { detected: false, bottlenecks: [] };
    }

    const bottlenecks: BottleneckDetection['bottlenecks'] = [];
    const recentMetrics = metricsHistory.slice(-10);

    // CPU bottleneck detection
    const avgCpu = recentMetrics.reduce((sum, m) => sum + m.system.cpu.usage, 0) / recentMetrics.length;
    if (avgCpu > 70) {
      bottlenecks.push({
        area: 'CPU',
        severity: avgCpu > 85 ? 'high' : 'medium',
        description: `High CPU utilization detected (avg: ${avgCpu.toFixed(1)}%)`,
        metrics: { avgCpu, threshold: 70 }
      });
    }

    // Memory bottleneck detection
    const avgMemoryPct = recentMetrics.reduce((sum, m) => sum + m.system.memory.usagePercent, 0) / recentMetrics.length;
    if (avgMemoryPct > 75) {
      bottlenecks.push({
        area: 'Memory',
        severity: avgMemoryPct > 90 ? 'high' : 'medium',
        description: `High memory usage detected (avg: ${avgMemoryPct.toFixed(1)}%)`,
        metrics: { avgMemoryPct, threshold: 75 }
      });
    }

    // Database latency bottleneck
    const avgDbLatency = recentMetrics.reduce((sum, m) => sum + m.database.averageQueryTime, 0) / recentMetrics.length;
    if (avgDbLatency > 80) {
      bottlenecks.push({
        area: 'Database',
        severity: avgDbLatency > 150 ? 'high' : 'medium',
        description: `High database query latency detected (avg: ${avgDbLatency.toFixed(1)}ms)`,
        metrics: { avgDbLatency, threshold: 80 }
      });
    }

    // API latency bottleneck
    const avgApiLatency = recentMetrics.reduce((sum, m) => sum + m.system.latency.api, 0) / recentMetrics.length;
    if (avgApiLatency > 150) {
      bottlenecks.push({
        area: 'API',
        severity: avgApiLatency > 250 ? 'high' : 'medium',
        description: `High API response latency detected (avg: ${avgApiLatency.toFixed(1)}ms)`,
        metrics: { avgApiLatency, threshold: 150 }
      });
    }

    // Error rate bottleneck
    const totalErrors = recentMetrics.reduce((sum, m) => sum + m.database.errorRate, 0);
    if (totalErrors > 20) {
      bottlenecks.push({
        area: 'Error Rate',
        severity: totalErrors > 50 ? 'high' : 'medium',
        description: `High error rate detected (${totalErrors} errors in recent window)`,
        metrics: { totalErrors, threshold: 20 }
      });
    }

    return {
      detected: bottlenecks.length > 0,
      bottlenecks
    };
  }

  async generateOptimizationProposals(bottlenecks: BottleneckDetection): Promise<OptimizationProposal[]> {
    const proposals: OptimizationProposal[] = [];

    for (const bottleneck of bottlenecks.bottlenecks) {
      switch (bottleneck.area) {
        case 'CPU':
          if (bottleneck.severity === 'high') {
            proposals.push({
              id: `opt-cpu-${Date.now()}`,
              type: 'performance',
              title: 'Reduce CPU-intensive operations',
              description: 'High CPU usage detected. Consider reducing concurrent operations or optimizing compute-heavy tasks.',
              impact: 'high',
              complexity: 'medium',
              estimatedBenefit: 'Reduce CPU usage by 20-30%',
              requiredAction: 'Review and optimize background tasks, reduce polling frequency, or implement caching',
              requiresApproval: false,
              metadata: bottleneck.metrics
            });
          }
          break;

        case 'Memory':
          if (bottleneck.severity === 'high') {
            proposals.push({
              id: `opt-mem-${Date.now()}`,
              type: 'performance',
              title: 'Optimize memory usage',
              description: 'High memory consumption detected. Consider clearing caches or reducing in-memory data retention.',
              impact: 'high',
              complexity: 'low',
              estimatedBenefit: 'Reduce memory usage by 15-25%',
              requiredAction: 'Clear diagnostics history cache, reduce metrics retention window',
              requiresApproval: false,
              metadata: bottleneck.metrics
            });
          }
          break;

        case 'Database':
          proposals.push({
            id: `opt-db-${Date.now()}`,
            type: 'performance',
            title: 'Optimize database queries',
            description: 'Slow database queries detected. Consider adding indexes or optimizing query patterns.',
            impact: 'medium',
            complexity: 'medium',
            estimatedBenefit: 'Reduce query latency by 30-50%',
            requiredAction: 'Review slow queries, add database indexes, optimize N+1 queries',
            requiresApproval: true,
            approvalAction: 'modifyDatabase',
            metadata: bottleneck.metrics
          });
          break;

        case 'API':
          proposals.push({
            id: `opt-api-${Date.now()}`,
            type: 'performance',
            title: 'Reduce API latency',
            description: 'High API response times detected. Consider implementing response caching or request batching.',
            impact: 'medium',
            complexity: 'medium',
            estimatedBenefit: 'Reduce API latency by 20-40%',
            requiredAction: 'Implement API response caching, batch multiple requests, or add CDN',
            requiresApproval: false,
            metadata: bottleneck.metrics
          });
          break;

        case 'Error Rate':
          proposals.push({
            id: `opt-err-${Date.now()}`,
            type: 'reliability',
            title: 'Reduce error rate',
            description: 'High error rate detected. Investigate and fix error sources to improve system reliability.',
            impact: 'high',
            complexity: 'high',
            estimatedBenefit: 'Reduce error rate by 60-80%',
            requiredAction: 'Review error logs, fix bug sources, add better error handling and retries',
            requiresApproval: false,
            metadata: bottleneck.metrics
          });
          break;
      }
    }

    return proposals;
  }

  async runOptimizationAnalysis(): Promise<void> {
    try {
      // Rate limit: don't run more than once per hour
      if (this.lastOptimizationRun && Date.now() - this.lastOptimizationRun.getTime() < 3600000) {
        console.log('Optimization analysis skipped (rate limited)');
        return;
      }

      const bottlenecks = await this.detectBottlenecks();
      
      if (!bottlenecks.detected) {
        console.log('No bottlenecks detected - system performing optimally');
        this.lastOptimizationRun = new Date();
        return;
      }

      const proposals = await this.generateOptimizationProposals(bottlenecks);

      if (proposals.length === 0) {
        console.log('No optimization proposals generated');
        this.lastOptimizationRun = new Date();
        return;
      }

      // Log proposals to orchestrator logs
      await this.logProposals(proposals, bottlenecks);

      this.lastOptimizationRun = new Date();
      console.log(`Generated ${proposals.length} optimization proposal(s)`);
    } catch (error) {
      console.error('Error running optimization analysis:', error);
    }
  }

  private async logProposals(proposals: OptimizationProposal[], bottlenecks: BottleneckDetection): Promise<void> {
    try {
      const adminUser = await storage.getAllUsers().then(users => users.find(u => u.isAdmin));
      if (!adminUser) {
        console.warn('No admin user found for logging optimization proposals');
        return;
      }

      for (const proposal of proposals) {
        const urgencyLevel = proposal.impact === 'high' ? 'high' : proposal.impact === 'medium' ? 'medium' : 'low';
        
        await storage.createOrchestratorLog({
          userId: adminUser.id,
          category: 'optimization',
          recommendation: `[OPTIMIZATION] ${proposal.title}`,
          status: proposal.requiresApproval ? 'pending' : 'completed',
          urgencyLevel,
          actionTaken: proposal.requiresApproval ? null : 'Auto-approved for implementation',
          metadata: {
            proposalId: proposal.id,
            type: proposal.type,
            description: proposal.description,
            impact: proposal.impact,
            complexity: proposal.complexity,
            estimatedBenefit: proposal.estimatedBenefit,
            requiredAction: proposal.requiredAction,
            requiresApproval: proposal.requiresApproval,
            approvalAction: proposal.approvalAction,
            bottlenecks: bottlenecks.bottlenecks,
            timestamp: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      console.error('Error logging optimization proposals:', error);
    }
  }
}

export const optimizationAnalyzer = new OptimizationAnalyzer();
