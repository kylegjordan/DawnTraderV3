/**
 * B-DEPLOY-ACTOR-ALLOWLIST (#656 residual) — THE DRIFT TEST.
 *
 * `scripts/dt-deploy.sh` runs as bash on the staging box; `ALERT_ACTORS` is
 * TypeScript. There is no free way to share one list across that boundary, so
 * Langston ruled: keep a readable literal in the shell script, and make DRIFT
 * DETECTABLE rather than avoided by discipline. The load-bearing half is this
 * test, not a generator — a committed generated file would be a THIRD copy
 * whose freshness this same test would then have to check.
 *
 * WHAT IT ASSERTS
 *  1. SET EQUALITY between the bash table and the derived deploy set.
 *  2. The derivation itself: deploy set = ALERT_ACTORS where tag !== 'machine'.
 *     Hand-listing the six would be right today and silently wrong the first
 *     time a machine actor is added.
 *  3. Every alias maps to the SAME canonical value on both sides.
 *  4. The record-line PROPERTY (OBJ-4) — as a property of the TABLE, not a
 *     runtime branch. Langston: an output-side runtime guard is unreachable by
 *     construction, because every input to it is a compile-time-known member of
 *     a fixed table, so no test could exercise it and deleting it would change
 *     nothing. Asserted here instead, where it can actually fail.
 *  5. The usage string names the real set.
 *
 * FAILS CLOSED. Every parse step throws rather than skipping: a script we
 * cannot read, or a literal we cannot parse, is RED. A drift test that quietly
 * passes when it lost its subject is worse than no test — it is the
 * silent-with-zero-opportunity shape.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ALERT_ACTORS,
  ALERT_ACTOR_NORMALISATION,
} from '../../services/system-alerts';

// server/tests/unit -> repo root is THREE levels up, not two. (The two-level
// form used by the fence tests resolves to `server/` and cannot see `scripts/`.)
const REPO_ROOT = join(__dirname, '..', '..', '..');
const DT_DEPLOY = join(REPO_ROOT, 'scripts', 'dt-deploy.sh');

/** The record's key=value line must survive `grep '^field='` + `cut -d= -f2`. */
const RECORD_SAFE = /^[A-Za-z0-9_-]+$/;

function readScript(): string {
  let src: string;
  try {
    src = readFileSync(DT_DEPLOY, 'utf8');
  } catch (e) {
    throw new Error(`FAIL-CLOSED: cannot read ${DT_DEPLOY} — ${String(e)}`);
  }
  if (src.length === 0) throw new Error('FAIL-CLOSED: dt-deploy.sh is empty');
  return src;
}

/** Parse `declare -A DEPLOY_ACTORS=( [k]=v ["k with space"]=v … )`. */
function parseDeployActors(src: string): Map<string, string> {
  const block = /declare -A DEPLOY_ACTORS=\(([\s\S]*?)\n\)/.exec(src);
  if (!block) {
    throw new Error(
      'FAIL-CLOSED: no `declare -A DEPLOY_ACTORS=( … )` block in dt-deploy.sh. ' +
        'The table moved or was renamed — this test lost its subject.',
    );
  }
  const body = block[1].replace(/#[^\n]*/g, ''); // strip comments, keep entries
  const out = new Map<string, string>();
  const entry = /\[(?:"([^"]+)"|([^\]\s]+))\]=(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = entry.exec(body)) !== null) {
    const key = m[1] ?? m[2];
    if (out.has(key)) throw new Error(`FAIL-CLOSED: duplicate bash key '${key}'`);
    out.set(key, m[3]);
  }
  if (out.size === 0) throw new Error('FAIL-CLOSED: DEPLOY_ACTORS block parsed to zero entries');
  return out;
}

