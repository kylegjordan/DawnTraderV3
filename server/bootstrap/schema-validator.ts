/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7F — Schema Version Validator
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Validates schema version consistency between canonical TypeScript definitions
 * and bridge JSON files at startup and during CI/CD.
 * 
 * Schema Version: regime-mapping/v1.4b
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const EXPECTED_SCHEMA_VERSION = 'regime-mapping/v1.4b';

export interface SchemaValidationResult {
  valid: boolean;
  canonicalSchema: string;
  bridgeSchema: string | null;
  errors: string[];
  warnings: string[];
}

/**
 * Validates schema versions match between canonical config and bridge JSON.
 * Throws error on mismatch to prevent system startup with inconsistent state.
 */
export function validateSchemaVersions(): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  let canonicalSchema = EXPECTED_SCHEMA_VERSION;
  let bridgeSchema: string | null = null;
  
  const bridgePath = join(process.cwd(), 'bridge/canonical/mapping-regime-strategy.json');
  
  if (!existsSync(bridgePath)) {
    warnings.push(`Bridge file not found: ${bridgePath}`);
  } else {
    try {
      const bridgeRaw = readFileSync(bridgePath, 'utf8');
      const bridge = JSON.parse(bridgeRaw);
      
      bridgeSchema = bridge._schema ?? bridge.version ?? null;
      
      if (!bridgeSchema) {
        warnings.push('Bridge JSON missing _schema field');
      } else if (bridgeSchema !== canonicalSchema) {
        if (!bridgeSchema.includes('v1.4')) {
          errors.push(
            `[11.7F] Schema mismatch: canonical=${canonicalSchema}, bridge=${bridgeSchema}`
          );
        } else {
          warnings.push(`Schema minor mismatch: canonical=${canonicalSchema}, bridge=${bridgeSchema}`);
        }
      }
    } catch (err: any) {
      errors.push(`Failed to parse bridge JSON: ${err.message}`);
    }
  }
  
  const valid = errors.length === 0;
  
  if (valid) {
    console.log(`[11.7F][Schema] Validation passed: ${canonicalSchema}`);
  } else {
    console.error(`[11.7F][Schema] Validation failed:`, errors);
  }
  
  if (warnings.length > 0) {
    console.warn(`[11.7F][Schema] Warnings:`, warnings);
  }
  
  return {
    valid,
    canonicalSchema,
    bridgeSchema,
    errors,
    warnings
  };
}

/**
 * Strict validation that throws on any errors.
 * Use this in production startup sequences.
 */
export function validateSchemaVersionsStrict(): void {
  const result = validateSchemaVersions();
  
  if (!result.valid) {
    throw new Error(
      `[11.7F] Schema validation failed: ${result.errors.join('; ')}`
    );
  }
}
