// B-PRICE-SIDE-BY-JOB r5 — P-7g (decision D7; #977 amendment 6): the price cache's bucket membership is the UNION
// of independent reasons, and the engine reconciles the 2-second `openTrade` lane from the symbols it holds.
//
// #977: the `openTrade` lane (2000 ms) was designed with `subscribe(trade.symbol, 'openTrade')` (acdf84934); the
// line was never written, so the lane had zero members on every health tick. The fix is a per-tick reconcile keyed
// by owner, so closes by any path and restarts converge, and releasing one owner never drops another's symbol.
//
// POSITIVE CONTROL: against the price cache before P-7g, `setReasonMembers` / `getBucketMembers` do not exist, so
// tests 1-5 cannot pass; and the engine fence (test 6) fails because `checkOpenPositions` never touches `openTrade`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { priceCache } from '../../services/price-cache.js';

const pc: any = priceCache;

beforeAll(() => {
  pc.shutdown(); // stop the refresh timers: membership is pure bookkeeping and must not hit the network here
});
afterAll(() => {
  pc.setReasonMembers('openTrade', 'test:a', []);
  pc.setReasonMembers('openTrade', 'test:b', []);
  pc.unsubscribeFrom('TEST1/USD', 'readyToBuy');
  pc.unsubscribeFrom('TEST2/USD', 'readyToBuy');
});

describe('P-7g — bucket membership is the union of independent reasons', () => {
  it('1. an owner reason enrols its symbols into openTrade', () => {
    pc.setReasonMembers('openTrade', 'test:a', ['AAA/USD', 'BBB/USD']);
    expect(pc.getBucketMembers('openTrade').sort()).toEqual(expect.arrayContaining(['AAA/USD', 'BBB/USD']));
  });

  it('2. replacing the owner set releases symbols the owner no longer holds', () => {
    pc.setReasonMembers('openTrade', 'test:a', ['AAA/USD']);
    const m = pc.getBucketMembers('openTrade');
    expect(m).toContain('AAA/USD');
    expect(m).not.toContain('BBB/USD');
  });

  it('3. two owners holding one symbol: releasing one keeps it until the other releases too', () => {
    pc.setReasonMembers('openTrade', 'test:a', ['CCC/USD']);
    pc.setReasonMembers('openTrade', 'test:b', ['CCC/USD']);
    pc.setReasonMembers('openTrade', 'test:a', []);
    expect(pc.getBucketMembers('openTrade')).toContain('CCC/USD');
    pc.setReasonMembers('openTrade', 'test:b', []);
    expect(pc.getBucketMembers('openTrade')).not.toContain('CCC/USD');
  });

  it('4. a legacy subscribe() survives owner recomputes, and unsubscribeFrom releases only the legacy reason', () => {
    pc.subscribe('TEST1/USD', 'readyToBuy');
    pc.setReasonMembers('readyToBuy', 'test:a', ['TEST2/USD']);
    expect(pc.getBucketMembers('readyToBuy')).toEqual(expect.arrayContaining(['TEST1/USD', 'TEST2/USD']));

    pc.subscribe('TEST2/USD', 'readyToBuy'); // legacy AND owner both hold TEST2
    pc.unsubscribeFrom('TEST2/USD', 'readyToBuy'); // legacy released; the owner still holds it
    expect(pc.getBucketMembers('readyToBuy')).toContain('TEST2/USD');

    pc.setReasonMembers('readyToBuy', 'test:a', []);
    expect(pc.getBucketMembers('readyToBuy')).not.toContain('TEST2/USD');
    expect(pc.getBucketMembers('readyToBuy')).toContain('TEST1/USD');
  });

  it('5. existing one-way behaviour is unchanged for a symbol no owner holds', () => {
    pc.subscribe('ZZZ/USD', 'vtsSimulation');
    expect(pc.getBucketMembers('vtsSimulation')).toContain('ZZZ/USD');
    pc.unsubscribeFrom('ZZZ/USD', 'vtsSimulation');
    expect(pc.getBucketMembers('vtsSimulation')).not.toContain('ZZZ/USD');
  });
});

describe('P-7g — the engine reconciles openTrade from the symbols it holds (source fence)', () => {
  it('6. checkOpenPositions reconciles openTrade per mode, crypto only, right after reading open positions', () => {
    const src = readFileSync(resolve(__dirname, '../../services/active-execution-engine.ts'), 'utf-8');
    const start = src.indexOf('private async checkOpenPositions(): Promise<void> {');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, start + 4000);
    const readAt = body.indexOf('await storage.getActiveOpenPositions(this.mode)');
    const syncAt = body.indexOf("priceCache.setReasonMembers(");
    expect(readAt).toBeGreaterThan(-1);
    expect(syncAt).toBeGreaterThan(readAt);
    expect(body.slice(syncAt, syncAt + 400)).toContain("'openTrade'");
    expect(body.slice(syncAt, syncAt + 400)).toContain('engine:${this.mode}');
    expect(body.slice(syncAt, syncAt + 600)).toContain("'crypto_spot'");
  });
});
