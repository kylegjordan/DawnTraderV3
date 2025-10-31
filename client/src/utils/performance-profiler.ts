/**
 * Phase 35.1 - React Profiler Performance Monitoring
 * Captures render times, first-paint latency, and component update costs
 */

interface ProfileMetrics {
  componentName: string;
  phase: 'mount' | 'update' | 'nested-update';
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
}

interface AggregatedMetrics {
  componentName: string;
  mountTime: number | null;
  totalRenders: number;
  totalUpdateTime: number;
  averageUpdateTime: number;
  maxUpdateTime: number;
  firstPaintTime: number | null;
}

class PerformanceProfiler {
  private metrics: Map<string, ProfileMetrics[]> = new Map();
  private firstPaintTimes: Map<string, number> = new Map();
  private mountStartTimes: Map<string, number> = new Map();

  /**
   * React Profiler callback - captures render metrics
   */
  onRender = (
    id: string,
    phase: 'mount' | 'update' | 'nested-update',
    actualDuration: number,
    baseDuration: number,
    startTime: number,
    commitTime: number
  ) => {
    const metric: ProfileMetrics = {
      componentName: id,
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime
    };

    // Store metrics
    if (!this.metrics.has(id)) {
      this.metrics.set(id, []);
    }
    this.metrics.get(id)!.push(metric);

    // Track first-paint for mount phase
    if (phase === 'mount') {
      const mountStart = this.mountStartTimes.get(id);
      if (mountStart) {
        const firstPaint = commitTime - mountStart;
        this.firstPaintTimes.set(id, firstPaint);
        console.log(`[35.1][PROFILER][${id}] First-paint: ${firstPaint.toFixed(2)}ms`);
      }
    }

    // Log to console
    console.log(
      `[35.1][PROFILER][${id}] ${phase === 'mount' ? 'MOUNT' : 'UPDATE'}: ` +
      `actual=${actualDuration.toFixed(2)}ms, base=${baseDuration.toFixed(2)}ms`
    );

    // Warning for slow renders
    if (actualDuration > 60) {
      console.warn(
        `[35.1][PROFILER][${id}] ⚠️ SLOW ${phase.toUpperCase()}: ${actualDuration.toFixed(2)}ms (threshold: 60ms)`
      );
    }
  };

  /**
   * Mark the start of a component mount for first-paint calculation
   */
  markMountStart(componentName: string) {
    this.mountStartTimes.set(componentName, performance.now());
  }

  /**
   * Get aggregated metrics for a component
   */
  getMetrics(componentName: string): AggregatedMetrics | null {
    const componentMetrics = this.metrics.get(componentName);
    if (!componentMetrics || componentMetrics.length === 0) {
      return null;
    }

    const mountMetric = componentMetrics.find(m => m.phase === 'mount');
    const updateMetrics = componentMetrics.filter(m => m.phase === 'update');

    const totalUpdateTime = updateMetrics.reduce((sum, m) => sum + m.actualDuration, 0);
    const maxUpdateTime = updateMetrics.length > 0 
      ? Math.max(...updateMetrics.map(m => m.actualDuration))
      : 0;

    return {
      componentName,
      mountTime: mountMetric?.actualDuration ?? null,
      totalRenders: componentMetrics.length,
      totalUpdateTime,
      averageUpdateTime: updateMetrics.length > 0 ? totalUpdateTime / updateMetrics.length : 0,
      maxUpdateTime,
      firstPaintTime: this.firstPaintTimes.get(componentName) ?? null
    };
  }

  /**
   * Get all metrics for all profiled components
   */
  getAllMetrics(): AggregatedMetrics[] {
    const components = Array.from(this.metrics.keys());
    return components
      .map(name => this.getMetrics(name))
      .filter((m): m is AggregatedMetrics => m !== null);
  }

