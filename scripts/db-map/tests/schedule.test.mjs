import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeSuccessfulRun, DAY_MS, freshnessAlertActions, weeklyAlertActions } from '../../../comms-infra/staging/dt-db-map-policy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
let checks = 0;
function check(value, label) { checks += 1; assert.ok(value, label); }

const weeklyTimer = await readFile(resolve(ROOT, 'comms-infra/staging/systemd/dt-db-map-weekly.timer'), 'utf8');
const staleTimer = await readFile(resolve(ROOT, 'comms-infra/staging/systemd/dt-db-map-stale.timer'), 'utf8');
const weeklyService = await readFile(resolve(ROOT, 'comms-infra/staging/systemd/dt-db-map-weekly.service'), 'utf8');
const runner = await readFile(resolve(ROOT, 'comms-infra/staging/dt-db-map-runner.mjs'), 'utf8');
const ci = await readFile(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');
check(weeklyTimer.includes('OnCalendar=Sun *-*-* 06:30:00 UTC'), 'weekly schedule is Sunday 06:30 UTC');
check(weeklyTimer.includes('RandomizedDelaySec=600') && weeklyTimer.includes('Persistent=true'), 'weekly schedule has delay and persistence');
check(staleTimer.includes('OnCalendar=*-*-* 07:15:00 UTC') && staleTimer.includes('Persistent=true'), 'daily stale schedule is 07:15 UTC and persistent');
check(weeklyService.includes('TimeoutStartSec=1800'), 'weekly timeout is 30 minutes');
check(!/\bpm2\b|systemctl\s+(?:restart|reload)|dt-deploy|['"](?:commit|push|checkout)['"]/.test(runner), 'runner does not deploy, commit, push, checkout, or restart the app');
check((runner.match(/DT_DB_MAP_DT_SQL/g) ?? []).length === 1, 'runner exposes one catalog-call boundary');
check(runner.includes("NODE_PATH: '/usr/local/lib/dt-db-map/node_modules'"), 'runner uses the installed pinned TypeScript package');
check(!runner.includes('receipt.success = true'), 'runner cannot mark success before alert delivery');
check(runner.includes("'--root', baselineMap, '--artifact-ref', artifactRef"), 'weekly runner verifies the materialized checked-in baseline and its R/C fence');
check(ci.includes('node scripts/db-map/verify.mjs --repo . --root docs/database-map --artifact-ref "$artifact_ref"'), 'CI verifies the real checked-in baseline and its R/C fence');

assert.deepEqual(weeklyAlertActions({ success: false, structuralMatch: false }), [{ command: 'add', key: 'db-map:failure' }]); checks += 1;
assert.deepEqual(weeklyAlertActions({ success: true, structuralMatch: true }), [
  { command: 'resolve-key', key: 'db-map:failure' },
  { command: 'resolve-key', key: 'db-map:run-stale' },
  { command: 'resolve-key', key: 'db-map:drift' },
]); checks += 1;
assert.deepEqual(weeklyAlertActions({ success: true, structuralMatch: false }).at(-1), { command: 'add', key: 'db-map:drift' }); checks += 1;
assert.deepEqual(freshnessAlertActions({ runAgeMs: 8 * DAY_MS, baselineAgeMs: 35 * DAY_MS }), [
  { command: 'resolve-key', key: 'db-map:run-stale' },
  { command: 'resolve-key', key: 'db-map:baseline-stale' },
]); checks += 1;
assert.deepEqual(freshnessAlertActions({ runAgeMs: 8 * DAY_MS + 1, baselineAgeMs: 35 * DAY_MS + 1 }), [
  { command: 'add', key: 'db-map:run-stale' },
  { command: 'add', key: 'db-map:baseline-stale' },
]); checks += 1;
check(new Set(['db-map:failure', 'db-map:drift', 'db-map:run-stale', 'db-map:baseline-stale']).size === 4, 'four lifecycle keys are independent');
const failedDelivery = { generation_success: false, alert_delivery_success: false, success: false };
assert.throws(() => completeSuccessfulRun(failedDelivery, () => { throw new Error('delivery failed'); })); checks += 1;
check(failedDelivery.generation_success === true && failedDelivery.alert_delivery_success === false && failedDelivery.success === false, 'alert-delivery failure leaves the run unsuccessful');
const delivered = { generation_success: false, alert_delivery_success: false, success: false };
completeSuccessfulRun(delivered, () => {});
check(delivered.generation_success === true && delivered.alert_delivery_success === true && delivered.success === true, 'success is committed only after alert delivery');
console.log(`db-map schedule: ${checks} checks passed`);
