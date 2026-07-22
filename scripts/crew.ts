#!/usr/bin/env tsx
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-CREW-COORD — `crew` CLI (RUNNING_ISSUES #554, scope OBJ-3)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * The coordination discipline as ONE LINE, not a query. Three CC sessions share
 * one working tree; "who holds the wrench" was announced in chat, which works
 * only if everyone posts AND everyone reads in time. This makes it queryable.
 *
 *   crew board                        what is held right now (+ staleness)
 *   crew claim <path...> [--note X]   I am editing these paths
 *   crew push-begin [--note X]        I am pushing (at most one at a time)
 *   crew release [--id N] [--kind K]  done — release my claims/push
 *   crew reap [--apply]               report stale claims; --apply expires them
 *
 * SESSION IDENTITY comes from $CREW_SESSION (or --session). There is no default:
 * a board where entries can be attributed to the wrong session is worse than no
 * board, and a silent default is exactly the absent-as-valid class (#546).
 *
 *   export CREW_SESSION="ANALYST Claude"    # once per session
 *
 * ★ LANGSTON IS A READ-ONLY BOARD READER, never a claimant (who-holds-the-wrench:
 *   he reviews and verifies, he never pushes). `crew board` is his command.
 *
 * ★ WHAT THIS BOARD DOES NOT CLAIM (Langston-ruled): visibility + push
 *   serialization, NOT atomicity. It cannot close #557 — that is an index race.
 *   A GREEN BOARD IS NOT A GUARANTEE.
 *
 * Exit codes: 0 ok · 1 usage/precondition · 2 board unreachable (reads only).
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import {
  readBoard,
  claimPaths,
  pushBegin,
  release,
  reapStale,
  closeBoard,
  STALE_CLAIM_AFTER_MS,
  type CrewEntry,
  type CrewKind,
} from '../server/services/crew-coordination.js';
import { pathsOverlapEitherWay } from '../server/services/crew-path-overlap.mjs';

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

/** No silent default — an entry attributed to the wrong session is worse than none. */
function requireSession(args: string[]): string {
  const s = getFlag(args, 'session') ?? process.env.CREW_SESSION;
  if (!s || !s.trim()) {
    console.error(
      'No session identity.\n' +
        '  Set it once:  export CREW_SESSION="ANALYST Claude"\n' +
        '  Or pass:      --session "ANALYST Claude"\n' +
        'Deliberately has no default: a claim attributed to the wrong session is\n' +
        'worse than no claim at all.',
    );
    process.exit(1);
  }
  return s.trim();
}

function ageOf(d: Date): string {
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return hrs < 48 ? `${hrs}h${mins % 60}m` : `${Math.floor(hrs / 24)}d`;
}

function isStale(e: CrewEntry): boolean {
  return Date.now() - e.createdAt.getTime() > STALE_CLAIM_AFTER_MS;
}

function printEntry(e: CrewEntry): void {
  const stale = isStale(e) ? '  ⚠ STALE' : '';
  const head = `  [${e.id}] ${e.kind.toUpperCase().padEnd(5)} ${e.session}  (${ageOf(e.createdAt)} ago)${stale}`;
  console.log(head);
  if (e.paths.length) console.log(`        paths: ${e.paths.join(', ')}`);
  if (e.note) console.log(`        note:  ${e.note}`);
}

async function cmdBoard(): Promise<number> {
  const board = await readBoard();
  if (!board.reachable) {
    // Fail-open by design: report clearly, do not pretend the board is empty.
    console.error('⚠ BOARD UNREACHABLE — this is NOT the same as "nothing is held".');
    console.error(`  ${board.error ?? 'unknown error'}`);
    return 2;
  }
  if (board.entries.length === 0) {
    console.log('Board is clear — no active claims or pushes.');
    return 0;
  }
  const pushes = board.entries.filter((e) => e.kind === 'push');
  const claims = board.entries.filter((e) => e.kind === 'claim');
  if (pushes.length) {
    console.log('PUSH IN PROGRESS:');
    pushes.forEach(printEntry);
  }
  if (claims.length) {
    console.log(`ACTIVE CLAIMS (${claims.length}):`);
    claims.forEach(printEntry);
  }
  if (board.entries.some(isStale)) {
    console.log(
      `\n⚠ Entries older than ${Math.round(STALE_CLAIM_AFTER_MS / 3600000)}h are marked STALE.\n` +
        '  They are NOT auto-cleared. Ask the holder, or: crew reap --apply',
    );
  }
  return 0;
}

async function cmdClaim(args: string[]): Promise<number> {
  const session = requireSession(args);
  const paths = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (paths.length === 0) {
    console.error('Usage: crew claim <path> [<path>...] [--note "batch id / intent"]');
    return 1;
  }
  // Show what is ALREADY held before claiming — the whole point is seeing the
  // collision before you make it, not being told about it afterwards.
  //
  // ★ Uses `pathsOverlapEitherWay`, NOT `overlappingClaims`. The difference is
  //   deliberate: the commit guard asks the UNIDIRECTIONAL question (does an
  //   existing claim cover this staged file?), while a claim PREVIEW asks the
  //   SYMMETRIC one — claiming `server/core` when someone holds
  //   `server/core/rtb/x.ts` IS a collision even though their claim does not
  //   cover my path. Both delegate to the same matcher in
  //   `crew-path-overlap.mjs`, so only the intended semantics differ.
  //   (Langston Step-4: an earlier inline copy appended '/' unconditionally and
  //   would have silently matched NOTHING for a trailing-slash claim.)
  const board = await readBoard();
  if (board.reachable) {
    const conflicts = board.entries.filter(
      (e) =>
        e.kind === 'claim' &&
        e.session !== session &&
        e.paths.some((cp) => paths.some((p) => pathsOverlapEitherWay(cp, p))),
    );
    if (conflicts.length) {
      console.log('⚠ OVERLAPPING CLAIMS ALREADY HELD:');
      conflicts.forEach(printEntry);
      console.log('  (Recording yours anyway — the board reports, it does not block.)\n');
    }
  }
  const entry = await claimPaths(session, paths, getFlag(args, 'note'));
  console.log(`Claimed [${entry.id}] for ${session}: ${paths.join(', ')}`);
  console.log(`Release with: crew release --id ${entry.id}`);
  return 0;
}

async function cmdPushBegin(args: string[]): Promise<number> {
  const session = requireSession(args);
  const entry = await pushBegin(session, getFlag(args, 'note'));
  console.log(`Push lock [${entry.id}] held by ${session}.`);
  console.log(`★ RELEASE IT WHEN THE PUSH LANDS: crew release --id ${entry.id}`);
  return 0;
}

async function cmdRelease(args: string[]): Promise<number> {
  const idRaw = getFlag(args, 'id');
  const kind = getFlag(args, 'kind') as CrewKind | undefined;
  if (kind && kind !== 'claim' && kind !== 'push') {
    console.error(`--kind must be 'claim' or 'push' (got '${kind}')`);
    return 1;
  }
  const id = idRaw !== undefined ? Number(idRaw) : undefined;
  if (idRaw !== undefined && !Number.isInteger(id)) {
    console.error(`--id must be an integer (got '${idRaw}')`);
    return 1;
  }
  // Releasing by id needs no session; releasing "mine" does.
  const session = id === undefined ? requireSession(args) : getFlag(args, 'session') ?? process.env.CREW_SESSION;
  const released = await release({ id, session: id === undefined ? session : undefined, kind });
  if (released.length === 0) {
    // A release that matched nothing is a real signal, not a no-op — it usually
    // means it was already released, or you are looking at someone else's entry.
    console.log('Released nothing — no matching ACTIVE entry.');
    return 0;
  }
  console.log(`Released ${released.length}:`);
  released.forEach(printEntry);
  return 0;
}

async function cmdReap(args: string[]): Promise<number> {
  const apply = hasFlag(args, 'apply');
  const { stale, expired } = await reapStale({ dryRun: !apply });
  if (stale.length === 0) {
    console.log('No stale entries.');
    return 0;
  }
  console.log(`${stale.length} stale (older than ${Math.round(STALE_CLAIM_AFTER_MS / 3600000)}h):`);
  stale.forEach(printEntry);
  if (!apply) {
    console.log('\nDRY RUN — nothing changed. Re-run with --apply to expire these.');
    console.log('Expiry is a visible state transition with a timestamp, never a delete.');
  } else {
    console.log(`\nExpired ${expired.length}. Each carries released_at; nothing was deleted.`);
  }
  return 0;
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  let code = 0;
  try {
    switch (cmd) {
      case 'board':
        code = await cmdBoard();
        break;
      case 'claim':
        code = await cmdClaim(args);
        break;
      case 'push-begin':
        code = await cmdPushBegin(args);
        break;
      case 'release':
        code = await cmdRelease(args);
        break;
      case 'reap':
        code = await cmdReap(args);
        break;
      default:
        console.error(
          'Usage:\n' +
            '  crew board                            what is held right now\n' +
            '  crew claim <path...> [--note X]       I am editing these paths\n' +
            '  crew push-begin [--note X]            I am pushing (one at a time)\n' +
            '  crew release [--id N] [--kind K]      done\n' +
            '  crew reap [--apply]                   report/expire stale entries\n\n' +
            'Identity: export CREW_SESSION="ANALYST Claude"',
        );
        code = 1;
    }
  } catch (err) {
    // Writes fail LOUD — a claim you believe you hold but that was never recorded
    // is false confidence, which is worse than a visible error.
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    code = 1;
  } finally {
    await closeBoard();
  }
  process.exit(code);
}

void main();
