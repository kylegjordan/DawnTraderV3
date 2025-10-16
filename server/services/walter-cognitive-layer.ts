/**
 * Phase 8.6 - Cognitive Reasoning Layer
 * 
 * Provides Walter with conversational intelligence, reasoning, and tone control
 * - Reflects user intent before responding
 * - Offers strategic options and implications
 * - Maintains tone profiles (Technical, Conversational, Advisory)
 * - Never executes trades directly - routes through Intent Gateway
 */

import { storage } from '../storage';
import { intentGateway, type OperationalCommand } from './walter-intent-gateway';

export type ToneProfile = 'technical' | 'conversational' | 'advisory';

export interface TonePreferences {
  profile: ToneProfile;
  verbosity: 'concise' | 'moderate' | 'detailed';
  includeMetrics: boolean;
  includeOptions: boolean;
}

export interface CognitiveResponse {
  intentReflection: string; // What Walter understood
  mainResponse: string; // Direct answer
  strategicOptions?: string[]; // 1-2 options or implications
  followUpQuestion?: string; // Keep dialogue active
  toneUsed: ToneProfile;
  metadata: {
    cognitiveProcessing: boolean;
    riskAssessment?: string;
    dataSource: string;
  };
}

export interface ReasoningContext {
  userIntent: string;
  currentMode: 'live' | 'paper';
  portfolioBalance: number;
  activeStrategies: string[];
  recentActions: string[];
  userRole: string;
}

export class WalterCognitiveLayer {
  private readonly MODULE_NAME = 'CognitiveLayer';
  
  // Phase 8.6.1: Permanent conversational mode with temporary overrides
  private userTonePreferences: Map<string, TonePreferences> = new Map();
  private temporaryToneOverrides: Map<string, { profile: ToneProfile; expiresAt: Date }> = new Map();
  
  // Phase 8.6.4 Addendum B: Cognitive Retraining Map
  // Immutable authoritative schema bindings for goals, strategies, and balances
  private readonly RETRAINING_MAP: Readonly<{
    goals: { live: string; paper: string };
    strategies: { table: string; globalContextId: string };
    balances: { table: string };
    frozen: boolean;
  }> = Object.freeze({
    goals: {
      live: 'user_goals_live',
      paper: 'user_goals_paper'
    },
    strategies: {
      table: 'strategy_settings',
      globalContextId: 'global_context_id'
    },
    balances: {
      table: 'portfolio_state'
    },
    frozen: true
  });
  
  constructor() {
    console.log(`[${this.MODULE_NAME}] [LearningAlignment] Cognitive source map loaded and frozen.`);
    console.log(`[${this.MODULE_NAME}] Authoritative bindings:`);
    console.log(`  - Goals (live): ${this.RETRAINING_MAP.goals.live}`);
    console.log(`  - Goals (paper): ${this.RETRAINING_MAP.goals.paper}`);
    console.log(`  - Strategies: ${this.RETRAINING_MAP.strategies.table} (${this.RETRAINING_MAP.strategies.globalContextId})`);
    console.log(`  - Balances: ${this.RETRAINING_MAP.balances.table}`);
    console.log(`  - Status: FROZEN=${this.RETRAINING_MAP.frozen}`);
  }
  
  /**
   * Get authoritative table name for a given data domain and mode
   */
  getAuthoritativeSource(domain: 'goals' | 'strategies' | 'balances', mode?: 'live' | 'paper'): string {
    switch (domain) {
      case 'goals':
        if (!mode) throw new Error('Mode required for goals domain');
        return mode === 'live' ? this.RETRAINING_MAP.goals.live : this.RETRAINING_MAP.goals.paper;
      case 'strategies':
        return this.RETRAINING_MAP.strategies.table;
      case 'balances':
        return this.RETRAINING_MAP.balances.table;
      default:
        throw new Error(`Unknown domain: ${domain}`);
    }
  }
  
  /**
   * Verify if a source table is authoritative
   */
  isAuthoritativeSource(sourceTable: string): boolean {
    const authoritativeTables = [
      this.RETRAINING_MAP.goals.live,
      this.RETRAINING_MAP.goals.paper,
      this.RETRAINING_MAP.strategies.table,
      this.RETRAINING_MAP.balances.table
    ];
    return authoritativeTables.includes(sourceTable);
  }
  
  /**
   * Get the complete retraining map (read-only)
   */
  getRetrainingMap() {
    return this.RETRAINING_MAP;
  }

  /**
   * Phase 8.6.1: Set temporary tone override (auto-reverts after one response)
   */
  setTemporaryToneOverride(userId: string, profile: ToneProfile): void {
    this.temporaryToneOverrides.set(userId, {
      profile,
      expiresAt: new Date(Date.now() + 60000) // Expires in 1 minute
    });
    console.log(`[${this.MODULE_NAME}] User ${userId} temporary tone override: ${profile} (auto-reverts to conversational)`);
  }

