/**
 * F-G-1 / OBJ-9 — BATCH WRITER RETRY FENCE
 *
 * The classifier is the load-bearing piece: it decides whether a failed batch is retried or
 * dropped, and getting it backwards turns a data gap into an OOM (#705) or an OOM into a data gap.
 *
 * ⛔⛔ THE SOURCE-TEXT HALF OF THIS FILE WAS DELETED — LANGSTON'S RULING, AND HE PROVED IT WITH THE
 * ONE THAT WAS LYING. `expect(SRC).toContain('createSystemAlert')` passed on the ONLY occurrence of
 * that string in the writer: a COMMENT reading "THE JSONL ALERT SYSTEM, NOT storage.createSystem-
 * Alert". The assertion was green on prose asserting the opposite of what it tested, and would have
 * stayed green through a full revert to the Postgres store — the exact regression it appeared to
 * guard. It sat in the same `it()` block where I had just repaired its sibling and written
 * "A CONTROL THAT CANNOT FIRE IS THE SAME DEFECT AS THE FENCE IT GUARDS." I mutated one arm and
 * not the one beside it.
 * ★ HIS PRINCIPLE, WHICH IS THE GENERAL FORM: grepping your own comments is not a fence — comments
 * are where INTENT is written, so a text fence is greenest precisely when doc and code have
 * diverged. Everything below either CALLS the code or OBSERVES it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── db mocked so a flush can be made to fail on demand ──────────────────────────────────────
const _dbState: {
  throwWith: Error | null;
  inserted: any[][];
  /** Fires INSIDE the insert, i.e. after the buffer has been drained and before the catch
   *  re-adds the rows. That window is the ONLY place `unshift` and `push` differ. */
  onFlush: null | (() => void);
} = { throwWith: null, inserted: [], onFlush: null };
vi.mock('../../db.js', () => ({
  db: {
    insert: () => ({
      values: (rows: any) => ({
        onConflictDoUpdate: async () => {
          if (_dbState.onFlush) _dbState.onFlush();
          if (_dbState.throwWith) throw _dbState.throwWith;
          _dbState.inserted.push(rows);
        },
        onConflictDoNothing: async () => {
          if (_dbState.throwWith) throw _dbState.throwWith;
          _dbState.inserted.push(rows);
        },
      }),
    }),
  },
}));

const _alerts: any[] = [];
vi.mock('../../services/system-alerts.js', () => ({
  addAlert: async (opts: any) => { _alerts.push(opts); return opts; },
}));

const _tickerStops: number[] = [];
let _tickerStopRejects = false;
vi.mock('../../services/passive-archive/ticker-batch-writer.js', () => ({
  stopTickerWriter: async () => {
    _tickerStops.push(1);
    if (_tickerStopRejects) throw new Error('ticker drain blew up');
  },
}));

import {
  isTransientWriteError,
  bufferOhlcBar,
  stopBatchWriter,
  drainArchiveBuffersForShutdown,
  RETRY_BUFFER_MAX,
} from '../../services/passive-archive/ohlc-batch-writer';

const bar = (n: number) => ({
  symbol: `T${n}/USD`,
  intervalBegin: new Date(1_700_000_000_000 + n * 60_000),
  open: '1', high: '1', low: '1', close: '1', volume: '1',
  assetClass: 'crypto_spot', exchange: 'kraken',
}) as any;

/**
 * ⚠️ THE ALERT IS FIRE-AND-FORGET IN PRODUCTION — `void alertPermanentWriteFailure(...)`, so the
 * flush returns BEFORE the dynamic import and the alert write finish. That is deliberate: raising
 * an alert must never be able to stall or fail the flush path. It means a test cannot assert on
 * the alert immediately after awaiting the flush, and my first version did exactly that and read
 * the resulting empty array as "no alert raised" — a wrong verdict from a correct system.
 * ⇒ Poll for the CONDITION with a deadline, never a fixed sleep: deterministic when it works,
 * and only slow when it genuinely does not.
 * ★ RESIDUAL, STATED NOT FIXED: because it is not awaited, a permanent failure occurring during
 * the shutdown drain can lose its alert if the process exits first. Accepted — the alternative is
 * letting the alert path delay shutdown, and the #704 case this guards ran for 15 hours.
 */
async function waitFor(cond: () => boolean, ms = 1000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
}

