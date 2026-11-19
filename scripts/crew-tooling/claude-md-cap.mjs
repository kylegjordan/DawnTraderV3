#!/usr/bin/env node
// B-TOKEN-ECONOMY P5 / OBJ-5 (PM Claude, 2026-11-19) — size control for CLAUDE.md, the always-loaded rules file.
//
// CLAUDE.md is loaded on every start and every compaction for every Claude session, and Codex reads it
// too, so every byte is paid repeatedly. Before this, nothing measured it (pre-audit A7).
//
// Cap: 78,000 bytes, counted with LF line endings (the stored blob's form — a Windows checkout adds one
// byte per line, which has produced false "over cap" readings before, `#751`).
//
// WARN-ONLY until Langston rules on blocking (the B-WORKFLOW-IMPROVE ground rule): it never stops a session
// or fails CI unless run with --strict.
//   (no flag)   print one line if OVER the cap, nothing otherwise — the SessionStart form, so it costs
//               nothing while the file is under the cap.
//   --report    always print the size and the headroom.
//   --ci        over the cap: a GitHub `::warning::` line; exit 0.
//   --strict    over the cap: exit 1.
//   --file <p>  measure another file (tests).
//   --self-test

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = 'claude-md-cap 1.0 (B-TOKEN-ECONOMY P5)';
export const CAP = 78000;
export const bytesOf = (p) => Buffer.byteLength(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), 'utf8');

function selfTest() {
  const tmp = join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'claude-md-cap-' + process.pid + '.md');
  const results = [];
  const t = (name, ok) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name); };
  writeFileSync(tmp, 'x'.repeat(CAP + 1)); t('78,001 B is over the cap', bytesOf(tmp) > CAP);
  writeFileSync(tmp, 'x'.repeat(CAP)); t('78,000 B is at the cap, not over', bytesOf(tmp) === CAP);
  writeFileSync(tmp, 'a\r\nb\r\n'); t('CRLF is counted as LF', bytesOf(tmp) === 4);
  rmSync(tmp, { force: true });
  const pass = results.filter(Boolean).length;
  console.log(`${pass}/${results.length} PASS`);
  process.exit(pass === results.length ? 0 : 1);
}

const isMain = (() => { try { const a = resolve(fileURLToPath(import.meta.url)), b = resolve(process.argv[1] || ''); return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b; } catch { return false; } })();
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) selfTest();
  const fi = args.indexOf('--file');
  const file = fi >= 0 ? args[fi + 1] : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'CLAUDE.md');
  let n;
  try { n = bytesOf(file); } catch (e) {
    console.log(`${VERSION}: could not read ${file} (${e.message}) — size NOT checked.`);
    process.exit(args.includes('--strict') ? 1 : 0);
  }
  const over = n > CAP;
  if (args.includes('--report') || over) {
    const msg = over
      ? `CLAUDE.md is OVER its cap: ${n} B vs ${CAP} B (LF bytes). It still loads in full. Before adding to it, move depth out to a runbook or skill behind a pointer (CLAUDE.md §4 placement rule).`
      : `CLAUDE.md: ${n} B of ${CAP} B (LF bytes), ${CAP - n} B headroom.`;
    console.log(args.includes('--ci') && over ? `::warning title=CLAUDE.md size::${msg}` : msg);
  }
  process.exit(over && args.includes('--strict') ? 1 : 0);
}
