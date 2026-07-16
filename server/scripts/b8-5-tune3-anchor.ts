/**
 * P19-B8.5 sizing tune-3 — one-off: mint the $2,250 paper anchor override.
 *
 * Kyle spec 2026-07-16: 100% exposure × 6.67% per-trade × $2,250 anchor
 * → $150.08 per-trade cap (buffered actual ~$145.58), 15 slots. Runs ON STAGING
 * (tsx, env loaded). Goes through executeReanchor — the SOLE writer of
 * portfolio_state.balance — same pattern as b8-5-measurement-override.ts
 * (a raw SQL write would bypass the single-writer principle).
 *
 * Usage (staging): set -a && . ./.env && set +a && npx tsx server/scripts/b8-5-tune3-anchor.ts
 */
import { executeReanchor, getAnchorState } from '../services/portfolio-anchor-service.js';

const TARGET = 2250;

async function main() {
  const before = await getAnchorState('paper');
  if (!before) {
    console.error('[b8-5-tune3] REFUSED: no paper anchor state exists — start-new (Kraken mirror) must run first.');
    process.exit(1);
  }
  if (Math.abs(before.balance - TARGET) < 0.005) {
    console.log(`[b8-5-tune3] Already at $${TARGET} (anchorVersion=${before.anchorVersion}) — idempotent no-op.`);
    process.exit(0);
  }
  const { anchorVersion } = await executeReanchor({
    mode: 'paper',
    newBalance: TARGET,
    reason: 'measurement_override',
    note:
      'Kyle-directed 2026-07-16 (sizing tune-3): $2,250 anchor so 100% exposure × 6.67% per-trade = ' +
      `$150.08 cap (buffered ~$145.58) × 15 slots — Kyle ratified the buffered figure. NOT a Kraken mirror ` +
      `(prior anchored balance $${before.balance.toFixed(2)}). Superseded by the next start_new re-mirror. ` +
      'Scope: P19_B8_5_SIZING_TUNE3_SCOPE.md; Langston Step-1 PROCEED + rev-2 amended list (Discord, 2026-07-16).',
  });
  console.log(`[b8-5-tune3] DONE: paper $${before.balance.toFixed(2)} -> $${TARGET} (anchorVersion=${anchorVersion}, reason=measurement_override, note recorded).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[b8-5-tune3] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
