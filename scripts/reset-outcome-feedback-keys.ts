/**
 * B-XSTOCK-FEED-SANITY P8 — remove the two `paper_sim_xstock_spot_*` keys from the outcome-feedback
 * store file at deploy (`dt-deploy --pre-restart 'b-xstock-feed-sanity:reset-feedback'`).
 *
 * WHY A FILE EDIT AND NOT AN EPOCH BUMP: an epoch mismatch resets the Welford triplet and NOT the EMA,
 * and NOT `sample_count` (`outcome-feedback-store.ts:353-372`, its own log line says so) — so the
 * contaminated EMA would keep emitting a factor above the `b67_4_min_samples` gate. The store has no
 * partition-scoped reset (only a test-only `clear()`), so this script is that reset, for exactly the
 * keys the audit measured (§A.6: 2 keys, 69 samples). Bounded and stated: the chain is RECORDED-ONLY
 * at the ref, so this prevents a future gate (B67.5) inheriting a contaminated history — it repairs no
 * live decision. VTS and crypto partitions are untouched by construction (the prefix is exact).
 *
 * Runs BEFORE the restart, on the file the store will load: `/home/deploy/dawntrader/data/b67-4-outcome-feedback.json`
 * (override with OUTCOME_FEEDBACK_FILE for a dry run elsewhere). Re-validates the JSON after writing —
 * a corrupt file hard-throws at store construction, so this must never leave one behind.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';

const FILE = process.env.OUTCOME_FEEDBACK_FILE ?? '/home/deploy/dawntrader/data/b67-4-outcome-feedback.json';
const PREFIX = 'paper_sim_xstock_spot_';
const DRY = process.argv.includes('--dry-run');

function main(): void {
  if (!existsSync(FILE)) { console.log(`[reset-feedback] ${FILE} absent — nothing to reset (a fresh store starts empty)`); return; }
  const text = readFileSync(FILE, 'utf8');
  const doc = JSON.parse(text) as Record<string, unknown>;
  // The on-disk shape is whatever the store persists; both a keyed object and an `entries` array are handled.
  const entriesObj = (doc.entries && typeof doc.entries === 'object' && !Array.isArray(doc.entries)) ? doc.entries as Record<string, any>
    : (!doc.entries ? doc : null);
  const entriesArr = Array.isArray(doc.entries) ? doc.entries as Array<Record<string, any>> : null;
  const removed: string[] = [];
  if (entriesObj) {
    for (const k of Object.keys(entriesObj)) if (k.startsWith(PREFIX)) { removed.push(`${k} (n=${entriesObj[k]?.sample_count ?? '?'} ema=${entriesObj[k]?.ema_pnl_pct ?? '?'})`); if (!DRY) delete entriesObj[k]; }
  } else if (entriesArr) {
    const keep = entriesArr.filter(e => { const k = String(e.key ?? ''); const hit = k.startsWith(PREFIX); if (hit) removed.push(`${k} (n=${e.sample_count ?? '?'} ema=${e.ema_pnl_pct ?? '?'})`); return !hit; });
    if (!DRY) doc.entries = keep;
  } else {
    throw new Error(`[reset-feedback] unrecognised store shape in ${FILE} — refusing to touch it`);
  }
  console.log(`[reset-feedback] ${DRY ? 'would remove' : 'removed'} ${removed.length} key(s) with prefix ${PREFIX}:`);
  for (const r of removed) console.log(`   ${r}`);
  if (DRY || removed.length === 0) return;
  const out = JSON.stringify(doc, null, 2);
  JSON.parse(out); // re-validate before it touches disk
  renameSync(FILE, `${FILE}.pre-b-xstock-feed-sanity-${Date.now()}`); // the pre-reset file is kept beside it
  writeFileSync(FILE, out, 'utf8');
  JSON.parse(readFileSync(FILE, 'utf8')); // and once more from disk
  console.log(`[reset-feedback] wrote ${FILE}; pre-reset copy kept beside it`);
}
main();
