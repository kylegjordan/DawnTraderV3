/**
 * Phase 8.6.1 - Conversational Context Manager
 * 
 * Maintains rolling 10-15 message dialogue context for natural conversations
 * Provides graceful expiration and state resumption from Cortex
 * 
 * Key Features:
 * - Fixed 10-15 message rolling window for conversation flow
 * - Automatic context expiration after 30 minutes of inactivity
 * - State resumption from Cortex when user returns
 * - Preserves conversation threads and topics
 */

import { storage } from '../storage';
import { contextRefreshCoordinator } from './context-refresh-coordinator';
import type { WalterChatLog } from '@shared/schema';

export interface ConversationalContext {
  messages: WalterChatLog[];
  topic?: string;
  lastActivity: Date;
  contextAge: number; // minutes since last message
  isExpired: boolean;
  resumedFromCortex: boolean;
}

export interface ContextExpirationConfig {
  maxIdleMinutes: number; // Default: 30
  gracefulTransitionMinutes: number; // Default: 20 (warn before full expiration)
}

export class ConversationalContextManager {
  private readonly MODULE_NAME = 'ConversationalContextManager';
  private readonly ROLLING_WINDOW_SIZE = 12; // Sweet spot: 10-15 messages
  private readonly DEFAULT_CONFIG: ContextExpirationConfig = {
    maxIdleMinutes: 30,
    gracefulTransitionMinutes: 20
  };
  
  /**
   * Get rolling conversational context (10-15 most recent messages)
   */
  async getRollingContext(chatId: string): Promise<ConversationalContext> {
    const allMessages = await storage.getWalterChatLogs(chatId, 100);
    
    // Get most recent messages for rolling window
    const recentMessages = allMessages.slice(-this.ROLLING_WINDOW_SIZE);
    
    // Calculate context age
    const lastMessage = recentMessages[recentMessages.length - 1];
    const now = new Date();
    const contextAge = lastMessage && lastMessage.timestamp
      ? Math.floor((now.getTime() - new Date(lastMessage.timestamp).getTime()) / 60000)
      : 0;
    
    // Determine if context is expired
    const isExpired = contextAge > this.DEFAULT_CONFIG.maxIdleMinutes;
    
    // Extract conversation topic from recent messages
    const topic = this.extractTopic(recentMessages);
    
    return {
      messages: recentMessages,
      topic,
      lastActivity: lastMessage && lastMessage.timestamp ? new Date(lastMessage.timestamp) : now,
      contextAge,
      isExpired,
      resumedFromCortex: false
    };
  }
  
  /**
   * Resume conversation with graceful state restoration
   */
  async resumeConversation(
    userId: string,
    chatId: string
  ): Promise<ConversationalContext> {
    console.log(`[${this.MODULE_NAME}] Resuming conversation for user ${userId}, chat ${chatId}`);
    
    // Get rolling context
    const context = await this.getRollingContext(chatId);
    
    // If context is expired, restore from Cortex
    if (context.isExpired) {
      console.log(`[${this.MODULE_NAME}] Context expired (${context.contextAge} min old), resuming from Cortex...`);
      return this.resumeFromCortex(userId, chatId, context);
    }
    
    // If approaching expiration, add graceful transition indicator
    if (context.contextAge > this.DEFAULT_CONFIG.gracefulTransitionMinutes) {
      const minutesUntilExpiration = this.DEFAULT_CONFIG.maxIdleMinutes - context.contextAge;
      console.log(
        `[${this.MODULE_NAME}] Context aging (${context.contextAge} min), ` +
        `${minutesUntilExpiration} min until expiration`
      );
    }
    
    return context;
  }
  
