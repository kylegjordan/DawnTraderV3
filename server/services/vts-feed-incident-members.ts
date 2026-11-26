import { randomUUID } from 'node:crypto';
import {
  EXPECTED_OLD, isVtsFeedIncidentAlert, memberField, railKey, railRowTradeId,
  VTS_COMMON_XSTOCK_INCIDENT_COHORT, VTS_FEED_INCIDENT_KEY_PREFIX, VTS_STANDING_KEY,
  VTS_RAIL_ACTOR, VTS_RAIL_REF,
} from '../core/trading/vts-rail.js';
import { isProvedVtsRefusalCrossing, vtsRefusalReceiptField } from '../core/trading/vts-refusal-evidence.js';
import type { AlertStoreDraft, SystemAlert } from './system-alerts.js';
import type { Crossing } from './vts-live-warning.js';
import { isCoveredVtsIncidentRecovery, type VtsIncidentRecoveryCandidate, type VtsIncidentRecoveryProof } from './vts-feed-incident-recovery.js';

interface IncidentMember {
  tradeId: string;
  symbol: string;
  streakId: string;
  firstAtMs: number;
  pageSinceMs: number;
  observedAtMs: number;
  reason: string;
  fallbackAlertId?: string;
  fallbackReason?: string;
  fallbackObservedAtMs?: number;
  decidedAtMs?: number;
  closeObservedAtMs?: number;
}

type IncidentRow = Readonly<SystemAlert>;
const MEMBER_PREFIX = 'vtsIncidentMember:';

export function openVtsFeedIncidents(rows: readonly IncidentRow[]): IncidentRow[] {
  return rows.filter(row => row.state !== 'resolved' && isVtsFeedIncidentAlert(row));
}

function incidentMembers(row: IncidentRow): [field: string, member: IncidentMember][] {
  return Object.entries(row.metadata ?? {}).flatMap(([field, value]) => {
    if (!field.startsWith(MEMBER_PREFIX) || !value || typeof value !== 'object') return [];
    const member = value as IncidentMember;
    return typeof member.tradeId === 'string' && Number.isFinite(member.observedAtMs) ? [[field, member]] : [];
  });
}

export function outstandingVtsIncidentTrades(row: IncidentRow): string[] {
  return incidentMembers(row).flatMap(([, member]) =>
    member.decidedAtMs === undefined && member.closeObservedAtMs === undefined ? [member.tradeId] : []);
}

export function vtsIncidentRecoveryCandidate(row: IncidentRow): VtsIncidentRecoveryCandidate | null {
  if (row.metadata.vtsIncidentRecovery) return null;
  const trades = new Map<string, string>();
  for (const [, member] of incidentMembers(row)) {
    if (member.decidedAtMs === undefined && member.closeObservedAtMs === undefined) trades.set(member.tradeId, member.symbol);
  }
  if (!trades.size) return null;
  return { alertId: row.id, members: [...trades].map(([tradeId, symbol]) => ({ tradeId, symbol })) };
}

/** A positive grade is retained with its frozen population and each linked look. */
export function saveVtsIncidentRecoveryProof(draft: AlertStoreDraft, proof: VtsIncidentRecoveryProof, atMs: number): boolean {
  const row = openVtsFeedIncidents(draft.rows).find(incident => incident.id === proof.alertId);
  if (!row || row.metadata.vtsIncidentRecovery || !isCoveredVtsIncidentRecovery(proof)) return false;
  const members = new Map(incidentMembers(row).map(([, member]) => [member.tradeId, member.symbol]));
  if (proof.members.some(member => members.get(member.tradeId) !== member.symbol)) return false;
  return draft.mergeMetadata(row.id, { vtsIncidentRecovery: { ...proof, recordedAtMs: atMs } }) !== null;
}

export function vtsIncidentReasonExits(draft: AlertStoreDraft, c: Crossing, nowMs: number) {
  if (c.assetClass !== 'xstock_spot' || c.lastReason === EXPECTED_OLD) return [];
  return openVtsFeedIncidents(draft.rows).flatMap(row => incidentMembers(row)
    .filter(([, member]) => member.tradeId === c.tradeId && member.symbol === c.symbol && nowMs > member.observedAtMs
      && member.closeObservedAtMs === undefined && member.decidedAtMs === undefined && !member.fallbackAlertId)
    .map(([field, member]) => ({ rowId: row.id, field, member })));
}

