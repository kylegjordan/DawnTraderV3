// ════════════════════════════════════════════════════════════════════════════
// P19-B7.1 (OBJ-4) — SELECTION-IC: does the ranker's predicted R-multiple actually
// order the realized R-multiple? This is the Phase-25 GO/NO-GO that proves the new
// ranker beats friction (picking ONE per cycle is low-breadth — Grinold's Fundamental
// Law IR ≈ IC·√breadth — so the per-pick selection IC must be genuinely positive or we
// just pay friction). PURE math, no I/O — the shadow store feeds it the per-cycle
// (predicted, realized) cross-sections; the GO/NO-GO RUN is Phase-25 (data accrues only
// once paper-active trading is on). Built now so the harness + its test exist + are stable.
//
// Method (the correct Grinold formulation, NOT pooling the whole sample):
//   1. Per CYCLE, compute the CROSS-SECTIONAL Spearman rank IC over that cycle's full
//      candidate pool (predicted-R vs realized-R) — "did we order THIS cycle's pool right?".
//   2. Study the DISTRIBUTION of those per-cycle ICs. The mean IC is the skill estimate.
//   3. WINDOW-CLUSTER the standard error: serially-adjacent cycles share regime/market
//      state, so treating each cycle as independent understates the SE. Average ICs within
//      a time window into one cluster observation, then take the SE across clusters.
//   4. A min-N gate drops cycles whose pool is too small for a meaningful per-cycle IC.
//   5. Report PER-REGIME-FAMILY (Simpson's paradox: a positive aggregate can hide a
//      negative IC in one regime, and the GO/NO-GO rides on the per-regime truth).
// ════════════════════════════════════════════════════════════════════════════

/** One promotion cycle's cross-section: predicted-R and realized-R, index-aligned per candidate. */
export interface SelectionICCycle {
  cycleKey: string;
  regime: string | null;
  windowKey: string; // the cluster bucket (e.g. a day/hour string) for window-clustered SE
  predicted: number[];
  realized: number[];
}

export interface SelectionICStats {
  nCycles: number;       // cycles meeting the min-N gate (contributing an IC)
  nClusters: number;     // distinct window buckets among those cycles
  meanIC: number | null; // the skill estimate (mean of per-cycle ICs)
  clusteredSE: number | null;
  ci95: [number, number] | null;
}

export interface SelectionICResult extends SelectionICStats {
  belowMinN: number;     // cycles dropped: pool smaller than minN
  degenerate: number;    // cycles dropped: zero variance in predicted or realized (no orderable spread)
  perCycleICs: number[]; // the raw distribution (for diagnostics / a reliability view)
  perRegime: Record<string, SelectionICStats>;
}

/**
 * Tie-aware Spearman rank correlation (Pearson on fractional ranks). Returns null when
 * n<2 or either side has zero variance (no orderable spread → IC undefined, not 0).
 */
export function spearmanRho(predicted: number[], realized: number[]): number | null {
  const n = predicted.length;
  if (n < 2 || realized.length !== n) return null;
  const rp = fractionalRanks(predicted);
  const rr = fractionalRanks(realized);
  if (rp === null || rr === null) return null; // zero-variance side
  return pearson(rp, rr);
}

/** Fractional (tie-averaged) ranks; null if all values are equal (zero variance). */
function fractionalRanks(xs: number[]): number[] | null {
  const n = xs.length;
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  let k = 0;
  while (k < n) {
    let j = k;
    while (j + 1 < n && idx[j + 1].v === idx[k].v) j++;
    const avgRank = (k + j) / 2 + 1; // 1-based average rank over the tie block
    for (let m = k; m <= j; m++) ranks[idx[m].i] = avgRank;
    k = j + 1;
  }
  // zero variance ⇒ every value tied ⇒ all ranks equal ⇒ undefined correlation
  if (ranks.every((r) => r === ranks[0])) return null;
  return ranks;
}

function pearson(a: number[], b: number[]): number | null {
  const n = a.length;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, dbv = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb; da += xa * xa; dbv += xb * xb;
  }
  if (da === 0 || dbv === 0) return null;
  return num / Math.sqrt(da * dbv);
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Compute window-clustered IC stats from a list of per-cycle ICs tagged with their window bucket.
 * Each window bucket is averaged into ONE cluster observation; the SE is taken across clusters
 * (de-correlates serially-adjacent cycles). With one cycle per bucket this reduces to the plain
 * per-cycle distribution SE. Returns nulls when there are too few clusters for an SE.
 */
function clusteredStats(perCycle: { ic: number; windowKey: string }[]): SelectionICStats {
  const nCycles = perCycle.length;
  if (nCycles === 0) return { nCycles: 0, nClusters: 0, meanIC: null, clusteredSE: null, ci95: null };
  // Average ICs within each window bucket → one observation per cluster.
  const byWindow = new Map<string, number[]>();
  for (const { ic, windowKey } of perCycle) {
    (byWindow.get(windowKey) ?? byWindow.set(windowKey, []).get(windowKey)!).push(ic);
  }
  const clusterMeans = [...byWindow.values()].map(mean);
  const nClusters = clusterMeans.length;
  const meanIC = mean(clusterMeans);
  if (nClusters < 2) {
    return { nCycles, nClusters, meanIC, clusteredSE: null, ci95: null };
  }
  // Sample SD of the cluster means → SE of their mean.
  let ss = 0;
  for (const c of clusterMeans) ss += (c - meanIC) ** 2;
  const sd = Math.sqrt(ss / (nClusters - 1));
  const se = sd / Math.sqrt(nClusters);
  return { nCycles, nClusters, meanIC, clusteredSE: se, ci95: [meanIC - 1.96 * se, meanIC + 1.96 * se] };
}

/**
 * The selection-IC harness. minN gates each cycle's pool size (a per-cycle IC on a 2-3 candidate
 * pool is noise). Cycles with zero predicted/realized variance are counted as `degenerate` and
 * excluded (their IC is undefined, not 0). Per-regime stats use the SAME clustered-SE method.
 */
export function computeSelectionIC(
  cycles: SelectionICCycle[],
  opts: { minN?: number } = {},
): SelectionICResult {
  const minN = opts.minN ?? 5;
  let belowMinN = 0, degenerate = 0;
  const kept: { ic: number; windowKey: string; regime: string | null }[] = [];
  for (const c of cycles) {
    if (c.predicted.length < minN) { belowMinN++; continue; }
    const ic = spearmanRho(c.predicted, c.realized);
    if (ic === null) { degenerate++; continue; }
    kept.push({ ic, windowKey: c.windowKey, regime: c.regime });
  }
  const overall = clusteredStats(kept);
  const perRegime: Record<string, SelectionICStats> = {};
  const byRegime = new Map<string, { ic: number; windowKey: string }[]>();
  for (const k of kept) {
    const key = k.regime ?? 'unknown';
    (byRegime.get(key) ?? byRegime.set(key, []).get(key)!).push({ ic: k.ic, windowKey: k.windowKey });
  }
  for (const [regime, rows] of byRegime) perRegime[regime] = clusteredStats(rows);
  return { ...overall, belowMinN, degenerate, perCycleICs: kept.map((k) => k.ic), perRegime };
}
