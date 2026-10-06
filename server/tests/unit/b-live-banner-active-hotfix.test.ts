/**
 * B-LIVE-BANNER-ACTIVE-HOTFIX (#1160, ACTIVE half) — a per-mode "is the engine running" question gets the per-mode
 * server flag, never the mode-agnostic `active`. Measured case: paper running, live stopped ⇒ the Live banner must
 * read STOPPED (it read ACTIVE).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isEngineActiveForMode } from '../../../shared/engine-active';

describe('isEngineActiveForMode', () => {
  const measured = { active: true, isEngineActivePaper: true, isEngineActiveLive: false } as any; // staging 2026-10-06
  it('the measured case: paper running, live stopped -> live STOPPED, paper ACTIVE (the mode-agnostic `active` is ignored)', () => {
    expect(isEngineActiveForMode(measured, 'live')).toBe(false);
    expect(isEngineActiveForMode(measured, 'paper')).toBe(true);
  });
  it('live running alone -> live ACTIVE, paper STOPPED', () => {
    const s = { active: true, isEngineActivePaper: false, isEngineActiveLive: true } as any;
    expect(isEngineActiveForMode(s, 'live')).toBe(true);
    expect(isEngineActiveForMode(s, 'paper')).toBe(false);
  });
  it('nothing running -> both STOPPED', () => {
    const s = { active: false, isEngineActivePaper: false, isEngineActiveLive: false } as any;
    expect(isEngineActiveForMode(s, 'live')).toBe(false);
    expect(isEngineActiveForMode(s, 'paper')).toBe(false);
  });
  it('before the status loads: paper uses its own engine endpoint; live is never assumed', () => {
    expect(isEngineActiveForMode(undefined, 'paper', true)).toBe(true);
    expect(isEngineActiveForMode(undefined, 'paper', false)).toBe(false);
    expect(isEngineActiveForMode(undefined, 'paper')).toBe(false);
    expect(isEngineActiveForMode(undefined, 'live')).toBe(false);
  });
  it('once the status has loaded, the paper flag wins over the first-paint fallback', () => {
    expect(isEngineActiveForMode({ isEngineActivePaper: false }, 'paper', true)).toBe(false);
  });
});

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
describe('fences — no per-mode display reads the mode-agnostic flag', () => {
  it('the mode-agnostic isTradingActive is gone from the hook and every consumer', () => {
    for (const f of ['client/src/hooks/use-trading.tsx', 'client/src/components/mode-banner.tsx', 'client/src/components/trading/paper-trading-controls.tsx']) {
      // code form: a binding or property named isTradingActive (comments naming the removed value are allowed)
      expect(read(f), f).not.toMatch(/(?<![A-Za-z/`'])isTradingActive\s*[,}:=]/);
    }
  });
  it('the banner reads the flag for the mode it shows', () => {
    expect(read('client/src/components/mode-banner.tsx')).toMatch(/mode === 'live' \? isTradingActiveLive : isTradingActivePaper/);
  });
  it('the filter-health widget no longer reads `active` for "paper is running"', () => {
    const w = read('client/src/components/dashboard/filter-health-widget.tsx');
    expect(w).not.toMatch(/tradingStatus\?\.active/);
    expect(w).toMatch(/isEngineActiveForMode\(tradingStatus, 'paper'\)/);
  });
});
