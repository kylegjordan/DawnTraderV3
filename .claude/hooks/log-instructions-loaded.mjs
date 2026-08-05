#!/usr/bin/env node
// B-RULES-1a OBJ-1 — instructions-load observability (CC side).
// Langston's condition: "you do not restructure what loads until you can OBSERVE what loads."
// On every SessionStart (startup|resume|compact) this appends ONE JSONL row to
// ~/.claude/instructions-loaded.jsonl. Byte totals are OBJ-5's baseline instrument
// (BYTES, not lines). Contract shared with the Langston-side logger (r2, his four fixes):
//  - every file entry carries its POPULATION (rule 29(a): object AND denominator);
//  - a MEMORY-DIRECTORY CENSUS rides along so drift in non-loaded files is visible;
//  - the row carries `measures` so no future reader can gloss candidate-set stats as load proof.
// FAIL-OPEN: any error -> exit 0, no output. This hook must never block a session.
import { statSync, appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

try {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* no stdin is fine */ }

  const cwd = input.cwd || process.cwd();
  const folder = basename(cwd);
  const alias =
    folder === 'DawnTraderV3-old' ? 'CC-A' :
    folder === 'DawnTraderV3-new' ? 'CC-B' :
    folder === 'DawnTraderV3-analyst' ? 'CC-C' : 'UNKNOWN';
  const memName = { 'CC-A': 'MEMORY_CC_A.md', 'CC-B': 'MEMORY_CC_B.md', 'CC-C': 'MEMORY_CC_C.md' }[alias];
  const slug = 'C--' + folder.replace(/\\/g, '-');
  const memDir = join(homedir(), '.claude', 'projects', slug, 'memory');

  // The candidate loaded set. `population` names exactly what the byte figure denominates.
  const candidates = [
    { path: join(cwd, 'CLAUDE.md'), why: 'harness auto-load (project rules)', population: 'single file, repo-root CLAUDE.md' },
    { path: join(memDir, 'MEMORY.md'), why: 'harness auto-load (shared auto-memory)', population: 'single file, shared MEMORY.md (NOT the memory directory)' },
    memName ? { path: join(memDir, memName), why: 'load-own-memory.mjs SessionStart hook', population: `single file, ${memName} only` } : null,
  ].filter(Boolean);

  const files = candidates.map((c) => {
    try {
      const st = statSync(c.path);
      return { ...c, exists: true, bytes: st.size, mtime: st.mtime.toISOString() };
    } catch {
      return { ...c, exists: false, bytes: 0, mtime: null };
    }
  });

  // Directory census: everything PRESENT in the memory dir, loaded or not (drift visibility).
  let memCensus = { dir: memDir, file_count: 0, bytes: 0, files: [] };
  try {
    for (const name of readdirSync(memDir)) {
      try {
        const st = statSync(join(memDir, name));
        if (st.isFile()) {
          memCensus.file_count += 1;
          memCensus.bytes += st.size;
          memCensus.files.push({ name, bytes: st.size });
        }
      } catch { /* per-file fail-open */ }
    }
  } catch { memCensus = { dir: memDir, file_count: 0, bytes: 0, files: [], error: 'unreadable' }; }

  const row = {
    ts: new Date().toISOString(),
    side: 'cc',
    alias,
    event: input.hook_event_name || 'SessionStart',
    source: input.source || null, // startup | resume | compact
    session_id: input.session_id || null,
    measures: 'candidate set — path existence + size at invoke time; NOT proof the harness loaded them (load proof = sentinel method)',
    context_bytes_total: files.filter((f) => f.exists).reduce((a, f) => a + f.bytes, 0),
    files,
    memory_dir_census: memCensus,
  };

  appendFileSync(join(homedir(), '.claude', 'instructions-loaded.jsonl'), JSON.stringify(row) + '\n');
} catch { /* fail-open */ }
process.exit(0);
