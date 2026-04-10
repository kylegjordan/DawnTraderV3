/**
 * Diagnostic Controller - Phase 5.9
 *
 * Coordinates diagnostic workflows and patch proposal management.
 * Directive 12.2.3: Bob inspector integration removed (file deleted in Batch 7A).
 * Inspection methods now return empty reports. Patch proposal/approval logic preserved.
 */

import { storage } from '../storage';
// Directive 12.2.3: bobInspector import removed (file deleted in Batch 7A)
import { v4 as uuidv4 } from 'uuid';
import {
  DiagnosticTriggerType,
  BobInspectionCommand,
  BobInspectionReport,
  PatchProposal,
  DiagnosticEvent,
  InspectionType
} from '@shared/diagnostic-schema';

export class DiagnosticController {
  // In-memory proposals store with approval status
  private proposals: Map<string, PatchProposal & { approved: boolean }> = new Map();

  /**
   * Trigger error-based diagnostic
   * Automatically triggered when system detects errors
   */
  async triggerErrorDiagnostic(errorId: string, userId?: string): Promise<BobInspectionReport> {
    console.log(`[DiagnosticController] 🚨 Error-based diagnostic triggered for error: ${errorId}`);

    await this.logDiagnosticEvent({
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: 'trigger',
      triggerType: 'error_based',
      userId,
      component: 'controller',
      action: `Error diagnostic triggered for ${errorId}`,
      status: 'initiated',
      metadata: { errorId }
    });

    const command: BobInspectionCommand = {
      commandId: uuidv4(),
      triggerType: 'error_based',
      triggerSource: errorId,
      inspectionType: 'error_trace',
      priority: 'urgent'
    };

    // Directive 12.2.3: bobInspector removed — return empty report
    const report: BobInspectionReport = { status: 'completed', findings: [], commandId: command.commandId, timestamp: new Date().toISOString() };

    await this.logDiagnosticEvent({
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: 'inspection',
      triggerType: 'error_based',
      userId,
      component: 'bob',
      action: 'Error inspection completed',
      status: report.status === 'completed' ? 'completed' : 'failed',
      metadata: { 
        errorId,
        findingsCount: report.findings.length,
        criticalFindings: report.findings.filter(f => f.severity === 'critical').length
      }
    });

    return report;
  }

  /**
   * Trigger user-initiated diagnostic
   * Manually requested by Kyle via chat or UI
   */
  async triggerUserDiagnostic(
    userId: string,
    inspectionType: InspectionType,
    searchScope?: BobInspectionCommand['searchScope']
  ): Promise<BobInspectionReport> {
    console.log(`[DiagnosticController] 👤 User-initiated diagnostic: ${inspectionType}`);

    await this.logDiagnosticEvent({
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: 'trigger',
      triggerType: 'user_initiated',
      userId,
      component: 'controller',
      action: `User requested ${inspectionType} inspection`,
      status: 'initiated',
      metadata: { inspectionType, searchScope }
    });

    const command: BobInspectionCommand = {
      commandId: uuidv4(),
      triggerType: 'user_initiated',
      triggerSource: userId,
      inspectionType,
      searchScope,
      priority: 'normal'
    };

    // Directive 12.2.3: bobInspector removed — return empty report
    const report: BobInspectionReport = { status: 'completed', findings: [], commandId: command.commandId, timestamp: new Date().toISOString() };

    await this.logDiagnosticEvent({
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: 'inspection',
      triggerType: 'user_initiated',
      userId,
      component: 'bob',
      action: `${inspectionType} inspection completed`,
      status: report.status === 'completed' ? 'completed' : 'failed',
      metadata: { 
        inspectionType,
        findingsCount: report.findings.length,
        severities: this.summarizeSeverities(report.findings)
      }
    });

    return report;
  }



  /**
   * Create a patch proposal from Bob's inspection report
   */
  async createPatchProposal(
    reportId: string,
    finding: BobInspectionReport['findings'][0],
    userId: string
  ): Promise<PatchProposal> {
    console.log(`[DiagnosticController] 📝 Creating patch proposal for finding: ${finding.description}`);

    const proposal: PatchProposal = {
      proposalId: uuidv4(),
      timestamp: new Date().toISOString(),
      sourceReport: reportId,
      file: finding.location?.file || 'unknown',
      issue: finding.description,
      proposedFix: finding.suggestedAction || 'Manual investigation required',
      reason: `Bob detected ${finding.severity} severity issue in ${finding.category}`,
      severity: finding.severity,
      estimatedImpact: this.estimateImpact(finding.severity),
      testingRequired: finding.severity === 'critical' || finding.severity === 'high',
      kyleApproved: false
    };

    await this.logDiagnosticEvent({
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: 'proposal',
      userId,
      component: 'diagnostics',
      action: 'Patch proposal created',
      status: 'completed',
      metadata: {
        proposalId: proposal.proposalId,
        file: proposal.file,
        severity: proposal.severity,
        impact: proposal.estimatedImpact
      }
    });

    // Store proposal in transparency log
    await storage.createTransparencyLog({
      userId,
      taskName: 'Diagnostic Patch Proposal',
      success: true,
      mode: 'paper',
      resultSummary: `Patch proposal created: ${proposal.issue}`,
      notes: JSON.stringify({
        proposalId: proposal.proposalId,
        file: proposal.file,
        severity: proposal.severity,
        fix: proposal.proposedFix
      })
    });

    // Store in proposals map with approval status
    this.proposals.set(proposal.proposalId, {
      ...proposal,
      approved: false
    });

    return proposal;
  }

