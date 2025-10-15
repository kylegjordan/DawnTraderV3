/**
 * Phase 8.4 Addendum C: Contextual Intent Engine (CIE)
 * Intent Classifier with Confidence Scoring
 * 
 * Replaces simple regex matching with contextual intent classification
 * Target: <10ms latency for local execution
 */

export type IntentType = 
  | 'simulation_control'  // start, stop, restart simulation
  | 'analysis_request'    // analyze ticker, screen, compare
  | 'report_generation'   // generate summary, log, results
  | 'status_check'        // system, simulation, health, progress
  | 'general_chat';       // conversational, non-action

export type SimulationAction = 'start' | 'stop' | 'restart';
export type AnalysisAction = 'analyze' | 'screen' | 'compare';
export type ReportAction = 'summary' | 'log' | 'results';
export type StatusAction = 'system' | 'simulation' | 'health' | 'progress';

export interface IntentClassification {
  intent: IntentType;
  action?: SimulationAction | AnalysisAction | ReportAction | StatusAction;
  confidence: number; // 0.0 to 1.0
  entities?: {
    ticker?: string;
    timeframe?: string;
    [key: string]: any;
  };
  processingTimeMs: number;
}

export class IntentClassifier {
  private readonly MODULE_NAME = 'Intent-Classifier';
  private readonly TARGET_LATENCY_MS = 10;

  /**
   * Classify user message into intent with confidence score
   */
  classify(userMessage: string): IntentClassification {
    const startTime = Date.now();
    const msg = userMessage.toLowerCase().trim();

    // Try each intent classifier in priority order
    let result = this.classifySimulationControl(msg);
    if ((result.confidence || 0) >= 0.7) {
      return this.finalizeResult(result, startTime);
    }

    result = this.classifyStatusCheck(msg);
    if ((result.confidence || 0) >= 0.7) {
      return this.finalizeResult(result, startTime);
    }

    result = this.classifyReportGeneration(msg);
    if ((result.confidence || 0) >= 0.7) {
      return this.finalizeResult(result, startTime);
    }

    result = this.classifyAnalysisRequest(msg);
    if ((result.confidence || 0) >= 0.7) {
      return this.finalizeResult(result, startTime);
    }

    // Default to general chat with low confidence
    return this.finalizeResult({
      intent: 'general_chat',
      confidence: 0.5,
    }, startTime);
  }

