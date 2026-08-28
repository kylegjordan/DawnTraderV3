#!/usr/bin/env node
/**
 * Controls for guard-whole-fs-scan.
 *
 * WHY THIS FILE EXISTS: v3's ledger entry claimed "CONTROLS, all three, re-run:
 * POSITIVE - 6 whole-fs forms blocked. NEGATIVE - 10 ordinary forms pass." No
 * test artifact was committed, the 6 forms were never named, and the claim was
 * therefore unreproducible -- which CONDUCT.md §10 forbids ("name the object and
 * the population"), in the same commit that edited §10's neighbour.
 *
 * Run: node test/guard-whole-fs-scan.test.mjs
 */
import { verdict } from '../.claude/hooks/guard-whole-fs-scan.mjs';

const H = 'ssh root@204.168.141.77';

// MUST BLOCK -- a scan sent to the wedged box.
const BLOCK = [
  [`${H} 'find / -name foo'`,            'the canonical hazard: root scan over ssh'],
  [`${H} "find / -type f"`,              'double-quoted form'],
  [`${H} 'grep -rn pattern /'`,          'well-formed grep -- v3 could never match this'],
  [`${H} 'rg foo /'`,                    'ripgrep at root'],
  [`${H} 'du -sh /'`,                    'du at root'],
  [`${H} 'ls -R /'`,                     'recursive ls at root'],
  [`${H} 'ls /mnt/gdrive'`,              'straight at the mount'],
  [`${H} 'grep -rn foo /mnt/gdrive'`,    'at the mount, pattern before path -- v3 allowed this'],
  [`${H} 'cat /mnt/gdrive/notes.md'`,    'reading a file on the mount'],
  ['ssh langston@helsinki "find / -name x"', 'host named differently'],
  [`ssh -o ConnectTimeout=15 root@204.168.141.77 'find / -name x'`, 'OUR OWN documented ssh form -- v4 allowed this'],
  [`ssh dawntrader-agent 'find / -name x'`, 'the real hostname -- v4 allowed this'],
  [H + " 'find /home -xdev; du -sh /'", 'xdev in a DIFFERENT segment -- v4 allowed this'],
  [H + " 'find /mnt -name x'", 'the mount PARENT -- v4 allowed this'],
];

// MUST PASS -- ordinary work, and the cases that false-fired on v1/v2/v3.
const ALLOW = [
  [`${H} 'find /home/deploy/dawntrader -name x'`, 'a scoped remote search'],
  [`${H} 'tail -50 /var/log/dawntrader/out.log'`, 'reading remote logs'],
  [`${H} 'find / -xdev -name x'`,                 '-xdev cannot cross into the mount'],
  [`${H} "timeout 60 find / -xdev -name y"`,      'the form the refusal text recommends'],
  [`${H} 'ls -l /mnt/gdrive-backup'`,             'a SIBLING path, not the mount'],
  ['find / -name foo',                            'LOCAL scan: no such mount on the laptop'],
  ['find . -name "*.ts"',                         'ordinary local find'],
  ['grep -rn TODO server/',                       'ordinary local grep'],
  ['git grep foo',                                'git grep'],
  ['ls -la /home/deploy',                         'plain ls'],
  ['cat > /tmp/a.md <<EOF\nnever run find / here\nEOF', 'heredoc MENTIONING the command -- false-fired on v1'],
  ['python3 -c "x = \'find / -name z\'" && echo ok', 'string literal -- false-fired on v2'],
  ['echo "the rule bans find /" > note.txt',      'prose about the command'],
  [H + " 'timeout 8 ls /mnt/gdrive'", 'the guard OWN premise-verification command -- v4 blocked it'],
  [H + " 'ls /opt/discord-bridges && cd / && pwd'", 'unrelated later slash -- v4 blocked it'],
  [`ssh -o ConnectTimeout=15 root@204.168.141.77 'tail -5 /var/log/dawntrader/out.log'`, 'our documented ssh form, ordinary read'],
];

// KNOWN RESIDUAL - NOT A BUG TO FIX LATER. IT IS A LIMIT OF THE APPROACH.
// A regex over a shell string cannot distinguish A COMMAND from PROSE DESCRIBING
// ONE. Writing about the remote hazard -- a ledger entry, a dispatch, or this
// very suite -- is blocked. v1 and v2 were rewritten to kill this class for
// LOCAL commands; it returns for remote ones, because the host token is exactly
// what makes the remote match specific enough to be useful.
//
// PROVEN LIVE, 2026-08-28: the shell command that ADDED this comment block was
// itself refused by the running hook. The residual demonstrated itself while
// being documented.
//
// Listed here so the limit is VISIBLE and counted, never silently absent.
const RESIDUAL = [
  ["echo '{\"cmd\":\"ssh HOST find / -name x\"}' > /tmp/p.json",
   'writing ABOUT the remote hazard is blocked - structural, see header'],
];

let pass = 0, fail = 0;
console.log('POSITIVE CONTROL - must block:');
for (const [cmd, why] of BLOCK) {
  const ok = verdict(cmd) === 'block';
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${why}`);
}
console.log('NEGATIVE CONTROL - must pass:');
for (const [cmd, why] of ALLOW) {
  const ok = verdict(cmd) === 'allow';
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${why}`);
}
console.log('KNOWN RESIDUAL - blocked, and accepted as such:');
for (const [cmd, why] of RESIDUAL) {
  const v = verdict(cmd.replace('HOST', 'root@204.168.141.77'));
  console.log(`  ${v === 'block' ? 'as documented' : 'CHANGED - update the header'}  ${why}`);
}
console.log(`\n${pass} passed, ${fail} failed, ${RESIDUAL.length} known residual`);
process.exit(fail ? 1 : 0);
