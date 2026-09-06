#!/usr/bin/env node
/**
 * BUILD THE CODEX REPO EXPORT — allowlisted, redacted, verified, read-only.
 *
 *   node scripts/codex-export/build-codex-repo.mjs \
 *        [--ref origin/migration/aws-supabase] \
 *        [--dest C:/DawnTrader-Codex-Repo] \
 *        [--no-lock]        # skip the ACL step (dry run)
 *
 * ⛔⛔ FAIL-CLOSED AT FIVE POINTS. If any trips, the staging directory is deleted and the
 *     PREVIOUS export is left untouched — a failed build never publishes a partial tree
 *     and never degrades a good one:
 *
 *   1. The ref does not resolve                        → abort
 *   2. An INCLUDE line resolves to ZERO paths          → abort, naming the line
 *      ★ A silently-empty allowlist entry is how an exporter reads green while shipping
 *        nothing — or how a RENAMED directory quietly stops being exported for a month.
 *   3. An EXCLUDE line removes ZERO files              → abort, naming the line
 *      ★ The more dangerous of the two: an exclusion that matches nothing LOOKS LIKE
 *        PROTECTION AND IS NOT. Renaming the file it guards silently disarms it.
 *   4. A HARD_FAIL credential shape survives           → abort, naming the file
 *   5. A REDACT pattern survives the redactor          → abort, naming the pattern
 *      ★ This gates the REDACTOR, not the content: a new spelling of a known identifier
 *        cannot pass silently — it can only pass by someone adding it to the rules.
 *
 * ⚠️ WHAT THIS IS NOT: a guarantee that nothing sensitive escapes. It knows the shapes in
 *    redaction-rules.mjs and nothing else. THE ALLOWLIST IS THE PRIMARY DEFENCE; the
 *    scanner is the backstop. Never widen the manifest on the strength of the scanner.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { REDACT, HARD_FAIL, SKIP_TEXT_PASS, MAX_TEXT_BYTES, KNOWN_BENIGN } from './redaction-rules.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const REPO = path.resolve(HERE, '..', '..');
const MANIFEST = path.join(HERE, 'MANIFEST.txt');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const REF  = arg('--ref', 'origin/migration/aws-supabase');
const DEST = path.resolve(arg('--dest', 'C:/DawnTrader-Codex-Repo'));
const LOCK = !argv.includes('--no-lock');

const die = (msg) => { console.error(`\n\u26d4 ABORT — ${msg}\n`); process.exit(1); };
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const say = (m) => console.log(m);
const rel = (root, f) => path.relative(root, f).split(path.sep).join('/');

// ── 1. resolve the ref ────────────────────────────────────────────────────────
let sha;
try { sha = git('rev-parse', '--verify', `${REF}^{commit}`).trim(); }
catch { die(`ref '${REF}' does not resolve. Nothing was written.`); }
say(`ref        ${REF}`);
say(`sha        ${sha}`);

// ── 2. read the manifest ──────────────────────────────────────────────────────
const raw = fs.readFileSync(MANIFEST, 'utf8');
const entries = raw.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));

// A '!' line is a TARGETED EXCLUSION inside an already-admitted tree.
// ⚠️ This does NOT make the manifest a denylist: nothing is admitted by default, and an
//    exclusion can only ever REMOVE from what an allowlist line above already let in.
const includes = entries.filter(s => !s.startsWith('!'));
const excludes = entries.filter(s =>  s.startsWith('!')).map(s => s.slice(1).trim()).filter(Boolean);
if (includes.length === 0) die('manifest resolved to ZERO include entries. Refusing to export an empty allowlist.');

// ⛔ Exclusions are NOT passed to git as pathspecs. `ls-tree` rejects `:(glob)` and a bare
//    `*` matches nothing there — so a pathspec-based exclusion resolves SILENTLY EMPTY,
//    which is precisely the failure mode this script exists to make loud. They are applied
//    to the extracted tree instead, where each one must delete a real file or we abort.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c);
const excludeRe = excludes.map((spec) => ({
  spec,
  re: new RegExp('^' + spec.split('*').map(escapeRe).join('[^/]*') + '$'),
}));

const empties = [];
for (const spec of includes) {
  let out = '';
  try { out = git('ls-tree', '-r', '--name-only', sha, '--', spec); } catch { /* empty */ }
  if (out.split('\n').filter(Boolean).length === 0) empties.push(spec);
}
if (empties.length) {
  die(`${empties.length} include entr${empties.length === 1 ? 'y' : 'ies'} resolved to ZERO paths at `
    + `${sha.slice(0, 9)} — renamed, deleted, or mistyped. Fix the manifest or the ref; a live export `
    + `is not the place to discover this.\n`
    + empties.map(s => `        - ${s}`).join('\n'));
}
const preTotal = git('ls-tree', '-r', '--name-only', sha, '--', ...includes).split('\n').filter(Boolean).length;
say(`manifest   ${includes.length} include + ${excludes.length} exclude \u2192 ${preTotal} files admitted, every include resolved`);

