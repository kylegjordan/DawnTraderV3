/**
 * P19-B8.5 — one-off: mint the $2,400 paper measurement-override anchor event.
 *
 * Runs ON STAGING (tsx, env loaded) AFTER the sizing migration. Goes through
 * executeReanchor — the SOLE writer of portfolio_state.balance — so the override
 * lands as a recorded, provenance-carrying ledger event the ANCHOR_ASSERT blesses
 * (a raw SQL write would bypass the single-writer principle this batch built and
 * be structurally indistinguishable from the $800 clobber).
 *
 * Usage (staging): set -a && . ./.env && set +a && npx tsx server/scripts/b8-5-measurement-override.ts
 */
import { executeReanchor, getAnchorState } from '../services/portfolio-anchor-service.js';

const TARGET = 2400;

async function main() {
  const before = await getAnchorState('paper');
  if (!before) {
    console.error('[b8-5-override] REFUSED: no paper anchor state exists — start-new (Kraken mirror) must run first.');
    process.exit(1);
  }
  if (Math.abs(before.balance - TARGET) < 0.005) {
    console.log(`[b8-5-override] Already at $${TARGET} (anchorVersion=${before.anchorVersion}) — idempotent no-op.`);
    process.exit(0);
  }
  const { anchorVersion } = await executeReanchor({
    mode: 'paper',
    newBalance: TARGET,
    reason: 'measurement_override',
    note:
      'Kyle-directed 2026-07-15: measurement-window sizing override — $150/trade live-parity size at inflated breadth ' +
      `(~15 slots; guardrails max_position 20%, risk 2.70%). NOT a Kraken mirror (real account ~$824 at the time; ` +
      `prior anchored balance $${before.balance.toFixed(2)}). Superseded by the next start_new re-mirror. ` +
      'Design: Langston-signed crew consensus (Discord, 2026-07-15); scope: P19-B8.5 fix-round.',
  });
  console.log(`[b8-5-override] DONE: paper $${before.balance.toFixed(2)} -> $${TARGET} (anchorVersion=${anchorVersion}, reason=measurement_override, note recorded).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[b8-5-override] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
