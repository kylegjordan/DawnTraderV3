# -*- coding: utf-8 -*-
"""P-6 — the committed control for dt-deploy-drift.sh's runtime predicate.

B-DRIFT-RUNTIME-PREDICATE (#1016). Run: python scripts/analysis/test-drift-runtime-predicate.py

WHAT THIS TESTS AND WHY IT IS SHAPED THIS WAY
---------------------------------------------
It EXTRACTS the predicate from the shipped shell script and executes THAT — it does not
re-declare a copy. A copy drifts from the thing it claims to test and then passes forever;
that is the #641 two-copies shape, and this batch is about instruments that cannot fail.

It also runs every case against the PRE-FIX predicate as a positive control. If the new
predicate and the old one agree on every case, the test proves nothing about the change —
so the run PRINTS the discrimination count and FAILS if it is zero. A control that cannot
distinguish the fixed code from the broken code is not a control.

EXPECTED OUTPUT IS STATED IN THE CASE TABLE BELOW, BEFORE THE RUN (#744 rider, clause 2:
a control states its expected output before it runs — added because a failure branch was
once run first and still returned a pass from a control that had processed nothing).

Exit 0 = all cases match AND the control discriminates. Any other exit = do not ship.
"""
import io, os, sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', '..', 'comms-infra', 'discord', 'dt-deploy-drift.sh')

def load_shipped_predicate():
    """Compile the predicate out of the shipped file, so this tests the real thing."""
    t = io.open(SRC, encoding='utf-8').read()
    start_marker = u'# ── THE PREDICATE:'
    end_marker = 'names = [f['
    if start_marker not in t or end_marker not in t:
        sys.exit('ABORT: predicate markers not found in %s — the script changed shape; '
                 'fix this extractor rather than deleting the test.' % SRC)
    block = t[t.index(start_marker):t.index(end_marker, t.index(start_marker))]
    ns = {}
    exec(compile(block, 'predicate-from-shipped-file', 'exec'), ns)
    if 'runtime' not in ns:
        sys.exit('ABORT: extracted block defines no runtime()')
    return ns['runtime']

# The PRE-FIX predicate, verbatim. This is the control, not a spare implementation.
def runtime_prefix(f):
    return (f.startswith(('server/', 'client/', 'shared/'))
            and '/tests/' not in f and not f.endswith('.test.ts'))

# path, expected, why — the expectation is the specification.
CASES = [
    ('drizzle/migrations/0123_x.sql',                  1, 'SINK 2 — a held migration, the whole point of #1016'),
    ('drizzle/migrations/MANIFEST.txt',                1, 'SINK 2 — drift here HARD-FAILS the deploy (db-migrate.ts:140-148)'),
    ('scripts/db-migrate.ts',                          1, 'SINK 2 — the tool that produces the schema'),
    ('1-system-manual/authority-baseline-v1.json',     1, 'SINK 4 — read at boot (authority-baseline.ts:88)'),
    ('audit/coherency_rules.yaml',                     1, 'SINK 4 — THE CORE-FOUR RISK ENVELOPE (guardrail-policy.ts:191)'),
    ('config/vts.json',                                1, 'SINK 4 — stop/target geometry (vts-runner.ts:519)'),
    ('bridge/canonical/mapping-regime-strategy.json',  1, 'SINK 4 — disk read at routes.ts:2083-2085'),
    ('data/models/ara_model.json',                     1, 'SINK 4 — single file, never a data/models/** prefix'),
    ('replit.md',                                      1, 'SINK 4 — Langston withdrew his condition 3; read at index.ts:624'),
    ('package-lock.json',                              1, 'SINK 3 — triggers npm ci'),
    ('vite.config.ts',                                 1, 'SINK 1 — build config'),
    ('client/index.html',                              1, 'SINK 1 prefix — no root index.html entry is needed or exists'),
    ('1-system-manual/BATCH_CATALOG.md',               0, 'governance — the gate must stay shut'),
    ('server/x.test.ts',                               0, 'tests filter still applies'),
    ('server/tests/foo.ts',                            0, 'tests filter still applies'),
    ('scripts/analysis/whatever.sh',                   0, 'a SINK test, not a folder test — scripts/ is not blanket-included'),
    ('index.html',                                     0, 'no root index.html exists; a matching entry would read as coverage'),
]

def main():
    runtime = load_shipped_predicate()
    fails = discriminates = 0
    print('  %-48s %-4s %-4s %s' % ('path', 'new', 'old', 'why'))
    for path, want, why in CASES:
        got = 1 if runtime(path) else 0
        old = 1 if runtime_prefix(path) else 0
        if got != want:
            fails += 1
        if got != old:
            discriminates += 1
        print('  %-48s %-4d %-4d %s%s' % (path, got, old, why, '' if got == want else '   <<< FAIL'))
    print('\n  cases: %d   failures: %d   new-differs-from-prefix: %d'
          % (len(CASES), fails, discriminates))
    if fails:
        print('  RESULT: FAIL — the predicate does not match its stated specification.')
        return 1
    if discriminates == 0:
        print('  RESULT: FAIL — the control does not discriminate; this test proves nothing.')
        return 2
    print('  RESULT: PASS — every case matches, and the control separates fixed from broken.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
