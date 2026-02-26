/**
 * Phase 6.0 - Interaction Simulation Tests
 *
 * Directive 12.2.3: Walter test blocks removed (Batch 6).
 * Remaining: Bob frontend health diagnostics (deferred to Bob cleanup batch).
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { diagnosticController } from '../services/diagnostic-controller';
import { storage } from '../storage';
// Directive 12.2.3: walter-expert-corpus import removed (file deleted in Batch 6)
// Directive 12.2.3: walter-reasoning-templates import removed (file deleted in Batch 5)
// Directive 12.2.3: walter-knowledge-refresh import removed (file deleted in Batch 5)
// Directive 12.2.3: walter-purpose import removed (file deleted in Batch 6)

describe('Phase 6.0 - Bob Frontend Health Diagnostics', () => {
  let testUserId: string;

  beforeAll(async () => {
    const users = await storage.getAllUsers();
    const testUser = users.find(u => u.username === 'testuser123');
    if (!testUser) {
      throw new Error('Test user not found! Run setup first.');
    }
    testUserId = testUser.id;
  });

  // Directive 12.2.3: 'Expert Corpus Verification' test block removed (walter-expert-corpus deleted in Batch 6)
  // Directive 12.2.3: 'Bob Identity Integration' test block removed (walter-purpose deleted in Batch 6)
  // Directive 12.2.3: 'Corpus Formatting' test block removed (walter-expert-corpus deleted in Batch 6)
  // Directive 12.2.3: 'UX Reasoning Templates' test block removed (walter-reasoning-templates.ts deleted in Batch 5)
  // Directive 12.2.3: 'Architecture & Database Reasoning' test block removed (walter-reasoning-templates.ts deleted in Batch 5)
  // Directive 12.2.3: 'Weekly Knowledge Refresh' test block removed (walter-knowledge-refresh.ts deleted in Batch 5)

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
});
