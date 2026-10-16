/**
 * `B-XSTOCK-BID-TRIGGER-RELAND` increment (4a) P1b (row 2, `#1191`) — THE PAPER ENGINE'S NO-DECISION RAIL CLEARS ITSELF.
 * Plan: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4A_PRE_AUDIT.md` P1b (scope :203 amended; Coltrane r1 accepted, r3 approved).
 *
 * WHAT WAS WRONG (audit A1): the engine's `no-trigger-<mode>-<SYMBOL>` row (`active-execution-engine.ts`, built in
 * `d61edadc1`, 8a-P2) is minted once per streak and NOTHING in code ever resolved it — 9 rows since 09-26, 9/9 by hand
 * (`cli`). An open row blocks its key's next mint (`system-alerts.ts` non-terminal dedupe), so the rail went quiet after
 * its first page on each symbol. Same structural gap as the VTS rail, so the same fix (`vts-rail-reporting.ts`):
 *   - the proof that the position DECIDED after its row was minted is written ONTO THE ROW (`decidedAtMs`) at decision time;
 *   - the index `positionId → alertId` is a cache of the alert file — loaded before the first use, refreshed by each sweep,
 *     written AT THE MINT from the row `addAlert` returns;
 *   - the sweep (once a minute, after the exit cycle, awaited by nothing on the exit path) resolves a row when the position
 *     decided after the mint, or when a `position_closed` trade-log row names the position. It is resolved by the EXISTING
 *     `active-exit-monitor` actor (no paper twin of `vts-exit-monitor`).
 * ⛔ CLOSED IS A PRESENT ROW SAYING SO, NEVER AN ABSENT ONE: a position missing from `active_open_positions` is not read as
 *    closed. Measured 2026-10-16: 242 `position_closed` log rows vs 251 paper closes over 14 days — a close that writes no
 *    log row leaves its alert open for a human, which is the safe direction (a stale row is a visibility cost; a wrong
 *    resolve is a lost alarm).
 * Keyed per SYMBOL, unchanged: paper holds at most ONE open position per symbol (measured, audit r4 P1b), so the per-trade
 * key the VTS rail needed (Langston r4 BLOCKER-1) does not arise here.
 */
import { railRowClear } from '../core/trading/vts-rail.js';

export const PAPER_RAIL_REF = 'server/services/paper-no-trigger-clear.ts:1';
export const PAPER_RAIL_ACTOR = 'active-exit-monitor';
export const paperRailPrefix = (mode: string) => `no-trigger-${mode}-`;

export interface PaperRailRow {
  id: string;
  dedupe_key?: string | null;
  state: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

export interface PaperRailDeps {
  mergeAlertMetadata: (id: string, patch: Record<string, unknown>) => Promise<PaperRailRow | null>;
  resolveAlert: (id: string, by: string, evidence: string, transport: 'engine') => Promise<unknown>;
  readAllAlerts: () => PaperRailRow[];
  /** Of these position ids, which have a `position_closed` row in `active_trade_logs` (a present row saying so). */
  closedPositionIds: (mode: string, ids: string[]) => Promise<Set<string>>;
}

/** One rail per engine mode (paper today; live shares the code). */
export class PaperNoTriggerRail {
  private rowByPosition = new Map<string, string>();
  private loaded = false;
  private lastSweepMs = 0;
  private sweepInFlight = false;

  constructor(private readonly mode: string) {}

  /** Rebuild the index from the alert file (durable state). */
  load(deps: Pick<PaperRailDeps, 'readAllAlerts'>): void {
    const prefix = paperRailPrefix(this.mode);
    this.rowByPosition.clear();
    for (const r of deps.readAllAlerts()) {
      if (r.state === 'resolved' || !(r.dedupe_key ?? '').startsWith(prefix)) continue;
      const pid = r.metadata?.positionId;
      if (typeof pid === 'string' && pid) this.rowByPosition.set(pid, r.id);
    }
    this.loaded = true;
  }

  ensureLoaded(deps: Pick<PaperRailDeps, 'readAllAlerts'>): void {
    if (this.loaded) return;
    try { this.load(deps); } catch (err) { console.error(`[NO_TRIGGER_RAIL][INDEX_LOAD_FAILED] mode=${this.mode}`, err instanceof Error ? err.message : err); }
  }

