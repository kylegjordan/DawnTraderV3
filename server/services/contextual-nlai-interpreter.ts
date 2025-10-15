/**
 * Phase 8.4 Addendum C: Contextual NLAI Interpreter
 * Enhanced Natural Language Action Interpreter using CIE (Contextual Intent Engine)
 * 
 * Integrates:
 * - Intent Classifier with confidence scoring
 * - Semantic Guardrail for ticker validation
 * - Cortex conversation context
 */

import { intentClassifier, type IntentClassification } from './intent-classifier';
import { semanticGuardrail } from './semantic-guardrail';
import { cortexCore } from './cortex/cortex-core';
import { nlaiActionRegistry } from './nlai-action-registry';
import { nlaiExecutionBroker } from './nlai-execution-broker';
import type { ActionIntent, ActionResult } from './nlai-action-registry';

export interface ContextualNLAIResponse {
  isActionable: boolean;
  intent?: IntentClassification;
  actionId?: string;
  executionResult?: ActionResult;
  contextUsed?: {
    hadPreviousContext: boolean;
    topic?: string | null;
    lastIntent?: string | null;
    minutesSinceLastIntent?: number;
  };
  guardrailViolation?: {
    blocked: boolean;
    reason: string;
  };
  processingTimeMs: number;
}

export class ContextualNLAIInterpreter {
  private readonly MODULE_NAME = 'Contextual-NLAI';
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.80; // Phase 8.4 Production: Require 80% confidence to execute actions

