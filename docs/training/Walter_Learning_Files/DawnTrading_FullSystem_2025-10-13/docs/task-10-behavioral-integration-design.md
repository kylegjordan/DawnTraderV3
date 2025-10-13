# Task 10: Behavioral Integration - Design Document

## Overview
Integrate behavioral templates (from Task 9) into Walter's runtime response system to ensure consistent, accurate, and safe communication about guardrails, strategies, and risk management.

## Architecture Design

### 1. Template Integration Strategy

**Approach**: Hybrid Model (Template-Guided AI Generation)
- Use Task 9 templates as **behavioral guidance** in the AI prompt
- Inject **real-time user context** (portfolio values, settings, strategy types)
- Let AI **adapt templates** to user's specific situation
- **Monitor and log** deviations from expected tone/safety

**Why Not Pure Template Matching?**
- User questions vary too much for exact matching
- AI can better handle context and nuance
- Templates serve as behavioral "guardrails" for the AI itself

### 2. Component Architecture

```
┌─────────────────────────────────────────────────┐
│          WalterResponseService                  │
│  (Existing: Context + Prompt + OpenAI + Memory) │
└────────────────┬────────────────────────────────┘
                 │
                 ├─ Enhanced with:
                 │
┌────────────────▼────────────────────────────────┐
│      BehavioralTemplateService (NEW)            │
│                                                  │
│  • detectIntent(userMessage)                    │
│  • fetchRealTimeContext(userId)                 │
│  • getBehavioralGuidance(intent, context)       │
│  • enhancePrompt(basePrompt, guidance)          │
│  • validateResponse(response, intent)           │
└──────────────────────────────────────────────────┘
```

### 3. Intent Detection Categories

| Intent Type | Keywords | Template Source |
|-------------|----------|-----------------|
| **Guardrail Explanation** | "why", "how does", "position limit", "stop loss", "kill switch" | Task 9: Dialogues 1-7 |
| **Strategy Explanation** | "what is", "how does X work", "VWAP", "breakout", "range trading" | Task 9: Dialogue 8 |
| **Risk Reassurance** | "worried", "scared", "safe", "protect", "risk management" | Task 9: Dialogue 9 |
| **Safety Refusal** | "disable", "turn off", "bypass", "ignore", "leverage", "margin" | Task 9: Dialogue 10 |
| **General Config** | Other trading/system questions | Standard Walter behavior |

### 4. Real-Time Context Injection

**Data to Fetch:**
```typescript
interface UserTradingContext {
  portfolioValue: number;           // From trading_settings.portfolio_value
  riskPerTrade: number;             // From trading_settings.risk_per_trade
  dailyLossKillSwitch: number;      // From trading_settings.daily_loss_kill_switch
  maxExposurePercent: number;       // From trading_settings.max_exposure_percent
  enabledStrategies: string[];      // From trading_settings.enabled_strategies
  currentExposure: number;          // From RiskManager.getPortfolioMetrics()
  openTrades: number;               // From storage.getActiveTrades()
  currentDailyLoss: number;         // From daily P/L calculation
  mode: 'live' | 'paper';           // From user.trading_mode
}
```

### 5. Prompt Enhancement Strategy

**Current Prompt Structure:**
```
System Prompt + Purpose + Memories + History + Guidelines
```

**Enhanced Prompt Structure:**
```
System Prompt + Purpose + Memories + History + 
BEHAVIORAL TEMPLATES (NEW) +
REAL-TIME CONTEXT (NEW) +
Guidelines
```

