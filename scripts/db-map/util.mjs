import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function compareBytes(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(ordered(value), null, 2)}\n`;
}

export async function writeAtomic(path, data, mode = 0o600) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, data, { mode });
  await rename(tmp, path);
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function resetPrivateDir(path) {
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true, mode: 0o700 });
}

function escapeRelationPart(value) {
  assert(typeof value === 'string' && value.length > 0 && !value.includes('\0'), 'database identifier is empty or contains NUL');
  return value.replaceAll('%', '%25').replaceAll('.', '%2E');
}

export function relationKey(schema, name) {
  return `${escapeRelationPart(schema)}.${escapeRelationPart(name)}`;
}

export function posixJoin(...parts) {
  return join(...parts).replaceAll('\\', '/');
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (quoted) throw new Error('catalog CSV ended inside a quoted field');
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows.shift();
  return rows.filter((values) => values.some(Boolean)).map((values) => {
    assert(values.length === header.length, `catalog CSV row has ${values.length} fields; expected ${header.length}`);
    return Object.fromEntries(header.map((name, i) => [name, values[i]]));
  });
}

export async function artifactHashes(root, relativePaths) {
  const out = {};
  for (const path of [...relativePaths].sort(compareBytes)) out[path] = sha256(await readFile(join(root, path)));
  return out;
}