beforeEach(() => {
  _dbState.throwWith = null;
  _dbState.onFlush = null;
  _dbState.inserted.length = 0;
  _alerts.length = 0;
  _tickerStops.length = 0;
  _tickerStopRejects = false;
});
afterEach(async () => {
  _dbState.throwWith = null;
  await stopBatchWriter(); // leave no rows behind for the next test
  _dbState.inserted.length = 0;
});

describe('F-G-1 OBJ-9 — the classifier, EXERCISED rather than grepped', () => {
  // MUTATION: remove the statement-timeout guard and this fails.
  // A permanently-slow write is message-indistinguishable from a transient one under a bare
  // `timeout` match, and would be retried forever on the branch that raises NO alert.
  it('treats a PERMANENT statement timeout as permanent, not transient', () => {
    expect(isTransientWriteError(new Error('canceling statement due to statement timeout'))).toBe(false);
  });

  it('treats the real transient driver errors as transient', () => {
    for (const msg of [
      'deadlock detected',
      'ohlc-batch-writer: pool slot timeout (5s)',
      'Connection terminated unexpectedly',
      'read ECONNRESET',
      'sorry, too many clients already',
    ]) {
      expect(isTransientWriteError(new Error(msg))).toBe(true);
    }
  });

  // MUTATION: default unknown to transient and this fails — that is #705's OOM.
  it('treats the real #704 error, and anything unrecognised, as PERMANENT', () => {
    expect(isTransientWriteError(new Error(
      'there is no unique or exclusion constraint matching the ON CONFLICT specification',
    ))).toBe(false);
    expect(isTransientWriteError(new Error('column "foo" does not exist'))).toBe(false);
    expect(isTransientWriteError(new Error('something nobody has seen before'))).toBe(false);
  });

  it('handles a non-Error throw without crashing the flush path', () => {
    expect(isTransientWriteError('deadlock detected')).toBe(true);
    expect(isTransientWriteError(null)).toBe(false);
  });
});

