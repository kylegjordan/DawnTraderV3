#!/usr/bin/env node
// B-RULES-1a OBJ-1 — instructions-load observability (CC side). r2: B-RULES-1b carries
// (Langston Step-4 on the B-RULES-1a close, both REQUIRED before anything builds on the
// baseline): (1) the memory dir is derived the way the sibling load-own-memory.mjs does —
// CLAUDE_PROJECT_DIR for identity + the hook's stdin transcript_path for the live truth
// dir (the authoritative source), refuse-to-guess on an unmapped clone — replacing the
// basename+drive-root reconstruction, which was a second, weaker derivation of the same
// path; (2) a top-level `degraded: true` is stamped when ANY candidate is missing or the
// census is unreadable, so a broken assumption can never silently shrink
// `context_bytes_total` (the number the slimming programme is baselined on) — that would
// be absent-as-valid INSIDE the instrument built to catch that class.
//
// On every SessionStart (startup|resume|compact) this appends ONE JSONL row to
// ~/.claude/instructions-loaded.jsonl. Byte totals are OBJ-5's baseline (BYTES, not
// lines). Contract shared with the Langston-side logger: absolute paths as identity,
// `population` per entry (rule 29(a)), a memory-directory census for drift visibility,
// and `measures` so no reader can gloss candidate-set stats as load proof.
// FAIL-OPEN: any error -> exit 0, no output. This hook must never block a session.
import { statSync, appendFileSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';

// B-RULES-1b carry (2): rotation parity with the Langston-side logrotate. Windows has no
// logrotate, so the hook self-rotates: when the JSONL exceeds ROTATE_BYTES it is renamed
// to .1 (one generation kept, prior .1 replaced) before the append. Bounded disk by
// construction; a compact-heavy day cannot grow it without limit. Fail-open like all else.
const ROTATE_BYTES = 5 * 1024 * 1024;
function rotateIfNeeded(logPath) {
  try {
    if (statSync(logPath).size > ROTATE_BYTES) {
      const prev = logPath + '.1';
      try { rmSync(prev, { force: true }); } catch { /* ignore */ }
      renameSync(logPath, prev);
    }
  } catch { /* absent file or race — append will create it */ }
}

// Same mapping as load-own-memory.mjs — identity comes from CLAUDE_PROJECT_DIR, never guessed.
const CLONE_TO_SESSION = {
  'DawnTraderV3-old':     { alias: 'CC-A', file: 'MEMORY_CC_A.md' },
  'DawnTraderV3-new':     { alias: 'CC-B', file: 'MEMORY_CC_B.md' },
  'DawnTraderV3-analyst': { alias: 'CC-C', file: 'MEMORY_CC_C.md' },
};

try {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* no stdin is fine */ }

  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const session = CLONE_TO_SESSION[basename(projectDir)];
  const alias = session ? session.alias : 'UNMAPPED';

  // Memory dir: the transcript_path's dirname IS the live project dir (the sibling's
  // authoritative derivation). Fallback: the harness slug reconstruction, marked as such.
  let memDir = null;
  let memDirSource = null;
  if (typeof input.transcript_path === 'string' && input.transcript_path) {
    memDir = join(dirname(input.transcript_path), 'memory');
    memDirSource = 'transcript_path (authoritative)';
  } else {
    memDir = join(homedir(), '.claude', 'projects', 'C--' + basename(projectDir), 'memory');
    memDirSource = 'slug reconstruction (fallback — transcript_path absent)';
  }

  const candidates = [
    { path: join(projectDir, 'CLAUDE.md'), why: 'harness auto-load (project rules)', population: 'single file, repo-root CLAUDE.md' },
    { path: join(memDir, 'MEMORY.md'), why: 'harness auto-load (shared auto-memory)', population: 'single file, shared MEMORY.md (NOT the memory directory)' },
    session ? { path: join(memDir, session.file), why: 'load-own-memory.mjs SessionStart hook', population: `single file, ${session.file} only` } : null,
  ].filter(Boolean);

  const files = candidates.map((c) => {
    try {
      const st = statSync(c.path);
      return { ...c, exists: true, bytes: st.size, mtime: st.mtime.toISOString() };
    } catch {
      return { ...c, exists: false, bytes: 0, mtime: null };
    }
  });

  let memCensus = { dir: memDir, file_count: 0, bytes: 0, files: [] };
  let censusReadable = true;
  try {
    for (const name of readdirSync(memDir)) {
      try {
        const st = statSync(join(memDir, name));
        if (st.isFile()) {
          memCensus.file_count += 1;
          memCensus.bytes += st.size;
          memCensus.files.push({ path: join(memDir, name), bytes: st.size });
        }
      } catch { /* per-file fail-open */ }
    }
  } catch { memCensus.error = 'unreadable'; censusReadable = false; }

  // B-RULES-1b carry (1): a missing candidate or unreadable census means the totals
  // UNDER-READ — stamp it at the top level so no reader can miss it.
  const degraded = !session || files.some((f) => !f.exists) || !censusReadable;

  const row = {
    ts: new Date().toISOString(),
    side: 'cc',
    alias,
    event: input.hook_event_name || 'SessionStart',
    source: input.source || null, // startup | resume | compact
    session_id: input.session_id || null,
    degraded,
    mem_dir_source: memDirSource,
    measures: 'candidate set — path existence + size at invoke time; NOT proof the harness loaded them (load proof = sentinel method)',
    context_bytes_total: files.filter((f) => f.exists).reduce((a, f) => a + f.bytes, 0),
    files,
    memory_dir_census: memCensus,
  };

  const logPath = join(homedir(), '.claude', 'instructions-loaded.jsonl');
  rotateIfNeeded(logPath);
  appendFileSync(logPath, JSON.stringify(row) + '\n');
} catch { /* fail-open */ }
process.exit(0);
