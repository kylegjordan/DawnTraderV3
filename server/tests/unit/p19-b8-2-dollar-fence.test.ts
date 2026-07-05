// P19-B8.2 (OBJ-5) — the dollar-agnostic decision-path FENCE (static-scan leg).
//
// WHAT THIS PROVES (and — honestly — what it does NOT):
//   A green run proves: no RAW NUMERIC LITERAL is compared against a
//   dollar-semantic variable (usd/notional/capital/balance/dollar-named) inside
//   the ENUMERATED decision-path modules, outside the enumerated PERMITTED
//   allowlist. A new raw-$ gate in these modules FAILS this test until it is
//   deliberately enumerated (fail-closed).
//
//   COVERAGE BOUNDARY (Langston Step-2 item 5 — do not read green as more):
//   a $ threshold arriving via a module_constants row, a variable defined
//   elsewhere, or a computed value is NOT caught by a literal scanner. The
//   guards there are: (1) DB-governed knobs go through ADJUSTMENT_FRAMEWORK
//   review, (2) the module-constants resolver fail-hards on missing rows so no
//   silent $ default can hide, (3) Langston's Step-4 diff review of any change
//   to these modules. B8.2 itself introduced NO new gate seam taking a raw
//   dollar threshold (the divergence knobs are bps/count/ms — relative by
//   construction, unit-tested in p19-b8-2-friction-divergence.test.ts), so the
//   runtime-assertion leg reduces to the knob resolver's existing fail-hard —
//   DECLARED at Step-4 per scope §B-6, not silently skipped.
//
// FENCE CLASSIFICATION (pre-audit §2, per-row re-verified 2026-07-05):
//   PERMITTED  — order-sizing notional, exchange min-notional/min-order,
//                exchange-side fee computation (LPCP $25 floor lives in
//                guardrails_v2, DB-governed — not a code literal).
//   MARKET-FILTER — asset-own volume/price screening ($500k/$1M/$100M), out of
//                fence scope (screener config, not account-relative decisions).
//   The live decision path has ZERO account-relative $ thresholds (the legacy
//   dollar `guardrails` table is unread by it; retirement = B6.10).
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// The enumerated decision-path modules (scanner → strategy guards → SQE →
// EV kernel → maker/taker → RTB → sizing → the new divergence math).
const FENCED_MODULES = [
  'server/core/filters/signal_quality_evaluator.ts',
  'server/core/calculations/net-expectancy-kernel.ts',
  'server/core/math/maker-taker-decision.ts',
  'server/core/math/friction-divergence.ts',
  'server/core/trading/pending-maker-logic.ts',
  'server/services/active-position-sizing.ts',
  'server/strategies/strategy-helpers.ts',
];

// Deliberately-enumerated exceptions: 'file::marker' — a substring of the
// offending line. Adding a new $ gate requires adding a row HERE, which is
// exactly the deliberate-enumeration act the fence exists to force.
const PERMITTED_ALLOWLIST: string[] = [
  // (empty — the enumerated modules are clean today; keep it that way)
];

/**
 * Flag lines where a dollar-semantic identifier is compared against a raw
 * numeric literal >= 10 (spacing tolerant, both orders). Percent/bps/ms/count
 * identifiers are exempt — the fence targets ABSOLUTE-dollar gating only.
 */
export function scanForDollarComparisons(source: string): Array<{ line: number; text: string }> {
  const hits: Array<{ line: number; text: string }> = [];
  const lines = source.split(/\r?\n/);
  const dollarIdent = /(usd|notional|dollar|capital|balance)/i;
  const relativeExempt = /(pct|percent|bps|ratio|ms\b|count|version|scale|precision)/i;
  const cmpLiteral = /(?:[<>]=?|===?|!==?)\s*(\d{2,}(?:\.\d+)?)(?![\d.])|(\d{2,}(?:\.\d+)?)\s*(?:[<>]=?|===?|!==?)/;
  lines.forEach((text, i) => {
    const trimmed = text.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (!dollarIdent.test(text)) return;
    if (relativeExempt.test(text)) return;
    if (!cmpLiteral.test(text)) return;
    hits.push({ line: i + 1, text: trimmed });
  });
  return hits;
}

describe('dollar-agnostic fence — static scan (fail-closed)', () => {
  it('RED-PROOF: the scanner flags a seeded raw-$ gate (the test cannot pass by not checking)', () => {
    const seeded = [
      'function gate(sizedNotionalUsd: number) {',
      '  if (sizedNotionalUsd < 25) { return false; }', // the seeded violation
      '}',
    ].join('\n');
    const hits = scanForDollarComparisons(seeded);
    expect(hits.length).toBe(1);
    expect(hits[0].line).toBe(2);
  });

  it('does not flag relative (pct/bps/ratio/ms) comparisons', () => {
    const clean = [
      'if (riskPct > 1.5) {}',
      'if (divergenceBps >= 25) {}',
      'if (balanceRatioAtOpen < 0.5) {}',
      'if (pendingMs > 3600000) {}',
    ].join('\n');
    expect(scanForDollarComparisons(clean).length).toBe(0);
  });

  it('every enumerated decision-path module is free of raw-$ comparisons (or allowlisted)', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const offenders: string[] = [];
    for (const rel of FENCED_MODULES) {
      const abs = path.join(repoRoot, rel);
      if (!fs.existsSync(abs)) {
        offenders.push(`${rel} :: MODULE MISSING — fence enumeration is stale, fix the list`);
        continue;
      }
      const hits = scanForDollarComparisons(fs.readFileSync(abs, 'utf8'));
      for (const h of hits) {
        const allowed = PERMITTED_ALLOWLIST.some(
          (a) => a.startsWith(`${rel}::`) && h.text.includes(a.split('::')[1])
        );
        if (!allowed) offenders.push(`${rel}:${h.line} :: ${h.text}`);
      }
    }
    expect(offenders, `Un-enumerated raw-$ comparisons in fenced modules:\n${offenders.join('\n')}`).toEqual([]);
  });
});
