import type { WalterMemory, WalterChatLog, InsertWalterMemory } from '@shared/schema';
import { getWalterPurpose } from './walter-purpose';
import { getHighImportanceMemories, createMemory } from './walter-memory';
import { 
  detectIntent, 
  fetchUserContext, 
  getBehavioralGuidance, 
  enhancePrompt as enhanceBehavioralPrompt,
  validateResponse,
  type ValidationResult 
} from './behavioral-template';
import { ExpertContextService, type PrincipleContext } from './expert-context';
import { referenceTracker } from './walter-reference-tracker';
import { buildPersonalityPrompt } from './walter-personality';
import { buildTemplateGuidance } from './walter-response-templates';
import { detectFeedback, logFeedback, buildFeedbackAcknowledgment } from './walter-feedback';
import { inferUserPreferences, buildAdaptiveGuidance } from './walter-adaptive-heuristics';
import { walterDataPipeline } from './walter-data-pipeline';
import { insightBob } from './bob-insight';
import { uiBob } from './bob-ui';
import { cortexCore } from './cortex/cortex-core';
import { nlaiInterpreter } from './nlai-interpreter';
import { contextRefreshCoordinator } from './context-refresh-coordinator';
import { cognitiveLayer } from './walter-cognitive-layer';
import OpenAI from 'openai';
import { storage } from '../storage';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const expertContext = new ExpertContextService();

// Phase 8.5 Addendum J: Listen for context updates and log rehydration
contextRefreshCoordinator.on('contextUpdated', async (userId: string) => {
  console.log(`[WalterResponse] Context updated event received for user ${userId} - memory will be rehydrated on next response`);
});

interface ResponseContext {
  purpose: string;
  memories: WalterMemory[];
  chatHistory: WalterChatLog[];
  chatSummary: string | null;
  memoryDepth: number;
  expertPrinciples: PrincipleContext[];
  referenceContext: string | null;
  dashboardContext: string | null; // Phase 7.1: Live dashboard data
  insightContext: string | null; // Phase 7.7: InsightBob system introspection
  uiContext: string | null; // Phase 7.7: UIBob current UI state
  cortexContext: string | null; // Phase 8.0: Cortex memory layer
  tradingMode: 'live' | 'paper';
}

interface MemoryExtractionResult {
  shouldCreate: boolean;
  content: string | null;
  type: InsertWalterMemory['type'] | null;
  importance: number | null;
}

/**
 * Generate AI response for user message with full context injection
 * Enhanced with Task 10 behavioral templates
 */
