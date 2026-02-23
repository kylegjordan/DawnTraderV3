import type { TradingSettings } from '@shared/schema';
import { storage } from '../storage';

// Portfolio metrics helper (storage-based)
async function getPortfolioMetricsStub(mode: 'live' | 'paper' = 'paper') {
  const activeTrades = await storage.getActiveTrades(mode);
  const closedTrades = await storage.getTrades(mode, { status: 'closed' });
  
  let currentExposure = 0;
  for (const trade of activeTrades) {
    currentExposure += parseFloat(trade.quantity) * parseFloat(trade.entryPrice);
  }
  
  const realizedPL = closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
  const totalValue = 50000 + realizedPL;
  
  return {
    totalValue,
    unrealizedPL: 0,
    realizedPL,
    currentExposure,
    openTradesCount: activeTrades.length
  };
}

/**
 * Intent types based on Task 9 behavioral templates
 * Phase 7.2: Enhanced with command/inquiry/conversation categories
 */
export type IntentType = 
  | 'command'           // Action requests (e.g., "Start paper trading")
  | 'inquiry'           // Data or status questions (e.g., "What's my P&L?")
  | 'conversation'      // Discussion/reflection (e.g., "I'm feeling unsure")
  | 'guardrail_explanation'
  | 'strategy_explanation'
  | 'risk_reassurance'
  | 'safety_refusal'
  | 'general_config';

/**
 * User's real-time trading context
 */
interface UserTradingContext {
  portfolioValue: number;
  riskPerTrade: number;
  dailyLossKillSwitch: number;
  maxExposurePercent: number;
  enabledStrategies: string[];
  currentExposure: number;
  openTrades: number;
  currentDailyLoss: number;
  mode: 'live' | 'paper';
}

/**
 * Behavioral guidance for prompt enhancement
 */
interface BehavioralGuidance {
  intent: IntentType;
  templates: string;
  context: UserTradingContext;
  mustInclude: string[];
  mustNotInclude: string[];
}

/**
 * Detect user intent from message
 * Phase 7.2: Enhanced with command/inquiry/conversation detection
 */
