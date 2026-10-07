/**
 * `B-REST-SIDES-TO-CACHE` (`PHASE_19_PLAN` row `3n.l`, `#1056` amendments 1-4) — THE WRITE-KEY LEDGER for the
 * price cache's three REST ticker sites (`refreshBucket`, `getPrice`, `getBatch`).
 *
 * ★ WHY IT EXISTS: a Kraken REST response is keyed by the pair's PRIMARY name (`ZGBPZUSD`), whatever form it was asked
 * for. The cache files each response under whatever the resolver makes of that key. When the resolver does not know
 * the primary, it strips a quote suffix and writes a PHANTOM (`ZGBPZ/USD`) that no reader asks for, so the requested
 * symbol's sides never refresh. On 2026-09-26 that silently left the paper exit trigger without a fresh GBP/USD bid
 * for 33 s (alert `5bfb2af5`), and nothing logged which keys a REST write landed on, so the cause took elimination
 * to find.
 *
 * WHAT A LEDGER STATES, per call, and the identity that holds between its parts:
 *   requested = written ∪ missing (disjoint)          — every symbol asked for either got a write under its own key or did not
 *   every written cache key ∈ requested ∪ phantom      — a key nobody asked for is a phantom
 * `missing` is the half no counter could see before: a requested symbol that Kraken omitted, or whose response
 * landed on a phantom.
 * `viaPrimary` names the requested symbols whose response key is not their own request form (`GBP/USD<-ZGBPZUSD`):
 * the resolutions that depend on the static map carrying Kraken's primary key.
 *
 * `B-PRICE-FEED-TRUTH` I2 (`#1146`, `#1173`; Langston Step-2 C1) — three counts beside the identity, none inside it:
 *   `unlisted`   — requested symbols the venue's pair list does not name, so NOT SENT (they are also `missing`: the identity
 *                  holds, and `written = requested − unlisted` exactly when nothing else was missed);
 *   `ineligible` — symbols the caller declared not REST-fetchable (another asset class), never part of `requested`;
 *   `unresolved` — response keys the venue's pair list does not name, so NOT FILED (never a phantom). Since I2 we only ask
 *                  for listed pairs, so `unresolved > 0` is the live detector of venue-list drift since boot (`#933`);
 *   `notReady`   — symbols NOT SENT because the venue's pair list was not loaded yet (I2 P5, Langston Step-4 C1): without
 *                  it a waiting call reads `written=0 missing=N`, byte-identical to "Kraken answered nothing".
 * ⚠️ `requested` is a different population per site (R3): `refreshBucket` passes every bucket member; `getBatch` passes
 *    the STALE, REST-eligible subset of what it was asked for. Neither is "the eligible set" in general.
 * ⚠️ `viaPrimary` (R5): the request form is now the venue ALTNAME, which differs from the response key for most
 *    Z/X-primary pairs — expect the list near its cap; it no longer discriminates much.
 *
 * ⛔ RECORD-ONLY: no decision reads a ledger.
 * PURE: no cache, no clock, no I/O.
 */

// I2 P2c: the on-demand single-symbol site (`getPrice`) is deleted (zero production callers; rule 18).
export type RestWriteSite = 'refreshBucket' | 'getBatch';

/** One REST response entry and every cache key it was written under. */
export interface RestWriteKeys {
  /** Kraken's response key, e.g. `ZGBPZUSD`. */
  responseKey: string;
  /** The keys this response was stored under: the resolved key, plus a rescued requested key when there was one. */
  writtenKeys: string[];
}

export interface WriteKeyLedger {
  site: RestWriteSite;
  requested: string[];
  /** Requested symbols that received a write under their own key. */
  written: string[];
  /** Keys written that no requested symbol has. */
  phantom: string[];
  /** Requested symbols that received no write under their own key. */
  missing: string[];
  /** `SYM<-KEY` for each written requested symbol whose response key differs from its own request form. */
  viaPrimary: string[];
  /** I2: requested symbols the venue's pair list does not name — not sent (a subset of `missing`). */
  unlisted: string[];
  /** I2: symbols the caller declared not REST-fetchable — never in `requested`. */
  ineligible: number;
  /** I2: response keys the venue's pair list does not name — not filed. */
  unresolved: number;
  /** I2 (Step-4 C1): requested symbols not sent because the venue's pair list was not ready (a subset of `missing`). */
  notReady: number;
}

/** I2: the counts a site passes beside its writes. */
export interface WriteKeyExtras {
  unlisted?: readonly string[];
  ineligible?: number;
  unresolved?: number;
  notReady?: number;
}

