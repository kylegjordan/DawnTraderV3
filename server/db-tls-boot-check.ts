// ─── B-DB-POOL-GUARD r4 = B-DB-APP-TLS, T-P2 (KD-100, #353 app-TLS leg): the boot check ───────────────────────────
// The app refuses to start unless DATABASE_URL asks for a VERIFIED, PINNED TLS connection. Plan and findings:
// `B_DB_POOL_GUARD_PRE_AUDIT.md` T-P2 (C-1, T-A3), approved by Langston at r4 Step 2.
//
// WHY THESE SIX CONDITIONS — what pg actually does with the URL (pg 8.13.1 + pg-connection-string 2.7.0, read at
// node_modules): `parse()` turns ANY of sslcert/sslkey/sslrootcert/sslmode into `ssl = {}`; `sslrootcert` becomes
// `ssl.ca` (the file is read synchronously, inside parse); `sslmode=disable` sets `ssl = false`; `sslmode=no-verify`
// sets `ssl.rejectUnauthorized = false`; prefer/require/verify-ca/verify-full leave the object as is, so Node's TLS
// defaults (verify the chain AND the hostname) apply.
// The ENVIRONMENT is a second, invisible door, and pg uses it as a FALLBACK, never an override: PGSSLMODE is read only
// when the URL carries no ssl at all (connection-parameters.js:81, `typeof config.ssl === 'undefined'`), which
// condition 1 already forbids — and PGHOST is read only when the URL's host is empty (`val()`, :9-19, used at :67).
// PGSSLMODE is refused outright anyway (and PGHOST is shut by condition 4), so a URL edit can never silently fall
// through to the environment. pg itself never reads PGSSLROOTCERT (its only `sslrootcert` read builds a libpq string,
// :142); it binds psql, which shares this environment, so it is refused for the same reason.
// NODE_TLS_REJECT_UNAUTHORIZED is the third door, and the one that WOULD work: pg passes no `rejectUnauthorized` of
// its own (connection.js:87 copies `ssl` into the tls options as is), so Node's default decides — and Node turns that
// default off when the variable is '0' (measured on node v20.20.0, the staging runtime, by Langston). It is refused
// whenever it is DEFINED, whatever its value, so no value ever has to be interpreted (Langston, r4 Step 4 F3).
//   1. `ssl` is an object                — no TLS settings at all, `ssl=true`, or `sslmode=disable` all fail here.
//   2. `ssl.ca` is a non-empty string    — the root is PINNED to our file, not whatever the OS trust store holds.
//   3. `ssl.rejectUnauthorized !== false` — `sslmode=no-verify` encrypts but accepts any certificate.
//   4. the URL names a host              — an empty host makes pg take PGHOST, which may be an IP (no hostname check:
//                                           connection.js:96 sets servername only for a non-IP host).
//   5. the host is a NAME, not an IP     — hostname verification needs a name the certificate can carry.
//   6. no PGSSLMODE / PGSSLROOTCERT / NODE_TLS_REJECT_UNAUTHORIZED — the environment must never be the place the
//                                           transport is decided.
// On failure it THROWS naming the condition. There is no fallback and no bypass flag (CLAUDE.md §11).
//
// ⚠️ REACH, stated: this guards the APP process (`server/index.ts` imports `db-tls-boot-gate.ts` FIRST). It does NOT
// reach standalone scripts that open their own connection (T-C4); the unencrypted-connection page (T-P1) is what
// sees those, within its 25 s sampling limit.
import net from 'node:net';
import { createRequire } from 'node:module';

// pg-connection-string is CommonJS (`module.exports = parse; parse.parse = parse`), and Node's ESM loader cannot see
// `parse` as a NAMED export of it: `import { parse } from 'pg-connection-string'` passes under vitest (which rewrites
// imports) and then fails to LOAD in the built app (`SyntaxError: Named export 'parse' not found`, measured on the
// esbuild bundle, 2026-11-21). So it is loaded the way pg itself loads it — through require — which also hands the
// check the SAME module instance the pool parses with.
const { parse } = createRequire(import.meta.url)('pg-connection-string') as typeof import('pg-connection-string');

export type DatabaseTransportCondition =
  | 'url_missing'
  | 'url_unparseable'
  | 'ca_file_unreadable'
  | 'ssl_not_object'
  | 'ca_missing'
  | 'verification_disabled'
  | 'host_missing'
  | 'host_is_ip_literal'
  | 'env_pgsslmode_set'
  | 'env_pgsslrootcert_set'
  | 'env_node_tls_reject_unauthorized_set';

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
  if (env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined) {
    throw new DatabaseTransportError('env_node_tls_reject_unauthorized_set', 'NODE_TLS_REJECT_UNAUTHORIZED is set in the environment; it can turn certificate verification off for every TLS connection');
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
  // A non-empty host means pg never consults PGHOST (val() treats '' as absent), so the host checked IS the host used.
  if (host.trim().length === 0) {
    throw new DatabaseTransportError('host_missing', 'DATABASE_URL names no host; pg would fall back to PGHOST, which this check cannot vouch for');
  }
  if (net.isIP(host) !== 0) {
    throw new DatabaseTransportError('host_is_ip_literal', 'DATABASE_URL names the database by IP address; the certificate can only be checked against a host name');
  }
  return { host };
}