**Behavioral Templates Section (NEW):**
```markdown
BEHAVIORAL TEMPLATES (Follow these patterns for specific topics):

1. **Guardrail Explanations** (When user asks about safety limits):
   - Use analogies (seatbelt, training wheels, safety net)
   - Show exact calculations with user's numbers
   - Explain "why" behind the rule
   - Provide 2-3 actionable solutions
   - Tone: Professional + Educational + Protective
   Example: "Think of the 10% position cap as a seatbelt..."

2. **Strategy Explanations** (When user asks about trading strategies):
   - Use simple analogies (spring, rubber band, bouncing ball)
   - Explain entry conditions clearly
   - Show risk/reward in everyday terms
   - Mention when strategy works best
   Example: "Range Trading is like a bouncing ball..."

3. **Safety Refusals** (When user asks to disable safety features):
   - Firm but respectful "no"
   - Explain why it's dangerous (capital protection)
   - Redirect to Paper mode for experimentation
   - Offer parameter tuning as alternative
   - NEVER suggest workarounds or bypass methods

REAL-TIME USER CONTEXT:
- Portfolio Value: ${portfolioValue}
- Risk Per Trade: ${riskPerTrade}
- Daily Loss Limit: ${dailyLossKillSwitch}%
- Current Exposure: ${currentExposure} (${exposurePercent}%)
- Open Trades: ${openTrades}
- Enabled Strategies: ${enabledStrategies.join(', ')}
- Mode: ${mode}

Use these numbers in your explanations to personalize responses.
```

### 6. Response Validation

**Post-Generation Checks:**
```typescript
interface ValidationResult {
  passed: boolean;
  issues: string[];
  tone: 'professional' | 'condescending' | 'alarming' | 'unclear';
  safetyCompliant: boolean;
  hasUnsafeSuggestions: boolean;
}
```

**Validation Rules:**
1. **Safety Check**: No mentions of "disable", "bypass", "turn off" safety features
2. **Tone Check**: Must use analogies, plain language, no jargon
3. **Accuracy Check**: Numbers must match user's actual settings
4. **Completeness Check**: Must provide actionable solutions, not just "no"

### 7. Testing & Logging System

**Test Harness:**
```typescript
interface BehavioralTest {
  userMessage: string;
  expectedIntent: IntentType;
  expectedTone: string;
  mustInclude: string[];      // Keywords that MUST appear
  mustNotInclude: string[];   // Keywords that MUST NOT appear
  contextRequirements: string[]; // Real-time data that should be used
}
```

**Logging Format:**
```json
{
  "timestamp": "2025-10-12T14:30:00Z",
  "userId": "user-123",
  "userMessage": "Why can't I buy more BTC?",
  "detectedIntent": "guardrail_explanation",
  "walterResponse": "...",
  "validation": {
    "passed": true,
    "tone": "professional",
    "safetyCompliant": true,
    "usedContext": ["portfolioValue", "riskPerTrade"],
    "issues": []
  },
  "templateMatch": 85.2  // Similarity % to expected template
}
```

### 8. Implementation Plan

**Phase 1: Template Service (Tasks 3-4)**
- Create `BehavioralTemplateService`
- Intent detection logic
- Real-time context fetcher
- Prompt enhancement logic

**Phase 2: Integration (Tasks 5-6)**
- Integrate into `WalterResponseService.buildPrompt()`
- Add guardrail-specific handlers
- Add strategy-specific handlers

**Phase 3: Testing (Tasks 7-9)**
- Create test harness with 20+ scenarios
- Execute live response tests
- Capture and log deviations
- Generate behavioral-tests.log

**Phase 4: Reporting (Task 10)**
- Analyze test results
- Calculate accuracy percentages
- Document tone compliance
- Generate task-10-behavioral-integration-report.md

## Success Metrics

| Metric | Target |
|--------|--------|
| **Accuracy** | 95%+ responses match expected template patterns |
| **Tone Compliance** | 100% professional + approachable + protective |
| **Safety Adherence** | 100% no unsafe suggestions or bypasses |
| **Context Usage** | 90%+ responses use user's actual data |

## Next Steps
1. Implement BehavioralTemplateService
2. Integrate into prompt builder
3. Create comprehensive test suite
4. Execute and log test results
5. Generate final report
