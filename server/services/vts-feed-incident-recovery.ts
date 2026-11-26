import type { SelectedXstockUpdate } from '../asset_classes/xstock_spot/vts-xs-selected-update.js';

const WINDOW_MS = 60_000;

export interface VtsIncidentRecoveryCandidate {
  alertId: string;
  members: { tradeId: string; symbol: string }[];
}

export interface VtsIncidentRecoveryProof extends VtsIncidentRecoveryCandidate {
  generation: number;
  startMs: number;
  boundaryMs: number;
  endMs: number;
  first: [string, SelectedXstockUpdate][];
  second: [string, SelectedXstockUpdate][];
  common: string[];
  required: number;
  denominator: number;
}

interface RecoveryTransport {
  generation: number;
  continuousFromMs: number | null;
  lastTransportMs: number | null;
  warmedUp: boolean;
}

interface Attempt {
  candidate: VtsIncidentRecoveryCandidate;
  symbols: Set<string>;
  generation: number;
  startMs: number;
  lastSampleMs: number;
  maxGapMs: number;
  first: Map<string, SelectedXstockUpdate>;
  second: Map<string, SelectedXstockUpdate>;
  observedTokens: Set<string>;
}

function sourceToken(update: SelectedXstockUpdate): string {
  return JSON.stringify([update.bootId, update.generation, update.frameOrdinal, update.rowOrdinal]);
}

function updateWithinWindow(update: SelectedXstockUpdate, startMs: number, endMs: number, generation: number): boolean {
  return update.generation === generation && update.receivedAtMs >= startMs && update.receivedAtMs <= update.selectedAtMs
    && update.selectedAtMs <= update.acceptedAtMs && update.acceptedAtMs < endMs;
}

export function isCoveredVtsIncidentRecovery(proof: VtsIncidentRecoveryProof): boolean {
  if (!Number.isFinite(proof.startMs) || proof.boundaryMs - proof.startMs !== WINDOW_MS
    || proof.endMs - proof.boundaryMs !== WINDOW_MS) return false;
  const symbols = new Set(proof.members.map(member => member.symbol));
  const required = Math.max(1, Math.ceil(0.8 * symbols.size));
  if (proof.required !== required || proof.denominator !== symbols.size) return false;
  const tokens = new Set<string>();
  const rowIds = new Set<string>();
  let bootId: string | undefined;
  const windowSymbols = (entries: VtsIncidentRecoveryProof['first'], startMs: number, endMs: number) => {
    const covered = new Set<string>();
    for (const [symbol, update] of entries) {
      const token = sourceToken(update);
      if (!symbols.has(symbol) || covered.has(symbol) || tokens.has(token) || rowIds.has(update.rowId)
        || !/^[1-9]\d*$/.test(update.rowId) || !update.bootId
        || !updateWithinWindow(update, startMs, endMs, proof.generation) || (bootId && update.bootId !== bootId)) return null;
      covered.add(symbol);
      tokens.add(token);
      rowIds.add(update.rowId);
      bootId = update.bootId;
    }
    return covered;
  };
  const first = windowSymbols(proof.first, proof.startMs, proof.boundaryMs);
  const second = windowSymbols(proof.second, proof.boundaryMs, proof.endMs);
  if (!first || !second) return false;
  const common = [...first].filter(symbol => second.has(symbol)).sort();
  return common.length >= required && proof.common.length === common.length && common.every((symbol, i) => proof.common[i] === symbol);
}

/** The worker snapshots exact membership. Only guarded reads of selected persisted updates can count. */
export class VtsIncidentRecoveryWindows {
  private readonly attempts = new Map<string, Attempt>();
  private readonly completed = new Set<string>();
  private readonly fresh = new Map<string, { candidate: VtsIncidentRecoveryCandidate; atMs: number }>();

  reset(): void {
    this.attempts.clear();
    this.completed.clear();
    this.fresh.clear();
  }

  snapshot(candidates: VtsIncidentRecoveryCandidate[], atMs: number): void {
    const liveIds = new Set(candidates.map(candidate => candidate.alertId));
    for (const id of this.attempts.keys()) if (!liveIds.has(id)) this.attempts.delete(id);
    for (const id of this.completed) if (!liveIds.has(id)) this.completed.delete(id);
    this.fresh.clear();
    for (const candidate of candidates) {
      if (!this.attempts.has(candidate.alertId) && !this.completed.has(candidate.alertId)) {
        this.fresh.set(candidate.alertId, { candidate, atMs });
      }
    }
  }

  retry(alertId: string): void {
    this.completed.delete(alertId);
  }

  observe(symbol: string, update: SelectedXstockUpdate): void {
    for (const attempt of this.attempts.values()) {
      if (!attempt.symbols.has(symbol) || update.acceptedAtMs - attempt.lastSampleMs > attempt.maxGapMs) continue;
      const boundaryMs = attempt.startMs + WINDOW_MS;
      const firstWindow = update.receivedAtMs < boundaryMs;
      if (!updateWithinWindow(update, firstWindow ? attempt.startMs : boundaryMs,
        firstWindow ? boundaryMs : boundaryMs + WINDOW_MS, attempt.generation)) continue;
      const cell = firstWindow ? attempt.first : attempt.second;
      if (cell.has(symbol)) continue;
      const token = sourceToken(update);
      if (attempt.observedTokens.has(token)) continue;
      attempt.observedTokens.add(token);
      cell.set(symbol, update);
    }
  }

  sample(feed: RecoveryTransport | null, nowMs: number, maxGapMs: number): VtsIncidentRecoveryProof[] {
    if (!feed?.warmedUp || feed.continuousFromMs === null || feed.lastTransportMs === null
      || feed.lastTransportMs > nowMs || nowMs - feed.lastTransportMs > maxGapMs) {
      this.attempts.clear();
      this.fresh.clear();
      return [];
    }
    const results: VtsIncidentRecoveryProof[] = [];
    for (const [id, attempt] of this.attempts) {
      if (attempt.generation !== feed.generation || nowMs < attempt.lastSampleMs || nowMs - attempt.lastSampleMs > maxGapMs
        || feed.continuousFromMs > attempt.startMs) {
        this.attempts.delete(id);
        continue;
      }
      attempt.lastSampleMs = nowMs;
      const boundaryMs = attempt.startMs + WINDOW_MS;
      const endMs = boundaryMs + WINDOW_MS;
      if (nowMs < endMs) continue;
      this.attempts.delete(id);
      const common = [...attempt.first.keys()].filter(symbol => attempt.second.has(symbol)).sort();
      const denominator = attempt.symbols.size;
      const required = Math.max(1, Math.ceil(0.8 * denominator));
      if (common.length < required) continue;
      this.completed.add(id);
      results.push({ ...attempt.candidate, generation: attempt.generation, startMs: attempt.startMs, boundaryMs, endMs,
        first: [...attempt.first], second: [...attempt.second], common, required, denominator });
    }
    for (const [id, { candidate, atMs }] of this.fresh) {
      const members = candidate.members.map(member => ({ ...member }));
      const symbols = new Set(members.map(member => member.symbol));
      if (!symbols.size || feed.continuousFromMs > atMs || nowMs < atMs || nowMs - atMs > maxGapMs) continue;
      this.attempts.set(id, { candidate: { alertId: id, members }, symbols, generation: feed.generation,
        startMs: atMs, lastSampleMs: nowMs, maxGapMs, first: new Map(), second: new Map(), observedTokens: new Set() });
    }
    this.fresh.clear();
    return results;
  }
}

export const vtsIncidentRecoveryWindows = new VtsIncidentRecoveryWindows();
