// B-PLAN-CURRENCY-CHECK P26 (OBJ-10) — the TWO-REF preview of the exceptions-ledger rule change. NO alert IO.
// Answers, BEFORE a push and again on the commit as pushed: "what does the new ledger rule honour, against
// what the box honoured before this commit?" (Langston, scope §10i R1-Q6; round 3, §1 R3-HY-1).
//   OLD side = TODAY'S RULE (a verbatim copy of the pre-batch loadExceptions loop, below) applied to the
//              ledger at the PARENT of the push commit;
//   NEW side = parseExceptions (poller.mjs, the working tree — refused unless it is the push commit's own
//              blob) applied to the ledger AT the push commit.
// Run from the repo root:
//   node scripts/governance-checker/exceptions-preview.mjs [<pushRef>]        (default HEAD; parent = <pushRef>^)
// ⚠️ PRE-REGISTERED (scope §10i R1-Q6; pre-audit §12.1): exactly 3 set removals, classOverride 13→13,
//    0 malformed alerts — RE-DERIVED at the push commit's parent, which is what this prints. Anything else
//    at the flip: revert the flag, don't debug live.
// ⚠️ A SINGLE-REF run (today's rule vs the new rule, both at the push ref) shows 0 differences whether or
//    not the new parser is right — the push's own retypes have already taken those rows out of what today's
//    rule honours. It is printed below as a CONSISTENCY line only and must never be cited as the evidence.
// ⚠️ A SNAPSHOT: a rebase onto rows other sessions appended changes the parent — re-run on the commit as pushed.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { parseExceptions, decideMalformedAlerts } from './poller.mjs';
import { REPO_ROOT } from './checker.mjs';
import { VALID_CLASSES } from './config.mjs';

const LEDGER = '1-system-manual/GOVERNANCE_EXCEPTIONS.md';
const git = (...args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

// TODAY'S RULE — verbatim copy of the pre-batch loadExceptions loop (poller.mjs at the batch's base),
// with only its read lifted into `raw`. Kept frozen here so the OLD side is the rule the box ran, not
// whatever the flag-off path later becomes.
function todayRule(raw) {
  const open = new Set(), openSince = new Map(), naConfirmed = new Set(), classOverride = new Map();
  const isConfirmed = (by) => Boolean(by) && by !== 'pending';
  for (const line of raw.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 7) continue;
    const [, ts, bid, type, value, confirmedBy] = cells;
    if (!bid || bid.startsWith('_')) continue;
    if (type === 'open' && isConfirmed(confirmedBy)) { open.add(bid); const m = value.match(/\d{4}-\d{2}-\d{2}T[\d:]+Z/); if (m) openSince.set(bid, Date.parse(m[0])); }
    if (type === 'na-skip' && isConfirmed(confirmedBy)) naConfirmed.add(`${bid}:${value}`);
    if (type === 'class-override' && isConfirmed(confirmedBy)) {
      const m = value.match(/declared:(\w+)/);
      if (m && VALID_CLASSES.includes(m[1].toLowerCase())) classOverride.set(bid, m[1].toLowerCase());
    }
  }
  return { open, openSince, naConfirmed, classOverride };
}

// Honoured sets as comparable string sets: open by batch, naConfirmed by `batch:doc`, classOverride by `batch=class`.
const flat = (e) => ({
  open: new Set(e.open),
  naConfirmed: new Set(e.naConfirmed),
  classOverride: new Set([...e.classOverride].map(([b, c]) => `${b}=${c}`)),
});
function compare(a, b) {
  const A = flat(a), B = flat(b), out = { removed: [], added: [] };
  for (const set of ['open', 'naConfirmed', 'classOverride']) {
    for (const x of A[set]) if (!B[set].has(x)) out.removed.push(`${set} ${x}`);
    for (const x of B[set]) if (!A[set].has(x)) out.added.push(`${set} ${x}`);
  }
  return out;
}
const sizes = (e) => `open ${e.open.size} · naConfirmed ${e.naConfirmed.size} · classOverride ${e.classOverride.size}`;

const pushRef = process.argv[2] || 'HEAD';
const pushSha = git('rev-parse', pushRef).trim();
const parentSha = git('rev-parse', `${pushSha}^`).trim();

// The NEW side must be the push commit's parser, not a working-tree edit: refuse on any difference.
const wtBlob = git('hash-object', join(REPO_ROOT, 'scripts/governance-checker/poller.mjs')).trim();
const refBlob = git('rev-parse', `${pushSha}:scripts/governance-checker/poller.mjs`).trim();
if (wtBlob !== refBlob) {
  console.error(`REFUSED: working-tree poller.mjs (${wtBlob}) is not ${pushSha.slice(0, 9)}'s (${refBlob}) — ` +
    `the NEW side would not be the push commit's parser. Check out ${pushSha.slice(0, 9)} (or stash) and re-run.`);
  process.exit(2);
}

const rawParent = git('show', `${parentSha}:${LEDGER}`);
const rawPush = git('show', `${pushSha}:${LEDGER}`);
const oldAtParent = todayRule(rawParent);
const oldAtPush = todayRule(rawPush);
const newAtPush = parseExceptions(rawPush);
const newAtParent = parseExceptions(rawParent);

const pre = compare(oldAtParent, newAtPush);
const malAlerts = decideMalformedAlerts(newAtPush.malformed, [], pushSha.slice(0, 9)).toOpen;
console.log(`ledger ${LEDGER}`);
console.log(`parent ${parentSha.slice(0, 9)} (today's rule)  →  push ${pushSha.slice(0, 9)} (parseExceptions)\n`);
console.log(`today's rule @ parent : ${sizes(oldAtParent)}`);
console.log(`parseExceptions @ push: ${sizes(newAtPush)} · malformed rows ${newAtPush.malformed.length}\n`);
for (const r of pre.removed) console.log(`  REMOVED  ${r}`);
for (const a of pre.added) console.log(`  ADDED    ${a}`);
for (const m of newAtPush.malformed) console.log(`  MALFORMED line ${m.lineNo} ${m.batchId} (${m.typeSlug}) — ${m.reason}`);
console.log(`\n★ PRE-REGISTERED OBSERVABLE (expected: 3 · 13→13 · 0)`);
console.log(`  set removals              ${pre.removed.length}   (set additions ${pre.added.length})`);
console.log(`  classOverride             ${oldAtParent.classOverride.size}→${newAtPush.classOverride.size}`);
console.log(`  malformed alerts          ${malAlerts.length}   (${newAtPush.malformed.length} malformed rows)`);

// Information only — what each half of the change does on its own.
const pushOff = compare(oldAtParent, oldAtPush);
const consistency = compare(oldAtPush, newAtPush);
console.log(`\ninformation only:`);
console.log(`  the push with the flag OFF (today's rule, parent → push): removals ${pushOff.removed.length}, additions ${pushOff.added.length}` +
  (pushOff.removed.length ? ` — ${pushOff.removed.join(' · ')}` : ''));
console.log(`  CONSISTENCY ONLY, NOT THE EVIDENCE (both rules at the push ref): removals ${consistency.removed.length}, additions ${consistency.added.length}`);
console.log(`  control — parseExceptions on the UNEDITED ledger at the parent: ${newAtParent.malformed.length} malformed rows` +
  (newAtParent.malformed.length ? ` — ${newAtParent.malformed.map((m) => `line ${m.lineNo} ${m.batchId} (${m.typeSlug})`).join(' · ')}` : ''));
