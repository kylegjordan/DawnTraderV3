export interface SubsystemKPIs {
  ara: {
    riskPerTrade: number;
    maxExposure: number;
    mlConfidence: number;
    profitRate: number;
  };
  vts: {
    simulatedTrades: number;
    winRate: number;
    avgProfit: number;
    avgLoss: number;
  };
  maco: {
    consensusScore: number;
    agentCount: number;
    coordinationEfficiency: number;
  };
  dce: {
    decisionIndex: number;
    diSlope: number;
    componentScores: {
      cwqi: number;
      ngc: number;
      ml: number;
      regime: number;
      maco: number;
    };
  };
  pdc: {
    drawdownRiskScore: number;
    equitySlope: number;
    volRatio: number;
    warningActive: boolean;
    containmentActive: boolean;
  };
  ecs: {
    exposureMultiplier: number;
    riskMultiplier: number;
    frequencyMultiplier: number;
    dampingActive: boolean;
  };
}

export interface NormalizedKPIs {
  equityGrowth: number;
  winRate: number;
  drawdown: number;
  diMean: number;
  volatility: number;
  drs: number;
  stability: number;
  timestamp: string;
}

export interface PerformanceMetrics {
  raw: SubsystemKPIs;
  normalized: NormalizedKPIs;
  aggregatedAt: string;
}

const kpiHistory: NormalizedKPIs[] = [];
const MAX_HISTORY = 168;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

function safeGet<T>(obj: any, ...keys: string[]): T | undefined {
  let result = obj;
  for (const key of keys) {
    if (result === null || result === undefined) return undefined;
    result = result[key];
  }
  return result as T;
}

export async function collectSubsystemKPIs(): Promise<SubsystemKPIs> {
  let ara = { riskPerTrade: 3, maxExposure: 25, mlConfidence: 0.5, profitRate: 0 };
  let vts = { simulatedTrades: 0, winRate: 0.5, avgProfit: 0, avgLoss: 0 };
  let maco = { consensusScore: 0.5, agentCount: 0, coordinationEfficiency: 0.5 };
  let dce = { 
    decisionIndex: 0.5, 
    diSlope: 0, 
    componentScores: { cwqi: 0.5, ngc: 0.5, ml: 0.5, regime: 0.5, maco: 0.5 } 
  };
  let pdc = { drawdownRiskScore: 0, equitySlope: 0, volRatio: 1, warningActive: false, containmentActive: false };
  let ecs = { exposureMultiplier: 1, riskMultiplier: 1, frequencyMultiplier: 1, dampingActive: false };

  try {
    const araModule = await import('../services/ara');
    const araService = araModule.araService;
    if (araService?.getStatus) {
      const status = araService.getStatus();
      ara = {
        riskPerTrade: safeGet(status, 'suggestedRiskPerTrade') ?? 3,
        maxExposure: safeGet(status, 'suggestedMaxExposure') ?? 25,
        mlConfidence: safeGet(status, 'mlConfidence') ?? 0.5,
        profitRate: safeGet(status, 'calibratedProfitRate') ?? 0,
      };
    }
  } catch (e) { console.debug('[L19][PA] ARA not available'); }

  try {
    const vtsModule = await import('../services/vts-service');
    const vtsService = vtsModule.vtsService;
    if (vtsService?.getStatus) {
      const status = vtsService.getStatus();
      vts = {
        simulatedTrades: safeGet(status, 'completedTrades') ?? safeGet(status, 'totalTrades') ?? 0,
        winRate: safeGet(status, 'winRate') ?? 0.5,
        avgProfit: safeGet(status, 'avgProfit') ?? 0,
        avgLoss: safeGet(status, 'avgLoss') ?? 0,
      };
    }
  } catch (e) { console.debug('[L19][PA] VTS not available'); }

  try {
    const macoModule = await import('../services/maco-coordinator');
    const macoService = macoModule.getMACOCoordinator();
    if (macoService?.getStatus) {
      const status = macoService.getStatus();
      maco = {
        consensusScore: safeGet(status, 'consensusLevel') ?? safeGet(status, 'consensusScore') ?? 0.5,
        agentCount: safeGet(status, 'agentCount') ?? 0,
        coordinationEfficiency: safeGet(status, 'coordinationEfficiency') ?? safeGet(status, 'efficiency') ?? 0.5,
      };
    }
  } catch (e) { console.debug('[L19][PA] MACO not available'); }

  try {
    const dceModule = await import('../services/decision-confidence-engine');
    const dceService = dceModule.getDecisionConfidenceEngine();
    if (dceService?.getStatus) {
      const status = dceService.getStatus();
      dce = {
        decisionIndex: safeGet(status, 'currentDI') ?? safeGet(status, 'meanDI') ?? 0.5,
        diSlope: safeGet(status, 'diSlope') ?? 0,
        componentScores: safeGet(status, 'componentScores') ?? { cwqi: 0.5, ngc: 0.5, ml: 0.5, regime: 0.5, maco: 0.5 },
      };
    }
  } catch (e) { console.debug('[L19][PA] DCE not available'); }

  try {
    const pdcModule = await import('../services/pdc-engine');
    const pdcService = pdcModule.getPDCEngine();
    if (pdcService?.getStatus) {
      const status = pdcService.getStatus();
      pdc = {
        drawdownRiskScore: safeGet(status, 'drs') ?? safeGet(status, 'drawdownRiskScore') ?? 0,
        equitySlope: safeGet(status, 'equitySlope') ?? safeGet(status, 'slope') ?? 0,
        volRatio: safeGet(status, 'volRatio') ?? safeGet(status, 'volatilityRatio') ?? 1,
        warningActive: safeGet(status, 'warningActive') ?? safeGet(status, 'warning') ?? false,
        containmentActive: safeGet(status, 'containmentActive') ?? safeGet(status, 'containment') ?? false,
      };
    }
  } catch (e) { console.debug('[L19][PA] PDC not available'); }

  try {
    const ecsModule = await import('../services/ecs-controller');
    const ecsService = ecsModule.getECSController();
    if (ecsService?.getStatus) {
      const status = ecsService.getStatus();
      ecs = {
        exposureMultiplier: safeGet(status, 'exposureMultiplier') ?? safeGet(status, 'currentExposure') ?? 1,
        riskMultiplier: safeGet(status, 'riskMultiplier') ?? safeGet(status, 'currentRisk') ?? 1,
        frequencyMultiplier: safeGet(status, 'frequencyMultiplier') ?? safeGet(status, 'currentFrequency') ?? 1,
        dampingActive: safeGet(status, 'dampingActive') ?? safeGet(status, 'damping') ?? false,
      };
    }
  } catch (e) { console.debug('[L19][PA] ECS not available'); }

  return { ara, vts, maco, dce, pdc, ecs };
}

