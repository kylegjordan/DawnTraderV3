import {
  clearEvidence, easternDate, memberField, railKey, railRowClear, railRowTradeId, stepMemberClock,
  MEMBER_ESCALATE_AFTER_MS, RAIL_KEY_PREFIX, STUCK_SWEEP_FAILURES, VTS_RAIL_ACTOR, VTS_RAIL_REF,
  VTS_STANDING_KEY, VTS_STUCK_KEY, vtsXstockJoinsStandingRecord, type MemberClock,
} from '../core/trading/vts-rail.js';
import { vtsRefusalReceiptField } from '../core/trading/vts-refusal-evidence.js';
import type { VtsFeedIncidentEvidence } from './vts-feed-incident-windows.js';
import type { VtsIncidentRecoveryCandidate } from './vts-feed-incident-recovery.js';
import type { AddAlertOptions, AlertStoreDraft, SystemAlert } from './system-alerts.js';
import type { ClassVerdict } from './venue-quiet-alerting.js';
import {
  closeVtsIncidentMembers, handBackVtsIncidentMembers, joinVtsFeedIncident, markVtsIncidentDecision, openVtsFeedIncidents,
  outstandingVtsIncidentTrades, vtsIncidentReasonExits, vtsIncidentRecoveryCandidate,
} from './vts-feed-incident-members.js';

export const decidedField = (tradeId: string) => `decided_${tradeId}`;

export interface RailMember extends MemberClock {
  symbol: string;
  reason: string;
  joinedAtMs: number;
}

export interface Crossing {
  tradeId: string;
  symbol: string;
  assetClass: string;
  lastReason: string;
  pageSinceMs: number;
  title: string;
  body: string;
  feedIncident?: VtsFeedIncidentEvidence | null;
  streakId?: string;
}

function receipt(c: Pick<Crossing, 'tradeId' | 'streakId' | 'pageSinceMs'>): Record<string, string> {
  return c.streakId ? { [vtsRefusalReceiptField(c.streakId, c.pageSinceMs)]: c.tradeId } : {};
}

export function ownWarning(c: Crossing, nowMs: number): AddAlertOptions {
  const evidence = c.feedIncident;
  return {
    triggers_at: new Date(nowMs), category: 'breakage', severity: 'warning',
    title: c.title, body: c.body, dedupe_key: railKey(c.symbol, c.tradeId),
    metadata: {
      tradeId: c.tradeId, ...receipt(c),
      ...(evidence ? { feedIncident: {
        key: evidence.key, generation: evidence.generation,
        windowStartMonotonicMs: evidence.startMs, windowEndMonotonicMs: evidence.endMs,
        subscribedSymbols: evidence.subscribed, qualifyingSymbols: evidence.qualified.length,
        missingReceipts: evidence.missing.length,
      } } : {}),
    },
  };
}

export function standingWarning(nowMs: number): AddAlertOptions {
  return {
    triggers_at: new Date(nowMs), category: 'health_check', severity: 'info',
    title: 'VTS xStock exits waiting on wide or quiet books',
    body: 'Open VTS xStock trades whose exit cannot be decided because the book is too wide (or the market is quiet). '
      + 'This is EXPECTED at the US open and overnight and pages nobody (Kyle #994; row 2 objective 9). Each member, its '
      + 'reason and its session clock are in metadata; a member still stuck after 30 min of regular-session time pages on '
      + 'its own key; a member leaves when its trade decides or closes; the record resolves itself when empty.',
    metadata: {}, dedupe_key: VTS_STANDING_KEY,
  };
}

