/**
 * B-ENTRY-GATE (`#1224`) increment B — P8: the reward-to-risk / reach target gate runs BEFORE the RTB queue write.
 * Scope, pre-audit and plan: `Claude Comms and Packages/Scope Files/B_ENTRY_GATE_{SCOPE,PRE_AUDIT}.md` (P8, A-8).
 *
 * Measured 2026-11-05 (pre-audit r9, A-8): TQQQ/USD sma_trend_ride was dropped `unreachable` at 09:17:05Z and written
 * to the queue in the same second, because `queueSQESignal` ran ~400 lines before the gate in the same function.
 * The orchestrator needs its whole graph to run, so the order is proved at the source, as in `b-entry-gate.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const src = stripComments(readFileSync('server/services/signal-orchestrator.ts', 'utf-8'));

describe('P8 — the target gate runs before the queue write (Kyle decision 8; #1051 structural case)', () => {
  const gate = src.indexOf('const _b2 = normalizeAndGateTarget(');
  const drop = src.indexOf("recordActivePostSqeReject(sizingContext.mode, _fClass, _b2.reason ?? 'target_gate_unknown')");
  const queueInput = src.indexOf('const sqeSignalInput: SQESignalInput = {');
  const queueWrite = src.indexOf('readyToBuyService.queueSQESignal(sqeSignalInput)');
  const sqe = src.indexOf('await signalQualityEvaluator.evaluate(sqeInput');

  it('exactly one target gate and one queue write in the orchestrator', () => {
    expect(src.split('normalizeAndGateTarget(').length - 1).toBe(1);
    expect(src.split('queueSQESignal(').length - 1).toBe(1);
  });
  it('order: SQE → target gate → its drop (return null) → queue input → queue write', () => {
    expect(sqe).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(sqe);
    expect(drop).toBeGreaterThan(gate);
    expect(queueInput).toBeGreaterThan(drop);
    expect(queueWrite).toBeGreaterThan(queueInput);
    expect(src.slice(drop, queueInput)).toMatch(/return null;/);
  });
  it('the queue stores the gated target, not the raw one', () => {
    const input = src.slice(queueInput, src.indexOf('};', queueInput));
    expect(input).toMatch(/targetPrice: _b2Target,/);
    expect(input).not.toMatch(/targetPrice: rawSignal\.targetPrice/);
  });
});

describe("P9 (inc B, Langston Step-4 r3 §13) — no require() of a node built-in or a package anywhere in the server", () => {
  // The server is bundled as ESM (`esbuild --format=esm --packages=external`). esbuild bundles a require() of a LOCAL
  // module, but a require() of a built-in or an external package is left to run, and in ESM it throws. Every such site
  // was a silent no-op (tcl_event_trace, sqe_rejections, rtb_refresh_trace, the guard's violation log, a config hash).
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (n !== 'tests' && n !== 'node_modules') walk(p); }
      else if (/\.ts$/.test(n)) files.push(p);
    }
  };
  walk('server');
  const hits = (re: RegExp) => files.flatMap(f => {
    const code = stripComments(readFileSync(f, 'utf-8'));
    return [...code.matchAll(re)].map(m => `${f}: ${m[0]}`);
  });

  it('positive control: the scanner sees the server tree and finds the LOCAL requires it is meant to allow', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(hits(/\brequire\(\s*['"]\.{1,2}\/[^'"]+['"]\s*\)/g).length).toBeGreaterThan(0);
  });
  it('no require() of a non-relative specifier remains', () => {
    expect(hits(/\brequire\(\s*['"](?!\.{1,2}\/)[^'"]+['"]\s*\)/g)).toEqual([]);
  });
});
