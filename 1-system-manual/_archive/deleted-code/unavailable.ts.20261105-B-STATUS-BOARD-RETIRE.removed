/**
 * B-STATUS-BOARD (#1227), Langston Step-4 gate C: the board's 503 carries a REASON (not written yet, unreadable, not
 * JSON, no generated_at, a board version this page does not read). `apiFetch` throws `HTTP <status>: <body>` on any
 * non-2xx, so without this the page could only say "could not reach" for all of them. This turns a 503 whose body is
 * the board's own `{ ok: false, reason }` back into that body; anything else stays an error. No imports, so it is
 * tested directly (unavailable.test.ts).
 */
export type Unavailable = { ok: false; reason: string; pageBuild: string | null };

export function unavailableFromError(err: unknown): Unavailable | null {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const m = /^HTTP 503: ([\s\S]*)$/.exec(msg);
  if (!m) return null;
  try {
    const b = JSON.parse(m[1]);
    if (b && b.ok === false && typeof b.reason === 'string') {
      return { ok: false, reason: b.reason, pageBuild: typeof b.pageBuild === 'string' ? b.pageBuild : null };
    }
  } catch {
    // not the board's body (e.g. a proxy's HTML page): stays an error
  }
  return null;
}