// ── 3. export tracked content at the ref into a staging dir ───────────────────
const STAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-export-'));
process.on('exit', () => { try { fs.rmSync(STAGE, { recursive: true, force: true }); } catch {} });

try {
  const outDir = path.join(STAGE, 'tree');
  fs.mkdirSync(outDir);
  const tarName = '_export.tar';
  // git archive reads from the REF, so no working-tree state, no untracked file and no
  // .git directory can leak in. That is a property of the tool rather than of our care,
  // which is exactly why it is used instead of a directory copy.
  execFileSync('git', ['-C', REPO, 'archive', '--format=tar', '-o', path.join(outDir, tarName), sha, '--', ...includes],
    { maxBuffer: 1 << 28 });
  // ⚠️ tar runs with cwd=outDir and a RELATIVE filename on purpose: handed an absolute
  //    Windows path, GNU tar reads the drive letter as a remote host and dies with
  //    "Cannot connect to C:". A relative name has no colon and no ambiguity.
  execFileSync('tar', ['-xf', tarName], { cwd: outDir, maxBuffer: 1 << 28 });
  fs.rmSync(path.join(outDir, tarName));

  let files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else files.push(p);
    }
  })(outDir);
  say(`export     ${files.length} files extracted to staging`);

  // ── 4. apply the exclusions, and PROVE each one removed something ───────────
  const unused = [];
  for (const ex of excludeRe) {
    const hit = files.filter(f => ex.re.test(rel(outDir, f)));
    if (hit.length === 0) { unused.push(ex.spec); continue; }
    for (const f of hit) fs.rmSync(f);
    files = files.filter(f => !hit.includes(f));
    say(`exclude    ${ex.spec} \u2192 removed ${hit.length}`);
  }
  if (unused.length) {
    die(`${unused.length} exclusion${unused.length === 1 ? '' : 's'} matched NOTHING. An exclusion that `
      + `removes no file looks like protection and is not — whatever it was written to keep out may have `
      + `been renamed, and it would ship.\n`
      + unused.map(s => `        - ${s}`).join('\n'));
  }

  // ── 5. HARD-FAIL scan, redact, then VERIFY the redaction ────────────────────
  let redactedFiles = 0, redactedHits = 0;
  const skippedFiles = [];
  const problems = [];

  for (const f of files) {
    const r = rel(outDir, f);
    if (SKIP_TEXT_PASS.test(f) || fs.statSync(f).size > MAX_TEXT_BYTES) { skippedFiles.push(r); continue; }

    let text;
    // ⛔⛔ READ AS latin1, AND DO NOT SKIP ON A NUL BYTE.
    //    MEASURED 2026-09-06: a 530 KB Telegram archive (.md) carried a stray NUL, was
    //    classed as binary, and was therefore neither redacted NOR scanned — it shipped
    //    with 15 occurrences of a host address while the run printed 'scan clean'.
    //    ★ SKIPPED MEANT UNSEEN, AND UNSEEN WAS REPORTED AS CLEAN. That is the bug.
    //    latin1 is a lossless byte-to-char mapping, so the round-trip preserves every
    //    byte of non-matching content, and every pattern here is ASCII.
    try { text = fs.readFileSync(f, 'latin1'); } catch { skippedFiles.push(r); continue; }


    // 5a. credential scan on the ORIGINAL text — a secret must never be masked into
    //     invisibility by a REDACT rule that happens to overlap it.
    for (const rule of HARD_FAIL) {
      const flags = rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g';
      const m = text.match(new RegExp(rule.re.source, flags));
      if (!m) continue;
      // ✅ Discount ONLY exact verified placeholders. Anything else on the same pattern
      //    still aborts — the allowance is per-STRING, never per-pattern.
      const real = m.filter(hit => !KNOWN_BENIGN.some(k => hit.includes(k) || k.includes(hit)));
      if (real.length) problems.push(`${r}  \u2190 ${rule.name} (${real.length}\u00d7)`);
    }

    // 5b. redact
    let out = text, hits = 0;
    for (const rule of REDACT) {
      const before = out;
      out = out.replace(rule.re, rule.with);
      if (out !== before) hits++;
    }
    if (hits) { fs.writeFileSync(f, out, 'latin1'); redactedFiles++; redactedHits += hits; }

    // 5c. VERIFY — re-scan the OUTPUT. A survivor means the redactor missed a spelling.
    for (const rule of REDACT) {
      if (new RegExp(rule.re.source, rule.re.flags.replace('g', '')).test(out)) {
        problems.push(`${r}  \u2190 REDACTION FAILED to clear '${rule.name}'`);
      }
    }
  }

  // ⭐⭐ SKIPPED FILES ARE STILL SCANNED, AT THE BYTE LEVEL. A file the text pass could
  //    not handle is exactly the file nobody looks at, so its silence must not count as
  //    clean. It cannot be REDACTED safely (it is binary or enormous) — so if it carries a
  //    pattern it does not ship, and the manifest has to decide about it explicitly.
  for (const r of skippedFiles) {
    const buf = fs.readFileSync(path.join(outDir, r));
    const bytes = buf.toString('latin1');
    for (const rule of [...REDACT, ...HARD_FAIL]) {
      const probe = new RegExp(rule.re.source, rule.re.flags.replace('g', ''));
      if (probe.test(bytes)) problems.push(`${r}  ← ${rule.name} — in a file the text pass SKIPPED (binary or oversize); exclude it in the manifest`);
    }
  }

  if (problems.length) {
    die(`the scan found ${problems.length} problem${problems.length === 1 ? '' : 's'}. NOTHING was published; `
      + `any previous export is untouched.\n`
      + problems.slice(0, 40).map(h => `        - ${h}`).join('\n')
      + (problems.length > 40 ? `\n        \u2026 and ${problems.length - 40} more` : ''));
  }
  say(`scan       clean \u2014 ${redactedFiles} files redacted (${redactedHits} rule hits), ${skippedFiles.length} binary/large byte-scanned`);

  // ── 6. provenance, written INTO the export so the advisor can cite it ───────
  const manifestHash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  fs.writeFileSync(path.join(outDir, 'EXPORT_PROVENANCE.md'),
`# CODEX REPO EXPORT — PROVENANCE

| | |
|---|---|
| **Source ref** | \`${REF}\` |
| **Commit** | \`${sha}\` |
| **Built** | ${new Date().toISOString()} |
| **Manifest** | \`scripts/codex-export/MANIFEST.txt\`, sha256 \`${manifestHash}\` |
| **Files** | ${files.length} (${preTotal} admitted by the allowlist, ${preTotal - files.length} removed by exclusions) |
| **Redaction** | ${redactedFiles} files touched, ${redactedHits} rule hits, verify pass CLEAN |

## What this is

An **allowlisted, redacted, read-only** copy of the DawnTrader repository at one commit.
It is **not** a clone: there is no \`.git\`, no working-tree state, no untracked file, and
no history beyond what the exported files themselves record.

## ⛔ What has been changed in the text

Operational identifiers are masked with stable placeholders so the prose stays readable:

${REDACT.map(r => `- \`${r.with}\``).join('\n')}

