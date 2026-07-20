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
 *     active-filter-pool.ts change Langston's conditional GO was HOLDING
 *   • CC-B then swept CC-A's 2 staged paths into 5f291a17e — the mirror image,
 *     proving the hazard is BILATERAL and needed a project-level control rather
 *     than one session's personal discipline.
 * A practice you have to remember is not a control; this is.
 *
 * THE CONTRACT (RUNNING_ISSUES #540 as amended 2026-07-19, Langston-ruled):
 * three tiers, each with its OWN attestation. Tier 1 routine = explicit paths.
 * Tier 2 mount segfault (#542) = staged-set check, then the token. Tier 3 index
 * corruption = stale-lock protocol, then the token. The token is TIER-NEUTRAL:
 * it asserts only "the applicable tier protocol was run"; WHICH protocol is named
 * in the mandatory in-channel statement. A Tier-3 action stated as Tier-2 is a
 * false attestation.
 *
 * ★ COMMAND-POSITION AWARENESS (2026-07-19 fix, Langston-ruled — #540 numbered fix)
 * The first cut substring-matched the WHOLE command string, so it fired on any
 * command that merely CONTAINED the phrase — and it blocked a `cc-send` Discord
 * message whose BODY quoted the protocol. i.e. it blocked the message ABOUT the
 * guard. Langston's ruling: that is not a regex to tighten, it is the WRONG SHAPE
 * of check — substring matching can never distinguish an EXECUTION from a MENTION.
 * So we now PARSE: split on unquoted shell separators, skip leading VAR=val
 * assignments, and fire only when `git` is the actual EXECUTABLE and `commit` its
 * SUBCOMMAND. A phrase inside a quoted argument is DATA, not a command.
 * WHY IT MATTERED MORE THAN COSMETICS (Langston): a control whose false positives
 * land on the people DOCUMENTING the control selects against its own upkeep.
 *
 * ⚠️ HONEST LIMIT, deliberately not fixed (Langston): this does NOT inspect inside
 * `bash -c '…'` or a heredoc — and it SHOULD NOT. A `git commit` string being
 * written into a message or a file is not an execution. Guarding nested shell is a
 * separate and much harder scope decision, not this fix.
 *
 * FAIL-OPEN by design: anything it cannot parse is allowed through. ⚠️ CONSEQUENCE,
 * stated as a property: a green test run is only as trustworthy as its payloads are
 * well-formed — on 2026-07-19 a harness emitted invalid JSON and a LIVE block read
 * as DEAD. Validate harness payloads before trusting a result.
 */

/**
 * Strip HEREDOC BODIES before parsing.
 *
 * ★ WHY (2026-07-20 — this file's header ALREADY CLAIMED this and the code did not do it):
 * the header says "it does NOT inspect inside `bash -c` or a heredoc — and it SHOULD NOT.
 * A `git commit` string being written into a message or a file is not an execution."
 * That was TRUE of quoted arguments and FALSE of heredocs: splitSegments breaks on
 * NEWLINES and `;`, so every prose line inside a heredoc was parsed as if it were a
 * command. A documentation line reading "… ; <the verb> -m x passes unattested" became a
 * segment, was read as a real invocation, and BLOCKED.
 *
 * ⚠️ THAT IS EXACTLY HOW IT BIT: the guard blocked the very message written to report
 * that the guard blocks messages — and the author had to re-word around the phrase to
 * describe the bug. A stated limit that the code does not honour is the same disease this
 * whole batch is about: a claim that does not match behaviour.
 *
 * Heredoc bodies are DATA being written to a file, never execution. Skipping them makes
 * the header's promise true instead of aspirational.
 */
function stripHeredocs(cmd) {
  // SINGLE FORWARD PASS - NO RESTART, PLUS A HARD BOUND.
  // The first cut stripped the heredoc BODY but left the marker in place and reset
  // lastIndex, so the same marker matched forever: AN INFINITE LOOP INSIDE A
  // PreToolUse HOOK, i.e. a total work stoppage for every session. Caught by an
  // 8s timeout probe, not by review. A hook is on the critical path of EVERY
  // command, so this function must be provably terminating: `rest` strictly
  // shrinks each iteration and the counter is an independent backstop.
  const re = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;
  const NL = String.fromCharCode(10);
  let out = '', rest = cmd, guard = 0;
  while (guard++ < 50) {
    const m = re.exec(rest);
    if (!m) { out += rest; break; }
    const nl = rest.indexOf(NL, m.index);
    if (nl === -1) { out += rest; break; }
    out += rest.slice(0, nl + 1);
    const after = rest.slice(nl + 1);
    const endM = new RegExp('^[ \t]*' + m[2] + '[ \t]*$', 'm').exec(after);
    rest = endM ? after.slice(endM.index + endM[0].length) : '';
  }
  return out;
}


/** Split a command line into segments at UNQUOTED shell separators. */
function splitSegments(cmd) {
  const segs = [];
  let cur = '', q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      cur += c;
      if (c === q && cmd[i - 1] !== '\\') q = null;
      continue;
    }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    // Separators: ; && || | and newline. ONLY these.
    //
    // ★ BACKTICK / $( / ) ARE DELIBERATELY *NOT* SEPARATORS (2026-07-19, found by
    //   CC-B probing this fix, reproduced narrower here). Treating them as a new
    //   command context is correct for a real shell string — but a MARKDOWN CODE
    //   SPAN uses the same character, and an UNQUOTED HEREDOC BODY is where we write
    //   nearly all governance text and Discord messages. With backtick-as-separator,
    //       cat > f <<EOF
    //       see `git commit -m x`
    //       EOF
    //   parsed the DOCUMENTATION as an execution and BLOCKED it. The #540 amendment
    //   text itself wraps its commands in backticks, so the guard blocked writing its
    //   own rulebook — the precise "control that obstructs the people documenting it"
    //   defect this whole fix exists to remove.
    //
    //   It also CONTRADICTED THIS FILE'S OWN STATED LIMIT: the header says the guard
    //   does not inspect heredocs and should not. The backtick rule silently did.
    //
    //   TRADE, stated rather than hidden: we lose detection of a commit inside command
    //   substitution — `$(git commit …)`. That is an acceptable and deliberate loss.
    //   This guard catches a bare commit typed by HABIT; nobody sweeps a shared index
    //   by accident from inside a subshell. Intent-level evasion was always out of
    //   scope (so are `git -C`, aliases, and eval — see the header).
    //   NOTE (verified, not assumed): a backtick inside a QUOTED argument was already
    //   safe — the quote branch above consumes it — so this only ever mis-fired on
    //   UNQUOTED prose, i.e. heredoc bodies.
    if (c === ';' || c === '\n') { segs.push(cur); cur = ''; continue; }
    if (c === '&' && cmd[i + 1] === '&') { segs.push(cur); cur = ''; i++; continue; }
    if (c === '|' ) { if (cmd[i + 1] === '|') i++; segs.push(cur); cur = ''; continue; }
    cur += c;
  }
  segs.push(cur);
  return segs;
}

/** Tokenise a segment, dropping surrounding quotes; a token that WAS quoted is marked. */
function tokenise(seg) {
  const out = [];
  let cur = '', q = null, quoted = false;
  const push = () => { if (cur !== '') { out.push({ v: cur, quoted }); cur = ''; quoted = false; } };
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (q) {
      if (c === q && seg[i - 1] !== '\\') { q = null; continue; }
      cur += c; continue;
    }
    if (c === '"' || c === "'") { q = c; quoted = true; continue; }
    if (/\s/.test(c)) { push(); continue; }
    cur += c;
  }
  push();
  return out;
}

