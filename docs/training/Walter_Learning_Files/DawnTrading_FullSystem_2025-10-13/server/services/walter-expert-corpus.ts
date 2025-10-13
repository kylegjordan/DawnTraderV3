/**
 * Walter Expert Corpus - Phase 6.0
 * 
 * Comprehensive technical knowledge base covering:
 * 1. System Architecture & File Topology
 * 2. DevOps & Infrastructure
 * 3. Database & Schema Awareness
 * 4. Front-End Design & UX
 */

export interface CorpusDomain {
  name: string;
  description: string;
  topics: CorpusTopic[];
}

export interface CorpusTopic {
  title: string;
  summary: string;
  artifacts: string[]; // File paths, table names, etc.
  keyPoints: string[];
}

export const WALTER_EXPERT_CORPUS: CorpusDomain[] = [
  {
    name: "System Architecture & File Topology",
    description: "Logical structure of the application codebase and service organization",
    topics: [
      {
        title: "Backend Service Architecture",
        summary: "Node.js Express server with ESM modules, organized into services, routes, and utilities",
        artifacts: [
          "server/index.ts - Main entry point",
          "server/routes.ts - API route registration",
          "server/services/ - Business logic services",
          "server/storage.ts - Database interface layer"
        ],
        keyPoints: [
          "Bob is the system monitoring and diagnostic entity",
          "DiagnosticController orchestrates Bob's inspections and Walter's patch analysis",
          "Services follow single responsibility principle",
          "All database access goes through storage interface"
        ]
      },
      {
        title: "Trading Engine Core Services",
        summary: "Automated trading strategies, market scanning, and risk management",
        artifacts: [
          "server/services/trading-engine.ts - Strategy execution",
          "server/services/strategy-engine.ts - 8 automated strategies",
          "server/services/market-scanner.ts - Real-time market analysis",
          "server/services/risk-manager.ts - Multi-layer risk control"
        ],
        keyPoints: [
          "8 strategies: VWAP Pullback, ABCD Long, SMA Trend Ride, Breakout, Mean Reversion, Range Trading, VWAP Bounce, Liquidity Trap",
          "37+ tunable parameters per strategy",
          "Daily loss kill switch protection",
          "Mode isolation: Live vs Paper trading"
        ]
      },
      {
        title: "AI & Diagnostic Services",
        summary: "AI-powered analysis, diagnostics, and autonomous learning",
        artifacts: [
          "server/services/diagnostic-controller.ts - Event dispatcher for diagnostics",
          "server/services/bob-inspector.ts - Code reading, log search, data checks",
          "server/services/walter-patch-analyst.ts - AI fix proposals using GPT-4o",
          "server/services/ai-analyst.ts - Trading analysis and insights",
          "server/services/semantic-memory.ts - Vector-based knowledge recall"
        ],
        keyPoints: [
          "Bob handles all monitoring, inspection, and automated diagnostics",
          "Walter analyzes Bob's findings and proposes fixes",
          "Human-in-the-loop approval required via kyleApproved flag",
          "Semantic memory uses pgvector for intelligent recall"
        ]
      },
      {
        title: "Frontend Structure",
        summary: "React 18 + Vite + TypeScript frontend with component-based architecture",
        artifacts: [
          "client/src/App.tsx - Route registration",
          "client/src/pages/ - Page components",
          "client/src/components/ - Reusable UI components",
          "client/src/lib/ - Utilities and helpers"
        ],
        keyPoints: [
          "Wouter for routing (not React Router)",
          "TanStack Query for server state management",
          "shadcn/ui components built on Radix UI + Tailwind",
          "WebSocket for real-time updates"
        ]
      }
    ]
  },
  {
    name: "DevOps & Infrastructure",
    description: "Deployment, monitoring, error handling, and operational resilience",
    topics: [
      {
        title: "Error Handling & Recovery",
        summary: "Multi-layer error detection, logging, and autonomous recovery",
        artifacts: [
          "server/services/error-handler.ts - Centralized error processing",
          "shared/schema.ts (errorLogs table) - Error persistence",
          "server/services/diagnostic-controller.ts - Error-triggered diagnostics"
        ],
        keyPoints: [
          "Three diagnostic trigger types: error_based, user_initiated, walter_initiated",
          "Bob automatically inspects errors and generates diagnostic reports",
          "Transparency logging for all diagnostic events",
          "Patch proposals require Kyle's approval before application"
        ]
      },
      {
        title: "Monitoring & Health Checks",
        summary: "Real-time system monitoring, metrics collection, and alerting",
        artifacts: [
          "server/services/system-monitor.ts - Health metrics",
          "server/services/diagnostics-analyzer.ts - Anomaly detection",
          "shared/schema.ts (ai_transparency_log) - Audit trail"
        ],
        keyPoints: [
          "Bob runs continuous health checks and performance monitoring",
          "Anomaly detection triggers Walter-initiated diagnostics",
          "Weekly knowledge refresh updates Walter's corpus",
          "All autonomous actions logged to transparency table"
        ]
      },
      {
        title: "Deployment & Environment",
        summary: "Production deployment on Replit with Neon PostgreSQL",
        artifacts: [
          "server/vite.ts - Vite dev server configuration",
          "vite.config.ts - Build configuration",
          "drizzle.config.ts - Database migrations"
        ],
        keyPoints: [
          "Backend and frontend served on same port (no proxy needed)",
          "Environment secrets managed via Replit",
          "Database migrations via npm run db:push",
          "WebSocket server for real-time features"
        ]
      }
    ]
  },
  {
    name: "Database & Schema Awareness",
    description: "PostgreSQL schema structure, table relationships, and data flow",
    topics: [
      {
        title: "Core Trading Tables",
        summary: "User accounts, settings, trades, and watchlist management",
        artifacts: [
          "users - Authentication and profiles",
          "trading_settings - Strategy parameters and risk controls",
          "trades - Historical trade records with MFE/MAE",
          "watchlist_pairs - Monitored trading pairs"
        ],
        keyPoints: [
          "Mode-aware data: Live vs Paper trading isolation",
          "Drizzle ORM with Neon serverless driver",
          "All CRUD through IStorage interface in server/storage.ts",
          "Relations defined in shared/schema.ts"
        ]
      },
      {
        title: "AI & Learning Tables",
        summary: "AI conversations, semantic memory, learning infrastructure",
        artifacts: [
          "ai_conversations - Chat history with context",
          "semantic_memory - Vector embeddings for knowledge recall",
          "ai_transparency_log - Audit trail for AI actions",
          "ai_opportunities - Hourly trading opportunity scan"
        ],
        keyPoints: [
          "pgvector extension for semantic search",
          "Conversation summarization reduces API costs",
          "Transparency log tracks all AI decisions",
          "Learning lessons stored with confidence scores"
        ]
      },
      {
        title: "Diagnostic & Patch Management",
        summary: "Bob's diagnostic reports and Walter's patch proposals",
        artifacts: [
          "diagnostic_reports (in-memory) - Bob's inspection findings",
          "patch_proposals (in-memory) - Walter's fix suggestions",
          "walter_chat_logs - Walter conversation history",
          "walter_pending_approvals - Parameter change requests"
        ],
        keyPoints: [
          "In-memory Map storage for proposals (no DB timeout issues)",
          "kyleApproved flag enforces human approval gate",
          "Diagnostic reports include severity, category, and suggested actions",
          "Walter chat logs support multi-session management"
        ]
      }
    ]
  },
  {
    name: "Front-End Design & UX",
    description: "UI/UX principles, design systems, and user-centered interface patterns",
    topics: [
      {
        title: "UI Architecture & Component Stack",
        summary: "React 18 component composition with modern tooling",
        artifacts: [
          "React 18 - Component framework",
          "Vite - Build tool and dev server",
          "Wouter - Client-side routing",
          "TanStack Query v5 - Server state management"
        ],
        keyPoints: [
          "Functional components with hooks (useState, useEffect, useQuery)",
          "No class components - modern React patterns only",
          "Controlled forms with react-hook-form + zod validation",
          "Real-time updates via WebSocket subscriptions"
        ]
      },
      {
        title: "Design System & Styling",
        summary: "Tailwind CSS with shadcn/ui components and HSL theming",
        artifacts: [
          "Tailwind CSS - Utility-first styling",
          "shadcn/ui - Radix UI + Tailwind components",
          "client/src/index.css - HSL color variables",
          "Dark mode via class-based theme switching"
        ],
        keyPoints: [
          "HSL format for all color variables: hsl(20, 14.3%, 4.1%)",
          "Dark mode: explicit light/dark variants on all elements",
          "Responsive design: mobile-first approach",
          "Lucide icons for UI actions, react-icons/si for logos"
        ]
      },
      {
        title: "UX Patterns & User Flows",
        summary: "User-centered design patterns and interaction models",
        artifacts: [
          "Form patterns - react-hook-form with shadcn Form components",
          "Navigation - Wouter Link and useLocation",
          "Feedback - Toast notifications via useToast hook",
          "Loading states - Skeleton UI and isPending checks"
        ],
        keyPoints: [
          "Clear feedback loops: loading states, error messages, success confirmations",
          "Affordance: buttons/links clearly indicate interactivity",
          "Accessibility: data-testid on all interactive elements",
          "Mobile-first: responsive breakpoints for all layouts"
        ]
      },
      {
        title: "Visual Hierarchy & Aesthetics",
        summary: "Layout principles, typography, and visual balance",
        artifacts: [
          "Typography scale in Tailwind config",
          "Spacing system (4px base unit)",
          "Color palette with semantic naming",
          "Component composition patterns"
        ],
        keyPoints: [
          "Visual hierarchy: size, color, spacing guide user attention",
          "Readability: sufficient contrast ratios for text",
          "Consistency: reuse shadcn components, avoid custom CSS",
          "White space: breathing room improves comprehension"
        ]
      },
      {
        title: "Performance & Render Optimization",
        summary: "Frontend performance metrics and optimization strategies",
        artifacts: [
          "LCP (Largest Contentful Paint) - Loading performance",
          "CLS (Cumulative Layout Shift) - Visual stability",
          "FCP (First Contentful Paint) - Initial render speed",
          "Bundle size and code splitting"
        ],
        keyPoints: [
          "Bob monitors frontend health metrics in diagnostic scans",
          "React error boundaries catch UI crashes",
          "Query caching reduces unnecessary requests",
          "Lazy loading for heavy components"
        ]
      }
    ]
  }
];

