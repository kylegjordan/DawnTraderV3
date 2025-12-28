import { getGASPCoordinator } from '../services/gasp-coordinator';

export interface DampingCoefficients {
  learningRate: number;
  exposure: number;
  frequency: number;
}

export interface StabilizationResult {
  success: boolean;
  previousCoefficients: DampingCoefficients;
  newCoefficients: DampingCoefficients;
  modulesAffected: string[];
}

const baseLearningRates: Record<string, number> = {
  mof: 0.03,
  maco: 0.01,
  ara: 0.02,
  dce: 0.015,
};

const baseExposures: Record<string, number> = {
  ara: 1.0,
  ecs: 1.0,
  pdc: 1.0,
};

let currentDamping: DampingCoefficients = {
  learningRate: 1.0,
  exposure: 1.0,
  frequency: 1.0,
};

export function getCurrentDamping(): DampingCoefficients {
  return { ...currentDamping };
}

export async function applyStabilizationScaling(): Promise<StabilizationResult> {
  const gasp = getGASPCoordinator();
  const status = gasp.getStatus();
  
  const previousCoefficients = { ...currentDamping };
  const modulesAffected: string[] = [];
  
  currentDamping = {
    learningRate: status.dampedLearningRate,
    exposure: status.dampedExposure,
    frequency: status.mode === 'containment' ? 0.5 : 
               status.mode === 'caution' ? 0.75 : 1.0,
  };
  
  try {
    const mofModule = await import('../services/mof-orchestrator');
    const mof = mofModule.getMOFOrchestrator();
    const scaledLR = baseLearningRates.mof * currentDamping.learningRate;
    mof.setConfig({ learningRate: scaledLR });
    modulesAffected.push('mof');
  } catch (e) {
    console.debug('[L20][SC] Could not apply to MOF');
  }
  
  try {
    const macoModule = await import('../services/maco-coordinator');
    const maco = macoModule.getMACOCoordinator();
    if (maco?.setLearningRate) {
      const scaledLR = baseLearningRates.maco * currentDamping.learningRate;
      maco.setLearningRate(scaledLR);
      modulesAffected.push('maco');
    }
  } catch (e) {
    console.debug('[L20][SC] Could not apply to MACO');
  }
  
  try {
    const ecsModule = await import('../services/ecs-controller');
    const ecs = ecsModule.getECSController();
    if (ecs?.setExposureMultiplier) {
      const scaledExp = baseExposures.ecs * currentDamping.exposure;
      ecs.setExposureMultiplier(scaledExp);
      modulesAffected.push('ecs');
    }
  } catch (e) {
    console.debug('[L20][SC] Could not apply to ECS');
  }
  
  console.log(`[L20][SC] Stabilization applied: η′=${currentDamping.learningRate.toFixed(3)}, E′=${currentDamping.exposure.toFixed(3)}, F′=${currentDamping.frequency.toFixed(2)}`);
  
  return {
    success: true,
    previousCoefficients,
    newCoefficients: { ...currentDamping },
    modulesAffected,
  };
}

export async function rollbackToBaseline(): Promise<StabilizationResult> {
  const previousCoefficients = { ...currentDamping };
  const modulesAffected: string[] = [];
  
  currentDamping = {
    learningRate: 1.0,
    exposure: 1.0,
    frequency: 1.0,
  };
  
  try {
    const mofModule = await import('../services/mof-orchestrator');
    const mof = mofModule.getMOFOrchestrator();
    mof.setConfig({ learningRate: baseLearningRates.mof });
    modulesAffected.push('mof');
  } catch (e) {}
  
  try {
    const macoModule = await import('../services/maco-coordinator');
    const maco = macoModule.getMACOCoordinator();
    if (maco?.setLearningRate) {
      maco.setLearningRate(baseLearningRates.maco);
      modulesAffected.push('maco');
    }
  } catch (e) {}
  
  try {
    const ecsModule = await import('../services/ecs-controller');
    const ecs = ecsModule.getECSController();
    if (ecs?.setExposureMultiplier) {
      ecs.setExposureMultiplier(baseExposures.ecs);
      modulesAffected.push('ecs');
    }
  } catch (e) {}
  
  console.log('[L20][SC] Rolled back to baseline coefficients');
  
  return {
    success: true,
    previousCoefficients,
    newCoefficients: { ...currentDamping },
    modulesAffected,
  };
}

export function getEffectiveLearningRate(module: string): number {
  const base = baseLearningRates[module] ?? 0.01;
  return base * currentDamping.learningRate;
}

export function getEffectiveExposure(module: string): number {
  const base = baseExposures[module] ?? 1.0;
  return base * currentDamping.exposure;
}

export function getFrequencyMultiplier(): number {
  return currentDamping.frequency;
}
