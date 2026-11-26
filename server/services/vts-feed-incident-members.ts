import { randomUUID } from 'node:crypto';
import {
  EXPECTED_OLD, isVtsFeedIncidentAlert, VTS_COMMON_XSTOCK_INCIDENT_COHORT, VTS_FEED_INCIDENT_KEY_PREFIX,
  VTS_RAIL_ACTOR, VTS_RAIL_REF,
} from '../core/trading/vts-rail.js';
import { isProvedVtsRefusalCrossing, vtsRefusalReceiptField } from '../core/trading/vts-refusal-evidence.js';
import type { AlertStoreDraft, SystemAlert } from './system-alerts.js';
import type { Crossing } from './vts-live-warning.js';

interface IncidentMember {
  tradeId: string;
  symbol: string;
  streakId: string;
  firstAtMs: number;
  pageSinceMs: number;
  observedAtMs: number;
  reason: string;
  fallbackAlertId?: string;
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
  if (draft.rows.some(row => isVtsFeedIncidentAlert(row) && row.metadata.vtsFeedIncidentCohort === evidence.key
    && typeof row.metadata.vtsIncidentEndedAtMs === 'number' && row.metadata.vtsIncidentEndedAtMs >= nowMs)) return null;
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
