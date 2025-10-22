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
