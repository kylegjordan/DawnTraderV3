import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'development-temp-secret',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  
  LATTI_ENABLED: process.env.LATTI_ENABLED !== 'false',
  PASSIVE_LEARNING_ENABLED: process.env.PASSIVE_LEARNING_ENABLED !== 'false',
  
  // Phase 2C: Single-Tenant Mode
  SINGLE_TENANT: process.env.SINGLE_TENANT !== 'false', // Default: true
  
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  isTest: process.env.NODE_ENV === 'test',
} as const;

export type Environment = typeof env;

export default env;