  /** The row `addAlert` returned at a mint (fresh or deduped): index it at once — no mint-to-refresh blind window. */
  noteMint(positionId: string, row: PaperRailRow | null | undefined): void {
    if (row && row.state !== 'resolved' && row.metadata?.positionId === positionId) this.rowByPosition.set(positionId, row.id);
  }

  /** A cycle DECIDED for this position: write the time onto its durable row (fire-and-forget; a failure keeps the entry). */
  markDecided(positionId: string, nowMs: number, deps: Pick<PaperRailDeps, 'mergeAlertMetadata'>): void {
    const rowId = this.rowByPosition.get(positionId);
    if (!rowId) return;
    deps.mergeAlertMetadata(rowId, { decidedAtMs: nowMs })
      .then(() => { if (this.rowByPosition.get(positionId) === rowId) this.rowByPosition.delete(positionId); })
      .catch((err) => console.error(`[NO_TRIGGER_RAIL][DECIDED_MARK_FAILED] mode=${this.mode} position=${positionId}:`, err instanceof Error ? err.message : err));
  }

  /** Once a minute, off the exit path, re-measured from durable state; never throws. Returns the resolved count. */
  async sweep(nowMs: number, deps: PaperRailDeps): Promise<number> {
    if (this.sweepInFlight || nowMs - this.lastSweepMs < 60_000) return 0;
    this.sweepInFlight = true;
    this.lastSweepMs = nowMs;
    let resolved = 0;
    try {
      const prefix = paperRailPrefix(this.mode);
      const rows = deps.readAllAlerts().filter((r) => r.state !== 'resolved' && (r.dedupe_key ?? '').startsWith(prefix));
      const pids = [...new Set(rows.map((r) => r.metadata?.positionId).filter((p): p is string => typeof p === 'string' && !!p))];
      const closed = pids.length ? await deps.closedPositionIds(this.mode, pids) : new Set<string>();
      let unattributed = 0;
      for (const r of rows) {
        const pid = r.metadata?.positionId;
        if (typeof pid !== 'string' || !pid) { unattributed++; continue; } // minted before (4a): left for a human
        const why = railRowClear(r.created_at, r.metadata?.decidedAtMs, closed.has(pid));
        if (!why) continue;
        const evidence = `${why === 'decided_after_mint' ? 'DECIDED-AFTER-MINT' : 'POSITION-CLOSED'} position=${pid} ${PAPER_RAIL_REF}`;
        try {
          await deps.resolveAlert(r.id, PAPER_RAIL_ACTOR, evidence, 'engine');
          resolved++;
          if (this.rowByPosition.get(pid) === r.id) this.rowByPosition.delete(pid);
        } catch (err) {
          console.error(`[NO_TRIGGER_RAIL][RESOLVE_FAILED] mode=${this.mode} id=${r.id}:`, err instanceof Error ? err.message : err);
        }
      }
      this.load(deps);
      console.log(`[NO_TRIGGER_RAIL][SWEEP] mode=${this.mode} rowsOpen=${rows.length} resolved=${resolved} unattributed=${unattributed}`);
    } catch (err) {
      console.error(`[NO_TRIGGER_RAIL][SWEEP_ERROR] mode=${this.mode}:`, err instanceof Error ? err.message : err);
    } finally {
      this.sweepInFlight = false;
    }
    return resolved;
  }
}

/** The production dependencies. */
export async function productionPaperRailDeps(): Promise<PaperRailDeps> {
  const alerts = await import('./system-alerts.js');
  const { db } = await import('../db.js');
  const { sql } = await import('drizzle-orm');
  return {
    mergeAlertMetadata: alerts.mergeAlertMetadata as unknown as PaperRailDeps['mergeAlertMetadata'],
    resolveAlert: alerts.resolveAlert as unknown as PaperRailDeps['resolveAlert'],
    readAllAlerts: alerts.readAllAlerts as unknown as PaperRailDeps['readAllAlerts'],
    closedPositionIds: async (mode, ids) => {
      // ⛔ An IN list built with `sql.join`, never `= ANY(${ids})` (Drizzle binds no JS array; that form returns ZERO rows, #167).
      // `active_trade_logs` carries no `mode` column (live schema, 2026-10-16); position ids are UUIDs, unique across modes.
      void mode;
      const res = await db.execute(sql`SELECT DISTINCT position_id FROM active_trade_logs
        WHERE event_type = 'position_closed'
          AND position_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
      const rows = ((res as unknown as { rows?: Array<{ position_id: string }> }).rows ?? []);
      return new Set(rows.map((r) => r.position_id));
    },
  };
}
