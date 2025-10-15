/**
 * Phase 8.4 Addendum C: Semantic Guardrail Layer
 * Validates ticker/asset names to prevent false-positive analysis triggers
 * 
 * Blocks common English words like "THE", "YOUR", "AND" from being interpreted as tickers
 */

export interface TickerValidation {
  isValid: boolean;
  ticker?: string;
  reason?: string;
  confidence: number;
}

export interface GuardrailLog {
  timestamp: Date;
  rawInput: string;
  attemptedTicker: string;
  blocked: boolean;
  reason: string;
}

export class SemanticGuardrail {
  private readonly MODULE_NAME = 'Semantic-Guardrail';
  
  // Common English words that should never be interpreted as tickers
  private readonly BLOCKED_WORDS = new Set([
    'THE', 'A', 'AN', 'AND', 'OR', 'BUT', 'IF', 'THEN', 'WHEN',
    'WHERE', 'WHY', 'HOW', 'WHAT', 'WHO', 'WHICH', 'THIS', 'THAT',
    'THESE', 'THOSE', 'AM', 'IS', 'ARE', 'WAS', 'WERE', 'BE', 'BEEN',
    'BEING', 'HAVE', 'HAS', 'HAD', 'DO', 'DOES', 'DID', 'WILL', 'WOULD',
    'SHOULD', 'COULD', 'MAY', 'MIGHT', 'MUST', 'CAN', 'SHALL', 'FOR',
    'TO', 'FROM', 'AT', 'BY', 'WITH', 'ON', 'IN', 'OUT', 'UP', 'DOWN',
    'OFF', 'OVER', 'UNDER', 'AGAIN', 'FURTHER', 'THEN', 'ONCE', 'HERE',
    'THERE', 'ALL', 'BOTH', 'EACH', 'FEW', 'MORE', 'MOST', 'OTHER',
    'SOME', 'SUCH', 'NO', 'NOR', 'NOT', 'ONLY', 'OWN', 'SAME', 'SO',
    'THAN', 'TOO', 'VERY', 'YES', 'YOUR', 'MY', 'HIS', 'HER', 'ITS',
    'OUR', 'THEIR', 'ME', 'HIM', 'US', 'THEM', 'IT'
  ]);

  // Known crypto ticker patterns
  private readonly CRYPTO_PATTERNS = [
    /^[A-Z]{2,5}USD$/,    // BTCUSD, ETHUSD
    /^[A-Z]{2,5}BTC$/,    // ETHBTC, LINKBTC
    /^[A-Z]{2,5}ETH$/,    // LINKETH
    /^X[A-Z]{2,3}Z[A-Z]{3}$/, // Kraken format: XXBTZUSD
    /^[A-Z]{3,5}$/,       // BTC, ETH, LINK (3-5 chars)
  ];

  // Well-known tickers whitelist
  private readonly KNOWN_TICKERS = new Set([
    'BTC', 'BTCUSD', 'XBTUSD', 'XXBTZUSD',
    'ETH', 'ETHUSD', 'XETHZUSD',
    'SOL', 'SOLUSD',
    'ADA', 'ADAUSD',
    'DOT', 'DOTUSD',
    'LINK', 'LINKUSD',
    'MATIC', 'MATICUSD',
    'AVAX', 'AVAXUSD',
    'UNI', 'UNIUSD',
    'ATOM', 'ATOMUSD',
  ]);

  private blockedAttempts: GuardrailLog[] = [];
  private readonly MAX_LOG_SIZE = 100;

