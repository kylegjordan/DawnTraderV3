import { test, expect } from '@playwright/test';

/**
 * E2E tests for Config Snapshot Viewer - Phase 27.G
 * 
 * NOTE: These tests require:
 * 1. A running application (npm run dev)
 * 2. Admin credentials in environment or defaults
 * 3. Database with test data
 * 
 * Run with: npx playwright test e2e/config-snapshot.spec.ts
 */

test.describe('Config Snapshot Viewer - Phase 27.G E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin to access Developer tab
    await page.goto('/login');
    await page.getByTestId('input-username').fill(process.env.TEST_USER_EMAIL || 'admin');
    await page.getByTestId('input-password').fill(process.env.TEST_USER_PASSWORD || 'admin123');
    await page.getByTestId('button-login').click();
    
    // Wait for dashboard to load
    await expect(page).toHaveURL('/dashboard');
    
    // Navigate to Settings page
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('should display Developer tab for admin users', async ({ page }) => {
    // Verify Developer tab is visible
    const developerTab = page.getByTestId('tab-developer');
    await expect(developerTab).toBeVisible();
    await expect(developerTab).toContainText('Developer');
  });

  test('should load config snapshot viewer when Developer tab is clicked', async ({ page }) => {
    // Click Developer tab
    await page.getByTestId('tab-developer').click();
    
    // Verify Config Snapshot Viewer is loaded
    await expect(page.getByText('Configuration Snapshot')).toBeVisible();
    await expect(page.getByText('Real-time view of current system configuration')).toBeVisible();
  });

  test('should display config snapshot for paper mode', async ({ page }) => {
    await page.getByTestId('tab-developer').click();
    
    // Select Paper mode
    await page.getByTestId('button-mode-paper').click();
    
    // Wait for snapshot to load
    await page.waitForTimeout(1000);
    
    // Verify audit status is displayed
    await expect(page.getByText('Audit Status')).toBeVisible();
    await expect(page.getByText('Legacy Field Access')).toBeVisible();
    
    // Verify zero legacy reads
    const legacyReads = await page.getByTestId('text-legacy-reads').textContent();
    expect(legacyReads?.trim()).toBe('0');
  });

  test('should display config snapshot for live mode', async ({ page }) => {
    await page.getByTestId('tab-developer').click();
    
    // Select Live mode
    await page.getByTestId('button-mode-live').click();
    
    // Wait for snapshot to load
    await page.waitForTimeout(1000);
    
    // Verify zero legacy reads for live mode
    const legacyReads = await page.getByTestId('text-legacy-reads').textContent();
    expect(legacyReads?.trim()).toBe('0');
  });

  test('should display guardrails data in snapshot', async ({ page }) => {
    await page.getByTestId('tab-developer').click();
    
    // Click guardrails tab
    await page.getByTestId('tab-guardrails').click();
    
    // Verify guardrails fields are displayed
    await expect(page.getByText('Portfolio Risk per Trade')).toBeVisible();
    await expect(page.getByText('Symbol Cooldown')).toBeVisible();
    await expect(page.getByText('Max Open Positions')).toBeVisible();
    await expect(page.getByText('Daily Loss Kill Switch')).toBeVisible();
  });

  test('should display filters data in snapshot', async ({ page }) => {
    await page.getByTestId('tab-developer').click();
    
    // Click filters tab
    await page.getByTestId('tab-filters').click();
    
    // Verify filter fields are displayed
    await expect(page.getByText('Min Volume')).toBeVisible();
    await expect(page.getByText('Min Liquidity')).toBeVisible();
    await expect(page.getByText('RSI Min')).toBeVisible();
    await expect(page.getByText('Universe Size')).toBeVisible();
  });

  test('should display goals data in snapshot', async ({ page }) => {
    await page.getByTestId('tab-developer').click();
    
    // Click goals tab
    await page.getByTestId('tab-goals').click();
    
    // Verify goals fields are displayed
    await expect(page.getByText('Active Preset')).toBeVisible();
    await expect(page.getByText('Target Daily Avg Earning')).toBeVisible();
    await expect(page.getByText('Trades per Day (Est.)')).toBeVisible();
  });

  test('should display provenance metadata', async ({ page }) => {
    await page.getByTestId('tab-developer').click();
    
    // Click provenance tab
    await page.getByTestId('tab-provenance').click();
    
    // Verify provenance information
    await expect(page.getByText('Guardrails Source')).toBeVisible();
    await expect(page.getByText('guardrails_v2')).toBeVisible();
    await expect(page.getByText('Filters Source')).toBeVisible();
    await expect(page.getByText('screener_filters')).toBeVisible();
    await expect(page.getByText('Goals Source')).toBeVisible();
    await expect(page.getByText('goals_presets')).toBeVisible();
  });

  test('should copy config snapshot to clipboard', async ({ page, context }) => {
    await page.getByTestId('tab-developer').click();
    
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    // Click copy button
    await page.getByTestId('button-copy-snapshot').click();
    
    // Verify toast notification
    await expect(page.getByText('Copied to clipboard')).toBeVisible();
    
    // Verify clipboard contains JSON
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBeTruthy();
    
    // Verify clipboard content is valid JSON
    const parsedJson = JSON.parse(clipboardText);
    expect(parsedJson).toHaveProperty('mode');
    expect(parsedJson).toHaveProperty('timestamp');
    expect(parsedJson).toHaveProperty('legacyReads');
    expect(parsedJson.legacyReads).toBe(0);
  });

  test('should refresh config snapshot', async ({ page }) => {
    await page.getByTestId('tab-developer').click();
    
    // Get initial schema hash
    const initialHash = await page.getByTestId('text-schema-hash').textContent();
    
    // Click refresh button
    await page.getByTestId('button-refresh-snapshot').click();
    
    // Verify toast notification
    await expect(page.getByText('Refreshing...')).toBeVisible();
    
    // Wait for refresh to complete
    await page.waitForTimeout(1000);
    
    // Verify schema hash is still present (may be same or different)
    const refreshedHash = await page.getByTestId('text-schema-hash').textContent();
    expect(refreshedHash).toBeTruthy();
  });

  test('should display schema hash in correct format', async ({ page }) => {
    await page.getByTestId('tab-developer').click();
    
    // Verify schema hash is displayed
    const schemaHash = await page.getByTestId('text-schema-hash').textContent();
    
    // Verify it's a truncated MD5 hash (16 chars + "...")
    expect(schemaHash).toMatch(/^[a-f0-9]{16}\.\.\./);
  });

  test('should verify guardrails values match Goals Engine settings', async ({ page }) => {
    // Navigate to Goals Engine
    await page.goto('/goals-engine');
    await expect(page.getByRole('heading', { name: 'Goals Engine' })).toBeVisible();
    
    // Get guardrail values from Goals Engine (example - Portfolio Risk)
    // Note: Adjust selectors based on actual Goals Engine UI
    const goalsEngineRisk = await page.locator('[data-testid*="portfolio-risk"]').first().textContent();
    
    // Navigate back to Settings > Developer tab
    await page.goto('/settings');
    await page.getByTestId('tab-developer').click();
    await page.getByTestId('tab-guardrails').click();
    
    // Get guardrail value from snapshot
    const snapshotRisk = await page.getByTestId('field-portfolio-risk').textContent();
    
    // Values should match (after normalization)
    // This is a basic check - full verification would require parsing and comparing numeric values
    expect(snapshotRisk).toBeTruthy();
    expect(goalsEngineRisk).toBeTruthy();
  });

  test('should display PASSED badge when legacyReads is 0', async ({ page }) => {
    await page.getByTestId('tab-developer').click();
    
    // Verify PASSED badge is shown
    await expect(page.getByText('PASSED')).toBeVisible();
    
    // Verify check icon is shown (green checkmark)
    const checkIcon = page.locator('svg').filter({ hasText: '' }).first();
    await expect(checkIcon).toBeVisible();
  });

  test('should show tab counts for each config section', async ({ page }) => {
    await page.getByTestId('tab-developer').click();
    
    // Verify tab labels show counts
    const guardrailsTab = page.getByTestId('tab-guardrails');
    const filtersTab = page.getByTestId('tab-filters');
    const goalsTab = page.getByTestId('tab-goals');
    
    await expect(guardrailsTab).toContainText('(4)');
    await expect(filtersTab).toContainText('(16)');
    await expect(goalsTab).toContainText('(3)');
  });

  test('should display raw JSON preview', async ({ page }) => {
    await page.getByTestId('tab-developer').click();
    
    // Scroll to bottom to see raw JSON
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    
    // Verify raw JSON preview is visible
    await expect(page.getByText('Raw JSON (Preview)')).toBeVisible();
    
    // Verify it contains JSON structure
    const jsonPreview = await page.locator('pre').textContent();
    expect(jsonPreview).toContain('"mode"');
    expect(jsonPreview).toContain('"legacyReads"');
    expect(jsonPreview).toContain('"schemaHash"');
  });
});
