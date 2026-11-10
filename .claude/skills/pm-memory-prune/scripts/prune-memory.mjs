#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const beginRe = /^<!-- PM-PRUNE-BEGIN id=([a-z0-9][a-z0-9-]*) date=(\d{4}-\d{2}-\d{2}) -->\r?\n?$/;
const endRe = /^<!-- PM-PRUNE-END -->\r?\n?$/;

function parseArgs(argv) {
  const args = { threshold: 8192, selfTest: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--source') args.source = argv[++i];
    else if (arg === '--archive') args.archive = argv[++i];
    else if (arg === '--threshold') args.threshold = Number(argv[++i]);
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!Number.isInteger(args.threshold) || args.threshold < 1) throw new Error('threshold must be a positive integer');
  if (!args.selfTest && (!args.source || !args.archive)) throw new Error('--source and --archive are required');
  return args;
}

function count(haystack, needle) {
  if (needle.length === 0) return 0;
  let total = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) !== -1) {
    total += 1;
    offset += needle.length;
  }
  return total;
}

function findBlocks(text) {
  const lines = text.match(/.*(?:\r\n|\n|$)/g)?.filter(Boolean) ?? [];
  const blocks = [];
  const ids = new Set();
  let offset = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(beginRe);
    if (!match) {
      if (endRe.test(lines[i])) throw new Error(`orphan end marker at line ${i + 1}`);
      offset += lines[i].length;
      continue;
    }
    const [, id, date] = match;
    if (ids.has(id)) throw new Error(`duplicate id ${id}`);
    ids.add(id);
    const start = offset;
    const payloadStart = offset + lines[i].length;
    let payloadEnd = payloadStart;
    let end = -1;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (beginRe.test(lines[j])) throw new Error(`nested begin marker at line ${j + 1}`);
      if (endRe.test(lines[j])) {
        end = payloadEnd + lines[j].length;
        i = j;
        break;
      }
      payloadEnd += lines[j].length;
    }
    if (end === -1) throw new Error(`missing end marker for ${id}`);
    const payload = text.slice(payloadStart, payloadEnd);
    if (!payload.trim()) throw new Error(`empty payload for ${id}`);
    blocks.push({ id, date, start, end, payload });
    offset = end;
  }
  return blocks;
}

async function prune({ source, archive, threshold }) {
  const sourcePath = resolve(source);
  const archivePath = resolve(archive);
  const before = await readFile(sourcePath, 'utf8');
  const beforeBytes = Buffer.byteLength(before);
  const blocks = findBlocks(before);
  if (beforeBytes <= threshold) return { beforeBytes, afterBytes: beforeBytes, moved: 0, ids: [], underThreshold: true };
  if (blocks.length === 0) throw new Error(`source is ${beforeBytes} bytes but has no marked whole items`);

  let archiveBefore = '';
  try { archiveBefore = await readFile(archivePath, 'utf8'); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    archiveBefore = '# PM memory archive\n\n';
  }
  for (const block of blocks) {
    if (archiveBefore.includes(`<!-- PM-ARCHIVED id=${block.id} -->`)) throw new Error(`archive already contains id ${block.id}`);
  }

  const archiveAdd = blocks.map((block) => {
    const payload = block.payload.endsWith('\n') ? block.payload : `${block.payload}\n`;
    return `## ${block.date} · ${block.id}\n<!-- PM-ARCHIVED id=${block.id} -->\n${payload}\n`;
  }).join('');
  const archiveAfter = `${archiveBefore}${archiveBefore.endsWith('\n') ? '' : '\n'}${archiveAdd}`;

  let after = before;
  const pointerPath = relative(resolve('.'), archivePath).replaceAll('\\', '/');
  for (const block of [...blocks].reverse()) {
    const pointer = `- Archived ${block.date} · ${block.id} → \`${pointerPath}\`\n`;
    after = `${after.slice(0, block.start)}${pointer}${after.slice(block.end)}`;
  }

  await writeFile(archivePath, archiveAfter, 'utf8');
  await writeFile(sourcePath, after, 'utf8');

  const sourceCheck = await readFile(sourcePath, 'utf8');
  const archiveCheck = await readFile(archivePath, 'utf8');
  for (const block of blocks) {
    if (count(archiveCheck, block.payload) !== 1) throw new Error(`payload verification failed for ${block.id}`);
    if (sourceCheck.includes(block.payload)) throw new Error(`payload still present in source for ${block.id}`);
    if (!sourceCheck.includes(`Archived ${block.date} · ${block.id}`)) throw new Error(`pointer missing for ${block.id}`);
  }
  return { beforeBytes, afterBytes: Buffer.byteLength(sourceCheck), moved: blocks.length, ids: blocks.map(({ id }) => id), underThreshold: false };
}

async function selfTest() {
  const dir = await mkdtemp(join(tmpdir(), 'pm-memory-prune-'));
  try {
    const source = join(dir, 'MEMORY_PM.test.md');
    const archive = join(dir, '2026-11.md');
    const seed = '- **CLOSED 2026-11-01:** exact seeded item\n  continuation retained whole\n';
    const filler = 'x'.repeat(9000);
    await writeFile(source, `# test\n${filler}\n<!-- PM-PRUNE-BEGIN id=seeded-closed date=2026-11-01 -->\n${seed}<!-- PM-PRUNE-END -->\n`, 'utf8');
    const over = await prune({ source, archive, threshold: 8192 });
    const sourceAfter = await readFile(source, 'utf8');
    const archiveAfter = await readFile(archive, 'utf8');
    if (!archiveAfter.includes(seed) || sourceAfter.includes(seed) || !sourceAfter.includes('Archived 2026-11-01 · seeded-closed')) {
      throw new Error('over-threshold positive control failed');
    }
    const underSource = join(dir, 'under.md');
    const underArchive = join(dir, 'under-archive.md');
    const underText = '# under threshold\n<!-- PM-PRUNE-BEGIN id=must-stay date=2026-11-02 -->\n- closed but not due\n<!-- PM-PRUNE-END -->\n';
    await writeFile(underSource, underText, 'utf8');
    const under = await prune({ source: underSource, archive: underArchive, threshold: 8192 });
    if (!under.underThreshold || await readFile(underSource, 'utf8') !== underText) throw new Error('under-threshold negative control failed');
    return { over, seededPayloadPreserved: count(archiveAfter, seed) === 1, pointerLeft: true, underThresholdMoved: under.moved };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
const result = args.selfTest ? await selfTest() : await prune(args);
console.log(JSON.stringify(result, null, 2));
