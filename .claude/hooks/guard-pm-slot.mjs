#!/usr/bin/env node
// GUARD 1 (scope OBJ-9, KD-28; pre-audit section 9 P1d-4) — PreToolUse, PM Claude's clone ONLY.
// Before PM Claude asks Kyle a slotting / ownership / ordering question (mcp__ccd_turn__wrap_up: ask + recap), or orders a
// session on Discord (Bash `cc-send ... --sender "PM Claude"`), a FRESH slot-check record for every session the text names
// must exist (written by scripts/pm/slot-check.mjs within the last 6 hours, header `freshness: FRESH`).
//   determinate miss          -> exit 2, stderr names the exact `node scripts/pm/slot-check.mjs --owner X --item "..."`
//   the hook's own fault      -> exit 0 and a line in the miss log (a broken hook file must never stop another session)
//   mapped non-PM clone       -> exit 0, silently
//   unreadable/unmapped dir   -> exit 0 AND a miss-log line (a dead gate is visible)
// HONEST LIMIT: slotting is recognised BY WORDING, so an unusually worded recommendation can pass. Guard 2 is the hard gate.
// PROBE (P1d-1): every invocation appends one JSON line {ts, tool_name, project, ask} to the probe log, so the first run
// proves whether the app runs PreToolUse hooks on its own MCP tool (the Bash line is the control).
// Env overrides, for tests: PM_SLOT_RECORD_DIR, PM_SLOT_MISS_LOG, PM_SLOT_PROBE_LOG.
import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const CLONES = { // as alert-split.mjs:20-23 (basename of CLAUDE_PROJECT_DIR, not a suffix test)
  'DawnTraderV3-pm': 'PM',
  'DawnTraderV3-old': 'other', 'DawnTraderV3-new': 'other', 'DawnTraderV3-analyst': 'other',
  'DawnTraderV3-infra': 'other', 'DawnTraderV3': 'other',
};
const HOME_CLAUDE = join(homedir(), '.claude');
const MISS_LOG = process.env.PM_SLOT_MISS_LOG || join(HOME_CLAUDE, 'pm-slot-guard-misses.log');
const PROBE_LOG = process.env.PM_SLOT_PROBE_LOG || join(HOME_CLAUDE, 'pm-slot-probe.log');
const MAX_AGE_MS = 6 * 3600e3;

function append(file, line) { try { mkdirSync(dirname(file), { recursive: true }); appendFileSync(file, line + '\n'); } catch { /* logging must never break the hook */ } }
// The probe log is capped, not unbounded (Langston Step-4 record item 2): past PROBE_CAP_BYTES it keeps its newest half.
// Retirement condition, named: the invocation lines are a one-shot P1d-1 instrument; the verdict lines are kept for tuning
// the wording net (judgement call 2) and are reviewed at B-PM-CLAUDE's close, where the cap is re-decided.
const PROBE_CAP_BYTES = 256 * 1024;
function probeAppend(line) {
  try {
    if (statSync(PROBE_LOG).size > PROBE_CAP_BYTES) {
      const keep = readFileSync(PROBE_LOG, 'utf8').split('\n').filter(Boolean);
      writeFileSync(PROBE_LOG, keep.slice(Math.floor(keep.length / 2)).join('\n') + '\n');
    }
  } catch { /* absent or unreadable: append creates it */ }
  append(PROBE_LOG, line);
}
const miss = (why) => append(MISS_LOG, `${new Date().toISOString()} guard-pm-slot ${why}`);

// Slotting wording: placement, ownership or order. Deliberately broad on the verbs, and it also needs a session name.
const SLOT_WORDS = /\b(slot(?:s|ted|ting)?|placement|placed?\s+(?:after|before|at|in|first|next|straight)|owns?|owner(?:ship)?|assign(?:s|ed|ing)?|straight after|goes?\s+(?:after|before|next|first)|queue[sd]?|(?:the\s+)?order\s+(?:of|stands|is|:)|re-?order(?:ed|ing)?|move[sd]?\s+(?:up|down|to|ahead|after|before)|(?:comes?|come)\s+(?:after|before|first)|ahead of|pick(?:s|ed)? up|take(?:s)? over)\b/i;
const SESSION_WORDS = [
  [/\b(?:OLD Claude|Claude Old|CC-A)\b/i, 'CC-A'], [/\b(?:NEW Claude|Claude New|CC-B)\b/i, 'CC-B'],
  [/\b(?:ANALYST Claude|Claude Analyst|CC-C)\b/i, 'CC-C'], [/\b(?:Infra Claude|CC-INFRA)\b/i, 'CC-INFRA'], // full forms only, all four alike (Langston Step-4 call 3 and record item 1)
];
export function namedOwners(text) { return SESSION_WORDS.filter(([re]) => re.test(text)).map(([, a]) => a); }
export function isSlotting(text) { return SLOT_WORDS.test(text) && namedOwners(text).length > 0; }

