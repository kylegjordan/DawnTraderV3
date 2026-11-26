import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const sockets = vi.hoisted(() => ({ instances: [] as any[] }));
vi.mock('ws', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  class Socket extends Emitter {
    static OPEN = 1;
    readyState = 1;
    close = vi.fn(() => { this.readyState = 3; });
    send = vi.fn();
    constructor() {
      super();
      sockets.instances.push(this);
    }
  }
  return { default: Socket };
});
vi.mock('../../services/passive-archive/universe-loader.js', () => ({
  loadEquitySpotUniverse: vi.fn(async () => ['RTLY/USD', 'PGR/USD']),
}));
vi.mock('../../services/passive-archive/ticker-batch-writer.js', () => ({
  bufferTickerSnap: vi.fn(),
}));

import {
  getEquityTickerFeedEvidence, getEquityTickerSourceIdentity, getEquityTickerSubscriptionReceipt,
  getLatestEquityTick, isCurrentEquityTickerFrame,
  startEquitySpotArchiver, stopEquitySpotArchiver,
} from '../../services/passive-archive/equity-spot-archiver.js';
import { gradePaperXstockExitQuote } from '../../services/execution/paper-xstock-exit-quote.js';
import { bufferTickerSnap } from '../../services/passive-archive/ticker-batch-writer.js';
import { linkSelectedXstockUpdate } from '../../asset_classes/xstock_spot/vts-xs-selected-update.js';

const symbol = 'RTLY/USD';
function deliver(socket: EventEmitter, type: string, bid: number, fields: Record<string, unknown> = {}) {
  socket.emit('message', Buffer.from(JSON.stringify({
    channel: 'ticker', type, data: [{ symbol, bid, ask: bid + 1, bid_qty: 4, ...fields }],
  })));
}

afterEach(() => {
  stopEquitySpotArchiver();
  sockets.instances.length = 0;
});

describe('#961 — immutable xStock raw quote lineage', () => {
  it('requires actual numeric wire prices and size even when legacy readers normalize them', async () => {
    await startEquitySpotArchiver();
    const socket = sockets.instances[0];
    const position = { id: 'wire-fixture', symbol, mode: 'paper', assetClass: 'xstock_spot', state: 'open', quantity: '1' } as const;
    const grade = () => gradePaperXstockExitQuote({
      positionId: position.id, symbol, raw: getLatestEquityTick(symbol)?.raw ?? null,
      cause: 'stop_hit', trigger: { basis: 'bid', price: 89, reason: 'ok' },
    }, position, 15_000, performance.now(), isCurrentEquityTickerFrame);

    deliver(socket, 'update', 89, { bid_qty: 1 });
    expect(grade()).toMatchObject({ ok: true, proof: { bid: 89, displayedBidQty: 1, filledQty: 1 } });
    for (const nonNumber of [true, '1', [1]]) {
      deliver(socket, 'update', 89, { bid_qty: nonNumber });
      expect(getLatestEquityTick(symbol)?.raw?.bidQty).toBe(1);
      expect(grade()).toEqual({ ok: false, reason: 'size_unknown' });
    }
    deliver(socket, 'update', 89, { bid: '89', bid_qty: 1 });
    expect(getLatestEquityTick(symbol)?.raw?.bid).toBe(89);
    expect(grade()).toEqual({ ok: false, reason: 'malformed_book' });
  });

  it('distinguishes frames at one wall time and keeps the old judged frame intact', async () => {
    await startEquitySpotArchiver();
    const socket = sockets.instances[0];
    const wall = vi.spyOn(Date, 'now').mockReturnValue(1_701_000_000_000);
    try {
      deliver(socket, 'update', 90);
      const judged = getLatestEquityTick(symbol)?.raw!;
      deliver(socket, 'snapshot', 95);
      const latest = getLatestEquityTick(symbol)?.raw!;
      expect(judged).toMatchObject({ bid: 90, ask: 91, bidQty: 4, frame: { symbol, kind: 'update' } });
      expect(latest).toMatchObject({ bid: 95, frame: { kind: 'snapshot' } });
      expect(latest.atMs).toBe(judged.atMs);
      expect(latest.frame?.id).not.toBe(judged.frame?.id);
      expect(Object.isFrozen(judged)).toBe(true);
      expect(Object.isFrozen(judged.frame)).toBe(true);
      expect(isCurrentEquityTickerFrame(judged.frame!)).toBe(true);
    } finally {
      wall.mockRestore();
    }
  });

  it('retires messages and lifecycle callbacks from an older socket', async () => {
    await startEquitySpotArchiver();
    const oldSocket = sockets.instances[0];
    deliver(oldSocket, 'update', 90);
    const oldFrame = getLatestEquityTick(symbol)?.raw?.frame!;

    await startEquitySpotArchiver();
    const replacement = sockets.instances[1];
    replacement.emit('open');
    deliver(replacement, 'snapshot', 95);
    const snapshot = getLatestEquityTick(symbol)?.raw;
    expect(oldSocket.close).toHaveBeenCalledOnce();
    expect(isCurrentEquityTickerFrame(oldFrame)).toBe(false);
    expect(snapshot?.frame?.kind).toBe('snapshot');

    oldSocket.emit('open');
    deliver(oldSocket, 'update', 50);
    oldSocket.emit('close', 1000, Buffer.from('retired'));
    expect(oldSocket.send).not.toHaveBeenCalled();
    expect(getLatestEquityTick(symbol)?.raw).toBe(snapshot);
    expect(isCurrentEquityTickerFrame(snapshot?.frame!)).toBe(true);

    deliver(replacement, 'update', 96);
    const update = getLatestEquityTick(symbol)?.raw;
    expect(update).toMatchObject({ bid: 96, frame: { kind: 'update', generation: snapshot?.frame?.generation } });
    stopEquitySpotArchiver();
    expect(isCurrentEquityTickerFrame(update?.frame!)).toBe(false);
  });
});

