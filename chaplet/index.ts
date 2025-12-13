import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

const BRIDGE_PATH = path.join(process.cwd(), 'bridge');

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

router.get('/context/grounding', (_req, res) => {
  res.json({
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
      decision_authority: 'human-only'
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
          'Describe concrete consequences',
          'Offer safer alternatives',
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
        rule: 'Explain complex concepts simply without dumbing them down.'
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

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'chaplet',
    mode: 'read-only',
    bridge_path: BRIDGE_PATH,
    bridge_exists: fs.existsSync(BRIDGE_PATH),
    timestamp: new Date().toISOString()
  });
});

export default router;
