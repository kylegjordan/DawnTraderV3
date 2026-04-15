/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Phase 15b B61 — DBS Telemetry Emitter (observational, feature-flagged)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Shared helper for the three DBS telemetry emission sites locked in
 * BATCH_61_PRE_AUDIT.md §6 + §6.9:
 *
 *   1. MCE per-cycle DBS snapshot     → logs/phase15b_dbs_telemetry/YYYY-MM-DD.jsonl
 *   2. signal-orchestrator.ts:454     → logs/phase15b_dbs_telemetry/consumer_sites/YYYY-MM-DD.jsonl
 *   3. vts-runner.ts:877              → logs/phase15b_dbs_telemetry/consumer_sites/YYYY-MM-DD.jsonl
 *
 * RULES:
 * - Gated on env var DT_PHASE15B_DBS_TELEMETRY=1. When unset, emission is a no-op.
 * - Fire-and-forget: a thrown error inside an emitter MUST NOT fail the caller.
 *   All writes are wrapped in try/catch with a rate-limited console.warn.
 * - No behavior change: these emitters read already-computed values and append
 *   them to JSONL files. They do not mutate caller state.
 * - Freeze-compliant: no changes to directional-bias.ts or market-regime.ts.
 *
 * RETENTION: files are deleted when Phase 15b closes (end of B65 or earlier).
 *
 * DO NOT import this module outside Phase 15b instrumentation sites.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_DBS_CONFIG } from '../types/directional-bias.types.js';

const ENV_FLAG = 'DT_PHASE15B_DBS_TELEMETRY';
const MCE_LOG_DIR = 'logs/phase15b_dbs_telemetry';
const CONSUMER_LOG_DIR = 'logs/phase15b_dbs_telemetry/consumer_sites';

// Rate-limited warn state — one warn per error type per minute max.
const warnBuckets = new Map<string, number>();
const WARN_INTERVAL_MS = 60_000;

function isEnabled(): boolean {
  return process.env[ENV_FLAG] === '1';
}

function ratelimitedWarn(key: string, message: string): void {
  const now = Date.now();
  const last = warnBuckets.get(key) ?? 0;
  if (now - last >= WARN_INTERVAL_MS) {
    warnBuckets.set(key, now);
    console.warn(`[Phase15b][Telemetry][${key}] ${message}`);
  }
}

function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err: any) {
    if (err?.code !== 'EEXIST') throw err;
  }
}

function utcDateStamp(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function appendLine(dir: string, line: string, errKey: string): void {
  try {
    ensureDir(dir);
    const filePath = path.join(dir, `${utcDateStamp()}.jsonl`);
    fs.appendFileSync(filePath, line + '\n', { encoding: 'utf8' });
  } catch (err: any) {
    ratelimitedWarn(errKey, `append failed: ${err?.message ?? String(err)}`);
  }
}

// ─── Sentinel-zero guard (single source of truth) ──────────────────────────────
//
// Mirror of the early-return condition in directional-bias.ts. Computed from
// DEFAULT_DBS_CONFIG live values — NO hardcoded 30/21/48/26 in this file.
// If the DBS module's config changes, this guard tracks automatically.
export function isSentinelZero(ohlcLen: number, atr: number): boolean {
  const minLookback = Math.max(
    DEFAULT_DBS_CONFIG.lookbackPeriod,
    DEFAULT_DBS_CONFIG.emaPeriods.slow + 1
  );
  return ohlcLen < minLookback || atr <= 0;
}

// ─── Emitter 1: MCE per-cycle snapshot ─────────────────────────────────────────

export interface MceTelemetryInput {
  cycleId: string | number;
  symbol: string;
  dbsScore: number;
  dbsCategory: string;
  slopeComponent: number;
  returnComponent: number;
  emaComponent: number;
  ohlcLen: number;
  atr: number;
  vol: number;
  adx: number;
  mom: number;
  regime: string;
}

export function emitMceTelemetry(input: MceTelemetryInput): void {
  if (!isEnabled()) return;
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      cycleId: input.cycleId,
      symbol: input.symbol,
      dbs: {
        score: input.dbsScore,
        category: input.dbsCategory,
        slopeComponent: input.slopeComponent,
        returnComponent: input.returnComponent,
        emaComponent: input.emaComponent,
        sentinelZero: isSentinelZero(input.ohlcLen, input.atr),
      },
      classifier: {
        vol: input.vol,
        adx: input.adx,
        mom: input.mom,
        regime: input.regime,
      },
      ohlc: { len: input.ohlcLen },
      atr: input.atr,
    });
    appendLine(MCE_LOG_DIR, line, 'mce');
  } catch (err: any) {
    ratelimitedWarn('mce-serialize', err?.message ?? String(err));
  }
}

// ─── Emitter 2+3: Consumer-site (signal-orchestrator + vts-runner) ─────────────

export type ConsumerSite = 'signal-orchestrator.ts:454' | 'vts-runner.ts:877';

export interface ConsumerTelemetryInput {
  cycleId: string | number;
  site: ConsumerSite;
  symbol: string;
  strategy: string | null;
  dbsCategory: string;
  dbsModifier: number;
  confidencePreDBS: number;
  confidencePostDBS: number;
  finalScorePreDBS: number;
  finalScorePostDBS: number;
  dbsApplied: boolean;
}

export function emitConsumerTelemetry(input: ConsumerTelemetryInput): void {
  if (!isEnabled()) return;
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      cycleId: input.cycleId,
      site: input.site,
      symbol: input.symbol,
      strategy: input.strategy,
      dbsCategory: input.dbsCategory,
      dbsModifier: input.dbsModifier,
      confidencePreDBS: input.confidencePreDBS,
      confidencePostDBS: input.confidencePostDBS,
      finalScorePreDBS: input.finalScorePreDBS,
      finalScorePostDBS: input.finalScorePostDBS,
      dbsApplied: input.dbsApplied,
    });
    appendLine(CONSUMER_LOG_DIR, line, `consumer-${input.site}`);
  } catch (err: any) {
    ratelimitedWarn('consumer-serialize', err?.message ?? String(err));
  }
}
