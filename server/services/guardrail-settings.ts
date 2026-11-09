/**
 * Phase 8.8.3-H4: Guardrail Settings Service
 * 
 * Provides helper functions for building settings from guardrails_v2.
 * All risk settings are derived from the Guardrails tab - no hidden defaults.
 * 
 * Single source of truth:
 * - guardrails_v2 table for all risk parameters
 * - portfolio_state table for portfolio balance
 */

import { storage } from '../storage';
import { TradingSettings } from '@shared/schema';
import { deriveSlotCount, resolveEffectivePositionPct } from './active-position-sizing.js';
import { parseLifecycleNumber } from './data-archive/hot-horizon.js';

/**
 * Phase 8.8.3-H4/C7: Get portfolio balance from mode-level portfolio_state
 * Phase 8.8.3-C7-FIX: Now returns Current Balance = Starting Balance + Realized P/L
 * This is the cash balance available for risk calculations, not including unrealized P/L
 * @param mode Trading mode (live/paper)
 * @param userId User ID
 * @param globalContextId Optional global context ID
 * @returns Current Balance (starting + realized P/L) in USD, or 0 if not found
 */
export async function getPortfolioBalanceV2(
  mode: 'live' | 'paper'
): Promise<number> {
  try {
    // [9.6.3] Use mode-only query for portfolio state (mode-based architecture)
    const state = await storage.getPortfolioState({ mode });
    
    if (!state) {
      console.warn(`[8.8.3-H4][GuardrailSettings] No portfolio_state found for mode=${mode}`);
      return 0;
    }

    // ★★ B-COST-MATH-CONSOLIDATION SITE 9 — PHANTOM READ DELETED (#614). Found by running the
    // batch's own fence (`as any` on a schema-typed row) across ALL of server/ rather than only the
    // files already known — the four earlier sites were found by narrower searches that could not
    // have returned this one.
    // Was: `Number((state as any).startingBalance || state.balance)`. `portfolio_state` HAS NO
    // `startingBalance` column, so the first operand was ALWAYS undefined and this ALWAYS resolved
    // to `state.balance` — which IS the anchor, so the VALUE was and remains correct. Same
    // no-behaviour-change repair as site 7: read it under its true name, drop the cast.
    //
    // ✅ HISTORY, NOT CURRENT STATE (rewritten 2026-08-20 at Langston's Step-B review — the block
    // that stood here asserted, in the PRESENT TENSE, that this function still drew its realized
    // P&L from `getClosedTrades(mode, { closedOnly: true })` with its silent 100-row cap, and then
    // explicitly disclaimed the repair: *"Repairing the pairing is #618's decision, NOT this
    // batch's bound; it is flagged rather than quietly widened."* B-BALANCE-TRUTH STEP B REPAIRED
    // IT, so that text became a flat contradiction of the code nineteen lines below it — the same
    // defect class this batch exists to remove, in its third instance, which is why it is struck
    // rather than annotated.)
    //
    // WHAT IT USED TO DO: this function — `getPortfolioBalanceV2`, the GUARDRAIL balance — paired
    // the anchor below with a SESSION-SCOPED realized P&L drawn from a reader capped at 100 rows
    // ordered by `opened_at DESC`, i.e. #618 legs 1 and 2 reaching the RISK-SIZING path.
    // WHAT IT DOES NOW: see the Step-B block below — a SQL aggregate over every qualifying row.
    // `getClosedTrades` is no longer called anywhere in this file.
    const anchorBalance = Number(state.balance);
    const startingBalance = anchorBalance;
    if (startingBalance <= 0 || isNaN(startingBalance)) {
      console.warn(`[8.8.3-H4][GuardrailSettings] Invalid anchor balance (${startingBalance}) for mode=${mode}`);
      return 0;
    }

    // [9.6.3] Get realized P/L from closed trades - mode-aware
    // Import dynamically to avoid circular dependency
    const { getEngineSessionStart } = await import('./active-execution-engine.js');
    const sessionStart = getEngineSessionStart(mode);
    
    // ═══ B-BALANCE-TRUTH Step B (#618): THE RISK LEG ═══════════════════════════════════════
    // This is the daily-loss kill switch's DENOMINATOR. It used to sum `pnl` in JS over
    // `getClosedTrades(mode, { closedOnly: true })` -- at most 100 rows ordered by `opened_at DESC`
    // -- and THEN filter those rows by `closed_at >= sessionStart`. It bounded its set by OPEN time
    // while asking a question in CLOSE time, so a position held across >100 subsequent opens was
    // silently absent from the balance. Direction is the unsafe one: the denominator reads HIGH, so
    // the loss PERCENTAGE reads low and the switch trips LATE -- compounding with the numerator
    // error that B-KILLSWITCH-WINDOW (FIX-2026-07-31-B) already repaired on the other side.
    //
    // The fix is Kyle's DECISION 1 (2026-08-01, "compute the totals in the database"): reuse
    // `getRealizedPnlSince` -- the SAME aggregate the numerator uses. Its predicates are IDENTICAL
    // to what this path applied (`closed_at IS NOT NULL` + `never_filled` excluded + `closed_at >=
    // since`), so the POPULATION is unchanged and ONLY the row bound is removed.
    // ⚠️ The BASIS stays `pnl` deliberately: B-COST-MATH-CONSOLIDATION made `netPnl` canonical, but
    // the numerator also sums `pnl`, and moving one side alone makes the ratio incoherent
    // (Langston's standing condition 2). If it ever moves, BOTH sides move in ONE batch.
    let realizedPnl: number;
    if (mode === 'paper') {
      if (sessionStart) {
        ({ realizedPnl } = await storage.getRealizedPnlSince(mode, sessionStart));
      } else {
        // ═══ THE NULL-SESSION BRANCH -- previously unnamed, and it was the worst leg ═══
        // With no session start this path applied NO TIME FILTER AT ALL (`sessionStart ? filter :
        // allTrades`), so the balance became anchor + a TRUNCATED ALL-TIME realized sum wearing a
        // session balance's clothes, while the numerator fell back to a real 24h window -- the two
        // sides of the ratio measuring different things entirely.
        // ⚠️ REACHABLE AND DOCUMENTED: #585 -- auto-resume SKIPS a stale malformed `running`
        // session row, leaving `isRunning: true` with no session (owner CC-B, open). The evaluator
        // is gated on engine-active, NOT on session presence, so the verdict IS computed here.
        // ⛔ WHY NOT "REFUSE" (return 0): MEASURED -- `computeLossPercent` treats `portfolioValue
        // <= 0` as `nonPositiveValue` and `classifyTier` maps that STRAIGHT to tier `kill`. A
        // refusal would TRIP THE KILL SWITCH AND FLATTEN EVERY OPEN POSITION every time the session
        // record is missing after a restart. Refusing is not the safe option here; it is the
        // catastrophic one.
        // ⇒ ANCHOR-ONLY, LOUD: the anchor is a real known number; the session's realized P&L is
        // genuinely unknown, so add nothing rather than a figure we cannot define.
        realizedPnl = 0;
        console.warn(
          `[8.8.3-C7][GuardrailSettings][NULL_SESSION] mode=${mode} — no engine session start; ` +
          `balance falls back to the ANCHOR ALONE (${startingBalance.toFixed(2)}) with no realized ` +
          `adjustment. Kill-switch denominator is degraded-but-defined. See #585.`,
        );
      }
    } else {
      // LIVE leg UNCHANGED, deliberately: `getTrades` applies a limit only when one is passed and
      // none is passed here, so the live path never carried the cap this batch removes.
      const liveTrades = await storage.getTrades(mode, { status: 'closed' });
      const allTrades = liveTrades.map(t => ({
        ...t,
        closedAt: t.exitTime,
        pnl: t.realizedPL
      }));
      const sessionTrades = sessionStart
        ? allTrades.filter(t => t.closedAt && new Date(t.closedAt) >= sessionStart)
        : allTrades;
      realizedPnl = sessionTrades.reduce((sum, trade) => {
        return sum + parseFloat(trade.pnl?.toString() || '0');
      }, 0);
    }
    
    // Current Balance = Starting Balance + Realized P/L
    const currentBalance = startingBalance + realizedPnl;
    
    console.log(`[8.8.3-C7][GuardrailSettings] mode=${mode} startingBalance=${startingBalance.toFixed(2)} realizedPnl=${realizedPnl.toFixed(2)} currentBalance=${currentBalance.toFixed(2)}`);

    return currentBalance;
  } catch (error) {
    console.error(`[8.8.3-H4][GuardrailSettings] Error fetching portfolio balance for mode=${mode}:`, error);
    return 0;
  }
}

