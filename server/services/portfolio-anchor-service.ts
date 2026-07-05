// P19-B8.2 (OBJ-3/OBJ-4) — the portfolio anchor service.
//
// An ANCHOR EVENT is the only way the paper balance is ever re-based: the
// start-new Kraken-mirror write ('start_new'), an automatic friction-divergence
// re-anchor ('auto_divergence'), or the Phase-21 go-live snap ('launch_snap' —
// the hook is BUILT here and invoked by Phase-21's go-live sequence, not before).
//
// A re-anchor writes balance + anchor_version + one append-only ledger row and
// NOTHING else — it never touches learning/calibration data (re-anchor ≠ learning
// reset, structurally). The at-open ratio stamps record which anchor version they
// were measured against, so history is never reinterpreted.
//
// Cooldown (Langston Step-1 hysteresis condition): an 'auto_divergence' re-anchor
// cannot fire within `friction_divergence.min_reanchor_interval_ms` of the LAST
// anchor event of any reason — boundary-hover cannot storm the ledger or the
// alert channel.

import { db } from '../db';
import { portfolioState, portfolioAnchorEvents } from '@shared/schema';
import { and, eq, desc } from 'drizzle-orm';

export type AnchorReason = 'start_new' | 'auto_divergence' | 'launch_snap';

export interface AnchorState {
  balance: number;
  anchorVersion: number;
}

export interface ReanchorInput {
  mode: 'paper' | 'live';
  newBalance: number;
  reason: AnchorReason;
  divergenceBps?: number;
  minNotionalDelta?: number;
}

/**
 * Read the current anchor state (default context row). Returns null when no row
 * exists — callers decide whether that is a refusal (resume) or a first-anchor
 * situation (start_new).
 */
export async function getAnchorState(mode: 'paper' | 'live'): Promise<AnchorState | null> {
  const [row] = await db
    .select({ balance: portfolioState.balance, anchorVersion: portfolioState.anchorVersion })
    .from(portfolioState)
    .where(and(eq(portfolioState.globalContextId, 'default'), eq(portfolioState.mode, mode)))
    .limit(1);
  if (!row) return null;
  const balance = Number.parseFloat(String(row.balance));
  if (!Number.isFinite(balance)) return null;
  return { balance, anchorVersion: row.anchorVersion ?? 0 };
}

/**
 * The at-open ratio stamp's inputs (OBJ-4): the CURRENT balance, the balance the
 * latest anchor event set (the ratio's denominator), and that anchor's version.
 * Returns null when no anchor event exists — the stamp is then an HONEST NULL
 * (pre-B8.2 / legacy-continue state; never a guessed 1.0).
 */
export async function getRatioStampInputs(
  mode: 'paper' | 'live'
): Promise<{ currentBalance: number; anchorBalance: number; anchorVersion: number } | null> {
  const state = await getAnchorState(mode);
  if (!state || !(state.balance > 0)) return null;
  const [event] = await db
    .select({ newBalance: portfolioAnchorEvents.newBalance, anchorVersion: portfolioAnchorEvents.anchorVersion })
    .from(portfolioAnchorEvents)
    .where(eq(portfolioAnchorEvents.mode, mode))
    .orderBy(desc(portfolioAnchorEvents.anchorVersion))
    .limit(1);
  if (!event) return null;
  const anchorBalance = Number.parseFloat(String(event.newBalance));
  if (!Number.isFinite(anchorBalance) || anchorBalance <= 0) return null;
  return { currentBalance: state.balance, anchorBalance, anchorVersion: event.anchorVersion };
}

/** The most recent anchor event's timestamp for the mode, or null. */
export async function getLastAnchorAt(mode: 'paper' | 'live'): Promise<Date | null> {
  const [row] = await db
    .select({ occurredAt: portfolioAnchorEvents.occurredAt })
    .from(portfolioAnchorEvents)
    .where(eq(portfolioAnchorEvents.mode, mode))
    .orderBy(desc(portfolioAnchorEvents.occurredAt))
    .limit(1);
  return row?.occurredAt ?? null;
}

/**
 * Execute a re-anchor: append the ledger row and set balance + anchor_version
 * atomically. THROWS on invalid input — never writes a partial anchor.
 *
 * Does NOT itself check the cooldown — 'start_new' and 'launch_snap' are
 * deliberate operator/lifecycle acts; the divergence evaluator applies the
 * cooldown before calling this for 'auto_divergence'.
 */