  /**
   * Phase 8.6.1: Get current tone (checks for temporary override first)
   */
  getTonePreference(userId: string): TonePreferences {
    // Check for temporary override
    const tempOverride = this.temporaryToneOverrides.get(userId);
    if (tempOverride && tempOverride.expiresAt > new Date()) {
      return {
        profile: tempOverride.profile,
        verbosity: 'moderate',
        includeMetrics: true,
        includeOptions: true
      };
    }
    
    // Clear expired override
    if (tempOverride) {
      this.temporaryToneOverrides.delete(userId);
    }
    
    // Always default to conversational (Phase 8.6.1)
    return this.getDefaultTonePreferences();
  }

  /**
   * Phase 8.6.1: Clear temporary override (called after response sent)
   */
  clearTemporaryOverride(userId: string): void {
    this.temporaryToneOverrides.delete(userId);
    console.log(`[${this.MODULE_NAME}] User ${userId} reverted to conversational mode`);
  }

  /**
   * Phase 8.6.1: Default is always Conversational + Analytical + Advisory
   */
  private getDefaultTonePreferences(): TonePreferences {
    return {
      profile: 'conversational', // Permanent default
      verbosity: 'moderate',
      includeMetrics: true,
      includeOptions: true
    };
  }

  /**
   * Process user message with cognitive reasoning
   */
  async processMessage(
    userId: string,
    userMessage: string,
    context: ReasoningContext
  ): Promise<CognitiveResponse> {
    console.log(`[${this.MODULE_NAME}] Processing message for user ${userId}`);

    const tonePrefs = this.getTonePreference(userId);

    // Step 1: Reflect user intent
    const intentReflection = await this.reflectIntent(userMessage, context);

    // Step 2: Check if this is a command that needs validation
    const command = await this.extractCommand(userMessage, context);
    
    if (command) {
      const validation = await intentGateway.validateIntent(userId, userMessage, command);
      
      if (!validation.canExecute) {
        return this.buildBlockedResponse(
          intentReflection,
          validation.reason || 'Command not authorized',
          tonePrefs.profile,
          validation.requiresApproval
        );
      }
    }

    // Step 3: Build response based on tone profile
    const response = await this.buildCognitiveResponse(
      intentReflection,
      userMessage,
      context,
      tonePrefs
    );

    return response;
  }

  /**
   * Reflect what Walter understood from the user's intent
   */
  private async reflectIntent(
    userMessage: string,
    context: ReasoningContext
  ): Promise<string> {
    const msg = userMessage.toLowerCase();

    // Pattern matching for common intents
    if (msg.includes('balance') || msg.includes('portfolio')) {
      return `You're checking your ${context.currentMode} mode portfolio balance`;
    }

    if (msg.includes('strategies') || msg.includes('strategy')) {
      if (msg.includes('enable') || msg.includes('disable') || msg.includes('toggle')) {
        return `You want to modify strategy settings in ${context.currentMode} mode`;
      }
      return `You're reviewing your active strategies in ${context.currentMode} mode`;
    }

    if (msg.includes('risk') || msg.includes('exposure')) {
      return `You're exploring risk parameters in ${context.currentMode} mode`;
    }

    if (msg.includes('switch') || msg.includes('change mode')) {
      const targetMode = context.currentMode === 'live' ? 'paper' : 'live';
      return `You want to switch from ${context.currentMode} to ${targetMode} mode`;
    }

    if (msg.includes('trade') || msg.includes('position')) {
      return `You're inquiring about trading activity in ${context.currentMode} mode`;
    }

    // Default reflection
    return `You're asking about: "${userMessage.substring(0, 60)}${userMessage.length > 60 ? '...' : ''}"`;
  }

  /**
   * Extract operational command if present
   */
  private async extractCommand(
    userMessage: string,
    context: ReasoningContext
  ): Promise<OperationalCommand | null> {
    const msg = userMessage.toLowerCase();

    // Trade commands
    if (msg.includes('buy') || msg.includes('sell') || msg.includes('close position')) {
      return {
        type: 'trade',
        action: 'execute_trade',
        parameters: { message: userMessage },
        mode: context.currentMode,
        requestedBy: context.userRole
      };
    }

    // Strategy commands
    if (msg.includes('enable') || msg.includes('disable') || msg.includes('toggle')) {
      if (msg.includes('strategy') || msg.includes('strategies')) {
        return {
          type: 'strategy',
          action: 'modify_strategy',
          parameters: { message: userMessage },
          mode: context.currentMode,
          requestedBy: context.userRole
        };
      }
    }

    // Risk commands
    if (msg.includes('risk per trade') || msg.includes('exposure') || msg.includes('kill switch')) {
      return {
        type: 'risk',
        action: 'modify_risk_parameters',
        parameters: { message: userMessage },
        mode: context.currentMode,
        requestedBy: context.userRole
      };
    }

    // System commands
    if (msg.includes('restart') || msg.includes('reset') || msg.includes('shutdown')) {
      return {
        type: 'system',
        action: 'system_control',
        parameters: { message: userMessage },
        mode: context.currentMode,
        requestedBy: context.userRole
      };
    }

    return null;
  }