/**
 * B-BALANCE-SESSION-PAIRING (#618 leg 1) — a refusal of the money-held figure. THROWN, never returned as 0: a 0 reads as
 * "skip this check" at `trade-safety.ts` (the position-size cap) and as "no money" elsewhere, both the permissive or the
 * wrong direction (pre-audit A2). Every caller catches it by name and refuses what it was about to do.
 */
export class MoneyHeldUnavailable extends Error {
  constructor(public readonly reason: string) {
    super(`[B-BALANCE-SESSION-PAIRING][MONEY_HELD_UNAVAILABLE] ${reason}`);
    this.name = 'MoneyHeldUnavailable';
  }
}

/** The retention of `closed_trades` in hot storage (`data_lifecycle` / `closed_trades.hot_retention_days`, the key the
 *  B75 sweep reads at `server/scripts/b75-retention-sweep.ts:203`). No fallback: a missing or non-positive value refuses. */
async function readClosedTradesHotRetentionDays(): Promise<number> {
  const { db } = await import('../db.js');
  const { moduleConstants } = await import('@shared/schema');
  const { and, eq } = await import('drizzle-orm');
  // Two rows read, not one (Langston Step-4 condition (b)): the table's key is wider than these two columns, so more than
  // one match would make the value depend on row order. Refuse instead of picking one.
  const rows = await db.select({ value: moduleConstants.value }).from(moduleConstants)
    .where(and(eq(moduleConstants.moduleName, 'data_lifecycle'), eq(moduleConstants.constantName, 'closed_trades.hot_retention_days')))
    .limit(2);
  if (rows.length > 1) {
    throw new MoneyHeldUnavailable('data_lifecycle/closed_trades.hot_retention_days matches more than one row');
  }
  const row = rows[0];
  const days = parseLifecycleNumber(row?.value);
  if (days === null) {
    throw new MoneyHeldUnavailable(`data_lifecycle/closed_trades.hot_retention_days unreadable (${JSON.stringify(row?.value ?? null)})`);
  }
  return days;
}