export async function executeReanchor(input: ReanchorInput): Promise<{ anchorVersion: number }> {
  const { mode, newBalance, reason } = input;
  if (!Number.isFinite(newBalance) || newBalance <= 0) {
    throw new Error(`[B8.2][anchor] Refusing re-anchor (${reason}): invalid newBalance ${newBalance}`);
  }

  return await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ balance: portfolioState.balance, anchorVersion: portfolioState.anchorVersion })
      .from(portfolioState)
      .where(and(eq(portfolioState.globalContextId, 'default'), eq(portfolioState.mode, mode)))
      .limit(1);

    const oldBalance = current ? Number.parseFloat(String(current.balance)) : null;
    const nextVersion = (current?.anchorVersion ?? 0) + 1;

    await tx.insert(portfolioAnchorEvents).values({
      mode,
      anchorVersion: nextVersion,
      oldBalance: oldBalance !== null && Number.isFinite(oldBalance) ? oldBalance.toFixed(2) : null,
      newBalance: newBalance.toFixed(2),
      reason,
      divergenceBps: input.divergenceBps !== undefined ? input.divergenceBps.toFixed(4) : null,
      minNotionalDelta: input.minNotionalDelta ?? null,
    });

    if (current) {
      await tx
        .update(portfolioState)
        .set({ balance: newBalance.toFixed(2), anchorVersion: nextVersion, lastUpdate: new Date() })
        .where(and(eq(portfolioState.globalContextId, 'default'), eq(portfolioState.mode, mode)));
    } else {
      await tx.insert(portfolioState).values({
        globalContextId: 'default',
        mode,
        balance: newBalance.toFixed(2),
        anchorVersion: nextVersion,
      });
    }

    console.log(
      `[B8.2][anchor] ${mode} re-anchored: ${oldBalance ?? '(none)'} -> ${newBalance.toFixed(2)} ` +
      `(reason=${reason}, anchor_version=${nextVersion})`
    );
    return { anchorVersion: nextVersion };
  });
}

/**
 * The launch-snap hook (Kyle decision #2): snap the balance to the live Kraken
 * mirror figure. BUILT NOW, invoked by the Phase-21 go-live sequence (and by the
 * auto-divergence evaluator with reason='auto_divergence'). Announces via a
 * system alert so the re-anchor is always visible to the crew.
 */
export async function reanchorToLive(
  mode: 'paper' | 'live',
  reason: AnchorReason,
  extras?: { divergenceBps?: number; minNotionalDelta?: number }
): Promise<{ anchorVersion: number; newBalance: number }> {
  const { getKrakenMirrorBalance } = await import('./kraken-mirror-balance');
  const mirror = await getKrakenMirrorBalance(); // throws on failure — no fallback
  const old = await getAnchorState(mode);

  const { anchorVersion } = await executeReanchor({
    mode,
    newBalance: mirror.mirrorBalanceUsd,
    reason,
    ...extras,
  });

  try {
    const { addAlert } = await import('./system-alerts');
    await addAlert({
      triggers_at: new Date(),
      title: `Balance re-anchored (${reason})`,
      body:
        `The ${mode} balance was re-anchored from ${old ? `$${old.balance.toFixed(2)}` : '(no prior)'} ` +
        `to the live Kraken figure $${mirror.mirrorBalanceUsd.toFixed(2)} (anchor version ${anchorVersion}).` +
        (extras?.divergenceBps !== undefined
          ? ` Trigger: estimated execution-cost divergence ${extras.divergenceBps.toFixed(1)} bps` +
            (extras?.minNotionalDelta ? ` + ${extras.minNotionalDelta} min-notional-blocked candidates` : '') + '.'
          : '') +
        ' Learning and calibration data are untouched — a re-anchor is a balance event only.',
      severity: 'info',
      category: 'one_off',
      metadata: { mode, reason, anchorVersion, newBalance: mirror.mirrorBalanceUsd },
    });
  } catch (alertErr: any) {
    // The re-anchor itself succeeded; a failed announce must not unwind it.
    console.error(`[B8.2][anchor] re-anchor alert write failed (re-anchor stands): ${alertErr?.message}`);
  }

  return { anchorVersion, newBalance: mirror.mirrorBalanceUsd };
}
