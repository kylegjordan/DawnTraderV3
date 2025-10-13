import { storage } from '../storage';
import type { InsertTrade, WalterChatLog } from '@shared/schema';

interface ConversationEntity {
  type: 'file' | 'trade' | 'strategy' | 'setting' | 'report' | 'opportunity';
  id: string;
  name: string;
  metadata: any;
  mentionedAt: Date;
  messageId?: string;
}

interface ResolvedReference {
  found: boolean;
  type?: string;
  entity?: ConversationEntity;
  contextText?: string;
}

/**
 * Reference Tracker Service
 * Enables Walter to understand contextual references like:
 * - "that one", "the last trade", "the file I sent"
 * - "the strategy we discussed", "that report"
 * Phase 6.2 - Conversational Intelligence (Part 1)
 */
export class ReferenceTrackerService {
  /**
   * Extract entities mentioned in recent conversation
   */
  async extractEntitiesFromChat(
    userId: string,
    chatId: string,
    recentMessages: WalterChatLog[]
  ): Promise<ConversationEntity[]> {
    const entities: ConversationEntity[] = [];

    // Extract entities from message content
    for (const msg of recentMessages) {
      const content = msg.content.toLowerCase();
      
      // Extract file uploads from chat logs (format: "File uploaded: filename")
      if (content.includes('file uploaded:')) {
        const fileMatch = msg.content.match(/File uploaded: (.+?)(?:\n|Type:|$)/);
        if (fileMatch) {
          entities.push({
            type: 'file',
            id: `file-${msg.id}`,
            name: fileMatch[1].trim(),
            metadata: { source: 'upload', content: msg.content },
            mentionedAt: new Date(msg.timestamp || Date.now()),
            messageId: msg.id
          });
        }
      }
      
      // Detect trade references
      if (content.match(/trade|position|order/i)) {
        const trades = await this.extractTradeReferences(userId, msg);
        entities.push(...trades);
      }

      // Detect strategy references
      if (content.match(/strategy|vwap|abcd|sma|breakout|mean reversion|range|liquidity/i)) {
        const strategies = this.extractStrategyReferences(msg);
        entities.push(...strategies);
      }

      // Detect report references
      if (content.match(/report|analysis|brief|diagnostic/i)) {
        const reports = await this.extractReportReferences(userId, msg);
        entities.push(...reports);
      }

      // Detect setting references
      if (content.match(/setting|configure|risk|parameter|guardrail/i)) {
        const settings = this.extractSettingReferences(msg);
        entities.push(...settings);
      }
    }

    // Sort by mention time (most recent first)
    return entities.sort((a, b) => b.mentionedAt.getTime() - a.mentionedAt.getTime());
  }

  /**
   * Resolve ambiguous reference to specific entity
   */
  async resolveReference(
    userMessage: string,
    entities: ConversationEntity[],
    userId: string
  ): Promise<ResolvedReference> {
    const msg = userMessage.toLowerCase();

    // Pattern: "that one", "this one", "the one"
    if (msg.match(/\b(that|this|the)\s+(one|thing|item)\b/i)) {
      const mostRecent = entities[0];
      if (mostRecent) {
        return {
          found: true,
          type: mostRecent.type,
          entity: mostRecent,
          contextText: `Referring to: ${mostRecent.name} (${mostRecent.type})`
        };
      }
    }

    // Pattern: "the last trade", "my last position"
    if (msg.match(/\b(last|latest|recent|previous)\s+(trade|position|order)\b/i)) {
      const lastTrade = entities.find(e => e.type === 'trade');
      if (lastTrade) {
        return {
          found: true,
          type: 'trade',
          entity: lastTrade,
          contextText: `Referring to last trade: ${lastTrade.name}`
        };
      }

      // Note: Skip database fetch for now, rely on chat history
      // Future: Implement storage.getRecentTrades(userId, limit)
    }

    // Pattern: "the file I sent", "the document", "that PDF"
    if (msg.match(/\b(file|document|pdf|csv|image|screenshot)\b/i) || msg.match(/\bI\s+(sent|uploaded|shared)\b/i)) {
      const lastFile = entities.find(e => e.type === 'file');
      if (lastFile) {
        return {
          found: true,
          type: 'file',
          entity: lastFile,
          contextText: `Referring to file: ${lastFile.name}`
        };
      }
    }

    // Pattern: "the strategy", "that strategy"
    if (msg.match(/\b(that|this|the)\s+strategy\b/i)) {
      const lastStrategy = entities.find(e => e.type === 'strategy');
      if (lastStrategy) {
        return {
          found: true,
          type: 'strategy',
          entity: lastStrategy,
          contextText: `Referring to strategy: ${lastStrategy.name}`
        };
      }
    }

    // Pattern: "the report", "that analysis"
    if (msg.match(/\b(that|this|the)\s+(report|analysis|brief)\b/i)) {
      const lastReport = entities.find(e => e.type === 'report');
      if (lastReport) {
        return {
          found: true,
          type: 'report',
          entity: lastReport,
          contextText: `Referring to report: ${lastReport.name}`
        };
      }
    }

    // No reference found
    return { found: false };
  }

