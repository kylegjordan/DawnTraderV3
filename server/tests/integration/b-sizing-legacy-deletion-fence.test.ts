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
// Read every source file ONCE, at collection time (outside any test's 5 s timeout). Each check used to re-read the
// ~1,000 files itself, and under a parallel run the first scan of a block timed out (2026-09-29) — a flake that
// could hide or fake a result. The fence still reads the tree as it is on disk at the start of the run.
const _SOURCE = new Map<string, string>(FILES.map((f) => [f, readFileSync(f, 'utf-8')] as const));
const read = (f: string) => _SOURCE.get(f) ?? readFileSync(f, 'utf-8');

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

  describe('obj-10 — the class-less 11.7S posture mechanism', () => {
    // Deliberately written WITHOUT a closure over a shared regex. The first version of
    // this block used one and the callback threw ReferenceError inside .filter(), which
    // vitest surfaced as a passing test rather than a failure — so the fence reported
    // green while catching nothing. Straight-line code, one regex literal per call site.
    const DELETED = [
      'resolveStrategyMode',
      'STRATEGY_MODE_OVERLAYS',
      'REGIME_TO_MODE_MAP',
      'getOverlayForStability',
      'applyModeOverlay',
      'recordModeExecution',
      'recordModeOutcome',
      'getModeStopOutRate',
      'getModeOverlay',
      'meetsConfidenceFloor',
      'getModeStats',
    ];

    // ★ SUBSTRING COLLISION — the trap this fence caught on its first honest run.
    // Several DELETED names are PREFIXES of surviving AMR ones: recordModeExecution ⊂
    // recordModeExecutionForClass, getModeOverlay ⊂ getModeOverlayForClass,
    // meetsConfidenceFloor ⊂ meetsConfidenceFloorForClass, getModeStats ⊂
    // getModeStatsForClass, resolveStrategyMode ⊂ resolveStrategyModeFromWeather.
    // Scanning for the short name alone reports the SURVIVOR as a reappearance of the
    // DELETED thing — a false alarm that would train the next reader to ignore this file.
    // So every survivor is masked out FIRST, and the masking list is itself asserted
    // against the module below, so it cannot silently drift out of date.
    const SURVIVORS = [
      'resolveStrategyModeFromWeather',
      'recordModeExecutionForClass',
      'recordModeOutcomeForClass',
      'getModeStatsForClass',
      'getModeOverlayForClass',
      'meetsConfidenceFloorForClass',
      'getSlotCapForMode',
    ];

    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    // Each file is read and stripped ONCE and reused by every name check below: re-reading ~1,000 files per name
    // timed out under a parallel test run (2026-09-29, the first scan in this block), a flake, not a finding.
    const _codeCache = new Map<string, string>();
    const codeOf = (f: string) => {
      const hit = _codeCache.get(f);
      if (hit !== undefined) return hit;
      let code = stripComments(read(f));
      for (const s of SURVIVORS) code = code.split(s).join('«AMR»');
      _codeCache.set(f, code);
      return code;
    };

    for (const sym of DELETED) {
      it(`\`${sym}\` is absent from every source file`, () => {
        const hits: string[] = [];
        for (const f of FILES) {
          if (codeOf(f).includes(sym)) hits.push(f.replace(REPO, ''));
        }
        expect(hits).toEqual([]);
      });
    }

    it('POSITIVE CONTROL: this scan CAN see the module it is guarding', () => {
      const target = FILES.find((f) => f.endsWith('strategy-modes.ts'));
      expect(target, 'strategy-modes.ts not in the scanned set').toBeDefined();
      // A token that genuinely exists there AND is not on the SURVIVORS mask — if this
      // fails, the scan is blind and every "absent" assertion above is worthless.
      // (The first version used getModeOverlayForClass and failed: the mask had already
      // replaced it. The control catching its own author is the point of having one.)
      // ⚠️ BOUNDARY-MATCHED, not substring. `toContain` passed even after the token was
      // renamed to INTERIM_NO_POSTURE_MODE_X, because the old name is a PREFIX of the new
      // one. Third time the same trap bit this file — deleted names, the survivor mask,
      // and now the control itself. Substring checks are why "a matching name is not a
      // matching thing" keeps costing us.
      // Anchored on the trailing ':' of its declaration rather than a bare substring or
      // an escaped regex. Plain string matching with a delimiter cannot lose its escapes
      // the way a regex built from a string can — which is exactly what happened here:
      // the emitted '\b' became a BACKSPACE character, so the control silently matched
      // nothing. A control that cannot fire is the same failure as the fence it guards.
      expect(codeOf(target!)).toContain('INTERIM_NO_POSTURE_MODE:');
    });

    it('POSITIVE CONTROL: every masked SURVIVOR really is exported — the mask cannot drift', () => {
      const mod = read(join(REPO, 'server/core/governance/strategy-modes.ts'));
      for (const keep of SURVIVORS) {
        // boundary-matched for the same reason: `export function getSlotCapForModeX`
        // CONTAINS `export function getSlotCapForMode`, so a rename slipped through.
        // Trailing '(' is the delimiter: `export function getSlotCapForModeX(` does NOT
        // contain `export function getSlotCapForMode(`, so a rename is caught.
        expect(mod.includes(`export function ${keep}(`), `masked as a survivor but not exported: ${keep}`).toBe(true);
      }
    });
  });

  describe('obj-4 — the open-slots setting (max_open_positions) and its satellites (increment 2a, PRE_AUDIT §14)', () => {
    // SCOPE, stated so the fence is not read as wider than it is: server/ + client/src, tests and _archive excluded
    // (the walk above). NOT scanned, deliberately: shared/schema.ts still holds the LEGACY `guardrails` v1 column and
    // the orchestrator route's zod enum, both increment 2b's (§14.2 D5, #1090); drizzle/migrations hold the history.
    // The VTS null-reason key `max_open_trades` is a NAME COLLISION, not this setting (§14.2 D8) — and no DELETED name
    // below is a substring of it, so it needs no mask.
    const DELETED = [
      'maxOpenPositions',
      'max_open_positions',
      'getMaxOpenTradesDefault',
      'max_open_trades_default',
      'checkMaxOpenTrades',
      'selectGoalsPreset',
      'logSlotState',
      'slotStateSnapshots',
      // Langston Step-4 #9: the hard-coded open-positions ceiling in the live start-up health check.
      'MAX_OPEN_POSITIONS',
    ];

    // The ONE place code must still name the retired field: the PUT refuses it with 422 RETIRED_FIELD, so a stale
    // client gets a named refusal instead of a silent drop. Masked exactly, and the mask is asserted to exist below.
    const RETIREMENT_GUARD = [
      'rawPayload.maxOpenPositions',
      "fieldName: 'maxOpenPositions'",
      "'maxOpenPositions is retired:",
    ];

    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const _codeCache = new Map<string, string>(); // read-once, as in the obj-10 block
    const codeOf = (f: string) => {
      const hit = _codeCache.get(f);
      if (hit !== undefined) return hit;
      let code = stripComments(read(f));
      for (const g of RETIREMENT_GUARD) code = code.split(g).join('«RETIRED»');
      _codeCache.set(f, code);
      return code;
    };

    it('criteria-limiter.ts (dead, no importers) is gone', () => {
      expect(existsSync(join(REPO, 'server/core/criteria-limiter.ts'))).toBe(false);
    });

    for (const sym of DELETED) {
      it(`\`${sym}\` is absent from every source file's code`, () => {
        const hits: string[] = [];
        for (const f of FILES) {
          if (codeOf(f).includes(sym)) hits.push(f.replace(REPO, ''));
        }
        expect(hits).toEqual([]);
      });
    }

    // §14.4 D9 (his third addition): a fence that matches nothing cannot pass. This file's own reader must SEE the term
    // in a real source file before its "absent" means anything: routes.ts names it in code, in the retirement guard.
    it('POSITIVE CONTROL: the scan sees the retired term where it genuinely still is (before masking)', () => {
      const routes = FILES.find((f) => f.endsWith(join('server', 'routes.ts')));
      expect(routes, 'routes.ts not in the scanned set').toBeDefined();
      expect(stripComments(read(routes!))).toContain('maxOpenPositions');
    });

    it('POSITIVE CONTROL: every masked retirement-guard string really is in routes.ts — the mask cannot drift', () => {
      const routes = stripComments(read(join(REPO, 'server/routes.ts')));
      for (const g of RETIREMENT_GUARD) expect(routes.includes(g), `mask string not found: ${g}`).toBe(true);
    });
  });
});
