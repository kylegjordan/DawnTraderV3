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
  parseMode: 'Markdown' | 'plain' = 'Markdown',
): Promise<boolean> {
  // B-NEW-43 Phase 4 chunk-12 (2026-05-23, post-token-deploy hotfix):
  // The parseMode parameter previously defaulted to 'Markdown' with type
  // `'Markdown' | undefined`. The Markdown-parse-fail fallback recursed with
  // explicit `undefined`, but JS default-parameter semantics treat explicit-
  // undefined as use-the-default, so the recursion re-enabled Markdown
  // forever — producing the infinite "returned not-ok: can't parse entities"
  // loop observed when Phase 4 first went live on staging with a real token.
  // Switched the sentinel to the literal string 'plain' so the recursion is
  // explicit and the default-substitution trap is gone.
  try {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (threadId !== undefined) body.message_thread_id = threadId;
    if (parseMode === 'Markdown') body.parse_mode = 'Markdown';
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok) {
      console.warn(`[fire-due] Telegram send to chat=${chatId} thread=${threadId} returned not-ok:`, data.description);
      // Markdown parse failures: retry once with parseMode='plain' (no recursion past this — 'plain' branch falls through to return false).
      if (parseMode === 'Markdown' && data.description?.toLowerCase().includes("can't parse")) {
        return telegramSend(token, chatId, text, threadId, 'plain');
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

// ─── Discord push (B-DISCORD OBJ-5) ─────────────────────────────────────────
// Posts the alert DIRECT to a dedicated Discord "alerts" webhook (Langston-approved:
// staging posts direct, NOT via the Helsinki bridge, so a critical alert survives the
// bridge box being down). The webhook URL is a SECRET → read from a staging file
// (never the repo); absent ⇒ this is a no-op, so the path stays inert until Kyle
// provisions the webhook. The webhook's intrinsic webhook_id is the structured marker
// Langston's bridge always-engages on. Severity gating mirrors Telegram (info skips).

function formatAlertTextDiscord(alert: SystemAlert): string {
  const meta =
    Object.keys(alert.metadata).length > 0
      ? `\n_Metadata:_ \`${JSON.stringify(alert.metadata).slice(0, 300)}\``
      : '';
  const text =
    `🚨 **SYSTEM ALERT — ${alert.severity.toUpperCase()}**\n` +
    `**${alert.title}**\n${alert.body}\n` +
    `_Category:_ ${alert.category}  ·  _Alert ID:_ \`${alert.id}\`${meta}`;
  // Discord hard-caps content at 2000 chars; leave headroom.
  return text.length > 1900 ? text.slice(0, 1900) + '…' : text;
}

async function discordWebhookSend(webhookUrl: string, content: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.status === 429) {
        const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
        const wait = Math.min((data.retry_after ?? 1) + 0.1, 10);
        console.warn(`[fire-due] Discord webhook 429 — retry in ${wait}s (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      if (!res.ok) {
        console.warn(`[fire-due] Discord webhook returned HTTP ${res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[fire-due] Discord webhook threw:', err);
      return false;
    }
  }
  return false;
}

async function pushToDiscord(alert: SystemAlert): Promise<void> {
  // Resolve the secret webhook URL: prefer an explicit env var, else a secrets file.
  let webhookUrl = process.env.ALERTS_DISCORD_WEBHOOK_URL || null;
  if (!webhookUrl) {
    const file = process.env.ALERTS_DISCORD_WEBHOOK_FILE || '/etc/langston/discord-alerts-webhook.env';
    if (fs.existsSync(file)) {
      const line = fs.readFileSync(file, 'utf-8').split('\n').find((l) => l.includes('ALERTS_WEBHOOK_URL='));
      if (line) webhookUrl = line.split('=').slice(1).join('=').trim();
    }
  }
  if (!webhookUrl) {
    // Inert until Kyle provisions the alerts webhook — no Discord posting yet.
    return;
  }
  // Mirror Telegram severity gating: warning + critical post; info skips.
  if (alert.severity === 'warning' || alert.severity === 'critical') {
    const ok = await discordWebhookSend(webhookUrl, formatAlertTextDiscord(alert));
    if (ok) console.log(`[fire-due] Discord alert posted for ${alert.id}`);
  }
}

/**
 * Single-quote a string for safe inclusion in a remote `sudo -u langston bash`
 * argv. Wraps in single quotes and escapes embedded single quotes via the
 * '\'' idiom. Alert fields (title/body) are operator/CC-authored, but quoting
 * defensively keeps a stray quote from breaking the remote command.
 */
function shellSingleQuote(s: string): string {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * Invoke Langston for an active alert. Delegates to the Helsinki-side wrapper
 * `langston-alert-handler.sh` (B-NEW-46), which runs a fresh Langston
 * claude-cli session, logs the response, AND relays it to Telegram topic 21
 * via @LangstonDTBot so Kyle sees a visible confirmation — closing the gap
 * where Langston's alert handling was a silent server-side acknowledgment
 * (Kyle directive 2026-05-28).
 *
 * The SSH call launches the wrapper detached (setsid) ON Helsinki and returns
 * immediately, so the dispatcher does NOT block on Langston's multi-minute
 * session. Because the SSH itself is now fast, we AWAIT it and capture the
 * exit code (B-NEW-46 Part C / Langston B-NEW-45 Q4.a) — an SSH-level failure
 * (can't reach Helsinki) is the one failure the wrapper-side relay can't cover,
 * so it's logged here. All other failure modes (session error / timeout /
 * empty) are relayed to Telegram by the wrapper itself (its 5a invariant).
 *
 * Skipped in dev / non-staging envs (LANGSTON_INVOKE=0 disables explicitly).
 */
async function invokeLangstonForAlert(alert: SystemAlert): Promise<void> {
  if (process.env.LANGSTON_INVOKE === '0') {
    console.log(`[fire-due] LANGSTON_INVOKE=0 — skipping Langston invoke for ${alert.id}`);
    return;
  }
  if (alert.severity === 'info') return;

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  // Positional args to the wrapper: id severity category title body.
  // Body capped at 2000 chars (the wrapper embeds it in the claude-cli prompt).
  const args = [alert.id, alert.severity, alert.category, alert.title, alert.body.slice(0, 2000)];
  const quotedArgs = args.map(shellSingleQuote).join(' ');

  // Launch the wrapper detached on Helsinki via setsid (survives SSH close);
  // SSH returns once the background job is launched, not when it finishes.
  //
  // NO `bash -c '...'` wrapper: ssh already runs the remote command through
  // the login shell, so the redirects + `&` are interpreted there. Wrapping in
  // `bash -c '...'` would open an outer single-quote region that structurally
  // collides with shellSingleQuote's inner `'<arg>'` quoting — the args would
  // leak as outer-shell word boundaries (title truncated at first space, body
  // dropped). Langston B-NEW-46 Step 4 blocker; verified via remote-shell repro
  // that the un-wrapped form delivers all 5 args with spaces intact.
  const remoteCmd =
    `sudo -u langston setsid /usr/local/bin/langston-alert-handler.sh ${quotedArgs} ` +
    `>> /var/log/langston-alert-invokes.log 2>&1 < /dev/null &`;

  try {
    await execFileAsync(
      'ssh',
      ['-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', 'root@204.168.141.77', remoteCmd],
      { timeout: 20000 },
    );
    console.log(`[fire-due] Langston invoke launched on Helsinki for alert ${alert.id} (handler relays response to Telegram)`);
  } catch (err) {
    // Part C: SSH-level failure — the wrapper never ran, so its 5a relay can't
    // fire. This console.error line is the only signal that the invoke didn't
    // reach Langston; the dispatcher systemd unit captures stderr via
    // StandardError=append:/var/log/dawntrader/system-alerts-dispatcher.log.
    console.error(
      `[fire-due] Langston invoke SSH FAILED for alert ${alert.id} (could not reach Helsinki): ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
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
    // B-NEW-43 Phase 4 (2026-05-23, RUNNING_ISSUES #135 fix):
    //   - Telegram push routes by severity (critical → DM + group topic 21;
    //     warning → group topic 21 only; info → no push).
    //   - Langston SSH invoke for warning + critical so a Langston session
    //     runs and performs §10.5 surfacing on his side. Fire-and-forget.
    await pushToTelegram(alert);
    await pushToDiscord(alert); // B-DISCORD OBJ-5: also post to the Discord alerts webhook (inert until provisioned)
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
