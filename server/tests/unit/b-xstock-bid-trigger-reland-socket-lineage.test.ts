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
  loadEquitySpotUniverse: vi.fn(async () => ['RTLY/USD']),
}));
vi.mock('../../services/passive-archive/ticker-batch-writer.js', () => ({
  bufferTickerSnap: vi.fn(),
}));

import {
  getLatestEquityTick, isCurrentEquityTickerFrame, startEquitySpotArchiver, stopEquitySpotArchiver,
} from '../../services/passive-archive/equity-spot-archiver.js';

const symbol = 'RTLY/USD';
function deliver(socket: EventEmitter, type: string, bid: number) {
  socket.emit('message', Buffer.from(JSON.stringify({
    channel: 'ticker', type, data: [{ symbol, bid, ask: bid + 1, bid_qty: 4 }],
  })));
}

afterEach(() => {
  stopEquitySpotArchiver();
  sockets.instances.length = 0;
});

describe('#961 — immutable xStock raw quote lineage', () => {
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