describe('#1191 — exact xStock ticker subscription evidence', () => {
  const other = 'PGR/USD';

  it('preserves distinct source identities when an archived update and replay have identical prices', async () => {
    await startEquitySpotArchiver();
    const socket = sockets.instances[0];
    const archive = vi.mocked(bufferTickerSnap);
    const wall = vi.spyOn(Date, 'now').mockReturnValue(1_701_000_000_000);
    const monotonic = vi.spyOn(performance, 'now').mockReturnValue(100);
    try {
      socket.emit('open');
      const reqId = JSON.parse(socket.send.mock.calls[1][0]).req_id;
      expect(getEquityTickerSourceIdentity(symbol)).toBeNull();
      deliverAck(socket, reqId, { channel: 'ticker', symbol });
      const data = [symbol, other].map(pair => ({ symbol: pair, bid: 90, ask: 91, last: 90.5 }));
      socket.emit('message', Buffer.from(JSON.stringify({ channel: 'ticker', type: 'update', data })));
      deliver(socket, 'snapshot', 90, { last: 90.5, bid_qty: null });
      const [update, sibling, replay] = archive.mock.calls.slice(-3).map(([, row]) => row);
      const origin = (row: typeof update) => (row.metadata as {
        equityTickerSource: {
          bootId: string; generation: number; frameOrdinal: number; rowOrdinal: number; role: string; verifiedUpdate: boolean;
        };
      }).equityTickerSource;
      const first = origin(update);
      expect(update.metadata).toMatchObject({
        schema_version: 1,
        equityTickerSource: {
          bootId: expect.any(String), generation: expect.any(Number), rowOrdinal: 0, role: 'update',
          receivedMonotonicMs: 100, verifiedUpdate: true,
        },
      });
      expect(origin(sibling)).toMatchObject({ ...first, rowOrdinal: 1, verifiedUpdate: false });
      expect(origin(replay)).toMatchObject({
        bootId: first.bootId, generation: first.generation, frameOrdinal: first.frameOrdinal + 1, rowOrdinal: 0,
        role: 'snapshot', verifiedUpdate: false,
      });
      expect([replay.symbol, replay.bid, replay.ask, replay.last]).toEqual([update.symbol, update.bid, update.ask, update.last]);
      const subscription = getEquityTickerSourceIdentity(symbol);
      expect(linkSelectedXstockUpdate({ rowId: '1001', metadata: replay.metadata, selectedAtMs: 101 }, subscription, 102)).toBeNull();
      expect(linkSelectedXstockUpdate({ rowId: '1000', metadata: update.metadata, selectedAtMs: 101 }, subscription, 102))
        .toMatchObject({ rowId: '1000', bootId: first.bootId, generation: first.generation, frameOrdinal: first.frameOrdinal });
      expect(getEquityTickerSourceIdentity(other)).toBeNull();
    } finally {
      wall.mockRestore();
      monotonic.mockRestore();
    }
  });

  function deliverAck(socket: EventEmitter, reqId: number, result: unknown, success = true, method = 'subscribe') {
    socket.emit('message', Buffer.from(JSON.stringify({ method, req_id: reqId, success, result })));
  }

  it('requires a genuine acknowledged update and loses transport coverage at a gap or malformed quote', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
    try {
      await startEquitySpotArchiver();
      const socket = sockets.instances[0];
      socket.emit('open');
      const reqId = JSON.parse(socket.send.mock.calls[1][0]).req_id;
      const read = () => getEquityTickerFeedEvidence([symbol, other]);
      const heartbeat = () => socket.emit('message', Buffer.from('{"channel":"heartbeat"}'));

      deliver(socket, 'update', 90);
      expect(read()).toMatchObject({ warmedUp: false, lastTransportMs: null });
      deliverAck(socket, reqId, { channel: 'ticker', symbol });
      clock.mockReturnValue(200);
      deliver(socket, 'snapshot', 90);
      expect(read()).toMatchObject({ warmedUp: false, continuousFromMs: 200, lastTransportMs: 200 });
      expect(read()?.members).toEqual(new Map([[symbol, { acknowledgedAtMs: 100, updatedAtMs: null }]]));

      clock.mockReturnValue(300);
      deliver(socket, 'update', 91);
      expect(read()?.warmedUp).toBe(true);
      expect(read()?.members.get(symbol)?.updatedAtMs).toBe(300);
      clock.mockReturnValue(15_300);
      heartbeat();
      expect(read()).toMatchObject({ continuousFromMs: 200, lastTransportMs: 15_300 });
      clock.mockReturnValue(30_301);
      heartbeat();
      expect(read()).toMatchObject({ continuousFromMs: 30_301, lastTransportMs: 30_301 });
      clock.mockReturnValue(31_000);
      deliver(socket, 'update', 91, { bid: '91', ask: '92' });
      expect(read()).toMatchObject({ continuousFromMs: null, lastTransportMs: null });
      expect(read()?.members.get(symbol)?.updatedAtMs).toBe(300);
      clock.mockReturnValue(32_000);
      heartbeat();
      expect(read()).toMatchObject({ continuousFromMs: 32_000, lastTransportMs: 32_000 });

      deliverAck(socket, reqId, { channel: 'ticker', symbol }, false);
      expect(read()?.warmedUp).toBe(false);
      expect(read()?.members.size).toBe(0);

      await startEquitySpotArchiver();
      const replacement = sockets.instances[1];
      replacement.emit('open');
      heartbeat();
      expect(read()).toMatchObject({ warmedUp: false, continuousFromMs: null, lastTransportMs: null });
    } finally {
      clock.mockRestore();
    }
  });

  it('credits both requested symbols even with shared diagnostic throttling', async () => {
    await startEquitySpotArchiver();
    const socket = sockets.instances[0];
    socket.emit('open');
    const ohlc = JSON.parse(socket.send.mock.calls[0][0]);
    const ticker = JSON.parse(socket.send.mock.calls[1][0]);
    expect(ohlc).toEqual({ method: 'subscribe', params: { channel: 'ohlc', symbol: [symbol, other], interval: 1 } });
    expect(ticker).toMatchObject({ method: 'subscribe', params: { channel: 'ticker', symbol: [symbol, other] } });
    expect(Number.isInteger(ticker.req_id)).toBe(true);

    deliver(socket, 'snapshot', 90);
    expect(getEquityTickerSubscriptionReceipt(symbol)).toBeNull();
    deliverAck(socket, ticker.req_id, undefined, false);
    for (const requested of [symbol, other]) {
      deliverAck(socket, ticker.req_id, { channel: 'ticker', symbol: requested });
      expect(getEquityTickerSubscriptionReceipt(requested)).toMatchObject({ symbol: requested, requestId: ticker.req_id });
    }
  });

  it('refuses mismatched, declined and prior-socket receipts', async () => {
    await startEquitySpotArchiver();
    const oldSocket = sockets.instances[0];
    oldSocket.emit('open');
    const oldId = JSON.parse(oldSocket.send.mock.calls[1][0]).req_id;
    const response = { channel: 'ticker', symbol };
    deliverAck(oldSocket, oldId + 1, response);
    deliverAck(oldSocket, oldId, { channel: 'ohlc', symbol });
    deliverAck(oldSocket, oldId, response, true, 'unsubscribe');
    deliverAck(oldSocket, oldId, { channel: 'ticker', symbol: 'UNREQUESTED/USD' });
    expect(getEquityTickerSubscriptionReceipt(symbol)).toBeNull();
    expect(getEquityTickerSubscriptionReceipt('UNREQUESTED/USD')).toBeNull();

    deliverAck(oldSocket, oldId, response);
    expect(getEquityTickerSubscriptionReceipt(symbol)).toMatchObject({ requestId: oldId });
    deliverAck(oldSocket, oldId, response, false);
    deliverAck(oldSocket, oldId, response);
    expect(getEquityTickerSubscriptionReceipt(symbol)).toBeNull();

    await startEquitySpotArchiver();
    const replacement = sockets.instances[1];
    replacement.emit('open');
    const newId = JSON.parse(replacement.send.mock.calls[1][0]).req_id;
    expect(newId).not.toBe(oldId);
    deliverAck(oldSocket, newId, response);
    deliverAck(replacement, oldId, response);
    expect(getEquityTickerSubscriptionReceipt(symbol)).toBeNull();
    deliverAck(replacement, newId, response);
    expect(getEquityTickerSubscriptionReceipt(symbol)).toMatchObject({ requestId: newId, generation: newId });
    stopEquitySpotArchiver();
    expect(getEquityTickerSubscriptionReceipt(symbol)).toBeNull();
  });
});