function freshRecordFor(dir, alias) {
  const names = readdirSync(dir); // a missing dir throws ENOENT -> determinate "no record" is decided by the caller
  for (const n of names) {
    if (!n.endsWith('.md') || !n.includes(`_${alias}_`)) continue;
    const full = join(dir, n);
    const head = readFileSync(full, 'utf8').slice(0, 2000);
    // Age from the record's own `- generated:` header; mtime only as a fallback, since a checkout or stash rewrites mtime (Langston Step-4 C3).
    const g = /^- generated:\s*(\S+)/m.exec(head);
    const born = g && !Number.isNaN(Date.parse(g[1])) ? Date.parse(g[1]) : statSync(full).mtimeMs;
    if (Date.now() - born > MAX_AGE_MS) continue;
    if (/^- freshness:\s*FRESH\b/m.test(head) && new RegExp(`^- owner:\\s*${alias}\\b`, 'm').test(head)) return true;
  }
  return false;
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }
  const tool = payload?.tool_name ?? payload?.toolName ?? '';
  const proj = basename(String(process.env.CLAUDE_PROJECT_DIR || ''));
  const input = payload?.tool_input ?? payload?.toolInput ?? {};
  const probe = () => probeAppend(JSON.stringify({ ts: new Date().toISOString(), hook: 'guard-pm-slot', tool_name: tool, project: proj, ask: typeof input.ask === 'string' ? input.ask.slice(0, 80) : undefined }));
  // Every slotting VERDICT is persisted, refusals and allows alike, so the wording net can be tuned from data (Langston Step-4 C2).
  const logVerdict = (v, owners, missing, text) => probeAppend(JSON.stringify({ ts: new Date().toISOString(), hook: 'guard-pm-slot', kind: 'verdict', tool_name: tool, verdict: v, owners, missing, matched: (SLOT_WORDS.exec(text) || [])[0], text: text.replace(/\s+/g, ' ').trim().slice(0, 240) }));

  let verdict = null; // { owners, text }
  try {
    if (!proj) { probe(); miss(`unreadable CLAUDE_PROJECT_DIR (tool ${tool})`); process.exit(0); }
    const kind = CLONES[proj];
    if (kind === undefined) { probe(); miss(`unmapped project dir "${proj}" (tool ${tool}); the gate did not run`); process.exit(0); }
    if (kind !== 'PM') process.exit(0); // other clones: no probe line, no miss line (PM review: the probe must not log every Bash call crew-wide)
    probe();

    let text = null;
    if (tool === 'mcp__ccd_turn__wrap_up') text = `${input.ask ?? ''}\n${input.recap ?? ''}`;
    else if (tool === 'Bash') {
      const cmd = String(input.command ?? '');
      if (/\bcc-send\b/.test(cmd) && /--sender[\s=]+\\?["']?PM Claude\b/.test(cmd)) text = cmd;
    }
    if (text === null || !isSlotting(text)) process.exit(0);

    const dir = process.env.PM_SLOT_RECORD_DIR || join(process.env.CLAUDE_PROJECT_DIR, '1-system-manual', 'pm', 'slot-checks');
    const owners = namedOwners(text);
    const missing = [];
    for (const o of owners) {
      let ok;
      try { ok = freshRecordFor(dir, o); }
      catch (e) { if (e.code === 'ENOENT') ok = false; else throw e; }
      if (!ok) missing.push(o);
    }
    logVerdict(missing.length ? 'refuse' : 'allow', owners, missing, text);
    if (missing.length) verdict = { missing, text };
  } catch (e) {
    miss(`fault: ${String(e && e.message).split('\n')[0]}`);
    process.exit(0);
  }
  if (verdict) {
    const item = verdict.text.replace(/\s+/g, ' ').trim().slice(0, 80).replace(/"/g, "'");
    process.stderr.write(
      `GUARD 1 (KD-28): this reads as a slotting, ownership or ordering proposal naming ${verdict.missing.join(', ')}, and there is no FRESH slot-check record for ${verdict.missing.length > 1 ? 'them' : 'that owner'} from the last 6 hours.\n` +
      `Run the check first (through the pm-slotting skill, one sonnet agent), then re-send:\n` +
      verdict.missing.map((o) => `  node scripts/pm/slot-check.mjs --owner ${o} --item "${item}"`).join('\n') + '\n' +
      `A DEGRADED record does not count. If this is not a slotting question, reword it.\n`);
    process.exit(2);
  }
  process.exit(0);
});
