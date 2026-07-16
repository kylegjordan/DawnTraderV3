#!/usr/bin/env tsx
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-40 — System Alerts CLI
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Commands:
 *   add        Insert a scheduled alert
 *   fire-due   Dispatcher: promote scheduled entries whose triggers_at <= NOW()
 *              to active; post warning/critical entries to the Discord alerts webhook
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
 * Discord push: reads the secret alerts-webhook URL from ALERTS_DISCORD_WEBHOOK_URL
 * or /etc/langston/discord-alerts-webhook.env (B-DISCORD OBJ-5). Langston's bridge
 * always-engages on the webhook's id, so posting the alert IS the Langston engagement.
 * (The Telegram push + Langston SSH-invoke legs were REMOVED by B-TELEGRAM-DECOMM-2,
 * 2026-07-02 — see DELETED_COMPONENTS_LOG.md; history: B-NEW-43 #135 severity routing,
 * B-NEW-46 handler relay, B-DISCORD isolation gate.)
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
  processResurface,
  shouldDeliverToDiscord,
  ALERTS_FILE,
  type SystemAlert,
  type AlertSeverity,
  type AlertState,
  type ResurfaceDecision,
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

// ─── Discord push (B-DISCORD OBJ-5) ─────────────────────────────────────────
// Posts the alert DIRECT to a dedicated Discord "alerts" webhook (Langston-approved:
// staging posts direct, NOT via the Helsinki bridge, so a critical alert survives the
// bridge box being down). The webhook URL is a SECRET → read from a staging file
// (never the repo); absent ⇒ this is a no-op, so the path stays inert until Kyle
// provisions the webhook. The webhook's intrinsic webhook_id is the structured marker
// Langston's bridge always-engages on. Severity gating: warning+critical post, info skips.

function formatAlertTextDiscord(alert: SystemAlert): string {
  const meta =
    Object.keys(alert.metadata).length > 0
      ? `\n_Metadata:_ \`${JSON.stringify(alert.metadata).slice(0, 300)}\``
      : '';
  // Kyle directive 2026-07-10: a governance-checker alert must NOT read "SYSTEM ALERT" —
  // it should say GOVERNANCE at a glance so it's distinguishable from an ops/system alert.
  // Header is keyed on category: governance → "🏛️ GOVERNANCE CHECK ISSUE"; everything else
  // keeps the "🚨 SYSTEM ALERT" banner.
  const header =
    alert.category === 'governance'
      ? `🏛️ **GOVERNANCE CHECK ISSUE — ${alert.severity.toUpperCase()}**`
      : `🚨 **SYSTEM ALERT — ${alert.severity.toUpperCase()}**`;
  const text =
    `${header}\n` +
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

// Returns true iff the Discord alerts webhook actually delivered (false when unprovisioned
// or info-severity) — feeds the re-surface delivery gate (B-ALERT-PROTOCOL #340).
async function pushToDiscord(alert: SystemAlert): Promise<boolean> {
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
    return false;
  }
  // B-GOV-INTEGRITY-1 OBJ-3: delivery is CLASS-driven, not severity-only. An info
  // alert whose category must-never-be-silent (governance, breakage) now delivers;
  // routine info still skips. Replaces the old inline warning/critical-only gate
  // (B-NEW-43 #135) that silenced 117 info alerts including governance gaps.
  if (shouldDeliverToDiscord(alert)) {
    const ok = await discordWebhookSend(webhookUrl, formatAlertTextDiscord(alert));
    if (ok) console.log(`[fire-due] Discord alert posted for ${alert.id} (${alert.severity}/${alert.category})`);
    return ok;
  }
  return false;
}

// ─── B-ALERT-PROTOCOL (#340): re-surface = "fire again, louder" ─────────────
// A re-surface reuses the FIRE path's delivery (pushToDiscord — the sole sink since
// B-TELEGRAM-DECOMM-2) so it actually re-engages Langston (the alerts webhook always-engages
// his bridge → he re-emits the owner marker → the owner CC is re-woken to chase closure).
// We reframe the alert (louder title + owner/age + the Kyle escalation on the 2nd+) and hand
// it to the same sink; the orchestration (processResurface) advances the back-off ONLY on
// real delivery, so a Discord outage does not consume the re-surface window.
function frameResurface(alert: SystemAlert, d: ResurfaceDecision, nowMs: number): SystemAlert {
  const firedMs = alert.fired_at ? Date.parse(alert.fired_at) : Date.parse(alert.created_at);
  const hrs = Math.max(0, Math.round((nowMs - firedMs) / 3_600_000));
  const owner = alert.acknowledged_by ? `owned by ${alert.acknowledged_by}` : 'UNCLAIMED — nobody has acked it';
  const kyle = d.escalateToKyle
    ? `\n\nKyle — open ~${hrs}h with no resolution; please push it to closure or reassign.`
    : '';
  return {
    ...alert,
    title: `⏰ RE-SURFACE #${d.resurfaceCount} — STILL UNRESOLVED: ${alert.title}`,
    body: `${owner}, open ~${hrs}h. ${alert.body}\nClose it: resolve ${alert.id} --by <you>.${kyle}`,
  };
}

