# Walter AI Response - Prompt Template

## Phase 5.6 - Prompt Structure & Memory Extraction Heuristics

---

## Core Prompt Template

```
You are Walter, an AI SysAdmin Co-Pilot for a cryptocurrency day trading platform (Kraken exchange).

Your role is to:
- Help users configure and optimize their trading system
- Provide strategic insights based on market conditions and trading performance
- Answer questions about system settings, risk management, and trading strategies
- Make recommendations that align with the user's defined purpose and past learnings

---

WALTER'S DEFINED PURPOSE:
{purpose_text || "I assist with system configuration and provide strategic trading insights."}

---

RELEVANT MEMORIES (Key Learnings from Past):
{if memories.length > 0:}
{memories.map(m => `• [Importance ${m.importance}/5] ${m.content} (${formatDate(m.createdAt)})`).join('\n')}
{else:}
No specific memories retrieved for this conversation.
{end if}

---

CONVERSATION CONTEXT:
{if chat_summary exists:}
Previous conversation summary: {chat_summary}
{else:}
This is a new conversation.
{end if}

---

RECENT CHAT HISTORY:
{chat_history.map(msg => `${msg.role === 'user' ? 'User' : 'Walter'}: ${msg.content}`).join('\n')}

---

USER'S LATEST MESSAGE:
{user_message}

---

RESPONSE GUIDELINES:
1. Answer clearly and concisely in everyday language (avoid technical jargon)
2. Reference your purpose when making recommendations
3. Use your memories to provide context-aware insights
4. If asked about trading strategies, refer to: VWAP Pullback, ABCD Long, SMA Trend Ride
5. If the question is off-topic (not related to trading/system), politely redirect:
   "I'm focused on helping with trading system configuration and strategy. Could you rephrase your question related to those topics?"
6. If you don't have enough information, ask clarifying questions
7. Keep responses under 200 words for readability

Now respond to the user's message:
```

---

## Memory Extraction Heuristics

### When to Extract Memories from AI Responses

**Automatic Memory Creation Criteria:**

1. **Strategic Insights** (Importance: 5)
   - Response contains trading strategy recommendations
   - Keywords: "strategy", "approach", "recommend", "should consider"
   - Example: "Based on your risk tolerance, I recommend limiting position sizes to 2% per trade"

2. **System Configuration Decisions** (Importance: 4)
   - Response guides user on settings/parameter changes
   - Keywords: "set", "configure", "adjust", "change to"
   - Example: "To reduce risk, set your max open trades to 3 and daily loss limit to 5%"

3. **Performance Lessons** (Importance: 5)
   - Response references past trading outcomes or learnings
   - Keywords: "learned", "previous", "last time", "pattern shows"
   - Example: "Your trades perform better when you wait for 2% pullbacks instead of 1%"

4. **User Preferences** (Importance: 4)
   - User explicitly states preferences or goals
   - User message keywords: "I want", "I prefer", "my goal is"
   - Example: User says "I want to focus on fewer, higher quality trades"

5. **Risk Management Decisions** (Importance: 5)
   - Response about risk limits, stop losses, position sizing
   - Keywords: "risk", "loss limit", "stop loss", "position size"
   - Example: "Setting a 3% daily loss limit will protect your capital during volatile periods"

6. **Explicit Memory Requests** (Importance: 5)
   - User asks Walter to remember something
   - User message keywords: "remember", "note that", "keep in mind"
   - Example: User says "Remember, I don't trade on Mondays"

### Memory Extraction Logic (Pseudocode)

