import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assertDatabaseTransport, DatabaseTransportError } from '../../db-tls-boot-check.js';

// B-DB-APP-TLS T-P4 (KD-100): one test per refusal + the pass. Each refusal asserts the CONDITION NAME, so a test
// cannot pass on a different refusal than the one it is about.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-tls-boot-'));
const CA = path.join(dir, 'ca.crt');
const EMPTY_CA = path.join(dir, 'empty.crt');
fs.writeFileSync(CA, '-----BEGIN CERTIFICATE-----\nMIIBfixture\n-----END CERTIFICATE-----\n');
fs.writeFileSync(EMPTY_CA, '');
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const HOST = 'aws-0-eu-central-1.pooler.supabase.com';
const good = (extra = '') => `postgresql://u:p@${HOST}:5432/postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(CA)}${extra}`;

function refusal(url: string | undefined, env: NodeJS.ProcessEnv = {}): string {
  try {
    assertDatabaseTransport(url, env);
  } catch (err) {
    expect(err).toBeInstanceOf(DatabaseTransportError);
    expect((err as Error).message).toContain('[DB_TLS_BOOT_CHECK] refused:');
    return (err as DatabaseTransportError).condition;
  }
  return 'PASSED';
}

describe('B-DB-APP-TLS boot check', () => {
  it('passes verify-full with a pinned root to a host name, and returns the host', () => {
    expect(assertDatabaseTransport(good(), {})).toEqual({ host: HOST });
  });

  it('control: today’s URL shape (no TLS settings) is refused — the reason it cannot ship before the switch', () => {
    expect(refusal(`postgresql://u:p@${HOST}:5432/postgres`)).toBe('ssl_not_object');
  });

  it('refuses ssl=true (TLS with no settings object)', () => {
    expect(refusal(`postgresql://u:p@${HOST}:5432/postgres?ssl=true`)).toBe('ssl_not_object');
  });

  it('refuses sslmode=disable even with a root named', () => {
    expect(refusal(`postgresql://u:p@${HOST}:5432/postgres?sslmode=disable&sslrootcert=${encodeURIComponent(CA)}`)).toBe('ssl_not_object');
  });

  it('refuses verify-full with no root certificate (not pinned)', () => {
    expect(refusal(`postgresql://u:p@${HOST}:5432/postgres?sslmode=verify-full`)).toBe('ca_missing');
  });

  it('refuses an empty root certificate file', () => {
    expect(refusal(`postgresql://u:p@${HOST}:5432/postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(EMPTY_CA)}`)).toBe('ca_missing');
  });

  it('refuses a root certificate file that does not exist, naming it as unreadable', () => {
    expect(refusal(`postgresql://u:p@${HOST}:5432/postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(path.join(dir, 'nope.crt'))}`)).toBe(
      'ca_file_unreadable',
    );
  });

  it('refuses sslmode=no-verify (encrypted but any certificate accepted)', () => {
    expect(refusal(`postgresql://u:p@${HOST}:5432/postgres?sslmode=no-verify&sslrootcert=${encodeURIComponent(CA)}`)).toBe('verification_disabled');
  });

  it('refuses a URL with no host, even with PGHOST set (pg would take PGHOST, unchecked)', () => {
    const noHost = `postgresql://u:p@/postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(CA)}`;
    expect(refusal(noHost)).toBe('host_missing');
    expect(refusal(noHost, { PGHOST: '3.65.151.229' })).toBe('host_missing');
    expect(refusal(`postgresql:///postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(CA)}`)).toBe('host_missing');
  });

  it('refuses ssl=no-verify (the string form pg converts later) as carrying no TLS settings object', () => {
    expect(refusal(`postgresql://u:p@${HOST}:5432/postgres?ssl=no-verify`)).toBe('ssl_not_object');
  });

  it('refuses a directory named as the root certificate, naming it as unreadable', () => {
    expect(refusal(`postgresql://u:p@${HOST}:5432/postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(dir)}`)).toBe('ca_file_unreadable');
  });

  it('refuses a URL the parser rejects (a non-numeric port)', () => {
    expect(refusal(`postgresql://u:p@${HOST}:abc/postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(CA)}`)).toBe('url_unparseable');
  });

  it('refuses an IPv4 host', () => {
    expect(refusal(`postgresql://u:p@3.65.151.229:5432/postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(CA)}`)).toBe('host_is_ip_literal');
  });

  it('refuses an IPv6 host', () => {
    expect(refusal(`postgresql://u:p@[2a05:d014::1]:5432/postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(CA)}`)).toBe('host_is_ip_literal');
  });

  it('refuses PGSSLMODE in the environment, even beside a good URL', () => {
    expect(refusal(good(), { PGSSLMODE: 'verify-full' })).toBe('env_pgsslmode_set');
  });

  it('refuses PGSSLROOTCERT in the environment, even beside a good URL', () => {
    expect(refusal(good(), { PGSSLROOTCERT: CA })).toBe('env_pgsslrootcert_set');
  });

  it('refuses a missing DATABASE_URL', () => {
    expect(refusal(undefined)).toBe('url_missing');
    expect(refusal('')).toBe('url_missing');
  });
});

// The placement fence (server/index.ts imports the gate FIRST) lands WITH the wiring line, in the T-P3 switch window:
// wired before the switch, today's URL would stop the app at its next deploy.
describe('B-DB-APP-TLS parser identity', () => {
  // The check must read the URL with the SAME parser the pool uses. package.json pins pg-connection-string exactly to
  // pg's own version; if a pg upgrade ever moves pg's range off that pin, npm nests a second copy under pg and this
  // fence fails instead of the check silently parsing with a different parser than the pool (Langston, r4 Step 4 call 3).
  it('pg-connection-string resolves to the same file from the app as from pg itself', () => {
    const require = createRequire(import.meta.url);
    const pgDir = path.dirname(require.resolve('pg/package.json'));
    expect(require.resolve('pg-connection-string')).toBe(require.resolve('pg-connection-string', { paths: [pgDir] }));
  });
});

describe('B-DB-APP-TLS boot gate', () => {
  it('the gate checks the real process environment, not a copy', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../db-tls-boot-gate.ts'), 'utf8');
    expect(src).toContain('assertDatabaseTransport(process.env.DATABASE_URL, process.env)');
  });
});
