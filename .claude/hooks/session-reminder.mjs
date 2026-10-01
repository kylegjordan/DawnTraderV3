#!/usr/bin/env node
// SessionStart hook (Kyle directive 2026-07-13): the "constantly reminded" layer that pairs with the
// PreToolUse governed-read BLOCK. Fires on startup|resume|compact so the reminder survives context
// compaction (which wipes in-conversation state but reloads hooks). Its stdout is injected as context.
process.stdout.write(
  '[SESSION REMINDER — survives compaction]\n' +
  '1. GOVERNED-READ RULE (also ENFORCED by the PreToolUse guard, which will BLOCK the command):\n' +
  '   NEVER suppress stderr (2>/dev/null) on a git object read (git show|cat-file|ls-tree). Read at\n' +
  '   the ACTUAL path/ref (governance files live under 1-system-manual/; the checker grades at\n' +
  '   origin/migration/aws-supabase). An asserted ABSENCE needs presence-evidence — never infer\n' +
  '   "absent" from an empty or failed read. A failed read must produce a REFUSAL, not a recollection.\n' +
  '2. WAKE WATCHER: if no WAKE events have arrived recently AND a compaction/resume just happened,\n' +
  '   re-arm the watcher per MEMORY 4.5 - a background task, NOT a Monitor (judge liveness by its file\n' +
  '   ~/.claude/cc-wake-state/<ALIAS>.json.alive). STALE IS NOT PROOF OF DEAD: before arming run\n' +
  '   `bash ~/.claude/cc-wake-count.sh <ALIAS>` - 0 = re-arm; 1 = one is running, do NOT arm;\n' +
  '   2+ = TaskStop extras (two watchers deliver every wake twice).\n'
);
process.exit(0);
