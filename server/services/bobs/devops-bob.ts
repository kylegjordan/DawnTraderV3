/**
 * Phase 8.8.1: DevOps Bob - System Health & Deployment Metrics
 * 
 * Provides system health monitoring, deployment metrics, and operational insights
 */

import { db } from '../../db';
import { metricsBob } from '../bob-metrics';

export interface DevOpsContext {
  systemHealth: any;
  deploymentStatus: 'healthy' | 'degraded' | 'critical';
  resourceUsage: {
    cpu?: number;
    memory?: number;
    database?: any;
  };
  uptime: number;
  errors: any[];
}

export interface DevOpsAnalysis {
  status: 'healthy' | 'warning' | 'critical';
  findings: string[];
  recommendations: string[];
  metrics: Record<string, any>;
}

class DevOpsBob {
  /**
   * Get current system context
   */
  async getContext(): Promise<DevOpsContext> {
    try {
      // Get system health from metrics bob
      const healthData = await metricsBob.getSystemHealth('live');
      
      // Calculate uptime
      const uptimeSeconds = process.uptime();
      
      // Get resource usage
      const memUsage = process.memoryUsage();
      const resourceUsage = {
        memory: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      };

      // Determine deployment status
      let deploymentStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
      if (healthData.backend !== 'OK' || healthData.database !== 'OK') {
        deploymentStatus = 'critical';
      } else if (healthData.paperTrading?.isRunning === false) {
        deploymentStatus = 'degraded';
      }

      return {
        systemHealth: healthData,
        deploymentStatus,
        resourceUsage,
        uptime: uptimeSeconds,
        errors: [], // TODO: Integrate with error tracking
      };
    } catch (error) {
      console.error('[DevOpsBob] Error getting context:', error);
      return {
        systemHealth: null,
        deploymentStatus: 'critical',
        resourceUsage: {},
        uptime: process.uptime(),
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Run operational analysis
   */
  async runAnalysis(query: string): Promise<DevOpsAnalysis> {
    const context = await this.getContext();
    const findings: string[] = [];
    const recommendations: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Analyze system health
    if (context.deploymentStatus === 'critical') {
      status = 'critical';
      findings.push('System health is critical - backend or database issues detected');
      recommendations.push('Check system logs and restart affected services');
    } else if (context.deploymentStatus === 'degraded') {
      status = 'warning';
      findings.push('System is degraded - paper trading engine not running');
      recommendations.push('Restart paper trading simulation engine');
    }

    // Analyze memory usage
    if (context.resourceUsage.memory && context.resourceUsage.memory > 85) {
      if (status === 'healthy') status = 'warning';
      findings.push(`High memory usage detected: ${context.resourceUsage.memory}%`);
      recommendations.push('Monitor for memory leaks, consider increasing heap size');
    }

    // Analyze uptime (too short might indicate recent restart)
    if (context.uptime < 300) { // Less than 5 minutes
      if (status === 'healthy') status = 'warning';
      findings.push('System recently restarted - uptime less than 5 minutes');
    }

    // Query-specific analysis
    if (query.includes('performance') || query.includes('slow')) {
      findings.push('Performance check: reviewing system metrics');
      if (context.resourceUsage.memory && context.resourceUsage.memory > 70) {
        recommendations.push('Memory usage above 70% - may impact performance');
      }
    }

    // If everything is good
    if (findings.length === 0) {
      findings.push('All systems operational - no issues detected');
      recommendations.push('Continue monitoring system metrics');
    }

    return {
      status,
      findings,
      recommendations,
      metrics: {
        uptime: context.uptime,
        deploymentStatus: context.deploymentStatus,
        memoryUsage: context.resourceUsage.memory,
        systemHealth: context.systemHealth,
      },
    };
  }

  /**
   * Return findings in natural language format
   */
  async returnFindings(analysis: DevOpsAnalysis): Promise<string> {
    const statusEmoji = {
      healthy: '✅',
      warning: '⚠️',
      critical: '🚨',
    };

    let output = `${statusEmoji[analysis.status]} **System Status: ${analysis.status.toUpperCase()}**\n\n`;
    
    output += '**Findings:**\n';
    analysis.findings.forEach(finding => {
      output += `- ${finding}\n`;
    });

    if (analysis.recommendations.length > 0) {
      output += '\n**Recommendations:**\n';
      analysis.recommendations.forEach(rec => {
        output += `- ${rec}\n`;
      });
    }

    output += '\n**Metrics:**\n';
    output += `- Uptime: ${Math.floor(analysis.metrics.uptime / 60)} minutes\n`;
    output += `- Deployment: ${analysis.metrics.deploymentStatus}\n`;
    if (analysis.metrics.memoryUsage) {
      output += `- Memory Usage: ${analysis.metrics.memoryUsage}%\n`;
    }

    return output;
  }
}

export const devopsBob = new DevOpsBob();
