import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const AUDIT_PATH = 'Claude Comms and Packages/Scope Files/B_DB_HELPER_RETIRE_PRE_AUDIT.md';
const OUTPUT_PATH = 'scripts/db-helper-retire/disposition-ledger.json';
const SOURCE_ARCHIVE_ROOT = '1-system-manual/_archive/deleted-code/b-db-helper-retire/2026-11-24';
const COMPANIONS = ['scripts/analysis/b_price_side_p7h_limiter_class_census.py'];
const audit = await readFile(resolve(REPO, AUDIT_PATH), 'utf8');

function section(start, end) {
  const from = audit.indexOf(start);
  const to = audit.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`missing audited section: ${start} .. ${end}`);
  return audit.slice(from, to);
}

function plain(value) {
  return value.replace(/`/g, '').replace(/\*\*/g, '').trim();
}

function authority(path) {
  if (/^scripts\/analysis\/b_price_side_(?:alias|p7h)/.test(path)) return 'ANALYST Codex Discord 1574747055417593927';
  if (/^scripts\/analysis\/(?:b_xstock_bar_availability_c6_timing_read\.ts|xstock-refusal-holds\.py|xstock-wide-book-stop-vs-next-open\.py)$/.test(path)) return 'ANALYST Codex Discord 1574741149124530270';
  if (path === 'scripts/xstock-hollow-recut.ts') return 'ANALYST Codex Discord 1574741149124530270 OWNER_HOLD';
  if (/^\/home\/deploy\/lang_eg_q[1-8]\.sh$/.test(path)) return 'NEW Codex Discord 1574740272527577089';
  if (/^\/home\/deploy\/lang_c5cf_q[1-7]\.sh$/.test(path)) return 'OLD Codex Discord 1574746839448559617';
  if (/^\/home\/deploy\/(?:\.langston-rerun\.py|lang_8c_(?:mig|rtb|tec)\.sh|lang_kd19_q1\.sh|lang_strk_q(?:2|3)?\.sh)$/.test(path)) return 'ANALYST Codex Discord 1574741149124530270';
  return 'B-DB-HELPER-RETIRE Step 2 PROCEED 3261801a157a66e1fdf36eae69b66b86893786a8 plus correction PROCEED 231a8c1948e1774817e93adde8204783f36a5139';
}

const checkedText = section('### 3. Checked-in B-DB-MAP source', '### 4. Live population');
const checkedIn = [];
for (const line of checkedText.split(/\r?\n/)) {
  const cells = line.split('|').map((cell) => cell.trim());
  if (!/^\d+$/.test(cells[1] ?? '')) continue;
  const number = Number(cells[1]);
  if (number < 1 || number > 92) continue;
  const exact = /`([^`]+)`/.exec(cells[2] ?? '')?.[1];
  const disposition = /`([^`]+)`/.exec(cells[4] ?? '')?.[1];
  const match = /^(.*):(\d+)$/.exec(exact ?? '');
  if (!match || !disposition) throw new Error(`unreadable checked-in row ${number}: ${line}`);
  checkedIn.push({
    number,
    path: match[1],
    line: Number(match[2]),
    kind: plain(cells[3]),
    disposition,
    reason: plain(cells[5]),
    authority: authority(match[1]),
  });
}

const liveText = section('### 4. Live population', '### 5. Provenance');
const live = [];
for (const line of liveText.split(/\r?\n/)) {
  const cells = line.split('|').map((cell) => cell.trim());
  const path = /`(\/home\/deploy\/[^`]+)`/.exec(cells[1] ?? '')?.[1];
  if (!path) continue;
  const sha256 = /`([0-9a-f]{64})`/.exec(cells[5] ?? '')?.[1];
  if (!sha256 || !/^\d+$/.test(cells[3] ?? '') || !/^\d{4}$/.test(cells[4] ?? '')) {
    throw new Error(`unreadable live row: ${line}`);
  }
  live.push({
    path,
    markers: plain(cells[2]).split(',').map((item) => item.trim()),
    bytes: Number(cells[3]),
    mode: cells[4],
    sha256,
    disposition: 'RETIRE',
    reason: 'reviewed top-level one-off with no current process, service, schedule, caller or continuing duty',
    authority: authority(path),
  });
}

const dispositionCounts = Object.fromEntries(
  [...new Set(checkedIn.map((row) => row.disposition))]
    .sort()
    .map((value) => [value, checkedIn.filter((row) => row.disposition === value).length]),
);
if (checkedIn.length !== 92 || live.length !== 53) throw new Error(`population mismatch: checked=${checkedIn.length} live=${live.length}`);
const expected = { OWNER_HOLD: 1, RETAIN_GOVERNED_DIRECT: 36, RETAIN_TEST_LOCAL: 20, RETIRE: 33, ROUTE_DT_SQL: 2 };
if (JSON.stringify(dispositionCounts) !== JSON.stringify(expected)) {
  throw new Error(`disposition mismatch: ${JSON.stringify(dispositionCounts)}`);
}

const ledger = {
  schema_version: 1,
  batch: 'B-DB-HELPER-RETIRE',
  audit_path: AUDIT_PATH,
  audit_sha256: createHash('sha256').update(audit.replace(/\r\n/g, '\n')).digest('hex'),
  reviewed_ref: '231a8c1948e1774817e93adde8204783f36a5139',
  checked_in: checkedIn,
  live,
};
await mkdir(dirname(resolve(REPO, OUTPUT_PATH)), { recursive: true });
await writeFile(resolve(REPO, OUTPUT_PATH), `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
await mkdir(resolve(REPO, SOURCE_ARCHIVE_ROOT), { recursive: true });
for (const path of [...checkedIn.filter((row) => row.disposition === 'RETIRE').map((row) => row.path), ...COMPANIONS]) {
  const bytes = execFileSync('git', ['-C', REPO, 'show', `${ledger.reviewed_ref}:${path}`], { encoding: null, maxBuffer: 64 * 1024 * 1024 });
  const name = `${path.replaceAll('\\', '/').replaceAll('/', '__')}.removed`;
  await writeFile(resolve(REPO, SOURCE_ARCHIVE_ROOT, name), bytes);
}
console.log(`wrote ${OUTPUT_PATH}: ${checkedIn.length} checked-in, ${live.length} live; archived 34 reviewed source blobs`);
