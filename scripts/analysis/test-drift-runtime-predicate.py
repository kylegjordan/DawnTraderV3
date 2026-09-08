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
    end_marker = 'runtime_files = ['
    if start_marker not in t or end_marker not in t:
        sys.exit('ABORT: predicate markers not found in %s — the script changed shape; '
                 'fix this extractor rather than deleting the test.' % SRC)
    block = t[t.index(start_marker):t.index(end_marker, t.index(start_marker))]
    ns = {}
    exec(compile(block, 'predicate-from-shipped-file', 'exec'), ns)
    # ⛔⛔ ONE MARKED REGION, ENDING AT `runtime_files = [` — it must contain BOTH runtime()
    #   AND qualifies(). BLOCKER-2 (Langston, r3): the earlier version ended at
    #   `names = [f[`, and qualifies() is defined BELOW that line, so it sat OUTSIDE the
    #   extracted block and had NO CONTROL AT ALL. Mutation-confirmed by him: stripping the
    #   previous_filename arm PASSED, exit 0; deleting qualifies() entirely PASSED, exit 0.
    #   The whole judgement-call-5 fix could be deleted and this control would certify it.
    # ⚠️ AND I TOLD HIM THE OPPOSITE — that there were 'two extractions with two markers'.
    #   There was ONE marker pair used twice. I asserted a property of my own test without
    #   reading it; asking what the second marker actually was would have caught it.
    for need in ('runtime', 'qualifies'):
        if need not in ns:
            sys.exit('ABORT: extracted block defines no %s() — the marked region no longer '
                     'covers the whole predicate. Fix the markers, do not narrow the test.' % need)
    return ns['runtime'], ns['qualifies']

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
    # the six entries the earlier version left unasserted, and the rollback case a reader found
    ('tsconfig.json',                                  1, 'SINK 1 build config'),
    ('tailwind.config.ts',                             1, 'SINK 1 build config'),
    ('postcss.config.js',                              1, 'SINK 1 build config'),
    ('package.json',                                   1, 'SINK 3 — and there is exactly one tracked package.json'),
    ('bridge/canonical/phase9_predictive-learning.json', 1, 'SINK 4 — recalibrate-predictive-weights.ts:221'),
    ('1-system-manual/audits/b-new-42/dividend-calendar-seed.json', 1, 'SINK 4 — live service read'),
    ('drizzle/migrations/0099_x_rollback.sql',         0, 'ROLLBACK sql NEVER executes — db-migrate.ts:118 filters it, :120-125 throws if listed'),
    ('drizzle/migrations/0099_ROLLBACK.sql',           0, 'rollback match is case-insensitive, mirroring db-migrate'),
    # ⛔ BLOCKER-1 (Langston, Step 4): there was NO POSITIVE CASE for server/ or shared/.
    #   Both prior server/ cases expected 0 (the tests filter), so they passed whether or
    #   not the prefix existed. Mutation-confirmed: deleting 'server/' gave PASS, exit 0 —
    #   and server/ is the prefix the ENTIRE alert exists for (#1001 was
    #   active-execution-engine.ts and signal-orchestrator.ts undeployed).
    ('server/services/foo.ts',                         1, 'SINK 1 prefix — THE case the whole alert exists for'),
    ('shared/schema.ts',                               1, 'SINK 1 prefix'),
    ('drizzle/migrations/0100_real.sql',               1, 'SINK 2 prefix, non-rollback'),
]

# ⛔⛔ THE SET ITSELF IS ASSERTED, NOT JUST ITS BEHAVIOUR — AND THIS EXISTS BECAUSE A FRESH
#   READER BROKE THE EARLIER VERSION OF THIS TEST AND IT STILL PRINTED PASS. They deleted
#   'package.json', cut SINK1_FILES to one entry and typo'd two SINK4 paths; the run reported
#   17 cases, 0 failures, exit 0, because the behavioural cases covered only 9 of 15 entries.
# ⇒ A test that exercises a SUBSET of a set cannot detect deletions from the rest of it.
#   Behavioural cases prove the predicate ANSWERS correctly; this proves the SET IS INTACT.
# ⛔⛔ BLOCKER-1: THE PREFIX TUPLES ARE ASSERTED TOO. The first version of this integrity
#   check unioned only the four _FILES tuples — the SAME defect the fresh reader found,
#   left standing on the other half of the predicate because I fixed exactly what was
#   pointed at. Deleting 'server/' passed; deleting 'shared/' passed; only 'client/' was
#   caught, and then only incidentally via the client/index.html case.
EXPECTED_PREFIXES = {
    'SINK1_PREFIXES': ('server/', 'client/', 'shared/'),
    'SINK2_PREFIXES': ('drizzle/migrations/',),
}

