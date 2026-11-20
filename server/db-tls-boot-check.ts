// ─── B-DB-POOL-GUARD r4 = B-DB-APP-TLS, T-P2 (KD-100, #353 app-TLS leg): the boot check ───────────────────────────
// The app refuses to start unless DATABASE_URL asks for a VERIFIED, PINNED TLS connection. Plan and findings:
// `B_DB_POOL_GUARD_PRE_AUDIT.md` T-P2 (C-1, T-A3), approved by Langston at r4 Step 2.
//
// WHY THESE FIVE CONDITIONS — what pg actually does with the URL (pg 8.13.1 + pg-connection-string 2.7.0, read at
// node_modules): `parse()` turns ANY of sslcert/sslkey/sslrootcert/sslmode into `ssl = {}`; `sslrootcert` becomes
// `ssl.ca` (the file is read synchronously, inside parse); `sslmode=disable` sets `ssl = false`; `sslmode=no-verify`
// sets `ssl.rejectUnauthorized = false`; prefer/require/verify-ca/verify-full leave the object as is, so Node's TLS
// defaults (verify the chain AND the hostname) apply. pg ALSO reads the PGSSLMODE environment variable
// (connection-parameters.js:22), which can override what the URL says — so it is refused outright, as is
// PGSSLROOTCERT, rather than reasoned about.
//   1. `ssl` is an object                — no TLS settings at all, `ssl=true`, or `sslmode=disable` all fail here.
//   2. `ssl.ca` is a non-empty string    — the root is PINNED to our file, not whatever the OS trust store holds.
//   3. `ssl.rejectUnauthorized !== false` — `sslmode=no-verify` encrypts but accepts any certificate.
//   4. the host is a NAME, not an IP     — hostname verification needs a name the certificate can carry.
//   5. no PGSSLMODE / PGSSLROOTCERT      — a second, invisible place the transport could be changed from.
// On failure it THROWS naming the condition. There is no fallback and no bypass flag (CLAUDE.md §11).
//
// ⚠️ REACH, stated: this guards the APP process (`server/index.ts` imports `db-tls-boot-gate.ts` FIRST). It does NOT
// reach standalone scripts that open their own connection (T-C4); the unencrypted-connection page (T-P1) is what
// sees those, within its 25 s sampling limit.
import net from 'node:net';
import { parse } from 'pg-connection-string';

export type DatabaseTransportCondition =
  | 'url_missing'
  | 'url_unparseable'
  | 'ca_file_unreadable'
  | 'ssl_not_object'
  | 'ca_missing'
  | 'verification_disabled'
  | 'host_is_ip_literal'
  | 'env_pgsslmode_set'
  | 'env_pgsslrootcert_set';

export class DatabaseTransportError extends Error {
  readonly condition: DatabaseTransportCondition;
  constructor(condition: DatabaseTransportCondition, detail: string) {
    super(`[DB_TLS_BOOT_CHECK] refused: ${condition} — ${detail}`);
    this.name = 'DatabaseTransportError';
    this.condition = condition;
  }
}

/** Pure: throws DatabaseTransportError naming the FIRST failed condition, or returns the verified host. */
export function assertDatabaseTransport(url: string | undefined, env: NodeJS.ProcessEnv): { host: string } {
  // The environment first: these act on every connection whatever the URL says.
  if (env.PGSSLMODE !== undefined) {
    throw new DatabaseTransportError('env_pgsslmode_set', 'PGSSLMODE is set in the environment; the URL must be the only transport setting');
  }
  if (env.PGSSLROOTCERT !== undefined) {
    throw new DatabaseTransportError('env_pgsslrootcert_set', 'PGSSLROOTCERT is set in the environment; the URL must be the only transport setting');
  }
  if (!url) {
    throw new DatabaseTransportError('url_missing', 'DATABASE_URL is not set');
  }

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(url);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    // parse() reads sslrootcert/sslcert/sslkey with readFileSync, so a missing or unreadable CA surfaces HERE.
    if (code === 'ENOENT' || code === 'EACCES' || code === 'EISDIR') {
      throw new DatabaseTransportError('ca_file_unreadable', `a certificate file named in DATABASE_URL could not be read (${code})`);
    }
    throw new DatabaseTransportError('url_unparseable', `DATABASE_URL could not be parsed (${(err as Error)?.message ?? String(err)})`);
  }

  // The published types say `boolean | string`; at runtime parse() builds an object for the TLS cases.
  const ssl = parsed.ssl as unknown;
  if (ssl === null || typeof ssl !== 'object') {
    throw new DatabaseTransportError('ssl_not_object', `DATABASE_URL carries no TLS settings (ssl=${JSON.stringify(ssl)}); expected sslmode=verify-full&sslrootcert=<file>`);
  }
  const sslObj = ssl as { ca?: unknown; rejectUnauthorized?: unknown };
  if (typeof sslObj.ca !== 'string' || sslObj.ca.trim().length === 0) {
    throw new DatabaseTransportError('ca_missing', 'DATABASE_URL names no root certificate (sslrootcert), or the file is empty');
  }
  if (sslObj.rejectUnauthorized === false) {
    throw new DatabaseTransportError('verification_disabled', 'DATABASE_URL turns certificate verification off (sslmode=no-verify)');
  }

  const rawHost = parsed.host ?? '';
  const host = rawHost.replace(/^\[|\]$/g, '');
  if (net.isIP(host) !== 0) {
    throw new DatabaseTransportError('host_is_ip_literal', 'DATABASE_URL names the database by IP address; the certificate can only be checked against a host name');
  }
  return { host };
}
