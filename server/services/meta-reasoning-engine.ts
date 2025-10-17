import { nanoid } from 'nanoid';
import { db } from '../db';
import { metaReasoningLog, reasoningTrace, reasoningQueue } from '@shared/schema';
import { contextBridge } from './context-bridge';
import { eq, desc } from 'drizzle-orm';

/**
 * Phase 8.9.2: Meta-Reasoning Engine
 * Performs recursive validation and correction of reasoning traces
 */

export interface IntegrityAnalysis {
  analysisId: string;
  traceId: string;
  result: 'coherent' | 'inconsistent' | 'requires_correction';
  integrityScore: number;
  detectedIssues: string[];
  recommendations: string[];
}

export interface CorrectionPlan {
  analysisId: string;
  traceId: string;
  actions: CorrectionAction[];
  priority: 'low' | 'medium' | 'high';
  estimatedImpact: string;
}

export interface CorrectionAction {
  type: 'adjust_step' | 'retry_task' | 'update_parameter' | 'invalidate_cache';
  target: string;
  params: Record<string, any>;
  rationale: string;
}

class MetaReasoningEngineService {
  /**
   * Analyze reasoning trace integrity
   * Verifies coherence, recursion, and decision accuracy
   */
  async analyzeTraceIntegrity(traceId: string): Promise<IntegrityAnalysis> {
    const analysisId = `meta_${nanoid(12)}`;
    const startTime = performance.now();

    console.log(`[MetaReasoning] 🔍 Analyzing trace integrity: ${traceId}`);

    try {
      // 1. Fetch reasoning trace
      const traces = await db
        .select()
        .from(reasoningTrace)
        .where(eq(reasoningTrace.traceId, traceId))
        .limit(1);

      if (traces.length === 0) {
        throw new Error(`Trace not found: ${traceId}`);
      }

      const trace = traces[0];
      const steps = trace.steps as any[];
      const detectedIssues: string[] = [];
      const recommendations: string[] = [];

      // 2. Validate step coherence
      if (steps.length === 0) {
        detectedIssues.push('Empty reasoning trace - no steps executed');
      }

      // 3. Check for failed steps
      const failedSteps = steps.filter(s => s.status === 'failed');
      if (failedSteps.length > 0) {
        detectedIssues.push(`${failedSteps.length} failed steps detected`);
        recommendations.push('Retry failed steps with adjusted parameters');
      }

      // 4. Check for incomplete traces
      if (trace.status === 'interrupted' || trace.status === 'failed') {
        detectedIssues.push(`Trace incomplete (status: ${trace.status})`);
        recommendations.push('Re-execute trace from last successful step');
      }

      // 5. Analyze step dependencies
      const completedSteps = steps.filter(s => s.status === 'completed');
      const incompleteSteps = steps.filter(s => s.status === 'pending' || s.status === 'in_progress');
      
      if (incompleteSteps.length > 0 && trace.status === 'completed') {
        detectedIssues.push('Trace marked complete but has pending steps');
        recommendations.push('Update trace status or complete pending steps');
      }

      // 6. Validate domain context
      if (!trace.domainContext || trace.domainContext.length === 0) {
        detectedIssues.push('No domain context assigned');
        recommendations.push('Assign appropriate domain context for better reasoning');
      }

      // 7. Calculate integrity score (0-1)
      const integrityScore = this.calculateIntegrityScore({
        totalSteps: steps.length,
        completedSteps: completedSteps.length,
        failedSteps: failedSteps.length,
        hasDecisionSummary: !!trace.decisionSummary,
        hasDomainContext: !!(trace.domainContext && trace.domainContext.length > 0),
        traceStatus: trace.status,
      });

      // 8. Determine analysis result
      let result: 'coherent' | 'inconsistent' | 'requires_correction';
      if (integrityScore >= 0.8 && detectedIssues.length === 0) {
        result = 'coherent';
      } else if (integrityScore < 0.5 || failedSteps.length > steps.length / 2) {
        result = 'requires_correction';
      } else {
        result = 'inconsistent';
      }

      // 9. Record analysis in database
      await db.insert(metaReasoningLog).values({
        analysisId,
        targetTraceId: traceId,
        analysisResult: result,
        integrityScore,
        detectedIssues: detectedIssues as any,
        executionTimeMs: Math.round(performance.now() - startTime),
        metadata: { 
          totalSteps: steps.length,
          completedSteps: completedSteps.length,
          failedSteps: failedSteps.length,
          traceStatus: trace.status,
        } as any,
      });

      console.log(`[MetaReasoning] ✅ Analysis complete - Result: ${result}, Score: ${integrityScore.toFixed(2)}`);

      return {
        analysisId,
        traceId,
        result,
        integrityScore,
        detectedIssues,
        recommendations,
      };
    } catch (error) {
      console.error(`[MetaReasoning] ❌ Analysis failed:`, error);
      throw error;
    }
  }