// ─── Subcommand implementations ────────────────────────────────────────────

async function cmdAdd(args: string[]): Promise<void> {
  const triggers_at = requireFlag(args, 'triggers-at');
  // B-GOV-INTEGRITY-1 OBJ-4: the `as AlertCategory` cast is DELETED — it was the
  // hole that let 13 category strings into a 6-member type. Pass the raw string;
  // addAlert() validates it against the creatable SSOT and throws on an off-set
  // value, so a typo fails loudly here instead of vanishing from every consumer.
  const category = requireFlag(args, 'category');
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
  // B-STAGING-LIVENESS-WATCH: --dedupe-key exposes addAlert's existing B-NEW-51
  // dedup to CLI callers (the watchdog's CLI path and its direct-append fallback
  // converge on ONE alert per outage via the same key).
  const dedupeKey = getFlag(args, 'dedupe-key');
  const entry = await addAlert({
    triggers_at, category, severity, title, body, metadata,
    ...(dedupeKey ? { dedupe_key: dedupeKey } : {}),
  });
  console.log(JSON.stringify(entry, null, 2));
}

async function cmdFireDue(): Promise<void> {
  const promoted = await fireDue();
  if (promoted.length === 0) {
    console.log('[fire-due] no scheduled alerts due');
  } else {
    console.log(`[fire-due] promoted ${promoted.length} alert(s) to active`);
    for (const alert of promoted) {
      console.log(`  - ${alert.id} [${alert.severity}] ${alert.title}`);
      // Sole delivery sink (B-TELEGRAM-DECOMM-2): the Discord alerts webhook —
      // warning + critical post (info skips); posting it always-engages
      // Langston's bridge (webhook_id), which performs the §10.5 triage +
      // owner-routing. The §10.5 per-turn pull of the queue file remains the
      // push-independent backstop.
      await pushToDiscord(alert);
    }
  }

  // B-ALERT-PROTOCOL (#340): no-silent-drop closure guarantee. Runs EVERY dispatch tick
  // (independent of promotions) — re-surfaces stale unresolved alerts so a diagnosed-but-
  // unfixed alert can never silently rot. The re-surface FIRES AGAIN through the full fire
  // path (so it actually re-engages Langston + re-wakes the owner + reaches the live channel),
  // and the back-off advances ONLY on real delivery (processResurface) — an undelivered
  // re-surface does NOT consume the window and retries next tick.
  const nowMs = Date.now();
  const results = await processResurface(nowMs, async (alert, d) => {
    const framed = frameResurface(alert, d, nowMs);
    return pushToDiscord(framed); // delivered iff the sole sink succeeded (behavior-identical to the isolation-on state: false || dc || false)
  });
  const delivered = results.filter((r) => r.delivered);
  if (delivered.length > 0) {
    console.log(`[fire-due] re-surfaced ${delivered.length} stale unresolved alert(s): ${delivered.map((r) => r.id).join(', ')}`);
  }
  const undelivered = results.filter((r) => !r.delivered && !r.skipped);
  if (undelivered.length > 0) {
    // No channel delivered — the closure guarantee could not reach anyone. Do NOT advance
    // the back-off (already gated in processResurface); surface it loudly so the dead-channel
    // condition is itself visible. Retries next tick.
    console.warn(`[fire-due] WARNING: ${undelivered.length} stale alert(s) had NO delivery channel (the Discord alerts webhook failed or is unconfigured — the sole push sink since B-TELEGRAM-DECOMM-2) — back-off NOT advanced, retrying next tick: ${undelivered.map((r) => r.id).join(', ')}`);
  }
}

async function cmdList(args: string[]): Promise<void> {
  const state = getFlag(args, 'state') as AlertState | undefined;
  // OBJ-4: no `as AlertCategory` cast — listAlerts accepts a raw string filter so
  // grandfathered/historical categories remain filterable.
  const category = getFlag(args, 'category');
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
    console.error('Usage: resolve <id> --by <user> --evidence <reference-or-sentinel>');
    process.exit(1);
  }
  const by = requireFlag(args, 'by');
  // B-GOV-INTEGRITY-1 (F3b): closure must record WHY it is legitimate. --evidence
  // is REQUIRED and hard-gated (a reference token or a sanctioned sentinel); there
  // is no default and no empty. transport is 'cli' — stamped here, never a flag,
  // so the caller cannot forge the verifiable half of the provenance.
  const evidence = requireFlag(args, 'evidence');
  let updated: Awaited<ReturnType<typeof resolveAlert>>;
  try {
    updated = await resolveAlert(id, by, evidence, 'cli');
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
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
