/**
 * B-VENUE-QUIET-ALERTING (#526 + Kyle's #994 + #638; SPRINT_TO_LIVE_PLAN row 3a1; change-class architecture).
 *
 * Kyle, 2026-09-03 (#994): an xStock mark going stale because the US market is closed is BY DESIGN — keep the count,
 * raise no alert; alert only when OUR feed or subscription is impaired. The freshness standard does not loosen. So this
 * module changes DELIVERY only: the exit monitor's skip rail, its emit and its log lines are untouched.
 *
 *   - QUIET-MARKET FAMILY: only `equity_tick_stale_*` and `equity_tick_missing` can be a quiet market. Every other skip
 *     reason (knob missing, book-state, the crypto REST arm) pages exactly as before.
 *   - THE COHORT TEST, at the decision instant: `T` = xStock symbols with a ticker frame in the trailing 60 s.
 *     QUIET iff T < `quiet_ticking_min`; THIN iff T < `thin_ticking_min` ⇒ cannot tell a quiet venue from an impaired
 *     feed ⇒ PAGE (default-to-page, Langston r1 Q2). A quiet-family escalation on a QUIET class joins ONE per-class
 *     standing record (`venue-quiet-<mode>-xstock_spot`, info, not delivered to Discord) instead of a per-symbol page.
 *   - DURATION: a standing-record member still unpriced `escalate_after_ms` after the class stopped being quiet pages on
 *     its own key (the market resumed; this symbol did not).
 *   - THE CLEAR (#638), off the exit path and driven by a RE-MEASURED condition, never by the in-memory streak (a restart
 *     loses the streak): a `price-skip-<mode>-<SYMBOL>` row resolves once this engine has priced the symbol's position
 *     AFTER the row was minted, or once no position is open on the symbol; the standing record resolves when the class is
 *     not quiet and every member has been priced or closed. Resolves go through `resolveAlertsByDedupeKey` as the machine
 *     actor `active-exit-monitor`, transport `engine`, with the re-measured position's uuid as evidence.
 *   - Every key this module or the rail mints has a clearing condition (Langston r2 C1): `price-skip-config-<mode>-<class>`
 *     clears when the threshold reads successfully; `venue-quiet-resolve-stuck-<mode>` clears when nothing is stuck.
 *
 * Thresholds are DB constants (module `venue_quiet`, class `xstock_spot`; seeded by 2026-10-07-b-venue-quiet-alerting.sql,
 * prefetched at boot). The measured basis is the pre-audit (A2/A3): regular p05 461 of 468; after-hours median 154;
 * overnight min 108.
 */
import { getCachedNumberRequired } from './module-constants-service.js';
import { countEquitySymbolsFramedSince } from './passive-archive/equity-spot-archiver.js';

export type ClassVerdict = 'quiet' | 'not_quiet' | 'thin';
export const VENUE_QUIET_ACTOR = 'active-exit-monitor';
export const TICKING_WINDOW_MS = 60_000;
/** How long a cold (not-yet-warm) knob may be read as "skip, do not escalate" after engine start before it pages.
 *  A BOOT-ORDERING bound, not a trading decision: the warm-up measured 2 s at the 2026-10-06 restart (pre-audit A7). */
export const NOT_WARM_GRACE_MS = 120_000;

/** Resolution-evidence references (path:line tokens) for the two rows that clear on a CONDITION rather than a position. */
export const THRESHOLD_SEED_REF = 'drizzle/migrations/2026-07-15-p19-b8-5-venue-only-pricing.sql:13';
export const SWEEP_REF = 'server/services/venue-quiet-alerting.ts:1';

export function isQuietMarketReason(reason: string): boolean {
  return reason === 'equity_tick_missing' || reason.startsWith('equity_tick_stale_');
}

export interface VenueQuietConfig {
  quietTickingMin: number;
  thinTickingMin: number;
  escalateAfterMs: number;
  resolveStuckAfterMs: number;
}

