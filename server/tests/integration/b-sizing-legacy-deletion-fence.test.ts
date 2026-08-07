/**
 * B-SIZING-DEC-RESTORE — REAPPEARANCE FENCE for the deleted legacy mechanisms.
 *
 * Kyle's directive (2026-08-07): deletions must be "loud, obvious, and will not allow
 * things intentionally deleted to be added back in." This file is the "will not allow"
 * half — it fails CI if a deleted mechanism returns.
 *
 * WHY A SOURCE FENCE AND NOT A BEHAVIOURAL ONE: a deleted module has no behaviour to
 * assert against. The only durable statement is about the SOURCE TREE.
 *
 * ★ TWO TRAPS THIS FILE IS SHAPED AROUND — both measured, neither hypothetical:
 *
 *  1. DYNAMIC IMPORTS ARE INVISIBLE TO A STATIC-IMPORT GREP (Langston, r6, Step-4-binding).
 *     Measured before the cut: `from '...adaptive-guardrails'` -> 0 hits, while
 *     `import('...adaptive-guardrails')` -> 6 hits. All six live reaches were dynamic.
 *     A fence matching only `from '...'` would have passed while proving NOTHING.
 *     => every reach assertion here matches BOTH syntaxes.
 *
 *  2. THE `/api/learning` NAMESPACE IS SHARED AND MUST SURVIVE (Langston, r6).
 *     Only six routes belonged to the tuner. ~30 other `/learning/*` routes have live
 *     client readers (enhanced-system-monitoring.tsx, learning-network-tab.tsx,
 *     ai-transparency.tsx). A prefix/namespace sweep would break working UI.
 *     => the LAST test is a POSITIVE CONTROL asserting the namespace is still populated,
 *        so an over-broad "cleanup" fails here instead of in front of Kyle.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const REPO = resolve(__dirname, '../../..');

/** Every .ts/.tsx source file under server/ and client/src, tests excluded. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (entry === 'node_modules' || entry === 'tests' || entry === '_archive') continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.ts$/.test(entry)) {
        out.push(p);
      }
    }
  };
  walk(join(REPO, 'server'));
  walk(join(REPO, 'client', 'src'));
  return out;
}

const FILES = sourceFiles();
const read = (f: string) => readFileSync(f, 'utf-8');

describe('B-SIZING-DEC-RESTORE — deleted legacy mechanisms must not reappear', () => {
  // Guard against the fence itself becoming vacuous: if the walk returns nothing,
  // every "no hits" assertion below would pass while proving nothing.
  it('POSITIVE CONTROL: the source walk actually found files', () => {
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES.some((f) => f.endsWith('routes.ts'))).toBe(true);
  });

  describe('obj-11 — the legacy adaptive tuner (#659)', () => {
    it('the module file is gone', () => {
      expect(existsSync(join(REPO, 'server/services/adaptive-guardrails.ts'))).toBe(false);
    });

    it('nothing imports it — BOTH static and dynamic syntax (trap 1)', () => {
      const offenders = FILES.filter((f) => {
        const src = read(f);
        return (
          /from\s+['"][^'"]*adaptive-guardrails['"]/.test(src) ||  // static
          /import\s*\(\s*['"][^'"]*adaptive-guardrails['"]/.test(src) || // dynamic
          /require\s*\(\s*['"][^'"]*adaptive-guardrails['"]/.test(src)   // cjs, for completeness
        );
      });
      expect(offenders.map((f) => f.replace(REPO, ''))).toEqual([]);
    });

    it('its symbols are gone from the tree', () => {
      const offenders = FILES.filter((f) =>
        /AdaptiveGuardrailsService|adaptiveGuardrails\.|applyAdaptiveAdjustments|LATTI_ADAPTIVE/.test(read(f)),
      );
      expect(offenders.map((f) => f.replace(REPO, ''))).toEqual([]);
    });

    it('the SIX tuner endpoints are absent — named individually, never by prefix (trap 2)', () => {
      const routes = read(join(REPO, 'server/routes.ts'));
      const SIX = [
        '/learning/telemetry/:mode',
        '/learning/behavioral-log/:mode',
        '/learning/history/:mode',
        '/learning/snapshot/:mode',
        '/learning/rollback/:mode',
        '/learning/mode/:tradingMode',
      ];
      for (const path of SIX) {
        expect(routes.includes(`'${path}'`), `tuner endpoint reappeared: ${path}`).toBe(false);
      }
    });

    it('POSITIVE CONTROL (trap 2): the /learning namespace SURVIVES — an over-broad sweep fails here', () => {
      const routes = read(join(REPO, 'server/routes.ts'));
      const surviving = routes.match(/apiRouter\.(get|post|put|patch|delete)\(\s*'\/learning\//g) ?? [];
      // ~30 at the time of the cut; a namespace sweep would drive this to 0 and must fail loudly.
      expect(surviving.length).toBeGreaterThan(20);
    });
  });

  // ⚠️⚠️ UNPROVEN — DO NOT TREAT THESE TWO AS A FENCE YET (CC-C, 2026-08-07).
  // They PASS, but they also pass when the deleted resolver is re-added, so right now
  // they prove nothing. Measured: appending `export function resolveStrategyMode(...)`
  // to strategy-modes.ts leaves this suite fully green. The obj-11 block above IS
  // mutation-proved three ways; this block is NOT, and the difference matters more than
  // the green tick does — a fence that cannot fail is worse than no fence, because it
  // reads as protection. Diagnose (the walk and the regex both check out in isolation —
  // node replicating sourceFiles() finds strategy-modes.ts, and the regex matches the
  // mutated content, so the fault is between them) and mutation-prove BOTH directions
  // before Step-4 review.
  describe('obj-10 — the class-less 11.7S posture mechanism [UNPROVEN — see note above]', () => {
    it('its symbols are gone from the tree (comments excluded)', () => {
      const SYMS = /(resolveStrategyMode|STRATEGY_MODE_OVERLAYS|REGIME_TO_MODE_MAP|getOverlayForStability|applyModeOverlay|recordModeExecution|getModeStopOutRate)/;
      const offenders = FILES.filter((f) => {
        const code = read(f)
          .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
          .replace(/^\s*\/\/.*$/gm, '');       // line comments
        // resolveStrategyModeFromWeather (AMR, surviving) must NOT trip this
        return SYMS.test(code.replace(/resolveStrategyModeFromWeather/g, ''));
      });
      expect(offenders.map((f) => f.replace(REPO, ''))).toEqual([]);
    });

    it('POSITIVE CONTROL: the AMR per-class posture path SURVIVES', () => {
      const mod = read(join(REPO, 'server/core/governance/strategy-modes.ts'));
      for (const keep of ['getModeOverlayForClass', 'getSlotCapForMode', 'meetsConfidenceFloorForClass', 'resolveStrategyModeFromWeather']) {
        expect(mod.includes(`export function ${keep}`), `AMR path lost: ${keep}`).toBe(true);
      }
    });
  });
});
