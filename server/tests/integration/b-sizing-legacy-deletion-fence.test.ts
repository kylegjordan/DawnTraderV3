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
      src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

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
      src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
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

  describe('obj-3 — Portfolio Risk per Trade, retired in paper AND live (increment 2c, PRE_AUDIT §17)', () => {
    // SCOPE — WIDER THAN obj-4: server/ + client/src + shared/ + types/ + scripts/, tests and _archive excluded. ⚠️ The Step-4
    // fresh-reader round found `types/config.ts` still REQUIRING the field in its zod schema — outside the server/ + client/src
    // walk, so this fence passed while a reader survived. The legacy `trading_settings` columns in shared/schema.ts are
    // `risk_per_trade` / `risk_per_trade_pct` (a different table, #1106's), which none of the names below matches.
    // drizzle/migrations hold the history and are not scanned. The UNRELATED names `riskPerTrade` (the VTS runner's own
    // config, strategy params, AI-prompt placeholders — §17.1) are NOT this setting and are not fenced; `.riskPerTradePct`
    // (a read of the retired settings field) is.
    const OBJ3_FILES = (() => {
      const extra: string[] = [];
      const walk = (dir: string) => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir)) {
          const p = join(dir, entry);
          if (statSync(p).isDirectory()) {
            if (entry === 'node_modules' || entry === 'tests' || entry === '_archive') continue;
            walk(p);
          } else if (/\.(ts|tsx|mjs|js)$/.test(entry) && !/\.test\.(ts|mjs|js)$/.test(entry)) {
            extra.push(p);
          }
        }
      };
      walk(join(REPO, 'shared'));
      walk(join(REPO, 'types'));
      walk(join(REPO, 'scripts'));
      return [...FILES, ...extra];
    })();
    const DELETED = [
      'portfolioRiskPerTradePct',
      'portfolio_risk_per_trade_pct',
      'getRiskPercentageV2',
      'calculateRiskAmount',
      'detectOverrideConflict',
      'getPortfolioRiskPct',
      '.riskPerTradePct',
    ];

    // The ONE place code must still name the retired field: the PUT refuses it with 422 RETIRED_FIELD (the obj-4 pattern).
    const RETIREMENT_GUARD = [
      'rawPayload.portfolioRiskPerTradePct',
      "fieldName: 'portfolioRiskPerTradePct'",
      "'portfolioRiskPerTradePct is retired:",
    ];

    const stripComments = (src: string) =>
      src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const _codeCache = new Map<string, string>();
    const codeOf = (f: string) => {
      const hit = _codeCache.get(f);
      if (hit !== undefined) return hit;
      let code = stripComments(read(f));
      for (const g of RETIREMENT_GUARD) code = code.split(g).join('«RETIRED»');
      _codeCache.set(f, code);
      return code;
    };

    it('config-update-service.ts (dead, no importers, wrote the retired field) is gone', () => {
      expect(existsSync(join(REPO, 'server/services/config-update-service.ts'))).toBe(false);
    });

    for (const sym of DELETED) {
      it(`\`${sym}\` is absent from every source file's code`, () => {
        const hits: string[] = [];
        for (const f of OBJ3_FILES) {
          if (codeOf(f).includes(sym)) hits.push(f.replace(REPO, ''));
        }
        expect(hits).toEqual([]);
      });
    }

    // Name collisions make these two regex checks rather than substrings: `validateGuardrailsCoherence` (server/index.ts)
    // is a different, live function; `calculatePositionSize` survives as an unrelated METHOD in asset-capabilities.ts.
    it('the unused guardrails validator (it parsed the retired field) is gone — `validateGuardrails` as a whole word', () => {
      const hits = OBJ3_FILES.filter((f) => /\bvalidateGuardrails\b/.test(codeOf(f))).map((f) => f.replace(REPO, ''));
      expect(hits).toEqual([]);
    });

    it('trade-safety no longer carries the risk-amount ÷ stop-distance sizer `calculatePositionSize`', () => {
      expect(codeOf(join(REPO, 'server/services/trade-safety.ts'))).not.toMatch(/\bcalculatePositionSize\b/);
    });

    it('POSITIVE CONTROL: the widened scan reaches types/, shared/ and scripts/', () => {
      const rel = OBJ3_FILES.map((f) => f.replace(REPO, '').replace(/\\/g, '/'));
      expect(rel).toContain('/types/config.ts');
      expect(rel).toContain('/shared/schema.ts');
      expect(rel.some((f) => f.startsWith('/scripts/'))).toBe(true);
    });

    it('POSITIVE CONTROL: the scan sees the retired term where it genuinely still is (before masking)', () => {
      const routes = FILES.find((f) => f.endsWith(join('server', 'routes.ts')));
      expect(routes, 'routes.ts not in the scanned set').toBeDefined();
      expect(stripComments(read(routes!))).toContain('portfolioRiskPerTradePct');
    });

    it('POSITIVE CONTROL: every masked retirement-guard string really is in routes.ts — the mask cannot drift', () => {
      const routes = stripComments(read(join(REPO, 'server/routes.ts')));
      for (const g of RETIREMENT_GUARD) expect(routes.includes(g), `mask string not found: ${g}`).toBe(true);
    });
  });

  describe('increment 2d — the legacy sweep (PRE_AUDIT §18, Langston §18.5)', () => {
    // SCOPE as obj-3: server/ + client/src + shared/ + types/ + scripts/, tests and _archive excluded; comments stripped.
    const files2d = (() => {
      const extra: string[] = [];
      const walk = (dir: string) => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir)) {
          const p = join(dir, entry);
          if (statSync(p).isDirectory()) {
            if (entry === 'node_modules' || entry === 'tests' || entry === '_archive') continue;
            walk(p);
          } else if (/\.(ts|tsx|mjs|js)$/.test(entry) && !/\.test\.(ts|mjs|js)$/.test(entry)) {
            extra.push(p);
          }
        }
      };
      walk(join(REPO, 'shared'));
      walk(join(REPO, 'types'));
      walk(join(REPO, 'scripts'));
      return [...FILES, ...extra];
    })();
    const strip = (src: string) => src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const _c = new Map<string, string>();
    const codeOf2d = (f: string) => {
      let c = _c.get(f);
      if (c === undefined) { c = strip(read(f)); _c.set(f, c); }
      return c;
    };
    const hitsFor = (rx: RegExp) => files2d.filter((f) => rx.test(codeOf2d(f))).map((f) => f.replace(REPO, ''));

    it('the deleted files are gone (AJ18 x2, the M5E harness, the coherency widget)', () => {
      for (const f of ['server/services/aj18-diagnostic-runner.ts', 'server/services/aj18-rtb-diagnostic.ts',
        'server/services/m5e-validation-service.ts', 'client/src/components/goals/coherency-status-widget.tsx']) {
        expect(existsSync(join(REPO, f)), f).toBe(false);
      }
    });

    // Each deleted route by its path; each deleted symbol as a whole word (getEffective ≠ getEffectiveATR).
    const GONE: Array<[string, RegExp]> = [
      ['/diagnostics/aj18 routes', /diagnostics\/aj18/],
      ['POST /orchestrator/updateGuardrail', /orchestrator\/updateGuardrail\b/],
      ['GET /guardrails-v2/effective', /guardrails-v2\/effective/],
      ['GET /analytics/guardrails-compliance', /analytics\/guardrails-compliance/],
      ['POST /test/attempt-trade', /test\/attempt-trade/],
      ['the /validation/*m5e* routes', /validation\/(run-m5e|m5e-status)/],
      ['getEffective', /\bgetEffective\b/],
      ['getGuardrailsCompliance', /\bgetGuardrailsCompliance\b/],
      ['orchestratorUpdateGuardrailSchema', /\borchestratorUpdateGuardrailSchema\b/],
      ['aj18Diagnostic / aj18DiagnosticRunner', /\baj18Diagnostic(Runner)?\b/],
      ['the clamp-bind stream', /\b(recordSizingClampSample|getSizingClampProof|SIZING_BIND_THRESHOLD|sizingClampSamples)\b/],
      ['the retired sizer fields', /\b(effectiveRiskFractionRatio|wasClamped)\b/],
      ['the M5E harness', /\b(startFullM5EValidation|getM5EStatus|disablePassiveLearning\(\);\s*const simResult)\b/],
    ];
    for (const [label, rx] of GONE) {
      it(`${label} does not come back`, () => {
        expect(hitsFor(rx)).toEqual([]);
      });
    }

    // The object-round reader found the stripper blind to ~500 lines of routes.ts: a LINE comment containing "/api/*"
    // opened a block-comment match that ran to the next "*/". Full-line comments are now stripped first. MUTATION: put
    // the block strip first again and this fails — `apiRouter.all('*'` sits inside that stretch.
    it('POSITIVE CONTROL: the stripped routes.ts still contains code from after the "/api/*" line comment', () => {
      expect(codeOf2d(join(REPO, 'server/routes.ts'))).toContain("apiRouter.all('*'");
    });

    // Step-4 nit (b), Langston: full-line comments are stripped first, but a "/*" inside a TRAILING line comment or a
    // STRING still opens a false block match that blanks code up to the next "*/" — silently, as it did through three
    // earlier blocks. Nothing is blanked today (the one false opener in the scan set has no "*/" after it), so the
    // property is PINNED as an assertion instead of trusted as an absence.
    const falseOpeners = (src: string): number[] => {
      const at: number[] = [];
      let offset = 0;
      for (const line of src.split('\n')) {
        const t = line.trimStart();
        if (!t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')) {
          for (let k = line.indexOf('/*'); k >= 0; k = line.indexOf('/*', k + 2)) {
            const before = line.slice(0, k);
            const odd = (q: string) => before.split(q).length % 2 === 0;
            if (before.includes('//') || odd("'") || odd('"') || odd('`')) at.push(offset + k);
          }
        }
        offset += line.length + 1;
      }
      return at;
    };
    const openerReport = () => files2d.flatMap((f) => {
      const src = read(f);
      return falseOpeners(src).map((pos) => ({ file: f.replace(REPO, '').replace(/\\/g, '/'), closes: src.indexOf('*/', pos + 2) >= 0 }));
    });

    // MUTATION: append "// see /api/*" to any code line that has a block comment below it and this fails.
    it('no false block-comment opener (in a trailing comment or a string) is followed by a "*/" that would blank code', () => {
      expect(openerReport().filter((o) => o.closes)).toEqual([]);
    });

    it('POSITIVE CONTROL: the opener detector sees the known in-string "xstock_spot/*" in the geometry-sweep script', () => {
      expect(openerReport().map((o) => o.file)).toContain('/scripts/b5-w2a-geometry-sweep.ts');
    });

    it('POSITIVE CONTROL: the same scan finds live siblings of what was deleted, so an empty result is not blindness', () => {
      expect(hitsFor(/diagnostics\/aj17/).length).toBeGreaterThan(0);       // AJ17's routes stayed
      expect(hitsFor(/\bgetEffectiveATR\b/).length).toBeGreaterThan(0);     // the word boundary is real
      expect(hitsFor(/orchestrator\/updateStrategy\b/).length).toBeGreaterThan(0); // the sibling route stayed
      expect(hitsFor(/validation\/run-m5d/).length).toBeGreaterThan(0);     // M5D is not M5E (unaudited, not touched)
    });
  });
});
