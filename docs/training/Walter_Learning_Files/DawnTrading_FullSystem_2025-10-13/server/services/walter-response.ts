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
import OpenAI from 'openai';
import { storage } from '../storage';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const expertContext = new ExpertContextService();

interface ResponseContext {
  purpose: string;
  memories: WalterMemory[];
  chatHistory: WalterChatLog[];
  chatSummary: string | null;
  memoryDepth: number;
  expertPrinciples: PrincipleContext[];
  referenceContext: string | null;
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
    const intent = detectIntent(userMessage);
    const userContext = await fetchUserContext(userId);
    const behavioralGuidance = getBehavioralGuidance(intent, userContext);

    console.log(`[Walter] Detected intent: ${intent} for message: "${userMessage.substring(0, 50)}..."`);

    // 4. Build prompt with behavioral enhancement, feedback acknowledgment, and adaptive preferences
    const basePrompt = await buildPrompt(context, userMessage, feedbackDetection, userId);
    const enhancedPrompt = enhanceBehavioralPrompt(basePrompt, behavioralGuidance);

    // 4. Call OpenAI
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

    return response;
  } catch (error) {
    console.error('[WalterResponseService] Error generating response:', error);
    return getFallbackResponse(error);
  }
}

/**
 * Gather all context: purpose, memories, chat history, summary, expert principles
 */
async function gatherContext(userId: string, chatId: string, userMessage: string): Promise<ResponseContext> {
  try {
    // Get user settings for memory depth
    const settings = await storage.getTradingSettings(userId);
    const memoryDepth = settings?.walterMemoryDepth || 20;

    // Get chat for history
    const chat = await storage.getWalterChatById(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    // Gather context in parallel including expert principles
    const [purposeText, memories, chatHistory, expertPrinciples] = await Promise.all([
      getWalterPurpose(userId),
      getHighImportanceMemories(userId, 5), // Top 5 high-importance memories
      storage.getWalterChatLogs(chatId, memoryDepth),
      expertContext.getRelevantPrinciples({ 
        userId, 
        topic: userMessage, 
        maxPrinciples: 5,
        chatId: chatId  // Enable usage logging (now references walter_chats.id)
      })
    ]);

    // Phase 6.2: Extract and resolve conversation references
    const entities = await referenceTracker.extractEntitiesFromChat(userId, chatId, chatHistory);
    const resolvedRef = await referenceTracker.resolveReference(userMessage, entities, userId);
    const referenceContext = resolvedRef.found ? referenceTracker.buildReferenceContext(resolvedRef) : null;

    if (referenceContext) {
      console.log(`[Walter] Resolved reference: ${resolvedRef.type} - ${resolvedRef.entity?.name}`);
    }

    console.log(`[Walter] Loaded ${expertPrinciples.length} expert principles for topic analysis`);

    return {
      purpose: purposeText,
      memories: memories || [],
      chatHistory: chatHistory || [],
      chatSummary: null, // Chat summaries handled separately by ConversationSummarizationService
      memoryDepth,
      expertPrinciples: expertPrinciples || [],
      referenceContext
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
      referenceContext: null
    };
  }
}

/**
 * Build prompt with context injection including expert principles
 */
async function buildPrompt(context: ResponseContext, userMessage: string, feedbackDetection?: any, userId?: string): Promise<string> {
  const { purpose, memories, chatHistory, chatSummary, expertPrinciples, referenceContext } = context;

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

  // Build full prompt with expert principles, reference tracking, personality, and templates (Phase 6.2)
  return `You are Walter, an AI SysAdmin Co-Pilot for a cryptocurrency day trading platform (Kraken exchange).

Your role is to:
- Help users configure and optimize their trading system
- Provide strategic insights based on market conditions and trading performance
- Answer questions about system settings, risk management, and trading strategies
- Make recommendations that align with the user's defined purpose and past learnings
- Apply expert trading principles to provide professional-grade guidance
- Understand contextual references naturally (e.g., "that one", "the last trade", "the file I sent")

${personalityGuidance}

${feedbackGuidance}

${adaptiveGuidance}

${templateGuidance}

WALTER'S DEFINED PURPOSE:
${purpose}

---

EXPERT TRADING PRINCIPLES (Apply these to your analysis):
${expertText}

IMPORTANT: Ground your recommendations in these expert principles. When discussing risk, psychology, market structure, or execution, reference relevant principles to provide credible, professional guidance.

---

RELEVANT MEMORIES (Key Learnings from Past):
${memoriesText}

---

CONVERSATION CONTEXT:
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
 * Call OpenAI API to generate response with 8-second timeout
 */
async function callOpenAI(systemPrompt: string, userMessage: string): Promise<string> {
  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), 8000); // 8 second timeout
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
 */
function getFallbackResponse(error: any): string {
  if (error.message === 'TIMEOUT') {
    return "I'm having trouble processing that right now. Could you rephrase your question?";
  }

  return "I encountered an error while processing your request. Please try again or rephrase your question.";
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
  import('fs').then(fs => {
    import('path').then(path => {
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

      const logDir = path.join(process.cwd(), 'logs');
      const logFile = path.join(logDir, 'behavioral-tests.log');

      // Ensure logs directory exists
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Append log entry
      fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

      // Console log for monitoring
      console.log(`[Behavioral Test] ${validation.passed ? '✅ PASS' : '❌ FAIL'} - Intent: ${intent}, Match: ${validation.templateMatch}%`);
      if (!validation.passed) {
        console.log(`[Behavioral Test] Issues: ${validation.issues.join(', ')}`);
      }
    });
  });
}