/** The invoked binary + subcommand of a segment, ignoring leading VAR=val assignments. */
function invocation(seg) {
  const toks = tokenise(seg);
  let i = 0;
  const env = [];
  while (i < toks.length && !toks[i].quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i].v)) {
    env.push(toks[i].v); i++;
  }
  if (i >= toks.length) return null;
  const exeTok = toks[i];
  if (exeTok.quoted) return null;            // a quoted first token is data, not a command we parse
  const base = exeTok.v.replace(/\\/g, '/').split('/').pop().replace(/\.exe$/i, '');
  const args = toks.slice(i + 1);
  return { env, exe: base, sub: args[0] && !args[0].quoted ? args[0].v : null, args, raw: seg };
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); } // unparseable → allow

  const tool = payload?.tool_name ?? payload?.toolName;
  if (tool !== 'Bash') process.exit(0);

  const cmd = String(payload?.tool_input?.command ?? payload?.toolInput?.command ?? '');
  if (!cmd) process.exit(0);

  // ★ THE TOKEN IS BOUND TO ITS OWN SEGMENT — it is an env assignment PREFIXING the
  //   guarded invocation, never a flag set once for the whole line.
  //   FOUND BY PROBING THIS FILE'S OWN FIX (2026-07-19): a whole-string token test
  //   let the token LEAK ACROSS SEGMENTS, so
  //       export CC_COMMIT_ATTESTED=1 ; git commit -m x
  //       echo CC_COMMIT_ATTESTED=1 && git commit -m x
  //       CC_COMMIT_ATTESTED=1 npm test && git commit -m x
  //   ALL silently passed an unattested bare commit. That is a FALSE NEGATIVE —
  //   strictly worse than the false positive it replaced, because a false positive
  //   annoys you loudly while this disables the control silently, and it can be
  //   tripped by an ordinary earlier command with no intent to bypass anything.
  //   Retired name CC_INDEX_VERIFIED is deliberately NOT accepted (fails closed).
  const isToken = (e) => e === 'CC_COMMIT_ATTESTED=1';

  // ★ SCAN EVERY SEGMENT — do NOT stop at the first hit. An ATTESTED invocation does
  //   not vouch for a LATER one: `CC_COMMIT_ATTESTED=1 git commit -F m && git commit -m y`
  //   must block on the SECOND commit, which carries no attestation of its own.
  //   (Breaking on the first hit let exactly that through — caught by probing this
  //   file's own fix, one case after the segment-leak fix.) Attestation is per
  //   INVOCATION, so we keep scanning and block on the first UNATTESTED hit.
  let hit = null;
  for (const seg of splitSegments(stripHeredocs(cmd))) {
    const inv = invocation(seg);
    if (!inv) continue;
    const attested = inv.env.some(isToken); // THIS segment's own prefix only

    if (inv.exe === 'git') {
      const sub = inv.sub;
      if (sub === 'commit') {
        const flat = inv.args.map((a) => a.v);
        const isPathLimited = flat.includes('--');
        const isAmend = flat.includes('--amend');
        // `-a` in any short-flag cluster, or --all
        const isCommitAll = flat.some((a) => /^-[a-zA-Z]*a[a-zA-Z]*$/.test(a)) || flat.includes('--all');
        if (isCommitAll) { hit = { kind: 'commit-all', attested }; break; } // -a: no escape, stop now
        if (!isPathLimited && !isAmend && !attested) { hit = { kind: 'bare-commit', attested }; break; }
      } else if (sub === 'commit-tree') {
        if (!attested) { hit = { kind: 'commit-tree', attested }; break; }
      } else if (sub === 'update-ref') {
        if (inv.args.some((a) => /^(HEAD|refs\/heads\/)/.test(a.v)) && !attested) { hit = { kind: 'update-ref', attested }; break; }
      }
    } else if (inv.exe === 'rm') {
      if (inv.args.some((a) => /\.git\/index\.lock$/.test(a.v)) && !attested) { hit = { kind: 'lock-removal', attested }; break; }
    }
  }

  if (!hit) process.exit(0);

  // `git commit -a` — NO sanctioned escape, by construction. `-a` stages tracked
  // modifications AT COMMIT TIME, i.e. AFTER the staged-set check the token attests,
  // so a token on `-a` is a signed statement about an index the command then changes
  // underneath it — laundering an unreviewed sweep as an audited one.
  if (hit.kind === 'commit-all') {
    process.stderr.write([
      'BLOCKED — `git commit -a` in a SHARED working tree. No token escape exists.',
      '',
      '`-a` stages every tracked modification AT COMMIT TIME — including the other',
      "session's in-flight work — and does so AFTER any staged-set check you ran.",
      'A token here would describe an index the command then changes underneath it.',
      '',
      'FIX — stage what you mean, then name it:',
      '    git add <paths> && git commit -m "..." -- <paths>',
    ].join('\n') + '\n');
    process.exit(2);
  }

  if (hit.attested) process.exit(0);

  const what = {
    'lock-removal': 'REMOVING `.git/index.lock`',
    'commit-tree': '`git commit-tree`',
    'update-ref': '`git update-ref` on HEAD/refs/heads',
    'bare-commit': 'a BARE `git commit`',
  }[hit.kind];

  const why = {
    'lock-removal': [
      "Deleting a lock belonging to the OTHER session's live operation is how the",
      '2026-07-19 index corruption started. `rm .git/index` (repair rebuild) is NOT',
      'blocked — only the `.lock`.',
    ],
    'commit-tree': [
      'This moves the branch WITHOUT going through `git commit`, so the whole index',
      'ships with no path scoping and no attestation.',
    ],
    'update-ref': [
      'This moves the branch directly, so the whole index ships with no path scoping.',
    ],
    'bare-commit': [
      'It commits EVERYTHING staged, including paths the OTHER session staged — how',
      "d090178d6 swept CC-B's 9-path set and shipped a held change unreviewed.",
    ],
  }[hit.kind];

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
    'you ran. Do not type the token to make this message go away — that is the',
    'inattention this guard exists to catch, and it caused all three sweeps.',
  ].join('\n') + '\n');
  process.exit(2);
});
