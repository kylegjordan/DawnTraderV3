import { storage } from '../storage';
import { KrakenService } from '../exchanges/kraken/kraken.js';

/**
 * Bootstrap the portfolio_state rows on a FRESH database (rows-missing case only —
 * a no-op on every normal boot).
 *
 * P19-B8.5 (single-writer balance, Kyle structural directive 2026-07-15): every
 * balance this initializer mints now flows through executeReanchor — the SOLE
 * writer of portfolio_state.balance — so even genesis balances land as recorded
 * anchor-ledger events ('launch_snap'), never as raw row writes. The old paper
 * default of $1000 is GONE (a silent mint of exactly the $800-clobber class):
 * both modes bootstrap from the real Kraken balance, and if Kraken is
 * unreachable the row is simply NOT created — the engine start's preflight then
 * refuses honestly ("portfolio state not initialized") instead of trading on an
 * invented number.
 */
export async function initializePortfolioState(): Promise<void> {
  console.log('[PortfolioInit] Checking portfolio_state table...');

  try {
    const existingLive = await storage.getPortfolioState({ globalContextId: 'default', mode: 'live' });
    const existingPaper = await storage.getPortfolioState({ globalContextId: 'default', mode: 'paper' });

    if (existingLive && existingPaper) {
      console.log(`[PortfolioInit] ✓ Rows exist (live: $${existingLive.balance}, paper: $${existingPaper.balance}) — nothing to do`);
      return;
    }

    let krakenBalance: number | null = null;
    try {
      const kraken = new KrakenService();
      const raw = await kraken.getAccountBalance('default');
      // Langston Step-4 minor: strictly > 0 — executeReanchor throws on <= 0, so a
      // genuine $0 Kraken balance must take the explicit-refusal path here, not an
      // exception into the outer catch.
      const parsed = parseFloat(raw.totalValue);
      krakenBalance = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch (err) {
      console.warn('[PortfolioInit] ⚠️ Kraken balance fetch failed — missing rows NOT created (no invented balances; engine preflight will refuse until resolved):', err instanceof Error ? err.message : err);
      return;
    }
    if (krakenBalance === null) {
      console.warn('[PortfolioInit] ⚠️ Kraken returned no usable balance — missing rows NOT created');
      return;
    }

    const { executeReanchor } = await import('../services/portfolio-anchor-service.js');
    for (const mode of ['live', 'paper'] as const) {
      const exists = mode === 'live' ? existingLive : existingPaper;
      if (exists) continue;
      await executeReanchor({ mode, newBalance: krakenBalance, reason: 'launch_snap' });
      console.log(`[PortfolioInit] ✅ Bootstrapped ${mode} via anchor event (launch_snap): $${krakenBalance.toFixed(2)}`);
    }

    console.log('[PortfolioInit] ✅ Portfolio state initialization complete');
  } catch (error) {
    console.error('[PortfolioInit] ❌ Failed to initialize portfolio state:', error);
  }
}
