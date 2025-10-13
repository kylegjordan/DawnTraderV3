import { storage } from '../storage';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

interface SystemMetrics {
  uptime: number;
  memory: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
  };
  cpu: {
    cores: number;
    loadAverage: number[];
  };
}

interface TradingMetrics {
  totalPL: number;
  activeTrades: number;
  closedTrades: number;
  winRate: number;
  roi: number;
  activeStrategies: string[];
}

interface AIMetrics {
  recentLearningCycles: number;
  averageConfidence: number;
  opportunitiesGenerated: number;
  adjustmentsMade: number;
}

interface Telemetry {
  timestamp: string;
  system: SystemMetrics;
  trading: TradingMetrics;
  ai: AIMetrics;
  goals: any[];
  guardrails: any;
  recentChats: any[];
}

interface OrchestratorAnalysis {
  timestamp: string;
  anomalies: string[];
  optimizations: string[];
  recommendations: string[];
  urgencyLevel: 'low' | 'medium' | 'high';
}

class AIOrchestrator {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private telemetryInterval = 5 * 60 * 1000; // 5 minutes
  private openai: OpenAI | null = null;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('[AI Orchestrator] Already running');
      return;
    }

    console.log('[AI Orchestrator] Initializing...');
    this.isRunning = true;

    // Run initial telemetry generation
    await this.generateTelemetry();

    // Schedule recurring telemetry updates
    this.intervalId = setInterval(async () => {
      try {
        await this.generateTelemetry();
      } catch (error) {
        console.error('[AI Orchestrator] Error in telemetry cycle:', error);
      }
    }, this.telemetryInterval);

    console.log('[AI Orchestrator] ✅ Started successfully');
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[AI Orchestrator] Stopped');
  }

  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      uptime: os.uptime(),
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usagePercent: (usedMem / totalMem) * 100
      },
      cpu: {
        cores: os.cpus().length,
        loadAverage: os.loadavg()
      }
    };
  }

  private async collectTradingMetrics(): Promise<TradingMetrics> {
    try {
      // Get all users to aggregate trading data
      const users = await storage.getAllUsers();
      let totalPL = 0;
      let activeTrades = 0;
      let closedTrades = 0;
      let totalWins = 0;
      const activeStrategies = new Set<string>();

      for (const user of users) {
        // Collect live mode trades
        const liveTrades = await storage.getTrades(user.id, {});
        const liveActive = liveTrades.filter(t => t.status === 'open');
        const liveClosed = liveTrades.filter(t => t.status === 'closed');
        
        activeTrades += liveActive.length;
        closedTrades += liveClosed.length;
        
        liveClosed.forEach(t => {
          const pl = parseFloat(t.realizedPL || '0');
          totalPL += pl;
          if (pl > 0) totalWins++;
        });

        // Collect paper mode trades
        const paperTrades = await storage.getAllPaperTrades(user.id);
        const paperActive = paperTrades.filter(t => t.status === 'open');
        const paperClosed = paperTrades.filter(t => t.status === 'closed');
        
        activeTrades += paperActive.length;
        closedTrades += paperClosed.length;
        
        paperClosed.forEach(t => {
          const pl = parseFloat(t.realizedPL || '0');
          totalPL += pl;
          if (pl > 0) totalWins++;
        });

        // Collect strategy info (simplified - would need actual strategy tracking)
        // Note: activeStrategies field would need to be added to schema if needed
        activeStrategies.add('vwap_pullback');
        activeStrategies.add('abcd_long');
        activeStrategies.add('sma_trend_ride');
      }

      const winRate = closedTrades > 0 ? (totalWins / closedTrades) * 100 : 0;
      const roi = totalPL; // Simplified ROI calculation

      return {
        totalPL,
        activeTrades,
        closedTrades,
        winRate,
        roi,
        activeStrategies: Array.from(activeStrategies)
      };
    } catch (error) {
      console.error('[AI Orchestrator] Error collecting trading metrics:', error);
      return {
        totalPL: 0,
        activeTrades: 0,
        closedTrades: 0,
        winRate: 0,
        roi: 0,
        activeStrategies: []
      };
    }
  }

  private async collectAIMetrics(): Promise<AIMetrics> {
    try {
      // Count recent autonomous adjustments
      const users = await storage.getAllUsers();
      let adjustmentsMade = 0;
      let totalConfidence = 0;
      let confidenceCount = 0;

      for (const user of users) {
        try {
          const adjustments = await storage.getAllProposedAdjustments(user.id, 24);
          adjustmentsMade += adjustments.length;
          
          adjustments.forEach(adj => {
            if (adj.confidenceScore) {
              totalConfidence += adj.confidenceScore;
              confidenceCount++;
            }
          });
        } catch (e) {}
      }

      return {
        recentLearningCycles: adjustmentsMade,
        averageConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
        opportunitiesGenerated: 0, // Will be populated if we can query AI opportunities
        adjustmentsMade
      };
    } catch (error) {
      console.error('[AI Orchestrator] Error collecting AI metrics:', error);
      return {
        recentLearningCycles: 0,
        averageConfidence: 0,
        opportunitiesGenerated: 0,
        adjustmentsMade: 0
      };
    }
  }

  private async collectGoalsAndGuardrails(): Promise<{ goals: any[], guardrails: any }> {
    try {
      const users = await storage.getAllUsers();
      const allGoals: any[] = [];
      let guardrails: any = {};

      if (users.length > 0) {
        const firstUser = users[0];
        
        // Get trading settings which may include goals
        try {
          const settings = await storage.getTradingSettings(firstUser.id);
          if (settings) {
            guardrails = {
              maxOpenTrades: settings.maxOpenTrades,
              riskPerTrade: settings.riskPerTrade
            };
          }
        } catch (e) {}
      }

      return { goals: allGoals, guardrails };
    } catch (error) {
      console.error('[AI Orchestrator] Error collecting goals/guardrails:', error);
      return { goals: [], guardrails: {} };
    }
  }

  private async collectRecentChats(): Promise<any[]> {
    try {
      const users = await storage.getAllUsers();
      const recentChats: any[] = [];

      if (users.length > 0) {
        const firstUser = users[0];
        
        // Get recent context chats (last 5 per context)
        const contexts = ['goals', 'guardrails', 'screener', 'strategies'];
        for (const context of contexts) {
          try {
            const chats = await storage.getContextChats(firstUser.id, context);
            const recent = chats.slice(-5); // Last 5 messages
            recentChats.push(...recent.map(c => ({ ...c, context })));
          } catch (e) {}
        }
      }

      return recentChats;
    } catch (error) {
      console.error('[AI Orchestrator] Error collecting recent chats:', error);
      return [];
    }
  }

  async generateTelemetry(): Promise<Telemetry> {
    console.log('[AI Orchestrator] Generating telemetry snapshot...');

    const [system, trading, ai, { goals, guardrails }, recentChats] = await Promise.all([
      this.collectSystemMetrics(),
      this.collectTradingMetrics(),
      this.collectAIMetrics(),
      this.collectGoalsAndGuardrails(),
      this.collectRecentChats()
    ]);

    const telemetry: Telemetry = {
      timestamp: new Date().toISOString(),
      system,
      trading,
      ai,
      goals,
      guardrails,
      recentChats
    };

    // Save to file
    const summariesDir = path.join(process.cwd(), 'server/orchestrator/summaries');
    await fs.mkdir(summariesDir, { recursive: true });
    const telemetryPath = path.join(summariesDir, 'telemetry.json');
    await fs.writeFile(telemetryPath, JSON.stringify(telemetry, null, 2));

    console.log(`[AI Orchestrator] Telemetry saved (${Buffer.byteLength(JSON.stringify(telemetry))} bytes)`);

    // Trigger GPT-4o analysis if OpenAI is configured
    if (this.openai) {
      await this.analyzeWithGPT(telemetry);
    }

    return telemetry;
  }

  async analyzeWithGPT(telemetry: Telemetry): Promise<OrchestratorAnalysis | null> {
    if (!this.openai) {
      console.log('[AI Orchestrator] OpenAI not configured, skipping analysis');
      return null;
    }

    try {
      console.log('[AI Orchestrator] Sending telemetry to GPT-4o for analysis...');
      const startTime = Date.now();

      const prompt = `You are an AI System Administrator for a cryptocurrency trading platform. Analyze this system snapshot and provide insights.

System Telemetry:
${JSON.stringify(telemetry, null, 2)}

Provide a structured analysis with:
1. Anomalies: Any unusual patterns, errors, or concerning metrics (include severity level)
2. Optimizations: Opportunities to improve performance or efficiency (include impact level)
3. Recommendations: Specific actionable recommendations with rationale (include urgencyLevel, action, and rationale for each)
4. Overall Urgency Level: low, medium, high, or critical

Format your response as JSON with this structure:
{
  "anomalies": [
    {"severity": "high|medium|low", "message": "description of anomaly"}
  ],
  "optimizations": [
    {"impact": "high|medium|low", "recommendation": "optimization suggestion"}
  ],
  "recommendations": [
    {"urgencyLevel": "critical|high|medium|low", "action": "specific action to take", "rationale": "why this action is recommended"}
  ],
  "urgencyLevel": "critical|high|medium|low"
}`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });

      const latency = Date.now() - startTime;
      console.log(`[AI Orchestrator] OpenAI analysis received (${latency}ms)`);

      const analysisData = JSON.parse(completion.choices[0].message.content || '{}');
      
      // Enhanced analysis with structured recommendations
      interface StructuredRecommendation {
        severity: string;
        message: string;
      }
      interface StructuredOptimization {
        impact: string;
        recommendation: string;
      }
      interface StructuredAIRecommendation {
        urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
        action: string;
        rationale: string;
      }

      const analysis: OrchestratorAnalysis = {
        timestamp: new Date().toISOString(),
        anomalies: analysisData.anomalies || [],
        optimizations: analysisData.optimizations || [],
        recommendations: analysisData.recommendations || [],
        urgencyLevel: analysisData.urgencyLevel || 'low'
      };

      // Save analysis to logs
      const logsDir = path.join(process.cwd(), 'server/orchestrator/logs');
      await fs.mkdir(logsDir, { recursive: true });
      const logPath = path.join(logsDir, `ai_analysis_${Date.now()}.json`);
      await fs.writeFile(logPath, JSON.stringify(analysis, null, 2));

      console.log(`[AI Orchestrator] Analysis saved to ${logPath}`);

      // Save recommendations to orchestrator logs for approval workflow
      console.log(`[AI Orchestrator] Checking recommendations: ${analysis.recommendations?.length || 0} found`);
      
      if (analysis.recommendations && analysis.recommendations.length > 0) {
        console.log(`[AI Orchestrator] Getting users for recommendation logging...`);
        const users = await storage.getAllUsers();
        console.log(`[AI Orchestrator] Found ${users.length} users`);
        
        if (users.length > 0) {
          const adminUser = users.find(u => u.isAdmin) || users[0];
          console.log(`[AI Orchestrator] Using user ${adminUser.id} for recommendations`);
          
          for (const recommendation of analysis.recommendations) {
            try {
              const rec = recommendation as any;
              const recommendationText = typeof rec === 'string' ? rec : (rec.action || JSON.stringify(rec));
              const recUrgency = (typeof rec === 'object' && rec.urgencyLevel) ? rec.urgencyLevel : analysis.urgencyLevel;
              
              await storage.createOrchestratorLog({
                userId: adminUser.id,
                category: 'ai_insight',
                recommendation: recommendationText,
                urgencyLevel: recUrgency,
                status: 'pending',
                actionTaken: null,
                metadata: {
                  source: 'gpt4o_analysis',
                  timestamp: analysis.timestamp,
                  rationale: typeof rec === 'object' && rec ? rec.rationale : null
                }
              });
              
              console.log(`[AI Orchestrator] Created recommendation log: ${recommendationText.substring(0, 50)}...`);
            } catch (error) {
              console.error('[AI Orchestrator] Error creating recommendation log:', error);
            }
          }
          
          console.log(`[AI Orchestrator] Created ${analysis.recommendations.length} recommendation logs for approval`);
        }
      }

      return analysis;
    } catch (error: any) {
      console.error('[AI Orchestrator] Error analyzing with GPT:', error.message);
      return null;
    }
  }

  async getLatestTelemetry(): Promise<Telemetry | null> {
    try {
      const telemetryPath = path.join(process.cwd(), 'server/orchestrator/summaries/telemetry.json');
      const content = await fs.readFile(telemetryPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  async getLatestAnalysis(): Promise<OrchestratorAnalysis | null> {
    try {
      const logsDir = path.join(process.cwd(), 'server/orchestrator/logs');
      const files = await fs.readdir(logsDir);
      const analysisFiles = files.filter(f => f.startsWith('ai_analysis_'));
      
      if (analysisFiles.length === 0) return null;

      // Get most recent file
      analysisFiles.sort().reverse();
      const latestFile = analysisFiles[0];
      const content = await fs.readFile(path.join(logsDir, latestFile), 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  async triggerImmediateAnalysis(): Promise<void> {
    console.log('[AI Orchestrator] Manual diagnostic triggered');
    
    if (!this.openai) {
      console.warn('[AI Orchestrator] OpenAI API key not configured, skipping AI analysis');
      // Still generate telemetry without AI analysis
      await this.generateTelemetry();
      return;
    }
    
    await this.generateTelemetry();
  }
}

// Export singleton instance
export const aiOrchestrator = new AIOrchestrator();