/** Join only a saved, proved crossing for this exact trade, streak and coverage cut. */
export function joinVtsFeedIncident(draft: AlertStoreDraft, c: Crossing, nowMs: number) {
  const evidence = c.feedIncident;
  if (c.assetClass !== 'xstock_spot' || c.lastReason !== EXPECTED_OLD || !c.streakId || !evidence
    || evidence.key !== VTS_COMMON_XSTOCK_INCIDENT_COHORT || !evidence.qualified.includes(c.symbol)) return null;
  const refusal = draft.vtsRefusals.get(c.streakId);
  const crossing = refusal?.crossings.find(item => item.pageSinceMs === c.pageSinceMs && item.observedAtMs === nowMs);
  const cut = crossing?.feedCoverage;
  if (!refusal || refusal.tradeId !== c.tradeId || refusal.symbol !== c.symbol || refusal.closed || refusal.decidedAtMs !== null
    || !crossing || crossing.reason !== EXPECTED_OLD || !isProvedVtsRefusalCrossing(refusal, crossing) || !cut
    || cut.key !== evidence.key || cut.generation !== evidence.generation || cut.startMs !== evidence.startMs
    || cut.endMs !== evidence.endMs || cut.subscribed !== evidence.subscribed || cut.qualified !== evidence.qualified.length
    || cut.endMs - cut.startMs !== 120_000 || cut.endMs > cut.cutMs
    || cut.qualified < Math.max(10, Math.ceil(cut.subscribed * 0.8)) || cut.qualified > cut.subscribed) return null;

  const prior = openVtsFeedIncidents(draft.rows).find(row => row.metadata.vtsFeedIncidentCohort === evidence.key);
  // A slow crossing can be newer than the end marker while its entire observation predates recovery.
  const coverageStartedAtMs = nowMs - (cut.cutMs - cut.startMs);
  if (draft.rows.some(row => isVtsFeedIncidentAlert(row) && row.metadata.vtsFeedIncidentCohort === evidence.key
    && typeof row.metadata.vtsIncidentEndedAtMs === 'number' && row.metadata.vtsIncidentEndedAtMs >= coverageStartedAtMs)) return null;
  const field = vtsRefusalReceiptField(c.streakId, c.pageSinceMs);
  const metadata = {
    [field]: c.tradeId,
    [`${MEMBER_PREFIX}${field}`]: {
      tradeId: c.tradeId, symbol: c.symbol, streakId: c.streakId, firstAtMs: refusal.firstAtMs,
      pageSinceMs: c.pageSinceMs, observedAtMs: nowMs, reason: c.lastReason,
    } satisfies IncidentMember,
  };
  const row = prior
    ? draft.mergeMetadata(prior.id, current => current[field] === c.tradeId ? {} : metadata)
    : draft.add({
      triggers_at: new Date(nowMs), category: 'breakage', severity: 'warning',
      title: 'B-XSTOCK-BID-TRIGGER-RELAND VTS xStock exits blocked',
      body: 'VTS could not evaluate exits for a group of xStock trades whose bids were stale across two covered feed windows. '
        + 'The affected trades, their original refusal times, and their subsequent outcomes are recorded separately on this warning.',
      dedupe_key: `${VTS_FEED_INCIDENT_KEY_PREFIX}${randomUUID()}`,
      metadata: { vtsFeedIncidentVersion: 1, vtsFeedIncidentCohort: evidence.key, firstCoverage: cut, ...metadata },
    });
  return row ? { alertId: row.id, minted: !prior } : null;
}

export function markVtsIncidentDecision(draft: AlertStoreDraft, row: IncidentRow, tradeId: string, atMs: number): boolean {
  const patch: Record<string, IncidentMember> = {};
  for (const [field, member] of incidentMembers(row)) {
    if (member.tradeId === tradeId && member.closeObservedAtMs === undefined && atMs > member.observedAtMs
      && (member.decidedAtMs === undefined || atMs > member.decidedAtMs)) patch[field] = { ...member, decidedAtMs: atMs };
  }
  return Object.keys(patch).length > 0 && draft.mergeMetadata(row.id, patch) !== null;
}

export function closeVtsIncidentMembers(draft: AlertStoreDraft, row: IncidentRow, closed: ReadonlySet<string>, nowMs: number): boolean {
  const members = incidentMembers(row);
  const patch: Record<string, IncidentMember> = {};
  for (const [field, member] of members) {
    if (closed.has(member.tradeId) && member.closeObservedAtMs === undefined && member.decidedAtMs === undefined) {
      patch[field] = { ...member, closeObservedAtMs: nowMs };
    }
  }
  const storedMemberCount = Object.keys(row.metadata).filter(field => field.startsWith(MEMBER_PREFIX)).length;
  const terminal = members.length > 0 && members.length === storedMemberCount
    && members.every(([field, member]) => patch[field] || member.closeObservedAtMs !== undefined || member.decidedAtMs !== undefined);
  if (terminal) {
    draft.mergeMetadata(row.id, { ...patch, vtsIncidentEndedAtMs: nowMs });
    return draft.resolve(row.id, VTS_RAIL_ACTOR, `FEED-INCIDENT-MEMBERS-DECIDED-OR-CLOSED ${VTS_RAIL_REF}`, 'engine') !== null;
  }
  if (Object.keys(patch).length) draft.mergeMetadata(row.id, patch);
  return false;
}