/**
 * Get corpus summary for a specific domain
 */
export function getCorpusDomain(domainName: string): CorpusDomain | undefined {
  return WALTER_EXPERT_CORPUS.find(d => d.name === domainName);
}

/**
 * Search corpus for topics containing keywords
 */
export function searchCorpus(query: string): CorpusTopic[] {
  const lowerQuery = query.toLowerCase();
  const results: CorpusTopic[] = [];
  
  for (const domain of WALTER_EXPERT_CORPUS) {
    for (const topic of domain.topics) {
      if (
        topic.title.toLowerCase().includes(lowerQuery) ||
        topic.summary.toLowerCase().includes(lowerQuery) ||
        topic.keyPoints.some(kp => kp.toLowerCase().includes(lowerQuery))
      ) {
        results.push(topic);
      }
    }
  }
  
  return results;
}

/**
 * Get all artifacts (files, tables, etc.) from corpus
 */
export function getAllArtifacts(): string[] {
  const artifacts: string[] = [];
  
  for (const domain of WALTER_EXPERT_CORPUS) {
    for (const topic of domain.topics) {
      artifacts.push(...topic.artifacts);
    }
  }
  
  return [...new Set(artifacts)]; // Remove duplicates
}

/**
 * Format corpus for AI prompt inclusion
 */
export function formatCorpusForPrompt(relevantDomains?: string[]): string {
  const domains = relevantDomains
    ? WALTER_EXPERT_CORPUS.filter(d => relevantDomains.includes(d.name))
    : WALTER_EXPERT_CORPUS;
  
  let prompt = "# Walter's Expert Knowledge Base\n\n";
  
  for (const domain of domains) {
    prompt += `## ${domain.name}\n${domain.description}\n\n`;
    
    for (const topic of domain.topics) {
      prompt += `### ${topic.title}\n`;
      prompt += `${topic.summary}\n\n`;
      
      if (topic.artifacts.length > 0) {
        prompt += `**Key Artifacts:**\n`;
        for (const artifact of topic.artifacts) {
          prompt += `- ${artifact}\n`;
        }
        prompt += '\n';
      }
      
      if (topic.keyPoints.length > 0) {
        prompt += `**Key Points:**\n`;
        for (const point of topic.keyPoints) {
          prompt += `- ${point}\n`;
        }
        prompt += '\n';
      }
    }
  }
  
  return prompt;
}
