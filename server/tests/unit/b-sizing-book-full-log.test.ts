/**
 * #698 amendment 5 (B-SIZING-DEC-RESTORE inc3 r9; Langston, deploy-B Step 8): the continuous promotion loop logs a full
 * book — on entry, every reminder interval while it lasts, and on exit — instead of writing nothing.
 * MUTATION: drop the reminder branch and test 2 fails; drop the exit branch and test 3 fails.
 */
import { describe, it, expect } from 'vitest';
import { nextBookFullLog, type BookFullState } from '../../services/active-position-sizing';

const MIN = 60_000;
const R = 10 * MIN;
const empty: BookFullState = { since: null, lastLogAt: 0 };

describe('#698 amendment 5 — the full-book log', () => {
  it('1 — entering a full book logs once; the next tick inside the interval is silent', () => {
    const a = nextBookFullLog(empty, 0, 20, 20, 1_000 * MIN, R);
    expect(a.line).toMatch(/^BOOK_FULL 20\/20 open/);
    const b = nextBookFullLog(a.state, 0, 20, 20, 1_000 * MIN + 30_000, R);
    expect(b.line).toBeNull();
  });

  it('2 — while full, a reminder every interval says the loop is alive', () => {
    const a = nextBookFullLog(empty, 0, 20, 20, 0, R);
    const b = nextBookFullLog(a.state, 0, 20, 20, R, R);
    expect(b.line).toMatch(/still full 20\/20 for 10 min — loop alive/);
    expect(nextBookFullLog(b.state, 0, 20, 20, R + 30_000, R).line).toBeNull();
  });

  it('3 — a freed slot logs the exit once, then nothing', () => {
    const a = nextBookFullLog(empty, 0, 20, 20, 0, R);
    const b = nextBookFullLog(a.state, 1, 19, 20, 25 * MIN, R);
    expect(b.line).toBe('BOOK_SLOT_FREE 1 slot(s) free after 25 min full');
    expect(b.state.since).toBeNull();
    expect(nextBookFullLog(b.state, 1, 19, 20, 26 * MIN, R).line).toBeNull();
  });

  it('4 — control: a book with free slots that was never full writes nothing', () => {
    expect(nextBookFullLog(empty, 5, 15, 20, 0, R).line).toBeNull();
  });
});
