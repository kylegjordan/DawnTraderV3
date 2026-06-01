/**
 * B-CALSCORE — pure formatter for the Calibration Scoreboard tab.
 *
 * Derives the percentage from raw numerator/denominator and renders it WITH the
 * raw counts beside it ("31.91% (18,103/56,725)"). num/den is the SSOT — there
 * is no stored pct column (Langston Step-1 C1.3), so the rate is always computed
 * here, never hand-typed.
 *
 * node-postgres returns numeric/bigint as STRINGS, so inputs are Number()-coerced
 * before any math (Langston Step-1 C5) — otherwise "0" + "/" would string-concat
 * instead of dividing. Returns an em-dash when a side is absent or the denominator
 * is 0 (e.g. the planned side before a sub-batch fills it). A real 0 numerator with
 * a valid denominator is a meaningful 0.00% (e.g. the corr_max dead-gate row), NOT
 * an em-dash.
 */
export function fmtCalibrationResult(
  num: string | number | null | undefined,
  den: string | number | null | undefined,
): string {
  const n = num === null || num === undefined || num === '' ? NaN : Number(num);
  const d = den === null || den === undefined || den === '' ? NaN : Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return '—';
  const pct = (n / d) * 100;
  return `${pct.toFixed(2)}% (${n.toLocaleString('en-US')}/${d.toLocaleString('en-US')})`;
}