EXPECTED_ENTRIES = {
    # SINK 1
    'vite.config.ts', 'tsconfig.json', 'tailwind.config.ts', 'postcss.config.js',
    # SINK 2
    'scripts/db-migrate.ts',
    # SINK 3
    'package-lock.json', 'package.json',
    # SINK 4
    'audit/coherency_rules.yaml',
    'config/vts.json',
    '1-system-manual/authority-baseline-v1.json',
    '1-system-manual/audits/b-new-42/dividend-calendar-seed.json',
    'bridge/canonical/phase9_predictive-learning.json',
    'bridge/canonical/mapping-regime-strategy.json',
    'data/models/ara_model.json',
    'replit.md',
}


# ⛔⛔ ENTRY-SHAPED CASES — THESE EXERCISE qualifies(), WHICH HAD NO CONTROL AT ALL UNTIL
#   Langston's r3. A rename that moves a sink file OUT of its path leaves only the new,
#   unmatched name in files[].filename, so without the previous_filename arm the gate goes
#   quiet on a state it cannot see — this batch's own subject, inside the fix for it.
ENTRY_CASES = [
    ({'filename': 'config/vts-old.json', 'previous_filename': 'config/vts.json'},
     1, 'sink file renamed OUT of its path — caught only via previous_filename'),
    ({'filename': 'config/vts.json', 'previous_filename': 'config/vts-old.json'},
     1, 'renamed INTO a sink path — caught on the current name'),
    ({'filename': 'server/services/a.ts', 'previous_filename': 'server/services/b.ts'},
     1, 'rename within a sink prefix'),
    ({'filename': 'docs/a.md', 'previous_filename': 'docs/b.md'},
     0, 'non-sink rename — must stay quiet'),
    ({'filename': 'config/vts.json'},
     1, 'plain modify, no previous_filename key at all'),
    ({'filename': 'docs/a.md'},
     0, 'plain non-sink modify'),
]

def repo_root():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')

def check_set_integrity():
    """Fails on deletion, addition, or a one-character typo in any exact-match entry —
    and on an entry that is not a tracked path, which no behavioural case can see."""
    import subprocess
    t = io.open(SRC, encoding='utf-8').read()
    block = t[t.index(u'# ── THE PREDICATE:'):t.index('runtime_files = [')]
    ns = {}
    exec(compile(block, 'predicate-from-shipped-file', 'exec'), ns)
    shipped = set()
    for name in ('SINK1_FILES', 'SINK2_FILES', 'SINK3_FILES', 'SINK4_FILES'):
        shipped |= set(ns[name])

    problems = []
    for name, expected in sorted(EXPECTED_PREFIXES.items()):
        got = tuple(ns.get(name, ()))
        if got != expected:
            problems.append('%s is %r, expected %r' % (name, got, expected))
    # ⭐ JUDGEMENT CALL 1 (Langston): the rollback rule is a SECOND COPY of db-migrate's.
    #   Accepted — different languages, different hosts — but the drift is closed here for
    #   the cost of a grep, because the file itself says: if that filter changes, this one
    #   is wrong and must follow it.
    mig = os.path.join(repo_root(), 'scripts', 'db-migrate.ts')
    if "includes('rollback')" not in io.open(mig, encoding='utf-8').read():
        problems.append('db-migrate.ts no longer contains the rollback filter this predicate mirrors; the rule has changed underneath it')
    for extra in sorted(shipped - EXPECTED_ENTRIES):
        problems.append('ADDED but not in this test\'s expected set: %s' % extra)
    for missing in sorted(EXPECTED_ENTRIES - shipped):
        problems.append('MISSING from the shipped set: %s' % missing)

    # ⛔ AN ENTRY THAT IS NOT A TRACKED PATH MATCHES NOTHING WHILE READING AS COVERAGE —
    #   exactly the reason the root 'index.html' entry was struck at Step 2.
    repo = repo_root()
    for entry in sorted(shipped):
        r = subprocess.run(['git', 'ls-files', '--error-unmatch', entry],
                           cwd=repo, capture_output=True, text=True)
        if r.returncode != 0:
            problems.append('NOT A TRACKED PATH (matches nothing, reads as coverage): %s' % entry)

    print('  set integrity: %d shipped entries, %d expected' % (len(shipped), len(EXPECTED_ENTRIES)))
    for p in problems:
        print('    <<< %s' % p)
    return len(problems)


def main():
    runtime, qualifies = load_shipped_predicate()
    integrity_problems = check_set_integrity()
    print()
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
    print()
    for entry, want, why in ENTRY_CASES:
        got = 1 if qualifies(entry) else 0
        ok = (got == want)
        if not ok:
            fails += 1
        prev = entry.get('previous_filename', '-')
        print('  %-28s prev=%-26s %-4d %s%s'
              % (entry['filename'], prev, got, why, '' if ok else '   <<< FAIL'))
    print('\n  cases: %d   failures: %d   new-differs-from-prefix: %d'
          % (len(CASES) + len(ENTRY_CASES), fails, discriminates))
    if integrity_problems:
        print('  RESULT: FAIL — the SET is not intact (%d problem(s) above).' % integrity_problems)
        print('          A behavioural pass here would be the exact failure this batch is')
        print('          about: a control reporting all-clear from a state it cannot see.')
        return 3
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
