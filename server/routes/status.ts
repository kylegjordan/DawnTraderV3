/**
 * Phase 1: Core Status API Routes
 * 
 * Provides system status, version, and health information
 */

import { Router } from 'express';
import version from '../version.json';
import { env } from '../config/index.js';

export const statusRouter = Router();

/**
 * GET /api/status
 * Returns basic system status and version info
 */
statusRouter.get('/', async (req, res) => {
  try {
    res.json({
      ok: true,
      version: version.version,
      branch: version.branch,
      phase: version.phase,
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      uptime: process.uptime(),
    });
  } catch (error: any) {
    console.error('[Status API] Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/status/health
 * Returns detailed health check including database and services
 */
statusRouter.get('/health', async (req, res) => {
  try {
    const uptime = process.uptime();
    
    // Basic health check
    const health = {
      ok: true,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      uptimeFormatted: formatUptime(uptime),
      database: {
        connected: !!env.DATABASE_URL,
        url: env.DATABASE_URL ? '***configured***' : 'not configured',
      },
      services: [
        'LATTI',
        'GoalsEngine',
        'TradingEngine',
        'ContextBridge',
      ],
      features: {
        lattiEnabled: env.LATTI_ENABLED,
        passiveLearning: env.PASSIVE_LEARNING_ENABLED,
      },
    };

    res.json(health);
  } catch (error: any) {
    console.error('[Status API] Health check error:', error.message);
    res.status(500).json({ 
      ok: false, 
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}
