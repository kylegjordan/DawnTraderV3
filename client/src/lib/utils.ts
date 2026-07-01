import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumberWithCommas(value: number | string): string {
  if (value === '' || value === null || value === undefined) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function parseCommaFormattedNumber(value: string): number {
  if (!value || value.trim() === '') return 0;
  const cleanedValue = value.replace(/,/g, '');
  const num = parseFloat(cleanedValue);
  return isNaN(num) ? 0 : num;
}

// P19-B7.2b (OBJ-C): ONE uniform "entry fee mode" formatter shared by all four
// surfaces (RTB, paper open/closed, VTS open/closed) so the label reads identically
// everywhere (Langston Step-2 add: never a round-trip figure — the entry-side mode
// only). Renders NULL (a record with no recorded decision — pre-B7.2 rows) as an
// em-dash, never a guessed 'taker'. Optionally appends the per-side fee % when known.
export function formatEntryFeeMode(
  mode: string | null | undefined,
  feeRate?: number | string | null,
): string {
  if (mode !== 'maker' && mode !== 'taker') return '—';
  const label = mode === 'maker' ? 'Maker' : 'Taker';
  const rate = typeof feeRate === 'string' ? parseFloat(feeRate) : feeRate;
  if (rate != null && Number.isFinite(rate)) {
    return `${label} (${(rate * 100).toFixed(2)}%)`;
  }
  return label;
}
