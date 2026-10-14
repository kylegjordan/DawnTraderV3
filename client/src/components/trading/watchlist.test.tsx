// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  useTrading: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('@/hooks/use-trading', () => ({ useTrading: mocks.useTrading }));

import Watchlist from './watchlist';

async function waitForText(element: Element, predicate: (text: string) => boolean) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const text = element.textContent ?? '';
    if (predicate(text)) return text;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Timed out waiting for countdown; last text was ${element.textContent}`);
}

describe('Watchlist scan countdown', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mocks.useTrading.mockReturnValue({
      watchlistLoading: false,
      watchlist: [{
        id: 'btc-usd',
        symbol: 'BTC/USD',
        baseCurrency: 'BTC',
        currentPrice: '100000',
        vwap: '99900',
        volume24h: '1000000',
        dailyRange: '2.5',
      }],
    });
    mocks.apiFetch.mockResolvedValue({ ok: true, data: { nextScanInMs: 70_000 } });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('uses the passive latest-scan response and ticks the visible countdown', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Watchlist />
        </QueryClientProvider>,
      );
    });

    const countdown = container.querySelector('[data-testid="text-next-scan-time"]');
    expect(countdown).not.toBeNull();
    const first = await waitForText(countdown!, (text) => /^01:(09|10)$/.test(text));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    });
    const second = countdown!.textContent ?? '';

    expect(second).not.toBe(first);
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/active-engine/diagnostics/scan-latest?mode=paper');
    expect(mocks.apiFetch.mock.calls.flat().join(' ')).not.toContain('/diagnostics/scan?');

    queryClient.clear();
  });
});