export function normalizeKPIs(raw: SubsystemKPIs): NormalizedKPIs {
  const profitRate = raw.ara.profitRate || 0;
  const equityGrowth = normalize(profitRate, -5, 10);
  
  const winRate = normalize(raw.vts.winRate, 0, 1);
  
  const drawdown = normalize(raw.pdc.drawdownRiskScore, 0, 1);
  
  const diMean = normalize(raw.dce.decisionIndex, 0, 1);
  
  const volatility = normalize(raw.pdc.volRatio, 0.5, 2.0);
  
  const drs = normalize(raw.pdc.drawdownRiskScore, 0, 1);
  
  const consensusNorm = raw.maco.consensusScore;
  const exposureNorm = raw.ecs.exposureMultiplier;
  const stability = (consensusNorm + exposureNorm + (1 - drs)) / 3;

  return {
    equityGrowth,
    winRate,
    drawdown,
    diMean,
    volatility,
    drs,
    stability,
    timestamp: new Date().toISOString(),
  };
}

export async function aggregatePerformance(): Promise<PerformanceMetrics> {
  const raw = await collectSubsystemKPIs();
  const normalized = normalizeKPIs(raw);
  
  kpiHistory.push(normalized);
  if (kpiHistory.length > MAX_HISTORY) {
    kpiHistory.shift();
  }
  
  console.log(`[L19][PA] Aggregated KPIs: equityGrowth=${normalized.equityGrowth.toFixed(3)}, winRate=${normalized.winRate.toFixed(3)}, drawdown=${normalized.drawdown.toFixed(3)}, stability=${normalized.stability.toFixed(3)}`);
  
  return {
    raw,
    normalized,
    aggregatedAt: new Date().toISOString(),
  };
}

export function getKPIHistory(): NormalizedKPIs[] {
  return [...kpiHistory];
}

export function getRecentWindow(hours: number = 24): NormalizedKPIs[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return kpiHistory.filter(k => new Date(k.timestamp).getTime() >= cutoff);
}

export function computeWindowStats(window: NormalizedKPIs[]): {
  meanEquityGrowth: number;
  meanDrawdown: number;
  equityVariance: number;
  meanStability: number;
  meanDI: number;
  meanDRS: number;
  meanVolatility: number;
  meanWinRate: number;
} {
  if (window.length === 0) {
    return { 
      meanEquityGrowth: 0.5, 
      meanDrawdown: 0.3, 
      equityVariance: 0, 
      meanStability: 0.9,
      meanDI: 0.5,
      meanDRS: 0.3,
      meanVolatility: 0.5,
      meanWinRate: 0.5,
    };
  }
  
  const n = window.length;
  const sumEG = window.reduce((s, k) => s + k.equityGrowth, 0);
  const sumDD = window.reduce((s, k) => s + k.drawdown, 0);
  const sumST = window.reduce((s, k) => s + k.stability, 0);
  const sumDI = window.reduce((s, k) => s + k.diMean, 0);
  const sumDRS = window.reduce((s, k) => s + k.drs, 0);
  const sumVol = window.reduce((s, k) => s + k.volatility, 0);
  const sumWR = window.reduce((s, k) => s + k.winRate, 0);
  
  const meanEG = sumEG / n;
  const meanDD = sumDD / n;
  const meanST = sumST / n;
  
  const variance = window.reduce((s, k) => s + Math.pow(k.equityGrowth - meanEG, 2), 0) / n;
  
  return {
    meanEquityGrowth: meanEG,
    meanDrawdown: meanDD,
    equityVariance: variance,
    meanStability: meanST,
    meanDI: sumDI / n,
    meanDRS: sumDRS / n,
    meanVolatility: sumVol / n,
    meanWinRate: sumWR / n,
  };
}
