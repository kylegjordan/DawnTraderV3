// P19-B8.5 (soak fix C) — exit-integrity: the Binance routing refusal (prong 1).
// The phantom-stop incident (2026-07-15): the blind symbol mangle passed XRP/GBP
// through verbatim and Binance's ticker answered for a DELISTED ghost market with a
// frozen last-ever price (0.5257 vs real ~0.827), phantom-stopping five positions.
// The routing rule: Binance is consulted ONLY for USD-quoted pairs, mapped base+USDT;
// everything else is a structural refusal (null), never a different market's number.
import { describe, it, expect } from 'vitest';
import { binanceSymbolFor } from '../../services/live-pricing-adapter';

describe('[P19-B8.5] binanceSymbolFor — the pure Binance routing decision', () => {
  it('maps USD-quoted pairs to base+USDT', () => {
    expect(binanceSymbolFor('BTC/USD')).toBe('BTCUSDT');
    expect(binanceSymbolFor('XRP/USD')).toBe('XRPUSDT');
    expect(binanceSymbolFor('TAO/USD')).toBe('TAOUSDT');
  });

  it('REFUSES non-USD quotes (the ghost-market class: XRP/GBP was the live incident)', () => {
    expect(binanceSymbolFor('XRP/GBP')).toBeNull();
    expect(binanceSymbolFor('SOL/EUR')).toBeNull();
    expect(binanceSymbolFor('ETH/GBP')).toBeNull();
  });

  it('REFUSES USD-BASED crosses (the old mangle produced garbage like USDTCCHF)', () => {
    expect(binanceSymbolFor('USDC/CHF')).toBeNull();
    expect(binanceSymbolFor('USD/CHF')).toBeNull();
    expect(binanceSymbolFor('USDC/AUD')).toBeNull();
  });

  it('REFUSES malformed symbols', () => {
    expect(binanceSymbolFor('BTCUSD')).toBeNull();
    expect(binanceSymbolFor('')).toBeNull();
    expect(binanceSymbolFor('A/B/C')).toBeNull();
  });
});