export function buildWriteKeyLedger(
  site: RestWriteSite,
  requested: readonly string[],
  writes: readonly RestWriteKeys[],
  requestFormOf: (symbol: string) => string,
  extras: WriteKeyExtras = {},
): WriteKeyLedger {
  const req = Array.from(new Set(requested));
  const reqSet = new Set(req);
  const writtenSet = new Set<string>();
  const phantomSet = new Set<string>();
  const viaPrimary = new Set<string>();
  for (const w of writes) {
    for (const key of w.writtenKeys) {
      if (reqSet.has(key)) {
        writtenSet.add(key);
        if (requestFormOf(key) !== w.responseKey) viaPrimary.add(`${key}<-${w.responseKey}`);
      } else {
        phantomSet.add(key);
      }
    }
  }
  return {
    site,
    requested: req,
    written: req.filter(s => writtenSet.has(s)),
    phantom: Array.from(phantomSet).sort(),
    missing: req.filter(s => !writtenSet.has(s)),
    viaPrimary: Array.from(viaPrimary).sort(),
    unlisted: Array.from(new Set(extras.unlisted ?? [])).sort(),
    ineligible: extras.ineligible ?? 0,
    unresolved: extras.unresolved ?? 0,
    notReady: extras.notReady ?? 0,
  };
}

const LIST_CAP = 25;

/** A bounded list, so one bad pass cannot write a megabyte line. */
export function formatKeyList(keys: readonly string[]): string {
  if (keys.length <= LIST_CAP) return `[${keys.join(',')}]`;
  return `[${keys.slice(0, LIST_CAP).join(',')},+${keys.length - LIST_CAP} more]`;
}

/** One line per ledger. `extra` carries site-specific fields (the bucket, the sides-writer census). */
export function formatWriteKeyLedger(l: WriteKeyLedger, extra = ''): string {
  return `[3n.l][WRITE_KEYS] site=${l.site}${extra ? ' ' + extra : ''} requested=${l.requested.length} written=${l.written.length} `
    + `phantom=${l.phantom.length}${formatKeyList(l.phantom)} missing=${l.missing.length}${formatKeyList(l.missing)} `
    + `viaPrimary=${formatKeyList(l.viaPrimary)} unlisted=${l.unlisted.length}${formatKeyList(l.unlisted)} `
    + `ineligible=${l.ineligible} unresolved=${l.unresolved} notReady=${l.notReady}`;
}

/**
 * Sums the ledgers of the on-demand site (`getBatch`) between two health lines, so each site prints its
 * OWN line: a phantom is never attributed to a bucket pass that did not produce it (Langston, Step-2 condition c).
 * ⚠️ THE LINE MIXES TWO KINDS OF FIELD, AND SAYS SO IN ITS NAMES (Step-4 condition C2): `calls`, `requested` and
 * `written` are SUMS over the interval's calls; `phantomDistinct`, `missingDistinct` and `viaPrimary` are SETS,
 * de-duplicated across the interval. The per-call identity does NOT hold on this line: `requested − written` is not
 * `missingDistinct`'s count.
 */
export class WriteKeyAccumulator {
  private calls = 0;
  private requested = 0;
  private written = 0;
  private phantom = new Set<string>();
  private missing = new Set<string>();
  private viaPrimary = new Set<string>();
  private unlisted = new Set<string>();
  private ineligible = 0;
  private unresolved = 0;
  private notReady = 0;

  constructor(private readonly site: RestWriteSite) {}

  add(l: WriteKeyLedger): void {
    this.calls++;
    this.requested += l.requested.length;
    this.written += l.written.length;
    l.phantom.forEach(k => this.phantom.add(k));
    l.missing.forEach(k => this.missing.add(k));
    l.viaPrimary.forEach(k => this.viaPrimary.add(k));
    l.unlisted.forEach(k => this.unlisted.add(k));
    this.ineligible += l.ineligible;
    this.unresolved += l.unresolved;
    this.notReady += l.notReady;
  }

  /** The interval's line, or `null` when the site was not called; resets either way. */
  flushLine(): string | null {
    if (this.calls === 0) return null;
    const phantom = Array.from(this.phantom).sort();
    const missing = Array.from(this.missing).sort();
    const line = `[3n.l][WRITE_KEYS] site=${this.site} calls=${this.calls} requested=${this.requested} written=${this.written} `
      + `phantomDistinct=${phantom.length}${formatKeyList(phantom)} missingDistinct=${missing.length}${formatKeyList(missing)} `
      + `viaPrimary=${formatKeyList(Array.from(this.viaPrimary).sort())} `
      + `unlistedDistinct=${this.unlisted.size}${formatKeyList(Array.from(this.unlisted).sort())} `
      + `ineligible=${this.ineligible} unresolved=${this.unresolved} notReady=${this.notReady}`;
    this.calls = 0;
    this.requested = 0;
    this.written = 0;
    this.phantom.clear();
    this.missing.clear();
    this.viaPrimary.clear();
    this.unlisted.clear();
    this.ineligible = 0;
    this.unresolved = 0;
    this.notReady = 0;
    return line;
  }
}
