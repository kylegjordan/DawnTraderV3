/**
 * Walter Reasoning Templates - Phase 6.0
 * 
 * Structured response patterns for technical explanations across:
 * - Architecture Trace
 * - DevOps Diagnosis  
 * - Database Insight
 * - Design Review
 * - Aesthetic Evaluation
 * - Accessibility Check
 */

import { FrontendHealthReport, UXAnalysisResponse, UXFinding, UXRecommendation } from '@shared/diagnostic-schema';

export interface ArchitectureTraceResult {
  flow: string[];
  artifacts: string[];
  dataFlow: string;
  explanation: string;
}

export interface DevOpsDiagnosisResult {
  rootCause: string;
  affectedComponents: string[];
  infraContext: string;
  suggestedFix: string;
}

export interface DatabaseInsightResult {
  tables: string[];
  relationships: string;
  dataFlow: string;
  queryOptimization?: string;
}

/**
 * Architecture Trace Template
 * Explains request flow from frontend through backend to database
 */
export function createArchitectureTrace(
  startPoint: string,
  endpoint?: string
): ArchitectureTraceResult {
  // Default flow pattern for API requests
  const defaultFlow = [
    `1. User action in ${startPoint}`,
    '2. Frontend sends request via TanStack Query (apiRequest)',
    '3. Request hits Express route in server/routes.ts',
    '4. Route calls appropriate service method',
    '5. Service uses storage interface (server/storage.ts)',
    '6. Drizzle ORM executes SQL query via Neon driver',
    '7. Database returns data',
    '8. Service processes and returns to route',
    '9. Response sent back to frontend',
    '10. TanStack Query updates cache and triggers re-render'
  ];

  return {
    flow: defaultFlow,
    artifacts: [
      startPoint,
      'server/routes.ts',
      'server/services/*',
      'server/storage.ts',
      'shared/schema.ts (Drizzle tables)',
      'Database (Neon PostgreSQL)'
    ],
    dataFlow: `Data flows from ${startPoint} → Backend API → Storage Layer → Database and back`,
    explanation: `This is how the system processes requests from ${startPoint}. Each layer has a specific responsibility, making the code maintainable and testable.`
  };
}

/**
 * DevOps Diagnosis Template
 * Identifies root causes with infrastructure context
 */
export function createDevOpsDiagnosis(
  symptom: string,
  bobFindings?: any[]
): DevOpsDiagnosisResult {
  const affectedComponents: string[] = [];
  let rootCause = '';
  let infraContext = '';
  let suggestedFix = '';

  // Analyze symptom patterns
  if (symptom.toLowerCase().includes('database') || symptom.toLowerCase().includes('query')) {
    rootCause = 'Database connection or query performance issue';
    affectedComponents.push('Neon PostgreSQL', 'Drizzle ORM', 'server/storage.ts');
    infraContext = 'The application uses Neon serverless PostgreSQL. Connection pooling and query optimization are critical for performance.';
    suggestedFix = 'Check database connection status, review slow query logs, consider adding indexes to frequently queried columns.';
  } else if (symptom.toLowerCase().includes('error') || symptom.toLowerCase().includes('crash')) {
    rootCause = 'Runtime error in application code';
    affectedComponents.push('Error Handler', 'Diagnostic Controller', 'Bob Inspector');
    infraContext = 'Bob automatically detects errors and triggers diagnostic workflows. All errors are logged to the errorLogs table.';
    suggestedFix = 'Bob has likely already created a diagnostic report. Check the ai_transparency_log for Bob\'s findings and Walter\'s patch proposals.';
  } else if (symptom.toLowerCase().includes('frontend') || symptom.toLowerCase().includes('ui')) {
    rootCause = 'Frontend rendering or component issue';
    affectedComponents.push('React Components', 'Vite Build', 'TanStack Query');
    infraContext = 'Frontend uses React 18 with Vite for fast builds and TanStack Query for state management.';
    suggestedFix = 'Bob can run frontend_health inspection to check build status, theme integrity, and component health.';
  } else {
    rootCause = 'System-level issue requiring investigation';
    affectedComponents.push('System Monitor', 'Health Checks');
    infraContext = 'The monitoring system tracks health metrics and can detect anomalies.';
    suggestedFix = 'Run a full system state inspection to gather diagnostic data.';
  }

  return {
    rootCause,
    affectedComponents,
    infraContext,
    suggestedFix
  };
}

