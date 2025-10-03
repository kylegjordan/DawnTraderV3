// Simple token estimation utility
// For accurate counts, use tiktoken library, but this provides reasonable estimates

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

// Pricing for GPT-4o (as of Oct 2025) - adjust as needed
const PRICING = {
  'gpt-4o': {
    input: 0.0025 / 1000,  // $0.0025 per 1K input tokens
    output: 0.01 / 1000,   // $0.01 per 1K output tokens
  },
  'gpt-4o-mini': {
    input: 0.00015 / 1000,
    output: 0.0006 / 1000,
  }
};

/**
 * Estimates token count for text
 * Rule of thumb: ~4 characters = 1 token for English text
 */
export function estimateTokens(text: string): number {
  // More accurate estimation:
  // - Count words and characters
  // - Account for special tokens
  const chars = text.length;
  const words = text.split(/\s+/).length;
  
  // Average of character-based (chars/4) and word-based (words * 1.3) estimates
  const charEstimate = chars / 4;
  const wordEstimate = words * 1.3;
  
  return Math.ceil((charEstimate + wordEstimate) / 2);
}

/**
 * Estimates token count for an array of messages
 */
export function estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0;
  
  // System message overhead
  total += 3; // every request has some overhead
  
  for (const message of messages) {
    // Each message has overhead: role + content + formatting
    total += 4; // message overhead
    total += estimateTokens(message.content);
  }
  
  return total;
}

/**
 * Calculates cost for token usage
 */
export function calculateCost(inputTokens: number, outputTokens: number, model: string = 'gpt-4o'): number {
  const pricing = PRICING[model as keyof typeof PRICING] || PRICING['gpt-4o'];
  
  const inputCost = inputTokens * pricing.input;
  const outputCost = outputTokens * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * Trims messages array to fit within token limit
 * Always keeps system message (first) and removes oldest user/assistant messages
 */
export function trimMessagesToTokenLimit(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 4000
): Array<{ role: string; content: string }> {
  if (messages.length === 0) return messages;
  
  // Always keep system message
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');
  
  let currentTokens = estimateMessagesTokens(systemMessages);
  const trimmedConversation: typeof conversationMessages = [];
  
  // Add messages from newest to oldest until we hit the limit
  for (let i = conversationMessages.length - 1; i >= 0; i--) {
    const msg = conversationMessages[i];
    const msgTokens = estimateTokens(msg.content) + 4; // +4 for message overhead
    
    if (currentTokens + msgTokens > maxTokens) {
      break;
    }
    
    trimmedConversation.unshift(msg);
    currentTokens += msgTokens;
  }
  
  return [...systemMessages, ...trimmedConversation];
}

/**
 * Trims messages to keep only last N messages
 */
export function trimMessagesToCount(
  messages: Array<{ role: string; content: string }>,
  maxCount: number = 20
): Array<{ role: string; content: string }> {
  if (messages.length === 0) return messages;
  
  // Always keep system message
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');
  
  // Keep last maxCount conversation messages
  const trimmedConversation = conversationMessages.slice(-maxCount);
  
  return [...systemMessages, ...trimmedConversation];
}

/**
 * Gets human-readable cost estimate
 */
export function formatCostEstimate(cost: number): string {
  if (cost < 0.01) {
    return `<$0.01`;
  }
  return `$${cost.toFixed(4)}`;
}

/**
 * Gets human-readable token count
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return `${tokens} tokens`;
  }
  return `${(tokens / 1000).toFixed(1)}K tokens`;
}
