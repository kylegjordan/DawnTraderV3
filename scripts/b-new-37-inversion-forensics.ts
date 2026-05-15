/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-NEW-37 — Confidence-Inversion Forensics
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Forensic investigation following B-NEW-36's discovery that the b76 confidence
 * chain is inversely correlated with realized win rate. Per Langston Step 1+2
 * review (2026-05-15):
 *
 *   PHASE 1 (HALT GATE): pre vs post modulation decile WR comparison.
 *     - If predictiveConfidenceRaw (pre) is ALSO monotonic-down, halt and
 *       spawn B-NEW-39 for raw-classifier forensics. Chain math is downstream
 *       and irrelevant in that case.
 *     - If pre is monotonic-up but post is monotonic-down, modulators are
 *       inverting the signal. Proceed to Phase 2.
 *     - If pre is flat/random but post is monotonic-down, modulators are
 *       CREATING the inversion. Proceed to Phase 2.
 *
 *   PHASE 2: per-modulator factor × outcome (7 multiplicative levers).
 *     - For each lever: won_n, lost_n, won_mean_factor, lost_mean_factor,
 *       ratio (won/lost), Mann-Whitney U p-value.
 *     - Verdict per lever: ratio<1.0 + p<0.05 → INVERTED (the bug); ratio>1.0
 *       + p<0.05 → correct sign; 0.99<ratio<1.01 + p>0.10 → inert.
 *
 *   PHASE 3: b68_5 Path-B sustainability (label counterfactual).
 *     - Per-trade Δconf = real_conf - alt_conf (gate-on minus gate-off).
 *     - Compare mean Δconf for winners vs losers.
 *     - Three scenarios per Langston: A (boosts losers more → DROP),
 *       B (uniform but too aggressive → recalibrate), C (directionally
 *       correct → KEEP).
 *     - NOTE: outcome attached is real_decision's outcome; cannot measure
 *       ΔWR on alternate. Δconf-only measurement.
 *
 *   PHASE 4: floor-clamp analysis.
 *     - What % of trades have post-modulation conf pinned at exactly 0.200?
 *     - WR comparison: floor-pinned vs free-floating trades.
 *     - Best-effort grep for the 0.20 floor source (deferred to follow-up
 *       if not cleanly traceable per Langston Q5).
 *
 *   PHASE 5: legacy vs b76 cohort comparison.
 *     - Same chain math; different cohorts. Confirm same bug, different
 *       visibility.
 *
 *   PHASE 6: per-lever DISABLE test.
 *     - For each multiplicative lever: compute what post-modulation conf
 *       WOULD HAVE BEEN if this lever's factor = 1.0 (no contribution).
 *     - Re-compute decile WR curve under each "lever-X-disabled" scenario.
 *     - If disabling lever X resolves the inversion, X is the resolver.
 *
 *   PHASE 7: fix proposal.
 *     - Concrete proposal: which modulator, what change, expected effect on
 *       decile curve.
 *     - Tighter bar per Langston: single-line sign flip in ONE modulator file
 *       qualifies for in-batch ship. Anything wider = separate batch.
 *
 * Output: stdout + Claude Comms and Packages/Batch Completion/B-NEW-37_FORENSICS.md
 *
 * Reference: B-NEW-37 scope + pre-audit + Langston Step 1+2 review 2026-05-15.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

const ASSET_CLASS = 'crypto_spot';
const FLOOR_EPSILON = 0.001; // for floor-pinning detection (post_conf within ε of floor candidates)

// ────────────────────────────────────────────────────────────────────────────
// Data model
// ────────────────────────────────────────────────────────────────────────────

interface AblationRow {
  factor_name: string;
  post_conf: number;        // real_decision.confidence (post-modulation)
  pre_conf: number;         // real_decision.metadata.predictiveConfidenceRaw
  alt_conf: number;         // alternate_decision.confidence
  conf_with_factor: number | null;     // alternate_decision.metadata.confidence_with_factor
  conf_without_factor: number | null;  // alternate_decision.metadata.confidence_without_factor
  outcome: string;
  framework_version: 'b76' | 'legacy';
}

