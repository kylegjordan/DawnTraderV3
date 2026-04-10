/**
 * Directive 8.8.4-L3: ML Service Client
 * 
 * Provides async methods for calling the Python ML microservice endpoints.
 * All calls are non-blocking and include fallback values for degraded mode.
 */

import { bootOrchestrator } from '../core/boot_orchestrator.js';

const ML_SERVICE_HOST = process.env.ML_SERVICE_HOST || 'http://localhost:5001';
const REQUEST_TIMEOUT = 2000;

export interface PromotionPrediction {
  success: boolean;
  probability: number;
  latency_ms: number;
  fromCache?: boolean;
}

export interface ProfitPrediction {
  success: boolean;
  predicted_profit: number;
  latency_ms: number;
  fromCache?: boolean;
}

export interface PredictionInput {
  symbol: string;
  strategy: string;
  riskRatio: number;
  profitTarget: number;
  signalAge?: number;
  entry: number;
  exit: number;
  stop: number;
}

const predictionCache = new Map<string, { value: PromotionPrediction | ProfitPrediction; expiry: number }>();
const CACHE_TTL = 30000;

function getCacheKey(type: 'promotion' | 'profit', input: PredictionInput): string {
  return `${type}:${input.symbol}:${input.strategy}:${input.riskRatio.toFixed(3)}:${input.profitTarget.toFixed(3)}`;
}

function getFromCache<T>(key: string): T | null {
  const cached = predictionCache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.value as T;
  }
  if (cached) {
    predictionCache.delete(key);
  }
  return null;
}

function setCache(key: string, value: PromotionPrediction | ProfitPrediction): void {
  predictionCache.set(key, { value, expiry: Date.now() + CACHE_TTL });
  
  if (predictionCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of predictionCache.entries()) {
      if (v.expiry < now) {
        predictionCache.delete(k);
      }
    }
  }
}

export async function predictPromotion(input: PredictionInput): Promise<PromotionPrediction> {
  const cacheKey = getCacheKey('promotion', input);
  const cached = getFromCache<PromotionPrediction>(cacheKey);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  if (!bootOrchestrator.isMLReady()) {
    return {
      success: false,
      probability: 0.5,
      latency_ms: 0
    };
  }

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${ML_SERVICE_HOST}/predict/promotion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json() as PromotionPrediction;
    const latency = Date.now() - startTime;

    if (latency > 2000) {
      console.warn(`[L3][ML_CLIENT][LAG_WARNING] Promotion prediction took ${latency}ms`);
    }

    console.log(`[L3][MODEL_INFER][SQE] symbol=${input.symbol} promotion=${result.probability.toFixed(4)}`);

    const prediction: PromotionPrediction = {
      success: true,
      probability: result.probability,
      latency_ms: latency
    };

    setCache(cacheKey, prediction);
    return prediction;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[L3][ML_CLIENT][ERROR] Promotion prediction failed: ${errorMessage}`);
    
    return {
      success: false,
      probability: 0.5,
      latency_ms: Date.now() - startTime
    };
  }
}

export async function predictProfit(input: PredictionInput): Promise<ProfitPrediction> {
  const cacheKey = getCacheKey('profit', input);
  const cached = getFromCache<ProfitPrediction>(cacheKey);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  if (!bootOrchestrator.isMLReady()) {
    return {
      success: false,
      predicted_profit: 0.05,
      latency_ms: 0
    };
  }

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${ML_SERVICE_HOST}/predict/profit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json() as ProfitPrediction;
    const latency = Date.now() - startTime;

    if (latency > 2000) {
      console.warn(`[L3][ML_CLIENT][LAG_WARNING] Profit prediction took ${latency}ms`);
    }

    console.log(`[L3][MODEL_INFER][SQE] symbol=${input.symbol} profit=${result.predicted_profit.toFixed(4)}`);

    const prediction: ProfitPrediction = {
      success: true,
      predicted_profit: result.predicted_profit,
      latency_ms: latency
    };

    setCache(cacheKey, prediction);
    return prediction;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[L3][ML_CLIENT][ERROR] Profit prediction failed: ${errorMessage}`);
    
    return {
      success: false,
      predicted_profit: 0.05,
      latency_ms: Date.now() - startTime
    };
  }
}

export async function getMLServiceStatus(): Promise<{
  status: string;
  memoryMB?: number;
  cpuPercent?: number;
  modelVersions?: { promotion: string; profit: string };
}> {
  const orchestratorStatus = bootOrchestrator.getStatus();
  
  if (orchestratorStatus.status !== 'READY') {
    return {
      status: orchestratorStatus.status,
      memoryMB: orchestratorStatus.memoryMB,
      cpuPercent: orchestratorStatus.cpuPercent,
      modelVersions: orchestratorStatus.modelVersions
    };
  }

  try {
    const response = await fetch(`${ML_SERVICE_HOST}/metrics`, {
      method: 'GET'
    });

    if (response.ok) {
      const metrics = await response.json() as {
        memory_mb: number;
        cpu_percent: number;
        is_ready: boolean;
        model_versions: { promotion: string; profit: string };
      };

      return {
        status: metrics.is_ready ? 'READY' : 'DEGRADED',
        memoryMB: metrics.memory_mb,
        cpuPercent: metrics.cpu_percent,
        modelVersions: metrics.model_versions
      };
    }
  } catch {
  }

  return { status: 'UNKNOWN' };
}

export function blendConfidence(originalNGC: number, predictedPromotion: number, blendFactor: number = 0.6): number {
  return originalNGC * blendFactor + predictedPromotion * (1 - blendFactor);
}
