#!/usr/bin/env node
/**
 * fresh-rules — runs automatically every time a session STARTS, RESUMES, or COMPACTS.
 *
 * WHAT IT IS, in plain terms: a small script the app runs by itself at those three moments.
 * Nobody triggers it. It refreshes the few files a session must never be stale on, then TELLS
 * the session what changed.
 *
 * THE PROBLEM IT SOLVES: each session loads its rules from ITS OWN folder, so a session obeys
 * whatever its folder last pulled. Measured 2026-07-24: one session sat 8 commits behind,
 * running a pre-slim rulebook. Nothing told it, and nothing told anyone else.
 *
 * ★ WHY PULLING IS THE HALF THAT MATTERS (Kyle asked how this differs from just telling a
 * session to reload): telling a session to re-read a STALE file hands back the stale file. The
 * reload is worthless without a current file underneath it. Pulling cannot be replaced by an
 * instruction; the instruction is the cheap second half.
 *
 * ★ WHY IT ALSO PRINTS: whether this runs BEFORE or AFTER the rules are re-read at compaction
 * is UNDOCUMENTED. Rather than bet on an ordering, its output (which IS injected into context)
 * tells the session to re-read. Correct under either ordering instead of correct if I guessed.
 *
 * ★★ THE FOUR PROTECTED THINGS (Kyle 2026-07-24 — CORRECTED; I had wrongly substituted the
 * build playbook for the issues file):
 *   1. CLAUDE.md          — the instructions. The ONLY one auto-loaded into context.
 *   2. .claude/hooks + the settings registering them — EXECUTED from disk, never in context;
 *      a stale copy means a guard silently does not fire, which is worse than no guard.
 *   3. RUNNING_ISSUES.md  — two sessions on stale copies claim the SAME next issue number.
 *   4. CLAUDE_MD_RULE_HISTORY.md — the rule narration; a rule without its origin gets argued away.
 * The build playbook is deliberately NOT here — a reference read on demand, not something a
 * session must be current on to act correctly.
 *
 * ★★ SAFETY — NEVER OVERWRITES UNCOMMITTED LOCAL WORK. A file with local edits is REPORTED and
 * LEFT ALONE. A hook that silently reverted a session's in-progress edit at compaction would
 * destroy work at the exact moment nobody is watching. (Verified by test — and then I proved
 * the point the hard way by destroying my own uncommitted copy of THIS file with a
 * `git reset --hard`. The hook protected it; I did not.)
 *
 * ★ LOGGING: every run appends one line to ~/.claude/dt-fresh-rules.jsonl. Without it, "is the
 * system working?" is unanswerable — which is the state I first shipped this in. All three
 * sessions write the same file, so it doubles as the cross-session record the monitoring
 * routine reads.
 *
 * FAIL-OPEN by construction: any error exits 0 and does nothing. It must never block a session.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

const BRANCH = 'migration/aws-supabase';
const REMOTE_REF = `origin/${BRANCH}`;
const LOG = join(homedir(), '.claude', 'dt-fresh-rules.jsonl');

const FILES = [
  ['CLAUDE.md', 'the instructions — the only one auto-loaded into context'],
  ['.claude/hooks', 'the guards themselves — a stale guard silently does not fire'],
  ['.claude/settings.local.json', 'what registers the guards'],
  ['1-system-manual/RUNNING_ISSUES.md', 'stale copies make two sessions claim the same issue number'],
  ['1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md', 'the rule narration — why each rule exists'],
];

const CWD = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const run = (args) =>
  execFileSync('git', args, { cwd: CWD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

// ⛔⛔ RAW — NO .trim(). `run` trims, and porcelain's FIRST record begins with the status
// space (` M path`), so trimming eats it and slice(3) then cuts ONE CHARACTER INTO THE PATH:
// `.claude/hooks/a b.mjs` came back as `claude/hooks/a b.mjs`. That path cannot be hashed ⇒ the
// member scores false ⇒ THE WHOLE ENTRY FREEZES. A FIFTH instance of this exact shape, and I
// wrote it myself while fixing the fourth. It surfaced only because the mangled name was PRINTED
// in the blocker line; on the residue path it would have been a silent permanent freeze.
const runRaw = (args) =>
  execFileSync('git', args, { cwd: CWD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const record = (obj) => {
  try {
    appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), clone: basename(CWD), ...obj }) + '\n');
  } catch { /* logging must never break the hook */ }
};

