import { nlaiActionRegistry, type ActionIntent } from './nlai-action-registry';
import { nlaiExecutionBroker } from './nlai-execution-broker';

interface NLAIResponse {
  isActionable: boolean;
  actionId?: string;
  intent?: ActionIntent;
  executionResult?: {
    success: boolean;
    message: string;
    data?: any;
  };
  processingTimeMs?: number;
}

export class NaturalLanguageActionInterpreter {
  private readonly MODULE_NAME = 'NLAI-Interpreter';
  private readonly TARGET_LATENCY_MS = 10; // Target < 10ms for intent detection

  async interpret(userId: string, userMessage: string): Promise<NLAIResponse> {
    const startTime = Date.now();
    
    console.log(`[${this.MODULE_NAME}] Interpreting message: "${userMessage.substring(0, 60)}..."`);

    const matched = nlaiActionRegistry.matchIntent(userMessage);

    if (!matched) {
      const processingTime = Date.now() - startTime;
      console.log(`[${this.MODULE_NAME}] No action detected (${processingTime}ms)`);
      
      return {
        isActionable: false,
        processingTimeMs: processingTime,
      };
    }

    const { actionId, intent } = matched;
    const detectionTime = Date.now() - startTime;

    console.log(
      `[${this.MODULE_NAME}] Action detected: ${actionId} (${detectionTime}ms)`
    );

    if (detectionTime > this.TARGET_LATENCY_MS) {
      console.warn(
        `[${this.MODULE_NAME}] ⚠️  Detection latency ${detectionTime}ms exceeds target ${this.TARGET_LATENCY_MS}ms`
      );
    }

    const executionResult = await nlaiExecutionBroker.dispatch(
      userId,
      actionId,
      intent
    );

    const totalTime = Date.now() - startTime;

    console.log(
      `[${this.MODULE_NAME}] Interpretation complete in ${totalTime}ms (detection: ${detectionTime}ms, execution: ${totalTime - detectionTime}ms)`
    );

    return {
      isActionable: true,
      actionId,
      intent,
      executionResult: {
        success: executionResult.success,
        message: executionResult.message,
        data: executionResult.data,
      },
      processingTimeMs: totalTime,
    };
  }

  async interpretAsync(userId: string, userMessage: string): Promise<NLAIResponse> {
    const startTime = Date.now();
    
    const matched = nlaiActionRegistry.matchIntent(userMessage);

    if (!matched) {
      return {
        isActionable: false,
        processingTimeMs: Date.now() - startTime,
      };
    }

    const { actionId, intent } = matched;
    
    await nlaiExecutionBroker.dispatchAsync(userId, actionId, intent);

    return {
      isActionable: true,
      actionId,
      intent,
      executionResult: {
        success: true,
        message: `Action ${actionId} dispatched for background execution.`,
      },
      processingTimeMs: Date.now() - startTime,
    };
  }

  getPerformanceMetrics(): {
    targetLatencyMs: number;
    executionStats: ReturnType<typeof nlaiExecutionBroker.getExecutionStats>;
  } {
    return {
      targetLatencyMs: this.TARGET_LATENCY_MS,
      executionStats: nlaiExecutionBroker.getExecutionStats(),
    };
  }

  getAvailableActions(): Array<{
    id: string;
    description: string;
    category: string;
    examplePhrases: string[];
  }> {
    const actions = nlaiActionRegistry.getAllActions();
    
    return actions.map(action => ({
      id: action.id,
      description: action.description,
      category: action.category,
      examplePhrases: action.patterns.map(pattern => {
        const examples: Record<string, string[]> = {
          start_paper_simulation: [
            'Please start the paper trading simulation',
            'Begin paper mode',
            'Run phase 8.4 simulation',
          ],
          stop_paper_simulation: [
            'Stop the paper trading',
            'End the simulation',
            'Halt paper mode',
          ],
          check_system_health: [
            'Check system health',
            'What\'s the system status',
            'Show system health',
          ],
          generate_report: [
            'Generate a daily report',
            'Create a report',
            'Compile weekly summary',
          ],
          check_simulation_status: [
            'Is paper trading running?',
            'Check simulation status',
            'Show paper mode status',
          ],
        };
        
        return examples[action.id] || [];
      }).flat(),
    }));
  }

  formatExecutionFeedback(response: NLAIResponse): string {
    if (!response.isActionable) {
      return '';
    }

    if (!response.executionResult) {
      return `Action "${response.actionId}" was detected but execution result is unavailable.`;
    }

    if (response.executionResult.success) {
      return `✅ ${response.executionResult.message}`;
    } else {
      return `❌ ${response.executionResult.message}`;
    }
  }
}

export const nlaiInterpreter = new NaturalLanguageActionInterpreter();