**If you need to reason about one of these, ask — do not infer it.**

## ⛔ What is absent, and why it matters to your reading

The allowlist admits source, governance, documentation and the pre-governance corpus.
It **excludes** deployment machinery, communications infrastructure, CI configuration,
session tooling, and every binary/asset/backup directory.

⭐ **So an absence here is NOT evidence of absence in the system.** If a component appears
to have no scheduler, no deploy path or no CI, that is far more likely to be the allowlist
than the architecture. **Say so rather than filing it as a finding.**

## Freshness

This is a **snapshot**; it does not update itself. Check the commit above against the one
your brief names. If they differ, ask for a rebuild rather than reasoning across two
versions of the tree.
`, 'utf8');

  // ── 7. publish atomically: build beside the destination, then swap ─────────
  // ⚠️ Guarded: when DEST sits at a drive root the parent is `C:\` and mkdir throws EPERM
  //    even with recursive:true — an existence check is the only safe form here.
  const destParent = path.dirname(DEST);
  if (!fs.existsSync(destParent)) fs.mkdirSync(destParent, { recursive: true });
  const tmpDest = `${DEST}.new`, oldDest = `${DEST}.old`;
  fs.rmSync(tmpDest, { recursive: true, force: true });
  fs.cpSync(outDir, tmpDest, { recursive: true });

  if (fs.existsSync(DEST)) {
    // a previous export may still be ACL-locked; restore write before moving it aside
    // GRANT before RESET. A reset alone cannot repair a tree whose children lost their
    // inherited ACEs — icacls needs the right to reach them first, and without this the
    // previous export stays unreadable and unremovable.
    const u = process.env.USERNAME || process.env.USER;
    try { execFileSync('icacls', [DEST, '/grant', `${u}:(OI)(CI)F`, '/T', '/C', '/Q'], { stdio: 'ignore' }); } catch {}
    try { execFileSync('icacls', [DEST, '/reset', '/T', '/C', '/Q'], { stdio: 'ignore' }); } catch {}
    fs.rmSync(oldDest, { recursive: true, force: true });
    fs.renameSync(DEST, oldDest);
  }
  fs.renameSync(tmpDest, DEST);
  fs.rmSync(oldDest, { recursive: true, force: true });
  say(`publish    ${DEST}`);

  // ── 8. read-only, enforced by the filesystem rather than by good manners ───
  if (LOCK) {
    const user = process.env.USERNAME || process.env.USER;
    // ⛔⛔ A DENY ACE, NOT `/inheritance:r`. MEASURED 2026-09-06: `icacls /inheritance:r
    //    /grant:r … /T` reported "Successfully processed 1 files" — it stripped inheritance
    //    from the ROOT and then could not reach the children, which were left with NO ACEs
    //    at all and became UNREADABLE. The export was locked so hard it was useless.
    //    A deny ACE needs no inheritance surgery: deny beats allow in Windows evaluation,
    //    so read survives and write does not.
    try {
      // ⛔ SPECIFIC rights, not the generic `W`. MEASURED: denying generic `(W,D,DC)` also
      //    blocked directory LISTING — scandir returned EPERM and the export was unusable.
      //    WD=write-data AD=append-data WEA/WA=write EA+attributes DE=delete DC=delete-child.
      execFileSync('icacls', [DEST, '/deny', `${user}:(OI)(CI)(WD,AD,WEA,WA,DE,DC)`, '/T', '/C', '/Q'],
        { stdio: 'ignore' });
    } catch (e) {
      die(`could not apply the read-only ACL (${e.message}). The export exists at ${DEST} but is WRITABLE.`);
    }

    // ⭐⭐ PROVE BOTH HALVES. An unverified lock is politeness, not a boundary — and a lock
    //     verified on ONE side is how the first attempt shipped an unreadable tree: the
    //     write probe passed, nothing checked that a read still worked, and every
    //     subsequent grep returned a confident zero because it could not open a file.
    const wprobe = path.join(DEST, '.write-probe');
    let writeDenied = false;
    try { fs.writeFileSync(wprobe, 'x'); } catch { writeDenied = true; }
    if (!writeDenied) {
      try { fs.rmSync(wprobe); } catch {}
      die(`the ACL was applied but a WRITE STILL SUCCEEDED. ${DEST} exists and is NOT locked.`);
    }

    // the read probe walks to a real nested file — a root-level read proves nothing about
    // whether the recursion reached the tree.
    let readOk = false, probed = null;
    (function findOne(d, depth) {
      if (readOk || depth > 4) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (readOk) return;
        const p = path.join(d, e.name);
        if (e.isDirectory()) findOne(p, depth + 1);
        else if (e.name.endsWith('.ts') || e.name.endsWith('.md')) {
          probed = rel(DEST, p);
          try { fs.readFileSync(p, 'utf8'); readOk = true; } catch { readOk = false; }
          return;
        }
      }
    })(DEST, 0);
    if (!readOk) {
      die(`the write lock holds but a READ of '${probed ?? '(no file found)'}' FAILED. The export is `
        + `unreadable and therefore useless. Reset it with:  icacls "${DEST}" /reset /T /C /Q`);
    }
    say(`lock       write DENIED and read CONFIRMED (probe: ${probed}) for ${user}`);
  } else {
    say(`lock       SKIPPED (--no-lock) \u2014 the export is WRITABLE`);
  }

  say(`\n\u2705 done. ${files.length} files at ${sha.slice(0, 9)} \u2192 ${DEST}\n`);
} catch (e) {
  if (e && e.message && !e.message.startsWith('\n')) console.error(e.message);
  process.exit(1);
}
