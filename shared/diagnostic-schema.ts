/**
 * Diagnostic Schema - Phase 5.9
 * Defines types and structures for Walter↔Bob communication protocol
 */

// Diagnostic trigger types
export type DiagnosticTriggerType = 'error_based' | 'user_initiated' | 'walter_initiated';

// Bob inspection types
export type InspectionType = 
  | 'code_analysis'
  | 'log_search'
  | 'data_consistency'
  | 'schema_verification'
  | 'system_state'
  | 'error_trace';

// Severity levels for findings
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

// Bob → Walter: Inspection Report
export interface BobInspectionReport {
  timestamp: string;
  triggerType: DiagnosticTriggerType;
  triggerSource?: string; // User ID or system component
  inspectionType: InspectionType;
  findings: Finding[];
  rawData?: Record<string, any>;
  status: 'completed' | 'partial' | 'failed';
  errorMessage?: string;
}

export interface Finding {
  severity: FindingSeverity;
  category: string;
  description: string;
  location?: {
    file?: string;
    line?: number;
    function?: string;
    table?: string;
    column?: string;
  };
  evidence?: string | Record<string, any>;
  suggestedAction?: string;
}

// Walter → Bob: Inspection Command
export interface BobInspectionCommand {
  commandId: string;
  triggerType: DiagnosticTriggerType;
  triggerSource?: string;
  inspectionType: InspectionType;
  searchScope?: {
    files?: string[];
    directories?: string[];
    tables?: string[];
    timeRange?: { start: string; end: string };
  };
  searchCriteria?: {
    errorPattern?: string;
    logLevel?: string[];
    keywords?: string[];
    userId?: string;
  };
  expectedOutcome?: string;
  priority: 'urgent' | 'normal' | 'low';
}

// Walter: Patch Proposal
export interface PatchProposal {
  proposalId: string;
  timestamp: string;
  sourceReport: string; // Bob inspection report ID
  file: string;
  issue: string;
  proposedFix: string;
  reason: string;
  severity: FindingSeverity;
  estimatedImpact: 'breaking' | 'major' | 'minor' | 'patch';
  testingRequired: boolean;
  kyleApproved: boolean;
  appliedAt?: string;
  rollbackChecksum?: string;
}

// Diagnostic event for transparency logging
export interface DiagnosticEvent {
  eventId: string;
  timestamp: string;
  eventType: 'trigger' | 'inspection' | 'analysis' | 'proposal' | 'approval' | 'application';
  triggerType?: DiagnosticTriggerType;
  userId?: string;
  component: 'bob' | 'walter' | 'controller' | 'system';
  action: string;
  status: 'initiated' | 'in_progress' | 'completed' | 'failed';
  metadata?: Record<string, any>;
}

// Safety validation result
export interface SafetyValidation {
  isApproved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  reason?: string;
  constraints?: Record<string, any>;
}
