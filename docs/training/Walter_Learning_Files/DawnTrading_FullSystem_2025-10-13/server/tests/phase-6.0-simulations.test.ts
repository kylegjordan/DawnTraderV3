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
import { 
  createArchitectureTrace,
  createDevOpsDiagnosis,
  createDatabaseInsight,
  createDesignReview,
  createAestheticEvaluation,
  createAccessibilityCheck
} from '../services/walter-reasoning-templates';
import { walterKnowledgeRefresh } from '../services/walter-knowledge-refresh';
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

  describe('UX Reasoning Templates', () => {
    test('should generate design review with actionable suggestions', async () => {
      const review = await createDesignReview(
        'Settings Panel',
        ['Complex with multiple tabs and nested options']
      );
      
      expect(review.analysis).toBeDefined();
      expect(review.suggestions.length).toBeGreaterThan(0);
      expect(Array.isArray(review.suggestions)).toBe(true);
    });

    test('should provide aesthetic evaluation', async () => {
      const evaluation = await createAestheticEvaluation(
        'Dashboard',
        'Has charts, cards, and status indicators'
      );
      
      // Check structure based on actual implementation
      expect(evaluation).toBeDefined();
      expect(typeof evaluation).toBe('object');
    });

    test('should perform accessibility check', async () => {
      const check = await createAccessibilityCheck(
        'Login Form',
        'Email and password inputs with submit button'
      );
      
      expect(check.findings.length).toBeGreaterThan(0);
      expect(check.recommendations.length).toBeGreaterThan(0);
      expect(check.overallScore).toBeGreaterThanOrEqual(0);
      expect(check.overallScore).toBeLessThanOrEqual(10);
    });
  });

  describe('Architecture & Database Reasoning', () => {
    test('should trace request flow through architecture', async () => {
      const trace = await createArchitectureTrace(
        'Dashboard page'
      );
      
      expect(trace.flow.length).toBeGreaterThan(0);
      expect(trace.artifacts.length).toBeGreaterThan(0);
      expect(trace.dataFlow).toBeDefined();
    });

    test('should provide database insights with relationships', async () => {
      const insight = await createDatabaseInsight(
        'trading'
      );
      
      expect(insight.tables.length).toBeGreaterThan(0);
      expect(insight.relationships).toBeDefined();
      expect(insight.dataFlow).toBeDefined();
    });
  });

  describe('Weekly Knowledge Refresh', () => {
    test('should execute knowledge refresh scan', async () => {
      const result = await walterKnowledgeRefresh.runWeeklyScan(testUserId);
      
      expect(result.weekNumber).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.updatesCount).toBeGreaterThan(0);
    });

    test('should track services, schema, and files', async () => {
      const result = await walterKnowledgeRefresh.runWeeklyScan(testUserId);
      
      const summaryLower = result.summary.toLowerCase();
      const hasServiceTracking = summaryLower.includes('service');
      const hasSchemaTracking = summaryLower.includes('schema') || summaryLower.includes('table');
      const hasFileTracking = summaryLower.includes('file');
      
      expect(hasServiceTracking || hasSchemaTracking || hasFileTracking).toBe(true);
    });
  });

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