export function detectIntent(userMessage: string): IntentType {
  const msg = userMessage.toLowerCase();

  // Command patterns (action requests) - Phase 7.2
  const commandPatterns = [
    /^(start|stop|pause|resume|restart|end|close|exit)/i,
    /(please|can you|could you|would you)\s+(start|stop|pause|resume|restart|adjust|change|set|enable|disable)/i,
    /^(adjust|change|set|update|enable|disable|activate|deactivate)/i,
  ];

  if (commandPatterns.some(pattern => pattern.test(msg))) {
    return 'command';
  }

  // Inquiry patterns (questions) - Phase 7.2
  const inquiryPatterns = [
    /^(what|how|when|where|why|which|who|whose)/i,
    /^(is|are|do|does|can|could|would|should|will)/i,
    /\?(.*)/,  // Ends with question mark
    /^(show|tell|explain|list|give|get|display)/i,
    /(what's|how's|what is|how is)/i,
  ];

  if (inquiryPatterns.some(pattern => pattern.test(msg))) {
    return 'inquiry';
  }

  // Conversation patterns (reflection, discussion) - Phase 7.2
  const conversationPatterns = [
    /(i'm|i am|i feel|feeling|i think|i believe|i wonder)/i,
    /(curious|unsure|uncertain|confused|concerned|worried|excited|anxious)/i,
    /(seems|appears|looks like|sounds like)/i,
    /^(hmm|well|so|actually|interesting)/i,
  ];

  if (conversationPatterns.some(pattern => pattern.test(msg))) {
    return 'conversation';
  }

  // Safety refusal patterns (highest priority for safety)
  const refusalPatterns = [
    /disable.*kill switch/i,
    /turn off.*stop/i,
    /bypass.*safety/i,
    /ignore.*limit/i,
    /enable.*leverage/i,
    /enable.*margin/i,
    /remove.*protection/i,
    /increase.*beyond/i,
  ];
  
  if (refusalPatterns.some(pattern => pattern.test(msg))) {
    return 'safety_refusal';
  }

  // Guardrail explanation patterns
  const guardrailKeywords = [
    'position limit', 'position cap', 'position size', '10%', '15%', 'why can\'t i buy',
    'stop loss', 'stop-loss', 'why do i need',
    'kill switch', 'daily loss', '7%', 'shut down', 'stopped trading',
    'spot only', 'leverage', 'margin', 'why no leverage',
    'symbol', 'btc/usd', 'xbt', 'ticker',
    'exposure', 'max exposure', 'total exposure',
    'one position', 'duplicate', 'already have',
    'rejected because', 'order was rejected'
  ];

  if (guardrailKeywords.some(kw => msg.includes(kw))) {
    return 'guardrail_explanation';
  }

  // Risk reassurance patterns (check before strategy to avoid conflicts)
  const reassuranceKeywords = [
    'worried', 'scared', 'nervous', 'safe', 'protect', 'security',
    'risk management', 'how safe', 'will i lose', 'protection',
    'safeguards', 'guardrails', 'safety features',
    'prevent big losses', 'prevent losses', 'how does the system prevent'
  ];

  if (reassuranceKeywords.some(kw => msg.includes(kw))) {
    return 'risk_reassurance';
  }

  // Strategy explanation patterns
  const strategyKeywords = [
    'vwap pullback', 'vwap bounce', 'abcd long', 'sma trend',
    'breakout', 'mean reversion', 'range trading', 'liquidity trap',
    'what is', 'how does', 'explain', 'strategy', 'strategies',
    'when does', 'how do the strategies work'
  ];

  if (strategyKeywords.some(kw => msg.includes(kw))) {
    return 'strategy_explanation';
  }

  // Default to general config
  return 'general_config';
}

/**
 * Fetch real-time user trading context
 */
export async function fetchUserContext(userId: string): Promise<UserTradingContext> {
  try {
    // Fetch user first to get mode
    const user = await storage.getUser(userId);
    const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';

    // Fetch active trades with correct mode parameter
    // [8.8.3-H11] Fixed: getActiveTrades requires mode parameter
    const activeTrades = await storage.getActiveTrades(mode);
    
    // Get portfolio metrics
    const metrics = await getPortfolioMetricsStub(mode);

    // Phase 8.5 Addendum I: Get portfolio value from portfolio_state table
    // Fallback to 0 (no hardcoded initial capital) to match live API behavior
    // [9.6.3] Use mode-only query (mode-based architecture)
    const portfolioState = await storage.getPortfolioState({ mode });
    const portfolioValue = portfolioState 
      ? parseFloat(portfolioState.balance) 
      : 0;
    
    // Default values
    const riskPerTrade = 0;
    const dailyLossKillSwitch = 7.0;
    const maxExposurePercent = 100;

    // Calculate daily loss
    const currentDailyLoss = Math.abs(metrics.realizedPL); // Simplified

    // Get enabled strategies from strategy_settings table
    const strategySettingsList = await storage.listStrategySettings({ userId, mode });
    const enabledStrategies = strategySettingsList
      .filter(s => s.enabled)
      .map(s => s.strategy);
    
    console.log(`[BehavioralTemplate] User ${userId} (${mode}): Found ${strategySettingsList.length} strategies, ${enabledStrategies.length} enabled:`, enabledStrategies);

    return {
      portfolioValue,
      riskPerTrade,
      dailyLossKillSwitch,
      maxExposurePercent,
      enabledStrategies,
      currentExposure: metrics.currentExposure,
      openTrades: activeTrades.length,
      currentDailyLoss,
      mode
    };
  } catch (error) {
    console.error('[BehavioralTemplate] Error fetching user context:', error);
    // Return safe defaults (Phase 8.5 Addendum I: No hardcoded initial capital)
    return {
      portfolioValue: 0,
      riskPerTrade: 0,
      dailyLossKillSwitch: 7.0,
      maxExposurePercent: 100,
      enabledStrategies: [],
      currentExposure: 0,
      openTrades: 0,
      currentDailyLoss: 0,
      mode: 'paper'
    };
  }
}

/**
 * Get behavioral guidance for intent
 */
export function getBehavioralGuidance(
  intent: IntentType,
  context: UserTradingContext
): BehavioralGuidance {
  const templates = getTemplatesForIntent(intent);
  const mustInclude = getMustIncludeKeywords(intent);
  const mustNotInclude = getMustNotIncludeKeywords(intent);

  return {
    intent,
    templates,
    context,
    mustInclude,
    mustNotInclude
  };
}

/**
 * Get template text for intent type
 */
function getTemplatesForIntent(intent: IntentType): string {
  switch (intent) {
    case 'guardrail_explanation':
      return `
**Guardrail Explanation Templates** (From Task 9 Behavioral QA):

1. **Max 1 Position Per Asset**:
   - Analogy: "Training wheels preventing duplicate trades"
   - Why: Prevents over-concentration in single asset
   - Show: Clear explanation with user's current positions

2. **Position Size Cap (10%)**:
   - Analogy: "Seatbelt limiting risk to 10% of portfolio"
   - Why: Protects from oversized bets
   - Show: Exact calculations with user's portfolio value
   - Solutions: Reduce quantity, increase stop distance, boost portfolio

3. **Stop-Loss Enforcement**:
   - Analogy: "Mandatory seatbelt on every trade"
   - Why: Defines maximum acceptable loss
   - Show: How stop-loss protects capital

4. **Spot-Only Trading**:
   - Firm refusal of leverage/margin
   - Why: Leverage amplifies losses exponentially
   - Redirect: Paper mode for experimentation

5. **Daily Loss Kill Switch (7%)**:
   - Analogy: "Circuit breaker shutting down at 7% daily loss"
   - Why: Prevents catastrophic drawdowns
   - How to Reset: Wait for next trading day or manual reset

6. **Symbol Normalization**:
   - Explain: BTC/USD, XBTUSD, XXBTZUSD are same asset
   - Why: System prevents duplicate positions in same underlying

7. **Exposure Limits**:
   - Show: Current exposure vs. max allowed
   - Solutions: Close positions or increase limit

**Tone**: Professional + Educational + Protective
**Must**: Use analogies, show exact calculations, provide 2-3 solutions
**Never**: Be condescending or alarming
`;

    case 'strategy_explanation':
      return `
**Strategy Explanation Templates** (From Task 9 Behavioral QA):

1. **VWAP Pullback**: "Like a spring - price pulls back to average, then springs forward"
2. **ABCD Long**: "Classic A-B-C-D pattern - wait for pullback (C), then ride to D"
3. **SMA Trend Ride**: "Riding the wave - enter when price above moving average trend"
4. **Breakout**: "Breaking through resistance - momentum continuation play"
5. **Mean Reversion**: "Rubber band stretched - snaps back to average"
6. **Range Trading**: "Bouncing ball - buy low end, sell high end of range"
7. **VWAP Bounce**: "Trampoline effect - price bounces off VWAP support"
8. **Liquidity Trap**: "Avoiding fake breakouts - wait for real volume confirmation"

**For Each Strategy**:
- Use simple analogy
- Explain entry conditions clearly
- Show risk/reward in everyday terms
- Mention when strategy works best
- NO technical jargon

**Tone**: Professional + Approachable + Educational
`;

    case 'risk_reassurance':
      return `
**Risk Management Reassurance Template** (From Task 9 Behavioral QA):

Walter's 4-Layer Protection System:

1. **Per-Trade Stop Loss**: Limits each trade's loss
2. **Position Size Cap (10%)**: Prevents oversized positions
3. **Max Exposure Limit**: Controls total capital at risk
4. **Daily Loss Kill Switch (7%)**: Emergency circuit breaker

Additional Safeguards:
- Spot-only (no leverage amplification)
- Symbol normalization (prevents duplicates)
- Order book depth validation
- Real-time risk monitoring

**Message**: "Your capital is protected by multiple independent safety layers. Each one watches over different aspects of risk."

**Tone**: Calm + Reassuring + Protective (NOT alarming)
`;

    case 'safety_refusal':
      return `
**Safety Refusal Template** (From Task 9 Behavioral QA):

**Response Pattern**:
1. **Firm but Respectful "No"**: "I can't disable the [feature] because..."
2. **Explain Why**: Capital protection, catastrophic loss prevention
3. **Redirect to Safe Alternatives**:
   - Paper mode for experimentation
   - Parameter tuning within safe bounds
   - Strategy adjustment instead of safety bypass
4. **Educational Tone**: Help user understand why safety matters

**Examples**:
- "I can't disable the kill switch - it's your last line of defense against catastrophic losses"
- "I can't enable leverage - it amplifies losses exponentially and contradicts our capital protection mission"

**NEVER**:
- Suggest workarounds or bypass methods
- Compromise on safety features
- Provide steps to circumvent guardrails

**Tone**: Firm + Protective + Educational (NOT preachy)
`;

    case 'general_config':
    default:
      return `
**General Configuration Guidance**:
- Answer clearly and concisely
- Reference user's current settings
- Provide actionable recommendations
- Stay focused on trading/system topics
`;
  }
}

/**
 * Keywords that MUST appear in response for intent type
 */
function getMustIncludeKeywords(intent: IntentType): string[] {
  switch (intent) {
    case 'guardrail_explanation':
      return ['because', 'protects', 'solution', 'can'];
    case 'strategy_explanation':
      return ['like', 'when', 'entry'];
    case 'risk_reassurance':
      return ['protected', 'safety', 'layer'];
    case 'safety_refusal':
      return ['can\'t', 'because', 'instead', 'paper mode'];
    default:
      return [];
  }
}

/**
 * Keywords that MUST NOT appear in response
 */
function getMustNotIncludeKeywords(intent: IntentType): string[] {
  const commonUnsafe = ['bypass', 'workaround', 'hack', 'disable safety'];
  
  switch (intent) {
    case 'safety_refusal':
      return [...commonUnsafe, 'you could', 'one way to get around'];
    case 'guardrail_explanation':
      return [...commonUnsafe];
    default:
      return commonUnsafe;
  }
}

/**
 * Enhance base prompt with behavioral guidance
 */
export function enhancePrompt(
  basePrompt: string,
  guidance: BehavioralGuidance
): string {
  const { templates, context, mustInclude, mustNotInclude } = guidance;

  // Build context section
  const exposurePercent = context.portfolioValue > 0 
    ? (context.currentExposure / context.portfolioValue * 100).toFixed(1)
    : '0.0';

  const dailyLossPercent = context.portfolioValue > 0
    ? (context.currentDailyLoss / context.portfolioValue * 100).toFixed(2)
    : '0.00';

  const contextSection = `
---

REAL-TIME USER CONTEXT (Use these numbers in your explanations):
- Portfolio Value: $${context.portfolioValue.toLocaleString()}
- Risk Per Trade: $${context.riskPerTrade.toLocaleString()}
- Daily Loss Limit: ${context.dailyLossKillSwitch}% ($${(context.portfolioValue * context.dailyLossKillSwitch / 100).toFixed(0)})
- Current Daily Loss: ${dailyLossPercent}% ($${context.currentDailyLoss.toFixed(0)})
- Current Exposure: $${context.currentExposure.toLocaleString()} (${exposurePercent}% of portfolio)
- Max Exposure: ${context.maxExposurePercent}%
- Open Trades: ${context.openTrades}
- Enabled Strategies: ${context.enabledStrategies.length > 0 ? context.enabledStrategies.join(', ') : 'None'}
- Mode: ${context.mode.toUpperCase()}

---

BEHAVIORAL TEMPLATES (Follow these patterns):
${templates}

---

RESPONSE REQUIREMENTS:
- MUST include these concepts: ${mustInclude.join(', ')}
- MUST NOT include: ${mustNotInclude.join(', ')}
- Personalize with user's actual numbers shown above
- Use analogies and everyday language
- Professional + Approachable + Protective tone
`;

  // Insert behavioral section before "RESPONSE GUIDELINES"
  return basePrompt.replace(
    /RESPONSE GUIDELINES:/,
    `${contextSection}\n\nRESPONSE GUIDELINES:`
  );
}

/**
 * Validate response against behavioral requirements
 */
export interface ValidationResult {
  passed: boolean;
  issues: string[];
  tone: 'professional' | 'condescending' | 'alarming' | 'unclear';
  safetyCompliant: boolean;
  hasUnsafeSuggestions: boolean;
  usedContext: string[];
  templateMatch: number; // 0-100
}

export function validateResponse(
  response: string,
  guidance: BehavioralGuidance
): ValidationResult {
  const issues: string[] = [];
  const responseLower = response.toLowerCase();

  // Check for unsafe keywords
  const hasUnsafeSuggestions = guidance.mustNotInclude.some(
    keyword => responseLower.includes(keyword.toLowerCase())
  );

  if (hasUnsafeSuggestions) {
    issues.push('Contains unsafe suggestions or bypass methods');
  }

  // Check for required keywords
  const missingKeywords = guidance.mustInclude.filter(
    keyword => !responseLower.includes(keyword.toLowerCase())
  );

  if (missingKeywords.length > 0) {
    issues.push(`Missing required concepts: ${missingKeywords.join(', ')}`);
  }

  // Check for context usage
  const usedContext: string[] = [];
  const contextChecks = [
    { key: 'portfolioValue', patterns: [/\$[\d,]+(?:,\d{3})*/, /portfolio.*\d+/i] },
    { key: 'riskPerTrade', patterns: [/risk.*\$\d+/i, /\$\d+.*risk/i] },
    { key: 'dailyLoss', patterns: [/7%/, /daily.*loss/i] },
    { key: 'exposure', patterns: [/exposure/i, /\d+%.*portfolio/i] },
  ];

  for (const check of contextChecks) {
    if (check.patterns.some(pattern => pattern.test(response))) {
      usedContext.push(check.key);
    }
  }

  // Tone analysis
  let tone: ValidationResult['tone'] = 'professional';
  
  const condescendingPatterns = [
    /obviously/i, /clearly you don't/i, /as i already/i, /simply put/i
  ];
  const alarmingPatterns = [
    /dangerous!/i, /catastrophic!/i, /never ever/i, /you'll lose everything/i
  ];
  const unclearPatterns = response.length < 30 || !response.includes('.');

  if (condescendingPatterns.some(p => p.test(response))) {
    tone = 'condescending';
    issues.push('Condescending tone detected');
  } else if (alarmingPatterns.some(p => p.test(response))) {
    tone = 'alarming';
    issues.push('Alarming/fear-based language detected');
  } else if (unclearPatterns) {
    tone = 'unclear';
    issues.push('Response too brief or unclear');
  }

  // Template match score (simplified)
  let templateMatch = 100;
  templateMatch -= missingKeywords.length * 15;
  templateMatch -= hasUnsafeSuggestions ? 50 : 0;
  templateMatch -= tone !== 'professional' ? 20 : 0;
  templateMatch = Math.max(0, templateMatch);

  const passed = issues.length === 0;
  const safetyCompliant = !hasUnsafeSuggestions;

  return {
    passed,
    issues,
    tone,
    safetyCompliant,
    hasUnsafeSuggestions,
    usedContext,
    templateMatch
  };
}
