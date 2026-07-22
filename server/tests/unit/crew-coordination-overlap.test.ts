/**
 * B-CREW-COORD (#554) — unit tests for `overlappingClaims`.
 *
 * This is the ONE piece of board logic the commit guard depends on to decide
 * whether to warn, so it is tested directly. It is deliberately PURE — no DB,
 * no clock — which is why it can be pinned here while the rest of the board is
 * verified by live exercise (scope OBJ-3).
 *
 * The properties being pinned are the ones that would silently misfire:
 *   - a claim on a DIRECTORY covers files beneath it (or the guard misses real
 *     collisions on every directory-level claim);
 *   - a prefix must not match a SIBLING whose name merely starts the same way
 *     (`server/core` must not capture `server/core-extras/…`) — that is the
 *     false-positive class that has twice landed on the people documenting the
 *     guard, and a control whose false positives punish its own upkeep gets
 *     silenced;
 *   - your OWN claims never warn you;
 *   - `push` rows are not path claims and must never match.
 */

import { describe, it, expect } from 'vitest';
import { overlappingClaims, type CrewEntry } from '../../services/crew-coordination.js';

function entry(over: Partial<CrewEntry> = {}): CrewEntry {
  return {
    id: 1,
    session: 'NEW Claude',
    kind: 'claim',
    paths: [],
    status: 'active',
    note: null,
    createdAt: new Date('2026-07-22T12:00:00Z'),
    releasedAt: null,
    ...over,
  };
}

describe('overlappingClaims', () => {
  it('matches an exact file claim', () => {
    const e = entry({ paths: ['server/services/foo.ts'] });
    const out = overlappingClaims([e], ['server/services/foo.ts'], 'ANALYST Claude');
    expect(out).toHaveLength(1);
    expect(out[0].paths).toEqual(['server/services/foo.ts']);
  });

  it('a directory claim covers files beneath it', () => {
    const e = entry({ paths: ['server/core'] });
    const out = overlappingClaims([e], ['server/core/rtb/ready_to_buy_service.ts'], 'ANALYST Claude');
    expect(out).toHaveLength(1);
  });

  it('a trailing slash on the claim behaves identically', () => {
    const e = entry({ paths: ['server/core/'] });
    const out = overlappingClaims([e], ['server/core/rtb/x.ts'], 'ANALYST Claude');
    expect(out).toHaveLength(1);
  });

  it('★ does NOT match a sibling that merely shares a name prefix', () => {
    // `server/core` must not capture `server/core-extras/…`. This is the
    // false-positive shape that gets a guard silenced.
    const e = entry({ paths: ['server/core'] });
    const out = overlappingClaims([e], ['server/core-extras/thing.ts'], 'ANALYST Claude');
    expect(out).toHaveLength(0);
  });

  it('never warns you about your own claims', () => {
    const e = entry({ session: 'ANALYST Claude', paths: ['server/services/foo.ts'] });
    const out = overlappingClaims([e], ['server/services/foo.ts'], 'ANALYST Claude');
    expect(out).toHaveLength(0);
  });

  it('ignores push rows — a push is not a path claim', () => {
    const e = entry({ kind: 'push', paths: ['server/services/foo.ts'] });
    const out = overlappingClaims([e], ['server/services/foo.ts'], 'ANALYST Claude');
    expect(out).toHaveLength(0);
  });

  it('reports only the staged paths that actually collided, not the whole set', () => {
    const e = entry({ paths: ['server/core'] });
    const out = overlappingClaims(
      [e],
      ['server/core/a.ts', 'client/src/b.tsx', 'server/core/deep/c.ts'],
      'ANALYST Claude',
    );
    expect(out).toHaveLength(1);
    expect(out[0].paths).toEqual(['server/core/a.ts', 'server/core/deep/c.ts']);
  });

  it('returns nothing when the board is empty', () => {
    expect(overlappingClaims([], ['server/services/foo.ts'], 'ANALYST Claude')).toEqual([]);
  });

  it('surfaces every distinct holder when two sessions claim overlapping paths', () => {
    const a = entry({ id: 1, session: 'NEW Claude', paths: ['server/core'] });
    const b = entry({ id: 2, session: 'OLD Claude', paths: ['server/core/rtb'] });
    const out = overlappingClaims([a, b], ['server/core/rtb/x.ts'], 'ANALYST Claude');
    expect(out.map((o) => o.entry.session).sort()).toEqual(['NEW Claude', 'OLD Claude']);
  });
});