```typescript
function shouldCreateMemory(userMessage: string, assistantResponse: string): boolean {
  // Check for explicit memory requests
  if (userMessage.match(/(remember|note that|keep in mind|don't forget)/i)) {
    return true;
  }

  // Check for strategic content in response
  const strategyKeywords = ['strategy', 'recommend', 'should consider', 'approach'];
  const configKeywords = ['set', 'configure', 'adjust', 'change to'];
  const riskKeywords = ['risk', 'loss limit', 'stop loss', 'position size'];
  const learningKeywords = ['learned', 'pattern', 'performance shows'];

  const responseHasKeywords = (keywords: string[]) => 
    keywords.some(kw => assistantResponse.toLowerCase().includes(kw));

  if (
    responseHasKeywords(strategyKeywords) ||
    responseHasKeywords(configKeywords) ||
    responseHasKeywords(riskKeywords) ||
    responseHasKeywords(learningKeywords)
  ) {
    return true;
  }

  // Check for user preference statements
  if (userMessage.match(/(i want|i prefer|my goal is|i like to)/i)) {
    return true;
  }

  return false;
}

function extractMemoryContent(userMessage: string, assistantResponse: string): string {
  // If explicit request, use user's message
  if (userMessage.match(/(remember|note that)/i)) {
    return userMessage.replace(/(remember|note that)[,:]?\s*/i, '').trim();
  }

  // Otherwise, extract key sentence from assistant response
  // Look for sentences with strategic keywords
  const sentences = assistantResponse.split(/[.!?]+/).map(s => s.trim());
  
  for (const sentence of sentences) {
    if (
      sentence.match(/(recommend|should|set.*to|adjust.*to|learned|pattern)/i) &&
      sentence.length > 20 && 
      sentence.length < 150
    ) {
      return sentence;
    }
  }

  // Fallback: use first meaningful sentence
  return sentences.find(s => s.length > 20 && s.length < 150) || assistantResponse.substring(0, 150);
}

function determineMemoryImportance(
  userMessage: string, 
  assistantResponse: string,
  memoryContent: string
): number {
  // Explicit user request = highest importance
  if (userMessage.match(/(remember|note that)/i)) return 5;
  
  // Risk management decisions = highest
  if (memoryContent.match(/risk|loss limit|stop loss|position size/i)) return 5;
  
  // Strategy recommendations = highest
  if (memoryContent.match(/strategy|recommend.*trade|approach.*market/i)) return 5;
  
  // System configuration = high
  if (memoryContent.match(/set|configure|adjust.*to/i)) return 4;
  
  // Performance insights = high
  if (memoryContent.match(/learned|pattern|performance/i)) return 4;
  
  // User preferences = medium-high
  if (userMessage.match(/i want|i prefer/i)) return 4;
  
  // Default for other qualifying content
  return 3;
}
```

### Memory Type Classification

```typescript
function determineMemoryType(content: string): MemoryType {
  if (content.match(/learned|pattern|performance|shows that/i)) {
    return 'lesson';
  }
  
  if (content.match(/recommend|should.*consider|strategy|approach/i)) {
    return 'decision';
  }
  
  if (content.match(/i want|i prefer|my goal|i like to/i)) {
    return 'goal';
  }
  
  if (content.match(/insight|analysis|indicates|suggests/i)) {
    return 'insight';
  }
  
  // Default
  return 'observation';
}
```

---

## Example Prompt (With Real Data)

### Scenario: User asking about strategy with purpose and memories set

**Context:**
- User's Purpose: "Focus on high-probability setups with strict risk management. Prioritize capital preservation over aggressive gains."
- Memories Available:
  1. "User prefers trading only BTC/USD and ETH/USD pairs" (Importance: 4, 2 days ago)
  2. "Set daily loss limit to 3% based on user's risk tolerance" (Importance: 5, 1 day ago)
  3. "VWAP Pullback strategy works best when waiting for 2% pullback" (Importance: 5, 3 days ago)
- Chat History:
  - User: "What's my current setup?"
  - Walter: "Your system is configured for VWAP Pullback and ABCD Long strategies on BTC/USD and ETH/USD."
- User's New Message: "Should I increase my position sizes?"

**Generated Prompt:**

```
You are Walter, an AI SysAdmin Co-Pilot for a cryptocurrency day trading platform (Kraken exchange).

Your role is to:
- Help users configure and optimize their trading system
- Provide strategic insights based on market conditions and trading performance
- Answer questions about system settings, risk management, and trading strategies
- Make recommendations that align with the user's defined purpose and past learnings

---

WALTER'S DEFINED PURPOSE:
Focus on high-probability setups with strict risk management. Prioritize capital preservation over aggressive gains.

---

RELEVANT MEMORIES (Key Learnings from Past):
• [Importance 5/5] VWAP Pullback strategy works best when waiting for 2% pullback (3 days ago)
• [Importance 5/5] Set daily loss limit to 3% based on user's risk tolerance (1 day ago)
• [Importance 4/5] User prefers trading only BTC/USD and ETH/USD pairs (2 days ago)

---

CONVERSATION CONTEXT:
This is a new conversation.

---

RECENT CHAT HISTORY:
User: What's my current setup?
Walter: Your system is configured for VWAP Pullback and ABCD Long strategies on BTC/USD and ETH/USD.
User: Should I increase my position sizes?

---

USER'S LATEST MESSAGE:
Should I increase my position sizes?

---

RESPONSE GUIDELINES:
1. Answer clearly and concisely in everyday language (avoid technical jargon)
2. Reference your purpose when making recommendations
3. Use your memories to provide context-aware insights
4. If asked about trading strategies, refer to: VWAP Pullback, ABCD Long, SMA Trend Ride
5. If the question is off-topic (not related to trading/system), politely redirect:
   "I'm focused on helping with trading system configuration and strategy. Could you rephrase your question related to those topics?"
6. If you don't have enough information, ask clarifying questions
7. Keep responses under 200 words for readability

Now respond to the user's message:
```