export async function generateWalterResponse(
  userId: string,
  chatId: string,
  userMessage: string
): Promise<string> {
  try {
    // Phase 8.5 Addendum K.4: Force DUAL-MODE context refresh before EVERY response
    // This ensures Walter always has visibility into BOTH live and paper modes
    const user = await storage.getUser(userId);
    const tradingMode = (user?.tradingMode || 'paper') as 'live' | 'paper';
    
    console.log(`[WalterResponse] [Addendum-K.4] Forcing dual-mode context rehydration...`);
    const { dualModeData, latencyMs } = await contextRefreshCoordinator.ensureFreshDualContext(userId);
    
    console.log(
      `[WalterResponse] Rehydrated dual-mode context (${latencyMs}ms) → ` +
      `live=$${dualModeData.live.portfolioBalance} (${dualModeData.live.engineStatus}), ` +
      `paper=$${dualModeData.paper.portfolioBalance} (${dualModeData.paper.engineStatus}) ` +
      `source=live-api`
    );

    // Phase 8.6: Check for tone change commands
    const toneChange = await cognitiveLayer.handleToneChange(userId, userMessage);
    if (toneChange.changed) {
      console.log(`[Walter-Cognitive] Tone changed to ${toneChange.newTone} for user ${userId}`);
      return toneChange.message;
    }

    // Phase 8.6: Detect commands early and route through Intent Gateway for validation
    // Commands bypass conversational flow and get direct validation/execution
    const intent = detectIntent(userMessage);
    if (intent === 'command') {
      console.log(`[Walter-Cognitive] Command detected, checking Intent Gateway validation...`);
      
      // Build reasoning context for command validation
      const reasoningContext = {
        userIntent: userMessage,
        currentMode: tradingMode,
        portfolioBalance: dualModeData[tradingMode].portfolioBalance,
        activeStrategies: dualModeData[tradingMode].activeStrategies,
        recentActions: [],
        userRole: user?.role || 'viewer'
      };
      
      // Route through cognitive layer for Intent Gateway validation
      const cognitiveResponse = await cognitiveLayer.processMessage(userId, userMessage, reasoningContext);
      
      // Cognitive layer returns response for commands (either blocked or explanation)
      // Format it as a natural language response
      let response = cognitiveResponse.mainResponse;
      if (cognitiveResponse.strategicOptions && cognitiveResponse.strategicOptions.length > 0) {
        response += '\n\n' + cognitiveResponse.strategicOptions.join('\n');
      }
      if (cognitiveResponse.followUpQuestion) {
        response += '\n\n' + cognitiveResponse.followUpQuestion;
      }
      return response;
    }

    // If not a command, continue with conversational flow
    console.log(`[Walter-Cognitive] Not a command (intent: ${intent}), proceeding with conversational response`);

    // 1. Gather context including expert principles
    const context = await gatherContext(userId, chatId, userMessage);

    // 2. Phase 6.2: Detect user feedback (positive, negative, correction)
    const lastAssistantMessage = context.chatHistory.filter(m => m.role === 'assistant').pop()?.content;
    const feedbackDetection = detectFeedback(userMessage, lastAssistantMessage);
    
    if (feedbackDetection.hasFeedback) {
      console.log(`[Walter] Detected ${feedbackDetection.sentiment} feedback (confidence: ${feedbackDetection.confidence})`);
      await logFeedback(userId, chatId, feedbackDetection, userMessage, lastAssistantMessage);
    }

    // 3. Detect intent and fetch behavioral context (Task 10)
    // (intent already detected above for command routing)
    const userContext = await fetchUserContext(userId);
    const behavioralGuidance = getBehavioralGuidance(intent, userContext);

    console.log(`[Walter] Detected intent: ${intent} for message: "${userMessage.substring(0, 50)}..."`);

    // Legacy CIE logging for transparency (now cognitive layer handles execution)
    const { contextualNLAIInterpreter } = await import('./contextual-nlai-interpreter');
    const { intentDecisionLogger } = await import('./intent-decision-logger');
    
    const cieResponse = await contextualNLAIInterpreter.interpret(userId, userMessage);
    
    // Log intent decision for transparency
    await intentDecisionLogger.logDecision({
      timestamp: new Date().toISOString(),
      userId,
      rawInput: userMessage,
      detectedIntent: cieResponse.intent?.intent || 'unknown',
      action: cieResponse.intent?.action,
      confidence: cieResponse.intent?.confidence || 0,
      contextSnapshot: {
        hadContext: cieResponse.contextUsed?.hadPreviousContext || false,
        topic: cieResponse.contextUsed?.topic,
        lastIntent: cieResponse.contextUsed?.lastIntent,
        minutesSinceLastIntent: cieResponse.contextUsed?.minutesSinceLastIntent,
      },
      actionExecuted: undefined, // Cognitive layer now handles execution
      guardrailBlocked: cieResponse.guardrailViolation,
      processingTimeMs: cieResponse.processingTimeMs,
    });

    // 4. Build prompt with behavioral enhancement, feedback acknowledgment, adaptive preferences, CIE context, and FRESH DUAL-MODE DATA
    const basePrompt = await buildPrompt(context, userMessage, feedbackDetection, userId, cieResponse, dualModeData);
    const enhancedPrompt = enhanceBehavioralPrompt(basePrompt, behavioralGuidance);

    // 5. Call OpenAI
    const response = await callOpenAI(enhancedPrompt, userMessage);

    // 5. Validate response against behavioral requirements (Task 10)
    const validation = validateResponse(response, behavioralGuidance);
    logBehavioralTest(userId, userMessage, intent, response, validation);

    // 6. SAFETY ENFORCEMENT: Block unsafe responses
    if (!validation.safetyCompliant) {
      console.error('[Walter] ⛔ UNSAFE RESPONSE BLOCKED:', validation.issues.join(', '));
      return "I can't provide that response as it may compromise safety. Let me rephrase: I'm designed to protect your capital, and I can't suggest ways to bypass safety features. However, I can help you optimize within safe parameters. What would you like to adjust?";
    }

    // 7. If validation failed for tone/accuracy, log warning but allow response
    if (!validation.passed && validation.safetyCompliant) {
      console.warn('[Walter] ⚠️  Response validation issues (non-safety):', validation.issues.join(', '));
      // Allow response but log for improvement
    }

    // 8. Extract and store memory if needed (expert principles already logged in getRelevantPrinciples)
    await extractAndStoreMemory(userId, chatId, userMessage, response);

    // Phase 7.1c Deliverable 1 & 3: Apply universal stringification
    return ensureNaturalLanguageResponse(response);
  } catch (error) {
    console.error('[WalterResponseService] Error generating response:', error);
    return getFallbackResponse(error);
  }
}

/**
 * Format InsightBob data into context string (Phase 7.7 + 8.2 + 8.3)
 */
