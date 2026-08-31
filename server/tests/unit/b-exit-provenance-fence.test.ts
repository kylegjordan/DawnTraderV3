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
import { toCachedProducer, livePricingAdapter, type PriceProducer } from '../../services/live-pricing-adapter';
import { restRateLimiter } from '../../services/market-data/rest-rate-limiter';

const SERVER = join(__dirname, '..', '..');
const AEE = readFileSync(join(SERVER, 'services', 'active-execution-engine.ts'), 'utf8');
const APM = readFileSync(join(SERVER, 'services', 'active-portfolio-manager.ts'), 'utf8');
const LPA = readFileSync(join(SERVER, 'services', 'live-pricing-adapter.ts'), 'utf8');
const LPA_DEPTH = readFileSync(join(SERVER, 'services', 'execution', 'depth-source.ts'), 'utf8');

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

  it('OBJ-6: BOTH entry paths stamp — the taker open seam, not just the maker fill', () => {
    // THIS TEST EXISTS BECAUSE STAGING CAUGHT WHAT THE PLAN MISSED. The Step-2 plan wired the
    // MAKER fill and silently dropped the TAKER open seam, so the first post-deploy taker entry
    // opened with NULL provenance while every other fence here passed green. OBJ-6 asks for a
    // non-null entry source on EVERY new row; one of two paths cannot deliver that.
    const src = code(AEE);
    // The maker leg (durable write from inside the pending processor).
    expect(src).toMatch(/entryPriceProducer:\s*provenance\.producer/);
    // The taker leg (the createClosedTrade open seam), stamped from the depth snapshot.
    expect(src).toMatch(/entryPriceSource:\s*_gate\.snapshot\.source/);
    expect(src).toMatch(/entryBookAgeMs:\s*_gate\.snapshot\.ageMs/);
    // ...and the walk must NOT be labelled a mid. A walk consumes book LEVELS; a mid is
    // (bestBid+bestAsk)/2. Stamping one as the other is the wrong-object label this union exists
    // to prevent, and it would be completely invisible in the resulting data.
    expect(src).not.toMatch(/entryPriceProducer:[^;]{0,120}kraken_ws_book_mid/);
    expect(src).toMatch(/crypto_ws_book_walk/);
    // TWO entry-stamp sites, not one — asserted by COUNT, so deleting either one fails here.
    expect((src.match(/entryPriceProducer:/g) ?? []).length).toBe(2);
  });

  it('#911: the independent witness is read from the ARCHIVER, never from the book the fill walked', () => {
    // ⛔ THE WHOLE POINT OF OBJ-3. #741 is an ORDER-BOOK defect, so on crypto the fill walks the
    // suspect. A cross-check sourced from that same book agrees with itself by construction and
    // proves nothing. The witness must come from the archiver's ticker snapshot instead.
    const src = code(AEE);
    expect(src).toMatch(/getTickerWitness\(position\.symbol,\s*_closeClass\)/);
    // ...and it must NOT be sourced from the depth snapshot the taker leg already holds.
    expect(src).not.toMatch(/exitTickerBid:[^;]{0,160}_closeSnap/);
    expect(src).not.toMatch(/exitTickerAsk:[^;]{0,160}_closeSnap/);
    // Both columns actually consume it — otherwise the call is decorative.
    expect(src).toMatch(/exitTickerBid:[\s\S]{0,200}_witness\.bid/);
    expect(src).toMatch(/exitTickerAsk:[\s\S]{0,200}_witness\.ask/);
  });

  it('#911: the witness is taken BELOW the maker/taker split, so the maker leg is covered', () => {
    // The maker leg never fetches a depth snapshot (it filled at a resting limit). A witness taken
    // inside the taker branch would be silently absent on exactly the cohort that produced this
    // batch's first OBJ-2 specimen — a gap that would read as "no witness row" rather than as a
    // missed call. Assert it sits after the branch closes, not inside it.
    const src = code(AEE);
    const makerIdx = src.indexOf('options?.makerExitFill');
    const witnessIdx = src.indexOf('await getTickerWitness');
    const persistIdx = src.indexOf('exitTickerBid:');
    expect(makerIdx).toBeGreaterThan(-1);
    expect(witnessIdx).toBeGreaterThan(makerIdx);
    expect(persistIdx).toBeGreaterThan(witnessIdx);
    // And it must be fail-OPEN: a telemetry cross-check may never block a close.
    expect(code(LPA_DEPTH)).toMatch(/TICKER_WITNESS/);
    expect(code(LPA_DEPTH)).toMatch(/return null;/);
  });

  it('the producer vocabulary stays CLOSED, and the non-cacheable member is excluded', () => {
    // Called against the PRODUCTION function, not a copy of its switch.
    expect(toCachedProducer('position_entry_price_reused' as PriceProducer)).toBeNull();
    expect(toCachedProducer('no_price_produced' as PriceProducer)).toBeNull();
    expect(toCachedProducer('kraken_ws_book_mid' as PriceProducer)).toBe('kraken_ws_book_mid');
    // THE PROPERTY THAT MAKES WIDENING SAFE THROUGH THE VENUE GATE, asserted rather than assumed:
    // that gate reads source and never producer, so a new producer cannot cause a price to be
    // rejected or a position to be skipped THROUGH IT.
    // NARROWED 2026-08-30 (B-EXIT-BOOK-AGE-STAMP). This said the risk was 'structurally absent
    // rather than merely guarded', FULL STOP. Too strong, and withdrawn over two reader rounds:
    // toCachedProducer's null arm IS a producer-dependent branch - it gates the cache write.
    // CORRECTED 2026-08-31 (#951): this comment used to say a miss "reaches last_known_good, fails
    // this very gate, and falls to direct REST, which is a SKIPPED POSITION". That is FALSE, and
    // it is the third copy of the same wrong mechanism (the other two were in the source). A
    // suppressed write leaves the PREVIOUS row in the map; getPriceWithFallback finds it and
    // returns it under its ORIGINAL tag WITHOUT re-checking age, so it passes this gate as
    // venue-fresh. Worse than a skip, not safer. Unreachable TODAY only because of today's call
    // sites, which is #546's entire lesson. The P11 tests below are what hold the property now.
    const gate = code(LPA).match(/export function isKrakenVenueSource[\s\S]{0,220}?\n\}/)?.[0] ?? '';
    expect(gate).toContain('source ===');
    expect(gate).not.toContain('producer');
  });

  it('P11 - every SPLIT member is CACHEABLE: the six new producers sit in the passthrough arm', () => {
    // WHY THIS EXISTS AND WHY THE TYPE SYSTEM CANNOT REPLACE IT: toCachedProducer's `never`
    // default forces every new union member to be HANDLED. It says NOTHING about WHICH arm. A
    // member dropped into the `return null` arm still belongs to CachedProducer (an Exclude of two
    // hardcoded names), so returning null for it COMPILES - and would silently suppress the cache
    // write for that producer. Behaviourally load-bearing TODAY for kraken_ws_ticker_* only: the
    // other four reach the cache via updateCache(..., producer: CachedProducer), which never calls
    // this switch. Asserted for all six anyway, because that safety is a call-site fact and call
    // sites move.
    for (const m of [
      'kraken_ws_ticker_mid',
      'kraken_ws_ticker_last',
      'kraken_equities_ws_mid',
      'kraken_equities_ws_last',
      'kraken_rest_engine_fallback_mid',
      'kraken_rest_engine_fallback_last',
    ] as PriceProducer[]) {
      expect(toCachedProducer(m)).toBe(m);
    }
  });

  it('#951 P3 FENCE - the rate-limited re-serve producer is CACHEABLE, not suppressed', () => {
    // MUTATION-PROVABLE BY CONSTRUCTION, and that is the point: move
    // 'kraken_rest_rate_limited_reserve' into toCachedProducer's `return null` arm and THIS LINE
    // FAILS. The `never` default cannot catch that - a member in the null arm still belongs to
    // CachedProducer (an Exclude of two hardcoded names), so it compiles.
    // WHY IT IS LOAD-BEARING RATHER THAN HYGIENE (Langston, #951 Step-2 condition 2): a null-arm
    // placement suppresses the cache write, which leaves the PREVIOUS row in the map to be
    // re-served under its ORIGINAL tag with NO age re-check. That is not a safe failure - it is
    // this batch's own defect, re-created by the fix meant to remove it.
    expect(toCachedProducer('kraken_rest_rate_limited_reserve' as PriceProducer)).toBe('kraken_rest_rate_limited_reserve');
  });

  it('#951 P1 - the rate-limited branch carries the age instead of discarding it', () => {
    // The defect was a BARE `return cached?.price ?? null`: the caller could not distinguish a
    // re-served cached price from a genuine venue read, so it stamped `observedAt: Date.now()`.
    // Assert the shape is gone and the carry is present.
    const src = code(LPA);
    // Sliced by index, not matched by a length-capped regex: the function is ~90 lines and a
    // capped pattern silently returned '' — a test that fails for the wrong reason is no test.
    const start = src.indexOf('private async fetchFromKrakenRest');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('private async fetchMockPrice', start);
    // ⛔ ASSERT THE END MARKER EXISTS. If fetchMockPrice is renamed or moved above this function,
    // indexOf returns -1, slice(start, -1) silently becomes the REST OF THE FILE, and
    // `observedAt: cached.observedAt` appears on 8 lines — so the assertions below would pass
    // against a different function entirely. A slice whose bound can silently become the whole
    // file is the same wrong-object failure this suite exists to catch.
    expect(end).toBeGreaterThan(start);
    const fn = src.slice(start, end);
    expect(fn).toBeTruthy();
    // the laundering shape must be gone
    expect(fn).not.toContain('return cached?.price ?? null');
    // and the true observation time must be carried through
    expect(fn).toContain('observedAt: cached.observedAt');
    expect(fn).toContain("producer: 'kraken_rest_rate_limited_reserve'");
  });

  it('#951 P1 - the nullish predicate SUBSTRING is present (static fence; the behavioural one below is the real guard)', () => {
    // The original was `return cached?.price ?? null`. Rewriting it as `cached ? {...} : null`
    // tests the ROW, which diverges on exactly one input: a row present with an absent price.
    // That would return `price: undefined`, and fetchPrice's cache-write guard is
    // `quote.price !== null` — TRUE for undefined — so undefined would be written to the cache
    // and reach the exit evaluation. The types forbid it today; this fence is what keeps the
    // semantics if they ever stop forbidding it.
    const src = code(LPA);
    const start = src.indexOf('private async fetchFromKrakenRest');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('private async fetchMockPrice', start);
    // ⛔ SAME GUARD AS THE SIBLING TEST. The commit that hardened that one shipped THIS one
    // unguarded, twenty lines below it — hardening an instance while adding a fresh copy of the
    // defect. Without this, a renamed end-marker makes slice(start, -1) the rest of the file.
    expect(end).toBeGreaterThan(start);
    const fn = src.slice(start, end);
    expect(fn).toContain('cached && cached.price != null');
    expect(fn).not.toMatch(/return cached\s*\n?\s*\?/);
  });

  it('#951 P1 - the stamping literal carries an INLINE-UNCONDITIONAL `source` (narrow fence, see note)', () => {
    // ⛔ THIS TEST REPLACES ONE THAT COULD NOT FAIL. The first version sliced the CachedPrice type
    // DECLARATION and asserted it still said 'kraken_rest'. A second reader mutated the actual
    // stamping site to `krakenResult.producer === 'kraken_rest_rate_limited_reserve' ?
    // 'last_known_good' : 'kraken_rest'` — which IS the carved-out B-PRICE-AGE-REFUSAL behaviour,
    // a real trading-decision change — and ALL 19 TESTS PASSED. A falsifier that inspects the
    // vocabulary instead of the emission falsifies nothing.
    //
    // What this asserts instead: at the REST-leg return, `source` is a bare literal with no
    // conditional. If anyone makes it depend on the producer, the arm, or the age, this fails —
    // which is the entire safety property of the split (B-PRICE-AGE-TRUTH ships provenance only;
    // refusal is carved out and gated on #971).
    const src = code(LPA);
    const call = src.indexOf('const krakenResult = await this.fetchFromKrakenRest(symbol);');
    expect(call).toBeGreaterThan(-1);
    // ⛔ ROUND 3 FOUND THIS SLICE UNGUARDED **AND MISFIRING**, and the commit that claimed to
    //    harden "both slices" missed it because there are THREE, not two. Its old bound was the
    //    first `};` after the call — not anchored to the literal at all. A reader wrapped the
    //    return in a behaviour-identical helper, which made the literal end `});` instead of
    //    `};`; the slice then ran twenty lines past the block, swallowed the last-known-good
    //    leg, and the fence went RED on a pure no-op. A fence that cries wolf on a refactor
    //    trains people to ignore fences, which is worse than not having one.
    // ⇒ bound it at the next section's first stable line of CODE, and assert that bound is
    //    actually there — so the slice can never silently become "the rest of the file".
    // ⛔ THE ANCHOR MUST BE CODE, NEVER A COMMENT. `code()` strips comments before any of this
    //    runs, so a comment marker resolves to -1 — I picked one by reading the RAW file while
    //    the test operates on the STRIPPED copy, and the new guard caught it immediately. That
    //    is the guard earning its place on its first run.
    const blockEnd = src.indexOf('if (this.useMockMode) {', call);
    expect(blockEnd).toBeGreaterThan(call);
    const block = src.slice(call, blockEnd);
    // the emission must be the unconditional literal
    expect(block).toContain("source: 'kraken_rest',");
    // ...and must NOT be computed from anything
    expect(block).not.toMatch(/source:\s*[^'\n]*\?/);      // no ternary
    expect(block).not.toMatch(/source:\s*krakenResult/);     // not derived from the fetch result
    expect(block).not.toContain('last_known_good');
  });

  describe('#951 P1 BEHAVIOURAL - the rate-limited branch, actually executed', () => {
    // ⛔ WHY THIS EXISTS: every other fence in this file matches STRINGS, and a second reader
    // defeated the static ones FOUR ways — by moving the mutation outside the sliced block, by
    // refusing on age inside the branch (never touching `source` at all), by spreading a
    // conditional override into the same literal, and by parenthesising `(cached)` to keep the
    // pinned substring alive while re-introducing the regression. A fence that reads source text
    // cannot see the predicate that actually governs the return. This one calls the code.
    //
    // The limiter is deterministic: one check() arms a per-symbol cooldown, so the NEXT call is
    // blocked without any mocking, timing, or network.
    const SYM = 'ZZZTEST/USD';
    const OLD_OBSERVED = 1_600_000_000_000; // fixed, and far from Date.now()

    const seed = (price: unknown) => {
      const a = livePricingAdapter as unknown as { priceCache: Map<string, unknown> };
      a.priceCache.set(SYM, {
        symbol: SYM, price, timestamp: new Date(OLD_OBSERVED).toISOString(),
        source: 'kraken_rest', producer: 'kraken_rest_poller',
        observedAt: OLD_OBSERVED, cachedAt: Date.now(),
      });
    };
    // ⛔ POSITIVE CONTROL, ADDED IN ROUND 3. `blockedCount` rises ONLY when check() returns
    //    false, i.e. only when the rate-limited branch is actually taken. Without it, a test
    //    whose sole assertion is `toBeNull()` passes identically when the limiter ALLOWS the
    //    call and a real request to Kraken fails — proved empirically by a reader, which is
    //    this file's own "a control that cannot fire is the defect it guards" warning landing
    //    on the file itself.
    const callBlocked = async () => {
      restRateLimiter.check(SYM);            // arms the cooldown -> next call is blocked
      const before = restRateLimiter.getStats().blockedCount;
      const a = livePricingAdapter as unknown as {
        fetchFromKrakenRest: (s: string) => Promise<{ price: number; observedAt: number; producer: string } | null>;
      };
      const out = await a.fetchFromKrakenRest(SYM);
      const took = restRateLimiter.getStats().blockedCount > before;
      return { out, took };
    };

    // ⛔ THE FIXTURE LEAKS INTO TWO MODULE-LEVEL SINGLETONS — a poisoned cache row and a live
    //    60s cooldown. Vitest's DEFAULT isolation contains it, but `isolate: false` is a
    //    routine CI speed-up and nothing in this repo pins the default. Clean up explicitly
    //    rather than relying on a config value we do not control.
    afterEach(() => {
      (livePricingAdapter as unknown as { priceCache: Map<string, unknown> }).priceCache.delete(SYM);
      restRateLimiter.clearSymbolCooldown(SYM);
    });

    it('carries the ORIGINAL observedAt, never a fresh stamp', async () => {
      seed(123.45);
      const { out: r, took } = await callBlocked();
      expect(took).toBe(true);              // positive control: the branch was ENTERED
      expect(r).not.toBeNull();
      expect(r!.observedAt).toBe(OLD_OBSERVED);           // the whole batch, in one assertion
      expect(r!.producer).toBe('kraken_rest_rate_limited_reserve');
      expect(r!.price).toBe(123.45);
      expect(Math.abs(Date.now() - r!.observedAt)).toBeGreaterThan(1_000_000);
    });

    it('returns null when the cached PRICE is absent (the row-vs-price regression)', async () => {
      seed(undefined);
      // Defeats the parenthesise-the-row evasion: this asserts the PREDICATE's effect, not its text.
      const { out, took } = await callBlocked();
      expect(took).toBe(true);              // ⛔ WITHOUT THIS, null proves nothing (see above)
      expect(out).toBeNull();
    });

    it('the EMITTED QUOTE keeps source=kraken_rest — the actionability property, executed', async () => {
      // ⛔ THE OTHER TWO EVASIONS. The three fences above call fetchFromKrakenRest directly, so
      // they cannot see a mutation at the CALLER — where `source` is stamped. A reader defeated
      // the static fence by assigning the literal to a const and mutating it after the block, and
      // again by spreading a conditional override into the literal itself. Both are caller-side.
      // This calls fetchLivePrice, so the quote it returns is the one the engine would gate on.
      seed(77.5);
      restRateLimiter.check(SYM);            // arm the cooldown -> the REST leg will be blocked
      const a = livePricingAdapter as unknown as {
        fetchLivePrice: (s: string) => Promise<{ source: string; producer: string; observedAt: number | null } | null>;
      };
      const q = await a.fetchLivePrice(SYM);
      expect(q).not.toBeNull();
      // the actionability property, asserted on the EMITTED value rather than on source text
      expect(q!.source).toBe('kraken_rest');
      // and the provenance half this batch ships
      expect(q!.producer).toBe('kraken_rest_rate_limited_reserve');
      expect(q!.observedAt).toBe(OLD_OBSERVED);
    });

    it('still serves a cached price of 0 — the predicate must not be STRENGTHENED', async () => {
      seed(0);
      // The original was `cached?.price ?? null`, which returns 0. A `> 0` test would return null
      // here, changing source, producer AND actionability. Equivalence cuts both ways.
      const { out: r, took } = await callBlocked();
      expect(took).toBe(true);
      expect(r).not.toBeNull();
      expect(r!.price).toBe(0);
    });
  });

  describe('#951 P1 END-TO-END - the age must survive the CACHE WRITE, which is what the ENGINE reads', () => {
    // ⛔⛔ THE GAP ROUND 3 FOUND, AND IT IS THE MOST SERIOUS THING IN THIS BATCH'S TEST SET.
    //    Every other fence here asserts on fetchFromKrakenRest or fetchLivePrice. THE ENGINE
    //    CALLS NEITHER. It calls getPriceWithFallback (active-execution-engine.ts:1257) and
    //    reads priceResult.observedAt (:1285) — and getPriceWithFallback returns CACHE ROWS,
    //    which are written at exactly one place: live-pricing-adapter.ts:538,
    //    `observedAt: quote.observedAt ?? Date.now()`.
    // ⇒ changing that single line to `Date.now()` re-introduces the whole #743/#951 laundering
    //    — every poll re-stamps the row, so the branch "carries the true age" of a value that
    //    was itself just re-stamped — and a reader ran the FULL suite against that mutation:
    //    2851 tests, all green. `quote.observedAt` is the only occurrence in the repo.
    // ⇒ so this test seeds an OLD row, forces the rate-limited re-serve, drives the real
    //    CACHE WRITER (fetchPrice), and then reads back through the engine's own entry point.
    //    It is the only fence here that spans the write.
    const SYM = 'ZZZTEST2/USD';
    const OLD_OBSERVED = 1_600_000_000_000;

    afterEach(() => {
      (livePricingAdapter as unknown as { priceCache: Map<string, unknown> }).priceCache.delete(SYM);
      restRateLimiter.clearSymbolCooldown(SYM);
    });

    it('a rate-limited re-serve reaches getPriceWithFallback carrying its ORIGINAL age', async () => {
      const a = livePricingAdapter as unknown as {
        priceCache: Map<string, unknown>;
        fetchPrice: (s: string) => Promise<void>;
        getPriceWithFallback: (s: string, ms?: number) => Promise<{ observedAt: number | null; producer: string; source: string } | null>;
      };
      a.priceCache.set(SYM, {
        symbol: SYM, price: 555.5, timestamp: new Date(OLD_OBSERVED).toISOString(),
        source: 'kraken_rest', producer: 'kraken_rest_poller',
        observedAt: OLD_OBSERVED, cachedAt: Date.now(),
      });

      restRateLimiter.check(SYM);                 // arm -> the next REST ask is blocked
      const before = restRateLimiter.getStats().blockedCount;
      await a.fetchPrice(SYM);                    // the REAL cache writer, through :538
      expect(restRateLimiter.getStats().blockedCount).toBeGreaterThan(before);  // positive control

      const q = await a.getPriceWithFallback(SYM, 2000);   // exactly what the engine calls
      expect(q).not.toBeNull();
      // ⛔ THE ASSERTION THE ENGINE ACTUALLY DEPENDS ON. Mutate :538 to a bare Date.now() and
      //    this is the only test in the repo that goes red.
      expect(q!.observedAt).toBe(OLD_OBSERVED);
      expect(q!.producer).toBe('kraken_rest_rate_limited_reserve');
      expect(q!.source).toBe('kraken_rest');
    });
  });

  it('P11 - the SPLIT is pure re-description: coarse names gone, nothing merged or deleted', () => {
    // Langston's condition 1: split only - never merge, never delete a member, never change which
    // number is produced. The three coarse names must be gone from the union; the three members
    // deliberately NOT split must still be present, each for a stated reason (book_mid has no
    // last-trade arm; ticker_v1 is unreachable; rest_poller has a THIRD arm - the rate-limited
    // bare cached price, #951).
    // SCOPED TO THE PRODUCER UNION, and the first version of this test was NOT - it searched the
    // whole file and matched the SOURCE union, where 'kraken_equities_ws' legitimately still
    // lives and MUST. That failure was this batch's own subject landing on its own test: only the
    // PRODUCER splits. Slice first, then assert.
    const src = code(LPA);
    const unionStart = src.indexOf('export type PriceProducer =');
    expect(unionStart).toBeGreaterThan(-1);
    const union = src.slice(unionStart, src.indexOf("'no_price_produced';", unionStart));
    expect(union).not.toContain("'kraken_ws_ticker'");
    expect(union).not.toContain("'kraken_equities_ws'");
    expect(union).not.toContain("'kraken_rest_engine_fallback'");
    expect(union).toContain("'kraken_ws_book_mid'");
    expect(union).toContain("'kraken_ws_ticker_v1'");
    expect(union).toContain("'kraken_rest_poller'");
  });
});
