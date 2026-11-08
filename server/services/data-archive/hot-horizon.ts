/**
 * B-DB-SIZE-RELIEF OBJ-3 (pre-audit P6 / F8) — "what can a by-hand reader of the HOT tables actually see?"
 *
 * The archive tables keep only their last N days in the live database (`module_constants` `data_lifecycle`
 * `<table>.hot_retention_days`); older days are in the warm tier (Supabase Storage) and readable only by
 * `server/scripts/b75-rehydrate.ts`. A script that queries the hot tables with an era older than that horizon gets a
 * silently truncated population. When it JOINS two tables, the readable window is the SHORTER of their horizons
 * (after OBJ-1, signal_eval_archive 15 d vs signal_eval_provenance 30 d) — an INNER join loses the older rows of the
 * longer table without saying so.
 *
 * Pure: the caller reads the keys (HOT_HORIZON_SQL) and passes them in, so this is testable without a database.
 * A missing or invalid key REFUSES (no hard-coded fallback for a DB-governed setting).
 */

/**
 * B-DB-SIZE-RELIEF increment 4 (Langston, gate 2): ONE scope filter and ONE value test, shared by the ENFORCER
 * (server/scripts/b75-retention-sweep.ts loadConfig) and every READER that states a horizon (this file's callers: the
 * Drift Dashboard panel, the W20C replay). Before this the sweep read data_lifecycle with no scope filter into a
 * last-row-wins map and demanded `typeof number`, while the readers pinned the four '*' scopes and accepted Number("15")
 * — so a badge could state a horizon the sweep would not enforce (a narrower-scope row winning the sweep's map), or a
 * string seed could make the badge confident while the sweep aborted the night. Same filter + same test = they cannot
 * disagree. (module_constants' primary key is the six columns, so this filter yields at most one row per name.)
 */
export const DATA_LIFECYCLE_SCOPE_SQL =
  `module_name = 'data_lifecycle' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'`;

/** A data_lifecycle numeric value the sweep will ENFORCE: a jsonb NUMBER, finite, > 0. Anything else is null — a string
 *  "15" included (the sweep aborts on it, so no reader may treat it as a horizon). */
export function parseLifecycleNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

export const HOT_HORIZON_SQL = `SELECT constant_name, value FROM module_constants
  WHERE ${DATA_LIFECYCLE_SCOPE_SQL}
    AND constant_name LIKE '%.hot_retention_days'`;

const DAY_MS = 86_400_000;

export type EraDecision =
  | { ok: true; horizonDays: number; limitingTable: string; horizonStartIso: string; perTable: Record<string, number> }
  | { ok: false; message: string; earliestServableIso: string | null; perTable: Record<string, number | null> };

/** Parse the HOT_HORIZON_SQL rows into table → days — only values the sweep will enforce (parseLifecycleNumber). */
export function parseHorizonRows(rows: Array<{ constant_name: string; value: unknown }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const days = parseLifecycleNumber(r.value);
    if (days !== null) out.set(r.constant_name.replace(/\.hot_retention_days$/, ''), days);
  }
  return out;
}

/**
 * Can `eraStartIso` be served from the HOT partitions of every table in `tables`?
 * The earliest servable era is the next UTC midnight after `now - min(horizon)`, so a re-run there is fully inside.
 */
export function decideEra(eraStartIso: string, tables: string[], horizons: Map<string, number>, nowMs: number): EraDecision {
  const perTable: Record<string, number | null> = {};
  for (const t of tables) perTable[t] = horizons.get(t) ?? null;
  const missing = tables.filter((t) => perTable[t] === null);
  if (missing.length > 0) {
    return { ok: false, earliestServableIso: null, perTable,
      message: `REFUSED: no data_lifecycle hot_retention_days for ${missing.join(', ')} — the hot horizon is unknown, so the population cannot be stated.` };
  }
  let limitingTable = tables[0];
  for (const t of tables) if ((perTable[t] as number) < (perTable[limitingTable] as number)) limitingTable = t;
  const horizonDays = perTable[limitingTable] as number;
  const horizonStartMs = nowMs - horizonDays * DAY_MS;
  const eraMs = Date.parse(eraStartIso);
  if (!Number.isFinite(eraMs)) {
    return { ok: false, earliestServableIso: null, perTable, message: `REFUSED: era start '${eraStartIso}' is not a valid timestamp.` };
  }
  const earliest = new Date(Math.ceil(horizonStartMs / DAY_MS) * DAY_MS).toISOString();
  if (eraMs < horizonStartMs) {
    return { ok: false, earliestServableIso: earliest, perTable,
      message: `REFUSED: era start ${eraStartIso} is older than the hot horizon (${horizonDays} d, set by ${limitingTable}; hot from `
        + `${new Date(horizonStartMs).toISOString()}). Rows before that are in the WARM tier (Supabase Storage), readable only via `
        + `server/scripts/b75-rehydrate.ts. Re-run with an era at or after ${earliest}, or rehydrate the older days first.` };
  }
  return { ok: true, horizonDays, limitingTable, horizonStartIso: new Date(horizonStartMs).toISOString(), perTable: perTable as Record<string, number> };
}