// The app passes context on stdin; capture the event if present, never depend on it.
let event = 'unknown';
try {
  const j = JSON.parse(readFileSync(0, 'utf8'));
  event = j.source || j.matcher || j.hook_event_name || 'unknown';
} catch { /* no stdin or not JSON — fine */ }

try {
  // Refresh the remote pointer FIRST. Without this, the comparison runs against a stale local
  // pointer and reports "current" while behind — the same false in-sync the batch-close gate
  // hit on 2026-07-24 (behind 0 before fetch, behind 3 after).
  try { run(['fetch', '--quiet', 'origin', BRANCH]); }
  catch { record({ event, result: 'fetch_failed' }); process.exit(0); }

  let behind = null;
  try { behind = parseInt(run(['rev-list', '--count', `HEAD..${REMOTE_REF}`]), 10); } catch { }

  const changed = [];
  const skippedDirty = [];
  const skippedUnpushed = [];
  const residueRefreshed = [];   // P5(b): dirty-but-ours, refreshed instead of frozen
  const indexLeaks = [];         // P2/P3: the reset did not leave the index clean

  /**
   * ★ Is the worktree content for `path` something ORIGIN ONCE HELD on that path, with nothing
   * staged? Then it is THIS HOOK'S OWN PRIOR REFRESH, not the session's work.
   *
   * ⚠️ THE FAIL DIRECTION IS DELIBERATE AND ASYMMETRIC: every uncertainty returns FALSE — "treat
   * it as the session's own edit and do not touch it".
   * ★ CORRECTED after Langston attacked it at Step-4: this read "losing a genuine local edit is
   * unrecoverable", and that OVERSTATES the risk this fence carries. He built the case — a session
   * deliberately reverting a file to an older origin version — and the edit IS overwritten and IS
   * misreported as ours. But everything that can fall through this hole is, BY CONSTRUCTION,
   * content origin's history already holds at that path: that is what makes `--find-object` hit.
   * So the misclassifiable class is recoverable from origin, and the honest claim is narrower than
   * the one I wrote. The design stands; the justification for it was inflated.
   *
   * PROVED OFFLINE before shipping (scratch origin + clone, B-CROSS-SESSION-BLEED Step 3):
   *   residue            → refreshed, index clean afterwards  (the freeze breaks)
   *   residue-check OFF  → the freeze RETURNS                 (mutation-proof: the fence can fail)
   *   genuine edit       → PRESERVED, unstaged and staged forms both
   */
  /** One FILE: did origin ever hold these exact bytes on this exact path? */
  // ⛔⛔ ONE ENUMERATOR, DEFINED ONCE, BECAUSE THE BUG WAS NEVER THE FLAG — IT WAS HAVING
  // TWO CALL SITES EACH FREE TO BE BLIND TO A DIFFERENT MEMBER CLASS. Four instances of the
  // same shape landed in this function in a row, and every one of them looked right:
  //   1. `diff --name-only` — blind to UNTRACKED members, and a new guard arriving untracked
  //      is the modal case a behind clone produces.
  //   2. `-unormal` — collapses an untracked SUBDIRECTORY to one entry, `?? .claude/hooks/lib/`.
  //   3. two spellings of one newline (a literal at one site, the NL const at the other) —
  //      same value today, and nothing stopped them drifting apart.
  //   4. QUOTED PATHS — porcelain quotes any path containing a space, and slice(3) hands the
  //      quotes straight to hash-object: could not open '".claude/hooks/a b.mjs"'.
  // Each blind spot ends in the SAME place: hash-object throws, the member scores false, and
  // the WHOLE ENTRY FREEZES with nothing able to clear it. That is the defect this batch exists
  // to fix, reproduced inside its own fix four times.
  // ★ `-z` emits the raw, unquoted path and is immune to embedded newlines, so it closes 3 and 4
  // together and retires the NL constant. One enumerator means a fifth blind spot has one place
  // to be fixed rather than two places to be fixed consistently.
  // ⚠️ HONEST LIMIT — `-z` IS NOT TOTAL: it does not cover renames. `R` arrives as two NUL
  // fields and the second carries no XY prefix, so slice(3) mangles it into a path that cannot
  // be hashed. That scores false ⇒ PRESERVE, which is the safe direction; and a staged rename
  // cannot reach isHookResidue at all, since it early-returns on anything staged. It can still
  // MISNAME in the blocker line below, which is best-effort by construction.
  function dirtyMembers(p) {
    return runRaw(['status', '--porcelain', '-uall', '-z', '--', p])
      .split(String.fromCharCode(0))
      .map((l) => l.slice(3))
      .filter(Boolean);
  }

  function blobWasAtOrigin(file) {
    try {
      const wt = run(['hash-object', '--', file]);
      if (!wt) return false;
      return Boolean(run(['log', REMOTE_REF, '--find-object', wt, '--format=%H', '-1', '--', file]));
    } catch { return false; }
  }

  function isHookResidue(p) {
    try {
      const staged = run(['diff', '--cached', '--name-only', '--', p]);
      if (staged) return false;                    // staged ⇒ the session's, never ours to clear

      // ⛔⛔ A DIRECTORY PATHSPEC CANNOT BE HASHED, AND `.claude/hooks` IS `FILES[1]`.
      // Langston's Step-4 blocker, reproduced: `git hash-object -- .claude/hooks` exits 128, the
      // throw was caught, and the directory could therefore NEVER be residue — so the entry the
      // header calls the worst one to be stale on stayed frozen while the single files un-froze.
      // ★ AND THE REWORDING MADE IT WORSE THERE: the frozen directory then wore the new sentence
      // "content ORIGIN HAS NEVER HELD … genuinely YOUR edits" about bytes THIS HOOK had written
      // one commit earlier. Narrowing a false claim to one path and stating it more confidently is
      // not a fix. So the directory gets its own arm: enumerate the modified members and require
      // EVERY ONE to be residue — one genuine edit anywhere under it preserves the whole entry.
      let isDir = false;
      try { run(['hash-object', '--', p]); } catch { isDir = true; }
      if (isDir) {
        // ⚠️ ENUMERATE WITH `status --porcelain`, NOT `diff --name-only`. My first cut used the
        // diff, which lists only TRACKED modifications — and the case a behind clone actually
        // produces is a NEW guard file arriving UNTRACKED (`??`), invisible to it. The members
        // list came back empty, the arm returned false, and the directory stayed frozen exactly
        // as before the fix. Caught in the rig, not in review: the arm was right and its
        // enumerator was blind to the commonest member.
        // ⛔ `-uall` IS LOAD-BEARING, NOT TIDINESS (Langston BLOCKER-2, third instance of this
        // shape). Default `-unormal` COLLAPSES an untracked subdirectory to one entry —
        // `?? .claude/hooks/lib/` — which is itself a directory pathspec, so `hash-object`
        // throws, the member scores false, and the whole entry freezes with nothing able to
        // clear it. That is BLOCKER-1 reproduced one level down. LATENT today (the hooks dir
        // is flat, 10 files) and it would re-arm silently the day anyone adds a `lib/`.
        const members = dirtyMembers(p);
        if (!members.length) return false;         // nothing enumerable ⇒ preserve
        return members.every(blobWasAtOrigin);
      }
      return blobWasAtOrigin(p);
    } catch { return false; }                      // unknown ⇒ preserve
  }

  for (const [path, why] of FILES) {
    let differs = '';
    try { differs = run(['diff', '--name-only', REMOTE_REF, '--', path]); } catch { continue; }
    if (!differs) continue;

    // (a) UNCOMMITTED local edits — never overwrite.
    // ★ THE THIRD ENUMERATOR, RETIRED (Langston's rider on the approval). This asked the same
    // question with different flags — `--porcelain`, no `-uall`, trimmed — and was identical to
    // dirtyMembers() only AS A TRUTHINESS TEST, and only today: an untracked subdir reports
    // `?? .claude/hooks/lib/` either way, so both are non-empty. That is "correct by coincidence",
    // which is the exact charge I level a hundred lines below at the quiet-condition. One
    // enumerator or the comment is a lie.
    let dirty = false;
    try { dirty = dirtyMembers(path).length > 0; } catch { dirty = false; }
    // ★★ B-CROSS-SESSION-BLEED P5(b) — DIRTY IS NOT THE SAME QUESTION AS "YOURS".
    //
    // THE DEFECT THIS FIXES (#753, A14): once this hook refreshed a path, that path was dirty
    // against HEAD — so EVERY LATER RUN took this branch and skipped it, forever. The worktree
    // froze at origin-tip-as-of-the-first-refresh and never advanced again. Measured: one clone
    // held a 14-day-old copy of RUNNING_ISSUES.md while origin moved 755 commits. The hook exists
    // so nobody runs stale rules, and its own refresh was what made a file permanently stale.
    // Worse, `git pull` ABORTS on a dirty worktree — so the freeze also barricades its own exit.
    //
    // THE DISCRIMINATOR: content ORIGIN ONCE HELD ON THIS PATH, with nothing staged, is OUR OWN
    // PRIOR REFRESH — not the session's work. Refresh it; do not freeze it.
    if (dirty && isHookResidue(path)) {
      residueRefreshed.push([path, why]);
      dirty = false;                    // fall through to the refresh below
    }
    if (dirty) {
      // Langston's rider: name the member that held the entry back. A session otherwise
      // sees ten guards frozen with no way to tell which file is responsible — and
      // "content ORIGIN HAS NEVER HELD" is true of ONE member and false of nine.
      let blocker = '';
      try {
        const ms = dirtyMembers(path);
        // ⛔ `ms.length > 1` SUPPRESSED THE RIDER'S OWN MODAL CASE (Langston FINDING-2, measured
        // in his rig and re-derived in mine). `git status --porcelain -- <dir>` lists only the
        // CHANGED members, so ONE edited guard among ten returns EXACTLY ONE LINE — the nine
        // clean ones are simply absent — and the name was therefore withheld in precisely the
        // situation the rider was added for. My own regression dirtied two members, which is
        // the only reason it read as green: the test agreed with the code because both made
        // the same assumption, not because the behaviour was right.
        // ★ The count was standing in for "is this entry a directory". Say THAT instead —
        // ms[0] !== path is the direct test, since a single-file entry reports its own path.
        if (ms.length > 1 || (ms[0] && ms[0] !== path)) {
          blocker = ms.find((m) => !blobWasAtOrigin(m)) || '';
        }
      } catch { /* naming is best-effort; never block the report */ }
      skippedDirty.push([path, blocker ? `${why} — held by ${blocker}` : why]);
      continue;
    }

    // (b) ★ COMMITTED-BUT-NOT-YET-PUSHED work — also never overwrite. THIS WAS MISSING IN THE
    // FIRST CUT AND THE HOOK PROVED IT BY EATING ITS OWN IMPROVEMENT (2026-07-24): I committed a
    // corrected version locally, had not pushed it, and the next run checked the path out from
    // origin and reverted my commit's content in the working tree. Nothing was LOST — the commit
    // was still in history — but "differs from origin" is NOT the same question as "is stale".
    // A local commit ahead of origin is the newest version, not an out-of-date one.
    let unpushed = '';
    try { unpushed = run(['rev-list', `${REMOTE_REF}..HEAD`, '--', path]); } catch { unpushed = ''; }
    if (unpushed) { skippedUnpushed.push([path, why]); continue; }

    // ⛔ `git checkout <ref> -- <path>` WRITES THE INDEX AS WELL AS THE WORKING TREE. That is
    // documented git behaviour, not a bug in git — but it made THIS hook silently stage every file
    // it refreshed, holding ORIGIN's content in MY index under a path I recognised as mine.
    // ⚠️ DATE CORRECTED 2026-08-31 (B-CROSS-SESSION-BLEED, Langston condition 1): this comment read
    // "MEASURED TWICE: 2026-08-09 and 2026-08-21". THE 2026-08-09 EVENT WAS NOT ONE — the stash so
    // labelled has a reflog date of 2026-08-18, and #753's instance table does not list it. The
    // retraction had been written into a review dispatch and NOT into this file, which is
    // `fix-follows-pointer`: the correction travelled to the prose and not to the instance, leaving
    // this comment arguing with the line eight below it. IDENTIFIED ONCE, 2026-08-21; fixed 18
    // minutes later. Rule 25.c is EXACTLY this shape — the path is right, so the explicit-path habit
    // that protects against the wrong FILE cannot see the wrong CONTENT — and the incident was
    // misread as another session writing into this clone. It was never that.
    // THE RESET clears the index; the refresh still lands in the working tree.
    try {
      run(['checkout', REMOTE_REF, '--', path]);
      let resetFailed = null;
      try { run(['reset', '--quiet', '--', path]); }
      catch (e) { resetFailed = e?.message ?? 'reset failed'; }

      // ★ B-CROSS-SESSION-BLEED P2/P3 — ASSERT THE POST-CONDITION; DO NOT TRUST THE COMMAND.
      // The reset used to sit in a bare `catch {}`, so a failure was swallowed and never reached the
      // run record — the instrument that would have caught the original defect could not see it.
      // A guard that cannot tell whether it worked is the shape of every instance in #753.
      // FAIL-OPEN IS PRESERVED (see the header): a leak is REPORTED, never thrown, never blocking.
      let leaked = '';
      try { leaked = run(['diff', '--cached', '--name-only', '--', path]); } catch { leaked = ''; }
      if (leaked || resetFailed) indexLeaks.push([path, resetFailed ?? 'index still staged after reset']);
      changed.push([path, why]);
    } catch { }
  }

  record({
    event,
    behind,
    refreshed: changed.map(([p]) => p),
    skipped_dirty: skippedDirty.map(([p]) => p),
    skipped_unpushed: skippedUnpushed.map(([p]) => p),
    // ★ P4 — the run record could not previously answer "did the index stay clean?", which is the
    // one question the original defect turned on. It can now, and a leak is named rather than lost.
    residue_refreshed: residueRefreshed.map(([p]) => p),
    index_leaks: indexLeaks.map(([p, why2]) => `${p}: ${why2}`),
    // Langston Step-4 FINDING-2: this keyed on the three ORIGINAL arrays while its twin six
    // lines below had been amended — I wrote the "correct by coincidence is not good enough"
    // argument and then left the identical gap here. No consumer reads it yet, which is
    // exactly why it would have rotted unnoticed.
    quiet: changed.length === 0 && skippedDirty.length === 0 && skippedUnpushed.length === 0
           && residueRefreshed.length === 0 && indexLeaks.length === 0,
  });

  // The two new arrays are included deliberately: a residue refresh also pushes to `changed`, so
  // this is correct today by coincidence rather than by construction — and a later edit that
  // separated them would silence the report without any test noticing.
  if (changed.length === 0 && skippedDirty.length === 0 && skippedUnpushed.length === 0
      && residueRefreshed.length === 0 && indexLeaks.length === 0) process.exit(0);

  let out = '[RULES FRESHNESS — this session was running an out-of-date copy]\n';
  if (changed.length) {
    out += `REFRESHED from ${REMOTE_REF} just now:\n`;
    for (const [p, why] of changed) out += `  - ${p}  (${why})\n`;
    out += '★ ACT ON THIS: the file on disk changed AFTER your rules were loaded, so what you are\n' +
           '  holding may be stale. RE-READ CLAUDE.md (and any other file listed) with the Read tool\n' +
           '  BEFORE acting on any rule this turn. Do not rely on the copy already in your context.\n';
  }
  if (skippedUnpushed.length) {
    out += 'NOT refreshed — you have LOCAL COMMITS here not yet pushed (yours is NEWER, not stale):\n';
    for (const [p, why] of skippedUnpushed) out += `  - ${p}  (${why})\n`;
    out += '  PUSH them so the other sessions get them.\n';
  }
  // ★★ B-CROSS-SESSION-BLEED P5(a) / A5 — THE WORDING WAS THE MISATTRIBUTION ENGINE.
  // This block used to assert "you have UNCOMMITTED local edits here" for EVERY skip. When the
  // content was origin's bytes left by this hook's own earlier run, that sentence told the session
  // its own tool's work was its personal edit — and 19 stashes across four clones were filed as
  // "another session's work in my tree" on the strength of it. The batch's own name came from this
  // sentence. Residue is now refreshed (above) rather than described, and what remains here is only
  // content origin never held — genuinely the session's.
  if (residueRefreshed.length) {
    out += 'REFRESHED (these looked modified, but the content was MINE — this hook left it on an earlier run,\n' +
           'not you, and not another session; it is now advanced to origin):\n';
    for (const [p, why] of residueRefreshed) out += `  - ${p}  (${why})\n`;
  }
  if (skippedDirty.length) {
    out += 'NOT refreshed — these hold content ORIGIN HAS NEVER HELD, so they are genuinely YOUR edits\n' +
           'and were left untouched:\n';
    for (const [p, why] of skippedDirty) out += `  - ${p}  (${why})\n`;
    out += '  Commit and push them; until then this session is intentionally diverged from the branch.\n';
  }
  if (indexLeaks.length) {
    out += '⚠️ INDEX NOT CLEAN after refresh — report this, do NOT commit these paths:\n';
    for (const l of indexLeaks) out += `  - ${l}\n`;
  }
  process.stdout.write(out);
  process.exit(0);
} catch {
  record({ event, result: 'error' });
  process.exit(0);
}