  /**
   * Approve and apply a patch proposal
   * Requires explicit Kyle approval
   */
  async approvePatchProposal(
    proposalId: string,
    userId: string,
    approved: boolean,
    notes?: string
  ): Promise<void> {
    console.log(`[DiagnosticController] ${approved ? '✅' : '❌'} Patch proposal ${proposalId}: ${approved ? 'APPROVED' : 'REJECTED'}`);

    // Update proposal approval status in map
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    proposal.approved = approved;
    proposal.kyleApproved = approved;
    this.proposals.set(proposalId, proposal);

    await this.logDiagnosticEvent({
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: 'approval',
      userId,
      component: 'controller',
      action: approved ? 'Patch approved by Kyle' : 'Patch rejected by Kyle',
      status: 'completed',
      metadata: {
        proposalId,
        approved,
        notes
      }
    });

    if (approved) {
      await storage.createTransparencyLog({
        userId,
        taskName: 'Diagnostic Patch Approved',
        success: true,
        mode: 'paper',
        resultSummary: `Patch proposal ${proposalId} approved by Kyle`,
        notes: notes || 'No additional notes'
      });
    } else {
      await storage.createTransparencyLog({
        userId,
        taskName: 'Diagnostic Patch Rejected',
        success: true,
        mode: 'paper',
        resultSummary: `Patch proposal ${proposalId} rejected by Kyle`,
        notes: notes || 'No reason provided'
      });
    }
  }

  /**
   * Get proposal by ID
   */
  getProposal(proposalId: string): (PatchProposal & { approved: boolean }) | undefined {
    return this.proposals.get(proposalId);
  }

  /**
   * Apply a patch - ENFORCES approval check
   * This method blocks any attempt to apply unapproved patches
   */
  async applyPatch(proposalId: string, userId: string): Promise<void> {
    const proposal = this.proposals.get(proposalId);
    
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    // CRITICAL: Enforce approval gate
    if (!proposal.kyleApproved || !proposal.approved) {
      throw new Error(`BLOCKED: Patch ${proposalId} cannot be applied - Kyle approval required (kyleApproved=${proposal.kyleApproved})`);
    }

    console.log(`[DiagnosticController] 🚀 Applying approved patch ${proposalId}`);

    await this.logDiagnosticEvent({
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: 'application',
      userId,
      component: 'controller',
      action: 'Approved patch applied',
      status: 'completed',
      metadata: {
        proposalId,
        file: proposal.file,
        fix: proposal.proposedFix
      }
    });

    await storage.createTransparencyLog({
      userId,
      taskName: 'Diagnostic Patch Applied',
      success: true,
      mode: 'paper',
      resultSummary: `Approved patch ${proposalId} successfully applied`,
      notes: `File: ${proposal.file}, Fix: ${proposal.proposedFix}`
    });
  }

  /**
   * Log diagnostic event to transparency logs
   */
  private async logDiagnosticEvent(event: DiagnosticEvent): Promise<void> {
    try {
      await storage.createTransparencyLog({
        userId: event.userId || 'system',
        taskName: `Diagnostic: ${event.eventType}`,
        success: event.status === 'completed',
        mode: 'paper',
        resultSummary: event.action,
        notes: JSON.stringify({
          eventId: event.eventId,
          component: event.component,
          triggerType: event.triggerType,
          metadata: event.metadata
        })
      });
    } catch (error) {
      console.error('[DiagnosticController] Failed to log event:', error);
    }
  }

  /**
   * Summarize finding severities for logging
   */
  private summarizeSeverities(findings: BobInspectionReport['findings']): Record<string, number> {
    const summary: Record<string, number> = {};
    findings.forEach(f => {
      summary[f.severity] = (summary[f.severity] || 0) + 1;
    });
    return summary;
  }

  /**
   * Estimate change impact based on severity
   */
  private estimateImpact(severity: BobInspectionReport['findings'][0]['severity']): PatchProposal['estimatedImpact'] {
    switch (severity) {
      case 'critical':
        return 'breaking';
      case 'high':
        return 'major';
      case 'medium':
        return 'minor';
      default:
        return 'patch';
    }
  }
}

// Export singleton instance
export const diagnosticController = new DiagnosticController();