// ── the expected set, DERIVED from the tag rather than listed ────────────────
const deployCanonical = ALERT_ACTORS.filter((a) => a.tag !== 'machine').map((a) => a.value);
const deployCanonicalSet = new Set(deployCanonical);
const deployAliases = Object.entries(ALERT_ACTOR_NORMALISATION).filter(([, target]) =>
  deployCanonicalSet.has(target),
);

describe('dt-deploy --by parity with ALERT_ACTORS (B-DEPLOY-ACTOR-ALLOWLIST)', () => {
  it('parses the bash table, fail-closed', () => {
    const table = parseDeployActors(readScript());
    expect(table.size).toBeGreaterThan(0);
  });

  it('the deploy set is the NON-MACHINE actors — derived, not hand-listed', () => {
    // If this ever fails, do not "fix" it by editing the expected list: it means
    // ALERT_ACTORS changed, and the question is whether the new actor DEPLOYS.
    expect(deployCanonical.sort()).toEqual(
      ['cc-a', 'cc-b', 'cc-c', 'cc-infra', 'kyle', 'langston'].sort(),
    );
    const machine = ALERT_ACTORS.filter((a) => a.tag === 'machine').map((a) => a.value);
    for (const m of machine) expect(deployCanonicalSet.has(m)).toBe(false);
  });

  it('bash keys == the six canonical values PLUS every alias targeting them', () => {
    const table = parseDeployActors(readScript());
    const expected = new Set<string>([...deployCanonical, ...deployAliases.map(([k]) => k)]);
    expect([...table.keys()].sort()).toEqual([...expected].sort());
  });

  it('every bash entry maps to the SAME canonical value as the TypeScript side', () => {
    const table = parseDeployActors(readScript());
    for (const v of deployCanonical) expect(table.get(v)).toBe(v); // identity arm
    for (const [alias, target] of deployAliases) expect(table.get(alias)).toBe(target);
  });

  it('no bash entry maps to a machine actor or to an unknown value', () => {
    const table = parseDeployActors(readScript());
    for (const [key, value] of table) {
      expect(deployCanonicalSet.has(value), `'${key}' maps outside the deploy set`).toBe(true);
    }
  });

  it('OBJ-4 — every canonical value is record-line safe: no space, no newline, no "="', () => {
    // Scoped to canonical OUTPUTS. Alias KEYS are exempt by construction — they
    // are lookup keys and never reach the record, which is why the live alias
    // `langston (reviewer)` may carry a space.
    for (const v of deployCanonical) {
      expect(RECORD_SAFE.test(v), `canonical actor '${v}' is not record-line safe`).toBe(true);
    }
    // Positive control: the property discriminates. If these pass, the test is
    // asserting nothing.
    expect(RECORD_SAFE.test('has space')).toBe(false);
    expect(RECORD_SAFE.test('has=equals')).toBe(false);
    expect(RECORD_SAFE.test('has\nnewline')).toBe(false);
  });

  it('the usage string advertises the real deploy set', () => {
    const src = readScript();
    const usage = /^USAGE="([^"]+)"/m.exec(src);
    if (!usage) throw new Error('FAIL-CLOSED: no USAGE= line in dt-deploy.sh');
    for (const v of deployCanonical) {
      expect(usage[1], `usage string omits '${v}'`).toContain(v);
    }
  });

  it('the gate runs BEFORE the lock is taken', () => {
    const src = readScript();
    const gate = src.indexOf('BY_CANON="${DEPLOY_ACTORS[$BY_KEY]:-}"');
    const lock = src.indexOf('if ! mkdir "$LOCK_DIR"');
    expect(gate).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(lock);
  });

  it('no refusal echoes the raw --by value', () => {
    const src = readScript();
    // The four refusal sites found at Step 2. None may interpolate the value.
    expect(src).not.toContain("--by value '$2'");
    expect(src).not.toContain("duplicate --by ('$BY' then '$2')");
    expect(src).not.toContain("'--by $BY' must be");
    expect(src).not.toContain('unrecognised argument: $1');
  });
});
