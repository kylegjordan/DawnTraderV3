/**
 * Walter Health Monitor Service
 * 
 * Continuously monitors system health and generates alerts for users
 * Polls /api/system/health every 30s via HTTP and detects:
 * - Paper trading unexpectedly stops
 * - Frontend disconnection
 * - Goals disappearing
 */

import { storage } from '../storage';

interface SystemHealthStatus {
  backend: string;
  paperTrading: {
    isRunning: boolean;
    sessionId: string | null;
    startedBy: string | null;
    startTime: Date | null;
    type: '48hr' | 'manual' | null;
  };
  database: string;
  goals: {
    live: { count: number; hasGoals: boolean };
    paper: { count: number; hasGoals: boolean };
  };
  frontendConnected: boolean;
  lastSync: string;
}

export class WalterHealthMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private previousHealth: Map<string, SystemHealthStatus> = new Map();
  private readonly POLL_INTERVAL_MS = 30000; // 30 seconds
  private readonly API_URL = process.env.API_URL || 'http://localhost:5000';
  private userTokens: Map<string, string> = new Map();

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[WalterMonitor] Already running');
      return;
    }

    console.log('[WalterMonitor] Starting health monitoring (30s interval)...');
    this.isRunning = true;

    // Run initial check
    await this.checkAllUsers();

    // Schedule recurring checks
    this.intervalId = setInterval(async () => {
      try {
        await this.checkAllUsers();
      } catch (error) {
        console.error('[WalterMonitor] Error in monitoring cycle:', error);
      }
    }, this.POLL_INTERVAL_MS);

    console.log('[WalterMonitor] ✅ Health monitoring started');
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[WalterMonitor] Stopped');
  }

  private async checkAllUsers(): Promise<void> {
    try {
      const users = await storage.getAllUsers();
      
      for (const user of users) {
        await this.checkUserHealth(user.id, user.username);
      }
    } catch (error) {
      console.error('[WalterMonitor] Error checking users:', error);
    }
  }

  private async checkUserHealth(userId: string, username: string): Promise<void> {
    try {
      // Get or create auth token for this user
      let token = this.userTokens.get(userId);
      if (!token) {
        const newToken = await this.getAuthToken(username);
        if (newToken) {
          this.userTokens.set(userId, newToken);
          token = newToken;
        }
      }

      if (!token) {
        console.warn(`[WalterMonitor] No auth token for user ${userId}, skipping`);
        return;
      }

      // Poll /api/system/health endpoint via HTTP
      const response = await fetch(`${this.API_URL}/api/system/health`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-app-mode': 'paper'
        }
      });

      if (!response.ok) {
        // Token might be expired, clear it
        this.userTokens.delete(userId);
        console.warn(`[WalterMonitor] Health check failed for user ${userId}: ${response.status}`);
        return;
      }

      const currentHealth: SystemHealthStatus = await response.json();
      const previousHealth = this.previousHealth.get(userId);

      // Detect issues and create alerts
      if (previousHealth) {
        await this.detectAndAlert(userId, previousHealth, currentHealth);
      }

      // Update previous health
      this.previousHealth.set(userId, currentHealth);
    } catch (error) {
      console.error(`[WalterMonitor] Error checking health for user ${userId}:`, error);
    }
  }

  private async getAuthToken(username: string): Promise<string | null> {
    try {
      // For monitoring purposes, we authenticate as the user
      // In production, you'd want a service account or internal auth
      const user = await storage.getUserByUsername(username);
      if (!user) return null;

      // Create a JWT token for internal monitoring (using same logic as login)
      const jwt = await import('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'development_secret_change_in_production';
      
      const token = jwt.sign(
        { id: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '24h' } // Longer expiry for monitoring
      );

      return token;
    } catch (error) {
      console.error(`[WalterMonitor] Error getting auth token:`, error);
      return null;
    }
  }

  private async detectAndAlert(
    userId: string,
    previous: SystemHealthStatus,
    current: SystemHealthStatus
  ): Promise<void> {
    const alerts: string[] = [];

    // Alert 1: Paper trading unexpectedly stopped
    if (previous.paperTrading.isRunning && !current.paperTrading.isRunning) {
      alerts.push('Paper trading has stopped unexpectedly. The simulation is no longer running.');
      console.log(`[WalterMonitor] 🚨 Alert for user ${userId}: Paper trading stopped`);
    }

    // Alert 2: Frontend disconnected
    if (previous.frontendConnected && !current.frontendConnected) {
      alerts.push('Frontend connection lost. You may need to refresh your browser.');
      console.log(`[WalterMonitor] ⚠️  Alert for user ${userId}: Frontend disconnected`);
    }

    // Alert 3: Goals disappeared
    const prevPaperGoals = previous.goals.paper.count;
    const currPaperGoals = current.goals.paper.count;
    const prevLiveGoals = previous.goals.live.count;
    const currLiveGoals = current.goals.live.count;

    if (prevPaperGoals > 0 && currPaperGoals === 0) {
      alerts.push('Your paper trading goals have disappeared. This may indicate a data issue.');
      console.log(`[WalterMonitor] ⚠️  Alert for user ${userId}: Paper goals disappeared`);
    }

    if (prevLiveGoals > 0 && currLiveGoals === 0) {
      alerts.push('Your live trading goals have disappeared. This may indicate a data issue.');
      console.log(`[WalterMonitor] ⚠️  Alert for user ${userId}: Live goals disappeared`);
    }

    // Alert 4: Database error
    if (previous.database === 'OK' && current.database === 'ERROR') {
      alerts.push('Database connection error detected. Some features may not work correctly.');
      console.log(`[WalterMonitor] 🚨 Alert for user ${userId}: Database error`);
    }

    // Log alerts (system alerts creation disabled - use console logging)
    if (alerts.length > 0) {
      for (const message of alerts) {
        console.log(`[WalterMonitor] 🔔 Alert for user ${userId}: ${message}`);
        // TODO: Integrate with proper alert system when available
        // await storage.createSystemAlert({ ... });
      }
    }
  }
}

export const walterHealthMonitor = new WalterHealthMonitor();