export function standingJoin(
  c: Pick<Crossing, 'tradeId' | 'symbol' | 'lastReason' | 'pageSinceMs' | 'streakId'>,
  nowMs: number, metadata: Record<string, unknown>,
) {
  const saved = metadata[memberField(c.tradeId)] as RailMember | null | undefined;
  const decidedAt = metadata[decidedField(c.tradeId)];
  // A re-crossing after a decision starts a new clock. A restart during the same refusal keeps its exposure.
  const prior = saved && !(typeof decidedAt === 'number' && decidedAt > saved.joinedAtMs) ? saved : null;
  const member: RailMember = {
    ...(prior ?? { symbol: c.symbol, joinedAtMs: nowMs, sessionClockStartMs: c.pageSinceMs, sessionDateEt: easternDate(c.pageSinceMs) }),
    reason: c.lastReason,
  };
  const etDate = easternDate(nowMs);
  if (member.sessionDateEt !== etDate) {
    member.sessionClockStartMs = c.pageSinceMs;
    member.sessionDateEt = etDate;
  }
  return {
    [memberField(c.tradeId)]: member, [decidedField(c.tradeId)]: null,
    suppressedPages: (typeof metadata.suppressedPages === 'number' ? metadata.suppressedPages : 0) + 1,
    ...receipt(c),
  };
}

export type LiveWarning = { crossing: Crossing; nowMs: number; action: 'join' | 'page' | 'leave'; leaveStanding?: boolean };
export type LiveWarningResult = { alertId: string; route: 'joined' | 'incident' | 'individual'; minted: boolean };

function warningObservedAt(row: Readonly<SystemAlert>): number {
  const observedAt = row.metadata?.vtsWarningObservedAtMs;
  return typeof observedAt === 'number' && Number.isFinite(observedAt) ? observedAt : Date.parse(row.created_at);
}