  /**
   * Generate summary report
   */
  generateReport(): string {
    const metrics = this.getAllMetrics();
    
    let report = '\n';
    report += '═══════════════════════════════════════════════════════════\n';
    report += '  Phase 35.1 - React Profiler Performance Report\n';
    report += '═══════════════════════════════════════════════════════════\n\n';

    metrics.forEach(m => {
      report += `Component: ${m.componentName}\n`;
      report += `  First-Paint: ${m.firstPaintTime !== null ? m.firstPaintTime.toFixed(2) + 'ms' : 'N/A'}\n`;
      report += `  Mount Time: ${m.mountTime !== null ? m.mountTime.toFixed(2) + 'ms' : 'N/A'}\n`;
      report += `  Total Renders: ${m.totalRenders}\n`;
      report += `  Avg Update: ${m.averageUpdateTime.toFixed(2)}ms\n`;
      report += `  Max Update: ${m.maxUpdateTime.toFixed(2)}ms\n`;
      report += `  Total Update Time: ${m.totalUpdateTime.toFixed(2)}ms\n`;
      
      // Check thresholds
      const issues: string[] = [];
      if (m.firstPaintTime && m.firstPaintTime > 800) {
        issues.push(`First-paint exceeds 800ms threshold (${m.firstPaintTime.toFixed(2)}ms)`);
      }
      if (m.averageUpdateTime > 60) {
        issues.push(`Avg update exceeds 60ms threshold (${m.averageUpdateTime.toFixed(2)}ms)`);
      }
      if (m.totalUpdateTime > 120) {
        issues.push(`Cumulative render time exceeds 120ms threshold (${m.totalUpdateTime.toFixed(2)}ms)`);
      }
      
      if (issues.length > 0) {
        report += '  ⚠️ ISSUES:\n';
        issues.forEach(issue => {
          report += `    - ${issue}\n`;
        });
      } else {
        report += '  ✅ All metrics within thresholds\n';
      }
      report += '\n';
    });

    report += '═══════════════════════════════════════════════════════════\n';
    
    return report;
  }

  /**
   * Check if all metrics pass thresholds
   */
  checkThresholds(): { passed: boolean; violations: string[] } {
    const metrics = this.getAllMetrics();
    const violations: string[] = [];

    metrics.forEach(m => {
      if (m.firstPaintTime && m.firstPaintTime > 800) {
        violations.push(`${m.componentName}: First-paint ${m.firstPaintTime.toFixed(2)}ms > 800ms`);
      }
      if (m.averageUpdateTime > 60) {
        violations.push(`${m.componentName}: Avg update ${m.averageUpdateTime.toFixed(2)}ms > 60ms`);
      }
      if (m.totalUpdateTime > 120) {
        violations.push(`${m.componentName}: Cumulative ${m.totalUpdateTime.toFixed(2)}ms > 120ms`);
      }
    });

    return {
      passed: violations.length === 0,
      violations
    };
  }

  /**
   * Export metrics as JSON for reporting
   */
  exportMetrics() {
    const metrics = this.getAllMetrics();
    const thresholds = this.checkThresholds();

    return {
      timestamp: new Date().toISOString(),
      metrics,
      thresholds,
      summary: {
        totalComponents: metrics.length,
        allPassed: thresholds.passed,
        violationCount: thresholds.violations.length
      }
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.metrics.clear();
    this.firstPaintTimes.clear();
    this.mountStartTimes.clear();
  }
}

// Global profiler instance
export const performanceProfiler = new PerformanceProfiler();

// Export to window for console access with helper functions
if (typeof window !== 'undefined') {
  (window as any).__PERFORMANCE_PROFILER__ = performanceProfiler;
  
  // Add helper functions to window
  (window as any).exportPerformanceReport = () => {
    const report = performanceProfiler.generateReport();
    console.log(report);
    
    const exportData = performanceProfiler.exportMetrics();
    console.log('\n📊 Exportable JSON:');
    console.log(JSON.stringify(exportData, null, 2));
    
    return exportData;
  };
  
  (window as any).checkPerformanceThresholds = () => {
    const results = performanceProfiler.checkThresholds();
    
    if (results.passed) {
      console.log('✅ All performance metrics within thresholds!');
    } else {
      console.warn('⚠️ Performance threshold violations:');
      results.violations.forEach(v => console.warn(`  - ${v}`));
    }
    
    return results;
  };
  
  console.log('[35.1][PROFILER] Performance monitoring active. Use:');
  console.log('  - exportPerformanceReport() to view full metrics');
  console.log('  - checkPerformanceThresholds() to validate against targets');
}