describe('F-G-1 OBJ-9 — RETRY vs DROP, observed through the buffer instead of the source text', () => {
  // ⛔ THE INSTRUMENT: the buffer is module-private, so its contents are read through the ONLY
  // thing that can see them — what a SECOND flush attempts. Rows still buffered are re-offered;
  // dropped rows are not. That is a real observation, not a grep.

  // POSITIVE CONTROL, and it is required before either silence below counts as evidence:
  // prove the instrument can see a write AT ALL.
  it('CONTROL — a clean flush writes the rows through, and a second flush writes nothing', async () => {
    bufferOhlcBar('crypto_spot', bar(1));
    await stopBatchWriter();
    expect(_dbState.inserted.flat()).toHaveLength(1);
    _dbState.inserted.length = 0;
    await stopBatchWriter();
    expect(_dbState.inserted.flat()).toHaveLength(0); // buffer genuinely emptied
  });

  // MUTATION: delete the `return;` on the permanent branch (so rows are re-buffered) and this
  // fails — the second flush would re-offer them. That re-buffer IS #705's OOM.
  it('DROPS on a permanent failure — the rows are gone, not retried', async () => {
    _dbState.throwWith = new Error('column "foo" does not exist');
    bufferOhlcBar('crypto_spot', bar(1));
    bufferOhlcBar('crypto_spot', bar(2));
    await stopBatchWriter();

    _dbState.throwWith = null;
    _dbState.inserted.length = 0;
    await stopBatchWriter();
    expect(_dbState.inserted.flat()).toHaveLength(0);
  });

  // MUTATION: invert the classifier, or drop the `buf.unshift(...rows)`, and this fails.
  it('RETAINS on a transient failure — the same rows are re-offered on the next flush', async () => {
    _dbState.throwWith = new Error('deadlock detected');
    bufferOhlcBar('crypto_spot', bar(1));
    bufferOhlcBar('crypto_spot', bar(2));
    await stopBatchWriter();

    _dbState.throwWith = null;
    _dbState.inserted.length = 0;
    await stopBatchWriter();
    const rows = _dbState.inserted.flat();
    expect(rows).toHaveLength(2);
    expect(rows.map((r: any) => r.symbol).sort()).toEqual(['T1/USD', 'T2/USD']);
  });

  // MUTATION: change `unshift` to `push` and this fails. B-NEW-35's dedup keeps the LAST row per
  // (symbol, minute) because "the last write IS the latest WS update" — a TEMPORAL invariant. So
  // appending retried rows would let a STALE row overwrite a fresher bar.
  //
  // ⛔⛔ MY FIRST VERSION OF THIS TEST COULD NOT FAIL, AND I ONLY KNOW THAT BECAUSE I RAN THE
  // MUTATION. It buffered the fresh row AFTER the failed flush had already returned — by which
  // point the buffer held only the retried row, so `unshift` and `push` produce the IDENTICAL
  // array and the dedup keeps the fresh row either way. The test passed under both. The two
  // operations differ in EXACTLY ONE window: when rows are ALREADY in the buffer at the moment
  // the retried ones come back — i.e. when a WS update lands DURING the in-flight flush, which is
  // the real-world case the invariant exists for. So the fresh row is now injected from inside
  // the insert itself.
  // ★ This is the same defect Langston caught in the alert assertion, in the test written to
  // replace it: a control that cannot fire is the same defect as the fence it guards.
  it('re-adds retried rows at the FRONT, so a fresher bar still wins B-NEW-35 last-wins', async () => {
    const stale = { ...bar(1), close: '111' };
    const fresh = { ...bar(1), close: '999' }; // same symbol + minute
    _dbState.throwWith = new Error('deadlock detected');
    // the fresh WS update arrives mid-flush: buffer drained, rows not yet re-added
    _dbState.onFlush = () => { _dbState.onFlush = null; bufferOhlcBar('crypto_spot', fresh); };
    bufferOhlcBar('crypto_spot', stale);
    await stopBatchWriter();          // stale fails; buffer already holds `fresh`

    _dbState.throwWith = null;
    _dbState.inserted.length = 0;
    await stopBatchWriter();
    const rows = _dbState.inserted.flat();
    expect(rows).toHaveLength(1);               // deduped to one
    expect((rows[0] as any).close).toBe('999'); // the FRESH one survived
  });

  // MUTATION: remove the alert call and this fails. #704 produced 4,802 stderr lines and ZERO
  // alerts; the drop was correct and the SILENCE was the defect.
  // ⛔ PROVED BY SPYING THE ALERT MODULE, never by grepping its name — the grep version of this
  // test passed on a comment saying the opposite.
  it('RAISES a real alert on a permanent failure, into the JSONL store the per-turn check reads', async () => {
    _dbState.throwWith = new Error('there is no unique or exclusion constraint matching the ON CONFLICT specification');
    bufferOhlcBar('crypto_perp', bar(3));
    await stopBatchWriter();
    await waitFor(() => _alerts.length > 0);

    expect(_alerts).toHaveLength(1);
    expect(_alerts[0].category).toBe('breakage');   // an off-SSOT category would THROW in addAlert
    expect(_alerts[0].severity).toBe('critical');
    expect(String(_alerts[0].title)).toContain('crypto_perp');
    // ⛔ THE EXACT KEY, not merely a truthy one. `toBeTruthy()` passes on a per-flush unique
    // string — which would DEFEAT the cross-restart dedup this rider exists for, since the store
    // suppresses only a repeat of the SAME key. Proving "a key was passed" is not proving "the
    // same key will be passed next time". Fresh-reader finding.
    expect(_alerts[0].dedupe_key).toBe('ohlc-writer-permanent-crypto_perp');
  });

  // MUTATION: remove the latch (or set it before a successful raise) and this fails.
  // ⚠️ USES ITS OWN ASSET CLASS ON PURPOSE. The latch is a MODULE-LEVEL map and does not reset
  // between tests, so running this on `crypto_perp` — already latched by the test above — made it
  // fail for the wrong reason and would have made it PASS for the wrong reason once "expect 1"
  // became "expect 0". A test whose subject is a latch must start from an unlatched key.
  it('latches the alert — a second permanent failure on the same writer:class does not re-raise', async () => {
    _dbState.throwWith = new Error('column "bar" does not exist');
    bufferOhlcBar('xstock_perp', bar(4));
    await stopBatchWriter();
    await waitFor(() => _alerts.length > 0);
    expect(_alerts).toHaveLength(1);       // the FIRST one did raise — the control for the claim below
    bufferOhlcBar('xstock_perp', bar(5));
    await stopBatchWriter();
    // give a SECOND alert every chance to appear before concluding it did not
    await waitFor(() => _alerts.length > 1, 200);
    expect(_alerts).toHaveLength(1);
  });

  // ⛔⛔ THIS TEST USED TO ASSERT ONLY THAT `RETRY_BUFFER_MAX` WAS FINITE AND POSITIVE, WHICH
  // MEANT THE BOUND'S BEHAVIOUR WAS COVERED BY NOTHING AT ALL. Deleting the entire shed block
  // left it green; so did `RETRY_BUFFER_MAX = 1e9`. It was one of the "behavioural cover"
  // replacements for the deleted source-text half, and it was STRICTLY WEAKER than the assertion
  // it replaced — that one at least required `splice` and a `console.error` to be present.
  // A fresh reader caught it. This version drives the bound.
  // MUTATION: delete the shed block, or raise the cap, and this fails.
  it('SHEDS at the cap instead of growing without limit, and sheds the OLDEST', async () => {
    _dbState.throwWith = new Error('deadlock detected');   // transient => every row is re-buffered
    for (let i = 0; i < RETRY_BUFFER_MAX + 5; i++) bufferOhlcBar('xstock_spot', bar(i));
    await stopBatchWriter();                               // fails, re-adds, trips the cap

    _dbState.throwWith = null;
    _dbState.inserted.length = 0;
    await stopBatchWriter();
    const rows = _dbState.inserted.flat();
    expect(rows).toHaveLength(RETRY_BUFFER_MAX);            // bounded, not 50,005
    // and the FIVE that went are the oldest: T0..T4 are gone, the newest survives.
    const symbols = new Set(rows.map((r: any) => r.symbol));
    for (let i = 0; i < 5; i++) expect(symbols.has(`T${i}/USD`)).toBe(false);
    expect(symbols.has(`T${RETRY_BUFFER_MAX + 4}/USD`)).toBe(true);
  }, 30_000);
});