/** The warning and its exact crossing evidence commit together. The queue retries a failed publication. */
export function writeLiveWarning(draft: AlertStoreDraft, { crossing: c, nowMs, action, leaveStanding }: LiveWarning): LiveWarningResult | null {
  const saved = c.streakId ? draft.vtsRefusals.get(c.streakId) : undefined;
  const identity = saved?.tradeId === c.tradeId ? saved : undefined;
  const disposition = identity?.crossings.find(item => item.pageSinceMs === c.pageSinceMs)?.disposition;
  if (action !== 'leave' && disposition) return { ...disposition, minted: false };

  const standing = draft.rows.find(row => row.dedupe_key === VTS_STANDING_KEY && row.state !== 'resolved');
  const member = standing?.metadata?.[memberField(c.tradeId)] as RailMember | null | undefined;
  const leaveMember = member && standing && nowMs >= member.joinedAtMs && leaveStanding !== false;
  const reasonExits = action === 'leave' ? vtsIncidentReasonExits(draft, c, nowMs) : [];
  if (action === 'leave' && !leaveMember && !reasonExits.length) return null;

  if (action === 'join') {
    const row = standing ?? draft.add(standingWarning(nowMs));
    draft.mergeMetadata(row.id, current => standingJoin(c, nowMs, current));
    saveDisposition(row.id, 'joined');
    return { alertId: row.id, route: 'joined', minted: !standing };
  }

  if (reasonExits.length && leaveStanding === false) {
    const row = standing ?? draft.add(standingWarning(nowMs));
    const pageSinceMs = Math.min(...reasonExits.map(({ member }) => member.pageSinceMs));
    // Keep the first incident's receipt on that incident. The standing row takes over the continuing exposure.
    draft.mergeMetadata(row.id, current => standingJoin({ ...c, pageSinceMs, streakId: undefined }, nowMs, current));
    for (const { rowId, field, member: origin } of reasonExits) {
      draft.mergeMetadata(rowId, { [field]: { ...origin, fallbackAlertId: row.id, fallbackReason: c.lastReason, fallbackObservedAtMs: nowMs } });
    }
    return { alertId: row.id, route: 'joined', minted: !standing };
  }

  const ownCrossing = reasonExits.length ? { ...c, streakId: undefined } : c;
  const warning = ownWarning(ownCrossing, nowMs);
  const active = draft.rows.find(row => row.dedupe_key === warning.dedupe_key && row.state !== 'resolved');
  if (action === 'page' && !active) {
    const group = joinVtsFeedIncident(draft, c, nowMs);
    if (group) {
      if (member && standing && nowMs >= member.joinedAtMs) {
        draft.mergeMetadata(standing.id, { [memberField(c.tradeId)]: null, [decidedField(c.tradeId)]: null });
      }
      saveDisposition(group.alertId, 'incident');
      return { ...group, route: 'incident' };
    }
  }
  const episodeExit = reasonExits[0]?.member;
  const row = active ?? draft.add({
    ...warning,
    ...(episodeExit ? {
      title: `VTS exit decisions unavailable — ${c.symbol} now has a separate refusal`,
      body: `Open virtual trade ${c.tradeId} in ${c.symbol} started refusing at ${new Date(episodeExit.firstAtMs).toISOString()} `
        + `and now has a separate reason (${c.lastReason}). This warning clears when the trade decides or closes.`,
    } : {}),
    metadata: { ...warning.metadata, vtsWarningObservedAtMs: nowMs },
  });
  if (railRowTradeId(row) !== c.tradeId) throw new Error('VTS warning dedupe key belongs to a different trade');
  if (leaveMember) {
    draft.mergeMetadata(standing.id, { [memberField(c.tradeId)]: null, [decidedField(c.tradeId)]: null });
  }
  if (reasonExits.length) {
    const sources: Record<string, unknown> = {};
    for (const { rowId, field, member: origin } of reasonExits) {
      draft.mergeMetadata(rowId, { [field]: { ...origin, fallbackAlertId: row.id, fallbackReason: c.lastReason, fallbackObservedAtMs: nowMs } });
      sources[field] = { incidentAlertId: rowId, ...origin, nextReason: c.lastReason };
    }
    draft.mergeMetadata(row.id, current => ({ vtsIncidentReasonExits: {
      ...(typeof current.vtsIncidentReasonExits === 'object' ? current.vtsIncidentReasonExits : {}), ...sources,
    } }));
  }
  const exactReceipt = receipt(ownCrossing);
  if (Object.entries(exactReceipt).some(([field, tradeId]) => row.metadata[field] !== tradeId)) {
    draft.mergeMetadata(row.id, exactReceipt);
  }
  if (action === 'page') saveDisposition(row.id, 'individual');
  return { alertId: row.id, route: 'individual', minted: !active };

  function saveDisposition(alertId: string, route: LiveWarningResult['route']): void {
    if (!identity) return;
    draft.recordVtsRefusal({
      tradeId: c.tradeId, streakId: identity.streakId, kind: 'disposition', pageSinceMs: c.pageSinceMs,
      disposition: { alertId, route },
    });
  }
}

/** Recheck the exact trade and live row generation after any earlier joins in the same write. */
export function writeLiveDecision(draft: AlertStoreDraft, tradeId: string, atMs: number): boolean {
  let stored = false;
  for (const row of draft.rows) {
    if (row.state === 'resolved') continue;
    if (row.dedupe_key === VTS_STANDING_KEY) {
      const member = row.metadata?.[memberField(tradeId)] as RailMember | null | undefined;
      if (member && atMs > member.joinedAtMs) {
        const field = decidedField(tradeId);
        const prior = row.metadata[field];
        if (typeof prior !== 'number' || atMs > prior) draft.mergeMetadata(row.id, { [field]: atMs });
        stored = true;
      }
    } else if (row.dedupe_key?.startsWith(RAIL_KEY_PREFIX) && railRowTradeId(row) === tradeId) {
      // The observation timestamp is earlier than file publication when the worker is backed up.
      const observedAt = warningObservedAt(row);
      if (!Number.isFinite(observedAt) || atMs <= observedAt) continue;
      const prior = row.metadata?.decidedAtMs;
      if (typeof prior !== 'number' || atMs > prior) draft.mergeMetadata(row.id, { decidedAtMs: atMs });
      stored = true;
    }
  }
  for (const incident of openVtsFeedIncidents(draft.rows)) {
    if (markVtsIncidentDecision(draft, incident, tradeId, atMs)) stored = true;
  }
  return stored;
}