  /**
   * Resume from Cortex when context has expired
   */
  private async resumeFromCortex(
    userId: string,
    chatId: string,
    expiredContext: ConversationalContext
  ): Promise<ConversationalContext> {
    try {
      // Get user's trading mode
      const user = await storage.getUser(userId);
      const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';
      
      // Trigger ContextRefreshCoordinator to restore portfolio/strategy state
      console.log(`[${this.MODULE_NAME}] Triggering state restoration via ContextRefreshCoordinator...`);
      const refreshResult = await contextRefreshCoordinator.refresh(userId, mode, 'direct');
      
      if (!refreshResult.success) {
        console.warn(`[${this.MODULE_NAME}] State restoration failed: ${refreshResult.error}`);
      }
      
      // Get chat summary (if available)
      const chat = await storage.getWalterChatById(chatId);
      const hasSummary = chat && (chat as any).metadata?.summaries?.length > 0;
      
      // Restore context with fresh state
      const restoredContext: ConversationalContext = {
        messages: expiredContext.messages,
        topic: expiredContext.topic || 'Previous conversation',
        lastActivity: expiredContext.lastActivity,
        contextAge: expiredContext.contextAge,
        isExpired: false, // Context is now fresh after restoration
        resumedFromCortex: true
      };
      
      console.log(
        `[${this.MODULE_NAME}] ✅ Context restored after ${expiredContext.contextAge} min - ` +
        `Topic: "${restoredContext.topic}", ` +
        `State: ${refreshResult.success ? 'Refreshed' : 'Failed'}, ` +
        `Summary: ${hasSummary ? 'Available' : 'None'}`
      );
      
      return restoredContext;
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] Failed to resume context:`, error);
      // Return expired context as fallback
      return { ...expiredContext, resumedFromCortex: false };
    }
  }
  
  /**
   * Extract conversation topic from messages
   */
  private extractTopic(messages: WalterChatLog[]): string | undefined {
    if (messages.length === 0) return undefined;
    
    // Look for user messages with questions or topics
    const userMessages = messages.filter(m => m.role === 'user');
    
    if (userMessages.length === 0) return undefined;
    
    // Get most recent user message for topic extraction
    const recentUserMsg = userMessages[userMessages.length - 1];
    
    // Simple topic extraction based on keywords
    const content = recentUserMsg.content.toLowerCase();
    
    if (content.includes('strategy') || content.includes('strategies')) {
      return 'Trading Strategies';
    }
    if (content.includes('balance') || content.includes('portfolio')) {
      return 'Portfolio Management';
    }
    if (content.includes('risk') || content.includes('exposure')) {
      return 'Risk Management';
    }
    if (content.includes('trade') || content.includes('position')) {
      return 'Trade Analysis';
    }
    if (content.includes('settings') || content.includes('configure')) {
      return 'System Configuration';
    }
    
    // Default: truncate first user message as topic
    return recentUserMsg.content.substring(0, 50) + '...';
  }
  
  /**
   * Build context resumption prompt for Walter
   */
  buildResumptionPrompt(context: ConversationalContext): string {
    if (!context.isExpired) {
      return ''; // No resumption needed for active context
    }
    
    if (!context.resumedFromCortex) {
      return `\n\n[Context Note: This conversation has been inactive for ${context.contextAge} minutes. Some context may be limited.]`;
    }
    
    return `\n\n[Context Resumed from Cortex: Welcome back! It's been ${context.contextAge} minutes since our last conversation about "${context.topic || 'our discussion'}". I've restored your current portfolio state and strategy settings. Let's continue where we left off.]`;
  }
  
  /**
   * Format conversational context for AI prompt
   */
  formatContextForPrompt(context: ConversationalContext): string {
    const messageSummary = context.messages.map(m => 
      `${m.role === 'user' ? 'User' : 'Walter'}: ${m.content}`
    ).join('\n\n');
    
    let formattedContext = `--- Recent Conversation (${context.messages.length} messages) ---\n\n`;
    formattedContext += messageSummary;
    
    if (context.topic) {
      formattedContext += `\n\n[Current Topic: ${context.topic}]`;
    }
    
    if (context.isExpired && context.resumedFromCortex) {
      formattedContext += `\n\n[State: Resumed from Cortex after ${context.contextAge} min break]`;
    } else if (context.contextAge > this.DEFAULT_CONFIG.gracefulTransitionMinutes) {
      formattedContext += `\n\n[Context Age: ${context.contextAge} min - approaching expiration]`;
    }
    
    formattedContext += '\n\n---';
    
    return formattedContext;
  }
  
  /**
   * Check if context needs refresh
   */
  needsRefresh(context: ConversationalContext): boolean {
    // Refresh if expired or approaching expiration
    return context.isExpired || 
           context.contextAge > this.DEFAULT_CONFIG.gracefulTransitionMinutes;
  }
  
  /**
   * Get context statistics
   */
  getStats(context: ConversationalContext): {
    messageCount: number;
    contextAge: number;
    isExpired: boolean;
    topic: string | undefined;
    healthStatus: 'active' | 'aging' | 'expired';
  } {
    let healthStatus: 'active' | 'aging' | 'expired';
    
    if (context.isExpired) {
      healthStatus = 'expired';
    } else if (context.contextAge > this.DEFAULT_CONFIG.gracefulTransitionMinutes) {
      healthStatus = 'aging';
    } else {
      healthStatus = 'active';
    }
    
    return {
      messageCount: context.messages.length,
      contextAge: context.contextAge,
      isExpired: context.isExpired,
      topic: context.topic,
      healthStatus
    };
  }
}

export const conversationalContextManager = new ConversationalContextManager();
