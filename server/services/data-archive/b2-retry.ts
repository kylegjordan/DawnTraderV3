/**
 * B-DISK-FILE-TIERING amendment 4, increment 3b — the bounded B2 retry (Step-8 FINDING-1; agreed CC-A + Langston under
 * KD-34, change list "3b item — bounded B2 retry", plan r4/r5 in the pre-audit).
 *
 * Classification is on (HTTP status, B2 `code`), never status alone (amendment 3):
 *   retry   — 500, 503, 408, 429 (Retry-After honoured, capped), and any call that REJECTED with no status (a socket
 *             error, the idle timer, a deadline abort, a pipeline failure — amendment 6: "before any response" is not
 *             knowable, so every rejection is retryable and may have left a stored version behind).
 *   reauth  — 401 with code `expired_auth_token` (amendment 5): re-authorize, then retry inside the same attempt budget.
 *   fatal   — everything else, including 401 `unauthorized` (a narrowed key's missing capability), 400 (a bad SHA-1),
 *             `cap_exceeded`, and an unparseable body on any status but 500/503.
 * An attestation failure (`assertB2Version`) is NOT a B2 response and never reaches this module: it throws at once
 * (amendment 8 — a 200 that does not attest is a correctness failure against a server that is answering).
 * Downloads are NOT retried in 3b (A-5): a retried download spends the daily budget twice; 3c schedules them.
 */

export type B2Disposition = 'retry' | 'reauth' | 'fatal';

/** A failed B2 call, carrying what the classifier needs. `status` null = the call rejected before any response. */
export class B2CallError extends Error {
  constructor(
    readonly op: string,
    readonly status: number | null,
    readonly code: string | null,
    readonly text: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(`[B75 storage-client] B2 ${op} failed: ${status ?? 'no response'}${code ? ` ${code}` : ''} — ${text.slice(0, 500)}`);
    this.name = 'B2CallError';
  }
}

/** The B2 error `code` from a JSON error body, or null when the body is not B2's error shape. */
export function b2ErrorCode(text: string): string | null {
  try {
    const j = JSON.parse(text) as { code?: unknown };
    return typeof j.code === 'string' ? j.code : null;
  } catch {
    return null;
  }
}

/** Retry-After in ms (delta-seconds form only; B2 sends seconds), or null. */
export function parseRetryAfterMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = Number(value.trim());
  return Number.isFinite(s) && s >= 0 ? Math.round(s * 1000) : null;
}

export function classifyB2(status: number | null, code: string | null): B2Disposition {
  if (status === null) return 'retry';
  if (status === 401) return code === 'expired_auth_token' ? 'reauth' : 'fatal';
  if (status === 500 || status === 503) return 'retry';
  // 408 / 429 retry only on B2's own error body (amendment 3: an unparseable body is non-retryable except 500/503).
  if ((status === 408 || status === 429) && code !== null) return 'retry';
  return 'fatal';
}

export interface B2RetryOptions {
  attempts: number; // total attempts, including the first
  backoffMs: number[]; // wait before attempt i+1 (index i); the last value repeats if short
  retryAfterCapMs: number; // a 429's Retry-After is honoured up to this
  sleep?: (ms: number) => Promise<void>;
  jitter?: () => number; // 0..1, scales up to +25 % of the wait
  reauth?: () => Promise<void>; // called before retrying a 401 expired_auth_token
  onAttempt?: (r: { op: string; attempt: number; ok: boolean; status: number | null; code: string | null; disposition?: B2Disposition }) => void;
}

/** The defaults agreed for 3b: 3 attempts, 1 s then 4 s plus jitter, Retry-After capped at the longest backoff. */
export const B2_RETRY_DEFAULTS: Pick<B2RetryOptions, 'attempts' | 'backoffMs' | 'retryAfterCapMs'> = {
  attempts: 3,
  backoffMs: [1000, 4000],
  retryAfterCapMs: 4000,
};

/**
 * Runs `call` up to `attempts` times. `call` gets the 1-based attempt number and must throw `B2CallError` for a B2
 * response it does not accept; any other thrown error is treated as a rejection with no status (retryable).
 */
export async function withB2Retry<T>(op: string, call: (attempt: number) => Promise<T>, opts: B2RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((z) => setTimeout(z, ms)));
  const jitter = opts.jitter ?? Math.random;
  let last: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      const v = await call(attempt);
      opts.onAttempt?.({ op, attempt, ok: true, status: 200, code: null });
      return v;
    } catch (err) {
      last = err;
      const e = err instanceof B2CallError ? err : null;
      const status = e ? e.status : null;
      const code = e ? e.code : null;
      const disposition = classifyB2(status, code);
      opts.onAttempt?.({ op, attempt, ok: false, status, code, disposition });
      if (disposition === 'fatal' || attempt === opts.attempts) throw err;
      if (disposition === 'reauth') {
        if (!opts.reauth) throw err;
        await opts.reauth();
      }
      const base = opts.backoffMs[Math.min(attempt - 1, opts.backoffMs.length - 1)] ?? 0;
      const wait = e?.retryAfterMs != null ? Math.min(e.retryAfterMs, opts.retryAfterCapMs) : base;
      await sleep(Math.round(wait * (1 + 0.25 * jitter())));
    }
  }
  throw last;
}