function formatInsightContext(insight: any): string {
  const { modules, overallStats, systemHealth, recentChanges, analytics, healthMetrics } = insight;
  
  let context = `System Introspection (Bob Core):\n`;
  context += `- Active Modules: ${overallStats.modulesActive} (${Object.keys(modules).join(', ')})\n`;
  context += `- Cache Performance: ${overallStats.overallHitRate} hit rate\n`;
  context += `- System Health: ${systemHealth}\n`;
  
  // Phase 8.3: Include detailed health metrics
  if (healthMetrics) {
    const { status, metrics, warnings, criticalIssues } = healthMetrics;
    context += `\nSystem Diagnostics (Phase 8.3):\n`;
    context += `- Overall Status: ${status.toUpperCase()}\n`;
    context += `- Uptime: ${Math.floor(metrics.system.uptime / 3600)}h ${Math.floor((metrics.system.uptime % 3600) / 60)}m\n`;
    context += `- Resources: CPU ${metrics.system.cpuUsage}%, Memory ${metrics.system.memoryUsage.percentUsed}%\n`;
    
    // Phase 8.4 Addendum E.1: File Persistence Stats
    if (metrics.filePersistence) {
      const fp = metrics.filePersistence;
      context += `- File Operations: ${fp.successCount} saved, ${fp.failureCount} failed, ${fp.timeoutCount} timeouts (avg ${fp.avgLatencyMs}ms)\n`;
    }
    
    // Phase 8.5: Real-Time Execution Metrics
    if (metrics.execution) {
      const ex = metrics.execution;
      context += `- Execution Layer:\n`;
      context += `  • Market Data: ${ex.marketDataSource || 'N/A'}`;
      if (ex.lastTickAgeMs !== undefined) {
        context += ` (tick age: ${ex.lastTickAgeMs}ms)`;
      }
      context += `\n`;
      if (ex.avgSubmitAckMs !== undefined) {
        context += `  • Latency: ${ex.avgSubmitAckMs}ms (submit→ack)\n`;
      }
      if (ex.avgSlippageBps !== undefined) {
        context += `  • Slippage: ${ex.avgSlippageBps.toFixed(2)} bps avg\n`;
      }
      if (ex.avgFeesPerTrade !== undefined) {
        context += `  • Fees: $${ex.avgFeesPerTrade.toFixed(2)} per trade\n`;
      }
      if (ex.ratePressure) {
        context += `  • Rate Pressure: ${ex.ratePressure}\n`;
      }
    }
    
    if (criticalIssues && criticalIssues.length > 0) {
      context += `- CRITICAL: ${criticalIssues.length} issue(s) - ${criticalIssues[0]}\n`;
    } else if (warnings && warnings.length > 0) {
      context += `- Warnings: ${warnings.length} warning(s)\n`;
    }
  }
  
  if (recentChanges && recentChanges.length > 0) {
    context += `- Recent Changes:\n`;
    recentChanges.slice(0, 3).forEach((change: string) => {
      context += `  • ${change}\n`;
    });
  }
  
  // Phase 8.2: Include analytics data
  if (analytics) {
    context += `\nPerformance Analytics:\n`;
    
    if (analytics.live) {
      const { strategy_analytics, portfolio_summary } = analytics.live;
      if (strategy_analytics) {
        context += `- LIVE Mode:\n`;
        context += `  • Strategies: ${strategy_analytics.totalStrategies} (${strategy_analytics.bestPerformer || 'N/A'} performing best)\n`;
        context += `  • Avg Sharpe: ${strategy_analytics.averageSharpe}, Avg Win Rate: ${strategy_analytics.averageWinRate}%\n`;
      }
      if (portfolio_summary) {
        context += `  • Portfolio: ${portfolio_summary.totalPLPercent.toFixed(2)}% return, Sharpe: ${portfolio_summary.portfolioSharpe}\n`;
      }
    }
    
    if (analytics.paper) {
      const { strategy_analytics, portfolio_summary } = analytics.paper;
      if (strategy_analytics) {
        context += `- PAPER Mode:\n`;
        context += `  • Strategies: ${strategy_analytics.totalStrategies} (${strategy_analytics.bestPerformer || 'N/A'} performing best)\n`;
        context += `  • Avg Sharpe: ${strategy_analytics.averageSharpe}, Avg Win Rate: ${strategy_analytics.averageWinRate}%\n`;
      }
      if (portfolio_summary) {
        context += `  • Portfolio: ${portfolio_summary.totalPLPercent.toFixed(2)}% return, Sharpe: ${portfolio_summary.portfolioSharpe}\n`;
      }
    }
  }
  
  return context;
}

/**
 * Format UIBob data into context string (Phase 7.7)
 */
function formatUIContext(uiState: any): string {
  const { current, previous } = uiState;
  
  let context = `Current UI Context:\n`;
  context += `- User is viewing: ${current.view}`;
  if (current.subView) context += ` > ${current.subView}`;
  context += `\n`;
  context += `- Trading Mode: ${current.mode.toUpperCase()}\n`;
  
  if (current.filters && Object.keys(current.filters).length > 0) {
    context += `- Active Filters: ${JSON.stringify(current.filters)}\n`;
  }
  
  if (previous) {
    context += `- Previous View: ${previous.view}\n`;
  }
  
  return context;
}

