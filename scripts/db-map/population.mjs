import { execFileSync } from 'node:child_process';
import { extname } from 'node:path';
import { CONFIG, classifyPath } from './config.mjs';
import { assert, sha256 } from './util.mjs';

function git(repo, args, options = {}) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: options.binary ? undefined : 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
}

export function peelCommit(repo, ref) {
  const oid = git(repo, ['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  assert(/^[0-9a-f]{40}$/.test(oid), `source ref did not peel to a 40-hex commit: ${ref}`);
  const type = git(repo, ['cat-file', '-t', oid]).trim();
  assert(type === 'commit', `source ref is ${type}, not a commit`);
  return oid;
}

function parseTree(raw) {
  return raw.split('\0').filter(Boolean).map((entry) => {
    const match = /^(\d+)\s+(\w+)\s+([0-9a-f]{40})\t([\s\S]+)$/.exec(entry);
    assert(match, `unreadable git tree row: ${entry.slice(0, 120)}`);
    return { mode: match[1], type: match[2], oid: match[3], path: match[4] };
  }).filter((row) => row.type === 'blob');
}

function exclusionReason(path) {
  const prefix = CONFIG.excludedPrefixes.find((candidate) => path.startsWith(candidate));
  return prefix ? `document_or_output_root:${prefix.slice(0, -1)}` : null;
}

function namedCodePath(path) {
  return CONFIG.suffixes.includes(extname(path).toLowerCase());
}

export function enumeratePopulation(repo, ref) {
  const sourceRef = peelCommit(repo, ref);
  const rows = parseTree(git(repo, ['ls-tree', '-rz', sourceRef]));
  const included = [];
  const excluded = [];
  const nonCodeExtensionless = [];
  for (const row of rows) {
    let classifier = namedCodePath(row.path) ? 'suffix' : null;
    if (row.path === 'Dockerfile') classifier = 'root_dockerfile';
    if (!classifier && !extname(row.path)) {
      const head = git(repo, ['cat-file', 'blob', row.oid], { binary: true }).subarray(0, 2).toString();
      if (head === '#!') classifier = 'shebang';
      else nonCodeExtensionless.push(row.path);
    }
    if (!classifier) continue;
    const item = { ...row, classifier, evidenceClass: classifyPath(row.path) };
    const reason = exclusionReason(row.path);
    if (reason) excluded.push({ ...item, reason });
    else included.push(item);
  }
  included.sort((a, b) => a.path.localeCompare(b.path));
  excluded.sort((a, b) => a.path.localeCompare(b.path));
  const tupleBytes = included.map(({ path, mode, oid }) => `${path}\0${mode}\0${oid}\n`).join('');
  return {
    sourceRef,
    included,
    excluded,
    nonCodeExtensionless: nonCodeExtensionless.sort(),
    includedTupleSha256: sha256(tupleBytes),
    includedPathSha256: sha256(included.map((row) => `${row.path}\n`).join('')),
    excludedPathSha256: sha256(excluded.map((row) => `${row.path}\0${row.reason}\n`).join('')),
  };
}

export function assertPopulationMatches(left, right) {
  const fields = ['includedTupleSha256', 'includedPathSha256', 'excludedPathSha256'];
  for (const field of fields) assert(left[field] === right[field], `population ${field} differs`);
  assert(left.included.length === right.included.length, 'included population count differs');
  assert(left.excluded.length === right.excluded.length, 'excluded population count differs');
}
