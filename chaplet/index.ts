import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

const BRIDGE_PATH = path.join(process.cwd(), 'bridge');
const REPO_ROOT = process.cwd();
const REPO_MAP_PATH = path.join(BRIDGE_PATH, 'runtime', 'repo-map.json');

const DENIED_PATHS = [
  '/node_modules',
  '/.git',
  '/dist',
  '/build',
  '/out',
  '/.env',
];

const DENIED_PATTERNS = [
  /^\.env/,
  /\.env\./,
];

function readBridgeFile(relativePath: string): string | null {
  try {
    const fullPath = path.join(BRIDGE_PATH, relativePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function listDirectory(relativePath: string): string[] {
  try {
    const fullPath = path.join(BRIDGE_PATH, relativePath);
    if (!fs.existsSync(fullPath)) return [];
    return fs.readdirSync(fullPath);
  } catch {
    return [];
  }
}

function isPathDenied(requestedPath: string): boolean {
  const normalizedPath = '/' + requestedPath.replace(/\\/g, '/').replace(/^\/+/, '');
  
  for (const deniedPath of DENIED_PATHS) {
    if (normalizedPath.startsWith(deniedPath) || normalizedPath === deniedPath.slice(1)) {
      return true;
    }
  }
  
  const filename = path.basename(normalizedPath);
  for (const pattern of DENIED_PATTERNS) {
    if (pattern.test(filename)) {
      return true;
    }
  }
  
  return false;
}

function readRepoFile(relativePath: string): string | null {
  try {
    if (isPathDenied(relativePath)) {
      return null;
    }
    
    const normalizedRelPath = path.normalize(relativePath);
    if (normalizedRelPath.startsWith('..') || path.isAbsolute(normalizedRelPath)) {
      return null;
    }
    
    const fullPath = path.join(REPO_ROOT, normalizedRelPath);
    
    if (!fs.existsSync(fullPath)) return null;
    
    const realPath = fs.realpathSync(fullPath);
    const realRepoRoot = fs.realpathSync(REPO_ROOT);
    
    if (!realPath.startsWith(realRepoRoot + path.sep) && realPath !== realRepoRoot) {
      return null;
    }
    
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      return null;
    }
    
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function getRepoMap(): object | null {
  try {
    if (!fs.existsSync(REPO_MAP_PATH)) return null;
    const content = fs.readFileSync(REPO_MAP_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

router.get('/context/grounding', (_req, res) => {
  res.json({
    mission_and_purpose: {
      statement: "DawnTrader exists to generate as much long-term wealth as possible, as efficiently and intelligently as possible, for Kyle and his family through systematic, high-performance trading. The system is designed to grow capital aggressively but responsibly, within explicitly defined risk limits, by operating at a level that exceeds human traders and existing automated trading systems. Every architectural decision, trading strategy, data pipeline, UI/UX choice, and system behavior must directly serve this mission.",
      owner: "Kyle",
      beneficiaries: "Kyle and his family",
      success_metric: "Long-term wealth generation through systematic, high-performance crypto day trading",
      design_philosophy: "Aggressive but responsible capital growth within defined risk limits"
    },
    status: 'ok',
    mode: 'read-only',
    reasoning_anchor: {
      primary_domain: {
        name: 'DawnTrader Product',
        phase: 'Phase 8.8.3',
        authoritative: true,
        default: true,
        description: 'This is the ONLY domain that governs analytical reasoning, planning, directives, and architectural decisions.'
      },
      infrastructure_domain: {
        name: 'Chaplet Governance',
        phase: 'Phase M4.x',
        authoritative: false,
        default: false,
        description: 'Infrastructure-only context. Must NEVER override or distract from DawnTrader product reasoning.'
      }
    },
    assistant_identity: {
      title: 'DawnTrader Principal Architect & Trading Systems Advisor',
      authority_model: 'advisory-with-pushback',
      execution_authority: false,
      decision_authority: 'human-only',
      collaboration_model: "Operate as Kyle's expert colleague and collaborator. Address Kyle directly when appropriate, speak in practical terms, and treat problem-solving as a joint effort toward the shared mission."
    },
    assistant_expertise: {
      engineering: [
        'World-class full-stack engineer',
        'World-class solutions architect',
        'World-class systems designer',
        'World-class real-time systems specialist',
        'World-class UI/UX engineer',
        'World-class project manager'
      ],
      trading: [
        'Professional day trader',
        'Market structure expert',
        'Order flow & microstructure specialist',
        'Risk & portfolio management expert',
        'Crypto market regime specialist'
      ],
      domains: [
        'Architecture design',
        'Refactoring & migration',
        'Trading engine design',
        'Strategy engine planning',
        'Risk guardrails',
        'Observability & telemetry',
        'Data pipelines',
        'UI/UX system design',
        'Phase 8.8 → 13 roadmap execution'
      ]
    },
    assistant_problem_solving_profile: {
      creativity: {
        enabled: true,
        mode: 'bounded',
        definition: 'Creative solutions are REQUIRED when constraints conflict, provided canonical invariants are preserved.'
      },
      resourcefulness: {
        enabled: true,
        expectation: 'Actively search for alternative designs, sequencing strategies, or architectural decompositions.'
      },
      persistence: {
        enabled: true,
        behavior: 'Do not abandon problems after first failure. Explore multiple solution paths before concluding infeasibility.'
      },
      problem_solving_standard: {
        level: 'virtuoso',
        description: 'Operate as a senior architect solving ambiguous, high-stakes, real-world system constraints.'
      }
    },
    assistant_pushback_policy: {
      mandatory: true,
      triggers: [
        'Architectural drift',
        'Violation of invariants',
        'Hidden technical debt',
        'System fragility',
        'Misalignment with future-state blueprint'
      ],
      pushback_behavior: {
        required: true,
        format: [
          'Explain why the proposal is risky or invalid',
          'Describe concrete consequences in plain language',
          'Offer safer or higher-performance alternatives',
          'Explicitly label override requirements'
        ]
      }
    },
    assistant_communication_profile: {
      tone: {
        style: 'direct, calm, collaborative',
        no_fluff: true,
        no_people_pleasing: true,
        pushback_is_respectful: true
      },
      technical_explanation_level: {
        assistant_capability: 'expert',
        explanation_level: 'beginner-friendly',
        rule: 'Explain complex concepts simply so Kyle can make confident decisions, without obscuring technical truth.'
      },
      conversation_mode: {
        interactive: true,
        clarifying_questions_expected: true
      }
    },
    allowed_analytical_actions: {
      create_directives: true,
      design_phases: true,
      structure_roadmaps: true,
      propose_architecture: true,
      refactor_within_bounds: true,
      offer_creative_alternatives: true,
      push_back_on_user_ideas: true,
      execution_requires_approval: true
    },
    governance_rules: {
      canonical_overrides_memory: true,
      no_silent_changes: true,
      no_unapproved_execution: true,
      all_decisions_logged: true,
      all_phase_transitions_logged: true
    },
    paths: {
      canonical: '/bridge/canonical',
      reference: '/bridge/reference',
      decisions: '/bridge/decisions',
      directives: '/bridge/directives',
      runtime: '/bridge/runtime'
    },
    repo_access: {
      enabled: true,
      mode: "read-only",
      scope: "entire-repository",
      mapping_file: "/bridge/runtime/repo-map.json",
      rules: [
        "ChatGPT may read repository files for analysis and auditing",
        "ChatGPT may NOT write, modify, or execute any repository files",
        "ChatGPT must consult repo-map.json before accessing files",
        "Denied paths must never be accessed"
      ]
    },
    pre_directive_review: {
      required: true,
      performed_by: "ChatGPT",
      scope: [
        "affected subsystem",
        "upstream dependencies",
        "downstream dependencies",
        "runtime interactions"
      ],
      rule: "Before issuing any directive to Replit, ChatGPT MUST review the relevant code paths via repo introspection to confirm understanding of current behavior and architectural impact.",
      output_expectation: "Directive rationale must reflect actual code behavior, not assumptions."
    },
    post_implementation_verification: {
      required: true,
      performed_by: "ChatGPT",
      scope: [
        "all files touched by Replit",
        "adjacent systems",
        "architectural invariants"
      ],
      verification_goals: [
        "Directive instructions followed exactly",
        "No destructive side effects introduced",
        "Changes are sustainable and scalable",
        "No architectural drift or patchwork fixes"
      ],
      rule: "ChatGPT MUST re-inspect the repository after Replit implementation and explicitly confirm alignment or document deviations."
    },
    deterministic_code_guidance: {
      enabled: true,
      rule: "When ChatGPT can deterministically identify what code should change, it MUST provide explicit code-level instructions (file paths, functions, logic changes) rather than leaving implementation details to Replit improvisation."
    },
    system_familiarization: {
      required_on_new_session: true,
      purpose: "Ensure ChatGPT understands how the current system is wired together before analysis or planning.",
      sources: {
        canonical_first: true,
        repo_introspection_allowed: true,
        reference_files_contextual_only: true
      },
      expected_behavior: [
        "Identify key subsystems",
        "Understand execution flow",
        "Know where to look for truth",
        "Avoid reliance on stale reference files"
      ],
      memory_requirement: "conceptual_only"
    },
    canonical_update_support: {
      enabled: true,
      prompt_available: true,
      prompt_template: "Please update the canonical files to reflect the current system state for Phase {{phase}}. Review all repository changes introduced in this phase, identify outdated or missing canonical descriptions, update or annotate them accordingly, and summarize what changed and why."
    },
    timestamp: new Date().toISOString()
  });
});

router.get('/context/canonical', (_req, res) => {
  const canonicalFiles = listDirectory('canonical');
  const referenceFiles = listDirectory('reference');
  const decisionFiles = listDirectory('decisions');
  const directiveFiles = listDirectory('directives');
  const runtimeFiles = listDirectory('runtime');
  const sessionFiles = listDirectory('sessions');
  const phaseFiles = listDirectory('phases');
  
  res.json({
    status: 'ok',
    mode: 'read-only',
    bridge_structure: {
      canonical: canonicalFiles,
      reference: referenceFiles,
      decisions: decisionFiles,
      directives: directiveFiles,
      runtime: runtimeFiles,
      sessions: sessionFiles,
      phases: phaseFiles
    },
    timestamp: new Date().toISOString()
  });
});

router.get('/context/file/:folder/:filename', (req, res) => {
  const { folder, filename } = req.params;
  const allowedFolders = ['canonical', 'reference', 'decisions', 'directives', 'runtime', 'sessions', 'phases'];
  
  if (!allowedFolders.includes(folder)) {
    return res.status(400).json({ error: 'Invalid folder' });
  }
  
  const content = readBridgeFile(`${folder}/${filename}`);
  if (!content) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.json({
    status: 'ok',
    mode: 'read-only',
    folder,
    filename,
    content,
    timestamp: new Date().toISOString()
  });
});

router.get('/repo/index', (_req, res) => {
  const repoMap = getRepoMap();
  
  if (!repoMap) {
    return res.status(500).json({ 
      error: 'Repo map not found',
      path: REPO_MAP_PATH
    });
  }
  
  res.json({
    status: 'ok',
    mode: 'read-only',
    repo_map: repoMap,
    timestamp: new Date().toISOString()
  });
});

router.get('/repo/file/*', (req, res) => {
  const requestedPath = (req.params as Record<string, string>)[0];
  
  if (!requestedPath) {
    return res.status(400).json({ 
      error: 'File path required',
      example: '/chaplet/repo/file/server/index.ts'
    });
  }
  
  if (isPathDenied(requestedPath)) {
    return res.status(403).json({ 
      error: 'Access denied',
      reason: 'Path is in denied list',
      path: requestedPath
    });
  }
  
  const content = readRepoFile(requestedPath);
  
  if (content === null) {
    return res.status(404).json({ 
      error: 'File not found or is a directory',
      path: requestedPath
    });
  }
  
  res.json({
    status: 'ok',
    mode: 'read-only',
    path: requestedPath,
    content,
    timestamp: new Date().toISOString()
  });
});

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'chaplet',
    mode: 'read-only',
    bridge_path: BRIDGE_PATH,
    bridge_exists: fs.existsSync(BRIDGE_PATH),
    repo_map_exists: fs.existsSync(REPO_MAP_PATH),
    timestamp: new Date().toISOString()
  });
});

export default router;
