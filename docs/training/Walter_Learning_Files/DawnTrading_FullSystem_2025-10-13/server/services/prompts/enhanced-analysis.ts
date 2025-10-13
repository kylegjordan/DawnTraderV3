interface AnalysisContext {
  symbol: string;
  currentPrice: number;
  volume24h: number;
  change24h: number;
  performanceSummary7Day?: {
    totalTrades: number;
    winRate: number;
    avgPL: number;
    predictionAccuracy?: number;
  };
  signalWeights?: Record<string, number>;
  enrichedFeatures?: {
    momentumIndex: number;
    rsi: number;
    volatilityScore: number;
    liquidityScore: number;
  };
}

export interface StructuredPrediction {
  signal_type: string;
  confidence: number;
  predicted_direction: 'long' | 'short' | 'neutral';
  rationale: string;
  risk_score: number;
  entry_zone?: { min: number; max: number };
  stop_loss?: number;
  target?: number | number[];
  time_horizon?: string;
}

export function buildEnhancedAnalysisPrompt(context: AnalysisContext): string {
  const performanceSection = context.performanceSummary7Day ? `
Recent 7-Day Performance Context:
- Total Trades: ${context.performanceSummary7Day.totalTrades}
- Win Rate: ${context.performanceSummary7Day.winRate.toFixed(1)}%
- Average P/L: $${context.performanceSummary7Day.avgPL.toFixed(2)}
- Prediction Accuracy: ${context.performanceSummary7Day.predictionAccuracy?.toFixed(1) || 'N/A'}%
` : '';

  const weightsSection = context.signalWeights ? `
Signal Weights (Adaptive Learning):
${Object.entries(context.signalWeights).map(([signal, weight]) => 
  `  - ${signal}: ${weight.toFixed(2)}x`
).join('\n')}
` : '';

  const featuresSection = context.enrichedFeatures ? `
Enriched Market Features:
- Momentum Index: ${context.enrichedFeatures.momentumIndex.toFixed(4)}
- RSI: ${context.enrichedFeatures.rsi.toFixed(2)}
- Volatility Score: ${context.enrichedFeatures.volatilityScore.toFixed(4)}
- Liquidity Score: ${context.enrichedFeatures.liquidityScore.toFixed(4)}
` : '';

  return `You are an advanced cryptocurrency trading analyst with adaptive learning capabilities.

Current Market Data for ${context.symbol}:
- Price: $${context.currentPrice}
- 24h Change: ${context.change24h.toFixed(2)}%
- 24h Volume: $${context.volume24h?.toLocaleString() || 'N/A'}

${performanceSection}${weightsSection}${featuresSection}

IMPORTANT: Your response must follow a confidence-based probabilistic reasoning approach.

Response Requirements:
1. Provide a structured prediction with the following fields:
   - signal_type: The type of signal (e.g., "momentum_long", "mean_reversion", "breakout", "no_trade")
   - confidence: A decimal between 0 and 1 representing your confidence (0.0 = no confidence, 1.0 = highest confidence)
   - predicted_direction: "long", "short", or "neutral"
   - rationale: A clear, concise explanation for this prediction (2-3 sentences)
   - risk_score: A decimal between 0 and 1 representing risk (0.0 = lowest risk, 1.0 = highest risk)
   - entry_zone (optional): {"min": number, "max": number} for optimal entry
   - stop_loss (optional): Recommended stop loss price
   - target (optional): Price target(s)
   - time_horizon (optional): "hours", "days", or "weeks"

2. Focus on probabilistic reasoning:
   - Consider the confidence level based on signal strength, market conditions, and historical accuracy
   - Factor in the adaptive signal weights when available
   - Use enriched features (momentum, RSI, volatility) to inform your confidence level
   - Lower confidence when market conditions are uncertain or data is limited

3. Risk assessment should consider:
   - Volatility score (higher = higher risk)
   - Liquidity score (lower = higher risk)
   - Historical prediction accuracy for this signal type
   - Market structure and trend strength

4. Be conservative:
   - It's better to recommend "no_trade" with low confidence than force a prediction
   - Confidence < 0.5 should generally result in no_trade recommendations
   - Risk scores > 0.7 should trigger extra caution

Return your response as a JSON object matching the StructuredPrediction interface.`;
}

export function buildEnhancedOpportunitiesPrompt(
  pairData: any[],
  maxOpportunities: number,
  avgPredictionAccuracy?: number,
  signalWeights?: Record<string, number>
): string {
  const accuracySection = avgPredictionAccuracy ? `
Current Model Performance:
- Average Prediction Accuracy: ${avgPredictionAccuracy.toFixed(1)}%
- Calibrate your confidence levels based on this baseline accuracy
` : '';

  const weightsSection = signalWeights ? `
Active Signal Weights (Based on Historical Performance):
${Object.entries(signalWeights).map(([signal, weight]) => 
  `  - ${signal}: ${weight.toFixed(2)}x (${weight > 1.2 ? 'strong performer' : weight < 0.8 ? 'weak performer' : 'baseline'})`
).join('\n')}
` : '';

  return `You are a cryptocurrency trading analyst with adaptive learning and probabilistic reasoning.

${accuracySection}${weightsSection}

Analyze the provided market data and identify high-quality trading opportunities.

CRITICAL REQUIREMENTS:
1. Each opportunity MUST include:
   - signal_type: The specific signal that triggered this opportunity
   - confidence: Decimal 0-1 (your confidence in this prediction)
   - predicted_direction: "long", "short", or "neutral"
   - rationale: Clear, concise reasoning (2-3 sentences max)
   - risk_score: Decimal 0-1 (0 = low risk, 1 = high risk)
   
2. Use probabilistic reasoning:
   - Confidence should reflect signal strength, market conditions, and historical accuracy
   - Consider signal weights when evaluating opportunity quality
   - Lower confidence for uncertain setups (< 0.6 = skip)
   - Higher confidence for clear, high-probability setups (> 0.75)

3. Risk management:
   - Higher volatility = higher risk_score
   - Lower liquidity = higher risk_score
   - Risk scores > 0.7 should have compelling rationale
   - Include eligibilityFlags for any concerns

4. Quality over quantity:
   - Only include opportunities with confidence > 0.6
   - Maximum ${maxOpportunities} opportunities
   - Prioritize best risk/reward setups

Return ONLY a JSON array of opportunities with these required fields:
- symbol, type, signal_type, confidence, predicted_direction, rationale, risk_score
- entryZone, stopFloor, targetCeiling, timeHorizon, riskAmountRule
- probabilityScore (0-100), riskRewardRating, eligibilityFlags, notes`;
}