**Expected AI Response:**
> "Given your purpose of capital preservation and strict risk management, I'd recommend being cautious about increasing position sizes. Your current setup has a 3% daily loss limit, which suggests a conservative risk tolerance. Instead of increasing position sizes, consider:
>
> 1. **Maintain current sizing** until you see consistent profitability
> 2. **Wait for higher-quality setups** - remember, your VWAP strategy works best with 2% pullbacks
> 3. **Track performance first** - ensure your win rate justifies larger positions
>
> If you do want to scale up, increase gradually (e.g., 10-20% at a time) and only after 2+ weeks of profitable trading. Your focus on capital preservation means growing slowly is safer than risking larger losses.
>
> Would you like to review your recent trade performance to help make this decision?"

**Memory Extraction from Response:**
- Should Create Memory: **Yes** (contains risk management + strategy advice)
- Memory Content: "Maintain conservative position sizing until consistent profitability is achieved; increase gradually (10-20%) only after 2+ weeks of profitable trading"
- Memory Type: **decision**
- Importance: **5** (risk management decision)

---

## Integration with Summarization Triggers

### When Chat Reaches 50 Messages

1. **Auto-Summarization** (if enabled in settings)
   - Trigger: `chat_messages.count >= 50`
   - Action: Call `WalterChatLifecycleService.summarizeChatSession(chatId)`
   - Result: Create summary message (role: "summary")

2. **Memory Extraction from Summary**
   - After summary created, extract up to 5 memories
   - Use same heuristics as response extraction
   - Store with `chatId` reference for context

3. **Message Cleanup** (optional)
   - Keep summary + last 10 messages for context
   - Archive older messages (soft delete or separate table)

### Settings Integration

- **walterMemoryDepth**: Controls how many messages to include in prompt (default: 20)
- **walterMemoryLimit**: Max memories to store (default: 200)
- **walterAutoSummarize**: Enable/disable auto-summarization (default: true)

When `walterMemoryDepth` is low (e.g., 10), rely more on summary for context.
When high (e.g., 50), include full history for richer context.

---

## Validation Checklist

- [ ] Prompt template includes all 4 context parts (Purpose, Memories, Summary, User Message)
- [ ] Memory extraction logic has clear keyword-based heuristics
- [ ] Importance scoring follows defined rules (1-5 scale)
- [ ] Memory type classification covers all 5 types (observation, decision, lesson, goal, insight)
- [ ] Example prompt uses realistic trading scenario
- [ ] Expected response demonstrates context-aware behavior
- [ ] Memory extraction from response follows documented logic
- [ ] Summarization integration defined for 50-message threshold

---

## Implementation Notes

1. **Prompt Builder Function**
   ```typescript
   function buildWalterPrompt(
     purpose: string | null,
     memories: WalterMemory[],
     chatHistory: ChatMessage[],
     chatSummary: string | null,
     userMessage: string
   ): string { /* template above */ }
   ```

2. **Memory Extraction Function**
   ```typescript
   async function extractMemoryFromResponse(
     userId: string,
     chatId: string,
     userMessage: string,
     assistantResponse: string
   ): Promise<WalterMemory | null> { /* heuristics above */ }
   ```

3. **OpenAI Call**
   ```typescript
   const completion = await openai.chat.completions.create({
     model: 'gpt-4o',
     messages: [
       { role: 'system', content: systemPrompt },
       { role: 'user', content: userMessage }
     ],
     temperature: 0.7,
     max_tokens: 500
   });
   ```

---

**Next Steps:**
- ✅ Prompt template defined
- ⏳ Implement WalterResponseService with prompt builder
- ⏳ Integrate memory extraction logic
- ⏳ Test with sample conversations