export function readVenueQuietConfig(): VenueQuietConfig {
  const scope = { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' };
  return {
    quietTickingMin: getCachedNumberRequired('venue_quiet', 'quiet_ticking_min', scope),
    thinTickingMin: getCachedNumberRequired('venue_quiet', 'thin_ticking_min', scope),
    escalateAfterMs: getCachedNumberRequired('venue_quiet', 'escalate_after_ms', scope),
    resolveStuckAfterMs: getCachedNumberRequired('venue_quiet', 'resolve_stuck_after_ms', scope),
  };
}

export function classVerdict(t: number, cfg: Pick<VenueQuietConfig, 'quietTickingMin' | 'thinTickingMin'>): ClassVerdict {
  if (t < cfg.thinTickingMin) return 'thin';
  if (t < cfg.quietTickingMin) return 'quiet';
  return 'not_quiet';
}

export function measureXstockTicking(nowMs: number): number {
  return countEquitySymbolsFramedSince(nowMs - TICKING_WINDOW_MS);
}

/** The cold/unseeded split (Langston r2 C3) — `module-constants-service` throws two distinguishable messages. */
export function classifyKnobError(err: unknown): 'not_warm' | 'unseeded' {
  const msg = err instanceof Error ? err.message : String(err);
  return /not warm/i.test(msg) ? 'not_warm' : 'unseeded';
}

/** The exact key shapes the sweep may select — never a prefix scan (Langston r2 C2). */
export function priceSkipKeyPattern(mode: string): RegExp {
  return new RegExp(`^price-skip-${mode}-([A-Z0-9.]+/(?:USD|USDT|USDC))$`);
}
export const standingKey = (mode: string) => `venue-quiet-${mode}-xstock_spot`;
export const stuckKey = (mode: string) => `venue-quiet-resolve-stuck-${mode}`;
export const configKey = (mode: string, cls: string) => `price-skip-config-${mode}-${cls}`;

export interface SweepAlertRow {
  id: string;
  dedupe_key?: string | null;
  state: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}
export interface SweepPosition { id: string; symbol: string }

export interface SweepDeps {
  listAlerts: () => SweepAlertRow[];
  resolveByKey: (key: string, by: string, evidence: string, transport: 'engine') => Promise<string[]>;
  addAlert: (opts: Record<string, unknown>) => Promise<{ id: string }>;
}

/**
 * Per-engine state for the sweep. Everything here is RE-ESTABLISHED by observation after a restart: `lastPricedAt` fills
 * as the engine prices positions, `thresholdReadOk` as the knob reads — nothing depends on a pre-restart memory.
 */
export class VenueQuietState {
  lastPricedAt = new Map<string, number>();          // positionId -> last venue price, this process
  thresholdReadOk = new Set<string>();               // asset classes whose skip threshold read cleanly, this process
  notQuietSince: number | null = null;               // when the xStock class last turned not-quiet
  failingSince = new Map<string, number>();          // dedupe key -> first failed resolve, this process
  lastVerdict: ClassVerdict | null = null;

  notePriced(positionId: string, nowMs: number): void { this.lastPricedAt.set(positionId, nowMs); }

  /** `notQuietSince` = the first sweep this process saw the class not quiet, reset by any quiet sweep. After a restart in
   *  liquid hours it starts at the first sweep — duration escalation is then later, never earlier, than true. */
  noteVerdict(v: ClassVerdict, nowMs: number): void {
    if (v === 'quiet') this.notQuietSince = null;
    else if (this.notQuietSince === null) this.notQuietSince = nowMs;
    this.lastVerdict = v;
  }
}

export interface SweepResult { resolved: string[]; failed: number; escalated: string[] }

/**
 * One sweep (objective 9): re-measure every non-terminal row this rail owns and resolve the cleared ones. Never throws —
 * a failing resolve is logged, counted and retried next sweep; a key failing for `resolveStuckAfterMs` raises one
 * `venue-quiet-resolve-stuck-<mode>` row, which itself clears once nothing is failing.
 */
export async function sweepVenueQuiet(args: {
  mode: string;
  nowMs: number;
  openPositions: SweepPosition[];
  state: VenueQuietState;
  cfg: VenueQuietConfig;
  verdict: ClassVerdict;
  deps: SweepDeps;
}): Promise<SweepResult> {
  const { mode, nowMs, openPositions, state, cfg, verdict, deps } = args;
  const out: SweepResult = { resolved: [], failed: 0, escalated: [] };
  state.noteVerdict(verdict, nowMs);
  const bySymbol = new Map<string, SweepPosition[]>();
  for (const p of openPositions) bySymbol.set(p.symbol.toUpperCase(), [...(bySymbol.get(p.symbol.toUpperCase()) ?? []), p]);
  const pricedAfter = (p: SweepPosition, sinceMs: number) => (state.lastPricedAt.get(p.id) ?? -Infinity) > sinceMs;
  const skipPat = priceSkipKeyPattern(mode);

  const tryResolve = async (key: string, evidence: string) => {
    try {
      const ids = await deps.resolveByKey(key, VENUE_QUIET_ACTOR, evidence, 'engine');
      out.resolved.push(...ids);
      state.failingSince.delete(key);
    } catch (err: any) {
      out.failed++;
      if (!state.failingSince.has(key)) state.failingSince.set(key, nowMs);
      console.error(`[VENUE_QUIET][RESOLVE_FAILED] key=${key} err=${err?.message ?? err}`);
    }
  };

  const rows = deps.listAlerts().filter((a) => a.state !== 'resolved' && a.dedupe_key);
  for (const row of rows) {
    const key = row.dedupe_key as string;
    const createdMs = Date.parse(row.created_at);
    const m = skipPat.exec(key);
    if (m) {
      const positions = bySymbol.get(m[1]) ?? [];
      if (positions.length === 0) {
        const ev = typeof row.metadata?.positionId === 'string' ? (row.metadata.positionId as string) : 'NO-EVIDENCE-GIVEN';
        await tryResolve(key, ev); // the position this row was minted for has closed
        continue;
      }
      const priced = positions.find((p) => pricedAfter(p, createdMs));
      if (priced) await tryResolve(key, priced.id); // the RE-MEASURED position's uuid (Langston record fix)
      continue;
    }
    if (key === standingKey(mode)) {
      const members = (row.metadata?.members ?? {}) as Record<string, { symbol: string; listedAtMs: number }>;
      const stillOut: Array<{ positionId: string; symbol: string }> = [];
      for (const [positionId, mem] of Object.entries(members)) {
        const open = (bySymbol.get(mem.symbol.toUpperCase()) ?? []).find((p) => p.id === positionId);
        if (open && !pricedAfter(open, mem.listedAtMs)) stillOut.push({ positionId, symbol: mem.symbol });
      }
      if (verdict !== 'quiet' && stillOut.length === 0) {
        await tryResolve(key, Object.keys(members)[0] ?? 'NO-EVIDENCE-GIVEN');
        continue;
      }
      // Duration escalation (objective 3 / r1a §6.1): the market resumed and this symbol did not.
      if (verdict !== 'quiet' && state.notQuietSince !== null && nowMs - state.notQuietSince >= cfg.escalateAfterMs) {
        for (const s of stillOut) {
          await deps.addAlert({
            triggers_at: new Date(nowMs), category: 'breakage', severity: 'warning',
            title: `Exit checks still skipped after the venue resumed — ${s.symbol}`,
            body: `${s.symbol} has had no usable mark for ${Math.round((nowMs - state.notQuietSince) / 60000)} min since the xStock venue stopped being quiet. The cohort is ticking; this symbol is not — a lost subscription or a stuck book, not a quiet market.`,
            metadata: { positionId: s.positionId, reasonFamily: 'quiet_market', classVerdict: verdict, escalation: 'duration' },
            dedupe_key: `price-skip-${mode}-${s.symbol}`,
          });
          out.escalated.push(s.symbol);
        }
      }
      continue;
    }
    if (key.startsWith(`price-skip-config-${mode}-`)) {
      const cls = key.slice(`price-skip-config-${mode}-`.length);
      if (state.thresholdReadOk.has(cls)) await tryResolve(key, THRESHOLD_SEED_REF);
      continue;
    }
    if (key === stuckKey(mode) && state.failingSince.size === 0) {
      await tryResolve(key, SWEEP_REF);
    }
  }

  const stuck = [...state.failingSince.entries()].filter(([, since]) => nowMs - since >= cfg.resolveStuckAfterMs);
  if (stuck.length > 0) {
    await deps.addAlert({
      triggers_at: new Date(nowMs), category: 'breakage', severity: 'warning',
      title: `Venue-quiet sweep cannot resolve ${stuck.length} alert(s)`,
      body: `The exit monitor's re-measure sweep has failed to resolve these keys for over ${Math.round(cfg.resolveStuckAfterMs / 60000)} min: ${stuck.map(([k]) => k).join(', ')}. Read [VENUE_QUIET][RESOLVE_FAILED] in out.log.`,
      metadata: { keys: stuck.map(([k]) => k) },
      dedupe_key: stuckKey(mode),
    });
  }
  return out;
}