  /**
   * Classify simulation control intents
   */
  private classifySimulationControl(msg: string): Partial<IntentClassification> {
    const patterns = {
      start: [
        /(?:please\s+)?(?:start|begin|run|initiate|launch)(?:\s+(?:the|a))?\s*(?:paper[\s-]?(?:trad(?:e|ing)|sim(?:ulation)?))/i,
        /(?:please\s+)?(?:start|begin)(?:\s+phase\s+[\d.]+)?(?:\s+dry[\s-]?run)?(?:\s+sim(?:ulation)?)/i,
        /(?:please\s+)?(?:activate|enable)(?:\s+paper[\s-]?mode)/i,
        /(?:kick off|fire up|spin up)(?:\s+(?:the|a))?\s*(?:sim(?:ulation)?|paper)/i,
      ],
      stop: [
        /(?:please\s+)?(?:stop|end|halt|terminate|kill|cancel|abort)(?:\s+(?:the|a))?\s*(?:paper[\s-]?(?:trad(?:e|ing)|sim(?:ulation)?))/i,
        /(?:please\s+)?(?:stop|end|halt)(?:\s+(?:the|a))?\s*(?:sim(?:ulation)?|trading)/i,
        /(?:please\s+)?(?:deactivate|disable)(?:\s+paper[\s-]?mode)/i,
        /(?:shut down|turn off)(?:\s+(?:the|a))?\s*(?:sim(?:ulation)?|paper)/i,
      ],
      restart: [
        /(?:please\s+)?(?:restart|reboot|reset)(?:\s+(?:the|a))?\s*(?:paper[\s-]?(?:trad(?:e|ing)|sim(?:ulation)?))/i,
        /(?:please\s+)?(?:restart|reset)(?:\s+(?:the|a))?\s*(?:sim(?:ulation)?|trading)/i,
      ],
    };

    // Check for action patterns
    for (const [action, actionPatterns] of Object.entries(patterns)) {
      for (const pattern of actionPatterns) {
        if (pattern.test(msg)) {
          return {
            intent: 'simulation_control',
            action: action as SimulationAction,
            confidence: 0.95,
          };
        }
      }
    }

    // Check for contextual phrases (lower confidence)
    const contextualPatterns = [
      { pattern: /(?:^|\s)(?:go|let's go|do it|proceed)/i, action: 'start', confidence: 0.75 },
      { pattern: /(?:^|\s)(?:stop it|enough|done)/i, action: 'stop', confidence: 0.75 },
    ];

    for (const ctx of contextualPatterns) {
      if (ctx.pattern.test(msg) && (msg.includes('sim') || msg.includes('paper') || msg.includes('trad'))) {
        return {
          intent: 'simulation_control',
          action: ctx.action as SimulationAction,
          confidence: ctx.confidence,
        };
      }
    }

    return { intent: 'simulation_control', confidence: 0 };
  }

  /**
   * Classify status check intents
   */
  private classifyStatusCheck(msg: string): Partial<IntentClassification> {
    const patterns = {
      system: [
        /(?:what'?s|how'?s|check|show|display)(?:\s+(?:the|my))?\s*(?:system|health|status)/i,
        /(?:system|overall)\s+(?:health|status|state)/i,
        /(?:health|status)\s+(?:check|report|update)/i,
      ],
      simulation: [
        /(?:what'?s|how'?s|check|show|display)(?:\s+(?:the|my))?\s*(?:sim(?:ulation)?|paper[\s-]?(?:trade|trading))\s*(?:status|state|progress)?/i,
        /(?:sim(?:ulation)?|paper)\s+(?:status|state|progress|running)/i,
        /is\s+(?:the\s+)?(?:sim(?:ulation)?|paper)\s+(?:running|active)/i,
      ],
      health: [
        /(?:system|service|server)\s+(?:health|status|uptime)/i,
        /(?:how|what)'?s\s+(?:the\s+)?(?:system|everything|things)\s+(?:doing|looking|running)/i,
      ],
      progress: [
        /(?:what'?s|how'?s|show|check)\s+(?:the\s+)?(?:progress|performance)/i,
        /(?:how|what)'?s\s+(?:it|everything|the system)\s+(?:doing|performing)/i,
      ],
    };

    for (const [action, actionPatterns] of Object.entries(patterns)) {
      for (const pattern of actionPatterns) {
        if (pattern.test(msg)) {
          return {
            intent: 'status_check',
            action: action as StatusAction,
            confidence: 0.90,
          };
        }
      }
    }

    return { intent: 'status_check', confidence: 0 };
  }

  /**
   * Classify report generation intents
   */
  private classifyReportGeneration(msg: string): Partial<IntentClassification> {
    const patterns = {
      summary: [
        /(?:give|show|generate|create)(?:\s+me)?(?:\s+a)?\s+(?:summary|overview|recap)/i,
        /(?:summarize|recap)(?:\s+(?:the|my))?\s*(?:performance|results|trades)/i,
      ],
      log: [
        /(?:show|display|get)(?:\s+me)?(?:\s+(?:the|my))?\s*(?:logs|log file|history)/i,
        /(?:what|show)\s+(?:happened|went wrong|errors)/i,
      ],
      results: [
        /(?:show|display|get)(?:\s+me)?(?:\s+(?:the|my))?\s*(?:results|performance|metrics)/i,
        /(?:how did|what are)\s+(?:the|my)\s+(?:results|performance)/i,
      ],
    };

    for (const [action, actionPatterns] of Object.entries(patterns)) {
      for (const pattern of actionPatterns) {
        if (pattern.test(msg)) {
          return {
            intent: 'report_generation',
            action: action as ReportAction,
            confidence: 0.88,
          };
        }
      }
    }

    return { intent: 'report_generation', confidence: 0 };
  }

  /**
   * Classify analysis request intents
   * Enhanced with semantic guardrail - validates tickers before classification
   */
  private classifyAnalysisRequest(msg: string): Partial<IntentClassification> {
    const patterns = {
      analyze: [
        /(?:analyze|check|look at|examine|review|study)(?:\s+(?:the|this))?\s+([A-Z]{2,5}(?:USD|BTC|ETH)?)/i,
        /(?:what|how)'?s\s+([A-Z]{2,5}(?:USD|BTC|ETH)?)\s+(?:doing|looking|performing)/i,
        /(?:tell me about|thoughts on)\s+([A-Z]{2,5}(?:USD|BTC|ETH)?)/i,
      ],
      screen: [
        /(?:screen|scan|find|search for)\s+(?:opportunities|setups|trades)/i,
        /(?:what|any)\s+(?:opportunities|setups|signals)/i,
      ],
      compare: [
        /(?:compare|versus|vs\.?)\s+([A-Z]{2,5})/i,
        /(?:which is better|better between)\s+([A-Z]{2,5})/i,
      ],
    };

    for (const [action, actionPatterns] of Object.entries(patterns)) {
      for (const pattern of actionPatterns) {
        const match = msg.match(pattern);
        if (match) {
          // If we have a potential ticker, validate it with semantic guardrail
          if (match[1]) {
            // Import semantic guardrail inline to avoid circular dependencies
            const { semanticGuardrail } = require('./semantic-guardrail');
            const validation = semanticGuardrail.validateTicker(match[1], msg);
            
            // Only proceed if ticker is valid
            if (validation.isValid && validation.ticker) {
              const entities: { ticker: string } = { ticker: validation.ticker };
              
              return {
                intent: 'analysis_request',
                action: action as AnalysisAction,
                confidence: Math.min(0.85, validation.confidence), // Cap at 0.85 but respect guardrail confidence
                entities,
              };
            } else {
              // Blocked by guardrail - return low confidence to prevent action
              console.log(`[Intent-Classifier] Ticker validation failed: ${match[1]} - ${validation.reason}`);
              return { intent: 'analysis_request', confidence: 0 };
            }
          }

          // No ticker extracted for this action - continue search
        }
      }
    }

    return { intent: 'analysis_request', confidence: 0 };
  }

  /**
   * Finalize result with processing time
   */
  private finalizeResult(
    partial: Partial<IntentClassification>,
    startTime: number
  ): IntentClassification {
    const processingTimeMs = Date.now() - startTime;

    if (processingTimeMs > this.TARGET_LATENCY_MS) {
      console.warn(
        `[${this.MODULE_NAME}] ⚠️ Classification latency ${processingTimeMs}ms exceeds target ${this.TARGET_LATENCY_MS}ms`
      );
    }

    return {
      intent: partial.intent || 'general_chat',
      action: partial.action,
      confidence: partial.confidence || 0.5,
      entities: partial.entities,
      processingTimeMs,
    };
  }
}

export const intentClassifier = new IntentClassifier();
