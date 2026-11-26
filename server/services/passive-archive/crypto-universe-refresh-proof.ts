import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

const CHANNELS = ['ticker', 'ohlc'] as const;
type Channel = typeof CHANNELS[number];
type Method = 'subscribe' | 'unsubscribe';

const buildSha = (() => {
  try {
    const value = readFileSync('dist/BUILD_SHA', 'utf8').trim();
    return /^[0-9a-f]{40}$/.test(value) ? value : null;
  } catch {
    return null;
  }
})();

export interface RefreshProofInput {
  occurrenceId: string;
  computed: readonly string[];
  pins: readonly string[];
  bounded: boolean;
  add: readonly string[];
  drop: readonly string[];
}

interface Request {
  id: number | null;
  sentAt: number;
  deadline: number;
  acceptedAt: Partial<Record<Channel, number>>;
}

interface Generation {
  id: number;
  shard: number;
  socket: WebSocket;
  subscriptions: Map<string, Request>;
  unsubscriptions: Map<string, Request>;
  /** Both open-time frames carry the same symbol list. Retain only changed symbols from it. */
  openedWith: Set<string> | null;
}

const sorted = (values: Iterable<string>) => [...values].sort();
const iso = (ms: number) => new Date(ms).toISOString();
const processStartedAt = iso(performance.timeOrigin);

/** Readback only. Captures a single natural occurrence and never participates in recorder decisions. */
export class CryptoUniverseRefreshProof {
  private readonly add: Set<string>;
  private readonly drop: Set<string>;
  private readonly beforeAt = Date.now();
  private readonly beforeElapsed = performance.now();
  private readonly generations = new Map<WebSocket, Generation>();
  private readonly dropGenerations = new Map<string, Set<Generation>>();
  private readonly rejected = new Set<string>();
  private overlapped = false;

  constructor(
    private readonly input: RefreshProofInput,
    private readonly before: string[],
    private readonly replyTimeoutMs: number,
    private readonly observationMs: number,
  ) {
    this.add = new Set(input.add);
    this.drop = new Set(input.drop);
  }

  noteOverlappingApply(): void {
    this.overlapped = true;
  }

  private generation(shard: number, socket: WebSocket): Generation {
    let generation = this.generations.get(socket);
    if (!generation) {
      generation = {
        id: this.generations.size + 1, shard, socket,
        subscriptions: new Map(), unsubscriptions: new Map(), openedWith: null,
      };
      this.generations.set(socket, generation);
    }
    return generation;
  }

  noteDropSocket(shard: number, socket: WebSocket, symbol: string): void {
    if (!this.drop.has(symbol)) return;
    let old = this.dropGenerations.get(symbol);
    if (!old) {
      old = new Set();
      this.dropGenerations.set(symbol, old);
    }
    old.add(this.generation(shard, socket));
  }

  noteOpen(shard: number, socket: WebSocket, symbols: string[]): void {
    const generation = this.generation(shard, socket);
    generation.openedWith = new Set(symbols.filter(symbol => this.add.has(symbol) || this.drop.has(symbol)));
    for (const symbol of generation.openedWith) this.noteDropSocket(shard, socket, symbol);
    this.noteRequest(shard, socket, 'subscribe', symbols, null);
  }

  noteRequest(shard: number, socket: WebSocket, method: Method, symbols: string[], id: number | null): void {
    const generation = this.generation(shard, socket);
    const tracked = method === 'subscribe' ? this.add : this.drop;
    const requests = method === 'subscribe' ? generation.subscriptions : generation.unsubscriptions;
    const sentAt = Date.now();
    const deadline = Math.min(performance.now() + this.replyTimeoutMs, this.beforeElapsed + this.observationMs);
    for (const symbol of symbols) {
      if (tracked.has(symbol)) requests.set(symbol, { id, sentAt, deadline, acceptedAt: {} });
    }
  }

  noteReply(socket: WebSocket, method: Method, symbol: string, id: number | null, channel: unknown, success: boolean): void {
    const generation = this.generations.get(socket);
    if (!generation) return;
    const requests = method === 'subscribe' ? generation.subscriptions : generation.unsubscriptions;
    const request = requests.get(symbol);
    if (!request || request.id !== id || performance.now() > request.deadline) return;
    if (!success) {
      this.rejected.add(symbol);
    } else if (channel === 'ticker' || channel === 'ohlc') {
      request.acceptedAt[channel] ??= Date.now();
    }
  }