  /**
   * Build cognitive response based on tone profile
   */
  private async buildCognitiveResponse(
    intentReflection: string,
    userMessage: string,
    context: ReasoningContext,
    tonePrefs: TonePreferences
  ): Promise<CognitiveResponse> {
    
    // This will be enhanced with actual data fetching
    const mainResponse = this.formatResponseForTone(
      `Based on your ${context.currentMode} mode settings, your portfolio balance is $${context.portfolioBalance.toFixed(2)}. You have ${context.activeStrategies.length} active strategies.`,
      tonePrefs.profile
    );

    const strategicOptions = tonePrefs.includeOptions ? 
      this.generateStrategicOptions(userMessage, context) : undefined;

    const followUpQuestion = this.generateFollowUp(userMessage, context);

    return {
      intentReflection,
      mainResponse,
      strategicOptions,
      followUpQuestion,
      toneUsed: tonePrefs.profile,
      metadata: {
        cognitiveProcessing: true,
        dataSource: 'live-api',
      }
    };
  }

  /**
   * Format response according to tone profile
   */
  private formatResponseForTone(content: string, tone: ToneProfile): string {
    switch (tone) {
      case 'technical':
        return `📊 ${content}`;
      
      case 'conversational':
        return content;
      
      case 'advisory':
        return `Let's think through this: ${content}`;
      
      default:
        return content;
    }
  }

  /**
   * Generate strategic options or implications
   */
  private generateStrategicOptions(
    userMessage: string,
    context: ReasoningContext
  ): string[] | undefined {
    const msg = userMessage.toLowerCase();

    if (msg.includes('balance') || msg.includes('portfolio')) {
      return [
        `You could adjust risk per trade to increase/decrease position sizes`,
        `Consider comparing this with your ${context.currentMode === 'live' ? 'paper' : 'live'} mode performance`
      ];
    }

    if (msg.includes('strategies')) {
      return [
        `You might want to review individual strategy performance before making changes`,
        `Consider testing strategy changes in paper mode first`
      ];
    }

    return undefined;
  }

  /**
   * Generate follow-up question to keep dialogue active
   */
  private generateFollowUp(
    userMessage: string,
    context: ReasoningContext
  ): string | undefined {
    const msg = userMessage.toLowerCase();

    if (msg.includes('balance')) {
      return `Would you like to see your performance breakdown or active trades?`;
    }

    if (msg.includes('strategies')) {
      return `Would you like to dive into the performance of a specific strategy?`;
    }

    if (msg.includes('risk')) {
      return `Want to compare risk settings between live and paper modes?`;
    }

    return `What else would you like to know about your ${context.currentMode} mode setup?`;
  }

  /**
   * Build response for blocked commands
   */
  private buildBlockedResponse(
    intentReflection: string,
    reason: string,
    tone: ToneProfile,
    requiresApproval?: boolean
  ): CognitiveResponse {
    const mainResponse = requiresApproval
      ? `This action requires owner approval. ${reason}`
      : `I can't complete that action. ${reason}`;

    return {
      intentReflection,
      mainResponse: this.formatResponseForTone(mainResponse, tone),
      strategicOptions: [
        'You can try this action in paper mode to test it first',
        'Check your account permissions or contact the account owner'
      ],
      followUpQuestion: 'Would you like to try a different approach?',
      toneUsed: tone,
      metadata: {
        cognitiveProcessing: true,
        riskAssessment: 'blocked',
        dataSource: 'security-gate'
      }
    };
  }

  /**
   * Phase 8.6.1: Handle temporary tone override (auto-reverts after one response)
   */
  async handleToneChange(
    userId: string,
    userMessage: string
  ): Promise<{ changed: boolean; newTone?: ToneProfile; message: string }> {
    const msg = userMessage.toLowerCase();

    if (msg.includes('technical') || msg.includes('go technical')) {
      this.setTemporaryToneOverride(userId, 'technical');
      return {
        changed: true,
        newTone: 'technical',
        message: '📊 Temporarily switching to technical mode for this response. (Auto-reverts to conversational after reply)'
      };
    }

    if (msg.includes('conversational') || msg.includes('simplify') || msg.includes('casual')) {
      // Already conversational by default, just acknowledge
      return {
        changed: true,
        newTone: 'conversational',
        message: 'Already in conversational mode - I explain things in everyday language by default.'
      };
    }

    if (msg.includes('advisory') || msg.includes('strategic')) {
      this.setTemporaryToneOverride(userId, 'advisory');
      return {
        changed: true,
        newTone: 'advisory',
        message: '🎯 Temporarily switching to advisory mode for this response. (Auto-reverts to conversational after reply)'
      };
    }

    return {
      changed: false,
      message: 'I support three tones: Technical, Conversational (default), and Advisory. Which would you prefer?'
    };
  }
}

// Singleton instance
export const cognitiveLayer = new WalterCognitiveLayer();