/**
 * B-BALANCE-SESSION-PAIRING (#618 leg 1, pre-audit P1) — the MONEY HELD: the account's capital at cost.
 *   money held = the anchor value + the entry cost of every paper position OPEN at the anchor event + realized P&L since it.
 * The anchor value and its time come from ONE event: `portfolio_state.anchor_version` -> the ledger row with that version.
 * An anchor value is cash NOT committed to paper positions at the event (pre-audit A4), so positions open then are added
 * back at entry cost (the exposure numerator's basis); realized P&L since the event is the kill switch's own aggregate.
 * This is INVARIANT T3 as written (`bridge/canonical/DawnTrader_System_Invariants_Design_Guarantees.md` §1.3): starting
 * balance plus realized, no engine session. The kill switch keeps `getPortfolioBalanceV2` (session-paired, Kyle, #632).
 * THROWS `MoneyHeldUnavailable` (never returns 0) on: live mode; no state row; no ledger row for the version; a ledger
 * value that disagrees with the state row; anchor age at or past the hot retention of `closed_trades` (the sweep would
 * drop realized rows out of the figure); a straddler with a non-positive quantity or price; any read that throws.
 */
export async function getMoneyHeld(mode: 'live' | 'paper'): Promise<number> {
  if (mode !== 'paper') {
    throw new MoneyHeldUnavailable(`mode=${mode}: live money held is the exchange balance (Phase 21), not defined from the paper ledger`);
  }
  try {
    const { getAnchorState, getAnchorEventByVersion } = await import('./portfolio-anchor-service.js');
    const state = await getAnchorState(mode);
    if (!state) throw new MoneyHeldUnavailable(`mode=${mode}: no readable portfolio_state row`);
    const ev = await getAnchorEventByVersion(mode, state.anchorVersion);
    if (!ev) throw new MoneyHeldUnavailable(`mode=${mode}: no anchor ledger row for anchor_version=${state.anchorVersion}`);
    if (!Number.isFinite(ev.newBalance) || Math.abs(ev.newBalance - state.balance) > 0.005) {
      throw new MoneyHeldUnavailable(`mode=${mode}: anchor v${state.anchorVersion} ledger new_balance=${ev.newBalance} disagrees with portfolio_state.balance=${state.balance}`);
    }
    const retentionDays = await readClosedTradesHotRetentionDays();
    const ageDays = (Date.now() - ev.occurredAt.getTime()) / 86_400_000;
    if (ageDays >= retentionDays) {
      throw new MoneyHeldUnavailable(`mode=${mode}: anchor v${state.anchorVersion} is ${ageDays.toFixed(1)} days old, at or past closed_trades hot retention (${retentionDays} days)`);
    }
    const straddle = await storage.getStraddleEntryCostAt(mode, ev.occurredAt);
    if (straddle.invalidCount > 0 || !Number.isFinite(straddle.entryCost)) {
      throw new MoneyHeldUnavailable(`mode=${mode}: ${straddle.invalidCount} of ${straddle.count} positions open at anchor v${state.anchorVersion} have a non-positive quantity or price`);
    }
    const { realizedPnl, tradeCount } = await storage.getRealizedPnlSince(mode, ev.occurredAt);
    const moneyHeld = state.balance + straddle.entryCost + realizedPnl;
    if (!Number.isFinite(moneyHeld) || moneyHeld <= 0) {
      throw new MoneyHeldUnavailable(`mode=${mode}: money held is not positive (${moneyHeld})`);
    }
    console.log(`[B-BALANCE-SESSION-PAIRING][MONEY_HELD] mode=${mode} anchorVersion=${state.anchorVersion} reason=${ev.reason} `
      + `anchorAt=${ev.occurredAt.toISOString()} anchor=${state.balance.toFixed(2)} straddlers=${straddle.count} `
      + `straddleEntryCost=${straddle.entryCost.toFixed(2)} realizedPnl=${realizedPnl.toFixed(2)} closes=${tradeCount} moneyHeld=${moneyHeld.toFixed(2)}`);
    return moneyHeld;
  } catch (error) {
    if (error instanceof MoneyHeldUnavailable) throw error;
    throw new MoneyHeldUnavailable(`mode=${mode}: read failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Phase 8.8.3-H4: Build settings-compatible object from mode-level data
 * Fetches guardrails_v2 + portfolio_state and builds a TradingSettings-like object
 * 
 * All values are sourced from guardrails_v2 (visible in Guardrails tab):
 * - maxPositionPercentPct
 * - dailyLossKillSwitchPct
 * - maxOpenTrades (DERIVED from maxPositionPercentPct since B-SIZING-DEC-RESTORE obj-4)
 * - killSwitchTripped
 * - lowPriceThreshold (LPCP)
 * - lowPriceMinStopAtrMult (LPCP)
 * - lowPriceMinPositionNotional (LPCP)
 * 
 * @param mode Trading mode
 * @param userId User ID (optional for global context lookup)
 * @param globalContextId Optional global context ID
 * ⛔ Portfolio Risk per Trade is RETIRED in paper and live (B-SIZING-DEC-RESTORE increment 2c, Kyle 2026-09-29): every
 * trade is sized by the exposure budget and the max-position % (`active-position-sizing.ts`), so no risk % is built.
 * ⚠️ The return type is still the legacy `TradingSettings` row type (`as any` below), so a reader of a field this
 * builder never sets type-checks and reads undefined — 24 such fields today. Replacing it with a real type is its own
 * item, `#1106` `B-SETTINGS-REAL-TYPE`; until then the legacy-deletion fence is what keeps the retired risk names out.
 * @returns Settings-compatible object with all fields populated from mode-level sources
 */
export async function buildSettingsFromGuardrails(
  mode: 'live' | 'paper',
  userId?: string,
  globalContextId?: string
): Promise<TradingSettings & {
  killSwitchTripped: boolean;
  lpcpLowPriceThresholdUsd: number;
  lpcpMinStopAtrMultiple: number;
  lpcpMinNotionalUsd: number;
}> {
  const guardrails = await storage.getGuardrailsV2({ mode });
  if (!guardrails) {
    throw new Error(`[8.8.3-H4] No guardrails_v2 configured for mode=${mode}`);
  }

  // B-BALANCE-SESSION-PAIRING (#618 leg 1, pre-audit P2): the settings' portfolioValue is the MONEY HELD. A refusal
  // invalidates ONE field, not the builder: it becomes null (the field's native "unavailable"), so the callers that read
  // other fields (maxOpenTrades, the caps) keep working, and every portfolioValue reader refuses on null (pre-audit P3, the
  // value-provenance fence P11). A missing guardrails_v2 row, which invalidates every field, still throws above.
  let portfolioValue: number | null;
  try {
    portfolioValue = await getMoneyHeld(mode);
  } catch (e) {
    if (!(e instanceof MoneyHeldUnavailable)) throw e;
    console.warn(`[B-BALANCE-SESSION-PAIRING][SETTINGS_MONEY_HELD_NULL] mode=${mode}: ${e.reason}`);
    portfolioValue = null;
  }

  const guardrailsAny = guardrails as any;
  
  // P19-B8.8: field-level fallbacks retired. The throw at the top of this function
  // is the loud gate for a missing row; every column below is notNull-with-default
  // in the schema, so a falsy field here can only mean schema drift or a projection
  // change — exactly the fault the old '30.00'/'10.00'/'0.50'/'3.0'/'25.00' ternaries
  // silently absorbed. Raw values flow (NaN/'undefined' when broken); the blocking
  // consumers (trade-safety, the sizer) refuse loudly on unreadable input.
  const maxPositionPercent = String(guardrailsAny.maxPositionPercentPct);
  const lpcpLowPriceThresholdUsd = parseFloat(String(guardrailsAny.lowPriceThreshold));
  const lpcpMinStopAtrMultiple = parseFloat(String(guardrailsAny.lowPriceMinStopAtrMult));
  const lpcpMinNotionalUsd = parseFloat(String(guardrailsAny.lowPriceMinPositionNotional));
  const maxTotalExposurePct = String(guardrailsAny.maxTotalExposurePct);
  
  return {
    portfolioValue: portfolioValue === null ? null : portfolioValue.toString(),
    killSwitchTripped: guardrails.killSwitchTripped || false,
    // B-SIZING-DEC-RESTORE obj-4 (PRE_AUDIT §14): the `max_open_positions` SETTING is retired. How many
    // can be open is DERIVED from the per-trade share through the sizer's own resolver, so the slot count
    // and the trade size can never disagree (§14.4 BLOCKER-1/2): p = 5 ⇒ 20, p = 20 ⇒ 5, live p = 30 ⇒ 3.
    // The key name is kept for the internal object (its readers all mean "how many can be open"); the
    // settings SCREEN shows it as a derived, read-only value (§14.4 D1). ⚠️ It shares its name with the
    // LEGACY `trading_settings.max_open_trades` column (`TradingSettings`, default 3) — a known collision,
    // closed by increment 2b's rule-18 census, not by this line.
    // P19-B8.7's rule still holds: no fabricated cap. An unreadable p gives NaN (p = 0 gives Infinity),
    // and the engine's promotion loops HALT on !Number.isFinite rather than invent a number.
    maxOpenTrades: deriveSlotCount(resolveEffectivePositionPct(parseFloat(String(guardrails.maxPositionPercentPct)))),
    // P19-B8.8: the ': "7.00"' kill-switch default is GONE (same dead-but-dangerous
    // family as above — a defaulted KILL SWITCH is the worst number to fabricate).
    dailyLossKillSwitch: String(guardrails.dailyLossKillSwitchPct),
    // P19-B8.7 (OBJ-3): was a hardcoded '50.00' — a fiction that leaked into the AI
    // briefing text and diagnostics exports. Now the SAME DB-governed exposure cap
    // the sizer uses (maxTotalExposurePct, read above). Reporting-only consumers.
    maxExposurePercent: maxTotalExposurePct,
    maxPositionPercent,
    maxTotalExposurePct,
    autoTrade: false,
    lpcpLowPriceThresholdUsd,
    lpcpMinStopAtrMultiple,
    lpcpMinNotionalUsd,
  } as any;
}

