/**
 * Phase 9.6: Reasoning Bus
 * 
 * Extends Context Bridge for cross-domain agent communication.
 * Provides role-based routing and collaborative context sharing.
 */

import { contextBridge } from './context-bridge';

export interface ReasoningBusMessage {
  type: 'collaboration_update' | 'agent_contribution' | 'consensus_request' | 'domain_query';
  source: string; // Agent ID
  target?: string | string[]; // Specific agent(s) or undefined for broadcast
  sessionId?: string;
  payload: any;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  requiresResponse?: boolean;
}

export interface AgentRoute {
  agentId: string;
  capabilities: string[];
  priority: number;
}

class ReasoningBus {
  private agentRegistry: Map<string, AgentRoute>;

  constructor() {
    this.agentRegistry = new Map();
    this.initializeDefaultAgents();
  }

  /**
   * Initialize default domain agents
   */
  private initializeDefaultAgents(): void {
    const defaultAgents: AgentRoute[] = [
      {
        agentId: 'TradingBob',
        capabilities: ['market_analysis', 'risk_assessment', 'strategy_evaluation', 'portfolio_analysis'],
        priority: 10,
      },
      {
        agentId: 'DevOpsBob',
        capabilities: ['system_health', 'performance_monitoring', 'error_diagnosis', 'infrastructure'],
        priority: 8,
      },
      {
        agentId: 'UXBob',
        capabilities: ['user_experience', 'interface_design', 'accessibility', 'usability'],
        priority: 7,
      },
      {
        agentId: 'FullStackBob',
        capabilities: ['code_analysis', 'architecture', 'api_design', 'database_optimization'],
        priority: 8,
      },
    ];

    defaultAgents.forEach(agent => {
      this.agentRegistry.set(agent.agentId, agent);
    });

    console.log(`[ReasoningBus] ✅ Initialized with ${defaultAgents.length} domain agents`);
  }

  /**
   * Register a new agent
   */
  registerAgent(route: AgentRoute): void {
    this.agentRegistry.set(route.agentId, route);
    console.log(`[ReasoningBus] 📝 Registered agent: ${route.agentId} with capabilities: [${route.capabilities.join(', ')}]`);
  }

  /**
   * Broadcast message to agents via Context Bridge
   */
  async broadcast(message: ReasoningBusMessage, userId: string, mode: 'live' | 'paper' = 'paper'): Promise<void> {
    try {
      console.log(`[ReasoningBus] 📡 Broadcasting from ${message.source}: ${message.type}`);
      
      // Route through Context Bridge for real-time delivery
      await contextBridge.broadcast({
        type: 'state_update',
        userId,
        payload: {
          source: message.source,
          messageType: message.type,
          sessionId: message.sessionId,
          target: message.target,
          priority: message.priority || 'normal',
          data: message.payload,
          timestamp: new Date().toISOString(),
        },
      });

      console.log(`[ReasoningBus] ✅ Message broadcast to agents`);
    } catch (error: any) {
      console.error('[ReasoningBus] Failed to broadcast message:', error);
      throw error;
    }
  }

  /**
   * Send targeted message to specific agent(s)
   */
  async sendToAgent(
    targetAgentId: string | string[],
    message: Omit<ReasoningBusMessage, 'target'>,
    userId: string,
    mode: 'live' | 'paper' = 'paper'
  ): Promise<void> {
    try {
      const targets = Array.isArray(targetAgentId) ? targetAgentId : [targetAgentId];
      
      console.log(`[ReasoningBus] 🎯 Routing to agents: [${targets.join(', ')}]`);

      await this.broadcast(
        { ...message, target: targets },
        userId,
        mode
      );
    } catch (error: any) {
      console.error('[ReasoningBus] Failed to send to agent:', error);
      throw error;
    }
  }

  /**
   * Query agents by capability
   */
  queryAgentsByCapability(capability: string): AgentRoute[] {
    const matchingAgents: AgentRoute[] = [];
    
    for (const [agentId, route] of this.agentRegistry.entries()) {
      if (route.capabilities.includes(capability)) {
        matchingAgents.push(route);
      }
    }

    // Sort by priority (descending)
    matchingAgents.sort((a, b) => b.priority - a.priority);
    
    console.log(`[ReasoningBus] 🔍 Found ${matchingAgents.length} agents with capability: ${capability}`);
    
    return matchingAgents;
  }

  /**
   * Get agent information
   */
  getAgent(agentId: string): AgentRoute | undefined {
    return this.agentRegistry.get(agentId);
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): AgentRoute[] {
    return Array.from(this.agentRegistry.values());
  }

  /**
   * Request consensus from all agents in session
   */
  async requestConsensus(
    sessionId: string,
    participants: string[],
    proposedAction: any,
    userId: string,
    mode: 'live' | 'paper' = 'paper'
  ): Promise<void> {
    console.log(`[ReasoningBus] 🤝 Requesting consensus from ${participants.length} agents`);

    await this.broadcast(
      {
        type: 'consensus_request',
        source: 'CollaborationManager',
        sessionId,
        target: participants,
        payload: {
          action: proposedAction,
          requiresResponse: true,
        },
        priority: 'high',
        requiresResponse: true,
      },
      userId,
      mode
    );
  }

  /**
   * Notify session update
   */
  async notifySessionUpdate(
    sessionId: string,
    updateType: 'started' | 'message' | 'consensus' | 'ended',
    data: any,
    userId: string,
    mode: 'live' | 'paper' = 'paper'
  ): Promise<void> {
    console.log(`[ReasoningBus] 📢 Session ${sessionId} update: ${updateType}`);

    await this.broadcast(
      {
        type: 'collaboration_update',
        source: 'CollaborationManager',
        sessionId,
        payload: {
          updateType,
          data,
        },
        priority: 'normal',
      },
      userId,
      mode
    );
  }
}

// Singleton instance
export const reasoningBus = new ReasoningBus();
