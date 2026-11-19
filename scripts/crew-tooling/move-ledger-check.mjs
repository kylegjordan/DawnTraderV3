#!/usr/bin/env node
// B-TOKEN-ECONOMY P5 / OBJ-5 (PM Claude, 2026-11-19) — prove that every passage moved out of CLAUDE.md
// arrived at its destination unchanged, exactly once, and is gone from CLAUDE.md.
//
// The ledger (`Claude Comms and Packages/Change Lists/B_TOKEN_ECONOMY_MOVE_LEDGER.json`) lists each move:
// id, origin heading, destination path, sha256 of the passage (LF line endings), and the pointer left behind.
// Each destination holds the passage between `<!-- P5-MOVED id=X -->` + a `### X — …` title line, and
// `<!-- /P5-MOVED id=X -->`.
//
// Checks per move (all must hold):
//   1. the destination holds exactly ONE block with that id;
//   2. the block's passage hashes to the ledger's sha256 (unchanged);
//   3. CLAUDE.md does NOT contain the passage (it really moved);
//   4. CLAUDE.md still carries the id (the pointer is findable).
// `--dupes` adds: the passage appears exactly once across CLAUDE.md and every ledger destination.
//
// Line endings: every file is read with CRLF normalised to LF, so a Windows checkout and the stored
// blob give the same answer.
//
// Usage: node scripts/crew-tooling/move-ledger-check.mjs [--dupes] [--root <dir>] [--ci] | --self-test
//   --ci: on failure print GitHub `::warning::` lines and exit 0 (warn-only until Langston rules on blocking).

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = 'move-ledger-check 1.0 (B-TOKEN-ECONOMY P5)';
export const LEDGER = 'Claude Comms and Packages/Change Lists/B_TOKEN_ECONOMY_MOVE_LEDGER.json';
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function countOf(hay, needle) {
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

export function check(root, { dupes = false } = {}) {
  const fails = [];
  let ledger;
  try { ledger = JSON.parse(read(join(root, LEDGER))); } catch (e) { return { ok: false, fails: ['ledger unreadable: ' + e.message], n: 0 }; }
  let claude;
  try { claude = read(join(root, ledger.source || 'CLAUDE.md')); } catch (e) { return { ok: false, fails: ['CLAUDE.md unreadable: ' + e.message], n: 0 }; }
  const cache = new Map();
  const dest = (p) => { if (!cache.has(p)) { try { cache.set(p, read(join(root, p))); } catch { cache.set(p, null); } } return cache.get(p); };
  const passages = [];
  for (const m of ledger.moves || []) {
    const d = dest(m.destination);
    if (d === null) { fails.push(`${m.id}: destination unreadable (${m.destination})`); continue; }
    const re = new RegExp(`<!-- P5-MOVED id=${esc(m.id)} -->\\n### [^\\n]*\\n\\n([\\s\\S]*?)\\n<!-- /P5-MOVED id=${esc(m.id)} -->`, 'g');
    const blocks = [...d.matchAll(re)];
    if (blocks.length !== 1) { fails.push(`${m.id}: ${blocks.length} blocks in ${m.destination} (want 1)`); continue; }
    const passage = blocks[0][1];
    if (sha(passage) !== m.sha256) fails.push(`${m.id}: passage changed (hash mismatch) in ${m.destination}`);
    if (claude.includes(passage)) fails.push(`${m.id}: passage is still in CLAUDE.md`);
    if (!claude.includes(m.id)) fails.push(`${m.id}: CLAUDE.md lost its pointer`);
    passages.push([m, passage]);
  }
  if (dupes) {
    const homes = new Set([ledger.source || 'CLAUDE.md', ...(ledger.moves || []).map((m) => m.destination)]);
    for (const [m, passage] of passages) {
      let total = 0; const where = [];
      for (const h of homes) { const t = h === (ledger.source || 'CLAUDE.md') ? claude : dest(h); if (!t) continue; const c = countOf(t, passage); if (c) { total += c; where.push(`${h}×${c}`); } }
      if (total !== 1) fails.push(`${m.id}: passage found ${total} times (${where.join(', ')}) — want exactly one home`);
    }
  }
  return { ok: fails.length === 0, fails, n: (ledger.moves || []).length };
}

function selfTest(root) {
  const tmp = join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'move-ledger-selftest-' + process.pid);
  const results = [];
  const t = (name, ok) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name); };
  const ledger = JSON.parse(read(join(root, LEDGER)));
  const files = [LEDGER, ledger.source || 'CLAUDE.md', ...new Set(ledger.moves.map((m) => m.destination))];
  const fresh = () => { rmSync(tmp, { recursive: true, force: true }); for (const f of files) { mkdirSync(dirname(join(tmp, f)), { recursive: true }); cpSync(join(root, f), join(tmp, f)); } };
  const m = ledger.moves[0];
  fresh(); t('the real tree passes, with --dupes', check(tmp, { dupes: true }).ok);
  fresh();
  { const p = join(tmp, m.destination); const s = read(p);
    writeFileSync(p, s.replace(new RegExp(`<!-- P5-MOVED id=${esc(m.id)} -->[\\s\\S]*?<!-- /P5-MOVED id=${esc(m.id)} -->\\n?`), ''));
    const r = check(tmp); t('a seeded MISSING passage fails', !r.ok && r.fails.some((f) => f.startsWith(m.id + ': 0 blocks'))); }
  fresh();
  { const p = join(tmp, m.destination); const s = read(p); const i = s.indexOf(`<!-- P5-MOVED id=${m.id} -->`);
    const j = s.indexOf('\n\n', i) + 2; writeFileSync(p, s.slice(0, j) + 'X' + s.slice(j));
    t('a seeded EDITED passage fails', !check(tmp).ok); }
  fresh();
  { const re = new RegExp(`<!-- P5-MOVED id=${esc(m.id)} -->\\n### [^\\n]*\\n\\n([\\s\\S]*?)\\n<!-- /P5-MOVED`);
    const passage = read(join(tmp, m.destination)).match(re)[1];
    const c = join(tmp, ledger.source || 'CLAUDE.md'); writeFileSync(c, read(c) + '\n' + passage + '\n');
    const r = check(tmp, { dupes: true });
    t('a passage put BACK into CLAUDE.md fails (and --dupes sees two homes)', !r.ok && r.fails.some((f) => f.includes('still in CLAUDE.md')) && r.fails.some((f) => f.includes('found 2 times'))); }
  fresh();
  { const c = join(tmp, ledger.source || 'CLAUDE.md'); writeFileSync(c, read(c).split(m.id).join('P5-XX'));
    t('a lost pointer fails', !check(tmp).ok); }
  rmSync(tmp, { recursive: true, force: true });
  const pass = results.filter(Boolean).length;
  console.log(`${pass}/${results.length} PASS`);
  process.exit(pass === results.length ? 0 : 1);
}

const isMain = (() => { try { const a = resolve(fileURLToPath(import.meta.url)), b = resolve(process.argv[1] || ''); return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b; } catch { return false; } })();
if (isMain) {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--root');
  const root = ri >= 0 ? args[ri + 1] : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  if (args.includes('--self-test')) selfTest(root);
  const r = check(root, { dupes: args.includes('--dupes') });
  if (r.ok) { console.log(`${VERSION}: OK — ${r.n} moves, each present once at its destination, unchanged, gone from CLAUDE.md${args.includes('--dupes') ? ', one home each' : ''}.`); process.exit(0); }
  for (const f of r.fails) console.log((args.includes('--ci') ? '::warning title=CLAUDE.md move ledger::' : 'FAIL ') + f);
  console.log(`${r.fails.length} failure(s) across ${r.n} moves.`);
  process.exit(args.includes('--ci') ? 0 : 1);
}
