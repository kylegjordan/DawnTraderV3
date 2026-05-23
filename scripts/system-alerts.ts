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

// ─── Telegram push + Langston invoke (for fire-due) ─────────────────────────

const KYLE_DM_CHAT_ID = 8734856533; // Kyle's private DM chat with @CCDTCommsBot
const TELEGRAM_GROUP_CHAT_ID = -1003575211453; // Dawn Trader HQ group
const TELEGRAM_BATCH_THREAD = 21; // Batch Implementation topic

// B-NEW-43 Phase 4 (2026-05-23, RUNNING_ISSUES #135 fix): the pre-fix
// dispatcher only pushed `critical` severity to Kyle's DM. Warning-tier soak-
// verification alerts (which are the majority) were silently promoted to
// `active` with no Telegram visibility — Kyle relied entirely on the §10.5
// per-turn pull check, which has two coverage gaps (no active CC session,
// Langston not persistently running). This batch fixes both gaps by (1)
// posting EVERY non-info-severity promotion to group topic 21 for Kyle
// visibility, and (2) invoking Langston via SSH so a Langston session runs
// and performs his side of the §10.5 surfacing.

async function readTokenFile(tokenFile: string): Promise<string | null> {
  if (!fs.existsSync(tokenFile)) {
    console.warn(`[fire-due] Telegram bot-token file ${tokenFile} not found — skipping push`);
    return null;
  }
  const tokenLine = fs.readFileSync(tokenFile, 'utf-8').split('\n').find((l) => l.includes('TOKEN='));
  if (!tokenLine) {
    console.warn(`[fire-due] no TOKEN= line in ${tokenFile} — skipping push`);
    return null;
  }
  return tokenLine.split('=').slice(1).join('=').trim();
}

function formatAlertText(alert: SystemAlert, mode: 'markdown' | 'plain'): string {
  if (mode === 'markdown') {
    return (
      `🚨 *SYSTEM ALERT — ${alert.severity.toUpperCase()}*\n\n` +
      `*${alert.title}*\n\n` +
      `${alert.body}\n\n` +
      `_Category: ${alert.category}_\n` +
      `_Alert ID: \`${alert.id}\`_\n` +
      (Object.keys(alert.metadata).length > 0
        ? `_Metadata: \`${JSON.stringify(alert.metadata).slice(0, 300)}\`_`
        : '')
    );
  }
  return (
    `SYSTEM ALERT — ${alert.severity.toUpperCase()}\n\n` +
    `${alert.title}\n\n` +
    `${alert.body}\n\n` +
    `Category: ${alert.category}\n` +
    `Alert ID: ${alert.id}\n` +
    (Object.keys(alert.metadata).length > 0
      ? `Metadata: ${JSON.stringify(alert.metadata).slice(0, 300)}`
      : '')
  );
}

async function telegramSend(
  token: string,
  chatId: number,
  text: string,
  threadId?: number,
  parseMode: 'Markdown' | undefined = 'Markdown',
): Promise<boolean> {
  try {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (threadId !== undefined) body.message_thread_id = threadId;
    if (parseMode) body.parse_mode = parseMode;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok) {
      console.warn(`[fire-due] Telegram send to chat=${chatId} thread=${threadId} returned not-ok:`, data.description);
      // Markdown parse failures: retry once without parse_mode.
      if (parseMode && data.description?.toLowerCase().includes("can't parse")) {
        return telegramSend(token, chatId, text, threadId, undefined);
      }
    }
    return data.ok ?? false;
  } catch (err) {
    console.warn(`[fire-due] Telegram send to chat=${chatId} thread=${threadId} threw:`, err);
    return false;
  }
}

async function pushToTelegram(alert: SystemAlert): Promise<void> {
  const tokenFile = process.env.CCDT_BOT_TOKEN_FILE || '/etc/langston/ccdt-bot.env';
  const token = await readTokenFile(tokenFile);
  if (!token) return;
  const markdownText = formatAlertText(alert, 'markdown');

  // Critical-tier: keep the DM push for backwards-compat (Kyle sees it
  // separately from the group thread).
  if (alert.severity === 'critical') {
    await telegramSend(token, KYLE_DM_CHAT_ID, markdownText);
  }

  // Warning + critical: post to group topic 21 so the alert is also visible
  // alongside ordinary CC ↔ Langston traffic. info-severity skips both paths.
  if (alert.severity === 'warning' || alert.severity === 'critical') {
    await telegramSend(token, TELEGRAM_GROUP_CHAT_ID, markdownText, TELEGRAM_BATCH_THREAD);
  }
}

/**
 * Invoke Langston via SSH+claude-cli so a Langston session runs and performs
 * the §10.5 per-turn alert-surfacing on his side. Fire-and-forget — we don't
 * wait for the SSH call to complete (Langston may take minutes; we don't
 * want to block the dispatcher).
 *
 * Skipped in dev / non-staging envs (LANGSTON_INVOKE=0 disables explicitly).
 */
async function invokeLangstonForAlert(alert: SystemAlert): Promise<void> {
  if (process.env.LANGSTON_INVOKE === '0') {
    console.log(`[fire-due] LANGSTON_INVOKE=0 — skipping Langston invoke for ${alert.id}`);
    return;
  }
  if (alert.severity === 'info') return;

  const { spawn } = await import('node:child_process');
  // Short prompt so the SSH+claude-cli call stays inside the file-first
  // protocol (CLAUDE.md §6.5.0). The alert body itself is small enough that
  // inline is fine (under ~3KB for soak-verification alerts).
  const prompt =
    `SYSTEM ALERT promoted to active. Please review on your side per CLAUDE.md §10.5 and surface to Kyle in your next reply if action is needed. ` +
    `Alert ID: ${alert.id}. ` +
    `Title: ${alert.title}. ` +
    `Severity: ${alert.severity}. ` +
    `Category: ${alert.category}. ` +
    `Body: ${alert.body.slice(0, 1500)}`;

  // SSH to Hetzner Helsinki where Langston runs.
  const remoteCmd =
    `sudo -u langston bash -c 'export CLAUDE_CODE_OAUTH_TOKEN=$(cat /etc/langston/oauth.env | cut -d= -f2-) && ` +
    `export HOME=/home/langston && cd /home/langston && ` +
    `FRESH_UUID=$(python3 -c "import uuid; print(uuid.uuid4())") && ` +
    `timeout 600 /usr/bin/claude -p --session-id $FRESH_UUID --model claude-opus-4-7 --permission-mode bypassPermissions ` +
    `${JSON.stringify(prompt)} ` +
    `>> /var/log/langston-alert-invokes.log 2>&1'`;

  const child = spawn(
    'ssh',
    ['-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', 'root@204.168.141.77', remoteCmd],
    { stdio: 'ignore', detached: true },
  );
  child.unref();
  console.log(`[fire-due] Langston invoke spawned for alert ${alert.id} (fire-and-forget)`);
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
    // B-NEW-43 Phase 4 (2026-05-23, RUNNING_ISSUES #135 fix):
    //   - Telegram push routes by severity (critical → DM + group topic 21;
    //     warning → group topic 21 only; info → no push).
    //   - Langston SSH invoke for warning + critical so a Langston session
    //     runs and performs §10.5 surfacing on his side. Fire-and-forget.
    await pushToTelegram(alert);
    await invokeLangstonForAlert(alert);
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