export function standingMembers(row?: Readonly<SystemAlert>): [string, RailMember][] {
  return Object.entries(row?.metadata ?? {})
    .filter(([key, member]) => key.startsWith('member_') && member)
    .map(([key, member]) => [key.slice('member_'.length), member as RailMember]);
}

export function openVtsRail(rows: readonly Readonly<SystemAlert>[]) {
  return {
    warnings: rows.filter(row => row.state !== 'resolved' && row.dedupe_key?.startsWith(RAIL_KEY_PREFIX)),
    standing: rows.find(row => row.state !== 'resolved' && row.dedupe_key === VTS_STANDING_KEY),
  };
}

export function stuckWarning(why: string, nowMs: number): AddAlertOptions {
  return {
    triggers_at: new Date(nowMs), category: 'breakage', severity: 'warning',
    title: 'VTS standing record is not clearing itself',
    body: `The VTS no-decision rail's standing record (${VTS_STANDING_KEY}) is not being maintained: ${why}. Its members and `
      + `their 30-min escalation depend on the once-a-minute sweep (${VTS_RAIL_REF}); until it recovers, read the record by hand. `
      + 'This warning resolves itself when the sweep runs clean.',
    metadata: { why }, dedupe_key: VTS_STUCK_KEY,
  };
}

export type LiveRailSweep = { regular: boolean; precedingFailures: number; xstockVerdict?: ClassVerdict | null };
export interface LiveRailSweepResult {
  rowIds: [tradeId: string, alertId: string][];
  memberIds: [tradeId: string, alertId: string][];
  incidentTradeIds: string[];
  recoveryCandidates: VtsIncidentRecoveryCandidate[];
  openWarnings: number;
  members: number;
  resolved: number;
  escalated: number;
  minted: number;
  handbackWarnings: number;
}