/**
 * Database Insight Template
 * Describes table structure and relationships
 */
export function createDatabaseInsight(
  topic: string
): DatabaseInsightResult {
  const insights: Record<string, DatabaseInsightResult> = {
    trading: {
      tables: ['users', 'trading_settings', 'trades', 'watchlist_pairs'],
      relationships: 'users → trading_settings (1:1), users → trades (1:many), users → watchlist_pairs (1:many)',
      dataFlow: 'User configures settings → Strategy engine scans watchlist → Trades executed and recorded',
      queryOptimization: 'Indexes on userId, status, and timestamp columns for fast filtering'
    },
    ai: {
      tables: ['ai_conversations', 'semantic_memory', 'ai_transparency_log', 'ai_opportunities'],
      relationships: 'users → ai_conversations (1:many), ai_conversations → semantic_memory (via vector embeddings)',
      dataFlow: 'User chats → Conversation stored → Summarized → Embedded into semantic memory → Used for future context',
      queryOptimization: 'pgvector index on embedding column for fast similarity search'
    },
    diagnostic: {
      tables: ['diagnostic_reports (in-memory)', 'patch_proposals (in-memory)', 'ai_transparency_log'],
      relationships: 'Bob generates diagnostic_reports → Walter creates patch_proposals → Transparency logged',
      dataFlow: 'Error detected → Bob inspects → Walter analyzes → Proposal created → Kyle approves → Applied',
      queryOptimization: 'In-memory Maps used for proposals to avoid database timeout issues'
    },
    walter: {
      tables: ['walter_chats', 'walter_pending_approvals', 'walter_chat_logs', 'walter_approvals_audit'],
      relationships: 'users → walter_chats (1:many), walter_chats → walter_chat_logs (1:many), walter_pending_approvals ↔ walter_chats',
      dataFlow: 'User chats with Walter → Parameter change proposed → Approval requested → Decision logged',
      queryOptimization: 'Indexes on userId, status, and timestamp for fast lookups'
    }
  };

  const key = Object.keys(insights).find(k => topic.toLowerCase().includes(k));
  
  return key ? insights[key] : {
    tables: ['Multiple tables involved'],
    relationships: 'Check shared/schema.ts for complete relationship definitions',
    dataFlow: 'Data flows through storage interface (server/storage.ts) using Drizzle ORM',
    queryOptimization: 'All queries use Drizzle query builder for type safety and performance'
  };
}

/**
 * Design Review Template - Phase 6.0 Addendum A
 * Explains UI flow and suggests simplifications
 */
export function createDesignReview(
  component: string,
  currentIssues?: string[]
): { analysis: string; suggestions: string[] } {
  return {
    analysis: `Reviewing ${component} from a UX perspective. Looking at visual hierarchy, user flow clarity, and cognitive load.`,
    suggestions: [
      'Simplify navigation - reduce clicks to reach primary actions',
      'Improve visual hierarchy - make important elements stand out using size, color, and spacing',
      'Add clear feedback - show loading states, success/error messages, and progress indicators',
      'Ensure mobile responsiveness - test all breakpoints for usability',
      'Maintain consistency - reuse existing shadcn/ui components rather than creating custom ones'
    ]
  };
}

/**
 * Aesthetic Evaluation Template - Phase 6.0 Addendum A
 * Describes visual balance and readability
 */
