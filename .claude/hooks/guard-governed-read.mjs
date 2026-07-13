#!/usr/bin/env node
// PreToolUse guard (Kyle directive 2026-07-13): BLOCK the recurring false-absence mistake at the
// point of action. The pattern: a git OBJECT/REF read (`git show|cat-file|ls-tree`) whose stderr is
// suppressed (`2>/dev/null`) — so a WRONG PATH or BAD REF returns EMPTY and gets read as "absent".
// That exact command shape produced the 2026-07-10 and 2026-07-13 false-absence errors (asserting
// "no GOVERNANCE_EXCEPTIONS entries" / "no scope at origin" from an empty result of a bad read).
//
// Fail-OPEN by construction: any parse/read problem here exits 0 (allow) so this guard can NEVER
// break a session — it only ever blocks the one precise dangerous shape. Exit 2 = block; the stderr
// message is fed back to the model.
import { readFileSync } from 'node:fs';

let cmd = '';
try {
  const raw = readFileSync(0, 'utf8');           // stdin: the PreToolUse payload
  cmd = ((JSON.parse(raw).tool_input) || {}).command || '';
} catch {
  process.exit(0);                                // can't inspect -> never block
}

// Only the git object/content reads where "empty" is silently read as file/ref CONTENT.
const isGovernedRead = /\bgit\s+(?:-C\s+\S+\s+)?(?:show|cat-file|ls-tree)\b/.test(cmd);
// stderr suppressed in any of its forms (POSIX + Windows).
const suppressesStderr = /2>\s*(?:\/dev\/null|nul|NUL)\b|2>&-/.test(cmd);

if (isGovernedRead && suppressesStderr) {
  process.stderr.write(
    'BLOCKED — governed-read guard (your recurring false-absence mistake).\n' +
    'This command reads a git object/ref (show|cat-file|ls-tree) AND suppresses stderr (2>/dev/null).\n' +
    'A wrong PATH or bad REF then returns EMPTY, and empty gets read as "absent" — exactly the error\n' +
    'that produced the false "no exceptions entries / no scope at origin" claims.\n' +
    'FIX: remove the stderr suppression so a failed read FAILS LOUD, and read at the ACTUAL path/ref\n' +
    '(the file lives at 1-system-manual/, and the checker grades at origin/migration/aws-supabase).\n' +
    'An asserted ABSENCE needs presence-evidence — do not infer it from a silenced read.\n'
  );
  process.exit(2);
}
process.exit(0);
