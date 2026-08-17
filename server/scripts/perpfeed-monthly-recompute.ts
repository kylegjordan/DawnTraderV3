/**
 * ═════════════════════════════════════════════════════════════════════════════
 * P19-B-PERPFEED OBJ-1(a) — the MONTHLY membership recompute (adds live here)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * ADDS ARE MONTHLY ONLY AND BUDGET-FIRST (Langston reconciliation ruling
 * 2026-08-17): an add is a permanent disk cost, so membership grows only here
 * — never at the daily probe, never at a restart (the loader reads the
 * persisted set). The recompute re-derives N from the GB/month ceiling against
 * the RESIDENT set at the then-measured per-symbol rate (the budget→cap
 * derivation is recorded in module_constants `crypto_perp_universe.max_symbols`
 * — re-derive it BEFORE running this when rates have moved; the pre-audit r3
 * §3 model is the arithmetic).
 *
 * Self-gating: refuses to run if the last recompute was < 28 days ago, so the
 * cron can be scheduled loosely (monthly, 1st) and a manual invocation cannot
 * accidentally double-recompute inside a month. `--force` overrides for a
 * deliberate operator action (logged as such).
 *
 * Cron line:
 *   45 2 1 * * deploy cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/perpfeed-monthly-recompute.ts >> /var/log/dawntrader/perpfeed-recompute.log 2>&1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  // Step-4 BLOCKER-I (Langston): --force and the degradation floor are TWO
  // UNRELATED switches. --force overrides only the 28-day cadence self-gate
  // (an ordinary operator action: re-derive N after rates move, rerun after a
  // cap change). Bypassing the #546 plausibility floor is a SAFETY decision
  // requiring a venue-confirmed delisting, on its OWN flag — never riding a
  // convenience flag.
  const confirmDelisting = process.argv.includes('--confirm-delisting');
  const { getConstant } = await import('../services/module-constants-service.js');
  const last = await getConstant<string>('passive_archive', 'crypto_perp_universe.last_recompute_at',
    { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
  if (last && !force) {
    const ageDays = (Date.now() - new Date(last).getTime()) / 86_400_000;
    if (ageDays < 28) {
      console.log(`[perpfeed-recompute] last recompute ${ageDays.toFixed(1)}d ago (< 28d) — monthly cadence holds; use --force for a deliberate off-cycle recompute`);
      return;
    }
  }
  if (force) console.warn('[perpfeed-recompute] --force: deliberate off-cycle recompute (cadence override only — the degradation floor stays ARMED)');
  if (confirmDelisting) console.warn('[perpfeed-recompute] --confirm-delisting: the #546 plausibility floor is BYPASSED — the operator asserts a VENUE-CONFIRMED delisting of this scale');
  const { recomputeCryptoPerpUniverse } = await import('../services/passive-archive/universe-loader.js');
  const members = await recomputeCryptoPerpUniverse(
    force || confirmDelisting ? 'perpfeed-recompute-forced' : 'perpfeed-monthly-recompute',
    { acceptImplosion: confirmDelisting },
  );
  console.log(`[perpfeed-recompute] done — ${members.length} members persisted`);
}

main().catch((err) => {
  console.error('[perpfeed-recompute] failed:', err);
  process.exit(1);
}).then(() => process.exit(0));