export function createAestheticEvaluation(
  metrics?: FrontendHealthReport
): { score: number; strengths: string[]; improvements: string[] } {
  const strengths: string[] = [];
  const improvements: string[] = [];

  // Analyze theme integrity
  if (metrics?.themeIntegrity) {
    if (metrics.themeIntegrity.darkModeWorking) {
      strengths.push('Dark mode properly implemented with consistent theming');
    } else {
      improvements.push('Dark mode needs attention - ensure .dark class styles cover all components');
    }

    if (metrics.themeIntegrity.missingVariables.length === 0) {
      strengths.push('All color variables defined in HSL format');
    } else {
      improvements.push(`Missing theme variables: ${metrics.themeIntegrity.missingVariables.join(', ')}`);
    }

    if (metrics.themeIntegrity.contrastIssues.length === 0) {
      strengths.push('Contrast ratios meet accessibility standards');
    } else {
      improvements.push(`Contrast issues: ${metrics.themeIntegrity.contrastIssues.join(', ')}`);
    }
  }

  // General aesthetic principles
  if (strengths.length === 0) {
    strengths.push('Uses Tailwind CSS with consistent spacing system');
    strengths.push('shadcn/ui components provide professional design foundation');
  }

  if (improvements.length === 0) {
    improvements.push('Consider adding micro-interactions for better user engagement');
    improvements.push('Review typography scale for optimal readability');
  }

  const score = Math.max(1, Math.min(10, 7 + strengths.length - improvements.length));

  return { score, strengths, improvements };
}

/**
 * Accessibility Check Template - Phase 6.0 Addendum A
 * Confirms WCAG compliance elements
 */
export function createAccessibilityCheck(
  component: string
): UXAnalysisResponse {
  const findings: UXFinding[] = [
    {
      category: 'accessibility',
      severity: 'info',
      description: 'Component should have data-testid attributes for automated testing',
      location: component,
      userImpact: 'low'
    },
    {
      category: 'accessibility',
      severity: 'medium',
      description: 'Ensure sufficient color contrast (4.5:1 for normal text, 3:1 for large text)',
      location: component,
      userImpact: 'high'
    },
    {
      category: 'accessibility',
      severity: 'medium',
      description: 'Interactive elements should have clear focus states',
      location: component,
      userImpact: 'high'
    }
  ];

  const recommendations: UXRecommendation[] = [
    {
      priority: 'should_improve',
      category: 'accessibility',
      suggestion: 'Add aria-label attributes to icon-only buttons',
      implementation: `<Button aria-label="Submit form" data-testid="button-submit">`,
      expectedBenefit: 'Screen readers can announce button purpose to visually impaired users'
    },
    {
      priority: 'should_improve',
      category: 'accessibility',
      suggestion: 'Ensure keyboard navigation works for all interactive elements',
      implementation: 'Test tab order and add tabIndex where needed',
      expectedBenefit: 'Keyboard-only users can navigate the application effectively'
    },
    {
      priority: 'nice_to_have',
      category: 'accessibility',
      suggestion: 'Consider adding skip navigation links for screen reader users',
      implementation: '<a href="#main-content" className="sr-only focus:not-sr-only">Skip to main content</a>',
      expectedBenefit: 'Screen reader users can bypass repetitive navigation'
    }
  ];

  return {
    requestId: `accessibility-${Date.now()}`,
    timestamp: new Date().toISOString(),
    analysisType: 'accessibility_check',
    findings,
    recommendations,
    overallScore: 7,
    summary: `Accessibility review for ${component}. Key focus areas: keyboard navigation, color contrast, and screen reader support. The component uses shadcn/ui which has good accessibility defaults, but manual testing is recommended.`
  };
}

/**
 * Get reasoning template by type
 */
export function getReasoningTemplate(
  templateType: 'architecture' | 'devops' | 'database' | 'design' | 'aesthetic' | 'accessibility',
  context: any
): any {
  switch (templateType) {
    case 'architecture':
      return createArchitectureTrace(context.startPoint, context.endpoint);
    case 'devops':
      return createDevOpsDiagnosis(context.symptom, context.bobFindings);
    case 'database':
      return createDatabaseInsight(context.topic);
    case 'design':
      return createDesignReview(context.component, context.currentIssues);
    case 'aesthetic':
      return createAestheticEvaluation(context.metrics);
    case 'accessibility':
      return createAccessibilityCheck(context.component);
    default:
      throw new Error(`Unknown template type: ${templateType}`);
  }
}
