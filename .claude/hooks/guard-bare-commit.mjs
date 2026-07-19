#!/usr/bin/env node
/**
 * guard-bare-commit — PreToolUse guard against the SHARED-INDEX SWEEP.
 *
 * WHY THIS EXISTS (2026-07-19, three sweeps in one session, BOTH directions):
 * Two CC sessions edit ONE working tree, so they share ONE git index. A bare
 * `git commit -m ...` commits EVERYTHING STAGED — including paths the *other*
 * session staged.
 *   • CC-A swept CC-B's dynamic-slots.ts deletion → red CI
 *   • CC-A swept CC-B's entire 9-path P19-B8.12 set into d090178d6, including an
 *     active-filter-pool.ts change Langston's conditional GO was HOLDING —
 *     18 real content lines buried in ~1,478 lines of CRLF churn, pushed unreviewed
 *   • CC-B then swept CC-A's 2 staged paths into 5f291a17e — the mirror image,
 *     which is what proved the hazard is BILATERAL and needed a project-level
 *     control rather than one session's personal discipline.
 * After the first, "run a staged-set check before every shared-tree commit" was
 * adopted as a practice. It was applied to some commits and skipped on the one
 * that mattered. A practice you have to remember is not a control; this is.
 *
 * THE CONTRACT (RUNNING_ISSUES #540 as amended 2026-07-19, Langston-ruled):
 * three tiers, each with its OWN attestation. Tier 1 routine = explicit paths,
 * no token. Tier 2 mount segfault (#542) = staged-set check, then the token.
 * Tier 3 index corruption = stale-lock protocol, then the token. The token name
 * is TIER-NEUTRAL: it asserts only "the applicable tier protocol was run"; WHICH
 * protocol is named in the mandatory in-channel statement that accompanies every
 * token use. A Tier-3 action stated as Tier-2 is a false attestation.
 *
 * FAIL-OPEN by design: anything it cannot parse is allowed through. It must never
 * be the reason a session cannot work. ⚠️ CONSEQUENCE, stated as a property and
 * not a defect: a green test run is only as trustworthy as its payloads are
 * well-formed. On 2026-07-19 a test harness emitted invalid JSON escapes and a
 * LIVE block read as DEAD. Validate harness payload JSON before trusting a result.
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

  // --- the attestation token (tier-neutral; see contract note above) -----------
  // Retired name CC_INDEX_VERIFIED is deliberately NOT accepted — it must fail
  // closed rather than linger as an undocumented second door.
  const attested = /\bCC_COMMIT_ATTESTED=1\b/.test(cmd);

  // --- shapes ------------------------------------------------------------------
  const isGitCommit = /\bgit\s+commit\b/.test(cmd) && !/\bgit\s+commit-tree\b/.test(cmd);
  const isPathLimited = isGitCommit && /\bgit\s+commit\b[^\n]*\s--\s+\S/.test(cmd);
  const isAmend = isGitCommit && /\bgit\s+commit\b[^\n]*--amend/.test(cmd);
  const isCommitAll = isGitCommit && /\bgit\s+commit\b[^\n]*\s-[a-zA-Z]*a/.test(cmd);

  // Branch-moving plumbing: bypasses the porcelain entirely, so it is invisible
  // to the commit check. Measured pre-guard: `update-ref` walked straight past;
  // `commit-tree` tripped only by a hyphen-as-word-boundary ACCIDENT never aimed.
  const isCommitTree = /\bgit\s+commit-tree\b/.test(cmd);
  const isRefWrite = /\bgit\s+update-ref\b[^\n]*\b(HEAD|refs\/heads\/)/.test(cmd);

  // ⚠️ THE NEAR-MISS PAIR (#540 requires BOTH tested — fires on one, not the other):
  //   BLOCKED  `rm .git/index.lock`  — deleting another session's LIVE lock is how
  //            the 2026-07-19 index corruption started. Token-gated: legitimate
  //            only after the Tier-3 stale-lock protocol (reported-blocking + no
  //            live git process + mtime frozen across a ≥60s recheck).
  //   ALLOWED  `rm .git/index`       — the REPAIR rebuild-from-HEAD path. Never
  //            blocked. The match requires the literal `.lock` suffix precisely so
  //            it cannot over-reach onto the repair verb.
  const isLockRemoval = /\brm\b[^\n]*\.git\/index\.lock/.test(cmd);

  // Nothing dangerous → allow (this is where the whole repair set lands untouched:
  // git reset, rm .git/index, read-tree, checkout, fsck, write-tree, status/log/diff).
  const dangerous = isCommitAll || isCommitTree || isRefWrite || isLockRemoval ||
                    (isGitCommit && !isPathLimited && !isAmend);
  if (!dangerous) process.exit(0);

  // --- `git commit -a` — NO sanctioned escape, by construction -----------------
  // The token cannot rescue it, and the reason is not "-a is risky": `-a` stages
  // tracked modifications AT COMMIT TIME, i.e. AFTER the `git diff --cached` the
  // token attests you ran. A token on `-a` is therefore a signed statement about
  // an index that `-a` then changes underneath it — strictly WORSE than no token,
  // because it launders an unreviewed sweep as an audited one.
  // (Langston Step-4 CHANGES-NEEDED: CC-A's first cut short-circuited the token
  // above this test, so `CC_COMMIT_ATTESTED=1 git commit -am x` was ALLOWED.)
  if (isCommitAll) {
    process.stderr.write([
      'BLOCKED — `git commit -a` in a SHARED working tree. No token escape exists.',
      '',
      '`-a` stages every tracked modification AT COMMIT TIME — including the other',
      'session\'s in-flight work — and it does so AFTER any staged-set check you ran.',
      'That is why CC_COMMIT_ATTESTED cannot open it: the attestation would describe',
      'an index the command then changes underneath it.',
      '',
      'FIX — stage what you mean, then name it:',
      '    git add <paths> && git commit -m "..." -- <paths>',
    ].join('\n') + '\n');
    process.exit(2);
  }

  // --- everything else below is token-openable (Tier 2 / Tier 3) ---------------
  if (attested) process.exit(0);

  const what = isLockRemoval
    ? 'REMOVING `.git/index.lock`'
    : isCommitTree ? '`git commit-tree`'
    : isRefWrite ? '`git update-ref` on HEAD/refs/heads'
    : 'a BARE `git commit`';

  const why = isLockRemoval
    ? [
        'Deleting a lock that belongs to the OTHER session\'s live operation is how the',
        '2026-07-19 index corruption started. `rm .git/index` (repair rebuild) is NOT',
        'blocked — only the `.lock`.',
      ]
    : (isCommitTree || isRefWrite)
    ? [
        'This moves the branch WITHOUT going through `git commit`, so the whole index',
        'ships with no path scoping. Prose alone could not stop it: measured, `update-ref`',
        'walked straight past this guard and `commit-tree` tripped it only by accident.',
      ]
    : [
        'It commits EVERYTHING staged, including paths the OTHER session staged. That is',
        'how d090178d6 swept CC-B\'s 9-path set and pushed a change Langston was holding —',
        '18 real lines hidden inside ~1,478 lines of CRLF churn, shipped unreviewed.',
      ];

  process.stderr.write([
    `BLOCKED — ${what} in a SHARED working tree (#540 shared-tree commit discipline).`,
    '',
    ...why,
    '',
    'TIER 1 — routine, preferred, no token:',
    '    git commit -F <msg> -- <paths>',
    '',
    'TIER 2 — the Tier-1 form segfaulted on the mount (#542):',
    '    git diff --cached --name-only     <- read it; EVERY path must be yours',
    '    CC_COMMIT_ATTESTED=1 git commit -F <msg>',
    '',
    'TIER 3 — index corruption / repair (the index check is impossible, so the token',
    'attests the STALE-LOCK PROTOCOL instead: reported-blocking + no live git process',
    '+ mtime frozen across a >=60s recheck):',
    '    CC_COMMIT_ATTESTED=1 <command>',
    '',
    'NEVER BLOCKED — the repair set stays open so the guard can never trap you:',
    '    git reset · rm .git/index · git read-tree · git checkout · git fsck · git write-tree',
    '',
    '⚠️ EVERY token use REQUIRES an in-channel statement NAMING THE TIER whose protocol',
    'you ran. The token asserts only "the applicable protocol was run" — WHICH one is',
    'your statement, and a Tier-3 action stated as Tier-2 is a false attestation.',
    'Do not type the token to make this message go away: that is the inattention this',
    'guard exists to catch, and it caused all three sweeps.',
  ].join('\n') + '\n');
  process.exit(2);
});
