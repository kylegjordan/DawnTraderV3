// B-TASK-LIST-SLOT (#1009) P1 — OFFLINE PREVIEW of the Tier-1 ledger-row check. Performs NO alert IO.
// Answers, BEFORE a deploy: "which batches would the checker alert on, at this ref?" — so the set can
// be PRE-REGISTERED and the first live tick compared against it (pre-audit P1, Langston condition 7).
// Replicates tick()'s enrolment exactly: the -n300 commit window → completion/scope first-add anchors →
// anchorClosedBatches → applyCutoff(ENFORCEMENT_CUTOFF_MS). Grades only batches with a completion report.
// Use the BOX's cutoff, not the repo default:
//   GOV_CUTOFF=2026-06-24T12:07:01Z node scripts/governance-checker/ledger-rows-preview.mjs
// ⚠️ A SNAPSHOT: the window moves with every push, so the enrolled set is true at the printed ref only.
// ⚠️ Not applied here: confirmed na-skip rows in GOVERNANCE_EXCEPTIONS.md, which suppress an ALERT —
//    grep that file for the batch and row before pre-registering.
import { execFileSync } from 'node:child_process';
import { computeBatchStates, anchorClosedBatches, applyCutoff } from './poller.mjs';
import { gitLog, completionReportCommitTime, scopeCommitTime, checkLedgerRows, findGlobDoc, REPO_ROOT } from './checker.mjs';
import { ENFORCEMENT_CUTOFF_MS, LEDGER_ROWS } from './config.mjs';

const ref = process.env.GOV_REF || process.env.GOV_BRANCH || 'origin/migration/aws-supabase';
const commits = gitLog(300);
const sha = execFileSync('git', ['rev-parse', '--short', ref], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
const { batches } = computeBatchStates(commits);
for (const b of batches) {
  b.completionAddTime = completionReportCommitTime(b.batchId);
  b.scopeAddTime = scopeCommitTime(b.batchId);
}
anchorClosedBatches(batches);
const enforceable = applyCutoff(batches, ENFORCEMENT_CUTOFF_MS);
const closed = enforceable.filter((b) => b.hasCompletionReport);
console.log(`ref ${ref} @ ${sha} · window ${commits.length} commits · cutoff ${new Date(ENFORCEMENT_CUTOFF_MS).toISOString()}`);
console.log(`batches in window ${batches.length} · enrolled ${enforceable.length} · with a completion report ${closed.length}`);
console.log(`rows: ${Object.entries(LEDGER_ROWS).map(([k, v]) => `${k} since ${new Date(v.sinceMs).toISOString()}`).join(' · ')}\n`);

const wouldAlert = [];
for (const b of closed) {
  const reports = findGlobDoc(b.batchId, 'completion_report').map((p) => p.replace(/\\/g, '/').split('/').pop());
  for (const [row, graded] of Object.entries(checkLedgerRows(b.batchId))) {
    const tag = graded === false ? 'ALERT' : graded === true ? 'pass ' : 'n/g  ';
    console.log(`${tag}  ${b.batchId.padEnd(32)} ${row.padEnd(11)} report first-added ${new Date(b.completionAddTime).toISOString()}  ${reports.join(', ')}`);
    if (graded === false) wouldAlert.push(`${b.batchId}:${row}`);
  }
}
console.log(`\nWOULD ALERT (${wouldAlert.length}): ${wouldAlert.join(' · ') || 'none'}`);