  /**
   * Generate correction plan for identified issues
   */
  async generateCorrectionPlan(analysisId: string): Promise<CorrectionPlan> {
    console.log(`[MetaReasoning] 📋 Generating correction plan for analysis: ${analysisId}`);

    try {
      // 1. Fetch analysis results
      const analyses = await db
        .select()
        .from(metaReasoningLog)
        .where(eq(metaReasoningLog.analysisId, analysisId))
        .limit(1);

      if (analyses.length === 0) {
        throw new Error(`Analysis not found: ${analysisId}`);
      }

      const analysis = analyses[0];
      const detectedIssues = (analysis.detectedIssues as any) || [];
      const actions: CorrectionAction[] = [];

      // 2. Generate correction actions based on detected issues
      for (const issue of detectedIssues) {
        if (issue.includes('failed steps')) {
          actions.push({
            type: 'retry_task',
            target: 'failed_steps',
            params: { maxRetries: 3, backoffMs: 1000 },
            rationale: 'Retry failed steps with exponential backoff',
          });
        }

        if (issue.includes('incomplete')) {
          actions.push({
            type: 'adjust_step',
            target: 'trace_status',
            params: { newStatus: 'in_progress' },
            rationale: 'Reset trace to in-progress to complete pending steps',
          });
        }

        if (issue.includes('No domain context')) {
          actions.push({
            type: 'update_parameter',
            target: 'domain_context',
            params: { domains: ['general'] },
            rationale: 'Assign general domain for unclassified reasoning',
          });
        }

        if (issue.includes('pending steps')) {
          actions.push({
            type: 'invalidate_cache',
            target: 'reasoning_queue',
            params: { traceId: analysis.targetTraceId },
            rationale: 'Clear queue cache to re-process pending tasks',
          });
        }
      }

      // 3. Determine priority
      const integrityScore = analysis.integrityScore || 0;
      const priority = integrityScore < 0.5 ? 'high' 
        : integrityScore < 0.7 ? 'medium' 
        : 'low';

      // 4. Build correction plan
      const plan: CorrectionPlan = {
        analysisId,
        traceId: analysis.targetTraceId,
        actions,
        priority,
        estimatedImpact: this.estimateImpact(actions),
      };

      // 5. Update analysis with correction plan
      await db
        .update(metaReasoningLog)
        .set({ correctionPlan: plan as any })
        .where(eq(metaReasoningLog.analysisId, analysisId));

      console.log(`[MetaReasoning] ✅ Correction plan generated - ${actions.length} actions, priority: ${priority}`);

      return plan;
    } catch (error) {
      console.error(`[MetaReasoning] ❌ Plan generation failed:`, error);
      throw error;
    }
  }