describe('F-G-1 #918 — the drain that had no caller', () => {
  // MUTATION: drop stopTickerWriter from the drain and this fails.
  // ⛔ THE OLD FENCE ASKED THAT THE FUNCTION EXISTS AND IS CALLED. IT NEVER ASKED WHAT IT DRAINS —
  // which is how it passed while the drain covered only the recoverable leg. Langston's catch.
  // This version CALLS the drain and observes the ticker leg being driven.
  it('drains BOTH writers, not just the recoverable one', async () => {
    bufferOhlcBar('crypto_spot', bar(6));
    await drainArchiveBuffersForShutdown();
    expect(_tickerStops).toHaveLength(1);             // the UNRECOVERABLE leg ran
    expect(_dbState.inserted.flat()).toHaveLength(1); // and so did the OHLC leg
  });

  // MUTATION: swap Promise.allSettled for Promise.all and this fails — one failing leg would
  // reject and skip the other's completion.
  it('one failing leg does not skip the other, and does not throw into shutdown', async () => {
    _tickerStopRejects = true;
    bufferOhlcBar('crypto_spot', bar(7));
    await expect(drainArchiveBuffersForShutdown()).resolves.toBeUndefined();
    expect(_tickerStops).toHaveLength(1);
    expect(_dbState.inserted.flat()).toHaveLength(1);
  });

  // ⚠️ THE ONE SOURCE-TEXT ASSERTION I KEPT — AND MY FIRST VERSION OF IT WAS SATISFIED BY THE
  // IMPORT LINE, NOT THE CALL. That is #918's exact shape ("the function existed, was exported,
  // documented, and had zero callers") reproduced INSIDE the test guarding #918. I hardened it
  // against the comment vector, which was Langston's stated objection, and not against the
  // identifier-without-a-call vector, which is the defect the test is about. A fresh reader ran
  // the mutation: deleting `await drainArchiveBuffersForShutdown();` left BOTH assertions green,
  // because the first occurrence in the stripped text is `const { drainArchiveBuffersForShutdown }
  // = await import(...)` and `catch` was inside the window regardless.
  // ⇒ It now requires a CALL FORM. An import — bare, named, or destructured — cannot match it.
  // ⚠️ AND IT WEAKENS MY OWN J5 ARGUMENT TO LANGSTON: I defended keeping this against his ruling
  // on the grounds that it was "the only thing that made #918 real". It was not doing that job.
  it('is actually CALLED from the live shutdown handler — a call, not an import', () => {
    const raw = readFileSync(join(process.cwd(), 'server/core/boot_orchestrator.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).toMatch(/await\s+drainArchiveBuffersForShutdown\s*\(\s*\)/);
    const i = code.search(/await\s+drainArchiveBuffersForShutdown\s*\(/);
    expect(code.slice(Math.max(0, i - 400), i + 400)).toContain('catch');
  });
});