/**
 * Format Cortex data into context string (Phase 8.0)
 */
function formatCortexContext(cortexSnapshot: any): string {
  if (!cortexSnapshot) return '';
  
  const { bob_snapshot, ui_snapshot, last_sync } = cortexSnapshot;
  
  let context = `Cortex Memory Layer:\n`;
  if (last_sync) {
    const syncTime = new Date(last_sync);
    const minutesAgo = Math.floor((Date.now() - syncTime.getTime()) / 60000);
    context += `- Last Sync: ${minutesAgo === 0 ? 'Just now' : `${minutesAgo}m ago`}\n`;
  }
  
  if (bob_snapshot && bob_snapshot.systemHealth) {
    context += `- Cached System Status: ${bob_snapshot.systemHealth}\n`;
  }
  
  if (ui_snapshot && ui_snapshot.current) {
    context += `- Cached UI State: ${ui_snapshot.current.view} (${ui_snapshot.current.mode})\n`;
  }
  
  return context;
}

/**
 * Gather all context: purpose, memories, chat history, summary, expert principles
 */
async function gatherContext(userId: string, chatId: string, userMessage: string): Promise<ResponseContext> {
  try {
    // Get user settings for memory depth and trading mode
    const [settings, user] = await Promise.all([
      storage.getTradingSettings(userId),
      storage.getUser(userId)
    ]);
    
    const memoryDepth = settings?.walterMemoryDepth || 20;
    const tradingMode = (user?.tradingMode || 'paper') as 'live' | 'paper';

    // Get chat for history
    const chat = await storage.getWalterChatById(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    // Gather context in parallel including expert principles, dashboard data, InsightBob, UIBob, and Cortex (Phase 8.0)
    const [purposeText, memories, chatHistory, expertPrinciples, dashboardData, insightData, uiStateData, cortexSnapshot] = await Promise.all([
      getWalterPurpose(userId),
      getHighImportanceMemories(userId, 5), // Top 5 high-importance memories
      storage.getWalterChatLogs(chatId, memoryDepth),
      expertContext.getRelevantPrinciples({ 
        userId, 
        topic: userMessage, 
        maxPrinciples: 5,
        chatId: chatId  // Enable usage logging (now references walter_chats.id)
      }),
      walterDataPipeline.getDashboardData(userId, tradingMode),
      insightBob.isEnabled() ? insightBob.getInsightSummary() : Promise.resolve(null),
      uiBob.isEnabled() ? uiBob.getUIState(userId, tradingMode) : Promise.resolve(null),
      cortexCore.getStatus().health !== 'offline' ? Promise.resolve(cortexCore.getSnapshot('bob')) : Promise.resolve(null)
    ]);

    // Format dashboard data into context
    const dashboardContext = walterDataPipeline.formatDashboardContext(dashboardData, tradingMode);
    
    // Format InsightBob data into context (Phase 7.7)
    const insightContext = insightData ? formatInsightContext(insightData) : null;
    
    // Format UIBob data into context (Phase 7.7)
    const uiContext = uiStateData ? formatUIContext(uiStateData) : null;

    // Format Cortex data into context (Phase 8.0)
    const cortexContext = cortexSnapshot ? formatCortexContext(cortexSnapshot) : null;

    // Phase 6.2: Extract and resolve conversation references
    const entities = await referenceTracker.extractEntitiesFromChat(userId, chatId, chatHistory);
    const resolvedRef = await referenceTracker.resolveReference(userMessage, entities, userId);
    const referenceContext = resolvedRef.found ? referenceTracker.buildReferenceContext(resolvedRef) : null;

    if (referenceContext) {
      console.log(`[Walter] Resolved reference: ${resolvedRef.type} - ${resolvedRef.entity?.name}`);
    }

    console.log(`[Walter] Loaded ${expertPrinciples.length} expert principles for topic analysis`);
    console.log(`[Walter] Loaded dashboard data for ${tradingMode} mode`);
    if (insightContext) console.log(`[Walter] Loaded InsightBob system introspection`);
    if (uiContext) console.log(`[Walter] Loaded UIBob current view: ${uiStateData?.current.view}`);
    if (cortexContext) console.log(`[Walter] Loaded Cortex memory layer`);

    return {
      purpose: purposeText,
      memories: memories || [],
      chatHistory: chatHistory || [],
      chatSummary: null, // Chat summaries handled separately by ConversationSummarizationService
      memoryDepth,
      expertPrinciples: expertPrinciples || [],
      referenceContext,
      dashboardContext,
      insightContext,
      uiContext,
      cortexContext,
      tradingMode
    };
  } catch (error) {
    console.error('[WalterResponseService] Error gathering context:', error);
    // Return minimal context on error
    const defaultPurpose = "I assist with system configuration and provide strategic trading insights.";
    return {
      purpose: defaultPurpose,
      memories: [],
      chatHistory: [],
      chatSummary: null,
      memoryDepth: 20,
      expertPrinciples: [],
      referenceContext: null,
      dashboardContext: null,
      insightContext: null,
      uiContext: null,
      cortexContext: null,
      tradingMode: 'paper'
    };
  }
}

/**
 * Build prompt with context injection including expert principles and CIE context
 */
async function buildPrompt(context: ResponseContext, userMessage: string, feedbackDetection?: any, userId?: string, cieResponse?: any, dualModeData?: any): Promise<string> {
  const { purpose, memories, chatHistory, chatSummary, expertPrinciples, referenceContext, dashboardContext, insightContext, uiContext, cortexContext, tradingMode } = context;

  // Format memories
  const memoriesText = memories.length > 0
    ? memories.map(m => 
        `• [Importance ${m.importance}/5] ${m.content}${m.timestamp ? ` (${formatDate(m.timestamp)})` : ''}`
      ).join('\n')
    : 'No specific memories retrieved for this conversation.';

  // Format expert principles (Phase 5.8)
  const expertText = expertPrinciples.length > 0
    ? expertPrinciples.map(p => 
        `• [${p.category}] ${p.principle}${p.source ? ` (Source: ${p.source})` : ''}`
      ).join('\n')
    : 'No specific expert principles loaded for this topic.';

  // Format chat history
  const historyText = chatHistory.length > 0
    ? chatHistory.map(msg => 
        `${msg.role === 'user' ? 'User' : 'Walter'}: ${msg.content}`
      ).join('\n')
    : '';

  // Format conversation context
  const contextText = chatSummary 
    ? `Previous conversation summary: ${chatSummary}`
    : 'This is a new conversation.';

  // Phase 6.2: Build personality-aware prompt with response templates, feedback, and adaptive preferences
  const personalityGuidance = buildPersonalityPrompt(userMessage);
  const templateGuidance = buildTemplateGuidance(userMessage);
  const feedbackGuidance = feedbackDetection ? buildFeedbackAcknowledgment(feedbackDetection) : '';
  
  // Phase 6.2: Load learned user preferences
  const userPreferences = userId ? await inferUserPreferences(userId) : null;
  const adaptiveGuidance = userPreferences ? buildAdaptiveGuidance(userPreferences) : '';
  
  if (adaptiveGuidance && userPreferences) {
    console.log(`[Walter] Applying learned preferences (confidence: ${Math.round(userPreferences.confidenceLevel * 100)}%)`);
  }

  // Phase 8.4 Addendum C: Format CIE context
  const cieContext = cieResponse ? `
INTENT CLASSIFICATION (Contextual Intent Engine):
- Detected Intent: ${cieResponse.intent?.intent || 'general_chat'}${cieResponse.intent?.action ? ` > ${cieResponse.intent.action}` : ''}
- Confidence: ${((cieResponse.intent?.confidence || 0) * 100).toFixed(0)}%
- Processing Time: ${cieResponse.processingTimeMs}ms
${cieResponse.contextUsed?.hadPreviousContext ? `- Previous Context: topic="${cieResponse.contextUsed.topic}", last intent="${cieResponse.contextUsed.lastIntent}" (${cieResponse.contextUsed.minutesSinceLastIntent}m ago)` : '- No previous conversation context'}
${cieResponse.guardrailViolation?.blocked ? `- ⚠️ Guardrail: ${cieResponse.guardrailViolation.reason}` : ''}

IMPORTANT: This intent classification shows how I (Walter) interpreted your message. If I executed an action, you already saw the result. If not, I should respond conversationally while being aware of this detected intent.
` : '';

  // Build full prompt with expert principles, reference tracking, personality, templates, and CIE context (Phase 8.4 Addendum C)
  return `You are Walter, an AI SysAdmin Co-Pilot for a cryptocurrency day trading platform (Kraken exchange).

Your PRIMARY PURPOSE is wealth generation for Kyle and his family through intelligent, safe, and strategic cryptocurrency trading.

Your role is to:
- Help users configure and optimize their trading system
- Provide strategic insights based on market conditions and trading performance
- Answer questions about system settings, risk management, and trading strategies
- Make recommendations that align with the user's defined purpose and past learnings
- Apply expert trading principles to provide professional-grade guidance
- Understand contextual references naturally (e.g., "that one", "the last trade", "the file I sent")
- Execute natural language commands when appropriate (simulation control, analysis, status checks)

${personalityGuidance}

${feedbackGuidance}

${adaptiveGuidance}

${templateGuidance}

${cieContext}

${dualModeData ? `⚡ LIVE SYSTEM STATE (Just Refreshed - ${new Date().toISOString()}):

📊 LIVE MODE:
   Portfolio Balance: $${dualModeData.live.portfolioBalance}
   Active Strategies: ${dualModeData.live.activeStrategiesCount > 0 ? dualModeData.live.activeStrategies.join(', ') : 'None'}
   Engine Status: ${dualModeData.live.engineStatus.toUpperCase()}${dualModeData.live.engineStatus === 'stopped' ? ' (Data Static - Last synced: ' + new Date(dualModeData.live.lastSyncAt).toLocaleString() + ')' : ''}
   Context Age: ${dualModeData.live.contextAge}s

📊 PAPER MODE:
   Portfolio Balance: $${dualModeData.paper.portfolioBalance}
   Active Strategies: ${dualModeData.paper.activeStrategiesCount > 0 ? dualModeData.paper.activeStrategies.join(', ') : 'None'}
   Engine Status: ${dualModeData.paper.engineStatus.toUpperCase()}${dualModeData.paper.engineStatus === 'stopped' ? ' (Data Static - Last synced: ' + new Date(dualModeData.paper.lastSyncAt).toLocaleString() + ')' : ''}
   Context Age: ${dualModeData.paper.contextAge}s

⚙️ GLOBAL SETTINGS:
   Risk Per Trade: $${dualModeData.settings.riskPerTrade}
   Daily Loss Kill Switch: ${dualModeData.settings.dailyLossKillSwitch}%
   Max Exposure: ${dualModeData.settings.maxExposurePercent}%

👤 USER'S CURRENT MODE: ${tradingMode.toUpperCase()}

CRITICAL: This is the ACTUAL live system state fetched directly from the database for BOTH modes. When answering questions about portfolio balance, active strategies, or system status, ALWAYS use these values above - they are the ground truth. The engine status shows whether trading is active or paused. When engines are stopped, data is static but still accurate (shows last known state). Ignore any conflicting cached data below.

---

` : ''}WALTER'S DEFINED PURPOSE:
${purpose}

---

EXPERT TRADING PRINCIPLES (Apply these to your analysis):
${expertText}

IMPORTANT: Ground your recommendations in these expert principles. When discussing risk, psychology, market structure, or execution, reference relevant principles to provide credible, professional guidance.

---

RELEVANT MEMORIES (Key Learnings from Past):
${memoriesText}

---

LIVE DASHBOARD DATA (What the user sees):
${dashboardContext || 'Dashboard data unavailable'}

IMPORTANT: This dashboard data represents the EXACT current state of the system for ${tradingMode.toUpperCase()} mode. When answering questions about performance, goals, or system status, reference these specific values.

---

${uiContext ? `CURRENT USER VIEW:\n${uiContext}\n\nIMPORTANT: The user is currently viewing the ${uiContext.split('viewing: ')[1]?.split('\n')[0]} screen. Provide context-aware responses based on what they're looking at.\n\n---\n\n` : ''}${insightContext ? `SYSTEM INTROSPECTION:\n${insightContext}\n\nIMPORTANT: Use this system health data to answer questions about recent changes, performance, or technical status.\n\n---\n\n` : ''}${cortexContext ? `${cortexContext}\n\nIMPORTANT: This represents recent system snapshots cached in the Cortex memory layer for faster context retrieval.\n\n---\n\n` : ''}CONVERSATION CONTEXT:
${contextText}

---

RECENT CHAT HISTORY:
${historyText}

${referenceContext || ''}

---

USER'S LATEST MESSAGE:
${userMessage}

---

RESPONSE GUIDELINES:
1. Answer clearly and concisely in everyday language (avoid technical jargon)
2. Reference your purpose when making recommendations
3. Use expert principles to support your reasoning (cite category when relevant)
4. Use your memories to provide context-aware insights
5. When the user refers to "that one", "the last trade", "the file I sent", etc., use the reference context above to understand what they mean
6. If asked about trading strategies, refer to: VWAP Pullback, ABCD Long, SMA Trend Ride, Breakout, Mean Reversion, Range Trading, VWAP Bounce, Liquidity Trap
7. If the question is off-topic (not related to trading/system), politely redirect:
   "I'm focused on helping with trading system configuration and strategy. Could you rephrase your question related to those topics?"
8. If you don't have enough information, ask clarifying questions
9. Keep responses under 200 words for readability

Now respond to the user's message:`;
}

/**
 * Call OpenAI API to generate response with 30-second timeout
 * Phase 7.1b: Extended from 8s to 30s for heavy context builds
 */
async function callOpenAI(systemPrompt: string, userMessage: string): Promise<string> {
  try {
    // Create timeout promise - Phase 7.1b: Extended to 30s
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), 30000); // 30 second timeout
    });

    // Race OpenAI call against timeout
    const completion = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
      timeoutPromise
    ]);

    const response = completion.choices[0]?.message?.content;
    
    if (!response || response.trim().length === 0) {
      throw new Error('Empty response from AI');
    }

    return response.trim();
  } catch (error: any) {
    console.error('[WalterResponseService] OpenAI API error:', error);
    
    // Check for timeout
    if (error.message === 'TIMEOUT') {
      throw new Error('TIMEOUT');
    }
    
    throw error;
  }
}