  /**
   * Validate if a word is a legitimate ticker symbol
   */
  validateTicker(word: string, context?: string): TickerValidation {
    const ticker = word.toUpperCase().trim();

    // Check if it's a blocked common word
    if (this.BLOCKED_WORDS.has(ticker)) {
      this.logBlocked(context || word, ticker, 'Common English word blocked');
      return {
        isValid: false,
        reason: `"${ticker}" is a common word, not a ticker symbol`,
        confidence: 1.0,
      };
    }

    // Check if it's in the known tickers whitelist
    if (this.KNOWN_TICKERS.has(ticker)) {
      return {
        isValid: true,
        ticker,
        confidence: 0.95,
      };
    }

    // Check against crypto patterns
    for (const pattern of this.CRYPTO_PATTERNS) {
      if (pattern.test(ticker)) {
        return {
          isValid: true,
          ticker,
          confidence: 0.85,
        };
      }
    }

    // Check length and character requirements
    if (ticker.length < 2 || ticker.length > 10) {
      this.logBlocked(context || word, ticker, 'Invalid ticker length');
      return {
        isValid: false,
        reason: `"${ticker}" has invalid length for a ticker (2-10 chars)`,
        confidence: 0.9,
      };
    }

    // Check if it contains only alphanumeric characters
    if (!/^[A-Z0-9]+$/.test(ticker)) {
      this.logBlocked(context || word, ticker, 'Contains invalid characters');
      return {
        isValid: false,
        reason: `"${ticker}" contains invalid characters for a ticker`,
        confidence: 0.9,
      };
    }

    // If we get here, it might be a valid ticker but we're not certain
    // Allow it but with lower confidence
    return {
      isValid: true,
      ticker,
      confidence: 0.6,
    };
  }

  /**
   * Extract and validate tickers from message
   */
  extractTickers(message: string): string[] {
    const words = message.toUpperCase().split(/\s+/);
    const validTickers: string[] = [];

    for (const word of words) {
      const cleaned = word.replace(/[^A-Z0-9]/g, '');
      if (cleaned.length >= 2) {
        const validation = this.validateTicker(cleaned, message);
        if (validation.isValid && validation.ticker) {
          validTickers.push(validation.ticker);
        }
      }
    }

    return validTickers;
  }

  /**
   * Check if message contains valid analysis context
   */
  isValidAnalysisContext(message: string, ticker: string): boolean {
    const msg = message.toLowerCase();
    
    // Must contain analysis keywords near the ticker
    const analysisKeywords = [
      'analyze', 'analysis', 'check', 'look at', 'examine', 'review',
      'study', 'what', 'how', 'tell me', 'thoughts', 'opinion'
    ];

    const hasAnalysisKeyword = analysisKeywords.some(keyword => msg.includes(keyword));

    if (!hasAnalysisKeyword) {
      this.logBlocked(message, ticker, 'No analysis keyword in context');
      return false;
    }

    return true;
  }

  /**
   * Log blocked attempt for transparency
   */
  private logBlocked(rawInput: string, attemptedTicker: string, reason: string): void {
    const log: GuardrailLog = {
      timestamp: new Date(),
      rawInput: rawInput.substring(0, 100), // Limit length
      attemptedTicker,
      blocked: true,
      reason,
    };

    this.blockedAttempts.push(log);

    // Keep log size manageable
    if (this.blockedAttempts.length > this.MAX_LOG_SIZE) {
      this.blockedAttempts.shift();
    }

    console.log(
      `[${this.MODULE_NAME}] 🚫 Blocked: "${attemptedTicker}" - ${reason}`
    );
  }

  /**
   * Get recent blocked attempts for debugging
   */
  getBlockedAttempts(limit: number = 20): GuardrailLog[] {
    return this.blockedAttempts.slice(-limit);
  }

  /**
   * Get stats for health reporting
   */
  getStats(): {
    totalBlocked: number;
    recentBlocked: number;
    topBlockedWords: { word: string; count: number }[];
  } {
    const recentBlocked = this.blockedAttempts.filter(
      log => Date.now() - log.timestamp.getTime() < 3600000 // Last hour
    ).length;

    // Count top blocked words
    const wordCounts = new Map<string, number>();
    for (const log of this.blockedAttempts) {
      const count = wordCounts.get(log.attemptedTicker) || 0;
      wordCounts.set(log.attemptedTicker, count + 1);
    }

    const topBlockedWords = Array.from(wordCounts.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalBlocked: this.blockedAttempts.length,
      recentBlocked,
      topBlockedWords,
    };
  }

  /**
   * Clear logs (for testing)
   */
  clearLogs(): void {
    this.blockedAttempts = [];
    console.log(`[${this.MODULE_NAME}] Logs cleared`);
  }
}

export const semanticGuardrail = new SemanticGuardrail();
