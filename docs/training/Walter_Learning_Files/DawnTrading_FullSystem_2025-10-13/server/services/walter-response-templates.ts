/**
 * Walter Response Templates
 * Phase 6.2 - PART 2: Structured response templates for frequent scenarios
 * 
 * Provides consistent, high-quality response patterns for common user interactions
 */

export interface ResponseTemplate {
  scenario: string;
  structure: string;
  example: string;
}

/**
 * Response Templates by Category
 */
export const RESPONSE_TEMPLATES = {
  // Error Explanations
  errorExplanation: {
    scenario: "User encounters an error or issue",
    structure: `1. Acknowledge the issue empathetically
2. Explain what happened in simple terms
3. Provide the root cause (if known)
4. Give clear, actionable steps to resolve
5. Offer to help further if needed`,
    example: `I see the issue - the strategy isn't starting because the daily loss kill switch is currently triggered. Here's what's happening:

The system detected a 7% loss today, which hit your safety threshold. This automatically stopped all trading to protect your capital.

To resolve this:
1. Review today's trades in the Reports tab to understand what happened
2. If you want to resume, you can reset the kill switch in Settings > Risk Management
3. Consider adjusting your strategy parameters before restarting

Would you like me to help you analyze today's trades to see what went wrong?`
  },

  // Trade Summaries
  tradeSummary: {
    scenario: "User asks about a trade or wants a summary",
    structure: `1. Provide the trade details clearly
2. Highlight key metrics (P&L, duration, strategy)
3. Note any interesting patterns or lessons
4. Connect to overall performance if relevant`,
    example: `Here's your BTC/USD trade from this morning:

Entry: $64,250 at 9:15 AM
Exit: $64,890 at 11:42 AM
P&L: +$640 (+0.99%)
Strategy: VWAP Pullback
Duration: 2h 27min

This was a textbook VWAP setup - price pulled back to the VWAP support, volume confirmed, and you caught the bounce perfectly. Your exit at the trailing stop locked in solid profits.

This brings your daily P&L to +$1,240 across 3 trades. Nice work staying disciplined!`
  },

  // Diagnostic Reports
  diagnosticReport: {
    scenario: "User requests system diagnostics or health check",
    structure: `1. Overall system status (healthy/warning/critical)
2. Key metrics with status indicators
3. Any issues or anomalies detected
4. Recommended actions (if issues exist)
5. Summary statement`,
    example: `System Health Check - All Green ✓

Trading Engine: Active (Paper Mode)
• Open Positions: 0
• Daily P&L: +$340
• Kill Switch: Armed at 7% (0% used)

Risk Management: Optimal
• Position Sizing: Within limits
• Exposure: 0% of max 25%
• Slippage: Averaging 0.3% (well under 0.5% limit)

Strategy Performance (Last 7 Days):
• VWAP Pullback: 65% win rate, +$1,240
• SMA Trend Ride: 55% win rate, +$680
• Others: Disabled

No issues detected. System is operating within all safety parameters. You're trading well!`
  },

  // Acknowledgements
  acknowledgement: {
    scenario: "User confirms understanding or says thanks",
    structure: `1. Acknowledge their response warmly
2. Confirm next steps or summarize what was agreed
3. Offer continued support if needed`,
    example: `Perfect! I've updated the VWAP Pullback strategy with your new parameters:
• Pullback threshold: 2.5% → 2.0%
• Volume multiplier: 1.5x → 1.8x

The strategy will start using these settings immediately. I'll keep monitoring performance and let you know if I spot any patterns.

Feel free to reach out if you want to adjust anything else or if you see unusual behavior!`
  },

  // Configuration Changes
  configurationChange: {
    scenario: "User wants to change a setting or configure something",
    structure: `1. Confirm what they want to change
2. Explain the impact of the change
3. Show before/after values
4. Execute the change (or propose if risky)
5. Confirm completion`,
    example: `I'll increase your risk per trade from $150 to $200. Here's the impact:

Current: $150 per trade (1.5% of $10K portfolio)
New: $200 per trade (2% of $10K portfolio)

This means:
• Larger position sizes → bigger potential profits AND losses
• Still within safe limits (max is 5% per trade)
• Daily loss kill switch remains at 7% ($700)

Change applied successfully. Your next trades will use $200 risk sizing. I'll monitor closely to ensure it stays within your comfort zone.`
  },

  // Strategy Explanations
  strategyExplanation: {
    scenario: "User asks how a strategy works",
    structure: `1. Name and one-sentence description
2. Entry conditions (when it buys)
3. Exit conditions (when it sells)
4. Key parameters
5. When it works best`,
    example: `VWAP Pullback Strategy - catches bounces off the volume-weighted average price.

Entry Conditions:
• Price pulls back to VWAP (within 2% threshold)
• Volume is 1.5x higher than average
• Bullish trend confirmed

Exit Conditions:
• Price reaches target (typically 3-5% gain)
• Or trailing stop loss triggers
• Or max holding period reached (24 bars)

Key Parameters:
• VWAP Timeframe: 60 minutes
• Pullback Threshold: 2%
• Volume Multiplier: 1.5x

Works Best:
• In trending markets with clear support at VWAP
• During high-volume sessions
• When price respects technical levels

Think of it like buying when the market "dips" to its average price, then selling when it bounces back up.`
  },

  // Reassurance
  reassurance: {
    scenario: "User is worried about safety or risk",
    structure: `1. Validate their concern (it's reasonable to worry)
2. Explain the safety features protecting them
3. Provide specific numbers/thresholds
4. Reassure with evidence or track record
5. Offer to adjust if still concerned`,
    example: `I totally understand your concern about risk - it's smart to be cautious with your capital. Let me show you how the system protects you:

Safety Features Active:
1. Position Size Limit: Max $1,500 per trade (15% of portfolio) - prevents any single trade from hurting you badly
2. Daily Loss Kill Switch: Stops all trading at 7% daily loss - your max loss per day is capped at $700
3. Stop Losses: Every trade has a 2-3% stop loss - limits damage on bad trades
4. Exposure Limit: Max 25% of portfolio at risk - you never have more than $2,500 in active positions

Your Track Record:
• Average loss per losing trade: $45 (very controlled)
• Largest single loss: $78 (well within limits)
• No kill switch triggers in 30 days

These guardrails are designed specifically to prevent catastrophic losses. If you'd like even tighter limits, I can reduce the daily loss threshold or position sizes. What would make you feel more comfortable?`
  },

  // Performance Analysis
  performanceAnalysis: {
    scenario: "User asks about performance or results",
    structure: `1. Overall performance metric (win rate, P&L)
2. Breakdown by strategy or time period
3. Highlight wins and areas for improvement
4. Comparative context (vs goals, vs last week)
5. Actionable insights`,
    example: `Your 7-day performance summary:

Overall: +$2,450 (58% win rate, 23 trades)

By Strategy:
• VWAP Pullback: +$1,240 (65% win rate) - Your strongest performer
• SMA Trend Ride: +$680 (55% win rate) - Solid but fewer opportunities
• ABCD Long: +$530 (50% win rate) - New, still calibrating

Best Day: Tuesday (+$680) - Caught 3 perfect VWAP setups
Worst Day: Friday (-$180) - Choppy market, stopped out quickly

vs Last Week: Up 35% - You're improving!
vs Monthly Goal ($5K): 49% there with 3 weeks to go - on track!

Key Insight: VWAP Pullback is your edge. Consider increasing its allocation while keeping ABCD conservative until it proves itself. Your discipline on stop losses is excellent - that's protecting you from bigger losses.`
  }
};

