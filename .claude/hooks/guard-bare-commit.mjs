#!/usr/bin/env node
/**
 * guard-bare-commit — PreToolUse guard against the SHARED-INDEX SWEEP.
 *
 * WHY THIS EXISTS (2026-07-19, CC-A, second occurrence in one session):
 * Two CC sessions edit ONE working tree, so they share ONE git index. A bare
 * `git commit -m ...` commits EVERYTHING STAGED — including paths the *other*
 * session staged. CC-A did this twice:
 *   • swept CC-B's dynamic-slots.ts deletion → red CI
 *   • swept CC-B's entire 9-path P19-B8.12 set into d090178d6, including an
 *     active-filter-pool.ts change Langston's conditional GO was HOLDING —
 *     18 real content lines buried in ~1,478 lines of CRLF churn, pushed unreviewed.
 * After the first, "run a staged-set check before every shared-tree commit" was
 * adopted as a practice. It was applied to some commits and skipped on the one
 * that mattered. A practice you have to remember is not a control; this is.
 *
 * WHAT IT BLOCKS: `git commit` that (a) is not path-limited, (b) is not --amend
 * with no new staging, and (c) has MORE THAN staging you'd expect — we cannot see
 * the index from here, so we block the *shape* and tell the caller to prove intent
 * by naming paths explicitly: `git commit -m "..." -- <paths>`.
 *
 * FAIL-OPEN by design: it only ever matches this one shape. Anything it cannot
 * parse is allowed through. It must never be the reason a session cannot work.
 */

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); } // unparseable → allow

  const tool = payload?.tool_name ?? payload?.toolName;
  if (tool !== 'Bash') process.exit(0);

  const cmd = String(payload?.tool_input?.command ?? payload?.toolInput?.command ?? '');
  if (!cmd) process.exit(0);

  // Only consider actual git commit invocations.
  if (!/\bgit\s+commit\b/.test(cmd)) process.exit(0);

  // Allowed shapes — each proves the caller scoped the commit deliberately:
  //  1. path-limited:            git commit -m "..." -- path/a path/b
  //  2. amend without new stage: git commit --amend        (rewrites what is already in HEAD)
  //  3. -F file with -- paths    (same as 1)
  const isPathLimited = /\bgit\s+commit\b[^\n]*\s--\s+\S/.test(cmd);
  const isAmend = /\bgit\s+commit\b[^\n]*--amend/.test(cmd);
  if (isPathLimited || isAmend) process.exit(0);

  // `git commit -a` is even worse in a shared tree — stages every tracked change.
  const isCommitAll = /\bgit\s+commit\b[^\n]*\s-[a-zA-Z]*a/.test(cmd);

  const msg = [
    'BLOCKED — shared-index sweep guard (CC-A caused this twice in one session).',
    '',
    isCommitAll
      ? 'This is `git commit -a` in a SHARED working tree: it stages and commits every tracked'
      : 'This is a BARE `git commit` in a SHARED working tree: it commits EVERYTHING staged,',
    isCommitAll
      ? 'modification — including the other session\'s in-flight work.'
      : 'including paths the OTHER session staged. That is how d090178d6 swept CC-B\'s 9-path',
    'P19-B8.12 set and pushed an active-filter-pool.ts change Langston was holding — 18 real',
    'lines hidden inside ~1,478 lines of CRLF churn, shipped unreviewed.',
    '',
    'FIX — prove the scope by naming the paths:',
    '    git commit -m "..." -- path/one path/two',
    '',
    'Or, if you genuinely intend to commit the current index, FIRST run:',
    '    git diff --cached --name-only',
    'confirm every path is yours, then re-issue as a path-limited commit.',
    '',
    '(--amend with no new staging is allowed and not blocked.)',
  ].join('\n');

  process.stderr.write(msg + '\n');
  process.exit(2); // 2 = block + surface stderr to the model
});
