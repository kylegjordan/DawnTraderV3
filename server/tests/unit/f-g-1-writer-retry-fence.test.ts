/**
 * F-G-1 / OBJ-9 — BATCH WRITER RETRY FENCE
 *
 * The classifier is the load-bearing piece: it decides whether a failed batch is retried or
 * dropped, and getting it backwards turns a data gap into an OOM (#705) or an OOM into a data
 * gap. Every case below names the mutation it fails on.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { isTransientWriteError } from '../../services/passive-archive/ohlc-batch-writer';
import { join } from 'path';

const SRC = readFileSync(
  join(process.cwd(), 'server/services/passive-archive/ohlc-batch-writer.ts'), 'utf8',
);

describe('F-G-1 OBJ-9 — transient vs permanent, asserted against the PRODUCTION SOURCE', () => {
  // MUTATION: invert the default and this fails.
  // Unknown errors MUST be permanent. The opposite default retries an unrecognised permanent
  // fault forever — the exact OOM #705 warns about.
  it('treats UNKNOWN errors as permanent, not transient', () => {
    const fn = SRC.slice(SRC.indexOf('function isTransientWriteError'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    // the function returns true ONLY for an explicit allow-list; there is no `return true` default
    expect(body).toContain('return m.includes(');
    expect(body).not.toMatch(/return\s+true\s*;/);
  });

  // ⛔ REMOVED, NOT REPAIRED. This asserted the SOURCE contained the literal `'connection'`, and
  // it broke the moment I narrowed that match to `'connection terminated'` — a change that made
  // the classifier BETTER. A test that fails on an improvement is testing the wording, not the
  // behaviour. The behavioural suite at the bottom of this file covers the same ground by
  // CALLING the classifier, which is what should have been written first.

  // MUTATION: remove the permanent-path `return` and this fails — permanent rows would be
  // re-buffered, which is #705's OOM.
  it('does NOT re-buffer on a permanent failure', () => {
    const i = SRC.indexOf('if (!isTransientWriteError(err))');
    const block = SRC.slice(i, SRC.indexOf('// TRANSIENT', i));
    expect(block).toContain('return;');
    expect(block).not.toContain('unshift');
  });

  // MUTATION: remove the bound and this fails. #705: the naive re-buffer against a permanent
  // error grows unbounded.
  it('bounds the retry buffer and SHEDS loudly rather than growing without limit', () => {
    expect(SRC).toContain('RETRY_BUFFER_MAX');
    const i = SRC.indexOf('if (buf.length > RETRY_BUFFER_MAX)');
    expect(i).toBeGreaterThan(-1);
    const block = SRC.slice(i, i + 600);
    expect(block).toContain('splice');
    expect(block).toContain('console.error'); // the shed is REPORTED, never silent
  });

  // MUTATION: remove the alert and this fails. #704 produced 4,802 stderr lines and ZERO alerts;
  // the drop was correct and the silence was the defect.
  it('raises a system ALERT on a permanent failure, not just a log line', () => {
    // ⛔ ASSERT THE CALL, NOT THE DEFINITION. My first version checked
    // `SRC.toContain('alertPermanentWriteFailure')`, which stays true when the CALL SITE is
    // deleted because the function declaration still carries the name — a control that could
    // not fire, proved by mutation. Anchor inside the permanent-failure block instead.
    const i = SRC.indexOf('if (!isTransientWriteError(err))');
    const permanentBlock = SRC.slice(i, SRC.indexOf('// TRANSIENT', i));
    expect(permanentBlock).toContain('alertPermanentWriteFailure(');
    expect(SRC).toContain('createSystemAlert');
    expect(SRC).toContain('_permanentAlerted'); // latched — one per class, not one per flush
  });

  // MUTATION: change unshift to push and this fails. Appending older retried rows lets a STALE
  // row win B-NEW-35's last-wins dedup and overwrite a fresher bar.
  it('re-adds retried rows at the FRONT, preserving B-NEW-35 last-wins', () => {
    const i = SRC.indexOf('// TRANSIENT');
    const block = SRC.slice(i, i + 1400);
    expect(block).toContain('buf.unshift(');
    expect(block).not.toContain('buf.push(');
  });
});

describe('F-G-1 #918 — the drain that had no caller', () => {
  it('exports a shutdown drain', () => {
    expect(SRC).toContain('export async function drainArchiveBuffersForShutdown');
  });

  // MUTATION: remove the call from boot_orchestrator and this fails — which is the ONLY thing
  // that made #918 real in the first place.
  it('is actually CALLED from the live shutdown handler', () => {
    const boot = readFileSync(join(process.cwd(), 'server/core/boot_orchestrator.ts'), 'utf8');
    expect(boot).toContain('drainArchiveBuffersForShutdown');
    // and it must not be able to block shutdown
    const i = boot.indexOf('drainArchiveBuffersForShutdown');
    expect(boot.slice(Math.max(0, i - 400), i + 400)).toContain('catch');
  });
});

describe('F-G-1 OBJ-9 — the classifier, EXERCISED rather than grepped', () => {
  // ⛔ THE SOURCE-TEXT TESTS ABOVE PROVE WORDING, NOT BEHAVIOUR. An independent reader pointed
  // out that all of them pass against a classifier matching no real driver string. These CALL it.

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
  it('treats #704s real error, and anything unrecognised, as PERMANENT', () => {
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
