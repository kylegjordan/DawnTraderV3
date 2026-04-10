/**
 * Diagnostic Schema - Phase 5.9
 * Defines types and structures for diagnostic communication protocol
 */

// Diagnostic trigger types
export type DiagnosticTriggerType = 'error_based' | 'user_initiated';

// Bob inspection types
export type InspectionType = 
  | 'code_analysis'
  | 'log_search'
  | 'data_consistency'
  | 'schema_verification'
  | 'system_state'
  | 'error_trace'
  | 'frontend_health'     // Phase 6.0 Addendum A
  | 'ui_performance'       // Phase 6.0 Addendum A
  | 'render_metrics';      // Phase 6.0 Addendum A

// Severity levels for findings
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

// Inspection Report
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

// Inspection Command
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

// Patch Proposal
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
  component: 'bob' | 'controller' | 'system';
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

// Frontend Health Metrics - Phase 6.0 Addendum A
export interface FrontendHealthReport {
  timestamp: string;
  buildStatus: 'success' | 'failed' | 'warning';
  bundleSize?: {
    total: number;
    js: number;
    css: number;
    assets: number;
  };
  renderMetrics?: {
    lcp?: number; // Largest Contentful Paint (ms)
    fcp?: number; // First Contentful Paint (ms)
    cls?: number; // Cumulative Layout Shift
    fid?: number; // First Input Delay (ms)
    ttfb?: number; // Time to First Byte (ms)
  };
  uiErrors: UIError[];
  componentHealth: {
    registered: number;
    failed: number;
    warnings: string[];
  };
  themeIntegrity: {
    darkModeWorking: boolean;
    missingVariables: string[];
    contrastIssues: string[];
  };
}

export interface UIError {
  timestamp: string;
  type: 'react_error' | 'console_error' | 'network_error' | 'render_error';
  message: string;
  stack?: string;
  component?: string;
  severity: FindingSeverity;
}

// UX Analysis Request
export interface UXAnalysisRequest {
  requestId: string;
  analysisType: 'design_review' | 'aesthetic_evaluation' | 'accessibility_check' | 'user_flow_analysis';
  targetComponent?: string;
  targetPage?: string;
  userFeedback?: string;
  metrics?: FrontendHealthReport;
}

// UX Analysis Response
export interface UXAnalysisResponse {
  requestId: string;
  timestamp: string;
  analysisType: string;
  findings: UXFinding[];
  recommendations: UXRecommendation[];
  overallScore?: number; // 1-10 scale
  summary: string;
}

export interface UXFinding {
  category: 'layout' | 'hierarchy' | 'accessibility' | 'performance' | 'consistency' | 'feedback';
  severity: FindingSeverity;
  description: string;
  location?: string;
  userImpact: 'high' | 'medium' | 'low';
}

export interface UXRecommendation {
  priority: 'must_fix' | 'should_improve' | 'nice_to_have';
  category: string;
  suggestion: string;
  implementation?: string; // How to implement (file paths, code changes)
  expectedBenefit: string;
}