  /**
   * Execute correction plan
   */
  async executeCorrectionPlan(analysisId: string): Promise<{ success: boolean; results: any[] }> {
    const startTime = performance.now();

    console.log(`[MetaReasoning] 🔧 Executing correction plan: ${analysisId}`);

    try {
      // 1. Fetch analysis and correction plan
      const analyses = await db
        .select()
        .from(metaReasoningLog)
        .where(eq(metaReasoningLog.analysisId, analysisId))
        .limit(1);

      if (analyses.length === 0) {
        throw new Error(`Analysis not found: ${analysisId}`);
      }

      const analysis = analyses[0];
      const plan = analysis.correctionPlan as any;

      if (!plan || !plan.actions) {
        throw new Error('No correction plan available');
      }

      const results: any[] = [];

      // 2. Execute each correction action
      for (const action of plan.actions) {
        try {
          const result = await this.executeAction(action, analysis.targetTraceId);
          results.push({ action: action.type, success: true, result });
          console.log(`[MetaReasoning] ✅ Action executed: ${action.type}`);
        } catch (error) {
          results.push({ 
            action: action.type, 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          });
          console.error(`[MetaReasoning] ❌ Action failed: ${action.type}`, error);
        }
      }

      const success = results.every(r => r.success);

      // 3. Update analysis with correction results
      await db
        .update(metaReasoningLog)
        .set({ 
          correctionApplied: success,
          correctionResult: results as any,
        })
        .where(eq(metaReasoningLog.analysisId, analysisId));

      // 4. Broadcast results via Context Bridge
      await contextBridge.broadcast({
        type: 'state_update',
        userId: undefined, // System-wide update
        payload: {
          analysisId,
          correctionApplied: success,
          actionsExecuted: results.length,
          eventSubtype: 'meta_reasoning_correction',
        },
      });

      console.log(`[MetaReasoning] ✅ Correction plan executed - Success: ${success}, Actions: ${results.length}`);

      return { success, results };
    } catch (error) {
      console.error(`[MetaReasoning] ❌ Plan execution failed:`, error);
      throw error;
    }
  }

  /**
   * Execute individual correction action
   */
  private async executeAction(action: CorrectionAction, traceId: string): Promise<any> {
    switch (action.type) {
      case 'retry_task':
        // Queue failed tasks for retry
        const failedTasks = await db
          .select()
          .from(reasoningQueue)
          .where(eq(reasoningQueue.traceId, traceId));
        
        for (const task of failedTasks) {
          if (task.status === 'failed') {
            await db
              .update(reasoningQueue)
              .set({ status: 'pending', retryCount: 0 })
              .where(eq(reasoningQueue.id, task.id));
          }
        }
        return { retriedTasks: failedTasks.length };

      case 'adjust_step':
        // Update trace status
        await db
          .update(reasoningTrace)
          .set({ status: action.params.newStatus as any })
          .where(eq(reasoningTrace.traceId, traceId));
        return { updatedStatus: action.params.newStatus };

      case 'update_parameter':
        // Update domain context
        if (action.target === 'domain_context') {
          await db
            .update(reasoningTrace)
            .set({ domainContext: action.params.domains })
            .where(eq(reasoningTrace.traceId, traceId));
        }
        return { updatedParameter: action.target };

      case 'invalidate_cache':
        // Mark queue items for reprocessing
        await db
          .update(reasoningQueue)
          .set({ status: 'pending', lockedAt: null, lockedBy: null })
          .where(eq(reasoningQueue.traceId, traceId));
        return { invalidatedCache: true };

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Calculate integrity score (0-1)
   */
  private calculateIntegrityScore(params: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    hasDecisionSummary: boolean;
    hasDomainContext: boolean;
    traceStatus: string;
  }): number {
    const { totalSteps, completedSteps, failedSteps, hasDecisionSummary, hasDomainContext, traceStatus } = params;

    if (totalSteps === 0) return 0;

    const completionRate = completedSteps / totalSteps;
    const failureRate = failedSteps / totalSteps;
    const summaryBonus = hasDecisionSummary ? 0.1 : 0;
    const contextBonus = hasDomainContext ? 0.1 : 0;
    const statusPenalty = traceStatus === 'failed' ? 0.3 : traceStatus === 'interrupted' ? 0.2 : 0;

    const score = completionRate - (failureRate * 0.5) + summaryBonus + contextBonus - statusPenalty;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Estimate impact of correction plan
   */
  private estimateImpact(actions: CorrectionAction[]): string {
    if (actions.length === 0) return 'No actions';
    if (actions.length === 1) return 'Minor adjustment';
    if (actions.some(a => a.type === 'retry_task')) return 'Moderate - includes retries';
    if (actions.length > 3) return 'Significant - multiple corrections';
    return 'Moderate';
  }

  /**
   * Get recent meta-reasoning analyses
   */
  async getRecentAnalyses(limit: number = 10): Promise<any[]> {
    return await db
      .select()
      .from(metaReasoningLog)
      .orderBy(desc(metaReasoningLog.createdAt))
      .limit(limit);
  }
}

export const metaReasoningEngine = new MetaReasoningEngineService();
