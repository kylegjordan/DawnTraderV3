import { z } from 'zod';

export type IntentType = 'configuration' | 'status' | 'analysis' | 'action' | 'conversation';

export interface ParsedIntent {
  type: IntentType;
  action?: string;
  entity?: string;
  parameters: {
    pairs?: string[];
    risk?: number;
    riskPercent?: number;
    timeframe?: string;
    targets?: number[];
    strategyName?: string;
    settingName?: string;
    settingValue?: string | number | boolean;
    tradeId?: number;
    mode?: 'live' | 'paper';
    command?: string;
  };
  rawInput: string;
  confidence: number;
  requiresConfirmation: boolean;
}

interface IntentPattern {
  type: IntentType;
  action?: string;
  entity?: string;
  patterns: RegExp[];
  extractParams?: (match: RegExpMatchArray, input: string) => Record<string, any>;
  requiresConfirmation?: boolean;
}

const intentPatterns: IntentPattern[] = [
  // Trading Control Actions
  {
    type: 'action',
    action: 'pause',
    entity: 'trading',
    patterns: [
      /(?:pause|stop|halt)\s+(?:the\s+)?trading/i,
      /(?:pause|stop|halt)\s+(?:all\s+)?(?:trades|positions)/i,
    ],
    requiresConfirmation: true,
  },
  {
    type: 'action',
    action: 'resume',
    entity: 'trading',
    patterns: [
      /(?:resume|start|continue)\s+(?:the\s+)?trading/i,
      /(?:resume|start|continue)\s+(?:all\s+)?(?:trades|positions)/i,
    ],
    requiresConfirmation: true,
  },
  {
    type: 'action',
    action: 'close',
    entity: 'position',
    patterns: [
      /close\s+(?:the\s+)?(?:position|trade)(?:\s+for\s+)?([A-Z]{3,10})?/i,
      /close\s+([A-Z]{3,10}(?:USD|EUR|BTC)?)\s+(?:position|trade)?/i,
      /exit\s+(?:the\s+)?(?:position|trade)(?:\s+for\s+)?([A-Z]{3,10})?/i,
      /exit\s+([A-Z]{3,10}(?:USD|EUR|BTC)?)\s+(?:position|trade)?/i,
    ],
    extractParams: (match) => ({
      pairs: match[1] ? [match[1].toUpperCase()] : undefined,
    }),
    requiresConfirmation: true,
  },

  // Risk Configuration
  {
    type: 'configuration',
    action: 'update',
    entity: 'risk',
    patterns: [
      /(?:set|change|update|increase|decrease)\s+(?:the\s+)?risk\s+(?:to\s+)?(?:\$)?(\d+(?:\.\d+)?)\s*(%|percent|dollars?)?/i,
      /(?:set|change|update|increase|decrease)\s+([A-Z]{3,10})\s+risk\s+(?:to\s+)?(?:\$)?(\d+(?:\.\d+)?)\s*(%|percent|dollars?)?/i,
    ],
    extractParams: (match) => {
      const hasSymbol = match[2] && match[3];
      const value = parseFloat(hasSymbol ? match[2] : match[1]);
      const unit = hasSymbol ? match[3] : match[2];
      
      return {
        pairs: hasSymbol ? [match[1].toUpperCase()] : undefined,
        ...(unit?.match(/%|percent/i) ? { riskPercent: value } : { risk: value }),
      };
    },
    requiresConfirmation: true,
  },
  {
    type: 'configuration',
    action: 'update',
    entity: 'max_exposure',
    patterns: [
      /(?:set|change|update)\s+(?:the\s+)?(?:max(?:imum)?\s+)?exposure\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%?/i,
    ],
    extractParams: (match) => ({
      settingName: 'maxExposurePercent',
      settingValue: parseFloat(match[1]),
    }),
    requiresConfirmation: true,
  },
  {
    type: 'configuration',
    action: 'update',
    entity: 'max_trades',
    patterns: [
      /(?:set|change|update)\s+(?:the\s+)?(?:max(?:imum)?\s+)?(?:open\s+)?trades?\s+(?:to\s+)?(\d+)/i,
    ],
    extractParams: (match) => ({
      settingName: 'maxOpenTrades',
      settingValue: parseInt(match[1]),
    }),
    requiresConfirmation: true,
  },

  // Strategy Configuration
  {
    type: 'configuration',
    action: 'enable',
    entity: 'strategy',
    patterns: [
      /(?:enable|turn\s+on|activate)\s+(?:the\s+)?([a-z_]+)\s+strategy/i,
      /(?:enable|turn\s+on|activate)\s+([a-z_]+)/i,
    ],
    extractParams: (match) => ({
      strategyName: match[1].toLowerCase().replace(/\s+/g, '_'),
    }),
    requiresConfirmation: true,
  },
  {
    type: 'configuration',
    action: 'disable',
    entity: 'strategy',
    patterns: [
      /(?:disable|turn\s+off|deactivate)\s+(?:the\s+)?([a-z_]+)\s+strategy/i,
      /(?:disable|turn\s+off|deactivate)\s+([a-z_]+)/i,
    ],
    extractParams: (match) => ({
      strategyName: match[1].toLowerCase().replace(/\s+/g, '_'),
    }),
    requiresConfirmation: true,
  },

  // Status Queries
  {
    type: 'status',
    action: 'get',
    entity: 'trading',
    patterns: [
      /(?:what(?:'s| is)|show|get|display)\s+(?:the\s+)?(?:trading\s+)?status/i,
      /(?:what(?:'s| is))\s+(?:my|the|our)\s+trading\s+status/i,
      /is\s+trading\s+(?:active|running|paused|stopped)/i,
      /are\s+we\s+trading/i,
    ],
  },
  {
    type: 'status',
    action: 'get',
    entity: 'positions',
    patterns: [
      /(?:what|show|list)\s+(?:are\s+)?(?:my|the|our)\s+(?:open\s+)?(?:positions|trades)/i,
      /(?:what|show|list)\s+(?:positions|trades)\s+(?:are\s+)?(?:open|active)/i,
    ],
  },
  {
    type: 'status',
    action: 'get',
    entity: 'performance',
    patterns: [
      /(?:what|show|display)\s+(?:is\s+)?(?:my|the|our)\s+(?:trading\s+)?performance/i,
      /(?:what|how)\s+(?:is|are)\s+(?:my|the|our)\s+(?:returns|profit|earnings)/i,
    ],
  },
  {
    type: 'status',
    action: 'get',
    entity: 'settings',
    patterns: [
      /(?:what|show|display)\s+(?:are\s+)?(?:my|the|our)\s+(?:current\s+)?(?:settings|configuration)/i,
      /(?:what|show)\s+(?:is\s+)?(?:my|the)\s+(?:risk|exposure|max\s+trades)/i,
    ],
  },

  // Analysis Requests
  {
    type: 'analysis',
    action: 'explain',
    entity: 'trade',
    patterns: [
      /(?:why|explain|show\s+reasoning)\s+(?:did\s+)?(?:you|we)\s+(?:take|enter|make)\s+(?:the\s+)?(?:last\s+)?trade/i,
      /(?:show|explain)\s+(?:the\s+)?reasoning\s+(?:for|behind)\s+(?:the\s+)?(?:last\s+)?trade/i,
      /(?:what|why)\s+(?:was\s+)?(?:the\s+)?(?:last\s+)?trade(?:\s+reasoning)?/i,
    ],
  },
  {
    type: 'analysis',
    action: 'analyze',
    entity: 'pair',
    patterns: [
      /(?:analyze|check|look\s+at|evaluate)\s+([A-Z]{3,10}(?:USD|EUR|BTC)?)/i,
      /(?:what|how)\s+(?:about|is)\s+([A-Z]{3,10}(?:USD|EUR|BTC)?)/i,
    ],
    extractParams: (match) => ({
      pairs: [match[1].toUpperCase()],
    }),
  },
  {
    type: 'analysis',
    action: 'analyze',
    entity: 'market',
    patterns: [
      /(?:analyze|check|look\s+at)\s+(?:the\s+)?market/i,
      /(?:what|how)\s+(?:is|are)\s+(?:the\s+)?market\s+(?:conditions|looking)/i,
    ],
  },

  // Mode Switching
  {
    type: 'action',
    action: 'switch',
    entity: 'mode',
    patterns: [
      /(?:switch|change)\s+to\s+(live|paper)\s+(?:mode|trading)/i,
      /(?:enable|start|activate)\s+(live|paper)\s+(?:mode|trading)/i,
    ],
    extractParams: (match) => ({
      mode: match[1].toLowerCase() as 'live' | 'paper',
    }),
    requiresConfirmation: true,
  },

  // Learning/Feedback
  {
    type: 'action',
    action: 'learn',
    entity: 'feedback',
    patterns: [
      /(?:that\s+(?:was|is)\s+)?(?:good|great|excellent|perfect)/i,
      /(?:that\s+(?:was|is)\s+)?(?:bad|wrong|incorrect|poor)/i,
    ],
  },
];

/**
 * Phase 7.1c Deliverable 2: Pronoun + Stop-Word Shield
 * Prevents false positive command intents for conversational questions
 */
const CONVERSATION_PRONOUNS = ['i', 'you', 'your', 'my', 'mine', 'me', 'our', 'ours', 'we', 'us'];
const CONVERSATION_VERBS = ['tell', 'show', 'explain', 'describe'];
const LINKING_VERBS = ['is', 'are', 'was', 'were', 'be', 'mean', 'purpose'];

function isConversationalQuery(input: string): boolean {
  const lowerInput = input.toLowerCase();
  const words = lowerInput.split(/\s+/);
  
  // Check for pronoun + linking verb combinations (e.g., "what is your purpose")
  for (let i = 0; i < words.length - 1; i++) {
    const currentWord = words[i];
    const nextWord = words[i + 1];
    
    // Pattern: pronoun + linking verb (your purpose, your goal, etc.)
    if (CONVERSATION_PRONOUNS.includes(currentWord) && LINKING_VERBS.includes(nextWord)) {
      return true;
    }
    
    // Pattern: linking verb + pronoun (is your, are you, etc.)
    if (LINKING_VERBS.includes(currentWord) && CONVERSATION_PRONOUNS.includes(nextWord)) {
      return true;
    }
  }
  
  // Check for conversation verbs with pronouns (tell me, show me, explain your, etc.)
  for (const verb of CONVERSATION_VERBS) {
    for (const pronoun of CONVERSATION_PRONOUNS) {
      if (lowerInput.includes(`${verb} ${pronoun}`) || lowerInput.includes(`${pronoun} ${verb}`)) {
        return true;
      }
    }
  }
  
  // Common conversational question patterns
  const conversationalPatterns = [
    /what (is|are) (you|your)/i,
    /who (is|are) (you|your)/i,
    /why (is|are) (you|your)/i,
    /how (is|are) (you|your)/i,
    /(tell|show|explain) me about/i,
    /can you (tell|show|explain)/i,
    /what (do|does) (you|your)/i,
  ];
  
  return conversationalPatterns.some(pattern => pattern.test(input));
}

export function parseIntent(input: string): ParsedIntent {
  const normalizedInput = input.trim();
  
  // Phase 7.1c: Check conversational shield BEFORE pattern matching
  if (isConversationalQuery(normalizedInput)) {
    console.log('[IntentParser] Conversational shield activated for:', normalizedInput.substring(0, 50));
    return {
      type: 'conversation',
      parameters: {},
      rawInput: input,
      confidence: 0.9, // High confidence for shielded conversations
      requiresConfirmation: false,
    };
  }
  
  // Try to match against known patterns
  for (const pattern of intentPatterns) {
    for (const regex of pattern.patterns) {
      const match = normalizedInput.match(regex);
      if (match) {
        const parameters = pattern.extractParams ? pattern.extractParams(match, normalizedInput) : {};
        
        return {
          type: pattern.type,
          action: pattern.action,
          entity: pattern.entity,
          parameters,
          rawInput: input,
          confidence: 0.85,
          requiresConfirmation: pattern.requiresConfirmation || false,
        };
      }
    }
  }

  // If no pattern matches, classify as conversation
  return {
    type: 'conversation',
    parameters: {},
    rawInput: input,
    confidence: 0.5,
    requiresConfirmation: false,
  };
}

// Enhanced parameter extraction for complex queries
export function extractTradingParameters(input: string): {
  pairs?: string[];
  risk?: number;
  riskPercent?: number;
  stopLoss?: number;
  takeProfit?: number[];
  timeframe?: string;
} {
  const params: any = {};

  // Extract pairs (BTC, ETH, etc.)
  const pairMatches = input.match(/\b([A-Z]{3,10})(?:USD|EUR|BTC)?\b/g);
  if (pairMatches) {
    params.pairs = pairMatches.map(p => p.toUpperCase());
  }

  // Extract risk (dollar amount or percentage)
  const riskMatch = input.match(/\$?(\d+(?:\.\d+)?)\s*(?:dollars?|risk)?/i);
  const percentMatch = input.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    params.riskPercent = parseFloat(percentMatch[1]);
  } else if (riskMatch) {
    params.risk = parseFloat(riskMatch[1]);
  }

  // Extract stop loss
  const stopMatch = input.match(/stop\s+(?:loss\s+)?(?:at\s+)?(\d+(?:\.\d+)?)/i);
  if (stopMatch) {
    params.stopLoss = parseFloat(stopMatch[1]);
  }

  // Extract take profit
  const tpMatch = input.match(/(?:take\s+profit|target|tp)\s+(?:at\s+)?(\d+(?:\.\d+)?)/gi);
  if (tpMatch) {
    params.takeProfit = tpMatch.map(m => {
      const val = m.match(/(\d+(?:\.\d+)?)/);
      return val ? parseFloat(val[1]) : 0;
    }).filter(v => v > 0);
  }

  // Extract timeframe
  const timeframeMatch = input.match(/(\d+)\s*(minutes?|hours?|days?|weeks?)/i);
  if (timeframeMatch) {
    params.timeframe = `${timeframeMatch[1]}${timeframeMatch[2][0]}`;
  }

  return params;
}

// Validate command safety
export function validateCommandSafety(intent: ParsedIntent, currentSettings?: any): {
  safe: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Risk validation
  if (intent.parameters.risk !== undefined) {
    if (intent.parameters.risk > 500) {
      errors.push('Risk amount exceeds maximum allowed ($500)');
    } else if (intent.parameters.risk > 300) {
      warnings.push('Risk amount is higher than recommended ($300)');
    }
  }

  if (intent.parameters.riskPercent !== undefined) {
    if (intent.parameters.riskPercent > 25) {
      errors.push('Risk percentage exceeds maximum allowed (25%)');
    } else if (intent.parameters.riskPercent > 15) {
      warnings.push('Risk percentage is higher than recommended (15%)');
    }
  }

  // Max exposure validation
  if (intent.parameters.settingName === 'maxExposurePercent') {
    const value = intent.parameters.settingValue as number;
    if (value > 100) {
      errors.push('Maximum exposure cannot exceed 100%');
    } else if (value > 75) {
      warnings.push('Maximum exposure above 75% is aggressive');
    }
  }

  // Max trades validation
  if (intent.parameters.settingName === 'maxOpenTrades') {
    const value = intent.parameters.settingValue as number;
    if (value > 10) {
      errors.push('Maximum open trades cannot exceed 10');
    } else if (value > 5) {
      warnings.push('More than 5 open trades requires careful monitoring');
    }
  }

  return {
    safe: errors.length === 0,
    warnings,
    errors,
  };
}

// Generate confirmation message
export function generateConfirmationMessage(intent: ParsedIntent): string {
  const { type, action, entity, parameters } = intent;

  if (type === 'action' && action === 'pause' && entity === 'trading') {
    return 'Are you sure you want to pause all trading? This will prevent new positions from opening.';
  }

  if (type === 'action' && action === 'resume' && entity === 'trading') {
    return 'Are you sure you want to resume trading? Strategies will start scanning for opportunities.';
  }

  if (type === 'action' && action === 'close' && entity === 'position') {
    const pair = parameters.pairs?.[0] || 'all positions';
    return `Are you sure you want to close ${pair}? This will exit the position at market price.`;
  }

  if (type === 'configuration' && action === 'update' && entity === 'risk') {
    if (parameters.riskPercent) {
      const pair = parameters.pairs?.[0] || 'default';
      return `Confirm: Set ${pair} risk to ${parameters.riskPercent}% of portfolio?`;
    }
    if (parameters.risk) {
      const pair = parameters.pairs?.[0] || 'default';
      return `Confirm: Set ${pair} risk to $${parameters.risk} per trade?`;
    }
  }

  if (type === 'configuration' && action === 'update') {
    if (parameters.settingName === 'maxExposurePercent') {
      return `Confirm: Set maximum exposure to ${parameters.settingValue}%?`;
    }
    if (parameters.settingName === 'maxOpenTrades') {
      return `Confirm: Set maximum open trades to ${parameters.settingValue}?`;
    }
  }

  if (type === 'configuration' && entity === 'strategy') {
    const strategyName = parameters.strategyName || 'strategy';
    const actionVerb = action === 'enable' ? 'enable' : 'disable';
    return `Confirm: ${actionVerb} ${strategyName} strategy?`;
  }

  if (type === 'action' && action === 'switch' && entity === 'mode') {
    const mode = parameters.mode || 'unknown';
    return `Confirm: Switch to ${mode} trading mode? ${mode === 'live' ? 'This will use real funds!' : 'This will use simulated funds.'}`;
  }

  return 'Confirm this action?';
}

/**
 * Parse multiple intents from a single message
 * Splits message by conjunctions and parses each segment independently
 * 
 * @param input - User message that may contain multiple intents
 * @returns Array of parsed intents (empty if only conversational)
 * 
 * @example
 * "start paper trading and set risk to 2%" 
 * => [{ action: 'start', entity: 'paper_simulation' }, { action: 'update', entity: 'risk', parameters: { risk: 2 } }]
 */
export function parseMultipleIntents(input: string): ParsedIntent[] {
  const normalizedInput = input.trim();
  
  // If entire message is conversational, return single conversation intent
  if (isConversationalQuery(normalizedInput)) {
    return [parseIntent(normalizedInput)];
  }
  
  // Split by common conjunctions that indicate multiple intents
  // Patterns: "and", "then", "also", comma with spaces
  const conjunctionPattern = /\s+(?:and|then|also)\s+|,\s+(?:and\s+)?/i;
  const segments = normalizedInput.split(conjunctionPattern).map(s => s.trim()).filter(s => s.length > 0);
  
  // If only one segment, use single intent parsing
  if (segments.length === 1) {
    const intent = parseIntent(normalizedInput);
    return intent.type === 'conversation' ? [] : [intent];
  }
  
  // Parse each segment as a separate intent
  const intents: ParsedIntent[] = [];
  let intentCount = 0;
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const intent = parseIntent(segment);
    
    // Skip pure conversational segments in multi-intent context
    // (e.g., "please" or "thanks" between commands)
    if (intent.type !== 'conversation') {
      intents.push({
        ...intent,
        rawInput: segment, // Keep original segment as rawInput for traceability
      });
      intentCount++;
    } else if (intent.confidence > 0.7) {
      // If high-confidence conversation, it might be the main intent
      // Only include if it's the first or last segment
      if (i === 0 || i === segments.length - 1) {
        intents.push(intent);
      }
    }
  }
  
  // If we found no actionable intents, parse the whole message as one
  if (intentCount === 0) {
    const singleIntent = parseIntent(normalizedInput);
    return singleIntent.type === 'conversation' ? [] : [singleIntent];
  }
  
  console.log(`[IntentParser] Detected ${intents.length} intents from multi-intent message:`, 
    intents.map(i => `${i.action}:${i.entity}`).join(', '));
  
  return intents;
}