  private receipts(generation: Generation, request: Request | undefined) {
    return {
      shard: generation.shard,
      generation: generation.id,
      requestId: request?.id ?? null,
      sentAt: request ? iso(request.sentAt) : null,
      tickerAt: request?.acceptedAt.ticker === undefined ? null : iso(request.acceptedAt.ticker),
      ohlcAt: request?.acceptedAt.ohlc === undefined ? null : iso(request.acceptedAt.ohlc),
    };
  }

  private hasBoth(request: Request | undefined): boolean {
    return CHANNELS.every(channel => request?.acceptedAt[channel] !== undefined);
  }

  finish(
    settled: string[],
    currentSockets: ReadonlyMap<number, WebSocket | null>,
    added: string[],
    dropped: string[],
  ) {
    const settledAt = Date.now();
    const computed = new Set(this.input.computed);
    const pins = new Set(this.input.pins);
    const retainedPins = this.before.filter(symbol => !computed.has(symbol) && pins.has(symbol));
    const boundedRetained = this.input.bounded
      ? this.before.filter(symbol => !computed.has(symbol) && !pins.has(symbol) && !this.drop.has(symbol))
      : [];
    const expected = new Set([...computed, ...retainedPins, ...boundedRetained]);
    const settledSet = new Set(settled);
    const missing = sorted([...expected].filter(symbol => !settledSet.has(symbol)));
    const extra = sorted(settled.filter(symbol => !expected.has(symbol)));

    const adds = added.map(symbol => {
      const generation = [...this.generations.values()].find(item =>
        item.subscriptions.has(symbol)
        && currentSockets.get(item.shard) === item.socket
        && item.socket.readyState === WebSocket.OPEN);
      const request = generation?.subscriptions.get(symbol);
      return {
        symbol, complete: this.hasBoth(request) && !this.rejected.has(symbol),
        receipt: generation ? this.receipts(generation, request) : null,
      };
    });
    const drops = dropped.map(symbol => {
      const old = [...(this.dropGenerations.get(symbol) ?? [])].map(generation => {
        const request = generation.unsubscriptions.get(symbol);
        const current = currentSockets.get(generation.shard);
        const replacement = current ? this.generations.get(current) : undefined;
        const closed = generation.socket.readyState === WebSocket.CLOSED;
        const absentFromReplacement = !currentSockets.has(generation.shard)
          || (replacement?.openedWith != null && !replacement.openedWith.has(symbol)
            && replacement.socket.readyState === WebSocket.OPEN);
        return {
          ...this.receipts(generation, request),
          closed,
          retired: !currentSockets.has(generation.shard),
          replacementGeneration: replacement?.id ?? null,
          absentFromReplacement,
          complete: this.hasBoth(request) || (closed && absentFromReplacement),
        };
      });
      return { symbol, complete: old.length > 0 && old.every(item => item.complete) && !this.rejected.has(symbol), old };
    });
    const beforeSet = new Set(this.before);
    const appliedAdds = new Set(added);
    const appliedDrops = new Set(dropped);
    const deltasMatch = [...expected].filter(symbol => !beforeSet.has(symbol))
      .every(symbol => appliedAdds.has(symbol))
      && this.before.filter(symbol => !expected.has(symbol)).every(symbol => appliedDrops.has(symbol))
      && added.every(symbol => !beforeSet.has(symbol) && expected.has(symbol))
      && dropped.every(symbol => beforeSet.has(symbol) && !expected.has(symbol));
    return {
      occurrenceId: this.input.occurrenceId,
      buildSha, pid: process.pid, startedAt: processStartedAt,
      beforeAt: iso(this.beforeAt), settledAt: iso(settledAt),
      elapsedMs: performance.now() - this.beforeElapsed,
      before: this.before, settled, computed: sorted(computed), retainedPins, boundedRetained,
      plannedAdds: sorted(this.add), plannedDrops: sorted(this.drop), deltasMatch,
      missing, extra, adds, drops, rejected: sorted(this.rejected), overlapped: this.overlapped,
      complete: buildSha !== null && !this.overlapped && deltasMatch && missing.length === 0 && extra.length === 0
        && adds.length > 0 && drops.length > 0 && adds.every(item => item.complete) && drops.every(item => item.complete),
    };
  }
}