/**
 * Get template for a scenario
 */
export function getTemplate(scenario: keyof typeof RESPONSE_TEMPLATES): ResponseTemplate | null {
  return RESPONSE_TEMPLATES[scenario] || null;
}

/**
 * Detect which template to use based on user message and intent
 */
export function detectTemplateNeeded(userMessage: string, detectedIntent?: string): keyof typeof RESPONSE_TEMPLATES | null {
  const msg = userMessage.toLowerCase();
  
  // Error explanation template
  if (msg.match(/error|not working|broken|failed|issue|problem/i)) {
    return 'errorExplanation';
  }
  
  // Trade summary template
  if (msg.match(/trade|position|show me.*trade|last trade/i)) {
    return 'tradeSummary';
  }
  
  // Diagnostic template
  if (msg.match(/diagnostic|health check|system status|how.*doing|performance/i)) {
    return 'diagnosticReport';
  }
  
  // Configuration change template
  if (msg.match(/change|update|set|configure|adjust|modify/i)) {
    return 'configurationChange';
  }
  
  // Strategy explanation template
  if (msg.match(/how does.*strategy|explain.*strategy|what is.*strategy/i)) {
    return 'strategyExplanation';
  }
  
  // Reassurance template
  if (msg.match(/safe|risky|worried|concern|lose money|danger/i)) {
    return 'reassurance';
  }
  
  // Performance analysis template
  if (msg.match(/performance|results|how.*i.*doing|win rate|p&l|profit/i)) {
    return 'performanceAnalysis';
  }
  
  // Acknowledgement template
  if (msg.match(/^(ok|okay|got it|thanks|thank you|perfect|sounds good)/i)) {
    return 'acknowledgement';
  }
  
  return null;
}

/**
 * Build template guidance for AI prompt
 */
export function buildTemplateGuidance(userMessage: string): string {
  const templateKey = detectTemplateNeeded(userMessage);
  
  if (!templateKey) {
    return '';
  }
  
  const template = RESPONSE_TEMPLATES[templateKey];
  
  return `
--- RESPONSE TEMPLATE GUIDANCE ---

DETECTED SCENARIO: ${template.scenario}

FOLLOW THIS STRUCTURE:
${template.structure}

EXAMPLE (adapt to user's specific situation):
${template.example}

IMPORTANT: Use this template as a guide, but personalize it to the user's exact situation. Don't copy the example verbatim.

---`;
}