/** Publish successors and retire the incident in one store edit after the exact close look. */
export function handBackVtsIncidentMembers(
  draft: AlertStoreDraft, row: IncidentRow, lookedUp: ReadonlySet<string>, nowMs: number,
  joinExpected: (crossing: Pick<Crossing, 'tradeId' | 'symbol' | 'lastReason' | 'pageSinceMs'>) => SystemAlert | null,
): number | null {
  const recovery = row.metadata.vtsIncidentRecovery as (VtsIncidentRecoveryProof & { recordedAtMs: number }) | undefined;
  const members = incidentMembers(row);
  if (!recovery || nowMs < recovery.recordedAtMs || !members.length
    || members.length !== Object.keys(row.metadata).filter(field => field.startsWith(MEMBER_PREFIX)).length) return null;
  const outstanding = members.filter(([, member]) => member.decidedAtMs === undefined && member.closeObservedAtMs === undefined);
  // A join during the close lookup has to participate in the next lookup before being handed back.
  if (outstanding.some(([, member]) => !lookedUp.has(member.tradeId))) return null;

  const standing = draft.rows.find(candidate => candidate.state !== 'resolved' && candidate.dedupe_key === VTS_STANDING_KEY);
  const liveRows = new Map(draft.rows.filter(candidate => candidate.state !== 'resolved').map(candidate => [candidate.dedupe_key, candidate]));
  const trades = new Map<string, typeof outstanding>();
  for (const entry of outstanding) {
    const tradeId = entry[1].tradeId;
    const prior = trades.get(tradeId);
    if (prior) prior.push(entry);
    else trades.set(tradeId, [entry]);
  }
  let minted = 0;
  const patch: Record<string, unknown> = { vtsIncidentEndedAtMs: nowMs };
  for (const [tradeId, entries] of trades) {
    const newestAtMs = (origin: IncidentMember) => origin.fallbackObservedAtMs ?? origin.observedAtMs;
    const member = entries.reduce((latest, [, origin]) => newestAtMs(origin) > newestAtMs(latest) ? origin : latest, entries[0][1]);
    const reason = member.fallbackReason ?? member.reason;
    const firstAtMs = Math.min(...entries.map(([, origin]) => origin.firstAtMs));
    const key = railKey(member.symbol, tradeId);
    let successor = liveRows.get(key);
    if (successor && railRowTradeId(successor) !== tradeId) throw new Error('VTS recovery handback found a conflicting warning key');
    if (!successor && standing?.metadata[memberField(tradeId)]) successor = standing;
    if (!successor) {
      successor = joinExpected({
        tradeId, symbol: member.symbol, lastReason: reason, pageSinceMs: member.pageSinceMs,
      }) ?? undefined;
    }
    if (!successor) {
      successor = draft.add({
        triggers_at: new Date(nowMs), category: 'breakage', severity: 'warning', dedupe_key: key,
        title: `VTS exit decisions unavailable — ${member.symbol} still blocked after feed recovery`,
        body: `Open virtual trade ${tradeId} in ${member.symbol} has been waiting since ${new Date(firstAtMs).toISOString()}. `
          + `Its last recorded refusal was ${reason}. The feed recovered for the wider group, while this trade still has no exit `
          + 'decision or close. This warning clears when that trade decides or closes.',
        metadata: { tradeId, vtsWarningObservedAtMs: newestAtMs(member) },
      });
      minted++;
    }
    // Keep the original crossing receipt on the group and link it to the continuing warning.
    draft.mergeMetadata(successor.id, {
      [`vtsIncidentHandback:${row.id}:${tradeId}`]: { source: row.id, firstAtMs, handedBackAtMs: nowMs, members: entries.map(([, origin]) => origin) },
    });
    for (const [field, origin] of entries) patch[field] = { ...origin, fallbackAlertId: successor.id, handedBackAtMs: nowMs };
  }
  draft.mergeMetadata(row.id, patch);
  draft.resolve(row.id, VTS_RAIL_ACTOR, `FEED-INCIDENT-RECOVERED-HANDBACK ${VTS_RAIL_REF}`, 'engine');
  return minted;
}
