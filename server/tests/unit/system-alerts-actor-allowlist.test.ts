/**
 * B-ALERT-ACTOR-ALLOWLIST (#987) — unit tests for the alert-actor gate.
 *
 * What is proved here, and the mutation each test would catch:
 *   - the table is the SSOT and every member round-trips (drop a member ⇒ fails)
 *   - every alias in the normalisation table stores the CANONICAL value
 *   - refused patterns from the live history are refused, including the
 *     canonical-name-with-text-appended case (Langston L3: exact strings only —
 *     a prefix/regex mapper would turn that test green, which is the point)
 *   - the gate runs BEFORE the lock and BEFORE the file exists (move the call
 *     inside withLock ⇒ the lock-file assertion fails)
 *   - the refusal message never echoes the refused value and never matches the
 *     governance-checker poller's benign-failure regex (echo the value ⇒ fails)
 *   - a historical row with a legacy identity survives a rewrite byte-identical
 *     (a guard mis-placed on the READ path ⇒ fails)
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Point the store at a throwaway file BEFORE importing the module.
const tmpFile = path.join(os.tmpdir(), `actor-alerts-${process.pid}-${Math.random().toString(36).slice(2)}.jsonl`);
process.env.SYSTEM_ALERTS_FILE = tmpFile;

const load = () => import('../../services/system-alerts.js');

afterEach(() => {
  for (const f of [tmpFile, `${tmpFile}.lock`]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
});

const base = { triggers_at: new Date(), category: 'breakage' as const, severity: 'warning' as const, title: 't', body: 'b' };

// poller.mjs classifies a resolve failure whose stderr matches this as BENIGN and
// prints nothing. Kept verbatim here so a drift in either place fails a test.
const POLLER_BENIGN_REGEX = /not found|already|terminal|resolved/i;

describe('ALERT_ACTORS — the table is the SSOT', () => {
  it('every member has a tag and a reason, values are unique and already canonical', async () => {
    const { ALERT_ACTORS, normaliseAlertActor } = await load();
    const values = ALERT_ACTORS.map((a) => a.value);
    expect(new Set(values).size).toBe(values.length);
    for (const a of ALERT_ACTORS) {
      expect(['roster', 'machine', 'human']).toContain(a.tag);
      expect(a.why.length).toBeGreaterThan(0);
      expect(a.value).toBe(a.value.trim().toLowerCase());     // stored form IS the canonical form
      expect(normaliseAlertActor(a.value)).toBe(a.value);      // round-trips
      expect(normaliseAlertActor(a.value.toUpperCase())).toBe(a.value); // case-insensitive membership
      expect(POLLER_BENIGN_REGEX.test(a.value)).toBe(false);   // no member can trip the poller's regex via the message
    }
  });

  it('the four roster sessions are members (matches .claude/cc-session-roster.json aliases)', async () => {
    const { ALERT_ACTORS } = await load();
    const roster = ALERT_ACTORS.filter((a) => a.tag === 'roster').map((a) => a.value).sort();
    expect(roster).toEqual(['cc-a', 'cc-b', 'cc-c', 'cc-infra']);
  });
});

describe('normalisation — exact aliases store the canonical; everything else is refused', () => {
  it('every alias maps to a member', async () => {
    const { ALERT_ACTOR_NORMALISATION, ALERT_ACTORS, normaliseAlertActor } = await load();
    const members = new Set(ALERT_ACTORS.map((a) => a.value));
    for (const [alias, canonical] of Object.entries(ALERT_ACTOR_NORMALISATION)) {
      expect(members.has(canonical)).toBe(true);
      expect(normaliseAlertActor(alias)).toBe(canonical);
      expect(normaliseAlertActor(`  ${alias.toUpperCase()}  `)).toBe(canonical); // trim + case
    }
  });

  it('the live history’s spellings land on the right canonical value', async () => {
    const { normaliseAlertActor } = await load();
    expect(normaliseAlertActor('CC-A')).toBe('cc-a');
    expect(normaliseAlertActor('cc-a-old-claude')).toBe('cc-a');
    expect(normaliseAlertActor('cc-analyst')).toBe('cc-c');
    expect(normaliseAlertActor('cc-c-analyst')).toBe('cc-c');
    expect(normaliseAlertActor('CC-C')).toBe('cc-c');
    expect(normaliseAlertActor('infra-claude')).toBe('cc-infra');
    expect(normaliseAlertActor('Langston')).toBe('langston');
    expect(normaliseAlertActor('Langston (reviewer)')).toBe('langston');
    expect(normaliseAlertActor('langston-reviewer')).toBe('langston');
    expect(normaliseAlertActor('Langston-reviewer')).toBe('langston');
    expect(normaliseAlertActor('kyle-direct')).toBe('kyle');
  });

  it('REFUSES the retired and one-off forms from the live history — and a canonical name with text appended', async () => {
    const { normaliseAlertActor } = await load();
    for (const refused of [
      'cc-session-2026-06-19',
      'cc-session-2026-09-02',
      'cc-2026-07-08-govflood',
      'cc-a-2026-07-14',
      'phase4-verification',
      'b-new-43-test',
      'test',
      'system',
      'dispatcher',
      'cc-b-seam-test',
      'cc-b-seam-test-cleanup',
      'b-new-40-soak-verify-12345',                                   // the old PID-suffixed default
      'langston (transport: langston ssh key via deploy@staging)',   // 60 chars: canonical + appended text — EXACT table refuses it
      'cc-b ',                                                       // trimmed → member; the point is the next one:
      'cc-b extra',
      '',
      '   ',
    ]) {
      if (refused === 'cc-b ') { expect(normaliseAlertActor(refused)).toBe('cc-b'); continue; }
      expect(normaliseAlertActor(refused), refused).toBeNull();
    }
    expect(normaliseAlertActor(undefined)).toBeNull();
    expect(normaliseAlertActor(42)).toBeNull();
  });
});

describe('assertAlertActor — the refusal', () => {
  it('throws a typed AlertActorError whose message names the set and NEVER echoes the value', async () => {
    const { assertAlertActor, AlertActorError, ALERT_ACTORS } = await load();
    // Adversarial input: every word the poller treats as benign, plus a marker.
    const adversarial = 'already resolved terminal not found ZZMARKERZZ';
    let caught: unknown;
    try { assertAlertActor(adversarial); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(AlertActorError);
    const msg = (caught as Error).message;
    expect(msg).not.toContain('ZZMARKERZZ');
    expect(POLLER_BENIGN_REGEX.test(msg)).toBe(false);
    expect((caught as InstanceType<typeof AlertActorError>).refusedLength).toBe(adversarial.length);
    for (const a of ALERT_ACTORS) expect(msg).toContain(a.value);
  });

  it('returns the canonical value for an alias', async () => {
    const { assertAlertActor } = await load();
    expect(assertAlertActor('Langston (reviewer)')).toBe('langston');
  });
});

describe('ackAlert / resolveAlert — gated before the lock, canonical written', () => {
  it('ackAlert refuses before touching the file or the lock', async () => {
    const { ackAlert, AlertActorError } = await load();
    // No file yet: a gate placed AFTER ensureFileExists() would create it.
    expect(fs.existsSync(tmpFile)).toBe(false);
    await expect(ackAlert('no-such-id', 'cc-session-2026-09-02')).rejects.toBeInstanceOf(AlertActorError);
    expect(fs.existsSync(tmpFile)).toBe(false);
    expect(fs.existsSync(`${tmpFile}.lock`)).toBe(false);
  });

  it('the evidence-gate message echoes neither the evidence nor the id (both caller-typed on the CLI path)', async () => {
    const { resolveAlert } = await load();
    // valid actor, adversarial id AND adversarial evidence: the message must carry neither
    let msg = '';
    try { await resolveAlert('already resolved terminal not found ZZIDZZ', 'cc-b', 'ZZEVIDENCEZZ resolved', 'cli'); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain('resolution_evidence rejected');
    expect(msg).not.toContain('ZZIDZZ');
    expect(msg).not.toContain('ZZEVIDENCEZZ');
    expect(POLLER_BENIGN_REGEX.test(msg)).toBe(false);
  });

  it('resolveAlert refuses the identity before the evidence gate runs', async () => {
    const { resolveAlert, AlertActorError } = await load();
    // invalid evidence AND invalid actor: the actor error must be the one thrown
    await expect(resolveAlert('no-such-id', 'cc-session-2026-09-02', 'looks fine', 'cli')).rejects.toBeInstanceOf(AlertActorError);
  });

  it('stores the CANONICAL value on ack and on resolve, including the never-acked resolve branch', async () => {
    const { addAlert, fireDue, ackAlert, resolveAlert } = await load();
    const a = await addAlert(base);
    await fireDue();
    const acked = await ackAlert(a.id, 'CC-B');
    expect(acked!.acknowledged_by).toBe('cc-b');

    const b = await addAlert(base);
    const r = await resolveAlert(b.id, 'Langston (reviewer)', 'server/x.ts:10', 'cli');
    expect(r!.resolved_by_claimed).toBe('langston');
    expect(r!.acknowledged_by).toBe('langston'); // never-acked branch writes the canonical too
  });

  it('a repeat resolve (the checker’s pattern) is bound by the gate as well', async () => {
    const { addAlert, resolveAlert, AlertActorError } = await load();
    const a = await addAlert(base);
    await resolveAlert(a.id, 'governance-checker', 'NO-EVIDENCE-GIVEN', 'cli');
    await expect(resolveAlert(a.id, 'governance-checker-2026', 'NO-EVIDENCE-GIVEN', 'cli')).rejects.toBeInstanceOf(AlertActorError);
    const again = await resolveAlert(a.id, 'governance-checker', 'NO-EVIDENCE-GIVEN', 'cli');
    expect(again!.resolved_by_claimed).toBe('governance-checker');
  });
});

describe('OBJ-5 — history is not rewritten', () => {
  it('a historical row holding a legacy identity survives a rewrite byte-identical', async () => {
    const { addAlert, fireDue, ackAlert, readAllAlerts } = await load();
    // Fixture written THROUGH the library (JSON.stringify form), then given a
    // legacy identity the way the historical data has it — never hand-authored.
    const legacy = await addAlert({ ...base, title: 'legacy' });
    const other = await addAlert({ ...base, title: 'other' });
    const all = readAllAlerts();
    const row = all.find((x) => x.id === legacy.id)!;
    row.state = 'acknowledged';
    row.acknowledged_at = '2026-06-19T10:00:00.000Z';
    row.acknowledged_by = 'cc-session-2026-06-19';
    fs.writeFileSync(tmpFile, all.map((x) => JSON.stringify(x)).join('\n') + '\n');
    const before = fs.readFileSync(tmpFile, 'utf-8').split('\n').find((l) => l.includes(legacy.id))!;

    // Rewrite the whole file through the public path by acting on a DIFFERENT row.
    await fireDue();
    await ackAlert(other.id, 'cc-b');

    const after = fs.readFileSync(tmpFile, 'utf-8').split('\n').find((l) => l.includes(legacy.id))!;
    expect(after).toBe(before);
    expect(readAllAlerts().find((x) => x.id === legacy.id)!.acknowledged_by).toBe('cc-session-2026-06-19');
  });

  // ─── #1000 (2026-09-04) — TOTALITY REGRESSION ──────────────────────────────
  // The gate shipped on 2026-09-02 with `ALERT_ACTOR_NORMALISATION[key]` on a
  // PLAIN OBJECT LITERAL, so the lookup fell through to Object.prototype and the
  // `??` — which only catches null/undefined — never saw the inherited value.
  // Found at Step 2 of B-DEPLOY-ACTOR-ALLOWLIST by a fresh reader, then
  // reproduced BY EXECUTION rather than by reading. These are the exact probe
  // inputs from that reproduction.
  //
  // NOTE the `load()` indirection: this suite must set SYSTEM_ALERTS_FILE before
  // the module is imported, so every reference goes through the lazy import.
  describe('#1000 — normalise is TOTAL: no prototype key escapes the gate', () => {
    // `constructor` was the worst of them: it returned the Object FUNCTION, the
    // truthy check in assertAlertActor passed it, and JSON.stringify then DROPPED
    // it — so the row landed with NO acknowledged_by key at all. An ABSENT
    // attribution, inside the gate built to stop free-text attribution.
    for (const evil of ['constructor', '__proto__', ' CONSTRUCTOR ', 'toString', 'valueOf', 'hasOwnProperty']) {
      it(`refuses ${JSON.stringify(evil)}`, async () => {
        const { normaliseAlertActor, assertAlertActor } = await load();
        expect(normaliseAlertActor(evil)).toBeNull();
        expect(() => assertAlertActor(evil)).toThrow();
      });
    }

    // ⛔ Step-4 CONDITION 1 (Langston). The version of this test that shipped in the
    // first Step-3 commit was VACUOUS and carried a comment certifying the guard it
    // did not exercise. It probed `constructor`/`__proto__` (both short-circuit at
    // `hasOwnProperty`), `cc-b` (short-circuits at ALERT_ACTOR_VALUES) and
    // `cc-analyst` (reaches guard 2 and PASSES it) — then asserted
    // `r === null || typeof r === 'string'`, which `null` satisfies. Deleting the
    // guard left it green. #661 leg 3: a never-invoked path is silent with zero
    // opportunity, however loud its body.
    //
    // The guard is genuinely reachable — `Readonly<>` is compile-time only and
    // nothing freezes the table — so the reject path can be driven directly.
    it('guard 2 REJECTS a non-string value planted in the table', async () => {
      const mod = await load();
      const table = mod.ALERT_ACTOR_NORMALISATION as unknown as Record<string, unknown>;
      const KEY = 'ccb-c1-probe-nonstring';
      try {
        table[KEY] = 42; // not a string: only guard 2 can catch this
        expect(mod.normaliseAlertActor(KEY)).toBeNull();
        expect(() => mod.assertAlertActor(KEY)).toThrow();
      } finally {
        delete table[KEY];
      }
      expect(Object.prototype.hasOwnProperty.call(table, KEY)).toBe(false); // restored
    });

    it('guard 2 REJECTS a string that maps OUTSIDE the canonical set', async () => {
      // The second half of the same guard, which the condition did not name: a
      // string target is not sufficient — it must also BE a canonical actor.
      const mod = await load();
      const table = mod.ALERT_ACTOR_NORMALISATION as unknown as Record<string, unknown>;
      const KEY = 'ccb-c1-probe-offset';
      try {
        table[KEY] = 'not-a-canonical-actor';
        expect(mod.normaliseAlertActor(KEY)).toBeNull();
      } finally {
        delete table[KEY];
      }
      expect(Object.prototype.hasOwnProperty.call(table, KEY)).toBe(false);
    });

    it('POSITIVE CONTROL — the real actors and aliases still pass', async () => {
      // Without this the block above is satisfied by a function that refuses
      // everything.
      const { normaliseAlertActor } = await load();
      expect(normaliseAlertActor('cc-b')).toBe('cc-b');
      expect(normaliseAlertActor('CC-B')).toBe('cc-b');
      expect(normaliseAlertActor('  cc-analyst  ')).toBe('cc-c');
      expect(normaliseAlertActor('langston (reviewer)')).toBe('langston');
      expect(normaliseAlertActor('kyle-direct')).toBe('kyle');
      expect(normaliseAlertActor('nonsense')).toBeNull();
    });
  });
});
