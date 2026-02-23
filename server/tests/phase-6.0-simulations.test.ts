/**
 * Phase 6.0 - Interaction Simulation Tests
 * 
 * Tests Walter's expert knowledge, Bob's identity recognition, and UX reasoning capabilities
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { bobInspector } from '../services/bob-inspector';
import { diagnosticController } from '../services/diagnostic-controller';
import { storage } from '../storage';
import { 
  WALTER_EXPERT_CORPUS,
  searchCorpus,
  getAllArtifacts,
  formatCorpusForPrompt 
} from '../services/walter-expert-corpus';
// Directive 12.2.3: walter-reasoning-templates import removed (file deleted in Batch 5)
// Directive 12.2.3: walter-knowledge-refresh import removed (file deleted in Batch 5)
import { BOB_IDENTITY, createSystemKnowledgeSection } from '../services/walter-purpose';

describe('Phase 6.0 - Walter Expert Knowledge & Bob Integration', () => {
  let testUserId: string;

  beforeAll(async () => {
    const users = await storage.getAllUsers();
    const testUser = users.find(u => u.username === 'testuser123');
    if (!testUser) {
      throw new Error('Test user not found! Run setup first.');
    }
    testUserId = testUser.id;
  });

  describe('Expert Corpus Verification', () => {
    test('should have all 4 domains with comprehensive artifacts', () => {
      const domainCount = WALTER_EXPERT_CORPUS.length;
      const artifacts = getAllArtifacts();
      
      expect(domainCount).toBe(4);
      expect(artifacts.length).toBeGreaterThan(20);
      
      const domains = WALTER_EXPERT_CORPUS.map(d => d.name);
      const expectedDomains = [
        'System Architecture & File Topology',
        'DevOps & Infrastructure',
        'Database & Schema Awareness',
        'Front-End Design & UX'
      ];
      
      expectedDomains.forEach(expectedDomain => {
        expect(domains).toContain(expectedDomain);
      });
    });

    test('should allow searching across all domains', () => {
      const reactResults = searchCorpus('React');
      const databaseResults = searchCorpus('database');
      const tailwindResults = searchCorpus('Tailwind');
      
      expect(reactResults.length).toBeGreaterThan(0);
      expect(databaseResults.length).toBeGreaterThan(0);
      expect(tailwindResults.length).toBeGreaterThan(0);
    });
  });

  describe('Bob Identity Integration', () => {
    test('should have Bob identity definition', () => {
      expect(BOB_IDENTITY).toContain('Bob is the operational system entity');
      expect(BOB_IDENTITY).toContain('Monitoring');
      expect(BOB_IDENTITY).toContain('Diagnostics');
    });

    test('should reference Bob in system knowledge section', () => {
      const systemKnowledge = createSystemKnowledgeSection();
      const hasBobReference = 
        systemKnowledge.includes('Bob monitors') || 
        systemKnowledge.includes('Bob found') ||
        systemKnowledge.includes("Bob's role");
      
      expect(hasBobReference).toBe(true);
    });

    test('should execute user-initiated diagnostic with Bob', async () => {
      const report = await diagnosticController.triggerUserDiagnostic(
        testUserId,
        'system_state'
      );
      
      expect(report.status).toBe('completed');
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.timestamp).toBeDefined();
    });
  });

  describe('Bob Frontend Health Diagnostics', () => {
    test('should execute frontend health inspection', async () => {
      const report = await diagnosticController.triggerWalterDiagnostic(
        testUserId,
        'Routine frontend health check',
        'frontend_health'
      );
      
      expect(report.status).toBe('completed');
      expect(report.findings.length).toBeGreaterThan(0);
      
      const categories = report.findings.map(f => f.category);
      expect(categories).toContain('frontend_health');
    });

    test('should check theme integrity', async () => {
      const report = await diagnosticController.triggerWalterDiagnostic(
        testUserId,
        'Check theme configuration',
        'frontend_health'
      );
      
      const themeFindings = report.findings.filter(f => 
        f.category === 'theme_integrity' || 
        f.description.toLowerCase().includes('theme')
      );
      
      expect(themeFindings.length).toBeGreaterThan(0);
    });
  });

  // Directive 12.2.3: 'UX Reasoning Templates' test block removed (walter-reasoning-templates.ts deleted in Batch 5)
  // Directive 12.2.3: 'Architecture & Database Reasoning' test block removed (walter-reasoning-templates.ts deleted in Batch 5)

  // Directive 12.2.3: 'Weekly Knowledge Refresh' test block removed (walter-knowledge-refresh.ts deleted in Batch 5)

  describe('Corpus Formatting', () => {
    test('should format corpus for AI prompt', () => {
      const formatted = formatCorpusForPrompt();
      
      expect(formatted).toContain('System Architecture');
      expect(formatted).toContain('DevOps');
      expect(formatted).toContain('Database');
      expect(formatted).toContain('Front-End');
    });

    test('should filter by specific domains', () => {
      const formatted = formatCorpusForPrompt(['Front-End Design & UX']);
      
      expect(formatted).toContain('Front-End');
      expect(formatted.length).toBeLessThan(formatCorpusForPrompt().length);
    });
  });
});