/** Re-read members under the lock so a late join is included before closing the standing row. */
export function sweepLiveWarnings(
  draft: AlertStoreDraft, closed: ReadonlySet<string> | null, lookedUp: ReadonlySet<string>, nowMs: number, sweep: LiveRailSweep,
): LiveRailSweepResult {
  const { warnings, standing } = openVtsRail(draft.rows);
  const members = standingMembers(standing);
  const result: LiveRailSweepResult = {
    rowIds: [], memberIds: [], incidentTradeIds: [], recoveryCandidates: [], openWarnings: warnings.length, members: members.length,
    resolved: 0, escalated: 0, minted: 0, handbackWarnings: 0,
  };
  if (closed) {
    for (const row of warnings) {
      const tradeId = railRowTradeId(row);
      if (!tradeId) continue;
      const observedAt = warningObservedAt(row);
      const createdAt = Number.isFinite(observedAt) ? new Date(observedAt).toISOString() : row.created_at;
      const why = railRowClear(createdAt, row.metadata?.decidedAtMs, closed.has(tradeId));
      if (why && draft.resolve(row.id, VTS_RAIL_ACTOR, clearEvidence(why, tradeId), 'engine')) result.resolved++;
    }
    if (standing) {
      const patches: Record<string, unknown> = {};
      const date = easternDate(nowMs);
      let remaining = 0;
      for (const [tradeId, member] of members) {
        const decidedAt = standing.metadata?.[decidedField(tradeId)];
        if (closed.has(tradeId) || (typeof decidedAt === 'number' && decidedAt > member.joinedAtMs)) {
          patches[memberField(tradeId)] = null;
          patches[decidedField(tradeId)] = null;
          continue;
        }
        const clock = stepMemberClock(member, nowMs, sweep.regular, date);
        if (clock.elapsedMs >= MEMBER_ESCALATE_AFTER_MS) {
          const sent = writeLiveWarning(draft, { crossing: memberEscalation(tradeId, member, clock, nowMs), nowMs, action: 'leave' });
          if (sent) {
            result.escalated++;
            if (sent.minted) result.minted++;
            continue;
          }
        }
        if (clock.sessionClockStartMs !== member.sessionClockStartMs || clock.sessionDateEt !== member.sessionDateEt) {
          patches[memberField(tradeId)] = { ...member, sessionClockStartMs: clock.sessionClockStartMs, sessionDateEt: clock.sessionDateEt };
        }
        remaining++;
      }
      if (Object.keys(patches).length) draft.mergeMetadata(standing.id, patches);
      if (remaining === 0) draft.resolve(standing.id, VTS_RAIL_ACTOR, `STANDING-RECORD-EMPTY ${VTS_RAIL_REF}`, 'engine');
    }
    for (const incident of openVtsFeedIncidents(draft.rows)) {
      if (closeVtsIncidentMembers(draft, incident, closed, nowMs)) {
        result.resolved++;
      } else if (sweep.regular) {
        const minted = handBackVtsIncidentMembers(draft, incident, lookedUp, nowMs, crossing => {
          if (!vtsXstockJoinsStandingRecord(crossing.lastReason, sweep.xstockVerdict ?? null)) return null;
          const record = draft.add(standingWarning(nowMs));
          const pageSinceMs = easternDate(crossing.pageSinceMs) === easternDate(nowMs) ? crossing.pageSinceMs : nowMs;
          return draft.mergeMetadata(record.id, current => standingJoin({ ...crossing, pageSinceMs }, nowMs, current));
        });
        if (minted !== null) {
          result.resolved++;
          result.handbackWarnings += minted;
        }
      }
    }
    const stuck = draft.rows.find(row => row.state !== 'resolved' && row.dedupe_key === VTS_STUCK_KEY);
    if (stuck) draft.resolve(stuck.id, VTS_RAIL_ACTOR, `SWEEP-CLEAN ${VTS_RAIL_REF}`, 'engine');
  } else if (sweep.precedingFailures + 1 >= STUCK_SWEEP_FAILURES) {
    draft.add(stuckWarning(`the exact trade-close lookup failed ${sweep.precedingFailures + 1} times in a row`, nowMs));
  }

  const current = openVtsRail(draft.rows);
  for (const row of current.warnings) {
    const tradeId = railRowTradeId(row);
    if (tradeId) result.rowIds.push([tradeId, row.id]);
  }
  if (current.standing) {
    for (const [tradeId] of standingMembers(current.standing)) result.memberIds.push([tradeId, current.standing.id]);
  }
  for (const incident of openVtsFeedIncidents(draft.rows)) {
    result.incidentTradeIds.push(...outstandingVtsIncidentTrades(incident));
    const candidate = vtsIncidentRecoveryCandidate(incident);
    if (candidate) result.recoveryCandidates.push(candidate);
  }
  return result;
}

export function memberEscalation(
  tradeId: string, member: RailMember, clock: MemberClock & { elapsedMs: number }, nowMs: number,
): Crossing {
  const mins = Math.round(clock.elapsedMs / 60_000);
  return {
    tradeId, symbol: member.symbol, assetClass: 'xstock_spot', lastReason: member.reason, pageSinceMs: clock.sessionClockStartMs ?? nowMs,
    title: `VTS exit decisions unavailable — ${mins} min with no decision for ${member.symbol}`,
    body: `VTS has made NO exit decision for ${mins} minutes of US regular-session paging time (counted from 09:45 ET at the `
      + `open, row 2 increment (4c)) on open virtual trade ${tradeId} in `
      + `${member.symbol} (most recent reason: ${member.reason}) — past the ${MEMBER_ESCALATE_AFTER_MS / 60_000}-minute norm for an expected wide `
      + 'book (row 2 increment (4a), audit A5: 421 of 423 such streaks ended within 30 min, measured on a clock that started at 09:30). While this lasts its stop and '
      + `target are NOT evaluated. This row clears itself when the trade decides or closes (${VTS_RAIL_REF}).`,
  };
}