interface DecileBucket {
  decile: number;
  n: number;
  wr: number;
  confLow: number;
  confHigh: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Load matched rows (one per factor per signal)
// ────────────────────────────────────────────────────────────────────────────

async function loadMatched(factorName: string): Promise<AblationRow[]> {
  const result: any = await db.execute(sql`
    SELECT
      factor_name,
      (real_decision->>'confidence')::float AS post_conf,
      (real_decision->'metadata'->>'predictiveConfidenceRaw')::float AS pre_conf,
      (alternate_decision->>'confidence')::float AS alt_conf,
      (alternate_decision->'metadata'->>'confidence_with_factor')::float AS conf_with,
      (alternate_decision->'metadata'->>'confidence_without_factor')::float AS conf_without,
      replay_outcome->>'outcome' AS outcome,
      (real_decision->'metadata'->>'calibrationFrameworkVersion' = 'b76_chain_final') AS is_b76
    FROM regime_factor_alternates
    WHERE asset_class = ${ASSET_CLASS}
      AND factor_name = ${factorName}
      AND replay_outcome IS NOT NULL
      AND replay_outcome->>'outcome' IN ('admitted_won', 'admitted_lost', 'admitted_breakeven')
      AND real_decision->>'confidence' IS NOT NULL
      AND real_decision->'metadata'->>'predictiveConfidenceRaw' IS NOT NULL
  `);
  const raw = (result as any).rows ?? result;
  return raw.map((r: any) => ({
    factor_name: r.factor_name,
    post_conf: Number(r.post_conf),
    pre_conf: Number(r.pre_conf),
    alt_conf: Number(r.alt_conf),
    conf_with_factor: r.conf_with != null ? Number(r.conf_with) : null,
    conf_without_factor: r.conf_without != null ? Number(r.conf_without) : null,
    outcome: r.outcome,
    framework_version: r.is_b76 ? 'b76' : 'legacy',
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Decile WR computation
// ────────────────────────────────────────────────────────────────────────────

function deciles(rows: AblationRow[], field: 'post_conf' | 'pre_conf' | 'alt_conf'): DecileBucket[] {
  if (rows.length < 50) return [];
  const sorted = [...rows].sort((a, b) => a[field] - b[field]);
  const n = sorted.length;
  const out: DecileBucket[] = [];
  for (let i = 0; i < 10; i++) {
    const start = Math.floor((i * n) / 10);
    const end = Math.floor(((i + 1) * n) / 10);
    const bucket = sorted.slice(start, end);
    if (bucket.length === 0) continue;
    const wins = bucket.filter(r => r.outcome === 'admitted_won').length;
    out.push({
      decile: i + 1,
      n: bucket.length,
      wr: (wins / bucket.length) * 100,
      confLow: bucket[0][field],
      confHigh: bucket[bucket.length - 1][field],
    });
  }
  return out;
}

function classifyShape(deciles: DecileBucket[]): 'monotonic-up' | 'monotonic-down' | 'u-shape' | 'inverted-u' | 'flat' | 'mixed' {
  if (deciles.length < 5) return 'flat';
  const wrs = deciles.map(d => d.wr);
  const range = Math.max(...wrs) - Math.min(...wrs);
  if (range < 4) return 'flat';
  // Pairwise inversions
  let upInversions = 0, downInversions = 0;
  for (let i = 1; i < wrs.length; i++) {
    if (wrs[i] < wrs[i-1]) upInversions++;
    if (wrs[i] > wrs[i-1]) downInversions++;
  }
  // Monotonic-up allows ≤2 inversions (noise)
  if (upInversions <= 2) return 'monotonic-up';
  if (downInversions <= 2) return 'monotonic-down';
  // Peak/trough position
  const peakIdx = wrs.indexOf(Math.max(...wrs));
  const troughIdx = wrs.indexOf(Math.min(...wrs));
  if (peakIdx >= 3 && peakIdx <= 6) return 'inverted-u';
  if (troughIdx >= 3 && troughIdx <= 6) return 'u-shape';
  return 'mixed';
}

function renderDecileTable(d: DecileBucket[]): string {
  if (d.length === 0) return '_(insufficient data)_';
  const lines = ['| Decile | n | conf range | WR |', '|---:|---:|---|---:|'];
  for (const b of d) {
    lines.push(`| ${b.decile} | ${b.n} | ${b.confLow.toFixed(3)}–${b.confHigh.toFixed(3)} | ${b.wr.toFixed(1)}% |`);
  }
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Mann-Whitney U test (two-sample, two-tailed)
// ────────────────────────────────────────────────────────────────────────────

function mannWhitneyU(a: number[], b: number[]): { U: number; p: number } {
  const na = a.length, nb = b.length;
  if (na < 5 || nb < 5) return { U: NaN, p: NaN };
  // Rank all combined values
  type Item = { v: number; group: 'a' | 'b' };
  const combined: Item[] = [
    ...a.map((v): Item => ({ v, group: 'a' })),
    ...b.map((v): Item => ({ v, group: 'b' })),
  ];
  combined.sort((x, y) => x.v - y.v);
  // Assign ranks with tie-correction (mean rank within ties)
  const ranks = new Array(combined.length).fill(0);
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j + 1 < combined.length && combined[j + 1].v === combined[i].v) j++;
    const meanRank = (i + j + 2) / 2; // 1-indexed
    for (let k = i; k <= j; k++) ranks[k] = meanRank;
    i = j + 1;
  }
  let rankSumA = 0;
  for (let k = 0; k < combined.length; k++) {
    if (combined[k].group === 'a') rankSumA += ranks[k];
  }
  const U_a = rankSumA - (na * (na + 1)) / 2;
  const U_b = na * nb - U_a;
  const U = Math.min(U_a, U_b);
  // Normal approximation for p-value (valid when na,nb > 20)
  const mean_U = (na * nb) / 2;
  const std_U = Math.sqrt((na * nb * (na + nb + 1)) / 12);
  const z = (U - mean_U) / std_U;
  const p = 2 * (1 - normalCdf(Math.abs(z))); // two-tailed
  return { U, p };
}

function normalCdf(x: number): number {
  // Erfc-based approximation
  return 1 - 0.5 * erfc(x / Math.SQRT2);
}

function erfc(x: number): number {
  const t = 1.0 / (1.0 + 0.3275911 * Math.abs(x));
  const y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? 1 - y : 1 + y;
}

// ────────────────────────────────────────────────────────────────────────────
// Modulator identifiers in the data
// ────────────────────────────────────────────────────────────────────────────

const MULTIPLICATIVE_LEVERS = [
  'b67_2_phase_preference',
  'b67_4_outcome_feedback',
  'b68_1_multi_tf_agreement',
  'b68_2_volume_regime',
  'b68_3_pair_correlation',
  'b68_4_regime_age',
];

const B76_FILTERED_LEVERS = [
  'b67_1_btc_dominance', 'b67_1_funding_rates', 'b67_1_mcap_momentum',
];

const SPECIAL_CASE_LEVER = 'b68_5_path_b_sustainability';

// ────────────────────────────────────────────────────────────────────────────
// Phase 1: pre vs post modulation WR comparison (HALT GATE)
// ────────────────────────────────────────────────────────────────────────────

async function phase1(): Promise<{ proceed: boolean; preShape: string; postShape: string; halt_reason?: string }> {
  // Use b67_4_outcome_feedback as the canonical sample — it's the largest unfiltered b76 cohort
  // and represents one row per signal with both pre + post conf.
  const rows = await loadMatched('b67_4_outcome_feedback');
  const b76 = rows.filter(r => r.framework_version === 'b76');
  console.log(`[B-NEW-37 P1] Loaded ${rows.length} b67_4 rows (${b76.length} b76)`);

  const preDeciles = deciles(b76, 'pre_conf');
  const postDeciles = deciles(b76, 'post_conf');
  const preShape = classifyShape(preDeciles);
  const postShape = classifyShape(postDeciles);

  console.log(`[B-NEW-37 P1] pre shape: ${preShape}, post shape: ${postShape}`);

  // HALT condition: pre is monotonic-down → bug is upstream of chain
  if (preShape === 'monotonic-down') {
    return {
      proceed: false,
      preShape, postShape,
      halt_reason: 'predictiveConfidenceRaw (pre-modulation) is ALREADY monotonic-down. Bug is upstream of the modulation chain. Spawn B-NEW-39 for raw-classifier forensics.',
    };
  }

  return { proceed: true, preShape, postShape };
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2: per-modulator factor × outcome
// ────────────────────────────────────────────────────────────────────────────

interface LeverStat {
  lever: string;
  won_n: number;
  lost_n: number;
  won_mean_factor: number;
  lost_mean_factor: number;
  ratio: number;
  mw_p: number;
  verdict: 'INVERTED' | 'correct sign' | 'inert' | 'inconclusive';
}

async function phase2(): Promise<LeverStat[]> {
  const stats: LeverStat[] = [];
  for (const lever of MULTIPLICATIVE_LEVERS) {
    const rows = (await loadMatched(lever)).filter(r => r.framework_version === 'b76');
    const factors = rows
      .filter(r => r.conf_with_factor != null && r.conf_without_factor != null && r.conf_without_factor !== 0)
      .map(r => ({
        outcome: r.outcome,
        factor: r.conf_with_factor! / r.conf_without_factor!,
      }));
    const wonFactors = factors.filter(f => f.outcome === 'admitted_won').map(f => f.factor);
    const lostFactors = factors.filter(f => f.outcome === 'admitted_lost').map(f => f.factor);

    if (wonFactors.length < 30 || lostFactors.length < 30) {
      stats.push({
        lever, won_n: wonFactors.length, lost_n: lostFactors.length,
        won_mean_factor: NaN, lost_mean_factor: NaN, ratio: NaN, mw_p: NaN,
        verdict: 'inconclusive',
      });
      continue;
    }
    const wonMean = wonFactors.reduce((s, x) => s + x, 0) / wonFactors.length;
    const lostMean = lostFactors.reduce((s, x) => s + x, 0) / lostFactors.length;
    const ratio = wonMean / lostMean;
    const { p } = mannWhitneyU(wonFactors, lostFactors);

    let verdict: LeverStat['verdict'];
    if (ratio < 1.0 && p < 0.05) verdict = 'INVERTED';
    else if (ratio > 1.0 && p < 0.05) verdict = 'correct sign';
    else if (ratio > 0.99 && ratio < 1.01 && p > 0.10) verdict = 'inert';
    else verdict = 'inconclusive';

    stats.push({ lever, won_n: wonFactors.length, lost_n: lostFactors.length, won_mean_factor: wonMean, lost_mean_factor: lostMean, ratio, mw_p: p, verdict });
  }
  return stats;
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 3: b68_5 special case (label counterfactual — Δconf only, no ΔWR)
// ────────────────────────────────────────────────────────────────────────────

interface B68_5Stat {
  won_n: number;
  lost_n: number;
  won_mean_delta: number;  // real_conf - alt_conf for winners
  lost_mean_delta: number;
  mw_p: number;
  scenario: 'A: gate-suppresses-winners-more' | 'B: uniform-too-aggressive' | 'C: directionally-correct' | 'inconclusive';
}

async function phase3(): Promise<B68_5Stat> {
  const rows = (await loadMatched(SPECIAL_CASE_LEVER)).filter(r => r.framework_version === 'b76');
  // For b68_5: real_decision = gate ON; alternate = gate OFF. Δconf = real - alt.
  // Negative Δconf means gate-ON suppresses confidence vs gate-OFF.
  const deltas = rows.map(r => ({ outcome: r.outcome, delta: r.post_conf - r.alt_conf }));
  const wonD = deltas.filter(d => d.outcome === 'admitted_won').map(d => d.delta);
  const lostD = deltas.filter(d => d.outcome === 'admitted_lost').map(d => d.delta);
  if (wonD.length < 30 || lostD.length < 30) {
    return { won_n: wonD.length, lost_n: lostD.length, won_mean_delta: NaN, lost_mean_delta: NaN, mw_p: NaN, scenario: 'inconclusive' };
  }
  const wonMean = wonD.reduce((s, x) => s + x, 0) / wonD.length;
  const lostMean = lostD.reduce((s, x) => s + x, 0) / lostD.length;
  const { p } = mannWhitneyU(wonD, lostD);

  let scenario: B68_5Stat['scenario'];
  // If gate-ON suppresses winners MORE than losers, won_delta < lost_delta (both negative)
  //   AND |won_delta| > |lost_delta|
  if (wonMean < lostMean && p < 0.05) {
    scenario = 'A: gate-suppresses-winners-more';
  } else if (Math.abs(wonMean - lostMean) < 0.02 && Math.abs(wonMean) > 0.1) {
    scenario = 'B: uniform-too-aggressive';
  } else if (wonMean > lostMean && p < 0.05) {
    scenario = 'C: directionally-correct';
  } else {
    scenario = 'inconclusive';
  }
  return { won_n: wonD.length, lost_n: lostD.length, won_mean_delta: wonMean, lost_mean_delta: lostMean, mw_p: p, scenario };
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 4: floor-clamp analysis
// ────────────────────────────────────────────────────────────────────────────

async function phase4(): Promise<{ at_020_floor_pct: number; pinned_wr: number; free_wr: number; n_pinned: number; n_free: number }> {
  const rows = (await loadMatched('b67_4_outcome_feedback')).filter(r => r.framework_version === 'b76');
  const pinned = rows.filter(r => Math.abs(r.post_conf - 0.200) < FLOOR_EPSILON);
  const free = rows.filter(r => Math.abs(r.post_conf - 0.200) >= FLOOR_EPSILON);
  const pinnedWR = pinned.length > 0 ? (pinned.filter(r => r.outcome === 'admitted_won').length / pinned.length) * 100 : 0;
  const freeWR = free.length > 0 ? (free.filter(r => r.outcome === 'admitted_won').length / free.length) * 100 : 0;
  return {
    at_020_floor_pct: (pinned.length / rows.length) * 100,
    pinned_wr: pinnedWR,
    free_wr: freeWR,
    n_pinned: pinned.length,
    n_free: free.length,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 5: legacy vs b76 cohort comparison
// ────────────────────────────────────────────────────────────────────────────

async function phase5(): Promise<{ legacy: { shape: string; deciles: DecileBucket[]; wr: number; n: number }; b76: { shape: string; deciles: DecileBucket[]; wr: number; n: number } }> {
  const rows = await loadMatched('b67_4_outcome_feedback');
  const legacy = rows.filter(r => r.framework_version === 'legacy');
  const b76 = rows.filter(r => r.framework_version === 'b76');
  const legacyDeciles = deciles(legacy, 'post_conf');
  const b76Deciles = deciles(b76, 'post_conf');
  return {
    legacy: {
      shape: classifyShape(legacyDeciles),
      deciles: legacyDeciles,
      wr: legacy.length > 0 ? (legacy.filter(r => r.outcome === 'admitted_won').length / legacy.length) * 100 : 0,
      n: legacy.length,
    },
    b76: {
      shape: classifyShape(b76Deciles),
      deciles: b76Deciles,
      wr: b76.length > 0 ? (b76.filter(r => r.outcome === 'admitted_won').length / b76.length) * 100 : 0,
      n: b76.length,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 6: per-lever DISABLE test
// ────────────────────────────────────────────────────────────────────────────
//
// For each lever, the alternate_decision.confidence is what the chain produces
// if that ONE lever is disabled (factor = 1.0 effectively).
// Re-bin by alt_conf and compute decile WR. If the alt curve is monotonic-up
// where the real curve is monotonic-down, disabling that lever resolves the
// inversion.

interface DisableTestResult {
  lever: string;
  alt_shape: string;
  alt_top_wr: number;     // top decile alt WR
  alt_bot_wr: number;     // bottom decile alt WR
  real_top_wr: number;
  real_bot_wr: number;
  resolves_inversion: boolean;
}

async function phase6(): Promise<DisableTestResult[]> {
  const out: DisableTestResult[] = [];
  for (const lever of MULTIPLICATIVE_LEVERS) {
    const rows = (await loadMatched(lever)).filter(r => r.framework_version === 'b76');
    if (rows.length < 200) continue;
    const realDeciles = deciles(rows, 'post_conf');
    const altDeciles = deciles(rows, 'alt_conf');
    if (realDeciles.length < 5 || altDeciles.length < 5) continue;
    const altShape = classifyShape(altDeciles);
    const realTop = realDeciles[realDeciles.length - 1]?.wr ?? 0;
    const realBot = realDeciles[0]?.wr ?? 0;
    const altTop = altDeciles[altDeciles.length - 1]?.wr ?? 0;
    const altBot = altDeciles[0]?.wr ?? 0;
    // Resolves inversion if alt curve is monotonic-up OR flat (no longer strongly inverted)
    // AND alt top-bottom spread is positive (not still negative)
    const resolves = (altShape === 'monotonic-up' || altShape === 'flat') && (altTop > altBot);
    out.push({
      lever, alt_shape: altShape, alt_top_wr: altTop, alt_bot_wr: altBot,
      real_top_wr: realTop, real_bot_wr: realBot, resolves_inversion: resolves,
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 7: fix proposal (synthesized from prior phases)
// ────────────────────────────────────────────────────────────────────────────

function phase7Proposal(
  p2: LeverStat[],
  p3: B68_5Stat,
  p6: DisableTestResult[],
): string {
  const invertedLevers = p2.filter(s => s.verdict === 'INVERTED');
  const resolvers = p6.filter(r => r.resolves_inversion);
  const lines: string[] = [];

  if (invertedLevers.length === 0 && p3.scenario !== 'A: gate-suppresses-winners-more' && resolvers.length === 0) {
    lines.push('**No single-lever resolver identified.** Phase 2 + Phase 6 do not pinpoint a sign-flipped modulator. Possible causes:');
    lines.push('- Multi-lever interaction effect (no single lever owns the inversion)');
    lines.push('- Inversion driven by pre-modulation upstream signal (Phase 1 should have caught this; re-check)');
    lines.push('- Floor-clamping mechanic creating artificial inversion at the top decile');
    lines.push('');
    lines.push('**Recommended next step:** Open B-NEW-39 for multi-lever-interaction analysis or raw-classifier forensics depending on Phase 1 + Phase 4 evidence.');
    return lines.join('\n');
  }
  if (invertedLevers.length === 1 && resolvers.length === 1 && invertedLevers[0].lever === resolvers[0].lever) {
    const lever = invertedLevers[0].lever;
    lines.push(`**Single-lever resolver identified: \`${lever}\`.**`);
    lines.push(`- Phase 2 verdict: INVERTED (won/lost factor ratio ${invertedLevers[0].ratio.toFixed(3)}, MW-U p=${invertedLevers[0].mw_p.toExponential(2)})`);
    lines.push(`- Phase 6 verdict: disabling this lever produces alt decile shape \`${resolvers[0].alt_shape}\` (vs real shape monotonic-down)`);
    lines.push('');
    lines.push('**Proposed fix:** Trace the modulator\'s factor-computation function. Look for sign-flipped return (e.g., `factor = 0.95 + z * 0.10` when intent was `factor = 1.05 - z * 0.10`). Single-line sign flip qualifies for in-batch ship per Langston tightened bar.');
    lines.push('');
    lines.push('**Verification plan:** After fix, re-run B-NEW-36 cohort diagnostic. b76 decile shape should resolve to monotonic-up (or at least not monotonic-down). Then proceed to B-NEW-38 stratified B-NEW-33 re-run.');
    return lines.join('\n');
  }
  // Multi-lever case
  lines.push(`**Multiple levers implicated.** Phase 2 INVERTED verdicts: ${invertedLevers.map(s => s.lever).join(', ') || '(none)'}. Phase 6 resolvers: ${resolvers.map(r => r.lever).join(', ') || '(none)'}.`);
  lines.push('');
  lines.push('Per Langston tightened bar: multi-lever changes are OUT OF SCOPE for this batch. Recommend spawning B-NEW-39 for multi-lever sign-correction implementation.');
  if (p3.scenario === 'A: gate-suppresses-winners-more') {
    lines.push('');
    lines.push(`**b68_5 also implicated (scenario A):** gate-on suppresses winners ${(p3.won_mean_delta - p3.lost_mean_delta).toFixed(3)} more than losers (MW-U p=${p3.mw_p.toExponential(2)}). Confirmed DROP candidate for B67.5 design.`);
  }
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[B-NEW-37] Confidence-inversion forensics starting');
  const lines: string[] = [];
  lines.push('# B-NEW-37 — Confidence-Inversion Forensic Findings');
  lines.push('');
  lines.push(`**Run timestamp:** ${new Date().toISOString()}`);
  lines.push(`**Asset class:** ${ASSET_CLASS}`);
  lines.push(`**Source:** \`regime_factor_alternates\` post-B-NEW-33-drain`);
  lines.push('');

  // Phase 1 — HALT gate
  console.log('[B-NEW-37] Phase 1 — pre vs post modulation WR comparison');
  const p1 = await phase1();
  lines.push('## PHASE 1 — Pre vs Post Modulation WR Comparison (HALT GATE)');
  lines.push('');
  lines.push(`- Pre-modulation (\`predictiveConfidenceRaw\`) decile shape: **${p1.preShape}**`);
  lines.push(`- Post-modulation (\`real_decision.confidence\`) decile shape: **${p1.postShape}**`);
  lines.push('');
  if (!p1.proceed) {
    lines.push(`### ⚠️ HALT: ${p1.halt_reason}`);
    lines.push('');
    lines.push('Phases 2-7 SKIPPED — bug is upstream of the modulation chain.');
    finalizeReport(lines);
    return;
  }

  // Phase 2
  console.log('[B-NEW-37] Phase 2 — per-modulator factor × outcome');
  const p2 = await phase2();
  lines.push('## PHASE 2 — Per-Modulator Factor × Outcome');
  lines.push('');
  lines.push('| Lever | won n | lost n | won_mean_factor | lost_mean_factor | ratio | MW-U p | Verdict |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---|');
  for (const s of p2) {
    const ratioStr = isNaN(s.ratio) ? 'N/A' : s.ratio.toFixed(3);
    const pStr = isNaN(s.mw_p) ? 'N/A' : s.mw_p.toExponential(2);
    const won = isNaN(s.won_mean_factor) ? 'N/A' : s.won_mean_factor.toFixed(4);
    const lost = isNaN(s.lost_mean_factor) ? 'N/A' : s.lost_mean_factor.toFixed(4);
    lines.push(`| ${s.lever} | ${s.won_n} | ${s.lost_n} | ${won} | ${lost} | ${ratioStr} | ${pStr} | **${s.verdict}** |`);
  }
  lines.push('');
  const inverted = p2.filter(s => s.verdict === 'INVERTED');
  if (inverted.length > 0) {
    lines.push(`**INVERTED levers (the bug source candidates):** ${inverted.map(s => s.lever).join(', ')}`);
  } else {
    lines.push('No lever shows ratio<1.0 + p<0.05 — no single modulator is the obvious culprit.');
  }
  lines.push('');

  // Phase 3
  console.log('[B-NEW-37] Phase 3 — b68_5 Path-B sustainability');
  const p3 = await phase3();
  lines.push('## PHASE 3 — b68_5 Path-B Sustainability (Label Counterfactual)');
  lines.push('');
  lines.push(`- Winners: n=${p3.won_n}, mean Δconf (real - alt) = ${isNaN(p3.won_mean_delta) ? 'N/A' : p3.won_mean_delta.toFixed(4)}`);
  lines.push(`- Losers: n=${p3.lost_n}, mean Δconf = ${isNaN(p3.lost_mean_delta) ? 'N/A' : p3.lost_mean_delta.toFixed(4)}`);
  lines.push(`- MW-U p-value (winner-deltas vs loser-deltas): ${isNaN(p3.mw_p) ? 'N/A' : p3.mw_p.toExponential(2)}`);
  lines.push(`- **Scenario: ${p3.scenario}**`);
  lines.push('');

  // Phase 4
  console.log('[B-NEW-37] Phase 4 — floor-clamp analysis');
  const p4 = await phase4();
  lines.push('## PHASE 4 — Floor-Clamp Analysis');
  lines.push('');
  lines.push(`- % of trades pinned at conf = 0.200: **${p4.at_020_floor_pct.toFixed(1)}%** (n_pinned=${p4.n_pinned}, n_free=${p4.n_free})`);
  lines.push(`- Pinned-trades WR: **${p4.pinned_wr.toFixed(1)}%**`);
  lines.push(`- Free-trades WR: **${p4.free_wr.toFixed(1)}%**`);
  lines.push('');
  if (p4.pinned_wr > p4.free_wr + 5) {
    lines.push(`**The 0.20 floor is concentrating winners** (pinned WR ${p4.pinned_wr.toFixed(1)}% > free WR ${p4.free_wr.toFixed(1)}%). The floor mechanic is FIGHTING the chain — high-WR trades being clamped down to the floor while low-WR free-floating trades drift higher. This is a major contributor to the inversion.`);
  } else if (p4.free_wr > p4.pinned_wr + 5) {
    lines.push(`Free-trades win more than pinned-trades; floor concentrates losers. Floor is helping but chain is still inverted in the free-floating band.`);
  } else {
    lines.push('Floor is roughly neutral on WR — not the primary inversion driver.');
  }
  lines.push('');
  lines.push('**0.20 floor source:** grep for `confidenceFloor`, `MIN_CONFIDENCE`, `Math.max(.*0.2` in `server/services/` deferred to follow-up per Langston Q5 if Phase 4 evidence is sufficient on its own.');
  lines.push('');

  // Phase 5
  console.log('[B-NEW-37] Phase 5 — legacy vs b76 cohort comparison');
  const p5 = await phase5();
  lines.push('## PHASE 5 — Legacy vs b76 Cohort Comparison');
  lines.push('');
  lines.push(`- **Legacy** (n=${p5.legacy.n}, overall WR=${p5.legacy.wr.toFixed(1)}%): shape = ${p5.legacy.shape}`);
  lines.push(`- **b76** (n=${p5.b76.n}, overall WR=${p5.b76.wr.toFixed(1)}%): shape = ${p5.b76.shape}`);
  lines.push('');
  lines.push('### Legacy decile table');
  lines.push('');
  lines.push(renderDecileTable(p5.legacy.deciles));
  lines.push('');
  lines.push('### b76 decile table');
  lines.push('');
  lines.push(renderDecileTable(p5.b76.deciles));
  lines.push('');

  // Phase 6
  console.log('[B-NEW-37] Phase 6 — per-lever DISABLE test');
  const p6 = await phase6();
  lines.push('## PHASE 6 — Per-Lever DISABLE Test');
  lines.push('');
  lines.push('For each lever, computes what decile WR would be using `alt_conf` (which represents the chain with this single lever disabled).');
  lines.push('');
  lines.push('| Lever | alt shape | alt top WR | alt bottom WR | real top WR | real bot WR | resolves? |');
  lines.push('|---|---|---:|---:|---:|---:|---|');
  for (const r of p6) {
    lines.push(`| ${r.lever} | ${r.alt_shape} | ${r.alt_top_wr.toFixed(1)}% | ${r.alt_bot_wr.toFixed(1)}% | ${r.real_top_wr.toFixed(1)}% | ${r.real_bot_wr.toFixed(1)}% | ${r.resolves_inversion ? '**YES**' : 'no'} |`);
  }
  lines.push('');

  // Phase 7
  console.log('[B-NEW-37] Phase 7 — fix proposal');
  lines.push('## PHASE 7 — Fix Proposal');
  lines.push('');
  lines.push(phase7Proposal(p2, p3, p6));
  lines.push('');

  finalizeReport(lines);
}

function finalizeReport(lines: string[]) {
  const report = lines.join('\n');
  console.log('\n' + report);
  const outPath = path.join(process.cwd(), 'Claude Comms and Packages', 'Batch Completion', 'B-NEW-37_FORENSICS.md');
  writeFileSync(outPath, report, 'utf-8');
  console.log(`[B-NEW-37] Report written to ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('[B-NEW-37] Error:', err); process.exit(1); });