  /**
   * Build context text for prompt injection
   */
  buildReferenceContext(resolved: ResolvedReference): string {
    if (!resolved.found || !resolved.entity) {
      return '';
    }

    const { entity } = resolved;
    let context = `\n--- Conversation Reference ---\n`;
    context += `The user is referring to: ${entity.name} (${entity.type})\n`;

    switch (entity.type) {
      case 'file':
        context += `File: ${entity.name}\n`;
        if (entity.metadata?.content) {
          context += `Content preview: ${entity.metadata.content.substring(0, 200)}...\n`;
        }
        break;

      case 'trade':
        context += `Trade: ${entity.metadata?.symbol || entity.name}\n`;
        context += `Type: ${entity.metadata?.type}\n`;
        context += `Entry: $${entity.metadata?.entryPrice}\n`;
        context += `Status: ${entity.metadata?.status}\n`;
        break;

      case 'strategy':
        context += `Strategy: ${entity.name}\n`;
        context += `Status: ${entity.metadata?.enabled ? 'Enabled' : 'Disabled'}\n`;
        break;

      case 'report':
        context += `Report: ${entity.name}\n`;
        context += `Type: ${entity.metadata?.type}\n`;
        break;

      case 'setting':
        context += `Setting: ${entity.name}\n`;
        context += `Value: ${entity.metadata?.value}\n`;
        break;
    }

    context += `--- End Reference ---\n`;
    return context;
  }

  /**
   * Extract trade references from message
   */
  private async extractTradeReferences(userId: string, msg: WalterChatLog): Promise<ConversationEntity[]> {
    const entities: ConversationEntity[] = [];
    
    // Look for specific trade symbols (BTC, ETH, etc.)
    const symbolMatch = msg.content.match(/\b(BTC|ETH|SOL|ADA|DOT|LINK|MATIC|XRP|DOGE)\/?(USD|USDT)?\b/gi);
    if (symbolMatch) {
      for (const symbol of symbolMatch) {
        const normalizedSymbol = symbol.includes('/') ? symbol : symbol + '/USD';
        
        entities.push({
          type: 'trade',
          id: `trade-${normalizedSymbol}-${Date.now()}`,
          name: normalizedSymbol,
          metadata: { symbol: normalizedSymbol, mentioned: true },
          mentionedAt: new Date(msg.timestamp || Date.now()),
          messageId: msg.id
        });
      }
    }

    return entities;
  }

  /**
   * Extract strategy references from message
   */
  private extractStrategyReferences(msg: WalterChatLog): ConversationEntity[] {
    const entities: ConversationEntity[] = [];
    
    const strategyPatterns = [
      { pattern: /vwap\s*pullback/i, name: 'VWAP Pullback', id: 'vwap_pullback' },
      { pattern: /vwap\s*bounce/i, name: 'VWAP Bounce', id: 'vwap_bounce' },
      { pattern: /abcd\s*long/i, name: 'ABCD Long', id: 'abcd_long' },
      { pattern: /sma\s*trend/i, name: 'SMA Trend Ride', id: 'sma_trend_ride' },
      { pattern: /breakout/i, name: 'Breakout', id: 'breakout' },
      { pattern: /mean\s*reversion/i, name: 'Mean Reversion', id: 'mean_reversion' },
      { pattern: /range\s*trading/i, name: 'Range Trading', id: 'range_trading' },
      { pattern: /liquidity\s*trap/i, name: 'Liquidity Trap', id: 'liquidity_trap' }
    ];

    for (const { pattern, name, id } of strategyPatterns) {
      if (pattern.test(msg.content)) {
        entities.push({
          type: 'strategy',
          id,
          name,
          metadata: { strategyId: id },
          mentionedAt: new Date(msg.timestamp || Date.now()),
          messageId: msg.id
        });
      }
    }

    return entities;
  }

  /**
   * Extract report references from message  
   */
  private async extractReportReferences(userId: string, msg: WalterChatLog): Promise<ConversationEntity[]> {
    const entities: ConversationEntity[] = [];
    
    const reportTypes = [
      { pattern: /daily\s*brief/i, name: 'Daily Brief', type: 'daily_brief' },
      { pattern: /diagnostic\s*(report)?/i, name: 'Diagnostic Report', type: 'diagnostic' },
      { pattern: /ai\s*(analysis|report)/i, name: 'AI Analysis', type: 'ai_analysis' },
      { pattern: /performance\s*report/i, name: 'Performance Report', type: 'performance' }
    ];

    for (const { pattern, name, type } of reportTypes) {
      if (pattern.test(msg.content)) {
        entities.push({
          type: 'report',
          id: `report-${type}-${Date.now()}`,
          name,
          metadata: { reportType: type },
          mentionedAt: new Date(msg.timestamp || Date.now()),
          messageId: msg.id
        });
      }
    }

    return entities;
  }

  /**
   * Extract setting references from message
   */
  private extractSettingReferences(msg: WalterChatLog): ConversationEntity[] {
    const entities: ConversationEntity[] = [];
    
    const settingPatterns = [
      { pattern: /risk\s*per\s*trade/i, name: 'Risk Per Trade', id: 'riskPerTrade' },
      { pattern: /max\s*exposure/i, name: 'Max Exposure', id: 'maxExposure' },
      { pattern: /daily\s*loss\s*(kill\s*switch)?/i, name: 'Daily Loss Kill Switch', id: 'dailyLossKillSwitch' },
      { pattern: /stop\s*loss/i, name: 'Stop Loss', id: 'stopLoss' },
      { pattern: /slippage/i, name: 'Slippage Tolerance', id: 'slippage' }
    ];

    for (const { pattern, name, id } of settingPatterns) {
      if (pattern.test(msg.content)) {
        entities.push({
          type: 'setting',
          id,
          name,
          metadata: { settingId: id },
          mentionedAt: new Date(msg.timestamp || Date.now()),
          messageId: msg.id
        });
      }
    }

    return entities;
  }
}

export const referenceTracker = new ReferenceTrackerService();
