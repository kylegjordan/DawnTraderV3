/**
 * B-EXIT-PROVENANCE — OBJ-5 / OBJ-9 FENCE
 *
 * WHY THIS FILE EXISTS IN THIS SHAPE. The previous batch's fence (#900) asserted a rule against a
 * RE-IMPLEMENTATION of that rule while the production reader that was wrong by the largest margin
 * went untested. So every assertion here is made against the PRODUCTION SOURCE, and every SUBJECT
 * is DERIVED by scanning it — never a hand-written list of call sites. A hardcoded list is the
 * same defect one level up: it goes stale silently and the fence still passes green.
 *
 * AND EVERY CONTROL IN HERE IS MUTATION-PROVED. A control that cannot fire is the same defect as
 * the fence it guards; two of my mutations once landed on code the test never executed and the
 * suite stayed green throughout.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { toCachedProducer, type PriceProducer } from '../../services/live-pricing-adapter';

const SERVER = join(__dirname, '..', '..');
const AEE = readFileSync(join(SERVER, 'services', 'active-execution-engine.ts'), 'utf8');
const APM = readFileSync(join(SERVER, 'services', 'active-portfolio-manager.ts'), 'utf8');
const LPA = readFileSync(join(SERVER, 'services', 'live-pricing-adapter.ts'), 'utf8');

/** Strip line and block comments so a PROHIBITION cannot be satisfied — or violated — by prose.
 *  The comments in these files quote the very patterns being fenced, so scanning raw text would
 *  make every prohibition below fire on its own explanation. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('B-EXIT-PROVENANCE — the exit stamp cannot be satisfied by a non-provenance value', () => {
  it('CONTROL: the comment-stripper actually strips (else every prohibition below is vacuous)', () => {
    expect(code('const a = 1; // diffMs observedAtMs')).not.toContain('diffMs');
    expect(code('/* observedAtMs = diffMs */ const b = 2;')).not.toContain('observedAtMs');
    // ...and does NOT eat real code, which is the failure that would make these fences vacuous
    // in the other direction.
    expect(code('observedAtMs: priceObservedAtMs,')).toContain('observedAtMs');
  });

  it('OBJ-5: exit_price_source NEVER falls back to the priceSource parameter', () => {
    // closePosition's priceSource DEFAULTS to a close CONDITION, not a provenance. A fallback to
    // it would satisfy a non-null fence perfectly while asserting nothing about where the price
    // came from. An unstamped close must land NULL so it is VISIBLE rather than green-on-a-lie.
    const persist = code(AEE).match(/exitPriceSource:[^\n]*/g) ?? [];
    expect(persist.length).toBeGreaterThan(0);
    for (const line of persist) {
      expect(line).not.toMatch(/\?\?\s*priceSource/);
      expect(line).not.toMatch(/["']manual_stop["']/);
      expect(line).not.toMatch(/["']unknown["']/);
    }
  });

  it('OBJ-5: diffMs is never assigned into an observation-time field, on any branch', () => {
    // diffMs is now-minus-lastTick, the engine's INTER-TICK CADENCE, and the engine already logs
    // it as ageMs= — which is exactly why an implementer reaches for it. Putting it in an
    // observedAt field is a wrong-object stamp wearing the right column's name.
    const src = code(AEE);
    expect(src).toMatch(/observedAtMs/);
    expect(src).toMatch(/diffMs/);
    expect(src).not.toMatch(/observedAtMs\s*:\s*diffMs/);
    expect(src).not.toMatch(/observedAtMs\s*=\s*diffMs/);
    expect(src).not.toMatch(/priceObservedAtMs\s*=\s*diffMs/);
    // The legitimate home for it is the honestly-named cadence field, and it must actually be
    // used — otherwise this prohibition passes because nobody wired the value at all.
    expect(src).toMatch(/tickCadenceMs\s*:\s*diffMs/);
  });

  it('OBJ-5: EVERY closePosition call site in the engine carries provenance — subject DERIVED', () => {
    const src = code(AEE);
    // Derive the call sites rather than listing them. A hand-written list would have missed the
    // resting-maker exit for six revisions, which is exactly what happened in the scope.
    const sites = [...src.matchAll(/this\.closePosition\(/g)].map((m) => m.index as number);
    expect(sites.length).toBeGreaterThanOrEqual(3);
    for (const start of sites) {
      // Bound the window at the NEXT call site so one stamped site cannot vouch for an unstamped
      // neighbour — the identity failure that made my last fence report a false result.
      const next = sites.find((s) => s > start);
      const span = src.slice(start, Math.min(next ?? src.length, start + 2500));
      expect(span).toMatch(/exitProvenance/);
    }
  });

  it('OBJ-9: the maker FILL branch writes the durable entry stamp AND logs an absent tradeId', () => {
    const src = code(AEE);
    expect(src).toMatch(/entryPriceProducer:\s*provenance\.producer/);
    expect(src).toMatch(/entryPriceSource:\s*provenance\.source/);
    // CONDITION-2: a silent skip makes the fill-rate instrument show a gap indistinguishable from
    // a non-fill. The absence must be recorded, exactly as the drop branch records its own.
    expect(src).toMatch(/MAKER_FILL_UNSTAMPED/);
    // ...and the stamp must be PASSED, never re-derived from the one variable in scope at the
    // call site, which on the crypto leg is the very label #741 proves cannot discriminate.
    expect(src).not.toMatch(/entryPriceProducer:\s*priceSource/);
    expect(src).not.toMatch(/entryPriceProducer:\s*["']/);
  });

  it('CONDITION-1: the portfolio manager splits the composed string instead of stamping it', () => {
    const src = code(APM);
    expect(src).toMatch(/producer:\s*priceResult\.producer/);
    expect(src).toMatch(/producer:\s*["']position_entry_price_reused["']/);
    expect(src).not.toMatch(/producer:\s*`manual_stop_/);
    // and NOT entry_seed: that names a real handler that never ran on this path. Naming a handler
    // that did not run is the wrong-object stamp itself.
    expect(src).not.toMatch(/producer:\s*["']entry_seed["']/);
  });

  it('P9: the fifth close path persists the source it already computes', () => {
    const src = code(APM);
    // closeAllPositions never calls closePosition, so it inherits no stamping. It already resolved
    // the source and only logged it — a close through here wrote NULL provenance, and a fence
    // scoped to the force-close entrypoints could not see it.
    expect(src).toMatch(/exitPriceProducer:\s*priceProducer/);
    expect(src).toMatch(/exitPriceSource:\s*priceSource/);
    expect(src).toMatch(/priceProducer\s*=\s*liveQuote\.producer/);
  });

  it('BLOCKER-2: forceClosePosition takes provenance as REQUIRED, not optional', () => {
    // ⛔ THE ONE HOLE THE DERIVED CALL-SITE TEST CANNOT SEE. That test matches the literal
    // `exitProvenance` inside this method's span and passes green whether or not the value was
    // `undefined` at runtime. An optional parameter therefore defeats it silently — so the
    // requiredness is asserted HERE, on the signature itself, rather than assumed.
    const sig = code(AEE).match(/async forceClosePosition\([\s\S]{0,400}?\)\s*:/)?.[0] ?? '';
    expect(sig).toContain('provenance');                       // positive control
    expect(sig).not.toMatch(/provenance\?\s*:/);
    // ...and the body must not re-introduce optionality through a conditional pass.
    expect(code(AEE)).not.toMatch(/provenance\s*\?\s*\{[\s\S]{0,40}exitProvenance/);
  });

  it('RIDER-1: the maker fill stamp captures its write result instead of trusting it', () => {
    // `updateClosedTrade` destructures `.returning()` off a possibly-empty array, so a tradeId
    // that resolves to NO ROW yields undefined and throws nothing. The tradeId guard does not
    // cover that case; a silent no-op would leave the stamp absent while every log says written.
    const src = code(AEE);
    expect(src).toMatch(/const _fillStamped = await storage\.updateClosedTrade/);
    expect(src).toMatch(/MAKER_FILL_STAMP_NOROW/);
  });

  it('RIDER-3: the never_filled cohort is named as the OBJ-1 exemption, in code', () => {
    // The maker DROP branch writes a closed_trades row with close_reason='never_filled' and NULL
    // exit provenance — deliberately unstamped, and HONEST, because no exit ever occurred. OBJ-1
    // restated as "every post-deploy row non-null" fails on that cohort at Step 8 unless the
    // predicate excludes it. Written down here so a Step-8 false failure is not "fixed" by
    // stamping a price that never existed.
    const src = code(AEE);
    expect(src).toMatch(/closeReason:\s*'never_filled'/);
    expect(AEE).toMatch(/OBJ-1 EXEMPTION/);   // the standing note, asserted against the raw file
  });

  it('the producer vocabulary stays CLOSED, and the non-cacheable member is excluded', () => {
    // Called against the PRODUCTION function, not a copy of its switch.
    expect(toCachedProducer('position_entry_price_reused' as PriceProducer)).toBeNull();
    expect(toCachedProducer('no_price_produced' as PriceProducer)).toBeNull();
    expect(toCachedProducer('kraken_ws_book_mid' as PriceProducer)).toBe('kraken_ws_book_mid');
    // THE PROPERTY THAT MAKES WIDENING SAFE, asserted rather than assumed: the engine's actionable
    // gate reads source and never producer, so a new producer cannot cause a price to be rejected
    // and a position to be skipped. That was the single largest risk in this batch, and it is
    // structurally absent rather than merely guarded.
    const gate = code(LPA).match(/export function isKrakenVenueSource[\s\S]{0,220}?\n\}/)?.[0] ?? '';
    expect(gate).toContain('source ===');
    expect(gate).not.toContain('producer');
  });
});
