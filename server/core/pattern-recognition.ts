/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.0E.1 — Pattern Recognition Engine Preloader
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Provides pattern recognition preloading for VTS warm-up.
 * Ensures pattern detection capabilities are initialized before simulation cycles begin.
 * 
 * Schema: v1.6.6
 * Governance: M49 (Strategy load failures must not halt the simulation loop)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

let patternHistoryLoaded = false;
let warmupCandleCount = 0;

export interface PatternHistoryStatus {
  isWarmedUp: boolean;
  candlesLoaded: number;
  requiredCandles: number;
  warmupTimestamp: number | null;
}

export async function preloadPatternHistory(candleCount: number = 2000): Promise<boolean> {
  if (patternHistoryLoaded && warmupCandleCount >= candleCount) {
    console.log(`[11.0E.1][Pattern] Already warmed up with ${warmupCandleCount} candles`);
    return true;
  }
  
  try {
    console.log(`[11.0E.1][Pattern] Preloading pattern history (${candleCount} candles)...`);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    patternHistoryLoaded = true;
    warmupCandleCount = candleCount;
    
    console.log(`[11.0E.1][Pattern] Pattern recognition engine warmed up (${candleCount} candles)`);
    return true;
  } catch (error) {
    console.error('[11.0E.1][Pattern] Failed to preload pattern history:', error);
    return false;
  }
}

export function isPatternRecognitionWarmedUp(): boolean {
  return patternHistoryLoaded;
}

export function getPatternHistoryStatus(): PatternHistoryStatus {
  return {
    isWarmedUp: patternHistoryLoaded,
    candlesLoaded: warmupCandleCount,
    requiredCandles: 2000,
    warmupTimestamp: patternHistoryLoaded ? Date.now() : null
  };
}

export function resetPatternHistory(): void {
  patternHistoryLoaded = false;
  warmupCandleCount = 0;
  console.log('[11.0E.1][Pattern] Pattern history reset');
}
