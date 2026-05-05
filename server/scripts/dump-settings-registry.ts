/**
 * B72 — Settings Registry Dumper
 *
 * Generates `1-system-manual/CURRENT_SETTINGS_REGISTRY.md` from the live DB
 * tables that hold operator-tunable settings. Answers the question:
 *   "What is X currently set to RIGHT NOW?"
 *
 * Runs:
 *   - On demand: `tsx server/scripts/dump-settings-registry.ts`
 *   - As a post-deploy hook (optional): wire into deploy script after PM2 restart
 *
 * Companion to `1-system-manual/LEVER_INVENTORY.md` (static catalog of where
 * tunable levers live in source). LEVER_INVENTORY is updated when source code
 * adds/removes/migrates a lever; this REGISTRY is regenerated whenever a DB
 * value changes.
 *
 * Schema sources read:
 *   - module_constants (B65.1 — primary B72 surface)
 *   - screener_filters (mode-specific runtime authority for SQE thresholds)
 */

import 'dotenv/config';
import { db } from '../db.js';
import { moduleConstants, screenerFilters } from '../../shared/schema.js';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface RegistryRow {
  module: string;
  exchange: string;
  assetClass: string;
  strategy: string;
  regime: string;
  constantName: string;
  value: string;
  updatedAt: string;
  updatedBy: string | null;
}

function fmtScope(r: RegistryRow): string {
  // Render scope in the same shape as inventory entries: (exchange, asset_class, strategy, regime)
  return `(${r.exchange}, ${r.assetClass}, ${r.strategy}, ${r.regime})`;
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

async function loadModuleConstants(): Promise<RegistryRow[]> {
  const rows = await db.select().from(moduleConstants);
  return rows
    .map((r) => ({
      module: r.moduleName,
      exchange: r.exchange,
      assetClass: r.assetClass,
      strategy: r.strategy,
      regime: r.regime,
      constantName: r.constantName,
      value: fmtValue(r.value),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
      updatedBy: r.updatedBy ?? null,
    }))
    .sort((a, b) => {
      if (a.module !== b.module) return a.module.localeCompare(b.module);
      if (a.constantName !== b.constantName) return a.constantName.localeCompare(b.constantName);
      // Same module + constant: sort by scope specificity (more specific first)
      const aSpec = (a.exchange !== '*' ? 1 : 0) + (a.assetClass !== '*' ? 2 : 0) +
                    (a.strategy !== '*' ? 4 : 0) + (a.regime !== '*' ? 8 : 0);
      const bSpec = (b.exchange !== '*' ? 1 : 0) + (b.assetClass !== '*' ? 2 : 0) +
                    (b.strategy !== '*' ? 4 : 0) + (b.regime !== '*' ? 8 : 0);
      return bSpec - aSpec;
    });
}

async function loadScreenerFilters(): Promise<Array<Record<string, unknown>>> {
  const rows = await db.select().from(screenerFilters);
  return rows.map((r) => r as unknown as Record<string, unknown>);
}

function renderModuleConstantsSection(rows: RegistryRow[]): string {
  if (rows.length === 0) {
    return '_No rows in `module_constants`._\n';
  }
  let out = `**Total rows:** ${rows.length}\n\n`;

  // Group by module for readability
  const byModule = new Map<string, RegistryRow[]>();
  for (const r of rows) {
    if (!byModule.has(r.module)) byModule.set(r.module, []);
    byModule.get(r.module)!.push(r);
  }

  const moduleNames = Array.from(byModule.keys()).sort();
  for (const moduleName of moduleNames) {
    const moduleRows = byModule.get(moduleName)!;
    out += `### \`${moduleName}\` (${moduleRows.length} ${moduleRows.length === 1 ? 'row' : 'rows'})\n\n`;
    out += '| Constant | Value | Scope (ex, asset, strat, regime) | Updated by | Updated at |\n';
    out += '|---|---|---|---|---|\n';
    for (const r of moduleRows) {
      out += `| \`${r.constantName}\` | \`${r.value}\` | \`${fmtScope(r)}\` | ${r.updatedBy ?? '_(null)_'} | ${r.updatedAt} |\n`;
    }
    out += '\n';
  }
  return out;
}

function renderScreenerFiltersSection(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '_No rows in `screener_filters`._\n';
  let out = `**Total rows:** ${rows.length}\n\n`;
  out += '| Field | Value |\n|---|---|\n';
  for (const row of rows) {
    out += `\n#### Mode: \`${row.mode ?? '(unknown)'}\`\n\n`;
    out += '| Field | Value |\n|---|---|\n';
    for (const [key, val] of Object.entries(row)) {
      if (key === 'mode' || key === 'id') continue;
      out += `| \`${key}\` | \`${fmtValue(val)}\` |\n`;
    }
  }
  return out;
}

async function main(): Promise<void> {
  console.log('[dump-settings-registry] Loading module_constants...');
  const moduleRows = await loadModuleConstants();
  console.log(`[dump-settings-registry] Loaded ${moduleRows.length} module_constants rows.`);

  console.log('[dump-settings-registry] Loading screener_filters...');
  const screenerRows = await loadScreenerFilters();
  console.log(`[dump-settings-registry] Loaded ${screenerRows.length} screener_filters rows.`);

  const generatedAt = new Date().toISOString();
  let body = '';
  body += `# CURRENT_SETTINGS_REGISTRY.md — Live snapshot of DB-tunable settings\n\n`;
  body += `> Auto-generated by \`server/scripts/dump-settings-registry.ts\`. **Do not edit by hand.**\n\n`;
  body += `**Generated at:** ${generatedAt}\n\n`;
  body += `**Companion files:**\n`;
  body += `- \`1-system-manual/LEVER_INVENTORY.md\` — static catalog of where each lever lives in source.\n`;
  body += `- \`Claude Comms and Packages/Scope Files/BATCH_72_SCOPE.md\` — scope of the lever migration.\n\n`;
  body += `Re-run on demand:\n\`\`\`bash\nDATABASE_URL=... tsx server/scripts/dump-settings-registry.ts\n\`\`\`\n\n`;
  body += `---\n\n`;
  body += `## §1. \`module_constants\` (B65.1 + B72)\n\n`;
  body += `Resolution: 5-dim \`(module_name, exchange, asset_class, strategy, regime)\` → \`constant_name\` → \`value\`. Most-specific-wins via \`moduleConstantsService\`. 60s in-memory cache; sync-read modules pre-warmed at boot via \`server/startup/b72-warmup.ts\`.\n\n`;
  body += renderModuleConstantsSection(moduleRows);
  body += `\n---\n\n`;
  body += `## §2. \`screener_filters\`\n\n`;
  body += `Mode-specific runtime authority for SQE primary admission gates (\`finalScoreMin\`, \`regimeWeightMin\`) and the broader screener config. Reads precedence (B72): \`screener_filters\` → \`module_constants 'sqe_config'\` → \`SQE_DEFAULT_THRESHOLDS\` static mirror.\n\n`;
  body += renderScreenerFiltersSection(screenerRows);
  body += `\n---\n\n`;
  body += `_End of CURRENT_SETTINGS_REGISTRY.md._\n`;

  const outPath = resolve(process.cwd(), '1-system-manual/CURRENT_SETTINGS_REGISTRY.md');
  writeFileSync(outPath, body, 'utf8');
  console.log(`[dump-settings-registry] Wrote ${outPath}`);
}

main().catch((err) => {
  console.error('[dump-settings-registry] FAILED:', err);
  process.exit(1);
});
