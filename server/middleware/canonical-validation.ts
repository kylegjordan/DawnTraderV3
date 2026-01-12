/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4F.1 — Canonical Validation Middleware
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Runtime validation layer to reject any non-canonical regime/strategy/signalType
 * combinations. Violations are logged to audit/logs/canonical_violation.log
 * 
 * Schema Version: 11.4F.1
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  isValidCanonicalCombination,
  normalizeRegime,
  normalizeStrategy,
  getTypeForStrategy,
  CANONICAL_REGIMES,
  CANONICAL_SIGNAL_TYPES,
  CANONICAL_PATTERN_TYPES,
  type CanonicalRegimeType,
  type CanonicalSignalType,
  type CanonicalPatternType,
} from '../config/canonical-regime-strategy-map';

const LOG_DIR = path.join(process.cwd(), 'audit', 'logs');
const VIOLATION_LOG_FILE = path.join(LOG_DIR, 'canonical_violation.log');

function ensureLogDirectory(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function logViolation(violation: CanonicalViolation): void {
  ensureLogDirectory();
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${violation.level} | ${violation.source} | ${violation.message} | Data: ${JSON.stringify(violation.data)}\n`;
  
  try {
    fs.appendFileSync(VIOLATION_LOG_FILE, logEntry);
  } catch (error) {
    console.error('[11.4F.1][Canonical] Failed to write violation log:', error);
  }
  
  console.warn(`[11.4F.1][Canonical] ${violation.level}: ${violation.message}`);
}

export interface CanonicalViolation {
  timestamp: string;
  level: 'WARN' | 'ERROR' | 'CRITICAL';
  source: string;
  message: string;
  data: Record<string, any>;
}

export interface TradeValidationInput {
  regime: string;
  strategy: string;
  signalType: string;
  patternType?: string | null;
  symbol?: string;
}

export interface ValidationResult {
  valid: boolean;
  normalized: {
    regime: CanonicalRegimeType;
    strategy: string;
    signalType: CanonicalSignalType;
    patternType: CanonicalPatternType;
  };
  violations: CanonicalViolation[];
}

export function validateAndNormalizeTrade(
  input: TradeValidationInput,
  source: string = 'unknown'
): ValidationResult {
  const violations: CanonicalViolation[] = [];
  const timestamp = new Date().toISOString();
  
  const normalizedRegime = normalizeRegime(input.regime);
  if (normalizedRegime !== input.regime) {
    violations.push({
      timestamp,
      level: 'WARN',
      source,
      message: `Ghost regime normalized: ${input.regime} → ${normalizedRegime}`,
      data: { original: input.regime, normalized: normalizedRegime, symbol: input.symbol }
    });
  }
  
  const normalizedStrategy = normalizeStrategy(input.strategy);
  if (normalizedStrategy !== input.strategy) {
    violations.push({
      timestamp,
      level: 'WARN',
      source,
      message: `Legacy strategy normalized: ${input.strategy} → ${normalizedStrategy}`,
      data: { original: input.strategy, normalized: normalizedStrategy, symbol: input.symbol }
    });
  }
  
  const expectedSignalType = getTypeForStrategy(normalizedStrategy);
  if (input.signalType !== expectedSignalType) {
    violations.push({
      timestamp,
      level: 'ERROR',
      source,
      message: `SignalType mismatch: expected ${expectedSignalType} for strategy ${normalizedStrategy}, got ${input.signalType}`,
      data: { 
        strategy: normalizedStrategy, 
        expected: expectedSignalType, 
        actual: input.signalType,
        symbol: input.symbol 
      }
    });
  }
  
  const validationResult = isValidCanonicalCombination(
    normalizedRegime,
    normalizedStrategy,
    expectedSignalType,
    input.patternType
  );
  
  if (!validationResult.valid) {
    violations.push({
      timestamp,
      level: 'CRITICAL',
      source,
      message: `Non-canonical combination rejected: ${validationResult.reason}`,
      data: { 
        regime: normalizedRegime,
        strategy: normalizedStrategy,
        signalType: expectedSignalType,
        patternType: input.patternType,
        symbol: input.symbol
      }
    });
  }
  
  for (const violation of violations) {
    logViolation(violation);
  }
  
  const hasCritical = violations.some(v => v.level === 'CRITICAL');
  const hasError = violations.some(v => v.level === 'ERROR');
  
  return {
    valid: !hasCritical && !hasError,
    normalized: {
      regime: normalizedRegime,
      strategy: normalizedStrategy,
      signalType: expectedSignalType,
      patternType: input.patternType as CanonicalPatternType ?? null
    },
    violations
  };
}

export function getViolationStats(): {
  totalViolations: number;
  byLevel: Record<string, number>;
  bySource: Record<string, number>;
} {
  try {
    if (!fs.existsSync(VIOLATION_LOG_FILE)) {
      return { totalViolations: 0, byLevel: {}, bySource: {} };
    }
    
    const content = fs.readFileSync(VIOLATION_LOG_FILE, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    const byLevel: Record<string, number> = { WARN: 0, ERROR: 0, CRITICAL: 0 };
    const bySource: Record<string, number> = {};
    
    for (const line of lines) {
      const levelMatch = line.match(/\] (WARN|ERROR|CRITICAL) \|/);
      if (levelMatch) {
        byLevel[levelMatch[1]] = (byLevel[levelMatch[1]] || 0) + 1;
      }
      
      const sourceMatch = line.match(/\| ([^|]+) \|/);
      if (sourceMatch) {
        const source = sourceMatch[1].trim();
        bySource[source] = (bySource[source] || 0) + 1;
      }
    }
    
    return {
      totalViolations: lines.length,
      byLevel,
      bySource
    };
  } catch (error) {
    console.error('[11.4F.1] Failed to read violation stats:', error);
    return { totalViolations: 0, byLevel: {}, bySource: {} };
  }
}

export function clearViolationLog(): void {
  try {
    if (fs.existsSync(VIOLATION_LOG_FILE)) {
      fs.unlinkSync(VIOLATION_LOG_FILE);
    }
  } catch (error) {
    console.error('[11.4F.1] Failed to clear violation log:', error);
  }
}
