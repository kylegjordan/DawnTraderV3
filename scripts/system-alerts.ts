#!/usr/bin/env tsx
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-40 — System Alerts CLI
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Commands:
 *   add        Insert a scheduled alert
 *   fire-due   Dispatcher: promote scheduled entries whose triggers_at <= NOW()
 *              to active; push critical-severity entries to Telegram
 *   list       Print alerts (optionally filtered by state and/or category)
 *   ack        Acknowledge an alert by id
 *   resolve    Mark an alert resolved (terminal state, kept for history)
 *
 * Examples:
 *   npm run system-alerts -- add --triggers-at 2026-05-31T00:00:00Z \
 *     --category soak_verification --severity warning \
 *     --title "B-NEW-40 14-day soak verification due" \
 *     --body "Run scripts/b-new-40-soak-verify.ts"
 *
 *   npm run system-alerts -- fire-due
 *   npm run system-alerts -- list --state active
 *   npm run system-alerts -- ack abc-123-uuid --by kyle
 *   npm run system-alerts -- resolve abc-123-uuid --by cc-session-2026-05-31
 *
 * Telegram push: requires CCDT_BOT_TOKEN_FILE env var pointing to
 * /etc/langston/ccdt-bot.env (or wherever the bot token lives).
 * Critical-severity alerts ping Kyle's DM at chat_id 8734856533.
 *
 * Reference: B_NEW_40_SCOPE.md §2.8
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import {
  addAlert,
  fireDue,
  listAlerts,
  ackAlert,
  resolveAlert,
  ALERTS_FILE,
  type SystemAlert,
  type AlertCategory,
  type AlertSeverity,
  type AlertState,
} from '../server/services/system-alerts.js';
import * as fs from 'node:fs';

// ─── Argument parsing ──────────────────────────────────────────────────────

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function requireFlag(args: string[], name: string): string {
  const v = getFlag(args, name);
  if (v === undefined) {
    console.error(`Missing required flag: --${name}`);
    process.exit(1);
  }
  return v;
}

// ─── Telegram push (for fire-due) ──────────────────────────────────────────

const KYLE_DM_CHAT_ID = 8734856533; // Kyle's private DM chat with @CCDTCommsBot

async function pushToTelegram(alert: SystemAlert): Promise<void> {
  const tokenFile = process.env.CCDT_BOT_TOKEN_FILE || '/etc/langston/ccdt-bot.env';
  if (!fs.existsSync(tokenFile)) {
    console.warn(`[fire-due] Telegram bot-token file ${tokenFile} not found — skipping push`);
    return;
  }
  const tokenLine = fs.readFileSync(tokenFile, 'utf-8').split('\n').find((l) => l.includes('TOKEN='));
  if (!tokenLine) {
    console.warn(`[fire-due] no TOKEN= line in ${tokenFile} — skipping push`);
    return;
  }
  const token = tokenLine.split('=').slice(1).join('=').trim();
  const text =
    `🚨 *SYSTEM ALERT — ${alert.severity.toUpperCase()}*\n\n` +
    `*${alert.title}*\n\n` +
    `${alert.body}\n\n` +
    `_Category: ${alert.category}_\n` +
    `_Alert ID: \`${alert.id}\`_\n` +
    (Object.keys(alert.metadata).length > 0
      ? `_Metadata: \`${JSON.stringify(alert.metadata).slice(0, 300)}\`_`
      : '');
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: KYLE_DM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok) {
      console.warn(`[fire-due] Telegram push for alert ${alert.id} returned not-ok:`, data.description);
    }
  } catch (err) {
    console.warn(`[fire-due] Telegram push for alert ${alert.id} threw:`, err);
  }
}

// ─── Subcommand implementations ────────────────────────────────────────────

async function cmdAdd(args: string[]): Promise<void> {
  const triggers_at = requireFlag(args, 'triggers-at');
  const category = requireFlag(args, 'category') as AlertCategory;
  const severity = requireFlag(args, 'severity') as AlertSeverity;
  const title = requireFlag(args, 'title');
  const body = requireFlag(args, 'body');
  const metadataStr = getFlag(args, 'metadata');
  let metadata: Record<string, unknown> = {};
  if (metadataStr) {
    try {
      metadata = JSON.parse(metadataStr);
    } catch (err) {
      console.error('Invalid JSON in --metadata:', err);
      process.exit(1);
    }
  }
  const entry = await addAlert({ triggers_at, category, severity, title, body, metadata });
  console.log(JSON.stringify(entry, null, 2));
}

async function cmdFireDue(): Promise<void> {
  const promoted = await fireDue();
  if (promoted.length === 0) {
    console.log('[fire-due] no scheduled alerts due');
    return;
  }
  console.log(`[fire-due] promoted ${promoted.length} alert(s) to active`);
  for (const alert of promoted) {
    console.log(`  - ${alert.id} [${alert.severity}] ${alert.title}`);
    // Telegram push for critical severity. Warning + info don't push by default
    // (deferred severity-routing batch will refine; see scope deferred-items).
    if (alert.severity === 'critical') {
      await pushToTelegram(alert);
    }
  }
}

async function cmdList(args: string[]): Promise<void> {
  const state = getFlag(args, 'state') as AlertState | undefined;
  const category = getFlag(args, 'category') as AlertCategory | undefined;
  const entries = listAlerts({ state, category });
  if (entries.length === 0) {
    console.log('(no alerts)');
    return;
  }
  for (const e of entries) {
    const ackStr = e.acknowledged_at
      ? ` (acked by ${e.acknowledged_by} at ${e.acknowledged_at})`
      : '';
    console.log(`${e.state.padEnd(13)} [${e.severity.padEnd(8)}] ${e.category.padEnd(18)} triggers_at=${e.triggers_at} id=${e.id}  ${e.title}${ackStr}`);
  }
}

async function cmdAck(args: string[]): Promise<void> {
  const id = args[1];
  if (!id || id.startsWith('--')) {
    console.error('Usage: ack <id> --by <user>');
    process.exit(1);
  }
  const by = requireFlag(args, 'by');
  const updated = await ackAlert(id, by);
  if (!updated) {
    console.error(`Alert ${id} not found`);
    process.exit(1);
  }
  console.log(JSON.stringify(updated, null, 2));
}

async function cmdResolve(args: string[]): Promise<void> {
  const id = args[1];
  if (!id || id.startsWith('--')) {
    console.error('Usage: resolve <id> --by <user>');
    process.exit(1);
  }
  const by = requireFlag(args, 'by');
  const updated = await resolveAlert(id, by);
  if (!updated) {
    console.error(`Alert ${id} not found`);
    process.exit(1);
  }
  console.log(JSON.stringify(updated, null, 2));
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd) {
    console.error('Usage: system-alerts <add|fire-due|list|ack|resolve> [...flags]');
    console.error(`Storage: ${ALERTS_FILE}`);
    process.exit(1);
  }
  switch (cmd) {
    case 'add':
      await cmdAdd(args);
      break;
    case 'fire-due':
      await cmdFireDue();
      break;
    case 'list':
      await cmdList(args);
      break;
    case 'ack':
      await cmdAck(args);
      break;
    case 'resolve':
      await cmdResolve(args);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
