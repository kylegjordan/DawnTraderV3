import { storage } from '../storage.js';

export async function getDynamicSlots(mode: 'paper' | 'live' = 'paper'): Promise<{ slots: number; maxExposure: number; maxPosition: number }> {
  try {
    const guardrails = await storage.getGuardrailsV2({ mode });
    if (!guardrails) {
      return { slots: 8, maxExposure: 40, maxPosition: 12 };
    }
    
    const g = guardrails as any;
    const maxExposure = Number(g.maxTotalExposurePct || g.maxExposurePercent || g.maxExposurePct) || 40;
    const maxPosition = Number(g.maxPositionPercentPct || g.maxPositionPercent) || 12;
    const dynamicSlots = Math.floor(maxExposure / maxPosition);
    
    return { slots: Math.max(dynamicSlots, 1), maxExposure, maxPosition };
  } catch (err) {
    console.error('[DYNAMIC_SLOTS] Error calculating dynamic slots:', err);
    return { slots: 8, maxExposure: 40, maxPosition: 12 };
  }
}