/**
 * Extract memory from response if it contains significant insights
 */
async function extractAndStoreMemory(
  userId: string,
  chatId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  try {
    const extraction = extractMemory(userMessage, assistantResponse);

    if (extraction.shouldCreate && extraction.content && extraction.type && extraction.importance) {
      await createMemory(
        userId,
        extraction.type,
        extraction.content,
        extraction.importance,
        {
          source: 'chat_response',
          chatId,
          extractedAt: new Date().toISOString()
        },
        chatId
      );

      console.log(`[WalterResponseService] Created memory (${extraction.type}, importance ${extraction.importance}):`, extraction.content);
    }
  } catch (error) {
    console.error('[WalterResponseService] Error extracting memory:', error);
    // Non-critical error, don't throw
  }
}

/**
 * Determine if response should create a memory and extract content
 */
function extractMemory(userMessage: string, assistantResponse: string): MemoryExtractionResult {
  // Check for explicit memory requests
  if (userMessage.match(/(remember|note that|keep in mind|don't forget)/i)) {
    const content = userMessage.replace(/(remember|note that|keep in mind|don't forget)[,:]?\s*/i, '').trim();
    return {
      shouldCreate: true,
      content,
      type: 'goal',
      importance: 5
    };
  }

  // Check for strategic content keywords
  const strategyKeywords = ['strategy', 'recommend', 'should consider', 'approach'];
  const configKeywords = ['set', 'configure', 'adjust', 'change to'];
  const riskKeywords = ['risk', 'loss limit', 'stop loss', 'position size'];
  const learningKeywords = ['learned', 'pattern', 'performance shows'];

  const responseHasKeywords = (keywords: string[]) => 
    keywords.some(kw => assistantResponse.toLowerCase().includes(kw));

  const hasStrategicContent = 
    responseHasKeywords(strategyKeywords) ||
    responseHasKeywords(configKeywords) ||
    responseHasKeywords(riskKeywords) ||
    responseHasKeywords(learningKeywords);

  // Check for user preference statements
  const userPreference = userMessage.match(/(i want|i prefer|my goal is|i like to)/i);

  if (!hasStrategicContent && !userPreference) {
    return { shouldCreate: false, content: null, type: null, importance: null };
  }

  // Extract memory content
  let content: string;
  if (userPreference) {
    content = userMessage;
  } else {
    // Extract key sentence from assistant response
    const sentences = assistantResponse.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    
    // Find sentence with strategic keywords
    const keySentence = sentences.find(s => 
      s.match(/(recommend|should|set.*to|adjust.*to|learned|pattern)/i) &&
      s.length > 20 && 
      s.length < 150
    );

    content = keySentence || sentences.find(s => s.length > 20 && s.length < 150) || assistantResponse.substring(0, 150);
  }

  // Determine importance and type
  const importance = determineImportance(userMessage, assistantResponse, content);
  const type = determineType(content, userMessage);

  return {
    shouldCreate: true,
    content,
    type,
    importance
  };
}

/**
 * Determine memory importance (1-5)
 */
function determineImportance(userMessage: string, assistantResponse: string, content: string): number {
  // Explicit user request = highest importance
  if (userMessage.match(/(remember|note that)/i)) return 5;
  
  // Risk management decisions = highest
  if (content.match(/risk|loss limit|stop loss|position size/i)) return 5;
  
  // Strategy recommendations = highest
  if (content.match(/strategy|recommend.*trade|approach.*market/i)) return 5;
  
  // System configuration = high
  if (content.match(/set|configure|adjust.*to/i)) return 4;
  
  // Performance insights = high
  if (content.match(/learned|pattern|performance/i)) return 4;
  
  // User preferences = medium-high
  if (userMessage.match(/i want|i prefer/i)) return 4;
  
  // Default for other qualifying content
  return 3;
}

/**
 * Determine memory type
 */
function determineType(content: string, userMessage: string): InsertWalterMemory['type'] {
  if (content.match(/learned|pattern|performance|shows that/i)) {
    return 'lesson';
  }
  
  if (content.match(/recommend|should.*consider|strategy|approach/i)) {
    return 'decision';
  }
  
  if (content.match(/i want|i prefer|my goal|i like to/i) || userMessage.match(/i want|i prefer/i)) {
    return 'goal';
  }
  
  if (content.match(/insight|analysis|indicates|suggests/i)) {
    return 'result';
  }
  
  // Default
  return 'observation';
}

/**
 * Get fallback response for errors
 * Phase 7.3: Enhanced with natural language error handling
 */
function getFallbackResponse(error: any): string {
  const errorMsg = error?.message?.toLowerCase() || '';
  
  // Timeout errors
  if (errorMsg === 'timeout' || errorMsg.includes('timeout')) {
    return "I'm taking longer than usual to respond. The system might be under heavy load. Could you try asking that again in a moment?";
  }
  
  // API/Network errors
  if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('connection')) {
    return "I'm having trouble connecting to the data right now. This usually resolves quickly — please try again in a few seconds.";
  }
  
  // Authentication errors
  if (errorMsg.includes('auth') || errorMsg.includes('unauthorized') || errorMsg.includes('token')) {
    return "I can't access that data right now due to an authentication issue. Try refreshing your browser, and if the problem persists, you may need to log in again.";
  }
  
  // Data not found
  if (errorMsg.includes('not found') || errorMsg.includes('missing')) {
    return "I couldn't find the data you're looking for. Could you double-check what you're asking about, or try rephrasing your question?";
  }
  
  // OpenAI API errors
  if (errorMsg.includes('openai') || errorMsg.includes('model')) {
    return "I'm experiencing a temporary issue with my language processing. This should resolve shortly — please try your question again in a moment.";
  }
  
  // Rate limit errors
  if (errorMsg.includes('rate limit') || errorMsg.includes('too many')) {
    return "I've handled too many requests recently and need a brief moment to catch up. Please wait about 30 seconds and try again.";
  }
  
  // Empty response
  if (errorMsg.includes('empty') || errorMsg === '') {
    return "I generated a response, but it was empty. Could you rephrase your question so I can give you a better answer?";
  }
  
  // Generic fallback with helpful guidance
  return "I encountered an unexpected issue while processing your request. Here's what might help:\n\n" +
         "1. Try rephrasing your question\n" +
         "2. Check if you're asking about specific data that exists\n" +
         "3. If this keeps happening, the system might need a refresh\n\n" +
         "What would you like to try?";
}

/**
 * Phase 7.1c Deliverable 1 & 3: Universal Output Stringification
 * Ensures all responses - including technical payloads - are converted to natural language strings
 */
export function ensureNaturalLanguageResponse(response: any): string {
  // If already a string, return it
  if (typeof response === 'string') {
    return response;
  }
  
  // If it's an object with a message or response field, extract it
  if (response && typeof response === 'object') {
    if (response.message && typeof response.message === 'string') {
      return response.message;
    }
    if (response.response && typeof response.response === 'string') {
      return response.response;
    }
    if (response.text && typeof response.text === 'string') {
      return response.text;
    }
    
    // If it's a technical payload, wrap it in conversational text
    console.warn('[Walter] Non-string response detected, converting to natural language:', response);
    return "I've processed your request and gathered the information. Here's what I found:\n\n" +
           "The system returned technical data that I've analyzed for you. " +
           "If you need specific details, please let me know what you'd like to explore.";
  }
  
  // If it's null/undefined/boolean/number, convert to friendly message
  if (response === null || response === undefined) {
    return "I didn't get any data back from the system. Could you try rephrasing your request?";
  }
  
  if (typeof response === 'boolean') {
    return response ? "Yes, that's correct." : "No, that's not the case.";
  }
  
  if (typeof response === 'number') {
    return `The value is ${response}.`;
  }
  
  // Fallback for any other type
  return "I processed your request, but the response format was unexpected. Could you try asking in a different way?";
}

/**
 * Format date for display
 */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

/**
 * Log behavioral test result for Task 10
 */
function logBehavioralTest(
  userId: string,
  userMessage: string,
  intent: string,
  response: string,
  validation: ValidationResult
): void {
  import('./file-persistence').then(({ filePersistence }) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId,
      userMessage,
      detectedIntent: intent,
      walterResponse: response,
      validation: {
        passed: validation.passed,
        tone: validation.tone,
        safetyCompliant: validation.safetyCompliant,
        usedContext: validation.usedContext,
        issues: validation.issues,
        templateMatch: validation.templateMatch
      }
    };

    // Append log entry using filePersistence
    filePersistence.saveFile('log', 'behavioral-tests.log', JSON.stringify(logEntry) + '\n', { append: true })
      .then(() => {
        // Console log for monitoring
        console.log(`[Behavioral Test] ${validation.passed ? '✅ PASS' : '❌ FAIL'} - Intent: ${intent}, Match: ${validation.templateMatch}%`);
        if (!validation.passed) {
          console.log(`[Behavioral Test] Issues: ${validation.issues.join(', ')}`);
        }
      })
      .catch((error) => {
        console.error('[Behavioral Test] Error logging:', error);
      });
  });
}