  /**
   * Interpret user message with full context awareness
   */
  async interpret(
    userId: string,
    userMessage: string
  ): Promise<ContextualNLAIResponse> {
    const startTime = Date.now();
    
    console.log(`[${this.MODULE_NAME}] Interpreting: "${userMessage.substring(0, 60)}..."`);

    // Step 1: Get conversation context from Cortex
    const conversationContext = cortexCore.getConversationContext(userId);
    const hadPreviousContext = conversationContext !== null;

    if (conversationContext) {
      console.log(
        `[${this.MODULE_NAME}] Context: topic="${conversationContext.topic}", lastIntent="${conversationContext.lastIntent}", ${conversationContext.minutesSinceLastIntent}m ago`
      );
    }

    // Step 2: Classify intent with confidence
    const classification = intentClassifier.classify(userMessage);
    console.log(
      `[${this.MODULE_NAME}] Classified: ${classification.intent} (confidence: ${classification.confidence.toFixed(2)})`
    );

    // Step 3: Check confidence threshold
    if (classification.confidence < this.MIN_CONFIDENCE_THRESHOLD) {
      console.log(
        `[${this.MODULE_NAME}] Low confidence (${classification.confidence.toFixed(2)} < ${this.MIN_CONFIDENCE_THRESHOLD}), treating as general chat`
      );

      return {
        isActionable: false,
        intent: classification,
        contextUsed: hadPreviousContext ? {
          hadPreviousContext,
          topic: conversationContext?.topic,
          lastIntent: conversationContext?.lastIntent,
          minutesSinceLastIntent: conversationContext?.minutesSinceLastIntent,
        } : { hadPreviousContext: false },
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 4: Apply semantic guardrail for analysis requests
    if (classification.intent === 'analysis_request' && classification.entities?.ticker) {
      const tickerValidation = semanticGuardrail.validateTicker(
        classification.entities.ticker,
        userMessage
      );

      if (!tickerValidation.isValid) {
        console.log(
          `[${this.MODULE_NAME}] 🚫 Guardrail blocked ticker: ${classification.entities.ticker} - ${tickerValidation.reason}`
        );

        return {
          isActionable: false,
          intent: classification,
          guardrailViolation: {
            blocked: true,
            reason: tickerValidation.reason || 'Invalid ticker',
          },
          contextUsed: hadPreviousContext ? {
            hadPreviousContext,
            topic: conversationContext?.topic,
            lastIntent: conversationContext?.lastIntent,
            minutesSinceLastIntent: conversationContext?.minutesSinceLastIntent,
          } : { hadPreviousContext: false },
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Validate analysis context
      if (!semanticGuardrail.isValidAnalysisContext(userMessage, classification.entities.ticker)) {
        return {
          isActionable: false,
          intent: classification,
          guardrailViolation: {
            blocked: true,
            reason: 'No analysis keyword detected in context',
          },
          processingTimeMs: Date.now() - startTime,
        };
      }
    }

    // Step 5: Map intent to action
    const actionMapping = this.mapIntentToAction(classification, conversationContext);
    
    if (!actionMapping) {
      console.log(`[${this.MODULE_NAME}] No action mapping for intent: ${classification.intent}`);
      
      // Store conversation context for next interaction
      cortexCore.setConversationSnapshot(
        userId,
        this.extractTopic(userMessage, classification),
        classification.intent,
        'Phase 8.4'
      );

      return {
        isActionable: false,
        intent: classification,
        contextUsed: hadPreviousContext ? {
          hadPreviousContext,
          topic: conversationContext?.topic,
          lastIntent: conversationContext?.lastIntent,
          minutesSinceLastIntent: conversationContext?.minutesSinceLastIntent,
        } : { hadPreviousContext: false },
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 6: Execute action
    const executionResult = await nlaiExecutionBroker.dispatch(
      userId,
      actionMapping.actionId,
      actionMapping.intent
    );

    // Step 7: Update conversation context
    cortexCore.setConversationSnapshot(
      userId,
      this.extractTopic(userMessage, classification),
      classification.intent,
      'Phase 8.4'
    );

    const totalTime = Date.now() - startTime;
    console.log(
      `[${this.MODULE_NAME}] Action executed: ${actionMapping.actionId} in ${totalTime}ms`
    );

    return {
      isActionable: true,
      intent: classification,
      actionId: actionMapping.actionId,
      executionResult,
      contextUsed: hadPreviousContext ? {
        hadPreviousContext,
        topic: conversationContext?.topic,
        lastIntent: conversationContext?.lastIntent,
        minutesSinceLastIntent: conversationContext?.minutesSinceLastIntent,
      } : { hadPreviousContext: false },
      processingTimeMs: totalTime,
    };
  }

  /**
   * Map classified intent to actionable command
   */
  private mapIntentToAction(
    classification: IntentClassification,
    context: any
  ): { actionId: string; intent: ActionIntent } | null {
    const { intent, action, entities } = classification;

    switch (intent) {
      case 'simulation_control':
        if (action === 'start') {
          return {
            actionId: 'start_paper_simulation',
            intent: { verb: 'start', object: 'simulation' },
          };
        } else if (action === 'stop') {
          return {
            actionId: 'stop_paper_simulation',
            intent: { verb: 'stop', object: 'simulation' },
          };
        }
        break;

      case 'status_check':
        if (action === 'system' || action === 'health') {
          return {
            actionId: 'check_system_health',
            intent: { verb: 'check', object: 'health' },
          };
        } else if (action === 'simulation') {
          return {
            actionId: 'check_simulation_status',
            intent: { verb: 'check', object: 'simulation' },
          };
        }
        break;

      case 'report_generation':
        if (action === 'summary' || action === 'results') {
          return {
            actionId: 'generate_report',
            intent: { verb: 'generate', object: 'report' },
          };
        }
        break;

      case 'analysis_request':
        if (action === 'analyze' && entities?.ticker) {
          return {
            actionId: 'analyze_ticker',
            intent: {
              verb: 'analyze',
              object: entities.ticker,
              modifiers: [entities.timeframe || 'current'],
            },
          };
        }
        break;
    }

    return null;
  }

  /**
   * Extract topic from message for context storage
   */
  private extractTopic(message: string, classification: IntentClassification): string | null {
    if (classification.entities?.ticker) {
      return classification.entities.ticker;
    }

    if (classification.intent === 'simulation_control') {
      return 'Simulation';
    }

    if (classification.intent === 'status_check') {
      return 'System Status';
    }

    if (classification.intent === 'report_generation') {
      return 'Reports';
    }

    return null;
  }

  /**
   * Format execution feedback for Walter
   */
  formatExecutionFeedback(response: ContextualNLAIResponse): string {
    if (!response.isActionable) {
      if (response.guardrailViolation?.blocked) {
        return `I noticed you mentioned "${response.intent?.entities?.ticker}", but ${response.guardrailViolation.reason}. If you'd like to analyze a specific cryptocurrency, please use a valid ticker symbol like BTC, ETH, or SOL.`;
      }
      return ''; // Will continue with normal conversational flow
    }

    const { executionResult, intent } = response;

    if (!executionResult) {
      return 'I attempted to execute that action, but encountered an issue.';
    }

    let feedback = executionResult.message;

    // Add confidence transparency
    if (intent && intent.confidence < 0.90) {
      feedback += `\n\n_(I interpreted this with ${(intent.confidence * 100).toFixed(0)}% confidence. Let me know if I misunderstood.)_`;
    }

    // Add context awareness note
    if (response.contextUsed?.hadPreviousContext && response.contextUsed.lastIntent) {
      feedback += `\n\n_(I remembered we were discussing ${response.contextUsed.topic || 'this topic'} ${response.contextUsed.minutesSinceLastIntent}m ago.)_`;
    }

    return feedback;
  }
}

export const contextualNLAIInterpreter = new ContextualNLAIInterpreter();
